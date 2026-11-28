import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as plantsApi from '../api/plantsApi';
import { PlantFormModal } from '../components/forms/PlantFormModal';
import { resetNominatimCachesForTests } from '../utils/nominatimGeocoder';

describe('OpenStreetMap + React Leaflet LocationPicker & PlantFormModal integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetNominatimCachesForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('locks manual coordinates immediately without requiring any API key', async () => {
    render(<PlantFormModal open onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByText(/OPENSTREETMAP · GEOSPATIAL SELECTOR/i)).toBeInTheDocument();
    expect(screen.getByText('Click Map or Search')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Latitude/i), { target: { value: '14.682' } });
    fireEvent.change(screen.getByLabelText(/Longitude/i), { target: { value: '77.601' } });

    expect(await screen.findByText('Location Selected')).toBeInTheDocument();
    expect(screen.getByText(/14\.6820° N · 77\.6010° E/)).toBeInTheDocument();
  });

  it('searches via Nominatim, selects location, handles Reset, and submits valid PlantCreate schema', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 100234,
          lat: '27.5396',
          lon: '71.9158',
          name: 'Bhadla Solar Park',
          display_name: 'Bhadla Solar Park, Phalodi, Jodhpur, Rajasthan, India',
          type: 'solar',
        },
      ],
    });

    const createSpy = vi
      .spyOn(plantsApi, 'createPlant')
      .mockImplementation(async (payload) => payload);

    render(<PlantFormModal open onClose={vi.fn()} onSaved={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText('Search plant location...');
    fireEvent.change(searchInput, { target: { value: 'Bhadla Solar Park' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch.mock.calls[0][0]).toContain(
      'https://nominatim.openstreetmap.org/search'
    );

    const option = await screen.findByRole('button', {
      name: /Bhadla Solar Park, Phalodi/i,
    });
    fireEvent.click(option);

    expect(await screen.findByText('Location Selected')).toBeInTheDocument();
    expect(screen.getByLabelText(/Latitude/i)).toHaveValue(27.5396);
    expect(screen.getByLabelText(/Longitude/i)).toHaveValue(71.9158);
    expect(
      screen.getByText('Bhadla Solar Park, Phalodi, Jodhpur, Rajasthan, India')
    ).toBeInTheDocument();

    // Quick-fill plant name from selected place
    fireEvent.click(screen.getByRole('button', { name: /Use as Plant Name/i }));
    expect(screen.getByLabelText(/Plant Name/i)).toHaveValue('Bhadla Solar Park');

    // Fill required plant fields & verify extra="forbid" schema compatibility
    fireEvent.change(screen.getByLabelText(/Plant ID/i), { target: { value: 'TEJAS-OSM-01' } });
    fireEvent.change(screen.getByLabelText(/Installed Capacity/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Register Plant/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).toEqual({
      plant_id: 'TEJAS-OSM-01',
      plant_name: 'Bhadla Solar Park',
      plant_type: 'grid_tied',
      installed_capacity_mw: 50,
      latitude: 27.5396,
      longitude: 71.9158,
      tilt: null,
      azimuth: null,
    });
    expect(sentPayload).not.toHaveProperty('address');
    expect(sentPayload).not.toHaveProperty('placeName');

    // Reset clears coordinates
    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(screen.getByLabelText(/Latitude/i)).toHaveValue(null);
    expect(screen.getByLabelText(/Longitude/i)).toHaveValue(null);
  });

  it('triggers reverse geocoding when clicking the Leaflet map and displays location on Edit Plant', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Kurnool Solar Park Block A, Andhra Pradesh, India',
        name: 'Kurnool Solar Park',
      }),
    });

    const existing = {
      plant_id: 'TEJAS002',
      plant_name: 'Kurnool East Array',
      plant_type: 'utility_scale',
      installed_capacity_mw: 8.5,
      latitude: 15.68,
      longitude: 78.28,
      tilt: 18,
      azimuth: 180,
    };

    const { container } = render(
      <PlantFormModal open initialPlant={existing} onClose={vi.fn()} onSaved={vi.fn()} />
    );

    expect(screen.getByText('Location Selected')).toBeInTheDocument();
    expect(screen.getByLabelText(/Latitude/i)).toHaveValue(15.68);
    expect(screen.getByLabelText(/Longitude/i)).toHaveValue(78.28);

    // Click inside Leaflet map container to test map click handler + Nominatim /reverse
    const mapContainer = container.querySelector('.leaflet-container');
    expect(mapContainer).toBeTruthy();
    fireEvent.click(mapContainer, { clientX: 80, clientY: 80 });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch.mock.calls[0][0]).toContain(
      'https://nominatim.openstreetmap.org/reverse'
    );
    expect(
      await screen.findByText('Kurnool Solar Park Block A, Andhra Pradesh, India')
    ).toBeInTheDocument();
  });
});
