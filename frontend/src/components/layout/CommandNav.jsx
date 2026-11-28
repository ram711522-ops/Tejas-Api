import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  LayoutDashboard,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getSystemHealth } from '../../api/systemApi';
import { useSettings } from '../../context/SettingsContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { StatusIndicator } from '../data-display/StatusIndicator';
import styles from './CommandNav.module.css';
import { CommandPalette } from './CommandPalette';

const NAV_ITEMS = [
  { code: '01', to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { code: '02', to: '/plants', label: 'Plants', icon: Cpu },
  { code: '03', to: '/forecasts', label: 'Forecasts', icon: Zap },
  { code: '04', to: '/readings', label: 'Readings', icon: Activity },
  { code: '05', to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { code: '06', to: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { code: '07', to: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_PRIMARY = NAV_ITEMS.filter((i) => ['/', '/plants', '/forecasts', '/alerts'].includes(i.to));
const MOBILE_SECONDARY = NAV_ITEMS.filter((i) => ['/readings', '/analytics', '/settings'].includes(i.to));

export function CommandNav() {
  const { settings, toggleTheme } = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [clockText, setClockText] = useState('');

  const {
    data: health,
    loading: healthLoading,
    error: healthError,
    refetch: refetchHealth,
  } = useAsyncData((signal, opts) => getSystemHealth(signal, opts), [settings.apiBaseUrl]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockText(
        now.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };
    updateClock();
    const timer = window.setInterval(updateClock, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const getHealthBadge = () => {
    if (healthLoading && !health) {
      return { tone: 'neutral', label: 'LINKING' };
    }
    if (healthError || !health) {
      return {
        tone: 'danger',
        label: 'API OFFLINE',
        title: healthError?.message || `Backend unreachable at ${settings.apiBaseUrl}`,
      };
    }
    if (!health.database?.connected) {
      return { tone: 'warning', label: 'DB OFFLINE', title: health.database?.message };
    }
    if (!health.model_loaded) {
      return { tone: 'warning', label: 'NO MODEL' };
    }
    return {
      tone: 'success',
      label: 'LINK OK',
      title: `FastAPI + MySQL + SVR (${health.model_features} features)`,
    };
  };

  const badge = getHealthBadge();

  return (
    <>
      <header className={styles.ribbon}>
        <div className={styles.brandCluster}>
          <NavLink to="/" className={styles.brandLink}>
            <div className={styles.solarEmblem} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 32 32">
                <circle
                  cx="16"
                  cy="16"
                  r="13"
                  fill="none"
                  stroke="rgba(245, 158, 11, 0.35)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  className={styles.emblemRing}
                />
                <circle cx="16" cy="16" r="6" fill="#f59e0b" />
                <circle cx="16" cy="16" r="9.5" fill="none" stroke="#f59e0b" strokeOpacity="0.4" />
              </svg>
            </div>
            <div>
              <span className={styles.brandName}>TEJAS</span>
              <span className={styles.brandTag}>SOLAR OBSERVATORY</span>
            </div>
          </NavLink>
        </div>

        <nav className={styles.navRail} aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                }
              >
                <span className={styles.navCode}>{item.code}</span>
                <Icon size={14} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className={styles.rightCluster}>
          <button
            type="button"
            className={styles.cmdBtn}
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command search"
          >
            <Search size={13} />
            <span className={styles.cmdLabel}>Jump</span>
            <span className={styles.kbd}>Ctrl K</span>
          </button>

          <span className={styles.clockChip} title="Local observatory time">
            {clockText}
          </span>

          <div className={styles.healthCluster}>
            <StatusIndicator tone={badge.tone} label={badge.label} title={badge.title} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={refetchHealth}
              aria-label="Refresh backend health check"
              title="Recheck /health"
            >
              <RefreshCw size={12} className={healthLoading ? 'spin' : ''} />
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            title={settings.theme === 'dark' ? 'Daylight Editorial Mode' : 'Obsidian Observatory Mode'}
          >
            {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Mobile Bottom Dock */}
      <nav className={styles.mobileDock} aria-label="Mobile navigation">
        {MOBILE_PRIMARY.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `${styles.dockLink} ${isActive ? styles.dockLinkActive : ''}`
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          className={`${styles.dockLink} ${moreOpen ? styles.dockLinkActive : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="More navigation routes"
        >
          {moreOpen ? <X size={18} /> : <Menu size={18} />}
          <span>More</span>
        </button>
      </nav>

      {moreOpen ? (
        <div
          className={styles.moreSheetBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMoreOpen(false);
          }}
        >
          <div className={styles.moreSheet} role="dialog" aria-label="Additional views">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow">System &amp; Telemetry Views</span>
              <StatusIndicator tone={badge.tone} label={badge.label} />
            </div>
            {MOBILE_SECONDARY.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ) : null}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
