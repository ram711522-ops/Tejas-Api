import { cachedRequest, invalidateApiCache } from './cache';
import { apiClient } from './client';
import { API_CONFIG } from './config';
import {
  sanitizeReadingCreate,
  sanitizeReadingUpdate,
  validateReadingListResponse,
  validateReadingResponse,
} from './contracts';

function cleanParams(params = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export async function listReadings(params = {}, signal, { force = false } = {}) {
  const query = cleanParams(params);
  const cacheKey = `readings:list:${JSON.stringify(query)}`;
  return cachedRequest(
    cacheKey,
    async () => {
      const { data } = await apiClient.get('/readings', {
        params: query,
        signal,
      });
      return validateReadingListResponse(data);
    },
    { ttlMs: API_CONFIG.defaultCacheTtlMs, force }
  );
}

export async function fetchAllReadingsInRange(
  { plant_id, start_date, end_date, pageSize = 500, maxPages = 4 } = {},
  signal,
  { force = false } = {}
) {
  const limit = Math.min(500, Math.max(1, pageSize));
  const results = [];
  for (let page = 0; page < maxPages; page += 1) {
    const chunk = await listReadings(
      { plant_id, start_date, end_date, skip: page * limit, limit },
      signal,
      { force }
    );
    results.push(...chunk);
    if (chunk.length < limit) break;
  }
  return results;
}

export async function getReading(readingId, signal) {
  const { data } = await apiClient.get(`/readings/${readingId}`, { signal });
  return validateReadingResponse(data);
}

export async function createReading(payload) {
  const cleanPayload = sanitizeReadingCreate(payload);
  const { data } = await apiClient.post('/readings', cleanPayload);
  invalidateApiCache('readings:');
  return validateReadingResponse(data);
}

export async function updateReading(readingId, payload) {
  const cleanPayload = sanitizeReadingUpdate(payload);
  const { data } = await apiClient.put(`/readings/${readingId}`, cleanPayload);
  invalidateApiCache('readings:');
  return validateReadingResponse(data);
}

export async function deleteReading(readingId) {
  await apiClient.delete(`/readings/${readingId}`);
  invalidateApiCache('readings:');
}
