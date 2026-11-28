import { ArrowRight, Compass, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SolarOrientationDial } from './SolarOrientationDial';
import { StatusIndicator } from './StatusIndicator';
import styles from './PlantCard.module.css';

const STATUS_TONE = {
  Producing: 'success',
  Idle: 'neutral',
  Warning: 'warning',
  Offline: 'danger',
};

const STRIPE_CLASS = {
  Producing: styles.stripeProducing,
  Warning: styles.stripeWarning,
  Offline: styles.stripeOffline,
};

export function PlantCard({
  plant,
  currentPowerKw,
  status = 'Offline',
  statusReason,
  activeAlertCount = 0,
  compact = false,
  onEdit,
  onDelete,
}) {
  const capacityMw = Number(plant.installed_capacity_mw) || 0;
  const capacityKw = Math.round(capacityMw * 1000);
  const formattedType = String(plant.plant_type || 'solar').replace(/_/g, ' ');
  const hasPower = currentPowerKw !== null && currentPowerKw !== undefined;
  const utilizationPct =
    hasPower && capacityKw > 0
      ? Math.min(100, Math.max(0, (Number(currentPowerKw) / capacityKw) * 100))
      : null;

  const hasOrientation =
    (plant.tilt !== null && plant.tilt !== undefined) ||
    (plant.azimuth !== null && plant.azimuth !== undefined);

  return (
    <article className={styles.card}>
      <div className={`${styles.topStripe} ${STRIPE_CLASS[status] || ''}`} aria-hidden="true" />

      <div className={styles.header}>
        <div style={{ minWidth: 0 }}>
          <Link to={`/plants/${encodeURIComponent(plant.plant_id)}`} className={styles.titleLink}>
            {plant.plant_name}
          </Link>
          <div className={styles.metaRow}>
            <code className={`mono ${styles.plantId}`}>{plant.plant_id}</code>
            <span className={styles.typeText}>{formattedType}</span>
            {activeAlertCount > 0 ? (
              <span className={styles.alertCount}>
                • {activeAlertCount} active alert{activeAlertCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </div>

        <StatusIndicator
          tone={STATUS_TONE[status] || 'neutral'}
          label={status}
          title={statusReason}
        />
      </div>

      <div className={styles.metricsGrid}>
        <div>
          <div className={styles.metricLabel}>Latest Gen</div>
          <div className={`tabular-nums ${styles.metricValue}`}>
            {hasPower ? (
              <>
                {Number(currentPowerKw).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                <span className={styles.metricUnit}>kW</span>
              </>
            ) : (
              'No reading'
            )}
          </div>
        </div>

        <div>
          <div className={styles.metricLabel}>Installed Cap</div>
          <div className={`tabular-nums ${styles.metricValue}`}>
            {capacityMw.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className={styles.metricUnit}>MW</span>
          </div>
        </div>
      </div>

      {utilizationPct !== null ? (
        <div className={styles.utilBlock}>
          <div className={styles.utilLabelRow}>
            <span>Capacity Load</span>
            <span className="mono">{utilizationPct.toFixed(1)}%</span>
          </div>
          <div className={styles.utilTrack}>
            <div className={styles.utilFill} style={{ width: `${utilizationPct}%` }} />
          </div>
        </div>
      ) : null}

      <div className={styles.orientationBand}>
        <div className={styles.specsRow}>
          <span className={`mono ${styles.specChip}`}>
            <MapPin size={12} style={{ color: 'var(--color-accent)' }} />
            {Number(plant.latitude).toFixed(3)}°, {Number(plant.longitude).toFixed(3)}°
          </span>

          {hasOrientation ? (
            <span className={`mono ${styles.specChip}`}>
              <Compass size={12} style={{ color: 'var(--color-predicted)' }} />
              Tilt {plant.tilt ?? '—'}° / Az {plant.azimuth ?? '—'}°
            </span>
          ) : (
            <span className={`mono ${styles.specChip}`}>Orientation unset</span>
          )}
        </div>

        {hasOrientation ? (
          <SolarOrientationDial tilt={plant.tilt} azimuth={plant.azimuth} size={42} />
        ) : null}
      </div>

      {!compact ? (
        <div className={styles.footer}>
          <div className={styles.actionGroup}>
            {onEdit ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onEdit(plant)}
                aria-label={`Edit ${plant.plant_id}`}
                title="Edit plant"
              >
                <Pencil size={13} />
                <span>Edit</span>
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onDelete(plant)}
                aria-label={`Delete ${plant.plant_id}`}
                title="Delete plant"
                style={{ color: 'var(--color-danger)' }}
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            ) : null}
          </div>

          <Link to={`/plants/${encodeURIComponent(plant.plant_id)}`} className={styles.inspectLink}>
            <span>Inspect Details</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      ) : null}
    </article>
  );
}
