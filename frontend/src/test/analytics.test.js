import { describe, expect, it } from 'vitest';
import {
  alignForecastsAndReadings,
  buildDeviationBreakdown,
  buildPlantComparisonData,
  computeAccuracyMetrics,
  computeGenerationSummary,
  matchesTimeOfDayWindow,
  sumFleetCapacityMw,
} from '../utils/analytics';

describe('analytics helpers', () => {
  it('sums fleet capacity MW safely', () => {
    expect(sumFleetCapacityMw([{ installed_capacity_mw: 5.5 }, { installed_capacity_mw: 2.5 }])).toBe(8);
  });

  it('aligns forecasts and readings by plant_id within tolerance and computes metrics', () => {
    const forecasts = [
      { id: 1, plant_id: 'P1', forecast_timestamp: '2026-11-26T12:00:00Z', predicted_power_kw: 1000 },
      { id: 2, plant_id: 'P1', forecast_timestamp: '2026-11-26T22:00:00Z', predicted_power_kw: 0 },
    ];
    const readings = [
      { id: 10, plant_id: 'P1', timestamp: '2026-11-26T12:10:00Z', actual_power_kw: 800, irradiation: 0.7 },
      { id: 11, plant_id: 'P1', timestamp: '2026-11-26T22:05:00Z', actual_power_kw: 0, irradiation: 0.01 },
    ];

    const pairs = alignForecastsAndReadings(forecasts, readings, 30);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].residual_kw).toBe(-200);
    expect(pairs[0].time_gap_minutes).toBe(10);

    const daytime = computeAccuracyMetrics(pairs, { daytimeOnly: true });
    expect(daytime.count).toBe(1);
    expect(daytime.maeKw).toBe(200);
    expect(daytime.rmseKw).toBe(200);
    expect(daytime.mapePercent).toBe(25);
  });

  it('computes generation summary, plant comparison, deviation breakdown, and time-of-day filter cleanly', () => {
    expect(computeGenerationSummary([])).toEqual({
      count: 0,
      totalSampledKw: null,
      averageKw: null,
      maxKw: null,
      minKw: null,
    });

    const plants = [{ plant_id: 'P1', plant_name: 'Alpha', installed_capacity_mw: 5 }];
    const readings = [
      { id: 1, plant_id: 'P1', actual_power_kw: 1000, timestamp: '2026-11-26T08:00:00' },
      { id: 2, plant_id: 'P1', actual_power_kw: 3000, timestamp: '2026-11-26T12:00:00' },
    ];
    const forecasts = [
      { id: 3, plant_id: 'P1', predicted_power_kw: 2500, forecast_timestamp: '2026-11-26T12:00:00' },
    ];
    const alerts = [
      { id: 4, plant_id: 'P1', severity: 'high', status: 'open' },
      { id: 5, plant_id: 'P1', severity: 'medium', status: 'resolved' },
    ];

    const summary = computeGenerationSummary(readings);
    expect(summary).toEqual({
      count: 2,
      totalSampledKw: 4000,
      averageKw: 2000,
      maxKw: 3000,
      minKw: 1000,
    });

    const plantComp = buildPlantComparisonData(plants, readings, forecasts, alerts);
    expect(plantComp[0]).toMatchObject({
      plant_id: 'P1',
      avg_actual_kw: 2000,
      peak_actual_kw: 3000,
      avg_predicted_kw: 2500,
      alert_count: 2,
    });

    const devs = buildDeviationBreakdown(alerts, plants);
    expect(devs.total).toBe(2);
    expect(devs.openCount).toBe(1);
    expect(devs.severityCounts).toEqual({ high: 1, medium: 1, low: 0 });

    expect(matchesTimeOfDayWindow(readings[0].timestamp, 'morning')).toBe(true);
    expect(matchesTimeOfDayWindow(readings[0].timestamp, 'solar_peak')).toBe(false);
    expect(matchesTimeOfDayWindow(readings[1].timestamp, 'solar_peak')).toBe(true);
  });
});
