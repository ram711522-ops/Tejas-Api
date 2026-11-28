import { cachedRequest } from './cache';
import { apiClient } from './client';
import { API_CONFIG } from './config';
import { validateHealthResponse } from './contracts';

export async function getApiRoot(signal) {
  const { data } = await apiClient.get('/', {
    publicEndpoint: true,
    timeout: API_CONFIG.healthTimeoutMs,
    signal,
  });
  return data;
}

export async function getSystemHealth(signal, { force = false } = {}) {
  return cachedRequest(
    'system:health',
    async () => {
      const { data } = await apiClient.get('/health', {
        publicEndpoint: true,
        timeout: API_CONFIG.healthTimeoutMs,
        signal,
      });
      return validateHealthResponse(data);
    },
    { ttlMs: API_CONFIG.healthCacheTtlMs, force }
  );
}
