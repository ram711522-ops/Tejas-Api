import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as alertsApi from '../api/alertsApi';
import * as deviationsApi from '../api/deviationsApi';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as readingsApi from '../api/readingsApi';
import * as systemApi from '../api/systemApi';
import * as weatherApi from '../api/weatherApi';
import { SettingsProvider } from '../context/SettingsContext';
import {
  FIXTURE_ALERTS,
  FIXTURE_COMPARE,
  FIXTURE_FORECASTS,
  FIXTURE_HEALTH,
  FIXTURE_PLANTS,
  FIXTURE_READINGS,
  FIXTURE_WEATHER_BY_PLANT,
} from './fixtures/dashboardFixtures';
import * as useDashboardDataMod from '../hooks/useDashboardData';
import { OverviewDashboardPage } from '../pages/OverviewDashboardPage';
import {
  buildActivityEvents,
  deriveDashboardSummary,
  derivePlantStatus,
} from '../utils/dashboardSelectors';

// Recharts ResponsiveContainer uses ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('dashboardSelectors', () => {
  it('derives Producing, Idle, Warning, and Offline strictly from readings and alerts', () => {
    const plant = { plant_id: 'P1', installed_capacity_mw: 5 };

    expect(derivePlantStatus(plant, null, []).status).toBe('Offline');
    expect(derivePlantStatus(plant, { actual_power_kw: 0 }, []).status).toBe('Idle');
    expect(derivePlantStatus(plant, { actual_power_kw: 1850 }, []).status).toBe('Producing');
    expect(
      derivePlantStatus(plant, { actual_power_kw: 1850 }, [{ status: 'open' }]).status
    ).toBe('Warning');
    expect(derivePlantStatus(plant, null, [{ status: 'acknowledged' }]).status).toBe('Warning');
  });

  it('computes summary KPIs and chronological activity events', () => {
    const plants = [
      {
        plant_id: 'P1',
        plant_name: 'Plant One',
        plant_type: 'grid_tied',
        latitude: 14,
        longitude: 78,
        installed_capacity_mw: 4,
      },
      {
        plant_id: 'P2',
        plant_name: 'Plant Two',
        plant_type: 'rooftop',
        latitude: 15,
        longitude: 79,
        installed_capacity_mw: 1,
      },
    ];
    const now = new Date().toISOString();
    const forecasts = [
      {
        id: 1,
        plant_id: 'P1',
        forecast_timestamp: now,
        predicted_power_kw: 2000,
        source: 'ml_model',
        created_at: now,
      },
    ];
    const readings = [
      {
        id: 2,
        plant_id: 'P1',
        timestamp: now,
        actual_power_kw: 1800,
        irradiation: 0.7,
        source: 'scada',
        created_at: now,
      },
    ];
    const alerts = [
      {
        id: 3,
        plant_id: 'P1',
        predicted_power_kw: 2000,
        actual_power_kw: 900,
        residual_kw: -1100,
        deviation_percent: 55,
        severity: 'high',
        status: 'open',
        message: 'Drop',
        triggered_at: now,
      },
    ];

    const summary = deriveDashboardSummary({ plants, forecasts, readings, alerts, dateWindow: '7d' });
    expect(summary.totalCapacityKw).toBe(5000);
    expect(summary.totalCapacityMw).toBe(5);
    expect(summary.currentGenerationKw).toBe(1800);
    expect(summary.predictedGenerationKw).toBe(2000);
    expect(summary.openAlertsCount).toBe(1);

    const events = buildActivityEvents(forecasts, readings, alerts, 5);
    expect(events).toHaveLength(3);
  });
});

describe('OverviewDashboardPage', () => {
  function renderDashboard() {
    return render(
      <SettingsProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <OverviewDashboardPage />
        </MemoryRouter>
      </SettingsProvider>
    );
  }

  it('loads live API data into all 8 dashboard sections and supports interactive controls', async () => {
    vi.spyOn(systemApi, 'getSystemHealth').mockResolvedValue(FIXTURE_HEALTH);
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockResolvedValue(FIXTURE_READINGS);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(FIXTURE_ALERTS);
    vi.spyOn(weatherApi, 'getPlantWeather').mockImplementation((plantId) =>
      Promise.resolve(FIXTURE_WEATHER_BY_PLANT[plantId])
    );
    vi.spyOn(deviationsApi, 'previewComparison').mockResolvedValue(FIXTURE_COMPARE);

    renderDashboard();

    expect(await screen.findByText('Current Generation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Energy Overview' })).toBeInTheDocument();
    expect(screen.getByText('Predicted Generation')).toBeInTheDocument();
    expect(screen.getByText('Total Installed Capacity')).toBeInTheDocument();
    expect(screen.getByText('Performance / Deviation')).toBeInTheDocument();

    expect(screen.getByText('Solar Generation & ML Forecast')).toBeInTheDocument();
    expect(screen.getByText('Local Weather Conditions')).toBeInTheDocument();
    expect(screen.getByText('Prediction Performance')).toBeInTheDocument();
    expect(screen.getByText('Plant Performance')).toBeInTheDocument();
    expect(screen.getByText('Recent Alerts')).toBeInTheDocument();
    expect(screen.getByText('Recent System Activity')).toBeInTheDocument();

    // Plant status derivation
    expect(screen.getByText('Producing')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();

    // Date range selector interaction
    const btn24h = screen.getByRole('button', { name: '24H' });
    fireEvent.click(btn24h);
    expect(await screen.findByRole('button', { name: '24H' })).toHaveAttribute('aria-pressed', 'true');

    // Chart series toggle interaction
    const irrBtn = await screen.findByRole('button', { name: /Irradiation/i });
    fireEvent.click(irrBtn);
    expect(irrBtn).toHaveAttribute('aria-pressed', 'true');

    // Weather plant selector
    const weatherSelect = screen.getByLabelText('Weather plant selector');
    fireEvent.change(weatherSelect, { target: { value: 'TEJAS002' } });
    expect(screen.getByText(/Kurnool East Array \(TEJAS002\)/i)).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('renders loading, error with Retry, and empty states cleanly', () => {
    const spy = vi.spyOn(useDashboardDataMod, 'useDashboardData');

    spy.mockReturnValueOnce({
      loading: true,
      error: null,
      data: null,
      lastUpdated: null,
      refresh: vi.fn(),
    });
    const { unmount } = renderDashboard();
    expect(screen.getByLabelText('Loading Energy Overview...')).toBeInTheDocument();
    unmount();

    const retryFn = vi.fn();
    spy.mockReturnValueOnce({
      loading: false,
      error: { status: 503, message: 'Backend offline' },
      data: null,
      lastUpdated: null,
      refresh: retryFn,
    });
    const r2 = renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent('Backend offline');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryFn).toHaveBeenCalledTimes(1);
    r2.unmount();

    spy.mockReturnValueOnce({
      loading: false,
      error: null,
      data: { plants: [], forecasts: [], readings: [], alerts: [], weatherByPlant: {} },
      lastUpdated: null,
      refresh: vi.fn(),
    });
    renderDashboard();
    expect(screen.getByText('No solar plants registered')).toBeInTheDocument();
    spy.mockRestore();
  });
});
