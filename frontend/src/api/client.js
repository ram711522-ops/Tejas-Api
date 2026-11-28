import axios from 'axios';
import { buildBasicAuthHeader } from '../utils/auth';
import { parseApiError } from '../utils/errorParser';
import { API_CONFIG, DEFAULT_API_BASE_URL, normalizeBaseUrl } from './config';

export { DEFAULT_API_BASE_URL };

export function setClientBaseUrl(baseUrl) {
  apiClient.defaults.baseURL = normalizeBaseUrl(baseUrl);
}

export const apiClient = axios.create({
  baseURL: API_CONFIG.baseUrl,
  timeout: API_CONFIG.timeoutMs,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  // Attach HTTP Basic Auth only when credentials are configured and not public.
  if (!config.publicEndpoint && !config.headers?.Authorization) {
    const authHeader = buildBasicAuthHeader();
    if (authHeader) {
      config.headers = config.headers || {};
      config.headers.Authorization = authHeader;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const parsed = parseApiError(error);
    const normalized = new Error(parsed.message);
    normalized.name = 'ApiError';
    normalized.status = parsed.status;
    normalized.fieldErrors = parsed.fieldErrors;
    normalized.isAuthError = parsed.isAuthError;
    normalized.isNetworkError = parsed.isNetworkError;
    normalized.isCanceled = Boolean(parsed.isCanceled);
    normalized.originalError = error;
    return Promise.reject(normalized);
  }
);
