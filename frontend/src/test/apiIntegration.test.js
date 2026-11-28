// @vitest-environment node
import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listAlerts, updateAlert } from '../api/alertsApi';
import { clearApiCache } from '../api/cache';
import { setClientBaseUrl } from '../api/client';
import { previewComparison, runComparison } from '../api/deviationsApi';
import { createForecast, listForecasts } from '../api/forecastsApi';
import { createPlant, deletePlant, listPlants } from '../api/plantsApi';
import { predictManual, runAutomaticPrediction } from '../api/predictionsApi';
import { createReading, listReadings } from '../api/readingsApi';
import { getApiRoot, getSystemHealth } from '../api/systemApi';
import { getPlantWeather } from '../api/weatherApi';
import { clearStoredAuthCredentials, setStoredAuthCredentials } from '../utils/auth';

describe('Phase 5 API Integration Layer (HTTP, CORS, Basic Auth, Caching, Contracts)', () => {
  let server;
  let baseUrl;
  let plantRequests = 0;
  let requireAuth = false;
  let lastAuthHeader = null;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      // Simulate FastAPI CORSMiddleware headers
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, 'http://localhost');
      lastAuthHeader = req.headers.authorization || null;

      if (url.pathname === '/') {
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'TEJAS Solar Prediction API is running' }));
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            status: 'ok',
            model_loaded: true,
            model_features: 6,
            database: { connected: true, message: 'Database connection successful.' },
          })
        );
        return;
      }

      if (requireAuth) {
        const expected = `Basic ${Buffer.from('tejas_admin:root').toString('base64')}`;
        if (req.headers.authorization !== expected) {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic' });
          res.end(JSON.stringify({ detail: 'Invalid credentials' }));
          return;
        }
      }

      if (url.pathname === '/plants' && req.method === 'GET') {
        plantRequests += 1;
        res.writeHead(200);
        res.end(
          JSON.stringify([
            {
              plant_id: 'TEJAS001',
              plant_name: 'Anantapur Solar Park',
              plant_type: 'grid_tied',
              latitude: 14.8,
              longitude: 78.18,
              installed_capacity_mw: 5.0,
              tilt: 15.0,
              azimuth: 180.0,
            },
          ])
        );
        return;
      }

      if (url.pathname === '/plants' && req.method === 'POST') {
        res.writeHead(201);
        res.end(
          JSON.stringify({
            plant_id: 'NEW-01',
            plant_name: 'New Plant',
            plant_type: 'grid_tied',
            latitude: 14.8,
            longitude: 78.18,
            installed_capacity_mw: 2.0,
            tilt: null,
            azimuth: null,
          })
        );
        return;
      }

      if (url.pathname === '/plants/NEW-01' && req.method === 'DELETE') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === '/plants/TEJAS001/weather' && req.method === 'GET') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            plant_id: 'TEJAS001',
            plant_name: 'Anantapur Solar Park',
            latitude: 14.8,
            longitude: 78.18,
            weather: {
              source: 'open-meteo',
              ambient_temperature_c: 32,
              relative_humidity_percent: 40,
              shortwave_radiation_w_m2: 750,
              irradiation_kw_m2: 0.75,
            },
          })
        );
        return;
      }

      if (url.pathname === '/predict' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ plant_code: 0, predicted_power_kw: 15200.5 }));
        return;
      }

      if (url.pathname === '/plants/TEJAS001/predict/automatic' && req.method === 'POST') {
        res.writeHead(201);
        res.end(
          JSON.stringify({
            plant_id: 'TEJAS001',
            predicted_power_kw: 2800.1,
            forecast_saved: true,
            forecast_id: 55,
          })
        );
        return;
      }

      if (url.pathname === '/forecasts' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }

      if (url.pathname === '/forecasts' && req.method === 'POST') {
        res.writeHead(201);
        res.end(
          JSON.stringify({
            id: 1,
            plant_id: 'TEJAS001',
            forecast_timestamp: '2026-11-28T10:00:00Z',
            predicted_power_kw: 2400,
            source: 'manual',
            model_version: null,
            created_at: '2026-11-28T10:00:00Z',
          })
        );
        return;
      }

      if (url.pathname === '/readings' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }

      if (url.pathname === '/readings' && req.method === 'POST') {
        res.writeHead(201);
        res.end(
          JSON.stringify({
            id: 2,
            plant_id: 'TEJAS001',
            timestamp: '2026-11-28T10:00:00Z',
            ambient_temperature: 30,
            module_temperature: 45,
            irradiation: 0.75,
            actual_power_kw: 2300,
            source: 'scada',
            created_at: '2026-11-28T10:00:00Z',
          })
        );
        return;
      }

      if (url.pathname === '/plants/TEJAS001/compare') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            plant_id: 'TEJAS001',
            plant_name: 'Anantapur Solar Park',
            forecast_id: 1,
            forecast_timestamp: '2026-11-28T10:00:00Z',
            predicted_power_kw: 2400,
            reading_id: 2,
            reading_timestamp: '2026-11-28T10:00:00Z',
            actual_power_kw: 2300,
            irradiation: 0.75,
            residual_kw: -100,
            deviation_kw: 100,
            deviation_percent: 4.17,
            daytime: true,
            threshold_kw: 428.1,
            deviation_detected: false,
            severity: null,
            reason: 'Actual generation is within normal operating range.',
            alert_generated: false,
            alert: null,
          })
        );
        return;
      }

      if (url.pathname === '/alerts' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }

      if (url.pathname === '/alerts/9' && req.method === 'PUT') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            id: 9,
            plant_id: 'TEJAS001',
            predicted_power_kw: 2400,
            actual_power_kw: 800,
            residual_kw: -1600,
            deviation_percent: 66.67,
            severity: 'high',
            status: 'resolved',
            message: 'Drop',
            triggered_at: '2026-11-28T09:00:00Z',
            resolved_at: '2026-11-28T10:00:00Z',
            created_at: '2026-11-28T09:00:00Z',
          })
        );
        return;
      }

      if (url.pathname === '/plants/ERR422') {
        res.writeHead(422);
        res.end(
          JSON.stringify({
            detail: [{ loc: ['body', 'latitude'], msg: 'Input should be <= 90', type: 'less_than_equal' }],
          })
        );
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ detail: 'Plant not found.' }));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    setClientBaseUrl(baseUrl);
  });

  afterAll(async () => {
    clearStoredAuthCredentials();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    clearApiCache();
    clearStoredAuthCredentials();
    plantRequests = 0;
    requireAuth = false;
    lastAuthHeader = null;
  });

  it('connects to /, /health, and all domain APIs while deduplicating and invalidating cache', async () => {
    const root = await getApiRoot();
    expect(root.message).toContain('TEJAS');

    const health = await getSystemHealth();
    expect(health.database.connected).toBe(true);

    // Concurrent calls to listPlants share 1 HTTP request via cache deduplication
    const [pA, pB] = await Promise.all([listPlants(), listPlants()]);
    expect(pA).toHaveLength(1);
    expect(pB).toHaveLength(1);
    expect(plantRequests).toBe(1);

    // Mutation invalidates plants cache
    await createPlant({
      plant_id: 'NEW-01',
      plant_name: 'New Plant',
      plant_type: 'grid_tied',
      latitude: 14.8,
      longitude: 78.18,
      installed_capacity_mw: 2.0,
    });
    await listPlants();
    expect(plantRequests).toBe(2);
    await deletePlant('NEW-01');

    // Weather, Predictions, Forecasts, Readings, Deviations, Alerts
    const weather = await getPlantWeather('TEJAS001');
    expect(weather.weather.irradiation_kw_m2).toBe(0.75);

    const pred = await predictManual({
      plant_code: 0,
      AMBIENT_TEMPERATURE: 30,
      MODULE_TEMPERATURE: 45,
      IRRADIATION: 0.75,
      hour_sin: 0,
      hour_cos: -1,
    });
    expect(pred.predicted_power_kw).toBe(15200.5);

    const autoPred = await runAutomaticPrediction('TEJAS001');
    expect(autoPred.forecast_saved).toBe(true);

    expect(await listForecasts({ plant_id: 'TEJAS001' })).toEqual([]);
    const createdForecast = await createForecast({
      plant_id: 'TEJAS001',
      forecast_timestamp: '2026-11-28T10:00:00Z',
      predicted_power_kw: 2400,
      source: 'manual',
    });
    expect(createdForecast.id).toBe(1);

    expect(await listReadings({ plant_id: 'TEJAS001' })).toEqual([]);
    const createdReading = await createReading({
      plant_id: 'TEJAS001',
      timestamp: '2026-11-28T10:00:00Z',
      ambient_temperature: 30,
      module_temperature: 45,
      irradiation: 0.75,
      actual_power_kw: 2300,
      source: 'scada',
    });
    expect(createdReading.id).toBe(2);

    const cmpPreview = await previewComparison('TEJAS001');
    expect(cmpPreview.deviation_detected).toBe(false);
    const cmpRun = await runComparison('TEJAS001', { create_alert: true });
    expect(cmpRun.plant_id).toBe('TEJAS001');

    expect(await listAlerts()).toEqual([]);
    const resolvedAlert = await updateAlert(9, { status: 'resolved' });
    expect(resolvedAlert.status).toBe('resolved');
  });

  it('handles HTTP Basic Auth optionally (401 when backend enforces auth, 200 when credentials provided)', async () => {
    requireAuth = true;

    // Without credentials -> clean normalized 401
    await expect(listPlants()).rejects.toMatchObject({
      status: 401,
      isAuthError: true,
      message: 'Invalid credentials',
    });
    expect(lastAuthHeader).toBeNull();

    // With credentials set via auth utility -> sends Basic Auth header cleanly
    setStoredAuthCredentials('tejas_admin', 'root');
    const plants = await listPlants(undefined, { force: true });
    expect(plants).toHaveLength(1);
    expect(lastAuthHeader).toBe(`Basic ${Buffer.from('tejas_admin:root').toString('base64')}`);
  });

  it('enforces client-side request contract safety before dispatching invalid payloads', async () => {
    await expect(
      createForecast({
        plant_id: 'TEJAS001',
        forecast_timestamp: '2026-11-28T10:00:00', // missing timezone
        predicted_power_kw: 100,
        source: 'manual',
      })
    ).rejects.toThrow(/timezone/i);

    await expect(
      createPlant({
        plant_id: 'BAD ID WITH SPACES',
        plant_name: 'Test',
        plant_type: 'grid_tied',
        latitude: 14,
        longitude: 78,
        installed_capacity_mw: 1,
      })
    ).rejects.toThrow(/plant_id/i);
  });
});
