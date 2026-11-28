import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Compass,
  Flame,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { listAlerts } from '../api/alertsApi';
import { previewComparison, runComparison } from '../api/deviationsApi';
import { fetchAllForecastsInRange } from '../api/forecastsApi';
import { listPlants } from '../api/plantsApi';
import { fetchAllReadingsInRange } from '../api/readingsApi';
import { ChartCard } from '../components/charts/ChartCard';
import { StatCard } from '../components/data-display/StatCard';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { ErrorState } from '../components/feedback/ErrorState';
import { PageHeader } from '../components/layout/PageHeader';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import {
  alignForecastsAndReadings,
  buildDeviationBreakdown,
  buildPlantComparisonData,
  computeAccuracyMetrics,
  computeGenerationSummary,
  matchesTimeOfDayWindow,
} from '../utils/analytics';
import { formatTimestamp, getPresetDateRange, toUtcIso } from '../utils/date';
import styles from './AnalyticsPage.module.css';

const WEATHER_AXES = {
  irradiation: { label: 'Irradiation', unit: ' kW/m²' },
  ambient_temperature: { label: 'Ambient Temp', unit: ' °C' },
  module_temperature: { label: 'Module Temp', unit: ' °C' },
};

function PairTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-strong)',
        borderLeft: '3px solid var(--color-accent)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        fontSize: 12,
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {formatTimestamp(pt.timestamp)} · {pt.plant_id}
      </div>
      {pt.actual_power_kw !== undefined ? (
        <div className="mono" style={{ color: 'var(--color-accent)', marginTop: 4 }}>
          Actual: {Number(pt.actual_power_kw).toLocaleString()} kW
        </div>
      ) : null}
      {pt.predicted_power_kw !== undefined ? (
        <div className="mono" style={{ color: 'var(--color-predicted)', marginTop: 2 }}>
          Predicted: {Number(pt.predicted_power_kw).toLocaleString()} kW
        </div>
      ) : null}
      {pt.residual_kw !== undefined ? (
        <div className="mono" style={{ color: 'var(--text-primary)', marginTop: 2 }}>
          Residual: {pt.residual_kw >= 0 ? '+' : ''}
          {pt.residual_kw} kW
        </div>
      ) : null}
      {pt.irradiation !== undefined ? (
        <div className="mono" style={{ color: 'var(--color-teal)', marginTop: 2 }}>
          Irradiation: {Number(pt.irradiation).toFixed(2)} kW/m²
        </div>
      ) : null}
    </div>
  );
}

function PlantCompTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-strong)',
        borderLeft: '3px solid var(--color-predicted)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
        {pt.plant_name} ({pt.plant_id})
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 4 }}>
        Avg Actual: {pt.avg_actual_kw} kW • Peak: {pt.peak_actual_kw} kW
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--color-predicted)', marginTop: 2 }}>
        Avg Forecast: {pt.avg_predicted_kw} kW • Cap: {pt.capacity_kw.toLocaleString()} kW
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
        Samples: {pt.reading_count} readings, {pt.forecast_count} forecasts, {pt.alert_count} alerts
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const { settings } = useSettings();
  const { addToast } = useToast();

  const [plants, setPlants] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [plantFilter, setPlantFilter] = useState('all');
  const [dateWindow, setDateWindow] = useState(settings.defaultDateWindow || '7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('all');
  const [daytimeOnly, setDaytimeOnly] = useState(true);

  // Chart toggles
  const [heroMode, setHeroMode] = useState('overlay');
  const [weatherMetric, setWeatherMetric] = useState('irradiation');

  // /compare runner state
  const [comparePlantId, setComparePlantId] = useState('');
  const [createAlertOnCompare, setCreateAlertOnCompare] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);

  const loadData = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        let range;
        if (dateWindow === 'custom' && customStart && customEnd) {
          range = {
            start_date: toUtcIso(new Date(customStart)),
            end_date: toUtcIso(new Date(customEnd)),
          };
        } else {
          range = getPresetDateRange(dateWindow === 'custom' ? '7d' : dateWindow);
        }

        const plantParam = plantFilter === 'all' ? undefined : plantFilter;
        const [plantList, fcList, rdList, alertList] = await Promise.all([
          listPlants(undefined, { force }),
          fetchAllForecastsInRange({ plant_id: plantParam, ...range }, undefined, { force }),
          fetchAllReadingsInRange({ plant_id: plantParam, ...range }, undefined, { force }),
          listAlerts({ plant_id: plantParam, limit: 200 }, undefined, { force }).catch(() => []),
        ]);

        setPlants(plantList);
        setForecasts(fcList);
        setReadings(rdList);
        setAlerts(alertList);
        setComparePlantId((prev) => {
          if (plantFilter !== 'all') return plantFilter;
          if (prev && plantList.some((p) => p.plant_id === prev)) return prev;
          return plantList[0]?.plant_id || '';
        });
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [plantFilter, dateWindow, customStart, customEnd]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Apply time-of-day filter cleanly across readings, forecasts, and alerts
  const filteredReadings = useMemo(() => {
    return readings.filter((r) => {
      if (!matchesTimeOfDayWindow(r.timestamp, timeOfDay)) return false;
      if (daytimeOnly && Number(r.irradiation) <= 0.05) return false;
      return true;
    });
  }, [readings, timeOfDay, daytimeOnly]);

  const filteredForecasts = useMemo(() => {
    return forecasts.filter((f) => matchesTimeOfDayWindow(f.forecast_timestamp, timeOfDay));
  }, [forecasts, timeOfDay]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => matchesTimeOfDayWindow(a.triggered_at, timeOfDay));
  }, [alerts, timeOfDay]);

  const pairs = useMemo(() => {
    const raw = alignForecastsAndReadings(filteredForecasts, filteredReadings, 30);
    return raw.map((p) => ({
      ...p,
      label: new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(p.timestamp)),
    }));
  }, [filteredForecasts, filteredReadings]);

  const generationTrendSeries = useMemo(() => {
    return [...filteredReadings]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((r) => ({
        ...r,
        label: new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(r.timestamp)),
      }));
  }, [filteredReadings]);

  const genSummary = useMemo(
    () => computeGenerationSummary(filteredReadings),
    [filteredReadings]
  );

  const accuracy = useMemo(
    () => computeAccuracyMetrics(pairs, { daytimeOnly: false }),
    [pairs]
  );

  const plantComparisonData = useMemo(
    () =>
      buildPlantComparisonData(
        plantFilter === 'all' ? plants : plants.filter((p) => p.plant_id === plantFilter),
        filteredReadings,
        filteredForecasts,
        filteredAlerts
      ),
    [plants, plantFilter, filteredReadings, filteredForecasts, filteredAlerts]
  );

  const deviationBreakdown = useMemo(
    () =>
      buildDeviationBreakdown(
        filteredAlerts,
        plantFilter === 'all' ? plants : plants.filter((p) => p.plant_id === plantFilter)
      ),
    [filteredAlerts, plants, plantFilter]
  );

  const handleRunCompare = async (persist) => {
    if (!comparePlantId) return;
    setCompareLoading(true);
    try {
      const res = persist
        ? await runComparison(comparePlantId, { create_alert: createAlertOnCompare })
        : await previewComparison(comparePlantId);
      setCompareResult(res);
      addToast({
        tone: res.deviation_detected ? 'warning' : 'success',
        title: persist ? 'Deviation Check Executed' : 'Comparison Preview Complete',
        message: `${comparePlantId}: ${res.deviation_percent}% deviation (${
          res.severity || 'nominal'
        })`,
      });
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Comparison Failed',
        message: err?.message || 'Unable to execute forecast vs reading comparison.',
      });
    } finally {
      setCompareLoading(false);
    }
  };

  const weatherMeta = WEATHER_AXES[weatherMetric];
  const activeHeroMode =
    heroMode === 'overlay' && pairs.length === 0 && generationTrendSeries.length > 0
      ? 'trend'
      : heroMode;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="SECTOR 05 · SOLAR INTELLIGENCE & DIAGNOSTICS"
        title="Accuracy & Deviation Analytics"
        subtitle="Analyze solar generation trends, plant benchmarks, weather-power response, forecast alignment (MAE/RMSE/MAPE), and deviation patterns."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadData(true)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh Diagnostics</span>
          </button>
        }
      />

      {/* Unified Plant, Date Range & Time-of-Day Filters */}
      <section className={styles.toolbar} aria-label="Analytics filters">
        <div className={styles.toolbarTop}>
          <div className={styles.filtersLeft}>
            <select
              className={`select-field ${styles.filterSelect}`}
              aria-label="Filter analytics by plant"
              value={plantFilter}
              onChange={(e) => setPlantFilter(e.target.value)}
            >
              <option value="all">All Fleet Plants</option>
              {plants.map((p) => (
                <option key={p.plant_id} value={p.plant_id}>
                  {p.plant_id}
                </option>
              ))}
            </select>

            <select
              className={`select-field ${styles.filterSelect}`}
              aria-label="Analytics date window"
              value={dateWindow}
              onChange={(e) => setDateWindow(e.target.value)}
            >
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
              <option value="custom">Custom Range</option>
            </select>

            <select
              className={`select-field ${styles.filterSelect}`}
              aria-label="Filter by time of day"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
            >
              <option value="all">All Hours (00–24h)</option>
              <option value="morning">Morning (05–11h)</option>
              <option value="solar_peak">Peak Solar (11–15h)</option>
              <option value="afternoon">Afternoon (15–19h)</option>
            </select>

            <label className={styles.daytimeToggle}>
              <input
                type="checkbox"
                checked={daytimeOnly}
                onChange={(e) => setDaytimeOnly(e.target.checked)}
              />
              <span>Daytime Irradiation Only (&gt; 0.05 kW/m²)</span>
            </label>
          </div>

          <span className="mono" style={{ fontSize: 11, color: 'var(--color-accent)' }}>
            {genSummary.count} readings • {accuracy.count} matched pair
            {accuracy.count === 1 ? '' : 's'}
          </span>
        </div>

        {dateWindow === 'custom' ? (
          <div className={styles.customRangeRow}>
            <div className={styles.ctrlGroup}>
              <label htmlFor="an-start" className={styles.ctrlLabel}>
                Start Date / Time
              </label>
              <input
                id="an-start"
                type="datetime-local"
                className="input-field mono"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className={styles.ctrlGroup}>
              <label htmlFor="an-end" className={styles.ctrlLabel}>
                End Date / Time
              </label>
              <input
                id="an-end"
                type="datetime-local"
                className="input-field mono"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!customStart || !customEnd}
              onClick={() => loadData(true)}
            >
              Apply Range
            </button>
          </div>
        ) : null}
      </section>

      {error ? (
        <ErrorState
          title="Failed to load analytics dataset"
          error={error}
          onRetry={() => loadData(true)}
        />
      ) : (
        <>
          {/* Summary Rail 1: Solar Generation & Deviation Totals (Calculated strictly from real records) */}
          <section className="grid-kpis" aria-label="Generation and Deviation Summary">
            <StatCard
              label="Total Sampled Output"
              value={
                genSummary.totalSampledKw !== null
                  ? genSummary.totalSampledKw.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })
                  : '—'
              }
              unit={genSummary.totalSampledKw !== null ? 'kW' : undefined}
              subtext={`Sum across ${genSummary.count} filtered reading sample${
                genSummary.count === 1 ? '' : 's'
              }`}
              icon={Flame}
              tone="accent"
              highlight={genSummary.totalSampledKw !== null}
              loading={loading}
            />
            <StatCard
              label="Average Generation"
              value={
                genSummary.averageKw !== null
                  ? genSummary.averageKw.toLocaleString(undefined, { maximumFractionDigits: 1 })
                  : '—'
              }
              unit={genSummary.averageKw !== null ? 'kW' : undefined}
              subtext="Mean AC power per logged reading"
              icon={Activity}
              tone="info"
              loading={loading}
            />
            <StatCard
              label="Maximum Generation"
              value={
                genSummary.maxKw !== null
                  ? genSummary.maxKw.toLocaleString(undefined, { maximumFractionDigits: 1 })
                  : '—'
              }
              unit={genSummary.maxKw !== null ? 'kW' : undefined}
              subtext={
                genSummary.minKw !== null
                  ? `Min recorded: ${genSummary.minKw.toLocaleString()} kW`
                  : 'No readings in selection'
              }
              icon={TrendingUp}
              tone="success"
              loading={loading}
            />
            <StatCard
              label="Recorded Deviations"
              value={deviationBreakdown.total}
              trend={`${deviationBreakdown.openCount} active`}
              subtext={`${deviationBreakdown.severityCounts.high} high • ${deviationBreakdown.severityCounts.medium} medium severity`}
              icon={ShieldAlert}
              tone={deviationBreakdown.severityCounts.high > 0 ? 'danger' : 'warning'}
              loading={loading}
            />
          </section>

          {/* Summary Rail 2: Forecast Alignment Metrics */}
          <section className="grid-kpis" aria-label="Accuracy KPIs">
            <StatCard
              label="Mean Absolute Error"
              value={accuracy.maeKw !== null ? accuracy.maeKw : '—'}
              unit={accuracy.maeKw !== null ? 'kW' : undefined}
              subtext={`Over ${accuracy.count} matched pair${accuracy.count === 1 ? '' : 's'}`}
              icon={Activity}
              tone="accent"
              loading={loading}
            />
            <StatCard
              label="Root Mean Sq Error"
              value={accuracy.rmseKw !== null ? accuracy.rmseKw : '—'}
              unit={accuracy.rmseKw !== null ? 'kW' : undefined}
              subtext="Penalizes large error spikes"
              icon={BarChart3}
              tone="info"
              loading={loading}
            />
            <StatCard
              label="Mean Abs Pct Error"
              value={accuracy.mapePercent !== null ? accuracy.mapePercent : '—'}
              unit={accuracy.mapePercent !== null ? '%' : undefined}
              subtext="Relative error over non-zero readings"
              icon={Compass}
              tone={accuracy.mapePercent > 15 ? 'warning' : 'success'}
              loading={loading}
            />
            <StatCard
              label="Pred vs Actual Drift"
              value={
                accuracy.meanBiasKw !== null
                  ? `${accuracy.meanBiasKw >= 0 ? '+' : ''}${accuracy.meanBiasKw}`
                  : '—'
              }
              unit={accuracy.meanBiasKw !== null ? 'kW' : undefined}
              subtext="Mean signed difference (Actual − Pred)"
              icon={GitCompareArrows}
              tone="neutral"
              loading={loading}
            />
          </section>

          {/* Hero Time-Series Stage: Predicted vs Actual OR Generation Trend */}
          <ChartCard
            title={
              activeHeroMode === 'overlay'
                ? 'Predicted vs Actual Generation Trajectory'
                : 'Fleet Solar Generation Trend'
            }
            subtitle={
              activeHeroMode === 'overlay'
                ? 'Matched forecast and reading pairs within ±30 minute tolerance (kW)'
                : 'Chronological measured AC output across all filtered SCADA/inverter readings (kW)'
            }
            actions={
              <div className={styles.tabBar} role="tablist" aria-label="Primary analytics chart view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeHeroMode === 'overlay'}
                  className={`${styles.tabBtn} ${
                    activeHeroMode === 'overlay' ? styles.tabBtnActive : ''
                  }`}
                  onClick={() => setHeroMode('overlay')}
                >
                  Predicted vs Actual ({pairs.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeHeroMode === 'trend'}
                  className={`${styles.tabBtn} ${
                    activeHeroMode === 'trend' ? styles.tabBtnActive : ''
                  }`}
                  onClick={() => setHeroMode('trend')}
                >
                  Generation Trend ({generationTrendSeries.length})
                </button>
              </div>
            }
            loading={loading}
            isEmpty={
              activeHeroMode === 'overlay'
                ? pairs.length === 0
                : generationTrendSeries.length === 0
            }
            emptyTitle={
              activeHeroMode === 'overlay'
                ? 'No aligned forecast/reading pairs'
                : 'No reading telemetry in selected filters'
            }
            emptyDescription="Adjust plant, date window, or time-of-day filter above."
            height={285}
          >
            <div style={{ width: '100%', height: 285 }}>
              <ResponsiveContainer width="100%" height="100%">
                {activeHeroMode === 'overlay' ? (
                  <ComposedChart data={pairs} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-subtle)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={26}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`)}
                    />
                    <Tooltip content={<PairTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual_power_kw"
                      name="Actual Power (kW)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="rgba(245, 158, 11, 0.16)"
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted_power_kw"
                      name="Predicted Power (kW)"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  </ComposedChart>
                ) : (
                  <AreaChart
                    data={generationTrendSeries}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="anGenTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.34} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-subtle)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={26}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`)}
                    />
                    <Tooltip content={<PairTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual_power_kw"
                      name="Measured Generation (kW)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#anGenTrendFill)"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Row 2: Plant Comparison + Weather Relationship with Generation */}
          <div className={styles.splitCharts}>
            <ChartCard
              title="Plant Generation & Forecast Benchmark"
              subtitle="Per-plant mean & peak actual output compared against mean predicted output (kW)"
              loading={loading}
              isEmpty={plantComparisonData.length === 0}
              emptyTitle="No plants registered"
              height={265}
            >
              <div style={{ width: '100%', height: 265 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={plantComparisonData}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-subtle)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="plant_id"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`)}
                    />
                    <Tooltip content={<PlantCompTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                    />
                    <Bar dataKey="avg_actual_kw" name="Avg Actual (kW)" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    <Bar
                      dataKey="avg_predicted_kw"
                      name="Avg Predicted (kW)"
                      fill="#38bdf8"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar dataKey="peak_actual_kw" name="Peak Actual (kW)" fill="#34d399" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Weather Sensor vs Generation Relationship"
              subtitle={`Recorded ${weatherMeta.label.toLowerCase()} vs measured AC output (from /readings)`}
              actions={
                <div className={styles.tabBar} role="tablist" aria-label="Weather axis selector">
                  {Object.entries(WEATHER_AXES).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={weatherMetric === key}
                      className={`${styles.tabBtn} ${
                        weatherMetric === key ? styles.tabBtnActive : ''
                      }`}
                      onClick={() => setWeatherMetric(key)}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              }
              loading={loading}
              isEmpty={filteredReadings.length === 0}
              emptyTitle="No weather-linked readings in selection"
              height={265}
            >
              <div style={{ width: '100%', height: 265 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis
                      type="number"
                      dataKey={weatherMetric}
                      name={weatherMeta.label}
                      unit={weatherMeta.unit}
                      stroke="var(--text-muted)"
                      fontSize={10}
                    />
                    <YAxis
                      type="number"
                      dataKey="actual_power_kw"
                      name="Actual Power"
                      unit=" kW"
                      stroke="var(--text-muted)"
                      fontSize={10}
                    />
                    <ZAxis range={[40, 65]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12,
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                    />
                    <Scatter
                      name={`Power (kW) vs ${weatherMeta.label}`}
                      data={filteredReadings}
                      fill="#f59e0b"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Row 3: Residual Pattern Over Time + Alert Severity Patterns per Plant */}
          <div className={styles.splitCharts}>
            <ChartCard
              title="Residual Error Distribution (kW)"
              subtitle="Positive values show over-generation; negative show under-generation"
              loading={loading}
              isEmpty={pairs.length === 0}
              emptyTitle="No residual data"
              height={245}
            >
              <div style={{ width: '100%', height: 245 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pairs} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-subtle)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`
                      }
                    />
                    <ReferenceLine y={0} stroke="var(--border-strong)" />
                    <Tooltip content={<PairTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                    />
                    <Bar dataKey="residual_kw" name="Residual (Actual − Pred kW)" radius={[2, 2, 0, 0]}>
                      {pairs.map((entry) => (
                        <Cell
                          key={`${entry.forecast_id}-${entry.reading_id}`}
                          fill={entry.residual_kw >= 0 ? '#34d399' : '#f87171'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Deviation Patterns by Plant & Severity"
              subtitle="Alert distribution returned by GET /alerts grouped by plant and severity"
              loading={loading}
              isEmpty={deviationBreakdown.byPlant.length === 0 || deviationBreakdown.total === 0}
              emptyTitle="No deviation alerts in selected scope"
              emptyDescription="Zero alerts matched your current plant and time-of-day filter."
              height={245}
            >
              <div style={{ width: '100%', height: 245 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={deviationBreakdown.byPlant}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-subtle)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="plant_id"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      unit=" alerts"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12,
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                    />
                    <Bar dataKey="high" stackId="sev" name="High Severity" fill="#f87171" />
                    <Bar dataKey="medium" stackId="sev" name="Medium Severity" fill="#fbbf24" />
                    <Bar
                      dataKey="low"
                      stackId="sev"
                      name="Low Severity"
                      fill="#38bdf8"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Backend /compare Audit Runner */}
          <section className={styles.compareWorkbench} aria-label="Deviation Comparison Engine">
            <div className={styles.compareHeader}>
              <div>
                <span className="eyebrow">DEVIATION AUDIT ENGINE</span>
                <h2 className={styles.compareTitle}>Latest Forecast vs Reading Check (/compare)</h2>
                <p className={styles.compareSub}>
                  Preview or commit an official backend threshold audit on any registered plant
                </p>
              </div>

              <div className={styles.compareControls}>
                <select
                  className={`select-field ${styles.filterSelect}`}
                  aria-label="Select plant for deviation check"
                  value={comparePlantId}
                  onChange={(e) => setComparePlantId(e.target.value)}
                >
                  {plants.map((p) => (
                    <option key={p.plant_id} value={p.plant_id}>
                      {p.plant_id} — {p.plant_name}
                    </option>
                  ))}
                </select>

                <label className={styles.daytimeToggle}>
                  <input
                    type="checkbox"
                    checked={createAlertOnCompare}
                    onChange={(e) => setCreateAlertOnCompare(e.target.checked)}
                  />
                  <span>Create Alert on Flag</span>
                </label>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!comparePlantId || compareLoading}
                  onClick={() => handleRunCompare(false)}
                >
                  Preview Check
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!comparePlantId || compareLoading}
                  onClick={() => handleRunCompare(true)}
                >
                  {compareLoading ? (
                    <Loader2 size={13} className="spin" />
                  ) : (
                    <GitCompareArrows size={13} />
                  )}
                  <span>Run &amp; Audit</span>
                </button>
              </div>
            </div>

            {compareResult ? (
              <>
                <div className={styles.compareMetrics}>
                  <div className={styles.compareCell}>
                    <div className={styles.compareLabel}>Predicted Power</div>
                    <div className={styles.compareValue}>{compareResult.predicted_power_kw} kW</div>
                  </div>
                  <div className={styles.compareCell}>
                    <div className={styles.compareLabel}>Actual Power</div>
                    <div className={styles.compareValue}>{compareResult.actual_power_kw} kW</div>
                  </div>
                  <div className={styles.compareCell}>
                    <div className={styles.compareLabel}>Residual / Deviation</div>
                    <div className={styles.compareValue}>
                      {compareResult.residual_kw} kW ({compareResult.deviation_percent}%)
                    </div>
                  </div>
                  <div className={styles.compareCell}>
                    <div className={styles.compareLabel}>Status</div>
                    <div style={{ marginTop: 6 }}>
                      <StatusIndicator
                        tone={compareResult.deviation_detected ? 'danger' : 'success'}
                        label={
                          compareResult.deviation_detected
                            ? `FLAGGED (${compareResult.severity})`
                            : 'NOMINAL'
                        }
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
                  <span>{compareResult.reason}</span>
                </div>
              </>
            ) : null}
          </section>

          {/* Transparent Analytical Data Availability Scope */}
          <section className={styles.scopePanel} aria-label="Analytical data availability scope">
            <div>
              <div className={styles.scopeColTitle}>Computed From Real Backend Telemetry</div>
              <ul className={styles.scopeList}>
                <li>
                  Generation average, peak, min &amp; time-of-day slicing (<code>GET /readings</code>).
                </li>
                <li>
                  Predicted vs actual alignment &amp; MAE/RMSE/MAPE (<code>GET /forecasts</code> +{' '}
                  <code>/readings</code>).
                </li>
                <li>
                  Irradiation, ambient &amp; module thermal correlations (<code>GET /readings</code>).
                </li>
                <li>
                  Deviation severity patterns &amp; scaled <code>6×MAD</code> threshold audits (
                  <code>GET /alerts</code>, <code>/compare</code>).
                </li>
              </ul>
            </div>
            <div>
              <div className={styles.scopeColTitle}>Unavailable (Not Provided by Backend)</div>
              <ul className={styles.scopeList}>
                <li>
                  Cumulative integrated energy (<code>kWh</code> / <code>MWh</code> yield) — backend
                  stores instantaneous kW samples only.
                </li>
                <li>Performance Ratio (PR), soiling loss, or inverter string/DC telemetry.</li>
                <li>Multi-day historical Open-Meteo archive (API provides current weather snapshot only).</li>
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
