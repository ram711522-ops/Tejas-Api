import { useCallback, useEffect, useRef, useState } from 'react';
import { listAlerts } from '../api/alertsApi';
import { previewComparison } from '../api/deviationsApi';
import { fetchAllForecastsInRange } from '../api/forecastsApi';
import { listPlants } from '../api/plantsApi';
import { fetchAllReadingsInRange } from '../api/readingsApi';
import { getSystemHealth } from '../api/systemApi';
import { getPlantWeather } from '../api/weatherApi';
import { getPresetDateRange } from '../utils/date';

/**
 * Live backend dashboard data hook using centralized Axios API services,
 * request deduplication/caching, and AbortController cancellation.
 */
export function useDashboardData(dateWindow = '7d') {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
    lastUpdated: null,
  });
  const abortRef = useRef(null);

  const loadLive = useCallback(
    async (force = false) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const range = getPresetDateRange(dateWindow);
        const [health, plants, forecasts, readings, alerts] = await Promise.all([
          getSystemHealth(controller.signal, { force }),
          listPlants(controller.signal, { force }),
          fetchAllForecastsInRange(range, controller.signal, { force }),
          fetchAllReadingsInRange(range, controller.signal, { force }),
          listAlerts({ limit: 100 }, controller.signal, { force }),
        ]);

        if (controller.signal.aborted) return;

        // Fetch weather and comparison non-fatally for up to 2 plants
        const weatherByPlant = {};
        let comparison = null;

        if (plants.length > 0) {
          const weatherResults = await Promise.allSettled(
            plants.slice(0, 2).map((p) => getPlantWeather(p.plant_id, controller.signal, { force }))
          );
          for (const res of weatherResults) {
            if (res.status === 'fulfilled' && res.value?.plant_id) {
              weatherByPlant[res.value.plant_id] = res.value;
            }
          }

          try {
            comparison = await previewComparison(plants[0].plant_id, {}, controller.signal);
          } catch {
            comparison = null;
          }
        }

        if (controller.signal.aborted) return;

        setState({
          loading: false,
          error: null,
          lastUpdated: new Date().toISOString(),
          data: {
            sourceMode: 'live',
            health,
            plants,
            forecasts,
            readings,
            alerts,
            weatherByPlant,
            comparison,
          },
        });
      } catch (err) {
        if (controller.signal.aborted || err?.isCanceled) return;
        setState({
          loading: false,
          error: err,
          data: null,
          lastUpdated: null,
        });
      }
    },
    [dateWindow]
  );

  useEffect(() => {
    loadLive(false);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [loadLive]);

  const refresh = useCallback(() => {
    loadLive(true);
  }, [loadLive]);

  return {
    ...state,
    refresh,
  };
}
