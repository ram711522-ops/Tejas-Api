import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sun,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AlertCard } from '../components/alerts/AlertCard';
import { PowerGenerationChart } from '../components/charts/PowerGenerationChart';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { PredictionPerformanceCard } from '../components/dashboard/PredictionPerformanceCard';
import { SolarObservatoryHero } from '../components/dashboard/SolarObservatoryHero';
import { WeatherPanel } from '../components/dashboard/WeatherPanel';
import { PlantCard } from '../components/data-display/PlantCard';
import { StatCard } from '../components/data-display/StatCard';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/layout/PageHeader';
import { useSettings } from '../context/SettingsContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { usePolling } from '../hooks/usePolling';
import { formatTimestamp } from '../utils/date';
import { buildActivityEvents, deriveDashboardSummary } from '../utils/dashboardSelectors';
import styles from './OverviewDashboardPage.module.css';

const DATE_WINDOWS = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

export function OverviewDashboardPage() {
  const { settings } = useSettings();
  const [dateWindow, setDateWindow] = useState(settings.defaultDateWindow || '7d');
  const [weatherPlantId, setWeatherPlantId] = useState('TEJAS001');

  const { data, loading, error, lastUpdated, refresh } = useDashboardData(dateWindow);

  usePolling(() => {
    if (!loading) {
      refresh();
    }
  }, settings.pollingIntervalMs);

  const summary = useMemo(() => {
    if (!data) return null;
    return deriveDashboardSummary({
      plants: data.plants,
      forecasts: data.forecasts,
      readings: data.readings,
      alerts: data.alerts,
      dateWindow,
    });
  }, [data, dateWindow]);

  const activityEvents = useMemo(() => {
    if (!data) return [];
    return buildActivityEvents(data.forecasts, data.readings, data.alerts, 5);
  }, [data]);

  const systemOk = Boolean(data?.health?.model_loaded && data?.health?.database?.connected);

  const getOverviewBadge = () => {
    if (error) return { tone: 'danger', label: 'API Offline' };
    if (loading && !data) return { tone: 'neutral', label: 'Connecting...' };
    if (systemOk) return { tone: 'success', label: 'Live Telemetry' };
    return { tone: 'warning', label: 'Degraded' };
  };

  const overviewBadge = getOverviewBadge();

  const headerActions = (
    <div className={styles.headerControls}>
      <div className={styles.segmented} role="group" aria-label="Dashboard date range">
        {DATE_WINDOWS.map((win) => (
          <button
            key={win.key}
            type="button"
            className={`${styles.segBtn} ${dateWindow === win.key ? styles.segBtnActive : ''}`}
            onClick={() => setDateWindow(win.key)}
            aria-pressed={dateWindow === win.key}
          >
            {win.label}
          </button>
        ))}
      </div>

      <StatusIndicator
        tone={overviewBadge.tone}
        label={overviewBadge.label}
        title={
          lastUpdated
            ? `Refreshed ${formatTimestamp(lastUpdated)}`
            : `Backend target: ${settings.apiBaseUrl}`
        }
      />

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={refresh}
        disabled={loading}
      >
        <RefreshCw size={14} className={loading ? 'spin' : ''} />
        <span>Refresh</span>
      </button>
    </div>
  );

  const renderBody = () => {
    if (loading && !data) {
      return (
        <>
          <LoadingState variant="cards" cards={4} message="Loading Energy Overview..." />
          <div className={styles.heroGrid}>
            <LoadingState variant="chart" message="Loading generation chart..." />
            <LoadingState variant="skeleton" rows={6} message="Loading weather and accuracy..." />
          </div>
        </>
      );
    }

    if (error) {
      return (
        <ErrorState
          title="Failed to load live telemetry from TEJAS backend"
          error={error}
          onRetry={refresh}
        />
      );
    }

    if (!data || data.plants.length === 0) {
      return (
        <EmptyState
          icon={Cpu}
          title="No solar plants registered"
          description="Register at least one solar plant to begin tracking generation readings, forecasts, weather, and deviation alerts."
          action={
            <Link to="/plants" className="btn btn-primary">
              <span>Go to Plants</span>
              <ArrowRight size={15} />
            </Link>
          }
        />
      );
    }

    const activeWeatherEntry =
      data.weatherByPlant?.[weatherPlantId] ||
      Object.values(data.weatherByPlant || {})[0] ||
      null;

    const utilizationPct =
      summary.currentGenerationKw !== null && summary.totalCapacityKw > 0
        ? `${((summary.currentGenerationKw / summary.totalCapacityKw) * 100).toFixed(1)}% cap`
        : null;

    const residualLabel =
      summary.netResidualKw !== null
        ? `${summary.netResidualKw >= 0 ? '+' : ''}${summary.netResidualKw.toLocaleString()} kW vs pred`
        : null;

    const deviationTone =
      summary.highSeverityActive > 0
        ? 'danger'
        : summary.activeAlertsCount > 0
        ? 'warning'
        : 'success';

    const deviationHeadline = summary.activeAlertsCount > 0 ? 'Deviation Active' : 'Nominal';

    return (
      <>
        {/* Showstopper Solar Observatory Stage */}
        <SolarObservatoryHero
          summary={summary}
          plantsCount={data.plants.length}
          weatherEntry={activeWeatherEntry}
          dateWindow={dateWindow}
        />

        {/* Hairline Architectural KPI Rail */}
        <section className="grid-kpis" aria-label="Key Performance Indicators">
          <StatCard
            label="Current Generation"
            value={
              summary.currentGenerationKw !== null
                ? summary.currentGenerationKw.toLocaleString(undefined, { maximumFractionDigits: 1 })
                : '—'
            }
            unit="kW"
            trend={utilizationPct}
            subtext={`Reported by ${summary.reportingPlantsCount} of ${data.plants.length} plants`}
            icon={Sun}
            tone="accent"
            highlight
            loading={loading}
          />

          <StatCard
            label="Predicted Generation"
            value={
              summary.predictedGenerationKw !== null
                ? summary.predictedGenerationKw.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })
                : '—'
            }
            unit="kW"
            trend={residualLabel}
            subtext={`SVR forecasts across ${summary.forecastPlantsCount} plants`}
            icon={Zap}
            tone="info"
            loading={loading}
          />

          <StatCard
            label="Total Installed Capacity"
            value={summary.totalCapacityKw.toLocaleString()}
            unit="kW"
            trend={`${summary.totalCapacityMw} MW`}
            subtext={`${data.plants.length} registered solar installations`}
            icon={Gauge}
            tone="success"
            loading={loading}
          />

          <StatCard
            label="Performance / Deviation"
            value={deviationHeadline}
            trend={
              summary.accuracy.maeKw !== null ? `MAE ${summary.accuracy.maeKw} kW` : 'No matched pairs'
            }
            subtext={`${summary.openAlertsCount} open • ${summary.activeAlertsCount} active alert${
              summary.activeAlertsCount === 1 ? '' : 's'
            }`}
            icon={summary.activeAlertsCount > 0 ? ShieldAlert : Activity}
            tone={deviationTone}
            loading={loading}
          />
        </section>

        {/* Full-bleed Generation Curve + Atmospheric & SVR Alignment Band */}
        <div className={styles.heroGrid}>
          <PowerGenerationChart
            data={summary.generationSeries}
            dateWindow={dateWindow}
            onChangeWindow={setDateWindow}
            loading={loading}
            error={error}
            onRetry={refresh}
          />

          <div className={styles.sideStack}>
            <WeatherPanel
              weatherByPlant={data.weatherByPlant}
              selectedPlantId={weatherPlantId}
              onSelectPlant={setWeatherPlantId}
            />
            <PredictionPerformanceCard summary={summary} comparison={data.comparison} />
          </div>
        </div>

        {/* Fleet Horizon Matrix + Alerts & Activity Stream */}
        <div className={styles.bottomGrid}>
          <section className={styles.bandPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <span className="eyebrow">Fleet Telemetry Matrix</span>
                <h2 className={styles.sectionTitle}>Plant Performance</h2>
                <p className={styles.sectionSubtitle}>
                  Operational posture derived from latest SCADA/meter readings and open deviations
                </p>
              </div>
              <Link to="/plants" className={styles.sectionLink}>
                <span>All Plants</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            <div className={styles.plantsGrid}>
              {summary.plantCards.map((item) => (
                <PlantCard
                  key={item.plant.plant_id}
                  plant={item.plant}
                  currentPowerKw={item.currentPowerKw}
                  status={item.status}
                  statusReason={item.reason}
                />
              ))}
            </div>
          </section>

          <div className={styles.sideStack}>
            <section className={styles.bandPanel}>
              <div className={styles.sectionHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle size={15} style={{ color: 'var(--color-accent)' }} />
                  <div>
                    <h2 className={styles.sectionTitle}>Recent Alerts</h2>
                    <p className={styles.sectionSubtitle}>Active residual & deviation events</p>
                  </div>
                </div>
                <Link to="/alerts" className={styles.sectionLink}>
                  <span>View all alerts</span>
                  <ArrowRight size={13} />
                </Link>
              </div>

              {data.alerts.length === 0 ? (
                <EmptyState
                  title="No alerts recorded"
                  description="All monitored plants are operating within configured deviation thresholds."
                />
              ) : (
                <div className={styles.alertsList}>
                  {data.alerts.slice(0, 3).map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </div>
              )}
            </section>

            <ActivityFeed events={activityEvents} />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="SECTOR 01 · SOLAR OBSERVATORY"
        title="Energy Overview"
        subtitle="Real-time fleet solar output, SVR forecast alignment, atmospheric radiation telemetry, and anomaly protection."
        actions={headerActions}
      />
      {renderBody()}
    </div>
  );
}
