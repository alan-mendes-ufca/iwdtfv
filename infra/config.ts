import os from "node:os";
import path from "node:path";

// Lido a cada chamada, para que testes possam trocar variáveis de ambiente.
function readInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function get() {
  return {
    ytdlpBinary: process.env.YTDLP_BINARY || "yt-dlp",
    cookiesFile: process.env.YTDLP_COOKIES_FILE || null,
    tempDir: process.env.TEMP_DIR || path.join(os.tmpdir(), "iwdtfv"),
    maxDurationSeconds: readInteger("MAX_DURATION_SECONDS", 7200),
    maxFilesizeBytes: readInteger("MAX_FILESIZE_BYTES", 2 * 1024 ** 3),
    inspectTimeoutMs: readInteger("INSPECT_TIMEOUT_MS", 30_000),
    downloadTimeoutMs: readInteger("DOWNLOAD_TIMEOUT_MS", 15 * 60_000),
    maxConcurrentDownloads: readInteger("MAX_CONCURRENT_DOWNLOADS", 2),
    rateLimitInspectPerMinute: readInteger("RATE_LIMIT_INSPECT_PER_MINUTE", 20),
    rateLimitDownloadPerMinute: readInteger(
      "RATE_LIMIT_DOWNLOAD_PER_MINUTE",
      5,
    ),
    trustProxy: process.env.TRUST_PROXY === "1",
  };
}

const config = {
  get,
};

export default config;
