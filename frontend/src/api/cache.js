/**
 * Lightweight in-memory TTL response cache & concurrent request deduplication.
 * Prevents duplicate parallel calls to /health, /plants, etc.
 */

const responseCache = new Map();
const inflightRequests = new Map();

export function cachedRequest(cacheKey, fetcher, { ttlMs = 30000, force = false } = {}) {
  const now = Date.now();

  if (!force && ttlMs > 0) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return Promise.resolve(cached.data);
    }
  }

  if (!force && inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const promise = Promise.resolve()
    .then(() => fetcher())
    .then((data) => {
      if (ttlMs > 0) {
        responseCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttlMs,
        });
      }
      return data;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, promise);
  return promise;
}

export function invalidateApiCache(keyPrefix) {
  if (!keyPrefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      responseCache.delete(key);
    }
  }
}

export function clearApiCache() {
  responseCache.clear();
  inflightRequests.clear();
}
