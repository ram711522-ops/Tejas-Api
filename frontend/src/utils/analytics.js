/**
 * Client-side telemetry & accuracy computation helpers.
 * Used because the TEJAS backend exposes raw CRUD lists rather than
 * server-side aggregation endpoints.
 */

export function sumFleetCapacityMw(plants = []) {
  return plants.reduce((sum, plant) => sum + (Number(plant.installed_capacity_mw) || 0), 0);
}

/**
 * Aligns forecasts and readings for the same plant within a tolerance window (default 30 min).
 * Returns paired rows sorted chronologically ascending for charting & metric calculation.
 */
export function alignForecastsAndReadings(forecasts = [], readings = [], toleranceMinutes = 30) {
  const toleranceMs = toleranceMinutes * 60 * 1000;
  const sortedReadings = [...readings]
    .map((r) => ({ ...r, _ts: new Date(r.timestamp).getTime() }))
    .filter((r) => Number.isFinite(r._ts))
    .sort((a, b) => a._ts - b._ts);

  const sortedForecasts = [...forecasts]
    .map((f) => ({ ...f, _ts: new Date(f.forecast_timestamp).getTime() }))
    .filter((f) => Number.isFinite(f._ts))
    .sort((a, b) => a._ts - b._ts);

  const pairs = [];
  const usedReadingIds = new Set();

  for (const forecast of sortedForecasts) {
    let bestReading = null;
    let bestDiff = Infinity;

    for (const reading of sortedReadings) {
      if (reading.plant_id !== forecast.plant_id) continue;
      if (usedReadingIds.has(reading.id)) continue;
      const diff = Math.abs(reading._ts - forecast._ts);
      if (diff <= toleranceMs && diff < bestDiff) {
        bestDiff = diff;
        bestReading = reading;
      }
    }

    if (bestReading) {
      usedReadingIds.add(bestReading.id);
      const predicted = Number(forecast.predicted_power_kw);
      const actual = Number(bestReading.actual_power_kw);
      const residual = actual - predicted;
      pairs.push({
        timestamp: forecast.forecast_timestamp,
        timestampMs: forecast._ts,
        plant_id: forecast.plant_id,
        forecast_id: forecast.id,
        reading_id: bestReading.id,
        predicted_power_kw: predicted,
        actual_power_kw: actual,
        residual_kw: Number(residual.toFixed(2)),
        abs_error_kw: Number(Math.abs(residual).toFixed(2)),
        irradiation: Number(bestReading.irradiation),
        time_gap_minutes: Math.round(bestDiff / 60000),
      });
    }
  }

  return pairs;
}

export function computeAccuracyMetrics(pairs = [], { daytimeOnly = false, daytimeThreshold = 0.05 } = {}) {
  const filtered = daytimeOnly
    ? pairs.filter((p) => Number(p.irradiation) > daytimeThreshold)
    : pairs;

  if (filtered.length === 0) {
    return {
      count: 0,
      maeKw: null,
      rmseKw: null,
      mapePercent: null,
      meanBiasKw: null,
    };
  }

  let sumAbs = 0;
  let sumSq = 0;
  let sumBias = 0;
  let apeSum = 0;
  let apeCount = 0;

  for (const pair of filtered) {
    const err = pair.actual_power_kw - pair.predicted_power_kw;
    const absErr = Math.abs(err);
    sumAbs += absErr;
    sumSq += err * err;
    sumBias += err;
    if (pair.actual_power_kw > 0) {
      apeSum += (absErr / pair.actual_power_kw) * 100;
      apeCount += 1;
    }
  }

  return {
    count: filtered.length,
    maeKw: Number((sumAbs / filtered.length).toFixed(2)),
    rmseKw: Number(Math.sqrt(sumSq / filtered.length).toFixed(2)),
    mapePercent: apeCount > 0 ? Number((apeSum / apeCount).toFixed(2)) : null,
    meanBiasKw: Number((sumBias / filtered.length).toFixed(2)),
  };
}

export function matchesTimeOfDayWindow(isoTimestamp, windowKey = 'all') {
  if (!windowKey || windowKey === 'all') return true;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return false;
  const hour = date.getHours();
  switch (windowKey) {
    case 'morning':
      return hour >= 5 && hour < 11;
    case 'solar_peak':
      return hour >= 11 && hour < 15;
    case 'afternoon':
      return hour >= 15 && hour < 19;
    default:
      return true;
  }
}

export function computeGenerationSummary(readings = []) {
  if (!Array.isArray(readings) || readings.length === 0) {
    return {
      count: 0,
      totalSampledKw: null,
      averageKw: null,
      maxKw: null,
      minKw: null,
    };
  }

  let total = 0;
  let maxKw = -Infinity;
  let minKw = Infinity;
  let validCount = 0;

  for (const r of readings) {
    const val = Number(r?.actual_power_kw);
    if (!Number.isFinite(val)) continue;
    total += val;
    if (val > maxKw) maxKw = val;
    if (val < minKw) minKw = val;
    validCount += 1;
  }

  if (validCount === 0) {
    return {
      count: 0,
      totalSampledKw: null,
      averageKw: null,
      maxKw: null,
      minKw: null,
    };
  }

  return {
    count: validCount,
    totalSampledKw: Number(total.toFixed(1)),
    averageKw: Number((total / validCount).toFixed(1)),
    maxKw: Number(maxKw.toFixed(1)),
    minKw: Number(minKw.toFixed(1)),
  };
}

export function buildPlantComparisonData(
  plants = [],
  readings = [],
  forecasts = [],
  alerts = []
) {
  return plants.map((plant) => {
    const pid = plant.plant_id;
    const pReadings = readings.filter((r) => r.plant_id === pid);
    const pForecasts = forecasts.filter((f) => f.plant_id === pid);
    const pAlerts = alerts.filter((a) => a.plant_id === pid);

    const avgActual =
      pReadings.length > 0
        ? Number(
            (
              pReadings.reduce((acc, r) => acc + (Number(r.actual_power_kw) || 0), 0) /
              pReadings.length
            ).toFixed(1)
          )
        : 0;

    const peakActual =
      pReadings.length > 0
        ? Number(
            Math.max(...pReadings.map((r) => Number(r.actual_power_kw) || 0)).toFixed(1)
          )
        : 0;

    const avgPredicted =
      pForecasts.length > 0
        ? Number(
            (
              pForecasts.reduce((acc, f) => acc + (Number(f.predicted_power_kw) || 0), 0) /
              pForecasts.length
            ).toFixed(1)
          )
        : 0;

    return {
      plant_id: pid,
      plant_name: plant.plant_name,
      capacity_kw: Math.round((Number(plant.installed_capacity_mw) || 0) * 1000),
      avg_actual_kw: avgActual,
      peak_actual_kw: peakActual,
      avg_predicted_kw: avgPredicted,
      reading_count: pReadings.length,
      forecast_count: pForecasts.length,
      alert_count: pAlerts.length,
    };
  });
}

export function buildDeviationBreakdown(alerts = [], plants = []) {
  const severityCounts = { high: 0, medium: 0, low: 0 };
  let openCount = 0;

  const byPlantMap = new Map();
  for (const plant of plants) {
    byPlantMap.set(plant.plant_id, {
      plant_id: plant.plant_id,
      total: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  }

  for (const alert of alerts) {
    const sev = String(alert?.severity || 'medium').toLowerCase();
    if (sev === 'high' || sev === 'medium' || sev === 'low') {
      severityCounts[sev] += 1;
    }
    if (alert?.status === 'open' || alert?.status === 'acknowledged') {
      openCount += 1;
    }
    const pid = alert?.plant_id;
    if (pid) {
      const entry = byPlantMap.get(pid) || {
        plant_id: pid,
        total: 0,
        high: 0,
        medium: 0,
        low: 0,
      };
      entry.total += 1;
      if (sev === 'high' || sev === 'medium' || sev === 'low') {
        entry[sev] += 1;
      }
      byPlantMap.set(pid, entry);
    }
  }

  return {
    total: alerts.length,
    openCount,
    severityCounts,
    byPlant: Array.from(byPlantMap.values()),
  };
}
