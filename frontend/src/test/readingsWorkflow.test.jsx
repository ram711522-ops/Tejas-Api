import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as deviationsApi from '../api/deviationsApi';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as readingsApi from '../api/readingsApi';
import { ToastContainer } from '../components/feedback/ToastContainer';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import {
  FIXTURE_COMPARE,
  FIXTURE_FORECASTS,
  FIXTURE_PLANTS,
  FIXTURE_READINGS,
} from './fixtures/dashboardFixtures';
import { ActualReadingsPage } from '../pages/ActualReadingsPage';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderReadings() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ActualReadingsPage />
          <ToastContainer />
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

describe('Phase 8 — Actual Readings & Performance workflow', () => {
  it('validates ReadingCreate schema, logs a reading, and auto-compares against saved forecast', async () => {
    const currentReadings = [...FIXTURE_READINGS];
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockImplementation(async () => [...currentReadings]);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);

    const comparePreviewSpy = vi
      .spyOn(deviationsApi, 'previewComparison')
      .mockResolvedValueOnce({
        ...FIXTURE_COMPARE,
        deviation_detected: false,
        severity: null,
        residual_kw: 45.2,
        deviation_kw: 45.2,
        deviation_percent: 0.9,
        daytime: true,
        threshold_kw: 856.2,
        reason: 'Actual generation is within normal operating range.',
      })
      .mockResolvedValueOnce({
        ...FIXTURE_COMPARE,
        reading_id: 999,
        actual_power_kw: 2950,
        predicted_power_kw: 5420,
        residual_kw: -2470,
        deviation_kw: 2470,
        deviation_percent: 45.57,
        daytime: true,
        threshold_kw: 1709.5,
        deviation_detected: true,
        severity: 'medium',
        reason: 'Under-generation detected: actual is 2470.00 kW below predicted.',
      });

    const createSpy = vi
      .spyOn(readingsApi, 'createReading')
      .mockImplementation(async (payload) => {
        const saved = { id: 999, created_at: new Date().toISOString(), ...payload };
        currentReadings.unshift(saved);
        return saved;
      });

    renderReadings();

    // Initial nominal backend verdict
    expect(await screen.findByText('Close to Prediction · Nominal')).toBeInTheDocument();
    expect(screen.getByText(/Backend Threshold: 856\.2 kW/i)).toBeInTheDocument();

    // Open Add Reading modal & test strict required field validation (empty '' is rejected, not coerced to 0)
    fireEvent.click(screen.getByRole('button', { name: /Add Reading/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Reading' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Actual power (kW) is required.'
    );
    expect(createSpy).not.toHaveBeenCalled();

    // Enter negative power -> blocked
    fireEvent.change(within(dialog).getByLabelText(/Actual Power/i), { target: { value: '-10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Reading' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Actual power must be >= 0 kW.'
    );

    // Clear ambient temp -> required validation error
    fireEvent.change(within(dialog).getByLabelText(/Actual Power/i), { target: { value: '2950' } });
    fireEvent.change(within(dialog).getByLabelText(/Ambient Temp/i), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Reading' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ambient temperature (°C) is required.'
    );

    // Fill valid reading fields & submit
    fireEvent.change(within(dialog).getByLabelText(/Ambient Temp/i), { target: { value: '30.2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Reading' }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      plant_id: 'TEJAS001',
      ambient_temperature: 30.2,
      actual_power_kw: 2950,
      source: 'scada',
    });

    // Verifies auto-compare ran with reading_id 999 and displayed backend Moderate Deviation verdict
    await waitFor(() =>
      expect(comparePreviewSpy).toHaveBeenCalledWith('TEJAS001', {
        reading_id: 999,
        forecast_id: undefined,
      })
    );
    expect(await screen.findByText('Moderate Deviation')).toBeInTheDocument();
    expect(screen.getByText(/45\.57%/)).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('supports Audit & Flag Alert, high deviation indicator, search filter, and row actions', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockResolvedValue(FIXTURE_READINGS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(deviationsApi, 'previewComparison').mockResolvedValue(FIXTURE_COMPARE);
    const runSpy = vi.spyOn(deviationsApi, 'runComparison').mockResolvedValue({
      ...FIXTURE_COMPARE,
      alert_generated: true,
      alert: { ...FIXTURE_COMPARE.alert, id: 777 },
    });
    const deleteSpy = vi.spyOn(readingsApi, 'deleteReading').mockResolvedValue(undefined);

    renderReadings();

    // FIXTURE_COMPARE has severity='high'
    expect(await screen.findByText('High Deviation')).toBeInTheDocument();

    // Audit & Flag Alert calls POST /plants/{id}/compare with create_alert: true
    fireEvent.click(screen.getByRole('button', { name: /Audit & Flag Alert/i }));
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Alert #777 Created')).toBeInTheDocument();

    // Switch chart tabs
    fireEvent.click(screen.getByRole('tab', { name: /Thermal & Power/i }));
    expect(screen.getByText('Actual Power & Thermal Correlation')).toBeInTheDocument();

    // Filter via search input
    const tejas2Count = FIXTURE_READINGS.filter((r) => r.plant_id === 'TEJAS002').length;
    fireEvent.change(screen.getByLabelText('Search actual readings'), {
      target: { value: 'TEJAS002' },
    });
    expect(screen.getByText(`${tejas2Count} readings`)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search actual readings'), { target: { value: '' } });

    // Row compare click
    const sortedTopId = [...FIXTURE_READINGS].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0].id;
    fireEvent.click(screen.getByLabelText(`Compare reading ${sortedTopId}`));
    await waitFor(() =>
      expect(deviationsApi.previewComparison).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ reading_id: sortedTopId })
      )
    );

    // Row delete confirmation
    fireEvent.click(screen.getByLabelText(`Delete reading ${sortedTopId}`));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete Reading' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(sortedTopId));

    vi.restoreAllMocks();
  });
});
