import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CheckCircle2,
  Compass,
  Loader2,
  LocateFixed,
  MapPin,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import {
  reverseGeocodeNominatim,
  searchNominatimPlaces,
} from '../../utils/nominatimGeocoder';
import { StatusIndicator } from '../data-display/StatusIndicator';
import styles from './LocationPicker.module.css';

const DEFAULT_CENTER = [20.5937, 78.9629];

const solarPinIcon = L.divIcon({
  className: 'tejas-solar-pin',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: '<div style="width:24px;height:24px;margin:2px;border-radius:9999px;background:radial-gradient(circle,#fbbf24 35%,#f59e0b 78%,rgba(245,158,11,0.28) 100%);border:2px solid #ffffff;box-shadow:0 0 16px rgba(245,158,11,0.85);"></div>',
});

function formatCoord(value, posHem, negHem) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${Math.abs(num).toFixed(4)}° ${num >= 0 ? posHem : negHem}`;
}

function MapInteractionController({ hasValidCoords, latNum, lonNum, disabled, onPickPoint }) {
  const map = useMap();

  useMapEvents({
    click(event) {
      if (disabled) return;
      const clickedLat = event?.latlng?.lat;
      const clickedLng = event?.latlng?.lng;
      if (Number.isFinite(clickedLat) && Number.isFinite(clickedLng)) {
        onPickPoint(clickedLat, clickedLng);
      }
    },
  });

  useEffect(() => {
    if (!hasValidCoords) return;
    const currentZoom = map.getZoom?.() || 5;
    map.setView([latNum, lonNum], Math.max(currentZoom, 12), { animate: true });
  }, [hasValidCoords, latNum, lonNum, map]);

  return null;
}

export function LocationPicker({
  latitude,
  longitude,
  address = '',
  placeName = '',
  latitudeError = '',
  longitudeError = '',
  disabled = false,
  onLocationChange,
  onManualCoordinateChange,
  onUsePlaceAsName,
}) {
  const searchAbortRef = useRef(null);
  const reverseAbortRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [geoLoading, setGeoLoading] = useState(false);

  const latNum = Number(latitude);
  const lonNum = Number(longitude);
  const hasValidCoords =
    latitude !== '' &&
    longitude !== '' &&
    Number.isFinite(latNum) &&
    Number.isFinite(lonNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lonNum >= -180 &&
    lonNum <= 180;

  const mapCenter = useMemo(
    () => (hasValidCoords ? [latNum, lonNum] : DEFAULT_CENTER),
    [hasValidCoords, latNum, lonNum]
  );

  const handleCoordinatePick = useCallback(
    async (rawLat, rawLng) => {
      const nextLat = Number(Number(rawLat).toFixed(6));
      const nextLng = Number(Number(rawLng).toFixed(6));
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;

      onLocationChange?.({
        latitude: nextLat,
        longitude: nextLng,
        address,
        placeName: '',
      });

      if (reverseAbortRef.current) {
        reverseAbortRef.current.abort();
      }
      const controller = new AbortController();
      reverseAbortRef.current = controller;

      const rev = await reverseGeocodeNominatim(nextLat, nextLng, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || !rev) return;

      onLocationChange?.({
        latitude: nextLat,
        longitude: nextLng,
        address: rev.formattedAddress || '',
        placeName: rev.placeName || '',
      });
    },
    [address, onLocationChange]
  );

  const runSearch = useCallback(async (queryText) => {
    const trimmed = String(queryText || '').trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setSearchStatus(trimmed.length > 0 ? 'Enter at least 3 characters to search.' : '');
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearchLoading(true);
    setSearchStatus('');
    try {
      const results = await searchNominatimPlaces(trimmed, {
        signal: controller.signal,
        limit: 5,
      });
      if (controller.signal.aborted) return;
      setSuggestions(results);
      setActiveIndex(-1);
      if (results.length === 0) {
        setSearchStatus('No OpenStreetMap locations matched your query.');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setSuggestions([]);
        setSearchStatus(
          err?.message || 'Location search unavailable. Click directly on the map or enter coordinates.'
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearchLoading(false);
      }
    }
  }, []);

  // Respect Nominatim usage policy: 1.15s debounce before querying automatically
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setSearchStatus('');
      return undefined;
    }
    const timer = window.setTimeout(() => {
      runSearch(trimmed);
    }, 1150);

    return () => window.clearTimeout(timer);
  }, [searchQuery, runSearch]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
    };
  }, []);

  const handleSelectSuggestion = (item) => {
    if (!item) return;
    setSearchQuery(item.formattedAddress || item.placeName || '');
    setSuggestions([]);
    setSearchStatus('');

    onLocationChange?.({
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.formattedAddress || '',
      placeName: item.placeName || '',
    });
  };

  const handleBrowserGeolocation = () => {
    if (!navigator?.geolocation) {
      setSearchStatus('Browser geolocation is unavailable in this environment.');
      return;
    }
    setGeoLoading(true);
    setSearchStatus('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeoLoading(false);
        await handleCoordinatePick(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGeoLoading(false);
        setSearchStatus(err?.message || 'Location permission denied.');
      },
      { timeout: 8000 }
    );
  };

  const handleResetLocation = () => {
    setSearchQuery('');
    setSuggestions([]);
    setSearchStatus('');
    onLocationChange?.({
      latitude: '',
      longitude: '',
      address: '',
      placeName: '',
    });
  };

  const statusBadge = hasValidCoords
    ? { tone: 'success', label: 'Location Selected' }
    : { tone: 'info', label: 'Click Map or Search' };

  return (
    <section
      className={`${styles.container} ${
        latitudeError || longitudeError ? styles.containerError : ''
      }`}
      aria-label="Solar plant location selector"
    >
      <div className={styles.headerRow}>
        <div className={styles.titleBlock}>
          <span className="eyebrow">OPENSTREETMAP · GEOSPATIAL SELECTOR</span>
          <div className={styles.sectionTitle}>
            <Compass size={15} style={{ color: 'var(--color-accent)' }} />
            <span>Plant Location &amp; Map Coordinates</span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <StatusIndicator tone={statusBadge.tone} label={statusBadge.label} />
          {hasValidCoords ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleResetLocation}
              disabled={disabled}
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Nominatim Search + Explicit Search & GPS Controls */}
      <div className={styles.searchArea}>
        <div className={styles.searchBar}>
          <div className={styles.searchInputWrap}>
            {searchLoading ? (
              <Loader2 size={14} className={`${styles.searchIcon} spin`} />
            ) : (
              <Search size={14} className={styles.searchIcon} />
            )}
            <input
              type="text"
              className={`input-field ${styles.searchInput}`}
              placeholder="Search plant location..."
              aria-label="Search plant location"
              value={searchQuery}
              disabled={disabled}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestions.length > 0 && activeIndex >= 0) {
                    handleSelectSuggestion(suggestions[activeIndex]);
                  } else {
                    runSearch(searchQuery);
                  }
                } else if (suggestions.length > 0 && e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((prev) => Math.min(suggestions.length - 1, prev + 1));
                } else if (suggestions.length > 0 && e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((prev) => Math.max(0, prev - 1));
                } else if (e.key === 'Escape') {
                  setSuggestions([]);
                }
              }}
            />
            {searchQuery ? (
              <button
                type="button"
                className={styles.clearSearchBtn}
                aria-label="Clear location search"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setSearchStatus('');
                }}
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || searchLoading || searchQuery.trim().length < 3}
            onClick={() => runSearch(searchQuery)}
          >
            <Search size={13} />
            <span>Search</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleBrowserGeolocation}
            disabled={disabled || geoLoading}
            title="Use current device coordinates"
          >
            {geoLoading ? <Loader2 size={13} className="spin" /> : <LocateFixed size={13} />}
            <span>GPS</span>
          </button>
        </div>

        {suggestions.length > 0 ? (
          <ul className={styles.suggestionsList} role="listbox" aria-label="Location suggestions">
            {suggestions.map((item, idx) => (
              <li key={item.placeId} role="option" aria-selected={idx === activeIndex}>
                <button
                  type="button"
                  className={`${styles.suggestionItem} ${
                    idx === activeIndex ? styles.suggestionItemActive : ''
                  }`}
                  onClick={() => handleSelectSuggestion(item)}
                >
                  <MapPin
                    size={14}
                    style={{ color: 'var(--color-accent)', marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <div className={styles.suggestionMain}>
                      {item.placeName || item.formattedAddress}
                    </div>
                    {item.formattedAddress ? (
                      <div className={styles.suggestionSub}>{item.formattedAddress}</div>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {searchStatus ? (
        <div className={styles.searchStatus} role="status">
          {searchStatus}
        </div>
      ) : null}

      {/* Interactive React Leaflet + OpenStreetMap Canvas */}
      <div className={styles.mapStage}>
        <MapContainer
          center={mapCenter}
          zoom={hasValidCoords ? 12 : 4}
          scrollWheelZoom
          className={styles.leafletRoot}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapInteractionController
            hasValidCoords={hasValidCoords}
            latNum={latNum}
            lonNum={lonNum}
            disabled={disabled}
            onPickPoint={handleCoordinatePick}
          />

          {hasValidCoords ? (
            <Marker
              position={[latNum, lonNum]}
              icon={solarPinIcon}
              draggable={!disabled}
              eventHandlers={{
                dragend: (event) => {
                  const pos = event?.target?.getLatLng?.();
                  if (pos) {
                    handleCoordinatePick(pos.lat, pos.lng);
                  }
                },
              }}
            />
          ) : null}
        </MapContainer>

        <div className={styles.reticleHint}>
          Click map or drag solar marker to lock exact coordinates
        </div>
      </div>

      <div className={styles.attributionNote}>
        Free map tiles via OpenStreetMap • Geocoding powered by Nominatim (max 1 req/s)
      </div>

      {/* Selected Location Summary Card */}
      {hasValidCoords ? (
        <div className={styles.selectedCard}>
          <div className={styles.selectedInfo}>
            <div className={styles.placeTitle}>
              <CheckCircle2
                size={13}
                style={{ color: 'var(--color-success)', verticalAlign: 'middle', marginRight: 6 }}
              />
              {placeName || 'Coordinates Locked'}
            </div>
            <div className={styles.placeAddress}>
              {address || 'Pinned via OpenStreetMap coordinates'}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {formatCoord(latNum, 'N', 'S')} · {formatCoord(lonNum, 'E', 'W')}
            </div>
          </div>

          {placeName && onUsePlaceAsName ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onUsePlaceAsName(placeName)}
              disabled={disabled}
            >
              <Sparkles size={12} />
              <span>Use as Plant Name</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Editable Coordinate Fields (Auto-populated by map/search & synced live) */}
      <div className={styles.coordRow}>
        <div className={styles.coordField}>
          <label htmlFor="plant-lat-input" className={styles.coordLabel}>
            Latitude (°)<span className={styles.req}>*</span>
          </label>
          <input
            id="plant-lat-input"
            type="number"
            step="any"
            min="-90"
            max="90"
            className={`input-field mono ${latitudeError ? styles.inputError : ''}`}
            placeholder="e.g. 14.80"
            value={latitude}
            onChange={(e) => onManualCoordinateChange?.('latitude', e.target.value)}
            disabled={disabled}
            required
          />
          {latitudeError ? <span className={styles.fieldError}>{latitudeError}</span> : null}
        </div>

        <div className={styles.coordField}>
          <label htmlFor="plant-lon-input" className={styles.coordLabel}>
            Longitude (°)<span className={styles.req}>*</span>
          </label>
          <input
            id="plant-lon-input"
            type="number"
            step="any"
            min="-180"
            max="180"
            className={`input-field mono ${longitudeError ? styles.inputError : ''}`}
            placeholder="e.g. 78.18"
            value={longitude}
            onChange={(e) => onManualCoordinateChange?.('longitude', e.target.value)}
            disabled={disabled}
            required
          />
          {longitudeError ? <span className={styles.fieldError}>{longitudeError}</span> : null}
        </div>
      </div>
    </section>
  );
}
