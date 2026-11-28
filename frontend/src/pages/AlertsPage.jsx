import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  LayoutList,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { deleteAlert, listAlerts, updateAlert } from '../api/alertsApi';
import { getForecast } from '../api/forecastsApi';
import { listPlants } from '../api/plantsApi';
import { getReading } from '../api/readingsApi';
import { StatCard } from '../components/data-display/StatCard';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { AlertFormModal } from '../components/forms/AlertFormModal';
import { PageHeader } from '../components/layout/PageHeader';
import { useToast } from '../context/ToastContext';
import { formatRelativeTime, formatTimestamp } from '../utils/date';
import styles from './AlertsPage.module.css';

// Backend AlertSeverity only defines: "low" | "medium" | "high"
const SEV_TONE = { high: 'high', medium: 'warning', low: 'neutral' };
const STATUS_TONE = { open: 'danger', acknowledged: 'warning', resolved: 'success' };
const SEV_BORDER = { high: styles.sevHigh, medium: styles.sevMedium, low: styles.sevLow };
const LIFECYCLE_STAGES = ['open', 'acknowledged', 'resolved'];

function formatLinkedRefs(alert) {
  const parts = [];
  if (alert.forecast_id) parts.push(`F#${alert.forecast_id}`);
  if (alert.reading_id) parts.push(`R#${alert.reading_id}`);
  return parts.length > 0 ? parts.join(' / ') : 'Unlinked';
}

export function AlertsPage() {
  const { addToast } = useToast();

  const [plants, setPlants] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [plantFilter, setPlantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [viewMode, setViewMode] = useState('queue');
  const [selectedId, setSelectedId] = useState(null);

  // Linked forecast/reading evidence state
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedForecast, setLinkedForecast] = useState(null);
  const [linkedReading, setLinkedReading] = useState(null);

  // Lifecycle & modal states
  const [updatingId, setUpdatingId] = useState(null);
  const [resolvingAlert, setResolvingAlert] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingAlert, setEditingAlert] = useState(null);
  const [deletingAlert, setDeletingAlert] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        // Fetch scoped by plantFilter so KPI counts remain accurate across status/severity/search filters
        const [plantList, alertList] = await Promise.all([
          listPlants(undefined, { force }),
          listAlerts(
            {
              plant_id: plantFilter === 'all' ? undefined : plantFilter,
              limit: 500,
            },
            undefined,
            { force }
          ),
        ]);
        setPlants(plantList);
        setAlerts(alertList);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [plantFilter]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const plantMap = useMemo(() => {
    const map = new Map();
    for (const plant of plants) {
      map.set(plant.plant_id, plant);
    }
    return map;
  }, [plants]);

  const counts = useMemo(() => {
    return {
      total: alerts.length,
      open: alerts.filter((a) => a.status === 'open').length,
      ack: alerts.filter((a) => a.status === 'acknowledged').length,
      resolved: alerts.filter((a) => a.status === 'resolved').length,
      highActive: alerts.filter((a) => a.severity === 'high' && a.status !== 'resolved').length,
    };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return alerts.filter((alert) => {
      if (statusFilter !== 'all' && alert.status !== statusFilter) return false;
      if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
      if (!q) return true;
      const plantName = plantMap.get(alert.plant_id)?.plant_name || '';
      const haystack = [
        `#${alert.id}`,
        String(alert.id),
        alert.plant_id,
        plantName,
        alert.severity,
        alert.status,
        alert.message,
        alert.forecast_id ? `f#${alert.forecast_id}` : '',
        alert.reading_id ? `r#${alert.reading_id}` : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [alerts, statusFilter, severityFilter, searchQuery, plantMap]);

  const selectedAlert = useMemo(() => {
    if (filteredAlerts.length === 0) return null;
    return filteredAlerts.find((a) => a.id === selectedId) || filteredAlerts[0];
  }, [filteredAlerts, selectedId]);

  useEffect(() => {
    let active = true;
    async function loadLinks() {
      setLinkedForecast(null);
      setLinkedReading(null);
      if (!selectedAlert || (!selectedAlert.forecast_id && !selectedAlert.reading_id)) {
        setLinkedLoading(false);
        return;
      }
      setLinkedLoading(true);
      const [fc, rd] = await Promise.allSettled([
        selectedAlert.forecast_id ? getForecast(selectedAlert.forecast_id) : Promise.resolve(null),
        selectedAlert.reading_id ? getReading(selectedAlert.reading_id) : Promise.resolve(null),
      ]);
      if (!active) return;
      if (fc.status === 'fulfilled') setLinkedForecast(fc.value);
      if (rd.status === 'fulfilled') setLinkedReading(rd.value);
      setLinkedLoading(false);
    }
    loadLinks();
    return () => {
      active = false;
    };
  }, [selectedAlert]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    plantFilter !== 'all' ||
    statusFilter !== 'all' ||
    severityFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setPlantFilter('all');
    setStatusFilter('all');
    setSeverityFilter('all');
  };

  const handleTransitionStatus = async (alert, nextStatus) => {
    setUpdatingId(alert.id);
    try {
      const updated = await updateAlert(alert.id, { status: nextStatus });
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      addToast({
        tone: 'success',
        title: nextStatus === 'resolved' ? 'Alert Resolved' : 'Alert Acknowledged',
        message: `Alert #${alert.id} moved from ${alert.status} → ${updated.status}.`,
      });
      await loadData(true);
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Status Update Failed',
        message: err?.message || 'Unable to update alert status.',
      });
    } finally {
      setUpdatingId(null);
      setResolvingAlert(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAlert) return;
    setDeleteLoading(true);
    try {
      await deleteAlert(deletingAlert.id);
      addToast({
        tone: 'success',
        title: 'Alert Deleted',
        message: `Removed alert #${deletingAlert.id}.`,
      });
      setDeletingAlert(null);
      await loadData(true);
    } catch (err) {
      addToast({
        tone: 'error',
        title: 'Delete Failed',
        message: err?.message || 'Unable to delete alert.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const selectedPlant = selectedAlert ? plantMap.get(selectedAlert.plant_id) : null;
  const stageIndex = selectedAlert ? LIFECYCLE_STAGES.indexOf(selectedAlert.status) : -1;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="SECTOR 06 · ALERTS & MONITORING CENTER"
        title="Deviation Alerts & Incidents"
        subtitle="Monitor solar power residual anomalies, inspect linked forecast/reading evidence, and manage incident lifecycle from open to resolved."
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
                setEditingAlert(null);
                setModalOpen(true);
              }}
            >
              <Plus size={15} />
              <span>Create Alert</span>
            </button>
          </>
        }
      />

      {/* Alerts Overview Summary Cards */}
      <section className="grid-kpis" aria-label="Alert summary counts">
        <StatCard
          label="Total Alerts"
          value={counts.total}
          subtext={`${counts.highActive} active high severity`}
          tone={counts.highActive > 0 ? 'warning' : 'neutral'}
          icon={Bell}
          loading={loading}
        />
        <StatCard
          label="Open Alerts"
          value={counts.open}
          subtext="Awaiting operator triage"
          tone={counts.open > 0 ? 'danger' : 'success'}
          icon={ShieldAlert}
          highlight={counts.open > 0}
          loading={loading}
        />
        <StatCard
          label="Acknowledged"
          value={counts.ack}
          subtext="Under active investigation"
          tone="warning"
          icon={AlertTriangle}
          loading={loading}
        />
        <StatCard
          label="Resolved"
          value={counts.resolved}
          subtext="Closed with timestamp"
          tone="success"
          icon={CheckCircle2}
          loading={loading}
        />
      </section>

      {/* Search, Filters & View Toggle */}
      <section className={styles.toolbar} aria-label="Alert filters">
        <div className={styles.toolbarTop}>
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="search"
              className={`input-field ${styles.searchInput}`}
              aria-label="Search alerts"
              placeholder="Search ID, plant, description, forecast or reading ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="Clear alert search"
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className={styles.toolbarRight}>
            <div className={styles.viewToggle} role="tablist" aria-label="Alert view mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'queue'}
                className={`${styles.viewBtn} ${viewMode === 'queue' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('queue')}
              >
                <LayoutList size={13} />
                <span>Queue</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                className={`${styles.viewBtn} ${viewMode === 'table' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('table')}
              >
                <Table2 size={13} />
                <span>Table</span>
              </button>
            </div>

            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {filteredAlerts.length} incident{filteredAlerts.length === 1 ? '' : 's'}
              {filteredAlerts.length !== alerts.length ? ` of ${alerts.length}` : ''}
            </span>
          </div>
        </div>

        <div className={styles.filtersRow}>
          <div className={styles.filtersLeft}>
            <select
              className={`select-field ${styles.filterSelect}`}
              aria-label="Filter alerts by plant"
              value={plantFilter}
              onChange={(e) => setPlantFilter(e.target.value)}
            >
              <option value="all">All Plants</option>
              {plants.map((p) => (
                <option key={p.plant_id} value={p.plant_id}>
                  {p.plant_id} — {p.plant_name}
                </option>
              ))}
            </select>

            <select
              className={`select-field ${styles.filterSelect}`}
              aria-label="Filter alerts by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="open">open</option>
              <option value="acknowledged">acknowledged</option>
              <option value="resolved">resolved</option>
            </select>

            <select
              className={`select-field ${styles.filterSelect}`}
              aria-label="Filter alerts by severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="all">All Severities (Backend)</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </div>

          {hasActiveFilters ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear Filters
            </button>
          ) : null}
        </div>
      </section>

      {loading && alerts.length === 0 ? (
        <LoadingState variant="skeleton" rows={5} message="Loading deviation alerts..." />
      ) : error ? (
        <ErrorState title="Failed to load alerts" error={error} onRetry={() => loadData(true)} />
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={hasActiveFilters ? 'No alerts match these filters' : 'No alerts recorded'}
          description={
            hasActiveFilters
              ? 'Try widening your plant, status, severity, or search filters.'
              : 'All monitored plants are operating cleanly within deviation bounds.'
          }
          action={
            hasActiveFilters ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Reset Filters
              </button>
            ) : null
          }
        />
      ) : (
        <div className={styles.split}>
          {viewMode === 'table' ? (
            <div className={styles.tableWrap}>
              <div className={styles.tableScroll}>
                <table className={styles.table} aria-label="Deviation alerts table">
                  <thead>
                    <tr>
                      <th>Alert ID</th>
                      <th>Plant</th>
                      <th>Severity</th>
                      <th>Description</th>
                      <th>Linked Refs</th>
                      <th>Triggered</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert) => {
                      const selected = selectedAlert?.id === alert.id;
                      const plantName = plantMap.get(alert.plant_id)?.plant_name;
                      return (
                        <tr
                          key={alert.id}
                          className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''}`}
                          onClick={() => setSelectedId(alert.id)}
                        >
                          <td>
                            <button
                              type="button"
                              className={styles.rowSelectBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(alert.id);
                              }}
                            >
                              #{alert.id}
                            </button>
                          </td>
                          <td>
                            <div className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
                              {alert.plant_id}
                            </div>
                            {plantName ? (
                              <div className={styles.plantSub}>{plantName}</div>
                            ) : null}
                          </td>
                          <td>
                            <StatusIndicator
                              tone={SEV_TONE[alert.severity] || 'neutral'}
                              label={alert.severity.toUpperCase()}
                            />
                          </td>
                          <td className={styles.tableDesc}>{alert.message}</td>
                          <td className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {formatLinkedRefs(alert)}
                          </td>
                          <td
                            className="mono"
                            style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                            title={formatTimestamp(alert.triggered_at)}
                          >
                            {formatRelativeTime(alert.triggered_at)}
                          </td>
                          <td>
                            <StatusIndicator
                              tone={STATUS_TONE[alert.status] || 'neutral'}
                              label={alert.status}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className={styles.queue} role="list" aria-label="Alert queue">
              {filteredAlerts.map((alert) => {
                const selected = selectedAlert?.id === alert.id;
                const plantName = plantMap.get(alert.plant_id)?.plant_name;
                return (
                  <button
                    key={alert.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedId(alert.id)}
                    className={`${styles.queueCard} ${SEV_BORDER[alert.severity] || ''} ${
                      selected ? styles.queueCardSelected : ''
                    }`}
                  >
                    <div className={styles.cardTop}>
                      <div className={styles.cardBadges}>
                        <span className={styles.alertIdTag}>#{alert.id}</span>
                        <StatusIndicator
                          tone={SEV_TONE[alert.severity] || 'neutral'}
                          label={alert.severity.toUpperCase()}
                        />
                        <code className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
                          {alert.plant_id}
                        </code>
                        {plantName ? <span className={styles.plantSub}>{plantName}</span> : null}
                      </div>
                      <StatusIndicator tone={STATUS_TONE[alert.status] || 'neutral'} label={alert.status} />
                    </div>
                    <div className={styles.cardMessage}>{alert.message}</div>
                    <div className={styles.cardMeta}>
                      <span>
                        Pred {Number(alert.predicted_power_kw).toFixed(0)} kW → Act{' '}
                        {Number(alert.actual_power_kw).toFixed(0)} kW · {formatLinkedRefs(alert)}
                      </span>
                      <span title={formatTimestamp(alert.triggered_at)}>
                        {formatRelativeTime(alert.triggered_at)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedAlert ? (
            <aside className={styles.dossier} aria-label="Selected alert dossier">
              <div className={styles.dossierHeader}>
                <div>
                  <span className="eyebrow">INCIDENT DOSSIER #{selectedAlert.id}</span>
                  <h2 className={styles.dossierTitle}>
                    {selectedPlant ? `${selectedPlant.plant_name} (${selectedAlert.plant_id})` : `${selectedAlert.plant_id} Deviation`}
                  </h2>
                  <p className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    Triggered {formatTimestamp(selectedAlert.triggered_at)}
                  </p>
                </div>
                <div className={styles.dossierBadges}>
                  <StatusIndicator
                    tone={STATUS_TONE[selectedAlert.status] || 'neutral'}
                    label={selectedAlert.status.toUpperCase()}
                  />
                  <StatusIndicator
                    tone={SEV_TONE[selectedAlert.severity] || 'neutral'}
                    label={`${selectedAlert.severity.toUpperCase()} SEVERITY`}
                  />
                </div>
              </div>

              {/* Lifecycle Stage Indicator */}
              <div className={styles.lifecycleTrack} aria-label="Alert lifecycle stage">
                {LIFECYCLE_STAGES.map((stage, idx) => {
                  const isCurrent = idx === stageIndex;
                  const isDone = idx < stageIndex || (stage === 'resolved' && selectedAlert.status === 'resolved');
                  return (
                    <div
                      key={stage}
                      className={`${styles.lifecycleStep} ${
                        isDone ? styles.lifecycleDone : isCurrent ? styles.lifecycleCurrent : ''
                      }`}
                    >
                      {stage}
                    </div>
                  );
                })}
              </div>

              <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {selectedAlert.message}
              </p>

              <div className={styles.metaRows}>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>Associated Plant</span>
                  <span className={styles.metaVal}>
                    {selectedPlant
                      ? `${selectedPlant.plant_id} · ${selectedPlant.installed_capacity_mw} MW (${selectedPlant.plant_type})`
                      : selectedAlert.plant_id}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>Created At</span>
                  <span className={styles.metaVal}>{formatTimestamp(selectedAlert.created_at)}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>Triggered At</span>
                  <span className={styles.metaVal}>{formatTimestamp(selectedAlert.triggered_at)}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>Resolved At</span>
                  <span className={styles.metaVal}>
                    {selectedAlert.resolved_at
                      ? formatTimestamp(selectedAlert.resolved_at)
                      : 'Pending resolution'}
                  </span>
                </div>
              </div>

              <div className={styles.metricsGrid}>
                <div className={styles.metricCell}>
                  <div className={styles.metricLabel}>Predicted Power</div>
                  <div className={styles.metricVal}>{selectedAlert.predicted_power_kw} kW</div>
                </div>
                <div className={styles.metricCell}>
                  <div className={styles.metricLabel}>Actual Power</div>
                  <div className={styles.metricVal}>{selectedAlert.actual_power_kw} kW</div>
                </div>
                <div className={styles.metricCell}>
                  <div className={styles.metricLabel}>Residual</div>
                  <div className={styles.metricVal}>{selectedAlert.residual_kw ?? '—'} kW</div>
                </div>
                <div className={styles.metricCell}>
                  <div className={styles.metricLabel}>Deviation</div>
                  <div className={styles.metricVal}>
                    {selectedAlert.deviation_percent !== null &&
                    selectedAlert.deviation_percent !== undefined
                      ? `${Number(selectedAlert.deviation_percent).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className={styles.linkedBox}>
                <span className="eyebrow">Linked Forecast &amp; Reading Evidence</span>
                {linkedLoading ? (
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={12} className="spin" />
                    <span>Loading linked records...</span>
                  </div>
                ) : !selectedAlert.forecast_id && !selectedAlert.reading_id ? (
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    No forecast_id or reading_id attached to this alert.
                  </div>
                ) : (
                  <>
                    {selectedAlert.forecast_id ? (
                      <div className={styles.linkedItem}>
                        <div className="mono" style={{ fontSize: 11.5, color: 'var(--color-predicted)' }}>
                          Forecast #{selectedAlert.forecast_id}
                          {linkedForecast
                            ? `: ${linkedForecast.predicted_power_kw} kW (${linkedForecast.source})`
                            : ' (record unavailable)'}
                        </div>
                        {linkedForecast ? (
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                            {formatTimestamp(linkedForecast.forecast_timestamp)}
                            {linkedForecast.model_version ? ` · ${linkedForecast.model_version}` : ''}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedAlert.reading_id ? (
                      <div className={styles.linkedItem}>
                        <div className="mono" style={{ fontSize: 11.5, color: 'var(--color-accent)' }}>
                          Reading #{selectedAlert.reading_id}
                          {linkedReading
                            ? `: ${linkedReading.actual_power_kw} kW · Irr ${linkedReading.irradiation} kW/m²`
                            : ' (record unavailable)'}
                        </div>
                        {linkedReading ? (
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                            {formatTimestamp(linkedReading.timestamp)} · Amb{' '}
                            {linkedReading.ambient_temperature}°C / Mod{' '}
                            {linkedReading.module_temperature}°C ({linkedReading.source})
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className={styles.actionsBar}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selectedAlert.status === 'open' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={updatingId === selectedAlert.id}
                      onClick={() => handleTransitionStatus(selectedAlert, 'acknowledged')}
                    >
                      {updatingId === selectedAlert.id ? <Loader2 size={13} className="spin" /> : null}
                      <span>Acknowledge</span>
                    </button>
                  ) : null}
                  {selectedAlert.status !== 'resolved' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={updatingId === selectedAlert.id}
                      onClick={() => setResolvingAlert(selectedAlert)}
                    >
                      Resolve
                    </button>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setModalMode('edit');
                      setEditingAlert(selectedAlert);
                      setModalOpen(true);
                    }}
                  >
                    <Pencil size={13} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    aria-label={`Delete alert #${selectedAlert.id}`}
                    onClick={() => setDeletingAlert(selectedAlert)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      )}

      <AlertFormModal
        open={modalOpen}
        mode={modalMode}
        initialAlert={editingAlert}
        plants={plants}
        onClose={() => setModalOpen(false)}
        onSuccess={async (saved, m) => {
          addToast({
            tone: 'success',
            title: m === 'edit' ? 'Alert Updated' : 'Alert Created',
            message: `${saved.plant_id}: ${saved.status} (${saved.severity})`,
          });
          setSelectedId(saved.id);
          await loadData(true);
        }}
      />

      <ConfirmDialog
        open={Boolean(resolvingAlert)}
        tone="primary"
        title={`Resolve alert #${resolvingAlert?.id}?`}
        description={
          resolvingAlert
            ? `Marks ${resolvingAlert.plant_id} deviation (Pred ${resolvingAlert.predicted_power_kw} kW vs Actual ${resolvingAlert.actual_power_kw} kW) as resolved and records the resolution timestamp.`
            : ''
        }
        confirmLabel="Resolve Alert"
        loading={Boolean(resolvingAlert && updatingId === resolvingAlert.id)}
        onCancel={() => setResolvingAlert(null)}
        onConfirm={() => {
          if (resolvingAlert) {
            handleTransitionStatus(resolvingAlert, 'resolved');
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingAlert)}
        title={`Delete alert #${deletingAlert?.id}?`}
        description="This permanently removes the deviation alert record from MySQL."
        confirmLabel="Delete Alert"
        loading={deleteLoading}
        onCancel={() => setDeletingAlert(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
