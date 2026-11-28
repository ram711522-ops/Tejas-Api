import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as alertsApi from '../api/alertsApi';
import * as deviationsApi from '../api/deviationsApi';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as predictionsApi from '../api/predictionsApi';
import * as readingsApi from '../api/readingsApi';
import * as weatherApi from '../api/weatherApi';
import { ToastContainer } from '../components/feedback/ToastContainer';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import {
  FIXTURE_ALERTS,
  FIXTURE_COMPARE,
  FIXTURE_FORECASTS,
  FIXTURE_PLANTS,
  FIXTURE_READINGS,
  FIXTURE_WEATHER_BY_PLANT,
} from './fixtures/dashboardFixtures';
import { PlantDetailsPage } from '../pages/PlantDetailsPage';
import { PlantsPage } from '../pages/PlantsPage';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderWithProviders(initialEntry = '/plants') {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter
          initialEntries={[initialEntry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/plants" element={<PlantsPage />} />
            <Route path="/plants/:plantId" element={<PlantDetailsPage />} />
          </Routes>
          <ToastContainer />
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

describe('Phase 6 — PlantsPage workflow', () => {
  it('lists plants, filters by search/type/status, toggles Grid/List, adds, edits, and deletes a plant', async () => {
    const currentPlants = [...FIXTURE_PLANTS.slice(0, 2)];

    vi.spyOn(plantsApi, 'listPlants').mockImplementation(async () => [...currentPlants]);
    vi.spyOn(readingsApi, 'listReadings').mockResolvedValue(FIXTURE_READINGS);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(FIXTURE_ALERTS);

    const createSpy = vi
      .spyOn(plantsApi, 'createPlant')
      .mockRejectedValueOnce({ status: 409, message: 'A plant with this plant_id already exists.' })
      .mockImplementationOnce(async (payload) => {
        currentPlants.push(payload);
        return payload;
      });

    const updateSpy = vi
      .spyOn(plantsApi, 'updatePlant')
      .mockImplementation(async (plantId, payload) => {
        const idx = currentPlants.findIndex((p) => p.plant_id === plantId);
        currentPlants[idx] = { ...currentPlants[idx], ...payload };
        return currentPlants[idx];
      });

    const deleteSpy = vi.spyOn(plantsApi, 'deletePlant').mockImplementation(async (plantId) => {
      const idx = currentPlants.findIndex((p) => p.plant_id === plantId);
      if (idx >= 0) currentPlants.splice(idx, 1);
    });

    renderWithProviders('/plants');

    expect(await screen.findByText('Anantapur Solar Park')).toBeInTheDocument();
    expect(screen.getByText(/2 plants • 18.50 MW/i)).toBeInTheDocument();

    // Search filter
    fireEvent.change(screen.getByLabelText('Search plants'), { target: { value: 'Kurnool' } });
    expect(screen.queryByText('Anantapur Solar Park')).not.toBeInTheDocument();
    expect(screen.getByText('Kurnool East Array')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search plants'), { target: { value: '' } });

    // List view toggle
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));

    // Add Plant modal — validation & duplicate 409 handling & success
    fireEvent.click(screen.getByRole('button', { name: /Add Plant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Register Plant/i }));
    expect(await screen.findByText('Plant ID is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Plant ID/i), { target: { value: 'TEJAS099' } });
    fireEvent.change(screen.getByLabelText(/Plant Name/i), { target: { value: 'Tirupati Array' } });
    fireEvent.change(screen.getByLabelText(/Installed Capacity/i), { target: { value: '4.2' } });
    fireEvent.change(screen.getByLabelText(/Latitude/i), { target: { value: '13.6288' } });
    fireEvent.change(screen.getByLabelText(/Longitude/i), { target: { value: '79.4192' } });

    // 1st submit -> 409 duplicate
    fireEvent.click(screen.getByRole('button', { name: /Register Plant/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A plant with this plant_id already exists.'
    );

    // 2nd submit -> 201 Created
    fireEvent.click(screen.getByRole('button', { name: /Register Plant/i }));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Tirupati Array')).toBeInTheDocument();

    // Edit Plant (plant_id disabled & omitted from PUT body)
    fireEvent.click(screen.getByRole('button', { name: 'Edit TEJAS099' }));
    expect(screen.getByLabelText(/Plant ID/i)).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Plant Name/i), {
      target: { value: 'Tirupati Array v2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'TEJAS099',
        expect.not.objectContaining({ plant_id: expect.anything() })
      )
    );
    expect(await screen.findByText('Tirupati Array v2')).toBeInTheDocument();

    // Delete Plant with cascade confirmation
    fireEvent.click(screen.getByRole('button', { name: 'Delete TEJAS099' }));
    expect(screen.getByText(/cascade-delete all associated forecasts/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Plant' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('TEJAS099'));

    vi.restoreAllMocks();
  });
});

describe('Phase 6 — PlantDetailsPage workflow', () => {
  it('loads plant specs, weather, predictions, comparison, tabs, and alert actions', async () => {
    const plant = FIXTURE_PLANTS[1]; // TEJAS002
    const plantForecasts = FIXTURE_FORECASTS.filter((f) => f.plant_id === 'TEJAS002');
    const plantReadings = FIXTURE_READINGS.filter((r) => r.plant_id === 'TEJAS002');
    const plantAlerts = FIXTURE_ALERTS.filter((a) => a.plant_id === 'TEJAS002');

    vi.spyOn(plantsApi, 'getPlant').mockResolvedValue(plant);
    vi.spyOn(weatherApi, 'getPlantWeather').mockResolvedValue(FIXTURE_WEATHER_BY_PLANT.TEJAS002);
    vi.spyOn(forecastsApi, 'listForecasts').mockResolvedValue(plantForecasts);
    vi.spyOn(readingsApi, 'listReadings').mockResolvedValue(plantReadings);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(plantAlerts);
    vi.spyOn(deviationsApi, 'previewComparison').mockResolvedValue(FIXTURE_COMPARE);

    const autoSpy = vi.spyOn(predictionsApi, 'runAutomaticPrediction').mockResolvedValue({
      plant_id: 'TEJAS002',
      predicted_power_kw: 4820.5,
      capacity_factor: 0.5671,
      prediction_exceeds_capacity: false,
      scaling_note: 'Scaled to 8.5 MW plant capacity.',
      forecast_saved: true,
      forecast_id: 901,
      inputs_used: {
        AMBIENT_TEMPERATURE: { value: 32.8, unit: '°C' },
        MODULE_TEMPERATURE: { value: 52.6, unit: '°C' },
      },
    });

    const compareRunSpy = vi.spyOn(deviationsApi, 'runComparison').mockResolvedValue({
      ...FIXTURE_COMPARE,
      alert_generated: true,
    });

    const alertUpdateSpy = vi.spyOn(alertsApi, 'updateAlert').mockResolvedValue({
      ...plantAlerts[0],
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    });

    renderWithProviders('/plants/TEJAS002');

    expect(await screen.findByRole('heading', { name: 'Kurnool East Array' })).toBeInTheDocument();
    expect(await screen.findByText('32.8')).toBeInTheDocument(); // Weather temp
    expect(screen.getByText('Deviation & Comparison')).toBeInTheDocument();

    // Run & Save Forecast
    fireEvent.click(screen.getByRole('button', { name: /Run & Save Forecast/i }));
    await waitFor(() => expect(autoSpy).toHaveBeenCalledWith('TEJAS002'));
    expect(await screen.findByText(/4,820.5 kW/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved #901/i)).toBeInTheDocument();

    // Check & Generate Alert
    fireEvent.click(screen.getByRole('button', { name: /Check & Generate Alert/i }));
    await waitFor(() => expect(compareRunSpy).toHaveBeenCalledWith('TEJAS002', { create_alert: true }));

    // Switch to Actual Readings and Alerts tabs + resolve alert
    fireEvent.click(screen.getByRole('tab', { name: /Actual Readings/i }));
    expect(await screen.findByText('Ambient °C')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Alerts/i }));
    const resolveButtons = await screen.findAllByRole('button', { name: 'Resolve' });
    fireEvent.click(resolveButtons[0]);
    await waitFor(() =>
      expect(alertUpdateSpy).toHaveBeenCalledWith(plantAlerts[0].id, { status: 'resolved' })
    );

    vi.restoreAllMocks();
  });

  it('renders 404 Not Found state when plant does not exist', async () => {
    vi.spyOn(plantsApi, 'getPlant').mockRejectedValue({
      status: 404,
      message: 'Plant not found.',
    });

    renderWithProviders('/plants/MISSING-99');
    expect(await screen.findByText('Plant "MISSING-99" not found')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
