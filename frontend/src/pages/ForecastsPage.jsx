import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  CloudSun,
  Cpu,
  Droplets,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  deleteForecast,
  fetchAllForecastsInRange,
} from '../api/forecastsApi';
import { listPlants } from '../api/plantsApi';
import {
  predictManual,
  previewAutomaticPrediction,
  runAutomaticPrediction,
} from '../api/predictionsApi';
import { getPlantWeather } from '../api/weatherApi';
import { ChartCard } from '../components/charts/ChartCard';
import { DataTable } from '../components/data-display/DataTable';
import { StatCard } from '../components/data-display/StatCard';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { ForecastFormModal } from '../components/forms/ForecastFormModal';
import { PageHeader } from '../components/layout/PageHeader';
import { useToast } from '../context/ToastContext';
import { formatRelativeTime, formatTimestamp, getPresetDateRange } from '../utils/date';
import { hourDecimalToSinCos, timeStringToHourDecimal } from '../utils/solarMath';
import styles from './ForecastsPage.module.css';

function ForecastTooltip({ active, payload }) {
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
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {formatTimestamp(pt.forecast_timestamp)} · {pt.plant_id}
      </div>
      <div className="mono" style={{ fontWeight: 700, color: 'var(--color-predicted)', marginTop: 4 }}>
        Predicted: {Number(pt.predicted_power_kw).toLocaleString(undefined, { maximumFractionDigits: 2 })} kW
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
        Source: {pt.source}
        {pt.model_version ? ` · Model: ${pt.model_version}` : ''}
      </div>
    </div>
  );
}

export function ForecastsPage() {
  const { addToast } = useToast();

  // Core fleet & history state
  const [plants, setPlants] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // History filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [plantFilter, setPlantFilter] = useState('all');
  const [dateWindow, setDateWindow] = useState('7d');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [pageSkip, setPageSkip] = useState(0);
  const pageSize = 25;

  // Step-by-step Automatic Prediction Workflow state
  const [autoPlantId, setAutoPlantId] = useState('');
  const [weatherEntry, setWeatherEntry] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);

  const [autoLoading, setAutoLoading] = useState(false);
  const [autoSaveLoading, setAutoSaveLoading] = useState(false);
  const [autoResult, setAutoResult] = useState(null);
  const [autoError, setAutoError] = useState(null);

  // Manual SVR Simulator (/predict)
  const [simForm, setSimForm] = useState({
    plant_code: '0',
    ambientTemp: '30',
    moduleTemp: '44',
    irradiation: '0.78',
    solarTime: '12:30',
    actualPower: '',
  });
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simError, setSimError] = useState('');

  // CRUD modals
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingForecast, setEditingForecast] = useState(null);
  const [deletingForecast, setDeletingForecast] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const range = getPresetDateRange(dateWindow);
        const [plantList, forecastList] = await Promise.all([
          listPlants(undefined, { force }),
          fetchAllForecastsInRange(
            {
              plant_id: plantFilter === 'all' ? undefined : plantFilter,
              ...range,
            },
            undefined,
            { force }
          ),
        ]);
        setPlants(plantList);
        setForecasts(forecastList);
        setAutoPlantId((prev) => {
          if (prev && plantList.some((p) => p.plant_id === prev)) return prev;
          return plantList[0]?.plant_id || '';
        });
        setPageSkip(0);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [plantFilter, dateWindow]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Step 2: Fetch plant weather whenever selected plant changes
  const fetchSelectedPlantWeather = useCallback(async (targetId, force = false) => {
    if (!targetId) {
      setWeatherEntry(null);
      setWeatherError(null);
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await getPlantWeather(targetId, undefined, { force });
      setWeatherEntry(res);
    } catch (err) {
      setWeatherEntry(null);
      setWeatherError(err);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoPlantId) return;
    setAutoResult(null);
    setAutoError(null);
    fetchSelectedPlantWeather(autoPlantId, false);
  }, [autoPlantId, fetchSelectedPlantWeather]);

  const selectedPlant = useMemo(
    () => plants.find((p) => p.plant_id === autoPlantId) || null,
    [plants, autoPlantId]
  );

  const filteredForecasts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = forecasts.filter((f) => {
      if (sourceFilter !== 'all' && String(f.source) !== sourceFilter) return false;
      if (q) {
        const haystack = [f.id, f.plant_id, f.source, f.model_version]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return [...list].sort(
      (a, b) => new Date(b.forecast_timestamp).getTime() - new Date(a.forecast_timestamp).getTime()
    );
  }, [forecasts, sourceFilter, searchQuery]);

  const overviewMetrics = useMemo(() => {
    if (filteredForecasts.length === 0) {
      return { latest: null, peakKw: null, peakItem: null, meanKw: null };
    }
    let peakKw = -Infinity;
    let peakItem = null;
    let sum = 0;
    for (const f of filteredForecasts) {
      const val = Number(f.predicted_power_kw) || 0;
      sum += val;
      if (val > peakKw) {
        peakKw = val;
        peakItem = f;
      }
    }
    return {
      latest: filteredForecasts[0],
      peakKw: Number.isFinite(peakKw) ? peakKw : null,
      peakItem,
      meanKw: sum / filteredForecasts.length,
    };
  }, [filteredForecasts]);

  const pagedRows = useMemo(
    () => filteredForecasts.slice(pageSkip, pageSkip + pageSize),
    [filteredForecasts, pageSkip]
  );

  const chartSeries = useMemo(() => {
    return [...filteredForecasts]
      .sort(
        (a, b) => new Date(a.forecast_timestamp).getTime() - new Date(b.forecast_timestamp).getTime()
      )
      .map((item) => ({
        ...item,
        label: new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(item.forecast_timestamp)),
      }));
  }, [filteredForecasts]);

  // Step 3: Read-only Preview (never saves to MySQL)
  const handlePreviewPrediction = async () => {
    if (!autoPlantId) return;
    setAutoLoading(true);
    setAutoError(null);
    try {
      const res = await previewAutomaticPrediction(autoPlantId);
      setAutoResult({ ...res, forecast_saved: false });
      addToast({
        tone: 'info',
        title: 'Prediction Preview Ready',
        message: `${autoPlantId}: ${Number(res.predicted_power_kw).toFixed(1)} kW (not yet saved).`,
      });
    } catch (err) {
      setAutoError(err);
      addToast({
        tone: 'error',
        title: 'Prediction Preview Failed',
        message: err?.message || 'Could not compute automatic forecast preview.',
      });
    } finally {
      setAutoLoading(false);
    }
  };

  // Step 6: Save Forecast via POST /plants/{plantId}/predict/automatic
  const handleSaveAutomaticForecast = async () => {
    if (!autoPlantId) return;
    setAutoSaveLoading(true);
    setAutoError(null);
    try {
      const res = await runAutomaticPrediction(autoPlantId);
      setAutoResult(res);
      if (res.forecast_saved) {
        addToast({
          tone: 'success',
          title: 'Forecast Saved to Database',
          message: `Saved forecast #${res.forecast_id} for ${autoPlantId} (${Number(
            res.predicted_power_kw
          ).toFixed(1)} kW).`,
        });
        await loadData(true);
      } else {
        addToast({
          tone: 'warning',
          title: 'Prediction Returned Without Saving',
          message: res.warning || 'Forecast could not be persisted to MySQL.',
        });
      }
    } catch (err) {
      setAutoError(err);
      addToast({
        tone: 'error',
        title: 'Save Forecast Failed',
        message: err?.message || 'Unable to execute and save automatic prediction.',
      });
    } finally {
      setAutoSaveLoading(false);
    }
  };

  const handleManualPredict = async (e) => {
    e.preventDefault();
    setSimError('');
    setSimLoading(true);
    try {
      const hourDec = timeStringToHourDecimal(simForm.solarTime);
      const { hour_sin, hour_cos } = hourDecimalToSinCos(hourDec);
      const result = await predictManual({
        plant_code: Number(simForm.plant_code),
        AMBIENT_TEMPERATURE: Number(simForm.ambientTemp),
        MODULE_TEMPERATURE: Number(simForm.moduleTemp),
        IRRADIATION: Number(simForm.irradiation),
        hour_sin,
        hour_cos,
        actual_power: simForm.actualPower !== '' ? Number(simForm.actualPower) : null,
      });
      setSimResult(result);
    } catch (err) {
      setSimError(err?.message || 'SVR inference failed.');
    } finally {
      setSimLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingForecast) return;
    setDeleteLoading(true);
    try {
      await deleteForecast(deletingForecast.id);
      addToast({
        tone: 'success',
        title: 'Forecast Deleted',
        message: `Removed forecast #${deletingForecast.id}.`,
      });
      setDeletingForecast(null);
      await loadData(true);
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Delete Failed',
        message: err?.message || 'Unable to delete forecast record.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const w = weatherEntry?.weather;

  const columns = [
    { key: 'id', label: 'ID', mono: true },
    { key: 'plant_id', label: 'Plant', mono: true },
    {
      key: 'forecast_timestamp',
      label: 'Forecast Time',
      render: (r) => (
        <div>
          <div>{formatTimestamp(r.forecast_timestamp)}</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            {formatRelativeTime(r.forecast_timestamp)}
          </div>
        </div>
      ),
    },
    {
      key: 'predicted_power_kw',
      label: 'Predicted Output (kW)',
      align: 'right',
      numeric: true,
      render: (r) => (
        <strong className="mono" style={{ color: 'var(--color-predicted)' }}>
          {Number(r.predicted_power_kw).toLocaleString(undefined, { maximumFractionDigits: 2 })} kW
        </strong>
      ),
    },
    {
      key: 'source',
      label: 'Source',
      render: (r) => (
        <StatusIndicator
          tone={r.source === 'ml_model' ? 'info' : r.source === 'external' ? 'success' : 'neutral'}
          label={r.source}
        />
      ),
    },
    { key: 'model_version', label: 'Model Version', mono: true },
    {
      key: 'created_at',
      label: 'Logged At',
      render: (r) => formatTimestamp(r.created_at),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.rowActions}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={`Edit forecast ${row.id}`}
            onClick={() => {
              setModalMode('edit');
              setEditingForecast(row);
              setModalOpen(true);
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={`Delete forecast ${row.id}`}
            style={{ color: 'var(--color-danger)' }}
            onClick={() => setDeletingForecast(row)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="SECTOR 03 · FORECAST INTELLIGENCE"
        title="Solar Forecasts & Predictor"
        subtitle="Inspect live site weather, preview weather-driven SVR solar predictions prior to saving, and explore saved forecast trajectories."
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => loadData(true)}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={plants.length === 0}
              onClick={() => {
                setModalMode('create');
                setEditingForecast(null);
                setModalOpen(true);
              }}
            >
              <Plus size={15} />
              <span>Log Forecast</span>
            </button>
          </>
        }
      />

      {/* Forecast Overview KPI Rail */}
      <section className="grid-kpis" aria-label="Forecast overview">
        <StatCard
          label="Forecast Records"
          value={filteredForecasts.length.toLocaleString()}
          subtext={`Window: ${dateWindow.toUpperCase()} • ${
            plantFilter === 'all' ? 'All plants' : plantFilter
          }`}
          icon={Sparkles}
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Latest Forecast"
          value={
            overviewMetrics.latest
              ? Number(overviewMetrics.latest.predicted_power_kw).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })
              : '—'
          }
          unit={overviewMetrics.latest ? 'kW' : undefined}
          trend={overviewMetrics.latest ? overviewMetrics.latest.plant_id : undefined}
          subtext={
            overviewMetrics.latest
              ? `${overviewMetrics.latest.source} • ${formatRelativeTime(
                  overviewMetrics.latest.forecast_timestamp
                )}`
              : 'No forecasts in selected window'
          }
          icon={Zap}
          tone="accent"
          highlight={Boolean(overviewMetrics.latest)}
          loading={loading}
        />
        <StatCard
          label="Peak Forecast Output"
          value={
            overviewMetrics.peakKw !== null
              ? overviewMetrics.peakKw.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : '—'
          }
          unit={overviewMetrics.peakKw !== null ? 'kW' : undefined}
          trend={overviewMetrics.peakItem ? overviewMetrics.peakItem.plant_id : undefined}
          subtext={
            overviewMetrics.peakItem
              ? formatTimestamp(overviewMetrics.peakItem.forecast_timestamp)
              : 'No peak available'
          }
          icon={TrendingUp}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Mean Forecast Power"
          value={
            overviewMetrics.meanKw !== null
              ? overviewMetrics.meanKw.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : '—'
          }
          unit={overviewMetrics.meanKw !== null ? 'kW' : undefined}
          subtext="Average across filtered records"
          icon={Gauge}
          tone="neutral"
          loading={loading}
        />
      </section>

      {/* Main Forecast Intelligence Workbench */}
      <div className={styles.workflowGrid}>
        {/* Left: Automatic Weather-Linked Forecast Workflow */}
        <section className={styles.autoPanel} aria-label="Automatic Forecast Intelligence Workflow">
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Automatic Prediction Workflow</h2>
              <p className={styles.cardSubtitle}>
                Select plant &rarr; verify live Open-Meteo weather &rarr; preview SVR forecast &rarr;
                confirm save
              </p>
            </div>
            <Sparkles size={17} style={{ color: 'var(--color-predicted)' }} />
          </div>

          <div className={styles.stepBar} aria-label="Workflow steps">
            <div className={`${styles.stepItem} ${selectedPlant ? styles.stepItemDone : styles.stepItemActive}`}>
              <span>01 Plant</span>
            </div>
            <div className={`${styles.stepItem} ${w ? styles.stepItemDone : selectedPlant ? styles.stepItemActive : ''}`}>
              <span>02 Weather</span>
            </div>
            <div className={`${styles.stepItem} ${autoResult ? styles.stepItemDone : w ? styles.stepItemActive : ''}`}>
              <span>03 Preview</span>
            </div>
            <div
              className={`${styles.stepItem} ${
                autoResult?.forecast_saved ? styles.stepItemDone : autoResult ? styles.stepItemActive : ''
              }`}
            >
              <span>04 Save</span>
            </div>
          </div>

          {!loading && plants.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title="No solar plants registered"
              description="Register a solar plant with geographic coordinates and installed MW capacity before requesting weather telemetry or SVR forecasts."
              action={
                <Link to="/plants" className="btn btn-primary btn-sm">
                  <span>Register Plant</span>
                  <ArrowRight size={14} />
                </Link>
              }
            />
          ) : (
            <>
              {/* Step 1: Plant Selection */}
              <div className={styles.plantRow}>
                <div className={styles.field}>
                  <label htmlFor="auto-plant" className={styles.label}>
                    01 · Target Solar Plant
                  </label>
                  <select
                    id="auto-plant"
                    className="select-field"
                    value={autoPlantId}
                    onChange={(e) => setAutoPlantId(e.target.value)}
                  >
                    {plants.length === 0 ? <option value="">Loading plants...</option> : null}
                    {plants.map((p) => (
                      <option key={p.plant_id} value={p.plant_id}>
                        {p.plant_id} — {p.plant_name} ({p.installed_capacity_mw} MW)
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!autoPlantId || weatherLoading}
                  onClick={() => fetchSelectedPlantWeather(autoPlantId, true)}
                >
                  <RefreshCw size={13} className={weatherLoading ? 'spin' : ''} />
                  <span>Fetch Weather</span>
                </button>
              </div>

              {selectedPlant ? (
                <div className={styles.plantSpecs}>
                  <span>
                    <MapPin size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {Number(selectedPlant.latitude).toFixed(3)}°,{' '}
                    {Number(selectedPlant.longitude).toFixed(3)}°
                  </span>
                  <span>
                    Nameplate:{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {(Number(selectedPlant.installed_capacity_mw) * 1000).toLocaleString()} kW
                    </strong>{' '}
                    ({selectedPlant.installed_capacity_mw} MW)
                  </span>
                  <span>Type: {String(selectedPlant.plant_type).replace(/_/g, ' ')}</span>
                </div>
              ) : null}

              {/* Step 2: Live Site Weather Telemetry */}
              <div>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <span>02 · Live Weather Telemetry (GET /weather)</span>
                  {w ? (
                    <span>
                      {w.observed_at_local} ({w.timezone}) • {w.source}
                    </span>
                  ) : null}
                </div>

                {weatherLoading ? (
                  <div
                    className="mono"
                    style={{
                      padding: 12,
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <Loader2 size={13} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Fetching Open-Meteo irradiance & temperature for {autoPlantId}...
                  </div>
                ) : weatherError ? (
                  <ErrorState
                    title={`Weather lookup failed for ${autoPlantId}`}
                    error={weatherError}
                    onRetry={() => fetchSelectedPlantWeather(autoPlantId, true)}
                  />
                ) : w ? (
                  <div className={styles.weatherGrid}>
                    <div className={styles.weatherCell}>
                      <div className={styles.weatherLabel}>
                        <Thermometer size={11} style={{ color: 'var(--color-accent)' }} />
                        <span>Ambient</span>
                      </div>
                      <div className={styles.weatherVal}>
                        {w.ambient_temperature_c ?? '—'}
                        <span className={styles.weatherUnit}>{w.units?.temperature || '°C'}</span>
                      </div>
                    </div>
                    <div className={styles.weatherCell}>
                      <div className={styles.weatherLabel}>
                        <Droplets size={11} style={{ color: 'var(--color-predicted)' }} />
                        <span>Humidity</span>
                      </div>
                      <div className={styles.weatherVal}>
                        {w.relative_humidity_percent ?? '—'}
                        <span className={styles.weatherUnit}>{w.units?.humidity || '%'}</span>
                      </div>
                    </div>
                    <div className={styles.weatherCell}>
                      <div className={styles.weatherLabel}>
                        <Sun size={11} style={{ color: 'var(--color-accent)' }} />
                        <span>Shortwave</span>
                      </div>
                      <div className={styles.weatherVal}>
                        {w.shortwave_radiation_w_m2 ?? '—'}
                        <span className={styles.weatherUnit}>{w.units?.radiation || 'W/m²'}</span>
                      </div>
                    </div>
                    <div className={styles.weatherCell}>
                      <div className={styles.weatherLabel}>
                        <CloudSun size={11} style={{ color: 'var(--color-teal)' }} />
                        <span>Irradiation</span>
                      </div>
                      <div className={styles.weatherVal}>
                        {w.irradiation_kw_m2 !== null && w.irradiation_kw_m2 !== undefined
                          ? Number(w.irradiation_kw_m2).toFixed(3)
                          : '—'}
                        <span className={styles.weatherUnit}>kW/m²</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Automatic Prediction Errors */}
              {autoError ? (
                <ErrorState
                  title="Automatic prediction request failed"
                  error={autoError}
                  onRetry={handlePreviewPrediction}
                />
              ) : null}

              {/* Step 3 & 4: Preview Stage & Review Details */}
              {autoResult ? (
                <div
                  className={`${styles.previewStage} ${
                    autoResult.forecast_saved ? styles.previewStageSaved : ''
                  }`}
                  aria-label="Prediction Preview Result"
                >
                  <div className={styles.previewTop}>
                    <div>
                      <span className="eyebrow">
                        {autoResult.plant_name || autoResult.plant_id} • CAPACITY-SCALED SVR PREVIEW
                      </span>
                      <div className={styles.previewPower} style={{ marginTop: 4 }}>
                        {Number(autoResult.predicted_power_kw).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span className="mono" style={{ fontSize: 14 }}>
                          kW
                        </span>
                      </div>
                    </div>

                    <StatusIndicator
                      tone={autoResult.forecast_saved ? 'success' : 'info'}
                      label={
                        autoResult.forecast_saved
                          ? `Saved #${autoResult.forecast_id}`
                          : 'Preview Only — Not Saved'
                      }
                    />
                  </div>

                  <div className={styles.previewMetaRow}>
                    <span>
                      Capacity Factor:{' '}
                      <strong>
                        {autoResult.capacity_factor !== null &&
                        autoResult.capacity_factor !== undefined
                          ? `${(Number(autoResult.capacity_factor) * 100).toFixed(1)}%`
                          : '—'}
                      </strong>
                    </span>
                    {autoResult.plant_capacity_kw ? (
                      <span>Rated Cap: {autoResult.plant_capacity_kw} kW</span>
                    ) : null}
                    {autoResult.observed_at_local ? (
                      <span>
                        Observed: {autoResult.observed_at_local} ({autoResult.timezone || 'local'})
                      </span>
                    ) : null}
                    {autoResult.training_plant_id ? (
                      <span>
                        Baseline: #{autoResult.training_plant_id} (code {autoResult.model_plant_code}
                        )
                      </span>
                    ) : null}
                    {autoResult.raw_model_prediction_kw !== undefined ? (
                      <span>Raw Model: {autoResult.raw_model_prediction_kw} kW</span>
                    ) : null}
                    {autoResult.model_version ? (
                      <span>Model: {autoResult.model_version}</span>
                    ) : null}
                  </div>

                  {autoResult.prediction_exceeds_capacity ? (
                    <div className={styles.warningBanner}>
                      <AlertTriangle
                        size={13}
                        style={{ verticalAlign: 'middle', marginRight: 6 }}
                      />
                      Unclipped scaled estimate ({autoResult.scaled_prediction_kw} kW) exceeded
                      installed capacity ({autoResult.plant_capacity_kw} kW) and was capped.
                    </div>
                  ) : null}

                  {autoResult.forecast_saved === true ? (
                    <div className={styles.successBanner}>
                      <span>
                        <BookmarkCheck
                          size={14}
                          style={{ verticalAlign: 'middle', marginRight: 6 }}
                        />
                        Forecast #{autoResult.forecast_id} persisted to MySQL
                        {autoResult.model_version ? ` (${autoResult.model_version})` : ''}.
                      </span>
                      <StatusIndicator tone="success" label="DB Confirmed" />
                    </div>
                  ) : null}

                  {autoResult.warning ? (
                    <div className={styles.warningBanner} role="alert">
                      {autoResult.warning}
                    </div>
                  ) : null}

                  {autoResult.inputs_used ? (
                    <div className={styles.inputsGrid} aria-label="Model features used">
                      {Object.entries(autoResult.inputs_used).map(([key, info]) => (
                        <div key={key} className={styles.inputPill}>
                          <span className={styles.inputPillName}>{key}</span>
                          <span className={styles.inputPillVal}>
                            {info?.value ?? '—'} {info?.unit || ''}
                          </span>
                          <span className={styles.inputPillSrc}>{info?.source || ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {autoResult.scaling_note ? (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {autoResult.scaling_note}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div
                  className="mono"
                  style={{
                    padding: 16,
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                  }}
                >
                  Click <strong>Preview Weather SVR</strong> to compute an unpersisted prediction and
                  inspect estimated module temperature, cyclical time features, and scaling before
                  saving.
                </div>
              )}

              {/* Step 3 & 6 Separate Action Buttons */}
              <div className={styles.workflowActions}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!autoPlantId || autoLoading || autoSaveLoading}
                  onClick={handlePreviewPrediction}
                >
                  {autoLoading ? <Loader2 size={13} className="spin" /> : <Eye size={13} />}
                  <span>Preview Weather SVR</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!autoPlantId || autoLoading || autoSaveLoading}
                  onClick={handleSaveAutomaticForecast}
                >
                  {autoSaveLoading ? (
                    <Loader2 size={13} className="spin" />
                  ) : (
                    <BookmarkCheck size={13} />
                  )}
                  <span>
                    {autoResult && !autoResult.forecast_saved
                      ? 'Save Forecast (Generate & Save)'
                      : 'Generate & Save'}
                  </span>
                </button>
              </div>
            </>
          )}
        </section>

        {/* Right: Manual SVR Simulator (/predict) */}
        <section className={styles.simPanel} aria-label="Manual SVR Solar Predictor">
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>SVR Solar Simulator (POST /predict)</h2>
              <p className={styles.cardSubtitle}>
                Test raw Support Vector Regression inference from custom ambient, module, and
                irradiation inputs
              </p>
            </div>
            <Cpu size={17} style={{ color: 'var(--color-accent)' }} />
          </div>

          <form onSubmit={handleManualPredict} className={styles.root} style={{ gap: 14 }}>
            <div className={styles.simForm}>
              <div className={styles.field}>
                <label htmlFor="sim-code" className={styles.label}>
                  SVR Plant Code
                </label>
                <select
                  id="sim-code"
                  className="select-field"
                  value={simForm.plant_code}
                  onChange={(e) => setSimForm((p) => ({ ...p, plant_code: e.target.value }))}
                >
                  <option value="0">0 — Solar Plant 1</option>
                  <option value="1">1 — Solar Plant 2</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="sim-ambient" className={styles.label}>
                  Ambient (°C)
                </label>
                <input
                  id="sim-ambient"
                  type="number"
                  step="0.1"
                  className="input-field mono"
                  value={simForm.ambientTemp}
                  onChange={(e) => setSimForm((p) => ({ ...p, ambientTemp: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="sim-module" className={styles.label}>
                  Module (°C)
                </label>
                <input
                  id="sim-module"
                  type="number"
                  step="0.1"
                  className="input-field mono"
                  value={simForm.moduleTemp}
                  onChange={(e) => setSimForm((p) => ({ ...p, moduleTemp: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="sim-irr" className={styles.label}>
                  Irradiation (kW/m²)
                </label>
                <input
                  id="sim-irr"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1.5"
                  className="input-field mono"
                  value={simForm.irradiation}
                  onChange={(e) => setSimForm((p) => ({ ...p, irradiation: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="sim-time" className={styles.label}>
                  Local Solar Time
                </label>
                <input
                  id="sim-time"
                  type="time"
                  className="input-field mono"
                  value={simForm.solarTime}
                  onChange={(e) => setSimForm((p) => ({ ...p, solarTime: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="sim-actual" className={styles.label}>
                  Actual kW (Optional)
                </label>
                <input
                  id="sim-actual"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Check residual"
                  className="input-field mono"
                  value={simForm.actualPower}
                  onChange={(e) => setSimForm((p) => ({ ...p, actualPower: e.target.value }))}
                />
              </div>
            </div>

            {simError ? (
              <div className="mono" style={{ fontSize: 12, color: 'var(--color-danger)' }} role="alert">
                {simError}
              </div>
            ) : null}

            <div className={styles.simFooter}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                sin/cos(2π · hour / 24) auto-computed
              </span>
              <button type="submit" className="btn btn-primary btn-sm" disabled={simLoading}>
                {simLoading ? <Loader2 size={13} className="spin" /> : <Zap size={13} />}
                <span>Run SVR Prediction</span>
              </button>
            </div>
          </form>

          {simResult ? (
            <div className={styles.resultBanner}>
              <div>
                <span className="eyebrow">Raw SVR Inference Output</span>
                <div className={styles.resultVal}>
                  {Number(simResult.predicted_power_kw).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span className="mono" style={{ fontSize: 13 }}>
                    kW
                  </span>
                </div>
              </div>
              <div className={styles.resultMeta}>
                <span>Daytime: {simResult.daytime ? 'YES' : 'NO'}</span>
                {simResult.residual_kw !== null && simResult.residual_kw !== undefined ? (
                  <span>Residual: {simResult.residual_kw} kW</span>
                ) : null}
                {simResult.deviation_detected !== null &&
                simResult.deviation_detected !== undefined ? (
                  <StatusIndicator
                    tone={simResult.deviation_detected ? 'danger' : 'success'}
                    label={simResult.deviation_detected ? 'Deviation Flagged' : 'Within Threshold'}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* Forecast Trajectory Visualization with Legend, Tooltips & Units */}
      <ChartCard
        title="Saved Forecast Trajectory"
        subtitle="Chronological power predictions (kW) returned by GET /forecasts"
        loading={loading}
        error={error?.message || null}
        isEmpty={chartSeries.length === 0}
        emptyTitle="No forecast records in selected window"
        emptyDescription="Use Preview Weather SVR + Save Forecast above or log a manual forecast record."
        onRetry={() => loadData(true)}
        height={270}
      >
        <div style={{ width: '100%', height: 270 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartSeries} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="fcAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
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
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`)}
              />
              <Tooltip content={<ForecastTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                height={28}
                wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="predicted_power_kw"
                name="Predicted Solar Output (kW)"
                stroke="#38bdf8"
                strokeWidth={2}
                fill="url(#fcAreaGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Forecast History Filters, Search & Table */}
      <section className={styles.toolbar} aria-label="Forecast history filters">
        <div className={styles.filtersLeft}>
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="search"
              className={`input-field ${styles.searchInput}`}
              placeholder="Search plant ID, model, or source..."
              aria-label="Search forecast history"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPageSkip(0);
              }}
            />
          </div>

          <select
            className={`select-field ${styles.filterSelect}`}
            aria-label="Filter forecasts by plant"
            value={plantFilter}
            onChange={(e) => setPlantFilter(e.target.value)}
          >
            <option value="all">All Plants</option>
            {plants.map((p) => (
              <option key={p.plant_id} value={p.plant_id}>
                {p.plant_id}
              </option>
            ))}
          </select>

          <select
            className={`select-field ${styles.filterSelect}`}
            aria-label="Filter forecasts by window"
            value={dateWindow}
            onChange={(e) => setDateWindow(e.target.value)}
          >
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>

          <select
            className={`select-field ${styles.filterSelect}`}
            aria-label="Filter forecasts by source"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPageSkip(0);
            }}
          >
            <option value="all">All Sources</option>
            <option value="ml_model">ml_model</option>
            <option value="external">external</option>
            <option value="manual">manual</option>
          </select>
        </div>

        <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {filteredForecasts.length} record{filteredForecasts.length === 1 ? '' : 's'}
        </span>
      </section>

      {error ? (
        <ErrorState
          title="Failed to load forecast history"
          error={error}
          onRetry={() => loadData(true)}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={pagedRows}
          loading={loading}
          emptyTitle="No saved forecasts found"
          emptyDescription="Adjust search/filters above or generate a new forecast from live plant weather."
          pagination={
            filteredForecasts.length > pageSize
              ? {
                  skip: pageSkip,
                  hasMore: pageSkip + pageSize < filteredForecasts.length,
                  onPrev: () => setPageSkip((s) => Math.max(0, s - pageSize)),
                  onNext: () => setPageSkip((s) => s + pageSize),
                }
              : null
          }
        />
      )}

      <ForecastFormModal
        open={modalOpen}
        mode={modalMode}
        initialForecast={editingForecast}
        plants={plants}
        defaultPlantId={plantFilter !== 'all' ? plantFilter : autoPlantId || plants[0]?.plant_id}
        onClose={() => setModalOpen(false)}
        onSuccess={async (saved, m) => {
          addToast({
            tone: 'success',
            title: m === 'edit' ? 'Forecast Updated' : 'Forecast Created',
            message: `${saved.plant_id}: ${Number(saved.predicted_power_kw).toFixed(1)} kW`,
          });
          await loadData(true);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingForecast)}
        title={`Delete forecast #${deletingForecast?.id}?`}
        description="This permanently removes the forecast record from MySQL."
        confirmLabel="Delete Forecast"
        loading={deleteLoading}
        onCancel={() => setDeletingForecast(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
