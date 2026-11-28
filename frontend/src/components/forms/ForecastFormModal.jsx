import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createForecast, updateForecast } from '../../api/forecastsApi';
import { toUtcIso } from '../../utils/date';
import styles from './ObservatoryModal.module.css';

function toLocalDateTimeInput(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function ForecastFormModal({
  open,
  mode = 'create',
  initialForecast = null,
  plants = [],
  defaultPlantId = '',
  onClose,
  onSuccess,
}) {
  const [plantId, setPlantId] = useState('');
  const [timestampLocal, setTimestampLocal] = useState('');
  const [predictedPower, setPredictedPower] = useState('');
  const [source, setSource] = useState('manual');
  const [modelVersion, setModelVersion] = useState('svr_rbf_v1');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    if (mode === 'edit' && initialForecast) {
      setPlantId(initialForecast.plant_id || '');
      setTimestampLocal(toLocalDateTimeInput(initialForecast.forecast_timestamp));
      setPredictedPower(
        initialForecast.predicted_power_kw !== undefined &&
          initialForecast.predicted_power_kw !== null
          ? String(initialForecast.predicted_power_kw)
          : ''
      );
      setSource(initialForecast.source || 'manual');
      setModelVersion(initialForecast.model_version || '');
    } else {
      setPlantId(defaultPlantId || plants[0]?.plant_id || '');
      setTimestampLocal(toLocalDateTimeInput(new Date().toISOString()));
      setPredictedPower('');
      setSource('manual');
      setModelVersion('svr_rbf_v1');
    }
  }, [open, mode, initialForecast, plants, defaultPlantId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const powerNum = Number(predictedPower);
    if (!timestampLocal) {
      setErrorMsg('Select a forecast timestamp.');
      return;
    }
    if (!Number.isFinite(powerNum) || powerNum < 0) {
      setErrorMsg('Predicted power must be a number >= 0 kW.');
      return;
    }

    setSubmitting(true);
    try {
      const utcIso = toUtcIso(new Date(timestampLocal));
      let saved;
      if (mode === 'edit' && initialForecast) {
        saved = await updateForecast(initialForecast.id, {
          forecast_timestamp: utcIso,
          predicted_power_kw: powerNum,
          source,
          model_version: modelVersion.trim() || null,
        });
      } else {
        if (!plantId) {
          setErrorMsg('Select a solar plant.');
          setSubmitting(false);
          return;
        }
        saved = await createForecast({
          plant_id: plantId,
          forecast_timestamp: utcIso,
          predicted_power_kw: powerNum,
          source,
          model_version: modelVersion.trim() || null,
        });
      }
      onSuccess?.(saved, mode);
      onClose?.();
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to save forecast record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="forecast-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 id="forecast-modal-title" className={styles.title}>
              {mode === 'edit' ? `Edit Forecast #${initialForecast?.id}` : 'Log Power Forecast'}
            </h2>
            <p className={styles.subtitle}>
              {mode === 'edit'
                ? 'Update timestamp, forecasted AC output, or source metadata'
                : 'Persist a forecast record directly to MySQL (/forecasts)'}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Close forecast modal"
          >
            <X size={16} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {errorMsg ? (
            <div className={styles.formErrorBanner} role="alert">
              {errorMsg}
            </div>
          ) : null}

          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="fc-plant" className={styles.label}>
                Plant ID<span className={styles.req}>*</span>
              </label>
              {mode === 'edit' ? (
                <input id="fc-plant" className="input-field mono" value={plantId} disabled />
              ) : (
                <select
                  id="fc-plant"
                  className="select-field"
                  value={plantId}
                  onChange={(e) => setPlantId(e.target.value)}
                >
                  {plants.map((p) => (
                    <option key={p.plant_id} value={p.plant_id}>
                      {p.plant_id} — {p.plant_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="fc-ts" className={styles.label}>
                Forecast Timestamp<span className={styles.req}>*</span>
              </label>
              <input
                id="fc-ts"
                type="datetime-local"
                className="input-field mono"
                value={timestampLocal}
                onChange={(e) => setTimestampLocal(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="fc-power" className={styles.label}>
                Predicted Power (kW)<span className={styles.req}>*</span>
              </label>
              <input
                id="fc-power"
                type="number"
                step="0.1"
                min="0"
                className="input-field tabular-nums"
                placeholder="e.g. 2450.5"
                value={predictedPower}
                onChange={(e) => setPredictedPower(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="fc-source" className={styles.label}>
                Forecast Source
              </label>
              <select
                id="fc-source"
                className="select-field"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="ml_model">ml_model</option>
                <option value="external">external</option>
                <option value="manual">manual</option>
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="fc-version" className={styles.label}>
              Model Version
            </label>
            <input
              id="fc-version"
              className="input-field mono"
              placeholder="svr_rbf_v1"
              value={modelVersion}
              onChange={(e) => setModelVersion(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={14} className="spin" /> : null}
              <span>{mode === 'edit' ? 'Save Forecast' : 'Create Forecast'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
