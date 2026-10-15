import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import video from "models/video";

const FAKE_BINARY = path.resolve("tests/fakes/yt-dlp.ts");

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "iwdtfv-video-test-"));
  process.env.YTDLP_BINARY = FAKE_BINARY;
  process.env.TEMP_DIR = tempDir;
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.YTDLP_COOKIES_FILE;
  delete process.env.MAX_CONCURRENT_DOWNLOADS;
  delete process.env.FAKE_YTDLP_ARGS_FILE;
});

function jobDirs() {
  return fs.readdirSync(tempDir).filter((entry) => entry.startsWith("job-"));
}

describe("video.inspect", () => {
  test("With a YouTube link returns normalized qualities", async () => {
    const info = await video.inspect("https://www.youtube.com/watch?v=abc");

    expect(info.platform).toBe("YouTube");
    expect(info.duration_seconds).toBe(213);
    expect(info.audio_available).toBe(true);
    expect(info.formats.map((item) => item.quality)).toContain("1080p");
    expect(jobDirs()).toEqual([]);
  });

  test("With a TikTok link returns the TikTok platform", async () => {
    const info = await video.inspect("https://www.tiktok.com/@a/video/1");

    expect(info.platform).toBe("TikTok");
    expect(info.formats.map((item) => item.quality)).toEqual(["720p", "576p"]);
  });

  test("With an unsupported host does not call yt-dlp", async () => {
    await expect(video.inspect("https://vimeo.com/1")).rejects.toMatchObject({
      name: "UnsupportedPlatformError",
    });
  });

  test("With a live stream rejects", async () => {
    await expect(video.inspect("https://youtu.be/live")).rejects.toMatchObject({
      name: "ValidationError",
      message: "Transmissões ao vivo não são suportadas.",
    });
  });

  test("With a video longer than the limit rejects", async () => {
    await expect(video.inspect("https://youtu.be/long")).rejects.toMatchObject({
      name: "ValidationError",
      message: "O vídeo passa do limite de 120 minutos.",
    });
  });

  test("With a private video rejects and leaves no temp files", async () => {
    await expect(
      video.inspect("https://youtu.be/private"),
    ).rejects.toMatchObject({ name: "VideoUnavailableError" });
    expect(jobDirs()).toEqual([]);
  });

  test("With cookies configured passes a copy, never the original", async () => {
    const cookiesFile = path.join(tempDir, "cookies-original.txt");
    const argsFile = path.join(tempDir, "args.jsonl");
    fs.writeFileSync(cookiesFile, "# Netscape HTTP Cookie File\n");
    process.env.YTDLP_COOKIES_FILE = cookiesFile;
    process.env.FAKE_YTDLP_ARGS_FILE = argsFile;

    await video.inspect("https://youtu.be/abc");

    const args: string[] = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const cookiesArg = args[args.indexOf("--cookies") + 1]!;
    expect(cookiesArg).not.toBe(cookiesFile);
    expect(path.basename(cookiesArg)).toBe("cookies.txt");
    expect(fs.existsSync(cookiesArg)).toBe(false);
  });
});

describe("video.download", () => {
  test("With a quality returns the file and cleanup removes it", async () => {
    const result = await video.download("https://youtu.be/abc", "137");

    expect(result.filename).toBe(
      "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster).mp4",
    );
    expect(result.contentType).toBe("video/mp4");
    expect(result.size).toBe(256 * 1024);
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(video.getActiveDownloads()).toBe(1);

    await result.cleanup();
    await result.cleanup();

    expect(fs.existsSync(result.filePath)).toBe(false);
    expect(jobDirs()).toEqual([]);
    expect(video.getActiveDownloads()).toBe(0);
  });

  test("With audio returns an mp3", async () => {
    const result = await video.download("https://youtu.be/abc", "audio");

    expect(result.contentType).toBe("audio/mpeg");
    expect(result.filename.endsWith(".mp3")).toBe(true);
    await result.cleanup();
  });

  test("With a failing download cleans up and releases the slot", async () => {
    await expect(
      video.download("https://youtu.be/fail", "137"),
    ).rejects.toMatchObject({ name: "YtDlpFailedError" });

    expect(jobDirs()).toEqual([]);
    expect(video.getActiveDownloads()).toBe(0);
  });

  test("With an aborted download cleans up", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);

    await expect(
      video.download("https://youtu.be/sleep", "137", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ statusCode: 499 });

    expect(jobDirs()).toEqual([]);
    expect(video.getActiveDownloads()).toBe(0);
  });

  test("With too many concurrent downloads rejects with 503", async () => {
    process.env.MAX_CONCURRENT_DOWNLOADS = "1";
    const first = await video.download("https://youtu.be/abc", "137");

    await expect(
      video.download("https://youtu.be/abc", "137"),
    ).rejects.toMatchObject({ statusCode: 503 });

    await first.cleanup();
    expect(video.getActiveDownloads()).toBe(0);
  });
});

describe("video.buildFilename", () => {
  test("Removes characters that are unsafe in file names", () => {
    expect(video.buildFilename('a/b\\c:d*e?f"g<h>i|j\nk', "mp4")).toBe(
      "a b c d e f g h i j k.mp4",
    );
  });

  test("With an empty title and a strange extension", () => {
    expect(video.buildFilename("  ", "../x")).toBe("video.bin");
  });
});
