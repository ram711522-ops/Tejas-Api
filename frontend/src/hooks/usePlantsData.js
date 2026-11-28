import { useCallback, useEffect, useRef, useState } from 'react';
import { listAlerts } from '../api/alertsApi';
import { listPlants } from '../api/plantsApi';
import { listReadings } from '../api/readingsApi';

/**
 * Loads registered plants from GET /plants plus non-fatal latest readings
 * and alerts so PlantCards can compute data-driven status and latest power.
 */
export function usePlantsData() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    plants: [],
    readings: [],
    alerts: [],
  });
  const abortRef = useRef(null);

  const fetchAll = useCallback(async (force = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const plants = await listPlants(controller.signal, { force });
      if (controller.signal.aborted) return;

      const [readingsRes, alertsRes] = await Promise.allSettled([
        listReadings({ limit: 200 }, controller.signal, { force }),
        listAlerts({ limit: 200 }, controller.signal, { force }),
      ]);

      if (controller.signal.aborted) return;

      setState({
        loading: false,
        error: null,
        plants,
        readings: readingsRes.status === 'fulfilled' ? readingsRes.value : [],
        alerts: alertsRes.status === 'fulfilled' ? alertsRes.value : [],
      });
    } catch (err) {
      if (controller.signal.aborted || err?.isCanceled) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err,
      }));
    }
  }, []);

  useEffect(() => {
    fetchAll(false);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchAll]);

  return {
    ...state,
    refresh: () => fetchAll(true),
  };
}
