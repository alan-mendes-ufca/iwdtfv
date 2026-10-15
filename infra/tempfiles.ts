import fs from "node:fs/promises";
import path from "node:path";
import config from "infra/config";

const JOB_PREFIX = "job-";
const SWEEP_INTERVAL_MS = 10 * 60_000;

let lastSweepAt = 0;

export type TempJob = {
  path: string;
  copyCookies: (source: string | null) => Promise<string | null>;
  cleanup: () => Promise<void>;
};

async function create(): Promise<TempJob> {
  const baseDir = config.get().tempDir;
  await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
  await sweepIfDue(baseDir);

  const jobPath = await fs.mkdtemp(path.join(baseDir, JOB_PREFIX));
  let cleanupPromise: Promise<void> | null = null;

  return {
    path: jobPath,
    copyCookies,
    cleanup() {
      cleanupPromise ??= fs.rm(jobPath, { recursive: true, force: true });
      return cleanupPromise;
    },
  };

  // O yt-dlp regrava o arquivo de cookies ao sair; cada job usa uma cópia.
  async function copyCookies(source: string | null) {
    if (!source) return null;
    const destination = path.join(jobPath, "cookies.txt");
    await fs.copyFile(source, destination);
    await fs.chmod(destination, 0o600);
    return destination;
  }
}

// Remove sobras de jobs interrompidos (ex.: processo morto no meio do download).
async function sweepStale(baseDir = config.get().tempDir) {
  const maxAgeMs = config.get().downloadTimeoutMs * 2;
  const now = Date.now();
  let entries: string[];

  try {
    entries = await fs.readdir(baseDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(JOB_PREFIX)) continue;
    const entryPath = path.join(baseDir, entry);
    try {
      const stat = await fs.stat(entryPath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.rm(entryPath, { recursive: true, force: true });
      }
    } catch {
      // Já removido por outro job.
    }
  }
}

async function sweepIfDue(baseDir: string) {
  if (Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = Date.now();
  await sweepStale(baseDir);
}

const tempfiles = {
  create,
  sweepStale,
};

export default tempfiles;
