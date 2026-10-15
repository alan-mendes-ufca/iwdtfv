// Janela fixa em memória. Suficiente para uma única instância self-hosted.
const WINDOW_MS = 60_000;

// TS: `type` cria um apelido para um formato de objeto. Só existe na checagem.
type Bucket = {
  count: number;
  resetAt: number;
};

// TS: `Map<K, V>` é genérico: as chaves são `string` e os valores são `Bucket`.
const buckets = new Map<string, Bucket>();

// TS: `now` não tem anotação; o tipo vem do valor padrão (`number`).
function hit(key: string, limit: number, now = Date.now()) {
  pruneExpired(now);

  // TS: `get` devolve `Bucket | undefined`, pois a chave pode não existir. Por isso o `!bucket` vem antes do uso.
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count++;

  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

// TS: `now: number` é anotação de parâmetro. Sem `return` de valor, o retorno é `void` (nada).
function pruneExpired(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function reset() {
  buckets.clear();
}

const rateLimit = {
  hit,
  reset,
};

export default rateLimit;
