import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Cpu,
  LayoutDashboard,
  Search,
  Settings,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listPlants } from '../../api/plantsApi';
import styles from './CommandPalette.module.css';

const STATIC_COMMANDS = [
  { id: 'overview', label: 'Energy Overview', sub: 'Fleet solar observatory & telemetry', to: '/', icon: LayoutDashboard },
  { id: 'plants', label: 'Solar Plants Registry', sub: 'Manage monitored PV installations', to: '/plants', icon: Cpu },
  { id: 'forecasts', label: 'Forecasts & SVR Simulator', sub: 'Forecast ledger & manual model sandbox', to: '/forecasts', icon: Zap },
  { id: 'readings', label: 'Actual Readings', sub: 'SCADA, inverter & meter telemetry', to: '/readings', icon: Activity },
  { id: 'analytics', label: 'Residual & Accuracy Lab', sub: 'MAE, RMSE, MAPE & /compare evaluation', to: '/analytics', icon: BarChart3 },
  { id: 'alerts', label: 'Deviation Alerts', sub: 'Triage, acknowledge & resolve anomalies', to: '/alerts', icon: AlertTriangle },
  { id: 'settings', label: 'System Diagnostics & Settings', sub: 'API health, theme & preferences', to: '/settings', icon: Settings },
];

export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [plants, setPlants] = useState([]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    listPlants()
      .then((list) => setPlants(Array.isArray(list) ? list : []))
      .catch(() => setPlants([]));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const routes = STATIC_COMMANDS.filter(
      (cmd) =>
        !q || cmd.label.toLowerCase().includes(q) || cmd.sub.toLowerCase().includes(q)
    );
    const plantItems = plants
      .filter(
        (p) =>
          !q ||
          p.plant_id.toLowerCase().includes(q) ||
          p.plant_name.toLowerCase().includes(q)
      )
      .slice(0, 6)
      .map((p) => ({
        id: `plant-${p.plant_id}`,
        label: p.plant_name,
        sub: `${p.plant_id} • ${p.installed_capacity_mw} MW`,
        to: `/plants/${encodeURIComponent(p.plant_id)}`,
        icon: Cpu,
      }));

    return { routes, plantItems };
  }, [query, plants]);

  if (!open) return null;

  const go = (to) => {
    navigate(to);
    onClose?.();
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={styles.palette}>
        <div className={styles.inputRow}>
          <Search size={16} style={{ color: 'var(--color-accent)' }} />
          <input
            autoFocus
            type="text"
            className={styles.input}
            placeholder="Jump to route or plant ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className={styles.escTag}>ESC</span>
        </div>

        <div className={styles.list}>
          {results.routes.length > 0 ? (
            <>
              <div className={styles.groupLabel}>Observatory Views</div>
              {results.routes.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    className={styles.item}
                    onClick={() => go(cmd.to)}
                  >
                    <div className={styles.itemLeft}>
                      <Icon size={15} className={styles.itemIcon} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{cmd.label}</div>
                        <div className={styles.itemSub}>{cmd.sub}</div>
                      </div>
                    </div>
                    <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                );
              })}
            </>
          ) : null}

          {results.plantItems.length > 0 ? (
            <>
              <div className={styles.groupLabel}>Registered Plants</div>
              {results.plantItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.item}
                    onClick={() => go(item.to)}
                  >
                    <div className={styles.itemLeft}>
                      <Icon size={15} className={styles.itemIcon} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                        <div className={`mono ${styles.itemSub}`}>{item.sub}</div>
                      </div>
                    </div>
                    <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                );
              })}
            </>
          ) : null}

          {results.routes.length === 0 && results.plantItems.length === 0 ? (
            <div className={styles.empty}>No matching views or plants found.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
