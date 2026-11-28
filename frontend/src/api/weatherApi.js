import { cachedRequest } from './cache';
import { apiClient } from './client';
import { API_CONFIG } from './config';
import { validateWeatherResponse } from './contracts';

export async function getPlantWeather(plantId, signal, { force = false } = {}) {
  return cachedRequest(
    `weather:${plantId}`,
    async () => {
      const { data } = await apiClient.get(`/plants/${encodeURIComponent(plantId)}/weather`, {
        signal,
        timeout: API_CONFIG.weatherTimeoutMs,
      });
      return validateWeatherResponse(data);
    },
    { ttlMs: API_CONFIG.defaultCacheTtlMs, force }
  );
}
