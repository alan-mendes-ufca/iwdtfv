import fs from "node:fs";
import path from "node:path";
import retry from "async-retry";
import webserver from "infra/webserver";

async function waitForAllServices() {
  await waitForWebServer();

  // TS: parâmetro com valor padrão recebe tipo inferido: maxRetries e maxTimeout são number.
  async function waitForWebServer(maxRetries = 100, maxTimeout = 1000) {
    return retry(fetchStatusPage, {
      retries: maxRetries,
      maxTimeout: maxTimeout,
    });

    async function fetchStatusPage() {
      const response = await fetch(`${webserver.origin}/api/v1/status`);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    }
  }
}

// TEMP_DIR é o mesmo para o servidor e o Jest (definido no script `npm test`).
function getTempDir() {
  // TS: process.env.X é string | undefined; o if com throw estreita o tipo para string.
  const tempDir = process.env.TEMP_DIR;
  if (!tempDir) throw new Error("TEMP_DIR precisa estar definido nos testes.");
  return tempDir;
}

// TS: sem anotação de retorno, o TS infere string[] (readdirSync e o [] do catch).
function listTempJobs() {
  try {
    return fs
      .readdirSync(getTempDir())
      .filter((entry) => entry.startsWith("job-"));
  } catch {
    return [];
  }
}

function clearTempDir() {
  const tempDir = getTempDir();
  for (const entry of listTempJobs()) {
    fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
  }
}

// A limpeza após abort espera o yt-dlp morrer; dá alguns segundos de margem.
async function waitForNoTempJobs(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (listTempJobs().length === 0) return [];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return listTempJobs();
}

// TS: "unknown" aceita qualquer valor em body. RequestInit é o tipo das opções do fetch.
function postJson(endpoint: string, body: unknown, init: RequestInit = {}) {
  return fetch(`${webserver.origin}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    ...init,
  });
}

const orchestrator = {
  waitForAllServices,
  listTempJobs,
  clearTempDir,
  waitForNoTempJobs,
  postJson,
};

export default orchestrator;
