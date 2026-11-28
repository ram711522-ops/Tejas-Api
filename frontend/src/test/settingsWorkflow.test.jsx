import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as systemApi from '../api/systemApi';
import { ToastContainer } from '../components/feedback/ToastContainer';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import { FIXTURE_HEALTH } from './fixtures/dashboardFixtures';
import { SettingsPage } from '../pages/SettingsPage';

function renderSettings() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SettingsPage />
          <ToastContainer />
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

describe('Phase 11 — Settings & System Diagnostics workflow', () => {
  it('renders live system status, section navigation, validates inputs, and persists preferences & theme across reloads', async () => {
    vi.spyOn(systemApi, 'getSystemHealth').mockResolvedValue(FIXTURE_HEALTH);
    vi.spyOn(systemApi, 'getApiRoot').mockResolvedValue({
      message: 'TEJAS Solar Prediction API is running',
    });

    const firstMount = renderSettings();

    // System status & info (real backend shapes: status='ok', model_features=6, GET / message)
    expect(await screen.findByText('Reachable')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.getByText('Model Loaded')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('6 active SVR features')).toBeInTheDocument();
    expect(screen.getByText('TEJAS Solar Prediction API is running')).toBeInTheDocument();
    expect(screen.getByText('Database connection successful.')).toBeInTheDocument();

    // Appearance: Dark default -> switch to Light -> persisted in localStorage
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: /Alabaster Light/i }));
    expect(document.documentElement.dataset.theme).toBe('light');

    // Preferences: change defaultDateWindow & pollingIntervalMs
    fireEvent.change(screen.getByLabelText('Default Telemetry Date Window'), {
      target: { value: '30d' },
    });
    fireEvent.change(screen.getByLabelText(/Background Refresh Interval/i), {
      target: { value: '60000' },
    });

    // Backend connection validation -> invalid URL rejected, valid URL accepted
    const urlInput = screen.getByLabelText('TEJAS API Base URL');
    fireEvent.change(urlInput, { target: { value: 'ftp://invalid-endpoint' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Base URL must use http:// or https://'
    );

    fireEvent.change(urlInput, { target: { value: 'http://127.0.0.1:9000/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Backend URL saved')).toBeInTheDocument();

    // Operator display name & non-secret HTTP Basic session credentials
    fireEvent.change(screen.getByLabelText('Operator Display Name'), {
      target: { value: 'Lead Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(await screen.findByText('Profile saved')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('HTTP Basic Username'), {
      target: { value: 'tejas_ops' },
    });
    fireEvent.change(screen.getByLabelText('HTTP Basic Password'), {
      target: { value: 'super-secret-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Session Auth' }));
    expect(await screen.findByText('SESSION ACTIVE (tejas_ops)')).toBeInTheDocument();
    expect(screen.queryByText('super-secret-pass')).not.toBeInTheDocument();

    // Section navigation isolates targeted panel cleanly
    const secNav = screen.getByRole('navigation', { name: 'Settings sections' });
    fireEvent.click(within(secNav).getByRole('button', { name: 'Appearance' }));
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Backend Connection Information' })
    ).not.toBeInTheDocument();
    fireEvent.click(within(secNav).getByRole('button', { name: 'All Sections' }));
    expect(
      screen.getByRole('heading', { name: 'Backend Connection Information' })
    ).toBeInTheDocument();

    // Unmount and remount to verify settings persistence via localStorage & sessionStorage
    firstMount.unmount();
    renderSettings();

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(screen.getByLabelText('Default Telemetry Date Window')).toHaveValue('30d');
    expect(screen.getByLabelText(/Background Refresh Interval/i)).toHaveValue('60000');
    expect(screen.getByLabelText('TEJAS API Base URL')).toHaveValue('http://127.0.0.1:9000');
    expect(screen.getByLabelText('Operator Display Name')).toHaveValue('Lead Engineer');
    expect(screen.getByText('SESSION ACTIVE (tejas_ops)')).toBeInTheDocument();

    // Clear session auth + Reset defaults
    fireEvent.click(screen.getByRole('button', { name: 'Clear Session Auth' }));
    expect(await screen.findByText('NOT CONFIGURED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Defaults' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(screen.getByLabelText('Default Telemetry Date Window')).toHaveValue('7d');

    vi.restoreAllMocks();
  });

  it('shows unreachable error state and Retry when /health probe fails', async () => {
    vi.spyOn(systemApi, 'getSystemHealth').mockRejectedValue(new Error('Connection refused'));
    vi.spyOn(systemApi, 'getApiRoot').mockRejectedValue(new Error('Connection refused'));

    renderSettings();

    expect(await screen.findByText('Backend unreachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
