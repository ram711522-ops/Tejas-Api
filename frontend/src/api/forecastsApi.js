import { cachedRequest, invalidateApiCache } from './cache';
import { apiClient } from './client';
import { API_CONFIG } from './config';
import {
  sanitizeForecastCreate,
  sanitizeForecastUpdate,
  validateForecastListResponse,
  validateForecastResponse,
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

export async function listForecasts(params = {}, signal, { force = false } = {}) {
  const query = cleanParams(params);
  const cacheKey = `forecasts:list:${JSON.stringify(query)}`;
  return cachedRequest(
    cacheKey,
    async () => {
      const { data } = await apiClient.get('/forecasts', {
        params: query,
        signal,
      });
      return validateForecastListResponse(data);
    },
    { ttlMs: API_CONFIG.defaultCacheTtlMs, force }
  );
}

export async function fetchAllForecastsInRange(
  { plant_id, start_date, end_date, pageSize = 500, maxPages = 4 } = {},
  signal,
  { force = false } = {}
) {
  const limit = Math.min(500, Math.max(1, pageSize));
  const results = [];
  for (let page = 0; page < maxPages; page += 1) {
    const chunk = await listForecasts(
      { plant_id, start_date, end_date, skip: page * limit, limit },
      signal,
      { force }
    );
    results.push(...chunk);
    if (chunk.length < limit) break;
  }
  return results;
}

export async function getForecast(forecastId, signal) {
  const { data } = await apiClient.get(`/forecasts/${forecastId}`, { signal });
  return validateForecastResponse(data);
}

export async function createForecast(payload) {
  const cleanPayload = sanitizeForecastCreate(payload);
  const { data } = await apiClient.post('/forecasts', cleanPayload);
  invalidateApiCache('forecasts:');
  return validateForecastResponse(data);
}

export async function updateForecast(forecastId, payload) {
  const cleanPayload = sanitizeForecastUpdate(payload);
  const { data } = await apiClient.put(`/forecasts/${forecastId}`, cleanPayload);
  invalidateApiCache('forecasts:');
  return validateForecastResponse(data);
}

export async function deleteForecast(forecastId) {
  await apiClient.delete(`/forecasts/${forecastId}`);
  invalidateApiCache('forecasts:');
}
