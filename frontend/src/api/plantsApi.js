import { cachedRequest, invalidateApiCache } from './cache';
import { apiClient } from './client';
import { API_CONFIG } from './config';
import {
  sanitizePlantCreate,
  sanitizePlantUpdate,
  validatePlantListResponse,
  validatePlantResponse,
} from './contracts';

export async function listPlants(signal, { force = false } = {}) {
  return cachedRequest(
    'plants:list',
    async () => {
      const { data } = await apiClient.get('/plants', { signal });
      return validatePlantListResponse(data);
    },
    { ttlMs: API_CONFIG.defaultCacheTtlMs, force }
  );
}

export async function getPlant(plantId, signal, { force = false } = {}) {
  return cachedRequest(
    `plants:detail:${plantId}`,
    async () => {
      const { data } = await apiClient.get(`/plants/${encodeURIComponent(plantId)}`, { signal });
      return validatePlantResponse(data);
    },
    { ttlMs: API_CONFIG.defaultCacheTtlMs, force }
  );
}

export async function createPlant(payload) {
  const cleanPayload = sanitizePlantCreate(payload);
  const { data } = await apiClient.post('/plants', cleanPayload);
  invalidateApiCache('plants:');
  return validatePlantResponse(data);
}

export async function updatePlant(plantId, payload) {
  const cleanPayload = sanitizePlantUpdate(payload);
  const { data } = await apiClient.put(`/plants/${encodeURIComponent(plantId)}`, cleanPayload);
  invalidateApiCache('plants:');
  return validatePlantResponse(data);
}

export async function deletePlant(plantId) {
  await apiClient.delete(`/plants/${encodeURIComponent(plantId)}`);
  invalidateApiCache('plants:');
  invalidateApiCache('forecasts:');
  invalidateApiCache('readings:');
  invalidateApiCache('alerts:');
}
