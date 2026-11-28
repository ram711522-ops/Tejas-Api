import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  KeyRound,
  Layers,
  Loader2,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { clearApiCache } from '../api/cache';
import { DEFAULT_API_BASE_URL } from '../api/client';
import { API_CONFIG } from '../api/config';
import { getApiRoot, getSystemHealth } from '../api/systemApi';
import { StatusIndicator } from '../components/data-display/StatusIndicator';
import { ErrorState } from '../components/feedback/ErrorState';
import { PageHeader } from '../components/layout/PageHeader';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import {
  clearStoredAuthCredentials,
  getAuthConfigSummary,
  setStoredAuthCredentials,
} from '../utils/auth';
import styles from './SettingsPage.module.css';

const SECTIONS = [
  { id: 'all', label: 'All Sections', icon: Layers },
  { id: 'system', label: 'System Status & Info', icon: Activity },
  { id: 'backend', label: 'Backend Connection', icon: Server },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'profile', label: 'Profile & Access', icon: UserCheck },
];

function validateHttpUrl(value) {
  const cleaned = String(value || '').trim().replace(/\/+$/, '');
  if (!cleaned) {
    return { valid: false, error: 'Backend API Base URL is required.' };
  }
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Base URL must use http:// or https://.' };
    }
    return { valid: true, value: cleaned };
  } catch {
    return { valid: false, error: 'Enter a valid URL (e.g. http://localhost:8000).' };
  }
}

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { addToast } = useToast();

  const [activeSection, setActiveSection] = useState('all');

  // Profile & HTTP Basic session credentials
  const [operatorInput, setOperatorInput] = useState(settings.operatorName || 'Shift Operator');
  const [profileError, setProfileError] = useState('');
  const [authSummary, setAuthSummary] = useState(() => getAuthConfigSummary());
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Backend URL configuration
  const [apiUrlInput, setApiUrlInput] = useState(settings.apiBaseUrl);
  const [apiUrlError, setApiUrlError] = useState('');

  // Save indicator
  const [savedTag, setSavedTag] = useState('');

  // Live backend diagnostics (/ and /health)
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState(null);
  const [health, setHealth] = useState(null);
  const [rootInfo, setRootInfo] = useState(null);

  useEffect(() => {
    setApiUrlInput(settings.apiBaseUrl);
  }, [settings.apiBaseUrl]);

  useEffect(() => {
    setOperatorInput(settings.operatorName || 'Shift Operator');
  }, [settings.operatorName]);

  const markSaved = (label) => {
    setSavedTag(label);
  };

  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const [h, r] = await Promise.all([
        getSystemHealth(undefined, { force: true }),
        getApiRoot().catch(() => null),
      ]);
      setHealth(h);
      setRootInfo(r);
    } catch (err) {
      setHealth(null);
      setRootInfo(null);
      setDiagError(err);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics, settings.apiBaseUrl]);

  const handleSaveApiUrl = (e) => {
    e.preventDefault();
    setApiUrlError('');
    const check = validateHttpUrl(apiUrlInput);
    if (!check.valid) {
      setApiUrlError(check.error);
      return;
    }
    updateSettings({ apiBaseUrl: check.value });
    clearApiCache();
    markSaved('Backend URL saved');
    addToast({
      tone: 'info',
      title: 'Endpoint Updated',
      message: `API requests now target ${check.value}.`,
    });
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    setProfileError('');
    const trimmed = operatorInput.trim();
    if (!trimmed || trimmed.length > 60) {
      setProfileError('Operator display name must be between 1 and 60 characters.');
      return;
    }
    updateSettings({ operatorName: trimmed });
    markSaved('Profile saved');
    addToast({
      tone: 'success',
      title: 'Profile Updated',
      message: `Observatory operator set to ${trimmed}.`,
    });
  };

  const handleSaveSessionAuth = (e) => {
    e.preventDefault();
    setAuthError('');
    const user = authUsername.trim();
    if (!user || !authPassword) {
      setAuthError('Both username and password are required for HTTP Basic authentication.');
      return;
    }
    setStoredAuthCredentials(user, authPassword);
    setAuthUsername('');
    setAuthPassword('');
    setAuthSummary(getAuthConfigSummary());
    clearApiCache();
    markSaved('Session credentials updated');
    addToast({
      tone: 'success',
      title: 'HTTP Basic Auth Updated',
      message: `Session credentials stored securely in sessionStorage for ${user}.`,
    });
  };

  const handleClearSessionAuth = () => {
    clearStoredAuthCredentials();
    setAuthSummary(getAuthConfigSummary());
    clearApiCache();
    markSaved('Session credentials cleared');
    addToast({
      tone: 'info',
      title: 'Session Credentials Cleared',
      message: 'Removed session-stored HTTP Basic credentials.',
    });
  };

  const showSection = (id) => activeSection === 'all' || activeSection === id;
  const healthStatusLower = String(health?.status || '').toLowerCase();
  const isHealthOk = healthStatusLower === 'ok' || healthStatusLower === 'healthy';
  const clientTimezone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="SECTOR 07 · SYSTEM CALIBRATION & PREFERENCES"
        title="Settings & Diagnostics"
        subtitle="Configure observatory appearance, application preferences, backend connection target, operator session access, and inspect live FastAPI/SVR/database health."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {savedTag ? (
              <span className={styles.inlineSaved} role="status">
                <CheckCircle2 size={13} />
                <span>{savedTag}</span>
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={runDiagnostics}
              disabled={diagLoading}
            >
              <RefreshCw size={14} className={diagLoading ? 'spin' : ''} />
              <span>Test Connection</span>
            </button>
          </div>
        }
      />

      <div className={styles.workspace}>
        <nav className={styles.sectionNav} aria-label="Settings sections">
          <div className={styles.navHeading}>Configuration</div>
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                className={`${styles.navBtn} ${active ? styles.navBtnActive : ''}`}
                onClick={() => setActiveSection(sec.id)}
              >
                <Icon size={14} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.contentCol}>
          {/* 1. System Status & System Information */}
          {showSection('system') ? (
            <section className={styles.panel} aria-label="System Status and Information">
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>System Status &amp; Information</h2>
                  <p className={styles.panelSub}>
                    Live diagnostic telemetry from public endpoints <code>GET /</code> and{' '}
                    <code>GET /health</code>
                  </p>
                </div>
                <Activity size={18} style={{ color: 'var(--color-accent)' }} />
              </div>

              {diagLoading ? (
                <div
                  className="mono"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Loader2 size={14} className="spin" />
                  <span>Probing {settings.apiBaseUrl}/health ...</span>
                </div>
              ) : diagError ? (
                <ErrorState title="Backend unreachable" error={diagError} onRetry={runDiagnostics} />
              ) : health ? (
                <>
                  <div className={styles.diagGrid}>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>Backend Connection</div>
                      <div style={{ marginTop: 6 }}>
                        <StatusIndicator tone="success" label="Reachable" />
                      </div>
                    </div>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>API Health</div>
                      <div style={{ marginTop: 6 }}>
                        <StatusIndicator
                          tone={isHealthOk ? 'success' : 'warning'}
                          label={health.status}
                        />
                      </div>
                    </div>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>SVR ML Artifact</div>
                      <div style={{ marginTop: 6 }}>
                        <StatusIndicator
                          tone={health.model_loaded ? 'success' : 'danger'}
                          label={health.model_loaded ? 'Model Loaded' : 'Unloaded'}
                        />
                      </div>
                    </div>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>MySQL Database</div>
                      <div style={{ marginTop: 6 }}>
                        <StatusIndicator
                          tone={health.database?.connected ? 'success' : 'danger'}
                          label={health.database?.connected ? 'Connected' : 'Disconnected'}
                        />
                      </div>
                    </div>
                  </div>

                  {health.database?.message ? (
                    <div
                      className="mono"
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Database size={13} />
                      <span>{health.database.message}</span>
                    </div>
                  ) : null}

                  <div className={styles.diagGrid}>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>API Root Metadata</div>
                      <div
                        className="mono"
                        style={{ fontSize: 12, marginTop: 6, color: 'var(--text-primary)' }}
                      >
                        {rootInfo?.version
                          ? `v${rootInfo.version}`
                          : rootInfo?.message || 'GET / online'}
                      </div>
                    </div>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>Model Input Features</div>
                      <div
                        className="mono"
                        style={{ fontSize: 12, marginTop: 6, color: 'var(--text-primary)' }}
                      >
                        {typeof health.model_features === 'number'
                          ? `${health.model_features} active SVR features`
                          : Array.isArray(health.model_features)
                            ? `${health.model_features.length} features`
                            : '—'}
                      </div>
                    </div>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>Local Runtime Timezone</div>
                      <div
                        className="mono"
                        style={{ fontSize: 12, marginTop: 6, color: 'var(--text-primary)' }}
                      >
                        {clientTimezone}
                      </div>
                    </div>
                    <div className={styles.diagCell}>
                      <div className={styles.label}>Active Operator</div>
                      <div
                        className="mono"
                        style={{ fontSize: 12, marginTop: 6, color: 'var(--text-primary)' }}
                      >
                        {settings.operatorName || 'Shift Operator'}
                      </div>
                    </div>
                  </div>

                  {Array.isArray(health.model_features) && health.model_features.length > 0 ? (
                    <div className={styles.field}>
                      <span className={styles.label}>Active Model Input Features</span>
                      <div className={styles.featureChips}>
                        {health.model_features.map((feat) => (
                          <code key={feat} className={styles.chip}>
                            {feat}
                          </code>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          {/* 2. Backend Connection Information */}
          {showSection('backend') ? (
            <section className={styles.panel} aria-label="Backend Connection Information">
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Backend Connection Information</h2>
                  <p className={styles.panelSub}>
                    Target FastAPI endpoint and transport timing (secrets and DB credentials are
                    never exposed to the client)
                  </p>
                </div>
                <Server size={18} style={{ color: 'var(--color-accent)' }} />
              </div>

              <form onSubmit={handleSaveApiUrl} className={styles.field} noValidate>
                <label htmlFor="api-base-url" className={styles.label}>
                  TEJAS API Base URL
                </label>
                <div className={styles.inputRow}>
                  <input
                    id="api-base-url"
                    className="input-field mono"
                    style={{ flex: 1, minWidth: 220 }}
                    placeholder="http://localhost:8000"
                    value={apiUrlInput}
                    onChange={(e) => {
                      setApiUrlInput(e.target.value);
                      if (apiUrlError) setApiUrlError('');
                    }}
                  />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Apply
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setApiUrlError('');
                      setApiUrlInput(DEFAULT_API_BASE_URL);
                      updateSettings({ apiBaseUrl: DEFAULT_API_BASE_URL });
                      clearApiCache();
                      markSaved('Restored default endpoint');
                      addToast({
                        tone: 'info',
                        title: 'Endpoint Reset',
                        message: `Restored API target to ${DEFAULT_API_BASE_URL}.`,
                      });
                    }}
                  >
                    Default
                  </button>
                </div>
                {apiUrlError ? (
                  <div className={styles.inlineError} role="alert">
                    {apiUrlError}
                  </div>
                ) : null}
              </form>

              <div className={styles.diagGrid}>
                <div className={styles.diagCell}>
                  <div className={styles.label}>Active Target</div>
                  <div className="mono" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {settings.apiBaseUrl}
                  </div>
                </div>
                <div className={styles.diagCell}>
                  <div className={styles.label}>Request / Health Timeout</div>
                  <div className="mono" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {API_CONFIG.timeoutMs / 1000}s API · {API_CONFIG.healthTimeoutMs / 1000}s health
                  </div>
                </div>
                <div className={styles.diagCell}>
                  <div className={styles.label}>Client Cache TTL</div>
                  <div className="mono" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {API_CONFIG.defaultCacheTtlMs / 1000}s data ·{' '}
                    {API_CONFIG.healthCacheTtlMs / 1000}s health
                  </div>
                </div>
                <div className={styles.diagCell}>
                  <div className={styles.label}>Auth Transport</div>
                  <div className="mono" style={{ fontSize: 11.5, marginTop: 4 }}>
                    HTTP Basic (secret masked)
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* 3. Appearance */}
          {showSection('appearance') ? (
            <section className={styles.panel} aria-label="Appearance">
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Appearance</h2>
                  <p className={styles.panelSub}>
                    Obsidian Dark is the primary TEJAS Observatory theme; Light mode switches all
                    semantic surfaces consistently and persists locally
                  </p>
                </div>
                {settings.theme === 'dark' ? (
                  <Moon size={18} style={{ color: 'var(--color-predicted)' }} />
                ) : (
                  <Sun size={18} style={{ color: 'var(--color-accent)' }} />
                )}
              </div>

              <div className={styles.themeGrid}>
                <button
                  type="button"
                  aria-pressed={settings.theme === 'dark'}
                  className={`${styles.themeOption} ${
                    settings.theme === 'dark' ? styles.themeOptionActive : ''
                  }`}
                  onClick={() => {
                    updateSettings({ theme: 'dark' });
                    markSaved('Dark theme active');
                  }}
                >
                  <div className={styles.themeTop}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <Moon size={15} />
                      Obsidian Dark (Primary)
                    </span>
                    {settings.theme === 'dark' ? (
                      <StatusIndicator tone="success" label="ACTIVE" />
                    ) : null}
                  </div>
                  <p className={styles.themeDesc}>
                    High-contrast deep obsidian surfaces engineered for continuous solar telemetry
                    monitoring.
                  </p>
                </button>

                <button
                  type="button"
                  aria-pressed={settings.theme === 'light'}
                  className={`${styles.themeOption} ${
                    settings.theme === 'light' ? styles.themeOptionActive : ''
                  }`}
                  onClick={() => {
                    updateSettings({ theme: 'light' });
                    markSaved('Light theme active');
                  }}
                >
                  <div className={styles.themeTop}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <Sun size={15} />
                      Alabaster Light
                    </span>
                    {settings.theme === 'light' ? (
                      <StatusIndicator tone="success" label="ACTIVE" />
                    ) : null}
                  </div>
                  <p className={styles.themeDesc}>
                    Daylight alabaster palette tuned for sunlit field laptops and printed reports.
                  </p>
                </button>
              </div>
            </section>
          ) : null}

          {/* 4. Application Preferences */}
          {showSection('preferences') ? (
            <section className={styles.panel} aria-label="Observatory Preferences">
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Application Preferences</h2>
                  <p className={styles.panelSub}>
                    Persisted in localStorage and actively applied to Dashboard &amp; Analytics
                    workspaces
                  </p>
                </div>
                <SlidersHorizontal size={18} style={{ color: 'var(--color-accent)' }} />
              </div>

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label htmlFor="pref-window" className={styles.label}>
                    Default Telemetry Date Window
                  </label>
                  <select
                    id="pref-window"
                    className="select-field"
                    value={settings.defaultDateWindow}
                    onChange={(e) => {
                      updateSettings({ defaultDateWindow: e.target.value });
                      markSaved('Default window saved');
                      addToast({
                        tone: 'info',
                        title: 'Default Window Updated',
                        message: `Overview & Analytics default window set to ${e.target.value.toUpperCase()}.`,
                      });
                    }}
                  >
                    <option value="24h">Last 24 Hours (24H)</option>
                    <option value="7d">Last 7 Days (7D)</option>
                    <option value="30d">Last 30 Days (30D)</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="pref-poll" className={styles.label}>
                    Background Refresh Interval (Overview)
                  </label>
                  <select
                    id="pref-poll"
                    className="select-field"
                    value={String(settings.pollingIntervalMs)}
                    onChange={(e) => {
                      const ms = Number(e.target.value);
                      updateSettings({ pollingIntervalMs: ms });
                      markSaved('Polling interval saved');
                      addToast({
                        tone: 'info',
                        title: 'Polling Interval Updated',
                        message:
                          ms === 0
                            ? 'Automatic background polling disabled.'
                            : `Overview dashboard will refresh every ${ms / 1000}s while visible.`,
                      });
                    }}
                  >
                    <option value="0">Manual refresh only (Off)</option>
                    <option value="30000">Every 30 seconds</option>
                    <option value="60000">Every 60 seconds</option>
                    <option value="300000">Every 5 minutes</option>
                  </select>
                </div>
              </div>

              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    clearApiCache();
                    markSaved('API cache cleared');
                    addToast({
                      tone: 'info',
                      title: 'Cache Cleared',
                      message: 'API response cache invalidated.',
                    });
                  }}
                >
                  <Trash2 size={13} />
                  <span>Clear API Cache</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    resetSettings();
                    clearApiCache();
                    markSaved('Defaults restored');
                    addToast({
                      tone: 'success',
                      title: 'Preferences Reset',
                      message: 'Restored Observatory defaults (Obsidian Dark, 7D, localhost:8000).',
                    });
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Reset Defaults</span>
                </button>
              </div>
            </section>
          ) : null}

          {/* 5. Profile & Operator Session Access */}
          {showSection('profile') ? (
            <section className={styles.panel} aria-label="Profile and Operator Access">
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Profile &amp; Operator Access</h2>
                  <p className={styles.panelSub}>
                    Local operator workspace label and optional HTTP Basic session credentials for
                    protected FastAPI routes
                  </p>
                </div>
                <UserCheck size={18} style={{ color: 'var(--color-accent)' }} />
              </div>

              <form onSubmit={handleSaveProfile} className={styles.field} noValidate>
                <label htmlFor="pref-operator" className={styles.label}>
                  Operator Display Name
                </label>
                <div className={styles.inputRow}>
                  <input
                    id="pref-operator"
                    className="input-field"
                    style={{ flex: 1, minWidth: 200 }}
                    maxLength={60}
                    value={operatorInput}
                    onChange={(e) => {
                      setOperatorInput(e.target.value);
                      if (profileError) setProfileError('');
                    }}
                  />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Save Profile
                  </button>
                </div>
                {profileError ? (
                  <div className={styles.inlineError} role="alert">
                    {profileError}
                  </div>
                ) : null}
              </form>

              <div className={styles.subBox}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className={styles.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <KeyRound size={12} />
                    <span>HTTP Basic Auth Session</span>
                  </span>
                  <StatusIndicator
                    tone={authSummary.configured ? 'success' : 'neutral'}
                    label={
                      authSummary.source === 'session'
                        ? `SESSION ACTIVE${authSummary.username ? ` (${authSummary.username})` : ''}`
                        : authSummary.source === 'env'
                          ? 'CONFIGURED VIA ENV'
                          : 'NOT CONFIGURED'
                    }
                  />
                </div>

                <form onSubmit={handleSaveSessionAuth} className={styles.field} noValidate>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label htmlFor="auth-user" className={styles.label}>
                        HTTP Basic Username
                      </label>
                      <input
                        id="auth-user"
                        className="input-field mono"
                        autoComplete="username"
                        placeholder="API username"
                        value={authUsername}
                        onChange={(e) => {
                          setAuthUsername(e.target.value);
                          if (authError) setAuthError('');
                        }}
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="auth-pass" className={styles.label}>
                        HTTP Basic Password
                      </label>
                      <input
                        id="auth-pass"
                        type="password"
                        className="input-field mono"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={authPassword}
                        onChange={(e) => {
                          setAuthPassword(e.target.value);
                          if (authError) setAuthError('');
                        }}
                      />
                    </div>
                  </div>
                  {authError ? (
                    <div className={styles.inlineError} role="alert">
                      {authError}
                    </div>
                  ) : null}
                  <div className={styles.inputRow}>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Save Session Auth
                    </button>
                    {authSummary.source === 'session' ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleClearSessionAuth}
                      >
                        Clear Session Auth
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
