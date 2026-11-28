export const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || 'http://localhost:8000';

export const API_CONFIG = {
  baseUrl: DEFAULT_API_BASE_URL,
  timeoutMs: 15000,
  healthTimeoutMs: 6000,
  weatherTimeoutMs: 15000,
  defaultCacheTtlMs: 30000,
  healthCacheTtlMs: 15000,
};

export function normalizeBaseUrl(url) {
  const cleaned = String(url || '').trim().replace(/\/+$/, '');
  return cleaned || DEFAULT_API_BASE_URL;
}
