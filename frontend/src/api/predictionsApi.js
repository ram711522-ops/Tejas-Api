import { invalidateApiCache } from './cache';
import { apiClient } from './client';
import { sanitizeSolarInput } from './contracts';

export async function predictManual(payload, signal) {
  const cleanPayload = sanitizeSolarInput(payload);
  const { data } = await apiClient.post('/predict', cleanPayload, { signal });
  return data;
}

export async function previewAutomaticPrediction(plantId, signal) {
  const { data } = await apiClient.get(
    `/plants/${encodeURIComponent(plantId)}/predict/automatic`,
    { signal }
  );
  return data;
}

export async function runAutomaticPrediction(plantId) {
  const { data } = await apiClient.post(
    `/plants/${encodeURIComponent(plantId)}/predict/automatic`
  );
  if (data?.forecast_saved) {
    invalidateApiCache('forecasts:');
  }
  return data;
}
