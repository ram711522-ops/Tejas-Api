/**
 * Temporary development fixtures for Phase 4 Overview Dashboard UI.
 * All structures mirror exact TEJAS FastAPI backend response schemas
 * (origin/feature/plant-management). Replaceable via useDashboardData without
 * modifying UI or selector logic.
 */

function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function solarFactorForHour(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 6 || hour > 18.5) return 0;
  const normalized = (hour - 6) / 12.5;
  return Math.max(0, Math.sin(normalized * Math.PI));
}

export const FIXTURE_HEALTH = {
  status: 'ok',
  model_loaded: true,
  model_features: 6,
  database: {
    connected: true,
    message: 'Database connection successful.',
  },
};

export const FIXTURE_PLANTS = [
  {
    plant_id: 'TEJAS001',
    plant_name: 'Anantapur Solar Park',
    plant_type: 'grid_tied',
    latitude: 14.6819,
    longitude: 77.6006,
    installed_capacity_mw: 10.0,
    tilt: 15.0,
    azimuth: 180.0,
  },
  {
    plant_id: 'TEJAS002',
    plant_name: 'Kurnool East Array',
    plant_type: 'utility_scale',
    latitude: 15.8281,
    longitude: 78.0373,
    installed_capacity_mw: 8.5,
    tilt: 14.0,
    azimuth: 180.0,
  },
  {
    plant_id: 'TEJAS003',
    plant_name: 'Kadapa Rooftop Lab',
    plant_type: 'rooftop',
    latitude: 14.4673,
    longitude: 78.8242,
    installed_capacity_mw: 1.2,
    tilt: 12.0,
    azimuth: 175.0,
  },
  {
    plant_id: 'TEJAS004',
    plant_name: 'Nandyal West Unit',
    plant_type: 'hybrid',
    latitude: 15.4777,
    longitude: 78.4836,
    installed_capacity_mw: 3.0,
    tilt: 15.0,
    azimuth: 180.0,
  },
];

export const FIXTURE_WEATHER_BY_PLANT = {
  TEJAS001: {
    plant_id: 'TEJAS001',
    plant_name: 'Anantapur Solar Park',
    latitude: 14.6819,
    longitude: 77.6006,
    weather: {
      source: 'open-meteo',
      observed_at_local: '2026-11-27T13:15',
      timezone: 'Asia/Kolkata',
      ambient_temperature_c: 31.4,
      relative_humidity_percent: 38,
      shortwave_radiation_w_m2: 782,
      irradiation_kw_m2: 0.782,
      units: {
        temperature: '°C',
        humidity: '%',
        radiation: 'W/m²',
      },
    },
  },
  TEJAS002: {
    plant_id: 'TEJAS002',
    plant_name: 'Kurnool East Array',
    latitude: 15.8281,
    longitude: 78.0373,
    weather: {
      source: 'open-meteo',
      observed_at_local: '2026-11-27T13:15',
      timezone: 'Asia/Kolkata',
      ambient_temperature_c: 32.8,
      relative_humidity_percent: 42,
      shortwave_radiation_w_m2: 745,
      irradiation_kw_m2: 0.745,
      units: {
        temperature: '°C',
        humidity: '%',
        radiation: 'W/m²',
      },
    },
  },
};

function buildTimeSeriesFixtures() {
  const forecasts = [];
  const readings = [];
  let forecastId = 100;
  let readingId = 200;

  // Build 48 hourly points across 48h + daily points for 7d/30d visualization
  const offsetsHours = [];
  for (let h = 23; h >= 0; h -= 1) {
    offsetsHours.push(h);
  }
  for (let d = 2; d <= 14; d += 1) {
    offsetsHours.push(d * 24 - 11); // midday sample for multi-day view
  }
  offsetsHours.sort((a, b) => b - a);

  for (const hAgo of offsetsHours) {
    const ts = hoursAgoIso(hAgo);
    const dt = new Date(ts);
    const factor = Math.max(0.18, solarFactorForHour(dt)); // daytime-weighted sample curve

    // TEJAS001 (Producing)
    const p1Pred = Number((7800 * factor).toFixed(1));
    const p1Act = Number((p1Pred * 0.96).toFixed(1));
    forecasts.push({
      id: ++forecastId,
      plant_id: 'TEJAS001',
      forecast_timestamp: ts,
      predicted_power_kw: p1Pred,
      source: 'ml_model',
      model_version: 'svr-pipeline-sklearn-1.8.0',
      created_at: ts,
    });
    readings.push({
      id: ++readingId,
      plant_id: 'TEJAS001',
      timestamp: ts,
      ambient_temperature: Number((24 + 9 * factor).toFixed(1)),
      module_temperature: Number((27 + 22 * factor).toFixed(1)),
      irradiation: Number((0.85 * factor).toFixed(3)),
      actual_power_kw: p1Act,
      source: 'scada',
      created_at: ts,
    });

    // TEJAS002 (Warning — under-generation on most recent readings)
    const p2Pred = Number((6400 * factor).toFixed(1));
    const underRatio = hAgo <= 2 ? 0.42 : 0.92;
    const p2Act = Number((p2Pred * underRatio).toFixed(1));
    forecasts.push({
      id: ++forecastId,
      plant_id: 'TEJAS002',
      forecast_timestamp: ts,
      predicted_power_kw: p2Pred,
      source: 'ml_model',
      model_version: 'svr-pipeline-sklearn-1.8.0',
      created_at: ts,
    });
    readings.push({
      id: ++readingId,
      plant_id: 'TEJAS002',
      timestamp: ts,
      ambient_temperature: Number((25 + 9 * factor).toFixed(1)),
      module_temperature: Number((28 + 23 * factor).toFixed(1)),
      irradiation: Number((0.82 * factor).toFixed(3)),
      actual_power_kw: p2Act,
      source: 'inverter',
      created_at: ts,
    });
  }

  // TEJAS003 (Idle — latest reading is 0 kW at low irradiation)
  const latestTs = hoursAgoIso(0.5);
  forecasts.push({
    id: ++forecastId,
    plant_id: 'TEJAS003',
    forecast_timestamp: latestTs,
    predicted_power_kw: 42.0,
    source: 'ml_model',
    model_version: 'svr-pipeline-sklearn-1.8.0',
    created_at: latestTs,
  });
  readings.push({
    id: ++readingId,
    plant_id: 'TEJAS003',
    timestamp: latestTs,
    ambient_temperature: 23.5,
    module_temperature: 23.1,
    irradiation: 0.02,
    actual_power_kw: 0.0,
    source: 'meter',
    created_at: latestTs,
  });

  // Sort newest first, matching backend ORDER BY timestamp DESC
  forecasts.sort((a, b) => new Date(b.forecast_timestamp) - new Date(a.forecast_timestamp));
  readings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return { forecasts, readings };
}

const { forecasts: FIXTURE_FORECASTS, readings: FIXTURE_READINGS } = buildTimeSeriesFixtures();

export { FIXTURE_FORECASTS, FIXTURE_READINGS };

export const FIXTURE_ALERTS = [
  {
    id: 14,
    plant_id: 'TEJAS002',
    forecast_id: FIXTURE_FORECASTS.find((f) => f.plant_id === 'TEJAS002')?.id ?? null,
    reading_id: FIXTURE_READINGS.find((r) => r.plant_id === 'TEJAS002')?.id ?? null,
    predicted_power_kw: 5420.0,
    actual_power_kw: 2276.4,
    residual_kw: -3143.6,
    deviation_percent: 58.0,
    severity: 'high',
    status: 'open',
    message: 'Actual power (2276.40 kW) dropped below 50% of predicted (5420.00 kW).',
    triggered_at: hoursAgoIso(0.4),
    resolved_at: null,
    created_at: hoursAgoIso(0.4),
  },
  {
    id: 13,
    plant_id: 'TEJAS002',
    forecast_id: null,
    reading_id: null,
    predicted_power_kw: 5910.0,
    actual_power_kw: 4140.0,
    residual_kw: -1770.0,
    deviation_percent: 29.95,
    severity: 'medium',
    status: 'acknowledged',
    message: 'String inverter variance acknowledged by operator for inspection.',
    triggered_at: hoursAgoIso(3.2),
    resolved_at: null,
    created_at: hoursAgoIso(3.2),
  },
  {
    id: 12,
    plant_id: 'TEJAS001',
    forecast_id: null,
    reading_id: null,
    predicted_power_kw: 5100.0,
    actual_power_kw: 4980.0,
    residual_kw: -120.0,
    deviation_percent: 2.35,
    severity: 'low',
    status: 'resolved',
    message: 'Morning irradiance ramp telemetry restored to normal operating range.',
    triggered_at: hoursAgoIso(18),
    resolved_at: hoursAgoIso(16.5),
    created_at: hoursAgoIso(18),
  },
];

export const FIXTURE_COMPARE = {
  plant_id: 'TEJAS002',
  plant_name: 'Kurnool East Array',
  forecast_id: FIXTURE_ALERTS[0].forecast_id || 102,
  forecast_timestamp: hoursAgoIso(0.5),
  predicted_power_kw: 5420.0,
  reading_id: FIXTURE_ALERTS[0].reading_id || 202,
  reading_timestamp: hoursAgoIso(0.4),
  actual_power_kw: 2276.4,
  irradiation: 0.745,
  residual_kw: -3143.6,
  deviation_kw: 3143.6,
  deviation_percent: 58.0,
  daytime: true,
  threshold_kw: 985.4,
  deviation_detected: true,
  severity: 'high',
  reason: 'Actual power (2276.40 kW) dropped below 50% of predicted (5420.00 kW).',
  alert_generated: false,
  alert: FIXTURE_ALERTS[0],
};
