import config from "infra/config";
import { ServicesError, ValidationError } from "infra/errors";
import tempfiles from "infra/tempfiles";
import ytdlp, { type Selection } from "infra/ytdlp";
import format, { type RawYtDlpVideo, type VideoInfo } from "models/format";
import provider from "models/provider";

let activeDownloads = 0;

async function inspect(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<VideoInfo> {
  const videoProvider = provider.findByUrl(url);
  const job = await tempfiles.create();

  try {
    const cookiesPath = await job.copyCookies(config.get().cookiesFile);
    const raw = await ytdlp.inspect(url, {
      cookiesPath,
      signal: options.signal,
    });
    assertDownloadable(raw);
    return format.normalize(raw, videoProvider.label);
  } finally {
    await job.cleanup();
  }
}

function assertDownloadable(raw: RawYtDlpVideo) {
  if (raw._type === "playlist" || raw._type === "multi_video") {
    throw new ValidationError({
      message: "Playlists não são suportadas.",
      action: "Cole o link de um único vídeo.",
    });
  }

  if (raw.is_live || raw.live_status === "is_live") {
    throw new ValidationError({
      message: "Transmissões ao vivo não são suportadas.",
      action: "Espere a transmissão terminar e tente de novo.",
    });
  }

  const { maxDurationSeconds } = config.get();
  if (typeof raw.duration === "number" && raw.duration > maxDurationSeconds) {
    throw new ValidationError({
      message: `O vídeo passa do limite de ${Math.floor(maxDurationSeconds / 60)} minutos.`,
      action: "Escolha um vídeo mais curto.",
    });
  }
}

export type DownloadResult = {
  filePath: string;
  filename: string;
  contentType: string;
  size: number;
  cleanup: () => Promise<void>;
};

function parseSelection(formatId: string): Selection {
  return formatId === "audio" ? { type: "audio" } : { type: "video", formatId };
}

// Quem chama deve sempre executar cleanup() ao terminar de enviar o arquivo.
async function download(
  url: string,
  formatId: string,
  options: { signal?: AbortSignal } = {},
): Promise<DownloadResult> {
  provider.findByUrl(url);

  if (activeDownloads >= config.get().maxConcurrentDownloads) {
    throw new ServicesError({
      message: "Já há downloads demais em andamento.",
      action: "Espere um download terminar e tente de novo.",
    });
  }

  activeDownloads++;
  let released = false;
  const job = await tempfiles.create().catch((error) => {
    release();
    throw error;
  });

  const cleanup = async () => {
    release();
    await job.cleanup();
  };

  try {
    const cookiesPath = await job.copyCookies(config.get().cookiesFile);
    const file = await ytdlp.download(url, parseSelection(formatId), {
      directory: job.path,
      cookiesPath,
      signal: options.signal,
    });

    return {
      filePath: file.filePath,
      filename: buildFilename(file.title, file.ext),
      contentType: contentTypeFor(file.ext),
      size: file.size,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }

  function release() {
    if (released) return;
    released = true;
    activeDownloads--;
  }
}

function buildFilename(title: string, ext: string) {
  const safeTitle =
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .trim() || "video";
  const safeExt = /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : "bin";
  return `${safeTitle}.${safeExt}`;
}

function contentTypeFor(ext: string) {
  const types: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
  };
  return types[ext.toLowerCase()] || "application/octet-stream";
}

function getActiveDownloads() {
  return activeDownloads;
}

const video = {
  inspect,
  download,
  buildFilename,
  getActiveDownloads,
};

export default video;
