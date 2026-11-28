import { CloudSun, Droplets, Gauge, Sun, Thermometer } from 'lucide-react';
import styles from './WeatherPanel.module.css';

export function WeatherPanel({ weatherByPlant = {}, selectedPlantId, onSelectPlant }) {
  const availableIds = Object.keys(weatherByPlant);
  const activeId =
    selectedPlantId && weatherByPlant[selectedPlantId] ? selectedPlantId : availableIds[0];
  const entry = activeId ? weatherByPlant[activeId] : null;
  const w = entry?.weather;

  return (
    <section className={`surface-card ${styles.panel}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Local Weather Conditions</h3>
          <p className={styles.subtitle}>
            {entry ? `${entry.plant_name} (${entry.plant_id})` : 'Open-Meteo telemetry'}
          </p>
        </div>

        {availableIds.length > 1 ? (
          <select
            aria-label="Weather plant selector"
            className="select-field"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            value={activeId}
            onChange={(e) => onSelectPlant?.(e.target.value)}
          >
            {availableIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <CloudSun size={18} style={{ color: 'var(--color-accent)' }} />
        )}
      </div>

      {!w ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No weather observations loaded for registered plants.
        </p>
      ) : (
        <>
          <div className={styles.grid}>
            <div className={styles.tile}>
              <div className={styles.tileLabel}>
                <Thermometer size={13} style={{ color: 'var(--color-accent)' }} />
                <span>Ambient Temp</span>
              </div>
              <div className={`tabular-nums ${styles.tileValue}`}>
                {w.ambient_temperature_c ?? '—'}
                <span className={styles.tileUnit}>{w.units?.temperature || '°C'}</span>
              </div>
            </div>

            <div className={styles.tile}>
              <div className={styles.tileLabel}>
                <Droplets size={13} style={{ color: 'var(--color-predicted)' }} />
                <span>Humidity</span>
              </div>
              <div className={`tabular-nums ${styles.tileValue}`}>
                {w.relative_humidity_percent ?? '—'}
                <span className={styles.tileUnit}>{w.units?.humidity || '%'}</span>
              </div>
            </div>

            <div className={styles.tile}>
              <div className={styles.tileLabel}>
                <Sun size={13} style={{ color: 'var(--color-accent)' }} />
                <span>Solar Radiation</span>
              </div>
              <div className={`tabular-nums ${styles.tileValue}`}>
                {w.shortwave_radiation_w_m2 ?? '—'}
                <span className={styles.tileUnit}>{w.units?.radiation || 'W/m²'}</span>
              </div>
            </div>

            <div className={styles.tile}>
              <div className={styles.tileLabel}>
                <Gauge size={13} style={{ color: 'var(--color-teal)' }} />
                <span>Irradiation</span>
              </div>
              <div className={`tabular-nums ${styles.tileValue}`}>
                {w.irradiation_kw_m2 !== null && w.irradiation_kw_m2 !== undefined
                  ? Number(w.irradiation_kw_m2).toFixed(3)
                  : '—'}
                <span className={styles.tileUnit}>kW/m²</span>
              </div>
            </div>
          </div>

          <div className={styles.meta}>
            <span>Source: {w.source}</span>
            <span className="mono">
              {w.observed_at_local} ({w.timezone})
            </span>
          </div>
        </>
      )}
    </section>
  );
}
