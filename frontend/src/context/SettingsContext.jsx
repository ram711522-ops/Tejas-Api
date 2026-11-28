import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_API_BASE_URL, setClientBaseUrl } from '../api/client';

const SETTINGS_STORAGE_KEY = 'tejas.ui.settings';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  apiBaseUrl: DEFAULT_API_BASE_URL,
  pollingIntervalMs: 0, // 0 = Off; options: 30000, 60000, 300000
  defaultDateWindow: '7d',
  operatorName: 'Shift Operator',
};

const SettingsContext = createContext(null);

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light';
  }, [settings.theme]);

  useEffect(() => {
    setClientBaseUrl(settings.apiBaseUrl);
  }, [settings.apiBaseUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }, [settings]);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      toggleTheme,
      resetSettings,
    }),
    [settings, updateSettings, toggleTheme, resetSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return ctx;
}
