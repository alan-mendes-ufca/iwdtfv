import fs from "node:fs/promises";
import path from "node:path";
import config from "infra/config";

const JOB_PREFIX = "job-";
const SWEEP_INTERVAL_MS = 10 * 60_000;

let lastSweepAt = 0;

// TS: `export type` exporta um apelido de tipo que descreve o formato do objeto. Some no JavaScript gerado.
export type TempJob = {
  path: string;
  // TS: `string | null` é união: o valor pode ser texto ou null. `Promise<...>` é genérico: diz o tipo do valor resolvido.
  copyCookies: (source: string | null) => Promise<string | null>;
  // TS: `Promise<void>` é uma promessa que não resolve com um valor útil.
  cleanup: () => Promise<void>;
};

// TS: `: Promise<TempJob>` é o tipo de retorno: a função async entrega um TempJob.
async function create(): Promise<TempJob> {
  const baseDir = config.get().tempDir;
  await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
  await sweepIfDue(baseDir);

  const jobPath = await fs.mkdtemp(path.join(baseDir, JOB_PREFIX));
  // TS: variável com tipo declarado: guarda uma `Promise<void>` ou `null`, antes de existir.
  let cleanupPromise: Promise<void> | null = null;

  return {
    path: jobPath,
    copyCookies,
    cleanup() {
      // TS: `??=` é JavaScript: atribui só se a variável for null ou undefined.
      cleanupPromise ??= fs.rm(jobPath, { recursive: true, force: true });
      return cleanupPromise;
    },
  };

  // O yt-dlp regrava o arquivo de cookies ao sair; cada job usa uma cópia.
  // TS: sem anotação de retorno, o TS infere `Promise<string | null>` pelos `return` da função.
  async function copyCookies(source: string | null) {
    if (!source) return null;
    const destination = path.join(jobPath, "cookies.txt");
    await fs.copyFile(source, destination);
    await fs.chmod(destination, 0o600);
    return destination;
  }
}

// Remove sobras de jobs interrompidos (ex.: processo morto no meio do download).
// TS: `baseDir` não tem anotação; o tipo vem do valor padrão (string).
async function sweepStale(baseDir = config.get().tempDir) {
  const maxAgeMs = config.get().downloadTimeoutMs * 2;
  const now = Date.now();
  // TS: `string[]` é um array de textos. A variável é declarada aqui e preenchida dentro do try.
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
