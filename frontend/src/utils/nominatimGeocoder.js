/**
 * Free OpenStreetMap Nominatim search & reverse-geocoding helper.
 * Respects Nominatim Usage Policy:
 * - Minimum 1.1s spacing between outbound requests
 * - Client-side response cache to avoid duplicate queries
 * - AbortController support for cancelling superseded lookups
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_REQUEST_INTERVAL_MS = 1100;

let lastRequestAt = 0;
const searchCache = new Map();
const reverseCache = new Map();

function extractPlaceName(item) {
  if (!item) return '';
  if (item.name && String(item.name).trim()) return String(item.name).trim();
  const addr = item.address || {};
  return (
    addr.solar_panel ||
    addr.power_station ||
    addr.industrial ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.county ||
    addr.state ||
    ''
  );
}

async function waitForRateLimit(signal) {
  const elapsed = Date.now() - lastRequestAt;
  const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
  if (waitMs > 0) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, waitMs);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      }
    });
  }
  lastRequestAt = Date.now();
}

export async function searchNominatimPlaces(query, { signal, limit = 5 } = {}) {
  const cleaned = String(query || '').trim();
  if (cleaned.length < 3) return [];

  const cacheKey = `${cleaned.toLowerCase()}::${limit}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }

  await waitForRateLimit(signal);

  const params = new URLSearchParams({
    q: cleaned,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
  });

  const resp = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!resp.ok) {
    throw new Error(`Nominatim search failed (${resp.status})`);
  }

  const raw = await resp.json();
  const mapped = (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        placeId: String(item.place_id || `${lat},${lon}`),
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
        placeName: extractPlaceName(item),
        formattedAddress: String(item.display_name || ''),
        category: item.type || item.class || '',
      };
    })
    .filter(Boolean);

  searchCache.set(cacheKey, mapped);
  return mapped;
}

export async function reverseGeocodeNominatim(latitude, longitude, { signal } = {}) {
  const latNum = Number(latitude);
  const lonNum = Number(longitude);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;

  const cacheKey = `${latNum.toFixed(4)},${lonNum.toFixed(4)}`;
  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey);
  }

  try {
    await waitForRateLimit(signal);
    const params = new URLSearchParams({
      lat: String(latNum),
      lon: String(lonNum),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '14',
    });

    const resp = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const result = {
      formattedAddress: String(data?.display_name || ''),
      placeName: extractPlaceName(data),
    };
    reverseCache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export function resetNominatimCachesForTests() {
  lastRequestAt = 0;
  searchCache.clear();
  reverseCache.clear();
}
