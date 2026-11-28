import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as alertsApi from '../api/alertsApi';
import * as deviationsApi from '../api/deviationsApi';
import * as forecastsApi from '../api/forecastsApi';
import * as plantsApi from '../api/plantsApi';
import * as readingsApi from '../api/readingsApi';
import { ToastContainer } from '../components/feedback/ToastContainer';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import {
  FIXTURE_ALERTS,
  FIXTURE_COMPARE,
  FIXTURE_FORECASTS,
  FIXTURE_PLANTS,
  FIXTURE_READINGS,
} from './fixtures/dashboardFixtures';
import { AnalyticsPage } from '../pages/AnalyticsPage';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderAnalytics() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AnalyticsPage />
          <ToastContainer />
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

describe('Phase 9 — Analytics & Solar Intelligence workflow', () => {
  it('computes generation, accuracy, and deviation visualizations from backend telemetry and supports filters', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue(FIXTURE_FORECASTS);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockResolvedValue(FIXTURE_READINGS);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue(FIXTURE_ALERTS);
    const compareSpy = vi.spyOn(deviationsApi, 'previewComparison').mockResolvedValue(FIXTURE_COMPARE);

    renderAnalytics();

    expect(await screen.findByText('Total Sampled Output')).toBeInTheDocument();
    expect(screen.getByText('Average Generation')).toBeInTheDocument();
    expect(screen.getByText('Maximum Generation')).toBeInTheDocument();
    expect(screen.getByText('Recorded Deviations')).toBeInTheDocument();
    expect(screen.getByText('Mean Absolute Error')).toBeInTheDocument();
    expect(screen.getByText('Plant Generation & Forecast Benchmark')).toBeInTheDocument();
    expect(screen.getByText('Weather Sensor vs Generation Relationship')).toBeInTheDocument();
    expect(screen.getByText('Deviation Patterns by Plant & Severity')).toBeInTheDocument();
    expect(screen.getByText('Computed From Real Backend Telemetry')).toBeInTheDocument();
    expect(screen.getByText('Unavailable (Not Provided by Backend)')).toBeInTheDocument();

    // Chart mode toggle -> Generation Trend
    fireEvent.click(screen.getByRole('tab', { name: /Generation Trend/i }));
    expect(screen.getByText('Fleet Solar Generation Trend')).toBeInTheDocument();

    // Weather Relationship X-axis toggle -> Module Temp
    fireEvent.click(screen.getByRole('tab', { name: 'Module Temp' }));
    expect(
      screen.getByText(/Recorded module temp vs measured AC output/i)
    ).toBeInTheDocument();

    // Custom date range reveals start & end inputs
    fireEvent.change(screen.getByLabelText('Analytics date window'), {
      target: { value: 'custom' },
    });
    expect(screen.getByLabelText('Start Date / Time')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date / Time')).toBeInTheDocument();

    // Backend /compare preview check
    fireEvent.click(screen.getByRole('button', { name: 'Preview Check' }));
    await waitFor(() => expect(compareSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(FIXTURE_COMPARE.reason)).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('displays dashes cleanly with zero fabricated accuracy metrics when no readings/forecasts exist', async () => {
    vi.spyOn(plantsApi, 'listPlants').mockResolvedValue(FIXTURE_PLANTS);
    vi.spyOn(forecastsApi, 'fetchAllForecastsInRange').mockResolvedValue([]);
    vi.spyOn(readingsApi, 'fetchAllReadingsInRange').mockResolvedValue([]);
    vi.spyOn(alertsApi, 'listAlerts').mockResolvedValue([]);

    renderAnalytics();

    expect(await screen.findByText('0 readings • 0 matched pairs')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText('No aligned forecast/reading pairs')).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
