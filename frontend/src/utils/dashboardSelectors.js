import { alignForecastsAndReadings, computeAccuracyMetrics, sumFleetCapacityMw } from './analytics';

/**
 * Determines a plant's operational status strictly from available reading and alert data.
 * Never marks a plant as Producing/online without a corresponding reading.
 */
export function derivePlantStatus(plant, latestReading, plantAlerts = []) {
  const hasActiveAlert = plantAlerts.some(
    (a) => a.status === 'open' || a.status === 'acknowledged'
  );

  if (!latestReading) {
    return {
      status: hasActiveAlert ? 'Warning' : 'Offline',
      currentPowerKw: null,
      reason: hasActiveAlert
        ? 'Active alert without recent SCADA/meter reading'
        : 'No readings available in selected window',
    };
  }

  const power = Number(latestReading.actual_power_kw);
  if (hasActiveAlert) {
    return {
      status: 'Warning',
      currentPowerKw: power,
      reason: 'Open or acknowledged deviation alert active',
    };
  }

  if (power > 0) {
    return {
      status: 'Producing',
      currentPowerKw: power,
      reason: 'Active solar generation reported by latest reading',
    };
  }

  return {
    status: 'Idle',
    currentPowerKw: power,
    reason: 'Zero generation reported (nighttime or low irradiance)',
  };
}

function getLatestByPlant(items = [], timestampKey) {
  const map = new Map();
  for (const item of items) {
    const existing = map.get(item.plant_id);
    if (!existing) {
      map.set(item.plant_id, item);
      continue;
    }
    if (new Date(item[timestampKey]).getTime() > new Date(existing[timestampKey]).getTime()) {
      map.set(item.plant_id, item);
    }
  }
  return map;
}

export function filterRecordsByWindow(records = [], timestampKey, dateWindow = '7d') {
  const now = Date.now();
  const hoursMap = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };
  const hours = hoursMap[dateWindow] || 24 * 7;
  const cutoff = now - hours * 3600 * 1000;
  return records.filter((item) => new Date(item[timestampKey]).getTime() >= cutoff);
}

/**
 * Aggregates predicted and actual generation into chronological hourly buckets for Recharts.
 */
export function buildFleetGenerationSeries(forecasts = [], readings = [], dateWindow = '7d') {
  const scopedForecasts = filterRecordsByWindow(forecasts, 'forecast_timestamp', dateWindow);
  const scopedReadings = filterRecordsByWindow(readings, 'timestamp', dateWindow);
  const buckets = new Map();

  const bucketKeyFor = (iso) => {
    const d = new Date(iso);
    d.setMinutes(0, 0, 0);
    return d.getTime();
  };

  for (const f of scopedForecasts) {
    const key = bucketKeyFor(f.forecast_timestamp);
    if (!buckets.has(key)) {
      buckets.set(key, {
        timestampMs: key,
        timestamp: new Date(key).toISOString(),
        predicted_power_kw: 0,
        actual_power_kw: 0,
        hasPredicted: false,
        hasActual: false,
        irrSum: 0,
        irrCount: 0,
      });
    }
    const b = buckets.get(key);
    b.predicted_power_kw += Number(f.predicted_power_kw) || 0;
    b.hasPredicted = true;
  }

  for (const r of scopedReadings) {
    const key = bucketKeyFor(r.timestamp);
    if (!buckets.has(key)) {
      buckets.set(key, {
        timestampMs: key,
        timestamp: new Date(key).toISOString(),
        predicted_power_kw: 0,
        actual_power_kw: 0,
        hasPredicted: false,
        hasActual: false,
        irrSum: 0,
        irrCount: 0,
      });
    }
    const b = buckets.get(key);
    b.actual_power_kw += Number(r.actual_power_kw) || 0;
    b.hasActual = true;
    if (Number.isFinite(Number(r.irradiation))) {
      b.irrSum += Number(r.irradiation);
      b.irrCount += 1;
    }
  }

  const formatLabel = (iso) => {
    const d = new Date(iso);
    if (dateWindow === '24h') {
      return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
    }
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
    }).format(d);
  };

  return [...buckets.values()]
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((b) => ({
      timestamp: b.timestamp,
      label: formatLabel(b.timestamp),
      predicted_power_kw: b.hasPredicted ? Number(b.predicted_power_kw.toFixed(1)) : null,
      actual_power_kw: b.hasActual ? Number(b.actual_power_kw.toFixed(1)) : null,
      irradiation: b.irrCount > 0 ? Number((b.irrSum / b.irrCount).toFixed(3)) : null,
    }));
}

export function deriveDashboardSummary({
  plants = [],
  forecasts = [],
  readings = [],
  alerts = [],
  dateWindow = '7d',
}) {
  const totalCapacityMw = sumFleetCapacityMw(plants);
  const totalCapacityKw = Number((totalCapacityMw * 1000).toFixed(1));

  const latestReadingByPlant = getLatestByPlant(readings, 'timestamp');
  const latestForecastByPlant = getLatestByPlant(forecasts, 'forecast_timestamp');

  let currentGenerationKw = null;
  if (latestReadingByPlant.size > 0) {
    currentGenerationKw = Number(
      [...latestReadingByPlant.values()]
        .reduce((sum, r) => sum + (Number(r.actual_power_kw) || 0), 0)
        .toFixed(1)
    );
  }

  let predictedGenerationKw = null;
  if (latestForecastByPlant.size > 0) {
    predictedGenerationKw = Number(
      [...latestForecastByPlant.values()]
        .reduce((sum, f) => sum + (Number(f.predicted_power_kw) || 0), 0)
        .toFixed(1)
    );
  }

  const scopedForecasts = filterRecordsByWindow(forecasts, 'forecast_timestamp', dateWindow);
  const scopedReadings = filterRecordsByWindow(readings, 'timestamp', dateWindow);
  const pairs = alignForecastsAndReadings(scopedForecasts, scopedReadings, 30);
  const accuracy = computeAccuracyMetrics(pairs, { daytimeOnly: true });

  const openAlerts = alerts.filter((a) => a.status === 'open');
  const activeAlerts = alerts.filter((a) => a.status === 'open' || a.status === 'acknowledged');
  const highSeverityActive = activeAlerts.filter((a) => a.severity === 'high').length;

  const plantCards = plants.map((plant) => {
    const latestReading = latestReadingByPlant.get(plant.plant_id) || null;
    const plantAlerts = alerts.filter((a) => a.plant_id === plant.plant_id);
    const derived = derivePlantStatus(plant, latestReading, plantAlerts);
    return {
      plant,
      latestReading,
      ...derived,
    };
  });

  const generationSeries = buildFleetGenerationSeries(forecasts, readings, dateWindow);

  const netResidualKw =
    currentGenerationKw !== null && predictedGenerationKw !== null
      ? Number((currentGenerationKw - predictedGenerationKw).toFixed(1))
      : null;

  const deviationPercent =
    currentGenerationKw !== null && predictedGenerationKw !== null && predictedGenerationKw > 0
      ? Number(((Math.abs(currentGenerationKw - predictedGenerationKw) / predictedGenerationKw) * 100).toFixed(1))
      : null;

  return {
    totalCapacityMw: Number(totalCapacityMw.toFixed(2)),
    totalCapacityKw,
    currentGenerationKw,
    predictedGenerationKw,
    netResidualKw,
    deviationPercent,
    reportingPlantsCount: latestReadingByPlant.size,
    forecastPlantsCount: latestForecastByPlant.size,
    openAlertsCount: openAlerts.length,
    activeAlertsCount: activeAlerts.length,
    highSeverityActive,
    accuracy,
    plantCards,
    generationSeries,
  };
}

/**
 * Builds a chronological system activity timeline strictly from existing
 * backend timestamps (Forecast.created_at, Reading.created_at, Alert.triggered_at / resolved_at).
 */
export function buildActivityEvents(forecasts = [], readings = [], alerts = [], limit = 6) {
  const events = [];

  for (const alert of alerts) {
    events.push({
      id: `alert-trig-${alert.id}`,
      type: 'alert',
      severity: alert.severity,
      title: `${alert.severity.toUpperCase()} deviation alert on ${alert.plant_id}`,
      detail: alert.message,
      timestamp: alert.triggered_at,
    });
    if (alert.resolved_at) {
      events.push({
        id: `alert-res-${alert.id}`,
        type: 'resolved',
        title: `Alert #${alert.id} resolved (${alert.plant_id})`,
        detail: `Status updated to resolved`,
        timestamp: alert.resolved_at,
      });
    }
  }

  for (const forecast of forecasts.slice(0, 4)) {
    events.push({
      id: `forecast-${forecast.id}`,
      type: 'forecast',
      title: `Forecast saved for ${forecast.plant_id}`,
      detail: `${Number(forecast.predicted_power_kw).toFixed(1)} kW (${forecast.source})`,
      timestamp: forecast.created_at || forecast.forecast_timestamp,
    });
  }

  for (const reading of readings.slice(0, 4)) {
    events.push({
      id: `reading-${reading.id}`,
      type: 'reading',
      title: `Actual reading logged for ${reading.plant_id}`,
      detail: `${Number(reading.actual_power_kw).toFixed(1)} kW via ${reading.source}`,
      timestamp: reading.created_at || reading.timestamp,
    });
  }

  return events
    .filter((e) => e.timestamp && Number.isFinite(new Date(e.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
