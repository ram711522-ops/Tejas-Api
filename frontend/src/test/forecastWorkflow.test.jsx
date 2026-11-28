import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as predictionsApi from '../api/predictionsApi';
import * as weatherApi from '../api/weatherApi';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import {
  FIXTURE_FORECASTS,
  FIXTURE_PLANTS,
  FIXTURE_WEATHER_BY_PLANT,
} from './fixtures/dashboardFixtures';
import { ForecastsPage } from '../pages/ForecastsPage';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderForecasts() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ForecastsPage />
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

const PREVIEW_RESPONSE = {
  plant_id: 'TEJAS002',
  plant_name: 'Kurnool East Array',
  model_plant_code: 1,
  plant_capacity_kw: 8500,
  raw_model_prediction_kw: 24500.0,
  training_plant_id: '4136001',
  training_capacity_kw: 26000,
  capacity_factor: 0.9423,
  scaled_prediction_kw: 8910.4,
  predicted_power_kw: 8500.0,
  prediction_exceeds_capacity: true,
  scaling_note:
    'Raw model output was converted to a capacity factor using the training plant baseline.',
  weather_source: 'open-meteo',
  observed_at_local: '2026-11-28T11:15',
  timezone: 'Asia/Kolkata',
  inputs_used: {
    AMBIENT_TEMPERATURE: { value: 32.1, unit: '°C', source: 'Open-Meteo weather data' },
    IRRADIATION: { value: 0.89, unit: 'kW/m²', source: 'Open-Meteo shortwave radiation' },
    MODULE_TEMPERATURE: {
      value: 56.04,
      unit: '°C',
      source: 'Estimated, not measured',
    },
  },
};

describe('Phase 7 — Forecast Intelligence workflow', () => {
  it('separates weather fetch, read-only preview, review details, and explicit save confirmation', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    const listForecastSpy = vi
      .spyOn(forecastsApi, 'fetchAllForecastsInRange')
      .mockResolvedValue(FIXTURE_FORECASTS);
    const weatherSpy = vi
      .spyOn(weatherApi, 'getPlantWeather')
      .mockImplementation((id) => Promise.resolve(FIXTURE_WEATHER_BY_PLANT[id]));
    const previewSpy = vi
      .spyOn(predictionsApi, 'previewAutomaticPrediction')
      .mockResolvedValue(PREVIEW_RESPONSE);
    const saveSpy = vi.spyOn(predictionsApi, 'runAutomaticPrediction').mockResolvedValue({
      ...PREVIEW_RESPONSE,
      forecast_saved: true,
      forecast_id: 991,
      model_version: 'svr_rbf_v1',
    });

    renderForecasts();

    // 1. Auto-selects first plant and loads weather telemetry
    expect(await screen.findByText('31.4')).toBeInTheDocument();
    expect(weatherSpy).toHaveBeenCalledWith('TEJAS001', undefined, { force: false });

    // 2. Switch selected plant -> re-fetches weather for TEJAS002
    fireEvent.change(screen.getByLabelText(/01 · Target Solar Plant/i), {
      target: { value: 'TEJAS002' },
    });
    expect(await screen.findByText(/Kurnool East Array/i)).toBeInTheDocument();
    expect(weatherSpy).toHaveBeenCalledWith('TEJAS002', undefined, { force: false });

    // 3. Preview only — must NOT save automatically
    fireEvent.click(screen.getByRole('button', { name: /Preview Weather SVR/i }));
    expect(await screen.findByText('Preview Only — Not Saved')).toBeInTheDocument();
    expect(screen.getByText(/Unclipped scaled estimate \(8910\.4 kW\) exceeded installed capacity/i)).toBeInTheDocument();
    expect(screen.getByText(/56\.04 °C/)).toBeInTheDocument();
    expect(previewSpy).toHaveBeenCalledWith('TEJAS002');
    expect(saveSpy).not.toHaveBeenCalled();

    // 4. Explicit Save Forecast triggers POST /predict/automatic and refreshes list
    fireEvent.click(screen.getByRole('button', { name: /Save Forecast \(Generate & Save\)/i }));
    expect(await screen.findByText(/Forecast #991 persisted to MySQL/i)).toBeInTheDocument();
    expect(saveSpy).toHaveBeenCalledWith('TEJAS002');
    expect(listForecastSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    vi.restoreAllMocks();
  });

  it('handles forecast_saved=false warning, weather failure, prediction failure, and missing plants', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue([]);
    vi.spyOn(weatherApi, 'getPlantWeather').mockRejectedValueOnce({
      status: 502,
      message: 'Open-Meteo upstream timeout',
    });
    vi.spyOn(predictionsApi, 'runAutomaticPrediction').mockResolvedValueOnce({
      ...PREVIEW_RESPONSE,
      plant_id: 'TEJAS001',
      forecast_saved: false,
      forecast_id: null,
      warning: 'Prediction succeeded but the forecast could not be saved.',
    });

    renderForecasts();

    expect(await screen.findByText(/Weather lookup failed for TEJAS001/i)).toBeInTheDocument();
    expect(screen.getByText(/Open-Meteo upstream timeout/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate & Save/i }));
    expect(
      await screen.findByText('Prediction succeeded but the forecast could not be saved.')
    ).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('supports search & source filtering, forecast creation, deletion, and empty plant state', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(weatherApi, 'getPlantWeather').mockResolvedValue(FIXTURE_WEATHER_BY_PLANT.TEJAS001);
    const deleteSpy = vi.spyOn(forecastsApi, 'deleteForecast').mockResolvedValue(undefined);

    const { unmount } = renderForecasts();
    expect(await screen.findByText(`${FIXTURE_FORECASTS.length} records`)).toBeInTheDocument();

    // Filter via search box
    const searchInput = screen.getByLabelText('Search forecast history');
    fireEvent.change(searchInput, { target: { value: 'TEJAS002' } });
    const tejas2Count = FIXTURE_FORECASTS.filter((f) => f.plant_id === 'TEJAS002').length;
    expect(screen.getByText(`${tejas2Count} records`)).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '' } });

    // Delete first row via ConfirmDialog
    const firstId = [...FIXTURE_FORECASTS].sort(
      (a, b) => new Date(b.forecast_timestamp).getTime() - new Date(a.forecast_timestamp).getTime()
    )[0].id;
    fireEvent.click(screen.getByLabelText(`Delete forecast ${firstId}`));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Forecast' }));
    expect(deleteSpy).toHaveBeenCalledWith(firstId);

    unmount();
    vi.restoreAllMocks();

    // Missing plants empty state
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue([]);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue([]);
    renderForecasts();
    expect(await screen.findByText('No solar plants registered')).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
