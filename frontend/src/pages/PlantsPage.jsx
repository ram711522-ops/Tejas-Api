import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Cpu,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { deletePlant } from '../api/plantsApi';
import { DataTable } from '../components/data-display/DataTable';
import { PlantCard } from '../components/data-display/PlantCard';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PlantFormModal } from '../components/forms/PlantFormModal';
import { PageHeader } from '../components/layout/PageHeader';
import { useToast } from '../context/ToastContext';
import { usePlantsData } from '../hooks/usePlantsData';
import { sumFleetCapacityMw } from '../utils/analytics';
import { derivePlantStatus } from '../utils/dashboardSelectors';
import styles from './PlantsPage.module.css';

const STATUS_TONE = {
  Producing: 'success',
  Idle: 'neutral',
  Warning: 'warning',
  Offline: 'danger',
};

export function PlantsPage() {
  const { plants, readings, alerts, loading, error, refresh } = usePlantsData();
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState(null);
  const [deletingPlant, setDeletingPlant] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const enrichedPlants = useMemo(() => {
    const latestReadingMap = new Map();
    for (const r of readings) {
      const prev = latestReadingMap.get(r.plant_id);
      if (!prev || new Date(r.timestamp) > new Date(prev.timestamp)) {
        latestReadingMap.set(r.plant_id, r);
      }
    }

    return plants.map((plant) => {
      const latestReading = latestReadingMap.get(plant.plant_id) || null;
      const plantAlerts = alerts.filter((a) => a.plant_id === plant.plant_id);
      const activeAlertCount = plantAlerts.filter(
        (a) => a.status === 'open' || a.status === 'acknowledged'
      ).length;
      const derived = derivePlantStatus(plant, latestReading, plantAlerts);
      return {
        plant,
        latestReading,
        activeAlertCount,
        ...derived,
      };
    });
  }, [plants, readings, alerts]);

  const plantTypes = useMemo(() => {
    const unique = new Set(plants.map((p) => p.plant_type).filter(Boolean));
    return [...unique].sort();
  }, [plants]);

  const filteredPlants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedPlants.filter((item) => {
      if (q) {
        const matchesId = item.plant.plant_id.toLowerCase().includes(q);
        const matchesName = item.plant.plant_name.toLowerCase().includes(q);
        if (!matchesId && !matchesName) return false;
      }
      if (typeFilter !== 'all' && item.plant.plant_type !== typeFilter) {
        return false;
      }
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [enrichedPlants, search, typeFilter, statusFilter]);

  const totalCapacityMw = useMemo(() => sumFleetCapacityMw(plants), [plants]);

  const handleOpenAdd = () => {
    setEditingPlant(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (plant) => {
    setEditingPlant(plant);
    setFormOpen(true);
  };

  const handlePlantSaved = (saved, action) => {
    setFormOpen(false);
    setEditingPlant(null);
    addToast({
      tone: 'success',
      title: action === 'created' ? 'Plant Registered' : 'Plant Updated',
      message: `${saved.plant_name} (${saved.plant_id}) was ${action} successfully.`,
    });
    refresh();
  };

  const handleConfirmDelete = async () => {
    if (!deletingPlant) return;
    setDeleteLoading(true);
    try {
      await deletePlant(deletingPlant.plant_id);
      addToast({
        tone: 'success',
        title: 'Plant Deleted',
        message: `${deletingPlant.plant_name} (${deletingPlant.plant_id}) and linked records were deleted.`,
      });
      setDeletingPlant(null);
      refresh();
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

  const resetFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const tableColumns = [
    {
      key: 'plant_id',
      label: 'Plant ID',
      mono: true,
      render: (row) => (
        <Link
          to={`/plants/${encodeURIComponent(row.plant.plant_id)}`}
          style={{ color: 'var(--color-accent)', fontWeight: 700 }}
        >
          {row.plant.plant_id}
        </Link>
      ),
    },
    {
      key: 'plant_name',
      label: 'Plant Name',
      render: (row) => <strong>{row.plant.plant_name}</strong>,
    },
    {
      key: 'plant_type',
      label: 'Type',
      render: (row) => (
        <span style={{ textTransform: 'capitalize' }}>
          {String(row.plant.plant_type).replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'location',
      label: 'Coordinates',
      mono: true,
      render: (row) =>
        `${Number(row.plant.latitude).toFixed(3)}°, ${Number(row.plant.longitude).toFixed(3)}°`,
    },
    {
      key: 'capacity',
      label: 'Capacity (MW)',
      align: 'right',
      numeric: true,
      render: (row) => Number(row.plant.installed_capacity_mw).toFixed(2),
    },
    {
      key: 'generation',
      label: 'Latest Gen (kW)',
      align: 'right',
      numeric: true,
      render: (row) =>
        row.currentPowerKw !== null && row.currentPowerKw !== undefined
          ? Number(row.currentPowerKw).toLocaleString(undefined, { maximumFractionDigits: 1 })
          : 'No reading',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <StatusIndicator
          tone={STATUS_TONE[row.status] || 'neutral'}
          label={row.status}
          title={row.reason}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.rowActions}>
          <Link
            to={`/plants/${encodeURIComponent(row.plant.plant_id)}`}
            className="btn btn-ghost btn-sm"
            title="Inspect plant details"
          >
            <ArrowRight size={14} />
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => handleOpenEdit(row.plant)}
            aria-label={`Edit ${row.plant.plant_id}`}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--color-danger)' }}
            onClick={() => setDeletingPlant(row.plant)}
            aria-label={`Delete ${row.plant.plant_id}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <PageHeader
        eyebrow="SECTOR 02 · ASSET FLEET"
        title="Solar Plants"
        subtitle="Register, configure, and monitor photovoltaic plant installations."
        actions={
          <div className={styles.headerActions}>
            <span className={`tabular-nums ${styles.countPill}`}>
              {plants.length} plant{plants.length === 1 ? '' : 's'} • {totalCapacityMw.toFixed(2)} MW
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={handleOpenAdd}>
              <Plus size={15} />
              <span>Add Plant</span>
            </button>
          </div>
        }
      />

      <section className={`surface-card ${styles.toolbar}`} aria-label="Plant filters">
        <div className={styles.filtersLeft}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="search"
              className={`input-field ${styles.searchInput}`}
              placeholder="Search by plant name or ID..."
              aria-label="Search plants"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={`select-field ${styles.filterSelect}`}
            aria-label="Filter by plant type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {plantTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <select
            className={`select-field ${styles.filterSelect}`}
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="Producing">Producing</option>
            <option value="Warning">Warning</option>
            <option value="Idle">Idle</option>
            <option value="Offline">Offline</option>
          </select>
        </div>

        <div className={styles.viewToggle} role="group" aria-label="View mode">
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid size={14} />
            <span>Grid</span>
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >
            <List size={14} />
            <span>List</span>
          </button>
        </div>
      </section>

      {loading ? (
        <LoadingState variant="cards" cards={4} message="Loading solar plants..." />
      ) : error ? (
        <ErrorState title="Failed to load solar plants" error={error} onRetry={refresh} />
      ) : plants.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No solar plants registered"
          description="Register your first solar plant to enable weather telemetry, SVR power forecasting, and deviation alerts."
          action={
            <button type="button" className="btn btn-primary" onClick={handleOpenAdd}>
              <Plus size={15} />
              <span>Add Plant</span>
            </button>
          }
        />
      ) : filteredPlants.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No plants match your filters"
          description="Adjust the search query, plant type, or status filter."
          action={
            <button type="button" className="btn btn-secondary" onClick={resetFilters}>
              Clear Filters
            </button>
          }
        />
      ) : viewMode === 'grid' ? (
        <div className={styles.grid}>
          {filteredPlants.map((item) => (
            <PlantCard
              key={item.plant.plant_id}
              plant={item.plant}
              currentPowerKw={item.currentPowerKw}
              status={item.status}
              statusReason={item.reason}
              activeAlertCount={item.activeAlertCount}
              onEdit={handleOpenEdit}
              onDelete={setDeletingPlant}
            />
          ))}
        </div>
      ) : (
        <DataTable
          columns={tableColumns}
          rows={filteredPlants}
          rowKey={(row) => row.plant.plant_id}
        />
      )}

      <PlantFormModal
        open={formOpen}
        initialPlant={editingPlant}
        onClose={() => {
          setFormOpen(false);
          setEditingPlant(null);
        }}
        onSaved={handlePlantSaved}
      />

      <ConfirmDialog
        open={Boolean(deletingPlant)}
        title={`Delete ${deletingPlant?.plant_name || deletingPlant?.plant_id}?`}
        description={`Deleting "${deletingPlant?.plant_id}" will permanently remove the plant and cascade-delete all associated forecasts, actual readings, and alerts in MySQL.`}
        confirmLabel="Delete Plant"
        tone="danger"
        loading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingPlant(null)}
      />
    </div>
  );
}
