import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ytdlp from "infra/ytdlp";

const FAKE_BINARY = path.resolve("tests/fakes/yt-dlp.ts");

// TS: "let x: T;" declara o tipo de uma variável sem valor inicial; ela é preenchida no beforeEach.
let workDir: string;
let argsFile: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "iwdtfv-ytdlp-test-"));
  argsFile = path.join(workDir, "args.jsonl");
  process.env.YTDLP_BINARY = FAKE_BINARY;
  process.env.FAKE_YTDLP_ARGS_FILE = argsFile;
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
  delete process.env.FAKE_YTDLP_ARGS_FILE;
  delete process.env.INSPECT_TIMEOUT_MS;
});

// TS: ": string[]" é o tipo de retorno (array de strings); JSON.parse devolve any, aceito sem checagem.
function lastArgs(): string[] {
  const lines = fs.readFileSync(argsFile, "utf8").trim().split("\n");
  // TS: at(-1) pode devolver undefined; o "!" afirma que existe, sem checagem em tempo de execução.
  return JSON.parse(lines.at(-1)!);
}

describe("ytdlp.inspect", () => {
  test("With a valid URL returns the parsed JSON", async () => {
    const raw = await ytdlp.inspect("https://www.youtube.com/watch?v=abc");

    expect(raw.title).toBe(
      "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
    );
    expect(raw.formats?.length).toBeGreaterThan(10);
  });

  test("Passes safe fixed arguments and the URL after '--'", async () => {
    const url = "https://www.youtube.com/watch?v=abc";
    await ytdlp.inspect(url, { cookiesPath: "/tmp/cookies.txt" });

    const args = lastArgs();
    expect(args).toEqual([
      "--ignore-config",
      "--no-playlist",
      "--no-cache-dir",
      "--no-progress",
      "--no-color",
      "--cookies",
      "/tmp/cookies.txt",
      "-J",
      "--",
      url,
    ]);
  });

  // TS: cada linha de test.each é uma tupla (url, name, statusCode); o TS infere o tipo de cada posição.
  test.each([
    ["https://youtu.be/private", "VideoUnavailableError", 404],
    ["https://youtu.be/unavailable", "VideoUnavailableError", 404],
    ["https://www.instagram.com/p/login/", "LoginRequiredError", 403],
    ["https://youtu.be/bot", "LoginRequiredError", 403],
    ["https://www.youtube.com/unsupported", "UnsupportedPlatformError", 422],
    ["https://youtu.be/fail", "YtDlpFailedError", 502],
  ])("With %s rejects with %s", async (url, name, statusCode) => {
    await expect(ytdlp.inspect(url)).rejects.toMatchObject({
      name,
      statusCode,
    });
  });

  test("With a slow process rejects with timeout and kills it", async () => {
    process.env.INSPECT_TIMEOUT_MS = "300";
    const startedAt = Date.now();

    await expect(ytdlp.inspect("https://youtu.be/sleep")).rejects.toMatchObject(
      { name: "YtDlpFailedError", statusCode: 504 },
    );
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });

  test("With an aborted signal rejects and kills the process", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);

    await expect(
      ytdlp.inspect("https://youtu.be/sleep", { signal: controller.signal }),
    ).rejects.toMatchObject({ statusCode: 499 });
  });

  test("With a missing binary rejects with ServicesError", async () => {
    process.env.YTDLP_BINARY = path.join(workDir, "does-not-exist");

    await expect(ytdlp.inspect("https://youtu.be/abc")).rejects.toMatchObject({
      name: "ServiceError",
      statusCode: 503,
    });
  });
});

describe("ytdlp.download", () => {
  test("With a video format merges into mp4 inside the directory", async () => {
    const file = await ytdlp.download(
      "https://youtu.be/abc",
      { type: "video", formatId: "137" },
      { directory: workDir },
    );

    expect(file.filePath).toBe(path.join(workDir, "video.mp4"));
    expect(file.ext).toBe("mp4");
    expect(file.size).toBe(256 * 1024);

    const args = lastArgs();
    expect(args).toEqual(
      expect.arrayContaining([
        "-f",
        "137+bestaudio[ext=m4a]/137+bestaudio/137",
        "--merge-output-format",
        "mp4",
        "-P",
        workDir,
        "--max-filesize",
      ]),
    );
    expect(args.slice(-2)).toEqual(["--", "https://youtu.be/abc"]);
  });

  test("With audio selection extracts mp3", async () => {
    const file = await ytdlp.download(
      "https://youtu.be/abc",
      { type: "audio" },
      { directory: workDir },
    );

    expect(file.ext).toBe("mp3");
    expect(lastArgs()).toEqual(
      expect.arrayContaining(["-x", "--audio-format", "mp3"]),
    );
  });

  test("With a file skipped by the size limit rejects with ValidationError", async () => {
    await expect(
      ytdlp.download(
        "https://youtu.be/toolarge",
        { type: "audio" },
        { directory: workDir },
      ),
    ).rejects.toMatchObject({ name: "ValidationError", statusCode: 400 });
  });

  test("With a file written outside the directory rejects", async () => {
    const directory = path.join(workDir, "job");
    fs.mkdirSync(directory);

    await expect(
      ytdlp.download(
        "https://youtu.be/escape",
        { type: "audio" },
        { directory },
      ),
    ).rejects.toMatchObject({ name: "YtDlpFailedError" });
  });
});
