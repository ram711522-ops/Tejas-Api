import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Flame,
  GitCompareArrows,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sun,
  Thermometer,
  Trash2,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { previewComparison, runComparison } from '../api/deviationsApi';
import { fetchAllForecastsInRange } from '../api/forecastsApi';
import { listPlants } from '../api/plantsApi';
import { deleteReading, fetchAllReadingsInRange } from '../api/readingsApi';
import { ChartCard } from '../components/charts/ChartCard';
import { DataTable } from '../components/data-display/DataTable';
import { StatCard } from '../components/data-display/StatCard';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { ErrorState } from '../components/feedback/ErrorState';
import { ReadingFormModal } from '../components/forms/ReadingFormModal';
import { PageHeader } from '../components/layout/PageHeader';
import { useToast } from '../context/ToastContext';
import { alignForecastsAndReadings } from '../utils/analytics';
import { formatRelativeTime, formatTimestamp, getPresetDateRange, toUtcIso } from '../utils/date';
import styles from './ActualReadingsPage.module.css';

function ReadingTooltip({ active, payload }) {
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
      <div className="mono" style={{ color: 'var(--color-accent)', marginTop: 4 }}>
        Actual: {Number(pt.actual_power_kw).toLocaleString()} kW
      </div>
      {pt.predicted_power_kw !== undefined ? (
        <div className="mono" style={{ color: 'var(--color-predicted)', marginTop: 2 }}>
          Predicted: {Number(pt.predicted_power_kw).toLocaleString()} kW
        </div>
      ) : null}
      {pt.residual_kw !== undefined ? (
        <div className="mono" style={{ color: 'var(--text-primary)', marginTop: 2 }}>
          Diff: {pt.residual_kw >= 0 ? '+' : ''}
          {pt.residual_kw} kW
        </div>
      ) : null}
      {pt.module_temperature !== undefined ? (
        <div className="mono" style={{ color: '#fb7185', marginTop: 2 }}>
          Module Temp: {Number(pt.module_temperature).toFixed(1)} °C
        </div>
      ) : null}
    </div>
  );
}

function getComparisonBadge(compare) {
  if (!compare) return { tone: 'neutral', label: 'Awaiting Check', boxClass: styles.verdictNeutral };
  if (!compare.daytime) {
    return {
      tone: 'neutral',
      label: 'Low Irradiation · Skipped',
      boxClass: styles.verdictNeutral,
    };
  }
  if (!compare.deviation_detected) {
    return {
      tone: 'success',
      label: 'Close to Prediction · Nominal',
      boxClass: '',
    };
  }
  if (compare.severity === 'high') {
    return {
      tone: 'danger',
      label: 'High Deviation',
      boxClass: styles.verdictDanger,
    };
  }
  return {
    tone: 'warning',
    label: 'Moderate Deviation',
    boxClass: styles.verdictWarning,
  };
}

export function ActualReadingsPage() {
  const { addToast } = useToast();

  const [plants, setPlants] = useState([]);
  const [readings, setReadings] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [plantFilter, setPlantFilter] = useState('all');
  const [dateWindow, setDateWindow] = useState('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [chartMode, setChartMode] = useState('comparison');
  const [pageSkip, setPageSkip] = useState(0);
  const pageSize = 25;

  // Backend Prediction vs Actual Comparison state (/plants/{id}/compare)
  const [comparePlantId, setComparePlantId] = useState('');
  const [compareReadingId, setCompareReadingId] = useState('');
  const [compareForecastId, setCompareForecastId] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [compareResult, setCompareResult] = useState(null);

  // CRUD modals
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingReading, setEditingReading] = useState(null);
  const [deletingReading, setDeletingReading] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
        const [plantList, readingList, forecastList] = await Promise.all([
          listPlants(undefined, { force }),
          fetchAllReadingsInRange({ plant_id: plantParam, ...range }, undefined, { force }),
          fetchAllForecastsInRange({ plant_id: plantParam, ...range }, undefined, { force }).catch(
            () => []
          ),
        ]);

        setPlants(plantList);
        setReadings(readingList);
        setForecasts(forecastList);
        setComparePlantId((prev) => {
          if (plantFilter !== 'all') return plantFilter;
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
    [plantFilter, dateWindow, customStart, customEnd]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const executeCompare = useCallback(
    async (
      targetPlantId,
      { persistAlert = false, readingIdOverride, forecastIdOverride } = {}
    ) => {
      if (!targetPlantId) return;
      setCompareLoading(true);
      setCompareError('');
      try {
        const readingParam =
          readingIdOverride !== undefined
            ? readingIdOverride
            : compareReadingId
            ? Number(compareReadingId)
            : undefined;
        const forecastParam =
          forecastIdOverride !== undefined
            ? forecastIdOverride
            : compareForecastId
            ? Number(compareForecastId)
            : undefined;

        const res = persistAlert
          ? await runComparison(targetPlantId, {
              reading_id: readingParam,
              forecast_id: forecastParam,
              create_alert: true,
            })
          : await previewComparison(targetPlantId, {
              reading_id: readingParam,
              forecast_id: forecastParam,
            });

        setCompareResult(res);

        if (persistAlert) {
          addToast({
            tone: res.alert_generated ? 'warning' : 'success',
            title: res.alert_generated ? 'Deviation Alert Saved' : 'Deviation Audit Complete',
            message: res.reason,
          });
        }
      } catch (err) {
        setCompareResult(null);
        setCompareError(
          err?.message || 'Unable to run backend comparison for the selected plant/pair.'
        );
      } finally {
        setCompareLoading(false);
      }
    },
    [addToast, compareForecastId, compareReadingId]
  );

  // Automatically preview latest comparison when plant selection initializes/changes
  useEffect(() => {
    if (!comparePlantId) return;
    setCompareReadingId('');
    setCompareForecastId('');
    executeCompare(comparePlantId, {
      readingIdOverride: undefined,
      forecastIdOverride: undefined,
    });
    // Only auto-trigger on plant change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparePlantId]);

  const filteredReadings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = readings.filter((r) => {
      if (sourceFilter !== 'all' && String(r.source) !== sourceFilter) return false;
      if (q) {
        const hay = [r.id, r.plant_id, r.source, formatTimestamp(r.timestamp)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...base].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [readings, sourceFilter, searchQuery]);

  const metrics = useMemo(() => {
    if (filteredReadings.length === 0) {
      return { peakKw: null, avgPowerKw: null, avgIrr: null, peakModTemp: null };
    }
    let peakKw = 0;
    let sumPower = 0;
    let sumIrr = 0;
    let peakModTemp = -Infinity;
    for (const r of filteredReadings) {
      const pwr = Number(r.actual_power_kw) || 0;
      peakKw = Math.max(peakKw, pwr);
      sumPower += pwr;
      sumIrr += Number(r.irradiation) || 0;
      peakModTemp = Math.max(peakModTemp, Number(r.module_temperature) || -Infinity);
    }
    return {
      peakKw,
      avgPowerKw: sumPower / filteredReadings.length,
      avgIrr: sumIrr / filteredReadings.length,
      peakModTemp: Number.isFinite(peakModTemp) ? peakModTemp : null,
    };
  }, [filteredReadings]);

  const alignedPairs = useMemo(() => {
    return alignForecastsAndReadings(forecasts, filteredReadings, 30).map((p) => ({
      ...p,
      label: new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(p.timestamp)),
    }));
  }, [forecasts, filteredReadings]);

  const thermalSeries = useMemo(() => {
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

  const plantReadingsForCompare = useMemo(
    () => readings.filter((r) => r.plant_id === comparePlantId),
    [readings, comparePlantId]
  );

  const plantForecastsForCompare = useMemo(
    () => forecasts.filter((f) => f.plant_id === comparePlantId),
    [forecasts, comparePlantId]
  );

  const pagedRows = useMemo(
    () => filteredReadings.slice(pageSkip, pageSkip + pageSize),
    [filteredReadings, pageSkip]
  );

  const handleConfirmDelete = async () => {
    if (!deletingReading) return;
    setDeleteLoading(true);
    try {
      await deleteReading(deletingReading.id);
      addToast({
        tone: 'success',
        title: 'Reading Deleted',
        message: `Removed reading #${deletingReading.id}.`,
      });
      setDeletingReading(null);
      await loadData(true);
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Delete Failed',
        message: err?.message || 'Unable to delete reading record.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const verdict = getComparisonBadge(compareResult);

  const columns = [
    { key: 'id', label: 'ID', mono: true },
    { key: 'plant_id', label: 'Plant', mono: true },
    {
      key: 'timestamp',
      label: 'Reading Time',
      render: (r) => (
        <div>
          <div>{formatTimestamp(r.timestamp)}</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            {formatRelativeTime(r.timestamp)}
          </div>
        </div>
      ),
    },
    {
      key: 'actual_power_kw',
      label: 'Actual Power (kW)',
      align: 'right',
      numeric: true,
      render: (r) => (
        <strong className="mono" style={{ color: 'var(--color-accent)' }}>
          {Number(r.actual_power_kw).toLocaleString(undefined, { maximumFractionDigits: 1 })} kW
        </strong>
      ),
    },
    {
      key: 'irradiation',
      label: 'Irradiation (kW/m²)',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.irradiation).toFixed(2),
    },
    {
      key: 'module_temperature',
      label: 'Module (°C)',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.module_temperature).toFixed(1),
    },
    {
      key: 'ambient_temperature',
      label: 'Ambient (°C)',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.ambient_temperature).toFixed(1),
    },
    {
      key: 'source',
      label: 'Source',
      render: (r) => <StatusIndicator tone="neutral" label={r.source} />,
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
            title="Compare this reading against forecast"
            aria-label={`Compare reading ${row.id}`}
            onClick={() => {
              setComparePlantId(row.plant_id);
              setCompareReadingId(String(row.id));
              executeCompare(row.plant_id, {
                readingIdOverride: row.id,
                forecastIdOverride: undefined,
              });
            }}
          >
            <GitCompareArrows size={13} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={`Edit reading ${row.id}`}
            onClick={() => {
              setModalMode('edit');
              setEditingReading(row);
              setModalOpen(true);
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={`Delete reading ${row.id}`}
            style={{ color: 'var(--color-danger)' }}
            onClick={() => setDeletingReading(row)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  const activeChartMode =
    chartMode === 'comparison' && alignedPairs.length === 0 && thermalSeries.length > 0
      ? 'thermal'
      : chartMode;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="SECTOR 04 · ACTUAL TELEMETRY & COMPARISON"
        title="Actual SCADA Readings"
        subtitle="Log measured solar generation readings and evaluate live performance against saved forecasts using backend deviation rules."
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
                setEditingReading(null);
                setModalOpen(true);
              }}
            >
              <Plus size={15} />
              <span>Add Reading</span>
            </button>
          </>
        }
      />

      {/* Summary Statistics (Derived Strictly From Filtered Readings) */}
      <section className="grid-kpis" aria-label="Telemetry summary">
        <StatCard
          label="Filtered Readings"
          value={filteredReadings.length.toLocaleString()}
          trend={
            metrics.avgPowerKw !== null
              ? `Mean ${metrics.avgPowerKw.toLocaleString(undefined, { maximumFractionDigits: 1 })} kW`
              : undefined
          }
          subtext={`Window: ${dateWindow.toUpperCase()}`}
          icon={Activity}
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Peak AC Output"
          value={
            metrics.peakKw !== null
              ? metrics.peakKw.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : '—'
          }
          unit={metrics.peakKw !== null ? 'kW' : undefined}
          subtext="Maximum observed generation"
          icon={Sun}
          tone="accent"
          highlight={metrics.peakKw !== null}
          loading={loading}
        />
        <StatCard
          label="Mean Irradiation"
          value={metrics.avgIrr !== null ? metrics.avgIrr.toFixed(3) : '—'}
          unit={metrics.avgIrr !== null ? 'kW/m²' : undefined}
          subtext="Average pyranometer flux"
          icon={Flame}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Peak Module Temp"
          value={metrics.peakModTemp !== null ? metrics.peakModTemp.toFixed(1) : '—'}
          unit={metrics.peakModTemp !== null ? '°C' : undefined}
          subtext="Highest array surface reading"
          icon={Thermometer}
          tone="warning"
          loading={loading}
        />
      </section>

      {/* Prediction vs Actual Performance Comparison Workbench */}
      <section className={styles.comparePanel} aria-label="Prediction vs Actual Comparison">
        <div className={styles.compareHeader}>
          <div>
            <span className="eyebrow">BACKEND DEVIATION ENGINE (/compare)</span>
            <h2 className={styles.compareTitle}>Prediction vs Actual Comparison</h2>
            <p className={styles.compareSub}>
              Evaluated with FastAPI capacity-scaled 6×MAD &amp; relative thresholds — zero
              client-invented limits
            </p>
          </div>

          <div className={styles.compareControls}>
            <div className={styles.ctrlGroup}>
              <label htmlFor="cmp-plant" className={styles.ctrlLabel}>
                Plant
              </label>
              <select
                id="cmp-plant"
                className={`select-field ${styles.filterSelect}`}
                value={comparePlantId}
                onChange={(e) => setComparePlantId(e.target.value)}
              >
                {plants.length === 0 ? <option value="">No plants</option> : null}
                {plants.map((p) => (
                  <option key={p.plant_id} value={p.plant_id}>
                    {p.plant_id} — {p.plant_name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.ctrlGroup}>
              <label htmlFor="cmp-reading" className={styles.ctrlLabel}>
                Reading Pair
              </label>
              <select
                id="cmp-reading"
                className={`select-field ${styles.filterSelect}`}
                value={compareReadingId}
                onChange={(e) => setCompareReadingId(e.target.value)}
              >
                <option value="">Latest Reading</option>
                {plantReadingsForCompare.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} · {Number(r.actual_power_kw).toFixed(0)} kW ({formatTimestamp(r.timestamp)})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.ctrlGroup}>
              <label htmlFor="cmp-forecast" className={styles.ctrlLabel}>
                Forecast Pair
              </label>
              <select
                id="cmp-forecast"
                className={`select-field ${styles.filterSelect}`}
                value={compareForecastId}
                onChange={(e) => setCompareForecastId(e.target.value)}
              >
                <option value="">Latest Forecast</option>
                {plantForecastsForCompare.map((f) => (
                  <option key={f.id} value={f.id}>
                    #{f.id} · {Number(f.predicted_power_kw).toFixed(0)} kW ({formatTimestamp(f.forecast_timestamp)})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!comparePlantId || compareLoading}
              onClick={() => executeCompare(comparePlantId, { persistAlert: false })}
            >
              {compareLoading ? <Loader2 size={13} className="spin" /> : <GitCompareArrows size={13} />}
              <span>Compare Latest Pair</span>
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!comparePlantId || compareLoading}
              onClick={() => executeCompare(comparePlantId, { persistAlert: true })}
            >
              <ShieldAlert size={13} />
              <span>Audit &amp; Flag Alert</span>
            </button>
          </div>
        </div>

        {compareError ? (
          <div className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }} role="status">
            {compareError}
          </div>
        ) : compareResult ? (
          <>
            <div className={styles.compareGrid}>
              <div className={styles.compareCell}>
                <span className={styles.compareCellLabel}>Predicted Power</span>
                <span className={styles.compareCellVal} style={{ color: 'var(--color-predicted)' }}>
                  {Number(compareResult.predicted_power_kw).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span style={{ fontSize: 12 }}>kW</span>
                </span>
                <span className={styles.compareCellMeta}>
                  Forecast #{compareResult.forecast_id}
                </span>
              </div>

              <div className={styles.compareCell}>
                <span className={styles.compareCellLabel}>Actual Power</span>
                <span className={styles.compareCellVal} style={{ color: 'var(--color-accent)' }}>
                  {Number(compareResult.actual_power_kw).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span style={{ fontSize: 12 }}>kW</span>
                </span>
                <span className={styles.compareCellMeta}>
                  Reading #{compareResult.reading_id}
                </span>
              </div>

              <div className={styles.compareCell}>
                <span className={styles.compareCellLabel}>Difference (Actual − Pred)</span>
                <span className={styles.compareCellVal}>
                  {compareResult.residual_kw >= 0 ? '+' : ''}
                  {Number(compareResult.residual_kw).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span style={{ fontSize: 12 }}>kW</span>
                </span>
                <span className={styles.compareCellMeta}>
                  |Δ| = {compareResult.deviation_kw} kW
                </span>
              </div>

              <div className={styles.compareCell}>
                <span className={styles.compareCellLabel}>Deviation Percentage</span>
                <span className={styles.compareCellVal}>
                  {compareResult.deviation_percent !== null &&
                  compareResult.deviation_percent !== undefined
                    ? `${compareResult.deviation_percent}%`
                    : '—'}
                </span>
                <span className={styles.compareCellMeta}>
                  Backend Threshold: {compareResult.threshold_kw} kW
                </span>
              </div>

              <div className={styles.compareCell}>
                <span className={styles.compareCellLabel}>Daytime Irradiance</span>
                <span className={styles.compareCellVal}>
                  {Number(compareResult.irradiation).toFixed(2)}{' '}
                  <span style={{ fontSize: 12 }}>kW/m²</span>
                </span>
                <span className={styles.compareCellMeta}>
                  {compareResult.daytime ? 'Daytime active (>0.05)' : 'Below daytime cutoff'}
                </span>
              </div>
            </div>

            <div className={`${styles.verdictBanner} ${verdict.boxClass}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusIndicator tone={verdict.tone} label={verdict.label} />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {compareResult.reason}
                </span>
              </div>
              {compareResult.alert_generated ? (
                <StatusIndicator tone="warning" label={`Alert #${compareResult.alert?.id} Created`} />
              ) : null}
            </div>
          </>
        ) : (
          <p className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Select a plant and click <strong>Compare Latest Pair</strong> to evaluate the latest
            reading against saved SVR forecasts.
          </p>
        )}
      </section>

      {/* Prediction vs Actual Comparison & Telemetry Correlation Chart */}
      <ChartCard
        title={
          activeChartMode === 'comparison'
            ? 'Prediction vs Actual Power Trajectory'
            : 'Actual Power & Thermal Correlation'
        }
        subtitle={
          activeChartMode === 'comparison'
            ? 'Aligned forecast and reading pairs within ±30 min tolerance (kW)'
            : 'Measured AC generation (kW) plotted against module temperature (°C)'
        }
        actions={
          <div className={styles.chartTabs} role="tablist" aria-label="Chart view mode">
            <button
              type="button"
              role="tab"
              aria-selected={activeChartMode === 'comparison'}
              className={`${styles.chartTabBtn} ${
                activeChartMode === 'comparison' ? styles.chartTabBtnActive : ''
              }`}
              onClick={() => setChartMode('comparison')}
            >
              Prediction vs Actual ({alignedPairs.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeChartMode === 'thermal'}
              className={`${styles.chartTabBtn} ${
                activeChartMode === 'thermal' ? styles.chartTabBtnActive : ''
              }`}
              onClick={() => setChartMode('thermal')}
            >
              Thermal &amp; Power ({thermalSeries.length})
            </button>
          </div>
        }
        loading={loading}
        error={error?.message || null}
        isEmpty={
          activeChartMode === 'comparison'
            ? alignedPairs.length === 0
            : thermalSeries.length === 0
        }
        emptyTitle="No generation telemetry in window"
        emptyDescription="Expand the date window or log a reading to visualize power comparison curves."
        onRetry={() => loadData(true)}
        height={275}
      >
        <div style={{ width: '100%', height: 275 }}>
          <ResponsiveContainer width="100%" height="100%">
            {activeChartMode === 'comparison' ? (
              <ComposedChart
                data={alignedPairs}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="cmpActualFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} minTickGap={26} />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`)}
                />
                <Tooltip content={<ReadingTooltip />} />
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
                  fill="url(#cmpActualFill)"
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
              <ComposedChart
                data={thermalSeries}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="rdPowerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} minTickGap={26} />
                <YAxis
                  yAxisId="kw"
                  stroke="var(--text-muted)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`)}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  stroke="#fb7185"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}°`}
                />
                <Tooltip content={<ReadingTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                />
                <Area
                  yAxisId="kw"
                  type="monotone"
                  dataKey="actual_power_kw"
                  name="Actual Power (kW)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#rdPowerGrad)"
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="module_temperature"
                  name="Module Temp (°C)"
                  stroke="#fb7185"
                  strokeWidth={1.75}
                  dot={false}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Search, Plant & Date/Time Filter Toolbar */}
      <section className={styles.toolbar} aria-label="Reading filters">
        <div className={styles.toolbarTop}>
          <div className={styles.filtersLeft}>
            <div className={styles.searchWrap}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="search"
                className={`input-field ${styles.searchInput}`}
                placeholder="Search plant ID, source, or ID..."
                aria-label="Search actual readings"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPageSkip(0);
                }}
              />
            </div>

            <select
              className={`select-field ${styles.filterSelect}`}
              aria-label="Filter readings by plant"
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
              aria-label="Filter readings by window"
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
              aria-label="Filter readings by source"
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPageSkip(0);
              }}
            >
              <option value="all">All Sources</option>
              <option value="scada">scada</option>
              <option value="inverter">inverter</option>
              <option value="meter">meter</option>
              <option value="historical_dataset">historical_dataset</option>
              <option value="manual">manual</option>
            </select>
          </div>

          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredReadings.length} reading{filteredReadings.length === 1 ? '' : 's'}
          </span>
        </div>

        {dateWindow === 'custom' ? (
          <div className={styles.customRangeRow}>
            <div className={styles.ctrlGroup}>
              <label htmlFor="rd-start" className={styles.ctrlLabel}>
                Start UTC / Local
              </label>
              <input
                id="rd-start"
                type="datetime-local"
                className="input-field mono"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className={styles.ctrlGroup}>
              <label htmlFor="rd-end" className={styles.ctrlLabel}>
                End UTC / Local
              </label>
              <input
                id="rd-end"
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
        <ErrorState title="Failed to load readings" error={error} onRetry={() => loadData(true)} />
      ) : (
        <DataTable
          columns={columns}
          rows={pagedRows}
          loading={loading}
          emptyTitle="No readings logged"
          emptyDescription="Add a solar generation reading or adjust your search, plant, and date filters."
          pagination={
            filteredReadings.length > pageSize
              ? {
                  skip: pageSkip,
                  hasMore: pageSkip + pageSize < filteredReadings.length,
                  onPrev: () => setPageSkip((s) => Math.max(0, s - pageSize)),
                  onNext: () => setPageSkip((s) => s + pageSize),
                }
              : null
          }
        />
      )}

      <ReadingFormModal
        open={modalOpen}
        mode={modalMode}
        initialReading={editingReading}
        plants={plants}
        defaultPlantId={plantFilter !== 'all' ? plantFilter : comparePlantId || plants[0]?.plant_id}
        onClose={() => setModalOpen(false)}
        onSuccess={async (saved, m) => {
          addToast({
            tone: 'success',
            title: m === 'edit' ? 'Reading Updated' : 'Reading Saved',
            message: `${saved.plant_id}: ${Number(saved.actual_power_kw).toFixed(1)} kW (${saved.source})`,
          });
          setComparePlantId(saved.plant_id);
          setCompareReadingId(String(saved.id));
          await loadData(true);
          executeCompare(saved.plant_id, { readingIdOverride: saved.id });
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingReading)}
        title={`Delete reading #${deletingReading?.id}?`}
        description="This permanently removes the reading record from MySQL."
        confirmLabel="Delete Reading"
        loading={deleteLoading}
        onCancel={() => setDeletingReading(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
