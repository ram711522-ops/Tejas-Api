import { invalidateApiCache } from './cache';
import { apiClient } from './client';
import { validateCompareResponse } from './contracts';

function cleanParams(params = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export async function previewComparison(plantId, { forecast_id, reading_id } = {}, signal) {
  const { data } = await apiClient.get(`/plants/${encodeURIComponent(plantId)}/compare`, {
    params: cleanParams({ forecast_id, reading_id }),
    signal,
  });
  return validateCompareResponse(data);
}

export async function runComparison(plantId, payload = null) {
  const body = payload && Object.keys(payload).length > 0 ? payload : undefined;
  const { data } = await apiClient.post(
    `/plants/${encodeURIComponent(plantId)}/compare`,
    body
  );
  if (data?.alert_generated) {
    invalidateApiCache('alerts:');
  }
  return validateCompareResponse(data);
}
