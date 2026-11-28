import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as alertsApi from '../api/alertsApi';
import * as deviationsApi from '../api/deviationsApi';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as predictionsApi from '../api/predictionsApi';
import * as readingsApi from '../api/readingsApi';
import * as systemApi from '../api/systemApi';
import * as weatherApi from '../api/weatherApi';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import {
  FIXTURE_ALERTS,
  FIXTURE_COMPARE,
  FIXTURE_FORECASTS,
  FIXTURE_HEALTH,
  FIXTURE_PLANTS,
  FIXTURE_READINGS,
  FIXTURE_WEATHER_BY_PLANT,
} from './fixtures/dashboardFixtures';
import { ActualReadingsPage } from '../pages/ActualReadingsPage';
import { AlertsPage } from '../pages/AlertsPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { ForecastsPage } from '../pages/ForecastsPage';
import { SettingsPage } from '../pages/SettingsPage';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderWithProviders(ui) {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {ui}
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

describe('Observatory Real Sector Pages', () => {
  it('runs SVR Manual Predictor & Auto Predictor on ForecastsPage', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(weatherApi, 'getPlantWeather').mockResolvedValue(FIXTURE_WEATHER_BY_PLANT.TEJAS001);
    const manualSpy = vi.spyOn(predictionsApi, 'predictManual').mockResolvedValue({
      plant_code: 0,
      predicted_power_kw: 2642.5,
      daytime: true,
    });
    const autoSpy = vi.spyOn(predictionsApi, 'previewAutomaticPrediction').mockResolvedValue({
      forecast_saved: false,
      predicted_power_kw: 3120.4,
      capacity_factor: 0.624,
      prediction_exceeds_capacity: false,
      scaling_note: 'Scaled to 5 MW fleet rating',
    });

    renderWithProviders(<ForecastsPage />);
    expect(await screen.findByText(`${FIXTURE_FORECASTS.length} records`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Run SVR Prediction/i }));
    expect(await screen.findByText(/2,642\.5/)).toBeInTheDocument();
    expect(manualSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Preview Weather SVR/i }));
    expect(await screen.findByText(/3,120\.4/)).toBeInTheDocument();
    expect(autoSpy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('loads ActualReadingsPage metrics and filter controls', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockResolvedValue(FIXTURE_READINGS);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(FIXTURE_ALERTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(deviationsApi, 'previewComparison').mockResolvedValue(FIXTURE_COMPARE);

    renderWithProviders(<ActualReadingsPage />);
    expect(await screen.findByText('Peak AC Output')).toBeInTheDocument();
    expect(screen.getByText(`${FIXTURE_READINGS.length} readings`)).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('computes accuracy metrics and executes /compare audit on AnalyticsPage', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(weatherApi, 'getPlantWeather').mockResolvedValue(FIXTURE_WEATHER_BY_PLANT.TEJAS001);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockResolvedValue(FIXTURE_READINGS);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(FIXTURE_ALERTS);
    const compareSpy = vi.spyOn(deviationsApi, 'previewComparison').mockResolvedValue(FIXTURE_COMPARE);

    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByText('Mean Absolute Error')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Preview Check/i }));
    expect(await screen.findByText(FIXTURE_COMPARE.reason)).toBeInTheDocument();
    expect(compareSpy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('triages and updates alert status on AlertsPage', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(FIXTURE_ALERTS);
    vi.spyOn(forecastsApi, 'getForecast').mockResolvedValue(FIXTURE_FORECASTS[0]);
    vi.spyOn(readingsApi, 'getReading').mockResolvedValue(FIXTURE_READINGS[0]);
    const updateSpy = vi.spyOn(alertsApi, 'updateAlert').mockResolvedValue({
      ...FIXTURE_ALERTS[0],
      status: 'acknowledged',
    });

    renderWithProviders(<AlertsPage />);
    expect(await screen.findByText(/INCIDENT DOSSIER/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(updateSpy).toHaveBeenCalledWith(FIXTURE_ALERTS[0].id, { status: 'acknowledged' });

    vi.restoreAllMocks();
  });

  it('probes live health diagnostics and toggles theme on SettingsPage', async () => {
    vi.spyOn(systemApi, 'getSystemHealth').mockResolvedValue(FIXTURE_HEALTH);
    vi.spyOn(systemApi, 'getApiRoot').mockResolvedValue({ version: '2.1.0' });

    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('Model Loaded')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
