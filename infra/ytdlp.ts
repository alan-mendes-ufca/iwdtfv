import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import config from "infra/config";
import {
  LoginRequiredError,
  ServicesError,
  UnsupportedPlatformError,
  ValidationError,
  VideoUnavailableError,
  YtDlpFailedError,
} from "infra/errors";
import type { RawYtDlpVideo } from "models/format";

const MAX_STDOUT_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const KILL_GRACE_MS = 3000;

export type Selection = { type: "audio" } | { type: "video"; formatId: string };

type RunOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
  binary?: string;
};

type RunResult = {
  stdout: string;
  stderr: string;
};

type BaseOptions = {
  cookiesPath?: string | null;
  signal?: AbortSignal;
};

// Único ponto que executa o binário: sempre spawn(bin, args[]), nunca shell.
function run(args: string[], { timeoutMs, signal, binary }: RunOptions) {
  return new Promise<RunResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const child = spawn(binary || config.get().ytdlpBinary, args, {
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let failure: Error | null = null;
    let killTimer: NodeJS.Timeout | null = null;

    const timeoutTimer = setTimeout(() => {
      stop(
        new YtDlpFailedError({
          message: "O yt-dlp demorou demais para responder.",
          action: "Tente novamente ou escolha uma qualidade menor.",
          statusCode: 504,
        }),
      );
    }, timeoutMs);

    const onAbort = () => stop(abortError());
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        stop(
          new YtDlpFailedError({
            message: "A resposta do yt-dlp passou do tamanho esperado.",
          }),
        );
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_BYTES);
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      finish();
      if (error.code === "ENOENT") {
        reject(
          new ServicesError({
            message: "O yt-dlp não foi encontrado no servidor.",
            action: "Instale o yt-dlp ou ajuste YTDLP_BINARY.",
            cause: error,
          }),
        );
        return;
      }
      reject(new YtDlpFailedError({ cause: error }));
    });

    child.on("close", (code) => {
      finish();
      if (failure) {
        reject(failure);
        return;
      }
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      if (code !== 0) {
        reject(errorFromStderr(stderr));
        return;
      }
      resolve({ stdout, stderr });
    });

    function stop(error: Error) {
      if (failure) return;
      failure = error;
      killGroup("SIGTERM");
      killTimer = setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS);
    }

    // detached cria um grupo de processos; matar o grupo derruba também o ffmpeg.
    function killGroup(killSignal: NodeJS.Signals) {
      if (child.pid === undefined || child.exitCode !== null) return;
      try {
        process.kill(-child.pid, killSignal);
      } catch {
        child.kill(killSignal);
      }
    }

    function finish() {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    }
  });
}

function abortError() {
  return new YtDlpFailedError({
    message: "A operação foi cancelada.",
    action: "Inicie o download novamente.",
    statusCode: 499,
  });
}

function errorFromStderr(stderr: string): Error {
  const lastError =
    stderr
      .split("\n")
      .filter((line) => line.startsWith("ERROR:"))
      .pop() || stderr.trim();

  if (/Unsupported URL/i.test(lastError)) {
    return new UnsupportedPlatformError({ cause: lastError });
  }

  if (
    /private video|video is private|video unavailable|video is unavailable|has been removed|no longer available|not available in your country|does not exist|HTTP Error 404/i.test(
      lastError,
    )
  ) {
    return new VideoUnavailableError({ cause: lastError });
  }

  if (
    /sign in to confirm|log ?in required|login required|log in for access|requires authentication|account credentials|--cookies/i.test(
      lastError,
    )
  ) {
    return new LoginRequiredError({ cause: lastError });
  }

  return new YtDlpFailedError({ cause: lastError });
}

function baseArgs(cookiesPath?: string | null) {
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--no-cache-dir",
    "--no-progress",
    "--no-color",
  ];
  if (cookiesPath) args.push("--cookies", cookiesPath);

  // O YouTube exige um runtime JS; no Docker usamos o próprio Node.
  const { jsRuntimes } = config.get();
  if (jsRuntimes && /^[A-Za-z0-9_.,:/-]+$/.test(jsRuntimes)) {
    args.push("--js-runtimes", jsRuntimes);
  }
  return args;
}

// Versões para /api/v1/status; null quando o binário não responde.
async function versions() {
  const [ytdlpVersion, ffmpegVersion] = await Promise.all([
    readVersion(["--version"]),
    readVersion(["-version"], "ffmpeg"),
  ]);

  return {
    ytdlp: ytdlpVersion,
    ffmpeg: ffmpegVersion?.match(/ffmpeg version (\S+)/)?.[1] ?? ffmpegVersion,
  };

  async function readVersion(args: string[], binary?: string) {
    try {
      const { stdout } = await run(args, { timeoutMs: 10_000, binary });
      return stdout.trim().split("\n")[0] || null;
    } catch {
      return null;
    }
  }
}

async function inspect(url: string, options: BaseOptions = {}) {
  const args = [...baseArgs(options.cookiesPath), "-J", "--", url];
  const { stdout } = await run(args, {
    timeoutMs: config.get().inspectTimeoutMs,
    signal: options.signal,
  });

  try {
    return JSON.parse(stdout) as RawYtDlpVideo;
  } catch (error) {
    throw new YtDlpFailedError({
      message: "O yt-dlp devolveu uma resposta inválida.",
      cause: error,
    });
  }
}

export type DownloadedFile = {
  filePath: string;
  title: string;
  ext: string;
  size: number;
};

async function download(
  url: string,
  selection: Selection,
  options: BaseOptions & { directory: string },
): Promise<DownloadedFile> {
  const { maxDurationSeconds, maxFilesizeBytes, downloadTimeoutMs } =
    config.get();

  const args = [
    ...baseArgs(options.cookiesPath),
    "--no-mtime",
    "--match-filter",
    `!is_live & duration <=? ${maxDurationSeconds}`,
    "--max-filesize",
    String(maxFilesizeBytes),
    "-P",
    options.directory,
    "-o",
    "video.%(ext)s",
    ...selectionArgs(selection),
    "--no-simulate",
    "--print",
    "after_move:%(.{title,filepath,ext})j",
    "--",
    url,
  ];

  const { stdout } = await run(args, {
    timeoutMs: downloadTimeoutMs,
    signal: options.signal,
  });

  const printed = parsePrinted(stdout);
  if (!printed) {
    // Com --match-filter e --max-filesize o yt-dlp pula o vídeo e sai com 0.
    throw new ValidationError({
      message: "O vídeo passa do limite de duração ou de tamanho do servidor.",
      action: "Escolha uma qualidade menor ou um vídeo mais curto.",
    });
  }

  const directory = path.resolve(options.directory);
  const filePath = path.resolve(printed.filepath);
  if (path.dirname(filePath) !== directory) {
    throw new YtDlpFailedError({
      message: "O yt-dlp gravou o arquivo fora do diretório esperado.",
    });
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new YtDlpFailedError({
      message: "O yt-dlp terminou sem gerar o arquivo.",
    });
  }

  return {
    filePath,
    title: printed.title || "video",
    ext: printed.ext || path.extname(filePath).slice(1),
    size: stat.size,
  };
}

function selectionArgs(selection: Selection) {
  if (selection.type === "audio") {
    return [
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
    ];
  }

  const id = selection.formatId;
  return [
    "-f",
    `${id}+bestaudio[ext=m4a]/${id}+bestaudio/${id}`,
    "--merge-output-format",
    "mp4",
  ];
}

function parsePrinted(stdout: string) {
  const lastLine = stdout.trim().split("\n").pop();
  if (!lastLine) return null;
  try {
    const value = JSON.parse(lastLine) as {
      title?: string;
      filepath?: string;
      ext?: string;
    };
    return value.filepath ? { ...value, filepath: value.filepath } : null;
  } catch {
    return null;
  }
}

const ytdlp = {
  versions,
  inspect,
  download,
};

export default ytdlp;
