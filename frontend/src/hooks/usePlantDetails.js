import { useCallback, useEffect, useRef, useState } from 'react';
import { listAlerts, updateAlert } from '../api/alertsApi';
import { previewComparison, runComparison } from '../api/deviationsApi';
import { listForecasts } from '../api/forecastsApi';
import { getPlant } from '../api/plantsApi';
import { previewAutomaticPrediction, runAutomaticPrediction } from '../api/predictionsApi';
import { listReadings } from '../api/readingsApi';
import { getPlantWeather } from '../api/weatherApi';

/**
 * Loads all backend-supported data for a single plant:
 * plant details, live weather, forecast history, actual readings,
 * latest deviation comparison, and plant-scoped alerts.
 */
export function usePlantDetails(plantId) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    plant: null,
    weather: null,
    weatherError: null,
    weatherLoading: false,
    forecasts: [],
    readings: [],
    alerts: [],
    comparison: null,
    comparisonError: null,
    autoPrediction: null,
    predictLoading: false,
    compareLoading: false,
  });

  const abortRef = useRef(null);

  const loadAll = useCallback(
    async (force = false) => {
      if (!plantId) return;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        weatherLoading: true,
        weatherError: null,
      }));

      try {
        const plant = await getPlant(plantId, controller.signal, { force });
        if (controller.signal.aborted) return;

        const [weatherRes, forecastsRes, readingsRes, alertsRes, compareRes] =
          await Promise.allSettled([
            getPlantWeather(plantId, controller.signal, { force }),
            listForecasts({ plant_id: plantId, limit: 100 }, controller.signal, { force }),
            listReadings({ plant_id: plantId, limit: 100 }, controller.signal, { force }),
            listAlerts({ plant_id: plantId, limit: 100 }, controller.signal, { force }),
            previewComparison(plantId, {}, controller.signal),
          ]);

        if (controller.signal.aborted) return;

        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
          plant,
          weather: weatherRes.status === 'fulfilled' ? weatherRes.value : null,
          weatherError: weatherRes.status === 'rejected' ? weatherRes.reason : null,
          weatherLoading: false,
          forecasts: forecastsRes.status === 'fulfilled' ? forecastsRes.value : [],
          readings: readingsRes.status === 'fulfilled' ? readingsRes.value : [],
          alerts: alertsRes.status === 'fulfilled' ? alertsRes.value : [],
          comparison: compareRes.status === 'fulfilled' ? compareRes.value : null,
          comparisonError:
            compareRes.status === 'rejected' && compareRes.reason?.status !== 404
              ? compareRes.reason
              : null,
        }));
      } catch (err) {
        if (controller.signal.aborted || err?.isCanceled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          weatherLoading: false,
          error: err,
          plant: null,
        }));
      }
    },
    [plantId]
  );

  useEffect(() => {
    loadAll(false);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [loadAll]);

  const refreshWeather = useCallback(async () => {
    setState((prev) => ({ ...prev, weatherLoading: true, weatherError: null }));
    try {
      const weather = await getPlantWeather(plantId, undefined, { force: true });
      setState((prev) => ({ ...prev, weather, weatherLoading: false, weatherError: null }));
    } catch (err) {
      setState((prev) => ({ ...prev, weatherLoading: false, weatherError: err }));
    }
  }, [plantId]);

  const previewPredict = useCallback(async () => {
    setState((prev) => ({ ...prev, predictLoading: true }));
    try {
      const res = await previewAutomaticPrediction(plantId);
      setState((prev) => ({ ...prev, autoPrediction: res, predictLoading: false }));
      return res;
    } catch (err) {
      setState((prev) => ({ ...prev, predictLoading: false }));
      throw err;
    }
  }, [plantId]);

  const runAndSavePredict = useCallback(async () => {
    setState((prev) => ({ ...prev, predictLoading: true }));
    try {
      const res = await runAutomaticPrediction(plantId);
      const updatedForecasts = res?.forecast_saved
        ? await listForecasts({ plant_id: plantId, limit: 100 }, undefined, { force: true })
        : undefined;
      setState((prev) => ({
        ...prev,
        autoPrediction: res,
        predictLoading: false,
        ...(updatedForecasts ? { forecasts: updatedForecasts } : {}),
      }));
      return res;
    } catch (err) {
      setState((prev) => ({ ...prev, predictLoading: false }));
      throw err;
    }
  }, [plantId]);

  const runCompare = useCallback(async () => {
    setState((prev) => ({ ...prev, compareLoading: true }));
    try {
      const comparison = await runComparison(plantId, { create_alert: true });
      const alerts = comparison?.alert_generated
        ? await listAlerts({ plant_id: plantId, limit: 100 }, undefined, { force: true })
        : undefined;
      setState((prev) => ({
        ...prev,
        comparison,
        comparisonError: null,
        compareLoading: false,
        ...(alerts ? { alerts } : {}),
      }));
      return comparison;
    } catch (err) {
      setState((prev) => ({ ...prev, compareLoading: false }));
      throw err;
    }
  }, [plantId]);

  const setAlertStatus = useCallback(
    async (alertId, status) => {
      const updated = await updateAlert(alertId, { status });
      setState((prev) => ({
        ...prev,
        alerts: prev.alerts.map((a) => (a.id === alertId ? updated : a)),
      }));
      return updated;
    },
    []
  );

  return {
    ...state,
    refresh: () => loadAll(true),
    refreshWeather,
    previewPredict,
    runAndSavePredict,
    runCompare,
    setAlertStatus,
  };
}
