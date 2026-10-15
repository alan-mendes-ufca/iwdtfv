// Janela fixa em memória. Suficiente para uma única instância self-hosted.
const WINDOW_MS = 60_000;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function hit(key: string, limit: number, now = Date.now()) {
  pruneExpired(now);

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
