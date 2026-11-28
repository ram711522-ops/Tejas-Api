/**
 * Reusable HTTP Basic Auth utilities matching backend api/auth.py (HTTPBasic).
 * Credentials are optional in the UI (no login gate); if configured via env vars
 * or sessionStorage, they are attached to Axios requests without logging secrets.
 */

const AUTH_STORAGE_KEY = 'tejas.api.basic_auth';
let memoryToken = null;

export function encodeBasicCredentials(username, password) {
  const user = String(username ?? '').trim();
  const pass = String(password ?? '');
  if (!user || !pass) return null;

  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function getStoredAuthToken() {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.token) return parsed.token;
      }
    } catch {
      // Ignore storage errors
    }
  }

  if (memoryToken) return memoryToken;

  const envUser = import.meta.env.VITE_API_USERNAME;
  const envPass = import.meta.env.VITE_API_PASSWORD;
  if (envUser && envPass) {
    return encodeBasicCredentials(envUser, envPass);
  }
  return null;
}

export function setStoredAuthCredentials(username, password) {
  const token = encodeBasicCredentials(username, password);
  if (!token) {
    clearStoredAuthCredentials();
    return null;
  }
  memoryToken = token;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ username: String(username).trim(), token })
      );
    } catch {
      // Ignore storage errors
    }
  }
  return token;
}

export function clearStoredAuthCredentials() {
  memoryToken = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}

export function buildBasicAuthHeader(token = getStoredAuthToken()) {
  return token ? `Basic ${token}` : null;
}

/**
 * Returns non-secret authentication configuration status for Settings UI.
 * Never returns passwords or Base64 credentials.
 */
export function getAuthConfigSummary() {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.token) {
          return {
            configured: true,
            source: 'session',
            username: parsed.username || null,
          };
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  if (memoryToken) {
    return { configured: true, source: 'session', username: null };
  }

  if (import.meta.env.VITE_API_USERNAME && import.meta.env.VITE_API_PASSWORD) {
    return { configured: true, source: 'env', username: null };
  }

  return { configured: false, source: 'none', username: null };
}
