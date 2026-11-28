import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Compass,
  Cpu,
  Droplets,
  Gauge,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  Zap,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deletePlant } from '../api/plantsApi';
import { AlertCard } from '../components/alerts/AlertCard';
import { PowerGenerationChart } from '../components/charts/PowerGenerationChart';
import { DataTable } from '../components/data-display/DataTable';
import { SolarOrientationDial } from '../components/data-display/SolarOrientationDial';
import { StatCard } from '../components/data-display/StatCard';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PlantFormModal } from '../components/forms/PlantFormModal';
import { PageHeader } from '../components/layout/PageHeader';
import { useToast } from '../context/ToastContext';
import { usePlantDetails } from '../hooks/usePlantDetails';
import { buildFleetGenerationSeries, derivePlantStatus } from '../utils/dashboardSelectors';
import { formatTimestamp } from '../utils/date';
import styles from './PlantDetailsPage.module.css';

const STATUS_TONE = {
  Producing: 'success',
  Idle: 'neutral',
  Warning: 'warning',
  Offline: 'danger',
};

export function PlantDetailsPage() {
  const { plantId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const {
    loading,
    error,
    plant,
    weather,
    weatherError,
    weatherLoading,
    forecasts,
    readings,
    alerts,
    comparison,
    comparisonError,
    autoPrediction,
    predictLoading,
    compareLoading,
    refresh,
    refreshWeather,
    previewPredict,
    runAndSavePredict,
    runCompare,
    setAlertStatus,
  } = usePlantDetails(plantId);

  const [activeTab, setActiveTab] = useState('forecasts');
  const [chartWindow, setChartWindow] = useState('7d');
  const [showInputs, setShowInputs] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [updatingAlertId, setUpdatingAlertId] = useState(null);

  const latestReading = readings[0] || null;
  const latestForecast = forecasts[0] || null;

  const derivedStatus = useMemo(() => {
    if (!plant) return { status: 'Offline', reason: '', currentPowerKw: null };
    return derivePlantStatus(plant, latestReading, alerts);
  }, [plant, latestReading, alerts]);

  const series = useMemo(
    () => buildFleetGenerationSeries(forecasts, readings, chartWindow),
    [forecasts, readings, chartWindow]
  );

  const handlePreviewPredict = async () => {
    try {
      await previewPredict();
      addToast({
        tone: 'info',
        title: 'Prediction Preview Ready',
        message: 'Automatic SVR prediction computed from live Open-Meteo weather (not saved).',
      });
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Prediction Preview Failed',
        message: err?.message || 'Could not compute automatic prediction.',
      });
    }
  };

  const handleSavePredict = async () => {
    try {
      const res = await runAndSavePredict();
      if (res?.forecast_saved) {
        addToast({
          tone: 'success',
          title: 'Forecast Saved',
          message: `Predicted ${res.predicted_power_kw} kW saved as forecast #${res.forecast_id}.`,
        });
      } else {
        addToast({
          tone: 'warning',
          title: 'Forecast Not Saved',
          message:
            res?.warning || 'Prediction succeeded but the forecast could not be persisted.',
        });
      }
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Auto-Prediction Failed',
        message: err?.message || 'Could not run automatic prediction.',
      });
    }
  };

  const handleRunCompare = async () => {
    try {
      const res = await runCompare();
      if (res.alert_generated) {
        addToast({
          tone: 'warning',
          title: 'Deviation Alert Generated',
          message: `${res.severity?.toUpperCase()} alert created: ${res.reason}`,
        });
      } else if (res.deviation_detected) {
        addToast({
          tone: 'info',
          title: 'Deviation Already Recorded',
          message: 'An alert already exists for this forecast and reading pair.',
        });
      } else {
        addToast({
          tone: 'success',
          title: 'Comparison Complete',
          message: res.reason || 'Actual generation is within normal operating range.',
        });
      }
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Comparison Failed',
        message: err?.message || 'Could not compare latest forecast and reading.',
      });
    }
  };

  const handleAlertTransition = async (alertId, nextStatus) => {
    setUpdatingAlertId(alertId);
    try {
      await setAlertStatus(alertId, nextStatus);
      addToast({
        tone: 'success',
        title: 'Alert Updated',
        message: `Alert #${alertId} marked as ${nextStatus}.`,
      });
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Alert Update Failed',
        message: err?.message || 'Could not update alert status.',
      });
    } finally {
      setUpdatingAlertId(null);
    }
  };

  const handleDeletePlant = async () => {
    setDeleteLoading(true);
    try {
      await deletePlant(plantId);
      addToast({
        tone: 'success',
        title: 'Plant Deleted',
        message: `Plant "${plantId}" and linked records were deleted.`,
      });
      navigate('/plants', { replace: true });
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Delete Failed',
        message: err?.message || 'Could not delete plant.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading && !plant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <PageHeader
          title={`Plant Details — ${plantId}`}
          breadcrumb={
            <Link to="/plants" className={styles.breadcrumbLink}>
              <ArrowLeft size={13} />
              <span>Back to Plants</span>
            </Link>
          }
        />
        <LoadingState variant="cards" cards={4} message="Loading plant telemetry..." />
        <LoadingState variant="chart" message="Loading plant history..." />
      </div>
    );
  }

  if (error || !plant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <PageHeader
          title={`Plant Details — ${plantId}`}
          breadcrumb={
            <Link to="/plants" className={styles.breadcrumbLink}>
              <ArrowLeft size={13} />
              <span>Back to Plants</span>
            </Link>
          }
        />
        {error?.status === 404 ? (
          <EmptyState
            icon={Cpu}
            title={`Plant "${plantId}" not found`}
            description="This plant may have been deleted or the identifier does not exist in MySQL."
            action={
              <Link to="/plants" className="btn btn-primary">
                Return to Plants
              </Link>
            }
          />
        ) : (
          <ErrorState title="Failed to load plant details" error={error} onRetry={refresh} />
        )}
      </div>
    );
  }

  const capacityKw = Math.round(Number(plant.installed_capacity_mw) * 1000);
  const w = weather?.weather;

  const forecastColumns = [
    { key: 'id', label: 'ID', mono: true },
    {
      key: 'forecast_timestamp',
      label: 'Forecast Time',
      render: (r) => formatTimestamp(r.forecast_timestamp),
    },
    {
      key: 'predicted_power_kw',
      label: 'Predicted (kW)',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.predicted_power_kw).toLocaleString(undefined, { maximumFractionDigits: 2 }),
    },
    { key: 'source', label: 'Source', mono: true },
    { key: 'model_version', label: 'Model Version', mono: true },
    {
      key: 'created_at',
      label: 'Created',
      render: (r) => formatTimestamp(r.created_at),
    },
  ];

  const readingColumns = [
    { key: 'id', label: 'ID', mono: true },
    { key: 'timestamp', label: 'Reading Time', render: (r) => formatTimestamp(r.timestamp) },
    {
      key: 'actual_power_kw',
      label: 'Actual (kW)',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.actual_power_kw).toLocaleString(undefined, { maximumFractionDigits: 2 }),
    },
    {
      key: 'irradiation',
      label: 'Irradiation',
      align: 'right',
      numeric: true,
      render: (r) => `${Number(r.irradiation).toFixed(3)} kW/m²`,
    },
    {
      key: 'ambient_temperature',
      label: 'Ambient °C',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.ambient_temperature).toFixed(1),
    },
    {
      key: 'module_temperature',
      label: 'Module °C',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.module_temperature).toFixed(1),
    },
    { key: 'source', label: 'Source', mono: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <PageHeader
        eyebrow="SECTOR 02 · ARRAY TELEMETRY"
        title={plant.plant_name}
        subtitle={`Plant ID: ${plant.plant_id} • Type: ${String(plant.plant_type).replace(/_/g, ' ')}`}
        breadcrumb={
          <Link to="/plants" className={styles.breadcrumbLink}>
            <ArrowLeft size={13} />
            <span>Back to Plants</span>
          </Link>
        }
        actions={
          <div className={styles.headerActions}>
            <StatusIndicator
              tone={STATUS_TONE[derivedStatus.status] || 'neutral'}
              label={derivedStatus.status}
              title={derivedStatus.reason}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>
              <Pencil size={14} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        }
      />

      {/* Collector Geometry & Azimuth Telemetry Strip */}
      <section className={styles.geometryStrip} aria-label="Collector geometry">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <SolarOrientationDial tilt={plant.tilt} azimuth={plant.azimuth} size={64} />
          <div>
            <span className="eyebrow">HELIOSTAT ORIENTATION</span>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              Tilt {plant.tilt ?? '—'}° · Azimuth {plant.azimuth ?? '—'}°
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
              Coordinates {Number(plant.latitude).toFixed(4)}° N, {Number(plant.longitude).toFixed(4)}° E
            </div>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {capacityKw.toLocaleString()} kW Rated Nameplate · {String(plant.plant_type).replace(/_/g, ' ').toUpperCase()}
        </div>
      </section>

      {/* Plant Overview Specs & Latest Telemetry */}
      <section className="grid-kpis" aria-label="Plant summary">
        <StatCard
          label="Installed Capacity"
          value={Number(plant.installed_capacity_mw).toFixed(2)}
          unit="MW"
          trend={`${capacityKw.toLocaleString()} kW`}
          subtext={`Type: ${String(plant.plant_type).replace(/_/g, ' ')}`}
          icon={Gauge}
          tone="success"
        />

        <StatCard
          label="Location & Orientation"
          value={`${Number(plant.latitude).toFixed(2)}°, ${Number(plant.longitude).toFixed(2)}°`}
          subtext={
            plant.tilt !== null || plant.azimuth !== null
              ? `Tilt ${plant.tilt ?? '—'}° • Azimuth ${plant.azimuth ?? '—'}°`
              : 'Panel tilt & azimuth not configured'
          }
          icon={MapPin}
          tone="info"
        />

        <StatCard
          label="Latest Actual Reading"
          value={
            latestReading
              ? Number(latestReading.actual_power_kw).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })
              : '—'
          }
          unit={latestReading ? 'kW' : undefined}
          trend={latestReading ? latestReading.source : undefined}
          subtext={
            latestReading
              ? formatTimestamp(latestReading.timestamp)
              : 'No actual readings logged yet'
          }
          icon={Activity}
          tone="accent"
          highlight={Boolean(latestReading)}
        />

        <StatCard
          label="Latest Forecast"
          value={
            latestForecast
              ? Number(latestForecast.predicted_power_kw).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })
              : '—'
          }
          unit={latestForecast ? 'kW' : undefined}
          trend={latestForecast ? latestForecast.source : undefined}
          subtext={
            latestForecast
              ? formatTimestamp(latestForecast.forecast_timestamp)
              : 'No forecasts saved yet'
          }
          icon={Zap}
          tone="info"
        />
      </section>

      {/* Live Weather & Automatic SVR Prediction Workbench */}
      <div className={styles.workbenchGrid}>
        <section className={`surface-card ${styles.card}`}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Live Plant Weather</h2>
              <p className={styles.cardSubtitle}>
                {w
                  ? `Open-Meteo at ${w.observed_at_local} (${w.timezone})`
                  : 'Current conditions at stored plant coordinates'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={refreshWeather}
              disabled={weatherLoading}
            >
              <RefreshCw size={13} className={weatherLoading ? 'spin' : ''} />
              <span>Refresh Weather</span>
            </button>
          </div>

          {weatherLoading && !w ? (
            <LoadingState message="Fetching Open-Meteo telemetry..." />
          ) : weatherError ? (
            <ErrorState
              title="Weather service unavailable"
              error={weatherError}
              onRetry={refreshWeather}
            />
          ) : !w ? (
            <EmptyState title="No weather data" description="Click Refresh Weather to query Open-Meteo." />
          ) : (
            <div className={styles.weatherGrid}>
              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>
                  <Thermometer size={13} style={{ color: 'var(--color-accent)' }} />
                  <span>Ambient Temp</span>
                </div>
                <div className={`tabular-nums ${styles.metricValue}`}>
                  {w.ambient_temperature_c ?? '—'}
                  <span className={styles.metricUnit}>{w.units?.temperature || '°C'}</span>
                </div>
              </div>

              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>
                  <Droplets size={13} style={{ color: 'var(--color-predicted)' }} />
                  <span>Humidity</span>
                </div>
                <div className={`tabular-nums ${styles.metricValue}`}>
                  {w.relative_humidity_percent ?? '—'}
                  <span className={styles.metricUnit}>{w.units?.humidity || '%'}</span>
                </div>
              </div>

              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>
                  <Sun size={13} style={{ color: 'var(--color-accent)' }} />
                  <span>Shortwave Radiation</span>
                </div>
                <div className={`tabular-nums ${styles.metricValue}`}>
                  {w.shortwave_radiation_w_m2 ?? '—'}
                  <span className={styles.metricUnit}>{w.units?.radiation || 'W/m²'}</span>
                </div>
              </div>

              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>
                  <Compass size={13} style={{ color: 'var(--color-teal)' }} />
                  <span>Irradiation</span>
                </div>
                <div className={`tabular-nums ${styles.metricValue}`}>
                  {w.irradiation_kw_m2 !== null && w.irradiation_kw_m2 !== undefined
                    ? Number(w.irradiation_kw_m2).toFixed(3)
                    : '—'}
                  <span className={styles.metricUnit}>kW/m²</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={`surface-card ${styles.card}`}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Automatic SVR Prediction</h2>
              <p className={styles.cardSubtitle}>
                Computes scaled output using live weather &amp; estimated module temperature
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePreviewPredict}
                disabled={predictLoading}
              >
                {predictLoading ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                <span>Preview</span>
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSavePredict}
                disabled={predictLoading}
              >
                {predictLoading ? <Loader2 size={13} className="spin" /> : <Zap size={13} />}
                <span>Run &amp; Save Forecast</span>
              </button>
            </div>
          </div>

          {!autoPrediction ? (
            <EmptyState
              icon={Zap}
              title="Run automatic prediction"
              description="Click Preview for a read-only estimate or Run & Save Forecast to store an ML forecast row in MySQL."
            />
          ) : (
            <div className={styles.predictionBox}>
              <div className={styles.predValueRow}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                    PREDICTED POWER OUTPUT
                  </div>
                  <div className={`tabular-nums ${styles.predPower}`}>
                    {Number(autoPrediction.predicted_power_kw).toLocaleString()} kW
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <StatusIndicator
                    tone="info"
                    label={`CF ${(Number(autoPrediction.capacity_factor) * 100).toFixed(1)}%`}
                  />
                  {autoPrediction.prediction_exceeds_capacity ? (
                    <StatusIndicator tone="warning" label="Clipped to Capacity" />
                  ) : null}
                  {autoPrediction.forecast_saved ? (
                    <StatusIndicator
                      tone="success"
                      label={`Saved #${autoPrediction.forecast_id}`}
                    />
                  ) : null}
                </div>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {autoPrediction.scaling_note}
              </p>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setShowInputs((v) => !v)}
              >
                {showInputs ? 'Hide Model Inputs' : 'Inspect Model Inputs'}
              </button>

              {showInputs && autoPrediction.inputs_used ? (
                <div className={styles.inputsList}>
                  {Object.entries(autoPrediction.inputs_used).map(([key, info]) => (
                    <div key={key} className={styles.inputRow}>
                      <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                        {key}
                      </span>
                      <strong className="mono">
                        {info.value} {info.unit || ''}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* Latest Deviation Comparison */}
      <section className={`surface-card ${styles.card}`}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Deviation &amp; Comparison</h2>
            <p className={styles.cardSubtitle}>
              Compares latest saved forecast against latest actual reading using scaled MAD + relative rules
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRunCompare}
            disabled={compareLoading}
          >
            {compareLoading ? <Loader2 size={13} className="spin" /> : <ShieldAlert size={13} />}
            <span>Check &amp; Generate Alert</span>
          </button>
        </div>

        {comparisonError ? (
          <ErrorState title="Comparison check failed" error={comparisonError} onRetry={refresh} />
        ) : !comparison ? (
          <EmptyState
            title="Comparison unavailable"
            description="Ensure this plant has at least one forecast and one actual reading to evaluate deviations."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className={styles.compareStrip}>
              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>Predicted (#{comparison.forecast_id})</div>
                <div className={`mono ${styles.metricValue}`}>
                  {Number(comparison.predicted_power_kw).toLocaleString()} kW
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatTimestamp(comparison.forecast_timestamp)}
                </div>
              </div>

              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>Actual (#{comparison.reading_id})</div>
                <div className={`mono ${styles.metricValue}`}>
                  {Number(comparison.actual_power_kw).toLocaleString()} kW
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatTimestamp(comparison.reading_timestamp)}
                </div>
              </div>

              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>Residual / Threshold</div>
                <div className={`mono ${styles.metricValue}`}>
                  {comparison.residual_kw >= 0 ? '+' : ''}
                  {Number(comparison.residual_kw).toLocaleString()} kW
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Threshold ±{Number(comparison.threshold_kw).toLocaleString()} kW
                </div>
              </div>

              <div className={styles.metricTile}>
                <div className={styles.metricLabel}>Evaluation Result</div>
                <div style={{ marginTop: 6 }}>
                  <StatusIndicator
                    tone={comparison.deviation_detected ? 'danger' : 'success'}
                    label={
                      comparison.deviation_detected
                        ? `Deviation (${comparison.severity || 'flagged'})`
                        : comparison.daytime
                        ? 'Normal Range'
                        : 'Nighttime / Low Irr'
                    }
                  />
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{comparison.reason}</p>
          </div>
        )}
      </section>

      {/* Plant-scoped Forecast vs Actual Chart */}
      <PowerGenerationChart
        data={series}
        dateWindow={chartWindow}
        onChangeWindow={setChartWindow}
      />

      {/* Tabbed History: Forecasts / Readings / Alerts */}
      <section className={`surface-card ${styles.card}`}>
        <div className={styles.tabsHeader}>
          <div className={styles.tabBar} role="tablist" aria-label="Plant history tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'forecasts'}
              className={`${styles.tabBtn} ${activeTab === 'forecasts' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('forecasts')}
            >
              Forecast History ({forecasts.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'readings'}
              className={`${styles.tabBtn} ${activeTab === 'readings' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('readings')}
            >
              Actual Readings ({readings.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'alerts'}
              className={`${styles.tabBtn} ${activeTab === 'alerts' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('alerts')}
            >
              Alerts ({alerts.length})
            </button>
          </div>
        </div>

        {activeTab === 'forecasts' ? (
          <DataTable
            columns={forecastColumns}
            rows={forecasts}
            emptyTitle="No forecasts saved for this plant"
            emptyDescription="Use Run & Save Forecast above to generate an automatic ML forecast."
          />
        ) : null}

        {activeTab === 'readings' ? (
          <DataTable
            columns={readingColumns}
            rows={readings}
            emptyTitle="No actual readings logged for this plant"
            emptyDescription="Actual SCADA, inverter, or manual readings recorded for this plant will appear here."
          />
        ) : null}

        {activeTab === 'alerts' ? (
          alerts.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No alerts for this plant"
              description="No deviation alerts have been recorded for this plant."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {alerts.map((alert) => (
                <div key={alert.id} className={styles.alertRow}>
                  <AlertCard alert={alert} />
                  {alert.status !== 'resolved' ? (
                    <div className={styles.alertActions}>
                      {alert.status === 'open' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={updatingAlertId === alert.id}
                          onClick={() => handleAlertTransition(alert.id, 'acknowledged')}
                        >
                          Acknowledge
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={updatingAlertId === alert.id}
                        onClick={() => handleAlertTransition(alert.id, 'resolved')}
                      >
                        <CheckCircle2 size={13} />
                        <span>Resolve</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>

      <PlantFormModal
        open={editOpen}
        initialPlant={plant}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setEditOpen(false);
          addToast({
            tone: 'success',
            title: 'Plant Updated',
            message: `${updated.plant_name} (${updated.plant_id}) updated.`,
          });
          refresh();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${plant.plant_name}?`}
        description={`Deleting "${plant.plant_id}" will permanently remove the plant and cascade-delete all associated forecasts, readings, and alerts in MySQL.`}
        confirmLabel="Delete Plant"
        tone="danger"
        loading={deleteLoading}
        onConfirm={handleDeletePlant}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
