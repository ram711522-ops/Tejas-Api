import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as alertsApi from '../api/alertsApi';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as readingsApi from '../api/readingsApi';
import { ToastContainer } from '../components/feedback/ToastContainer';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import {
  FIXTURE_ALERTS,
  FIXTURE_FORECASTS,
  FIXTURE_PLANTS,
  FIXTURE_READINGS,
} from './fixtures/dashboardFixtures';
import { AlertsPage } from '../pages/AlertsPage';

function renderAlertsPage() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AlertsPage />
          <ToastContainer />
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

describe('Phase 10 — Alerts & Monitoring Center workflow', () => {
  it('renders overview KPIs, dossier details, queue/table views, search/filters, and open -> acknowledged -> resolved lifecycle', async () => {
    let store = FIXTURE_ALERTS.map((a) => ({ ...a }));

    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(alertsApi, 'listAlerts').mockImplementation(async (params = {}) => {
      return store.filter((a) => !params.plant_id || a.plant_id === params.plant_id);
    });
    vi.spyOn(forecastsApi, 'getForecast').mockResolvedValue(FIXTURE_FORECASTS[1]);
    vi.spyOn(readingsApi, 'getReading').mockResolvedValue(FIXTURE_READINGS[1]);

    const updateSpy = vi
      .spyOn(alertsApi, 'updateAlert')
      .mockImplementation(async (id, payload) => {
        const now = new Date().toISOString();
        let updated = null;
        store = store.map((a) => {
          if (a.id !== id) return a;
          updated = {
            ...a,
            ...payload,
            resolved_at: payload.status === 'resolved' ? now : null,
          };
          return updated;
        });
        return updated;
      });

    renderAlertsPage();

    // Overview KPI summary cards
    const summarySection = await screen.findByLabelText('Alert summary counts');
    expect(within(summarySection).getByText('Total Alerts')).toBeInTheDocument();
    expect(within(summarySection).getByText('Open Alerts')).toBeInTheDocument();
    expect(within(summarySection).getByText('Acknowledged')).toBeInTheDocument();
    expect(within(summarySection).getByText('Resolved')).toBeInTheDocument();
    expect(within(summarySection).getByText('3')).toBeInTheDocument();

    // Incident dossier displays associated plant, timestamps, linked forecast & reading
    const dossier = await screen.findByLabelText('Selected alert dossier');
    expect(within(dossier).getByText('INCIDENT DOSSIER #14')).toBeInTheDocument();
    expect(within(dossier).getByText(/Kurnool East Array \(TEJAS002\)/i)).toBeInTheDocument();
    expect(within(dossier).getByText(/TEJAS002 · 8\.5 MW \(utility_scale\)/i)).toBeInTheDocument();
    expect(within(dossier).getByText('Pending resolution')).toBeInTheDocument();
    expect(await within(dossier).findByText(/Forecast #\d+:/i)).toBeInTheDocument();
    expect(within(dossier).getByText(/Reading #\d+:/i)).toBeInTheDocument();

    // Switch between Queue and Table views
    fireEvent.click(screen.getByRole('tab', { name: /Table/i }));
    const table = screen.getByRole('table', { name: 'Deviation alerts table' });
    expect(within(table).getByText('#14')).toBeInTheDocument();
    expect(within(table).getByText('#13')).toBeInTheDocument();
    expect(within(table).getByText('#12')).toBeInTheDocument();

    // Switch back to Queue view
    fireEvent.click(screen.getByRole('tab', { name: /Queue/i }));

    // Lifecycle step 1: open -> acknowledged
    fireEvent.click(within(dossier).getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenNthCalledWith(1, 14, { status: 'acknowledged' })
    );
    expect(await screen.findByText(/Alert #14 moved from open → acknowledged/i)).toBeInTheDocument();

    // Lifecycle step 2: acknowledged -> resolved (via confirmation dialog)
    fireEvent.click(within(dossier).getByRole('button', { name: 'Resolve' }));
    const confirmDialog = await screen.findByRole('dialog');
    expect(within(confirmDialog).getByText('Resolve alert #14?')).toBeInTheDocument();
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Resolve Alert' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenNthCalledWith(2, 14, { status: 'resolved' })
    );
    expect(
      await screen.findByText(/Alert #14 moved from acknowledged → resolved/i)
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dossier).queryByText('Pending resolution')).not.toBeInTheDocument()
    );

    // Search + filter + reset empty state
    fireEvent.change(screen.getByLabelText('Search alerts'), {
      target: { value: 'Morning irradiance ramp' },
    });
    expect(screen.getByText('1 incident of 3')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search alerts'), {
      target: { value: 'nonexistent-query-xyz' },
    });
    expect(screen.getByText('No alerts match these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }));
    expect(screen.getByText('3 incidents')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('shows error state and retries cleanly when alert API fails', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockRejectedValue(new Error('Backend unreachable'));
    vi.spyOn(alertsApi, 'listAlerts').mockRejectedValue(new Error('Backend unreachable'));

    renderAlertsPage();

    expect(await screen.findByText('Failed to load alerts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
