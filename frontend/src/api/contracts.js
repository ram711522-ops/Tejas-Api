/**
 * Runtime request & response contract validators aligned strictly with
 * TEJAS FastAPI Pydantic schemas (origin/feature/plant-management).
 */

const PLANT_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const FORECAST_SOURCES = new Set(['ml_model', 'external', 'manual']);
const READING_SOURCES = new Set(['inverter', 'scada', 'meter', 'historical_dataset', 'manual']);
const ALERT_SEVERITIES = new Set(['low', 'medium', 'high']);
const ALERT_STATUSES = new Set(['open', 'acknowledged', 'resolved']);
const TZ_REGEX = /(Z|[+-]\d{2}:\d{2})$/i;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} response: expected object.`);
  }
  return value;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label} response: expected array.`);
  }
  return value;
}

function assertFiniteNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function ensureTimezoneTimestamp(value, field) {
  const str = String(value || '').trim();
  if (!str || !TZ_REGEX.test(str) || Number.isNaN(new Date(str).getTime())) {
    throw new Error(`${field} must be an ISO-8601 datetime with timezone (e.g. ...Z or +05:30).`);
  }
  return str;
}

// ---------------- Request Payload Sanitizers ----------------

export function sanitizePlantCreate(payload) {
  const plant_id = String(payload.plant_id || '').trim();
  const plant_name = String(payload.plant_name || '').trim();
  const plant_type = String(payload.plant_type || '').trim();

  if (!plant_id || plant_id.length > 50 || !PLANT_ID_REGEX.test(plant_id)) {
    throw new Error('plant_id must be 1–50 characters of letters, digits, "-" or "_".');
  }
  if (!plant_name || plant_name.length > 100) {
    throw new Error('plant_name must be 1–100 characters.');
  }
  if (!plant_type || plant_type.length > 50) {
    throw new Error('plant_type must be 1–50 characters.');
  }

  const latitude = assertFiniteNumber(Number(payload.latitude), 'latitude');
  const longitude = assertFiniteNumber(Number(payload.longitude), 'longitude');
  const installed_capacity_mw = assertFiniteNumber(
    Number(payload.installed_capacity_mw),
    'installed_capacity_mw'
  );

  if (latitude < -90 || latitude > 90) throw new Error('latitude must be between -90 and 90.');
  if (longitude < -180 || longitude > 180) throw new Error('longitude must be between -180 and 180.');
  if (installed_capacity_mw <= 0) throw new Error('installed_capacity_mw must be greater than 0.');

  const out = {
    plant_id,
    plant_name,
    plant_type,
    latitude,
    longitude,
    installed_capacity_mw,
    tilt: payload.tilt !== undefined && payload.tilt !== null && payload.tilt !== '' ? assertFiniteNumber(Number(payload.tilt), 'tilt') : null,
    azimuth: payload.azimuth !== undefined && payload.azimuth !== null && payload.azimuth !== '' ? assertFiniteNumber(Number(payload.azimuth), 'azimuth') : null,
  };

  if (out.tilt !== null && (out.tilt < 0 || out.tilt > 90)) {
    throw new Error('tilt must be between 0 and 90.');
  }
  if (out.azimuth !== null && (out.azimuth < 0 || out.azimuth > 360)) {
    throw new Error('azimuth must be between 0 and 360.');
  }

  return out;
}

export function sanitizePlantUpdate(payload) {
  const allowed = ['plant_name', 'plant_type', 'latitude', 'longitude', 'installed_capacity_mw', 'tilt', 'azimuth'];
  const clean = {};
  for (const key of allowed) {
    if (key in payload && payload[key] !== undefined) {
      clean[key] = payload[key];
    }
  }
  if (Object.keys(clean).length === 0) {
    throw new Error('Provide at least one plant field to update.');
  }
  return clean;
}

export function sanitizeForecastCreate(payload) {
  const plant_id = String(payload.plant_id || '').trim();
  if (!plant_id) throw new Error('plant_id is required.');
  if (!FORECAST_SOURCES.has(payload.source)) {
    throw new Error('source must be one of ml_model, external, or manual.');
  }
  const predicted_power_kw = assertFiniteNumber(Number(payload.predicted_power_kw), 'predicted_power_kw');
  if (predicted_power_kw < 0) throw new Error('predicted_power_kw must be >= 0.');

  return {
    plant_id,
    forecast_timestamp: ensureTimezoneTimestamp(payload.forecast_timestamp, 'forecast_timestamp'),
    predicted_power_kw,
    source: payload.source,
    model_version: payload.model_version ? String(payload.model_version).trim() : null,
  };
}

export function sanitizeForecastUpdate(payload) {
  const allowed = ['forecast_timestamp', 'predicted_power_kw', 'source', 'model_version'];
  const clean = {};
  for (const key of allowed) {
    if (key in payload && payload[key] !== undefined) {
      clean[key] = key === 'forecast_timestamp'
        ? ensureTimezoneTimestamp(payload[key], 'forecast_timestamp')
        : payload[key];
    }
  }
  if (Object.keys(clean).length === 0) {
    throw new Error('Provide at least one forecast field to update.');
  }
  return clean;
}

export function sanitizeReadingCreate(payload) {
  const plant_id = String(payload.plant_id || '').trim();
  if (!plant_id) throw new Error('plant_id is required.');
  if (!READING_SOURCES.has(payload.source)) {
    throw new Error('source must be inverter, scada, meter, historical_dataset, or manual.');
  }
  const ambient_temperature = assertFiniteNumber(Number(payload.ambient_temperature), 'ambient_temperature');
  const module_temperature = assertFiniteNumber(Number(payload.module_temperature), 'module_temperature');
  const irradiation = assertFiniteNumber(Number(payload.irradiation), 'irradiation');
  const actual_power_kw = assertFiniteNumber(Number(payload.actual_power_kw), 'actual_power_kw');
  if (irradiation < 0) throw new Error('irradiation must be >= 0.');
  if (actual_power_kw < 0) throw new Error('actual_power_kw must be >= 0.');

  return {
    plant_id,
    timestamp: ensureTimezoneTimestamp(payload.timestamp, 'timestamp'),
    ambient_temperature,
    module_temperature,
    irradiation,
    actual_power_kw,
    source: payload.source,
  };
}

export function sanitizeReadingUpdate(payload) {
  const allowed = ['timestamp', 'ambient_temperature', 'module_temperature', 'irradiation', 'actual_power_kw', 'source'];
  const clean = {};
  for (const key of allowed) {
    if (key in payload && payload[key] !== undefined) {
      clean[key] = key === 'timestamp'
        ? ensureTimezoneTimestamp(payload[key], 'timestamp')
        : payload[key];
    }
  }
  if (Object.keys(clean).length === 0) {
    throw new Error('Provide at least one reading field to update.');
  }
  return clean;
}

export function sanitizeAlertCreate(payload) {
  const plant_id = String(payload.plant_id || '').trim();
  const message = String(payload.message || '').trim();
  if (!plant_id) throw new Error('plant_id is required.');
  if (!message || message.length > 255) throw new Error('message must be 1–255 characters.');
  const severity = payload.severity || 'medium';
  const status = payload.status || 'open';
  if (!ALERT_SEVERITIES.has(severity)) throw new Error('severity must be low, medium, or high.');
  if (!ALERT_STATUSES.has(status)) throw new Error('status must be open, acknowledged, or resolved.');

  const predicted_power_kw = assertFiniteNumber(Number(payload.predicted_power_kw), 'predicted_power_kw');
  const actual_power_kw = assertFiniteNumber(Number(payload.actual_power_kw), 'actual_power_kw');
  if (predicted_power_kw < 0 || actual_power_kw < 0) {
    throw new Error('predicted_power_kw and actual_power_kw must be >= 0.');
  }

  return {
    plant_id,
    forecast_id: payload.forecast_id ?? null,
    reading_id: payload.reading_id ?? null,
    predicted_power_kw,
    actual_power_kw,
    residual_kw: payload.residual_kw ?? null,
    deviation_percent: payload.deviation_percent ?? null,
    severity,
    status,
    message,
  };
}

export function sanitizeAlertUpdate(payload) {
  const allowed = ['status', 'severity', 'message'];
  const clean = {};
  for (const key of allowed) {
    if (key in payload && payload[key] !== undefined) {
      clean[key] = payload[key];
    }
  }
  if (Object.keys(clean).length === 0) {
    throw new Error('Provide at least one alert field to update.');
  }
  return clean;
}

export function sanitizeSolarInput(payload) {
  const plant_code = Number(payload.plant_code);
  if (plant_code !== 0 && plant_code !== 1) throw new Error('plant_code must be 0 or 1.');
  const hour_sin = assertFiniteNumber(Number(payload.hour_sin), 'hour_sin');
  const hour_cos = assertFiniteNumber(Number(payload.hour_cos), 'hour_cos');
  if (Math.abs(hour_sin ** 2 + hour_cos ** 2 - 1) > 0.02) {
    throw new Error('hour_sin and hour_cos must lie on the unit circle.');
  }
  return {
    plant_code,
    AMBIENT_TEMPERATURE: assertFiniteNumber(Number(payload.AMBIENT_TEMPERATURE), 'AMBIENT_TEMPERATURE'),
    MODULE_TEMPERATURE: assertFiniteNumber(Number(payload.MODULE_TEMPERATURE), 'MODULE_TEMPERATURE'),
    IRRADIATION: assertFiniteNumber(Number(payload.IRRADIATION), 'IRRADIATION'),
    hour_sin,
    hour_cos,
    actual_power: payload.actual_power !== undefined && payload.actual_power !== null
      ? assertFiniteNumber(Number(payload.actual_power), 'actual_power')
      : null,
  };
}

// ---------------- Response Contract Guards ----------------

export function validateHealthResponse(data) {
  const obj = assertObject(data, 'health');
  if (typeof obj.status !== 'string' || typeof obj.model_loaded !== 'boolean') {
    throw new Error('Invalid health response: missing status or model_loaded.');
  }
  return obj;
}

export function validatePlantResponse(data) {
  const obj = assertObject(data, 'plant');
  if (typeof obj.plant_id !== 'string' || typeof obj.plant_name !== 'string') {
    throw new Error('Invalid plant response: missing plant_id or plant_name.');
  }
  return obj;
}

export function validatePlantListResponse(data) {
  return assertArray(data, 'plants list').map(validatePlantResponse);
}

export function validateWeatherResponse(data) {
  const obj = assertObject(data, 'weather');
  assertObject(obj.weather, 'weather.weather');
  return obj;
}

export function validateForecastResponse(data) {
  const obj = assertObject(data, 'forecast');
  if (typeof obj.id !== 'number' || typeof obj.plant_id !== 'string') {
    throw new Error('Invalid forecast response.');
  }
  return obj;
}

export function validateForecastListResponse(data) {
  return assertArray(data, 'forecasts list').map(validateForecastResponse);
}

export function validateReadingResponse(data) {
  const obj = assertObject(data, 'reading');
  if (typeof obj.id !== 'number' || typeof obj.plant_id !== 'string') {
    throw new Error('Invalid reading response.');
  }
  return obj;
}

export function validateReadingListResponse(data) {
  return assertArray(data, 'readings list').map(validateReadingResponse);
}

export function validateAlertResponse(data) {
  const obj = assertObject(data, 'alert');
  if (typeof obj.id !== 'number' || typeof obj.plant_id !== 'string') {
    throw new Error('Invalid alert response.');
  }
  return obj;
}

export function validateAlertListResponse(data) {
  return assertArray(data, 'alerts list').map(validateAlertResponse);
}

export function validateCompareResponse(data) {
  const obj = assertObject(data, 'compare');
  if (typeof obj.plant_id !== 'string' || typeof obj.deviation_detected !== 'boolean') {
    throw new Error('Invalid compare response.');
  }
  return obj;
}
