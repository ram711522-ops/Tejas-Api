import { cachedRequest, invalidateApiCache } from './cache';
import { apiClient } from './client';
import { API_CONFIG } from './config';
import {
  sanitizeAlertCreate,
  sanitizeAlertUpdate,
  validateAlertListResponse,
  validateAlertResponse,
} from './contracts';
import { previewComparison, runComparison } from './deviationsApi';

export { previewComparison, runComparison };

function cleanParams(params = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export async function listAlerts(params = {}, signal, { force = false } = {}) {
  const query = cleanParams(params);
  const cacheKey = `alerts:list:${JSON.stringify(query)}`;
  return cachedRequest(
    cacheKey,
    async () => {
      const { data } = await apiClient.get('/alerts', {
        params: query,
        signal,
      });
      return validateAlertListResponse(data);
    },
    { ttlMs: API_CONFIG.defaultCacheTtlMs, force }
  );
}

export async function getAlert(alertId, signal) {
  const { data } = await apiClient.get(`/alerts/${alertId}`, { signal });
  return validateAlertResponse(data);
}

export async function createAlert(payload) {
  const cleanPayload = sanitizeAlertCreate(payload);
  const { data } = await apiClient.post('/alerts', cleanPayload);
  invalidateApiCache('alerts:');
  return validateAlertResponse(data);
}

export async function updateAlert(alertId, payload) {
  const cleanPayload = sanitizeAlertUpdate(payload);
  const { data } = await apiClient.put(`/alerts/${alertId}`, cleanPayload);
  invalidateApiCache('alerts:');
  return validateAlertResponse(data);
}

export async function deleteAlert(alertId) {
  await apiClient.delete(`/alerts/${alertId}`);
  invalidateApiCache('alerts:');
}
