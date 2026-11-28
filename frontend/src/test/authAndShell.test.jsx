import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { apiClient, DEFAULT_API_BASE_URL } from '../api/client';
import * as alertsApi from '../api/alertsApi';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as readingsApi from '../api/readingsApi';
import * as systemApi from '../api/systemApi';
import { App } from '../app/App';
import { DataTable } from '../components/data-display/DataTable';
import { StatCard } from '../components/data-display/StatCard';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import {
  FIXTURE_ALERTS,
  FIXTURE_FORECASTS,
  FIXTURE_HEALTH,
  FIXTURE_PLANTS,
  FIXTURE_READINGS,
} from './fixtures/dashboardFixtures';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('Direct Dashboard Entry & Observatory Shell (No Login)', () => {
  it('opens Energy Overview directly at /, redirects /signin to /, checks /health, and navigates CommandNav + CommandPalette', async () => {
    const healthSpy = vi.spyOn(systemApi, 'getSystemHealth').mockResolvedValue(FIXTURE_HEALTH);
    vi.spyOn(systemApi, 'getApiRoot').mockResolvedValue({ version: '1.0.0' });
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockResolvedValue(FIXTURE_READINGS);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(FIXTURE_ALERTS);

    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:8000');
    expect(apiClient.defaults.headers.common?.Authorization).toBeUndefined();

    // Accessing /signin redirects directly to /
    window.history.pushState({}, '', '/signin');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Energy Overview' }, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByLabelText(/API Username/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API Password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign Out/i })).not.toBeInTheDocument();
    expect(healthSpy).toHaveBeenCalled();

    // CommandPalette open & close
    fireEvent.click(screen.getByRole('button', { name: 'Open command search' }));
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();

    // Navigate through every primary CommandNav route
    const routes = [
      { link: /Plants/i, heading: 'Solar Plants', path: '/plants' },
      { link: /Forecasts/i, heading: 'Solar Forecasts & Predictor', path: '/forecasts' },
      { link: /Readings/i, heading: 'Actual SCADA Readings', path: '/readings' },
      { link: /Analytics/i, heading: 'Accuracy & Deviation Analytics', path: '/analytics' },
      { link: /Alerts/i, heading: 'Deviation Alerts & Incidents', path: '/alerts' },
      { link: /Settings/i, heading: 'Settings & Diagnostics', path: '/settings' },
      { link: /Overview/i, heading: 'Energy Overview', path: '/' },
    ];

    const navRail = screen.getByLabelText('Primary navigation');
    for (const item of routes) {
      fireEvent.click(within(navRail).getByRole('link', { name: item.link }));
      expect(
        await screen.findByRole('heading', { name: item.heading }, { timeout: 8000 })
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe(item.path);
    }

    // Theme toggle (dark default -> light)
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: /Toggle color theme/i }));
    expect(document.documentElement.dataset.theme).toBe('light');

    vi.restoreAllMocks();
  }, 25000);
});

describe('Reusable UI primitives', () => {
  it('renders StatCard, DataTable, and ConfirmDialog interactions', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <div>
        <StatCard label="Total Capacity" value="12.5" unit="MW" subtext="3 plants" />
        <DataTable
          columns={[
            { key: 'plant_id', label: 'Plant ID', mono: true },
            { key: 'capacity', label: 'Capacity', align: 'right', numeric: true },
          ]}
          rows={[{ id: 1, plant_id: 'TEJAS001', capacity: '5.0 MW' }]}
        />
        <ConfirmDialog
          open
          title="Delete Plant?"
          description="Cascades to forecasts, readings, and alerts."
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </div>
    );

    expect(screen.getByText('Total Capacity')).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByText('TEJAS001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
