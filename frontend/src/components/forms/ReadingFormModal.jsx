import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createReading, updateReading } from '../../api/readingsApi';
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

export function ReadingFormModal({
  open,
  mode = 'create',
  initialReading = null,
  plants = [],
  defaultPlantId = '',
  onClose,
  onSuccess,
}) {
  const [plantId, setPlantId] = useState('');
  const [timestampLocal, setTimestampLocal] = useState('');
  const [ambientTemp, setAmbientTemp] = useState('28.5');
  const [moduleTemp, setModuleTemp] = useState('41.2');
  const [irradiation, setIrradiation] = useState('0.72');
  const [actualPower, setActualPower] = useState('');
  const [source, setSource] = useState('scada');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    if (mode === 'edit' && initialReading) {
      setPlantId(initialReading.plant_id || '');
      setTimestampLocal(toLocalDateTimeInput(initialReading.timestamp));
      setAmbientTemp(
        initialReading.ambient_temperature !== undefined &&
          initialReading.ambient_temperature !== null
          ? String(initialReading.ambient_temperature)
          : ''
      );
      setModuleTemp(
        initialReading.module_temperature !== undefined &&
          initialReading.module_temperature !== null
          ? String(initialReading.module_temperature)
          : ''
      );
      setIrradiation(
        initialReading.irradiation !== undefined && initialReading.irradiation !== null
          ? String(initialReading.irradiation)
          : ''
      );
      setActualPower(
        initialReading.actual_power_kw !== undefined && initialReading.actual_power_kw !== null
          ? String(initialReading.actual_power_kw)
          : ''
      );
      setSource(initialReading.source || 'scada');
    } else {
      setPlantId(defaultPlantId || plants[0]?.plant_id || '');
      setTimestampLocal(toLocalDateTimeInput(new Date().toISOString()));
      setAmbientTemp('28.5');
      setModuleTemp('41.2');
      setIrradiation('0.72');
      setActualPower('');
      setSource('scada');
    }
  }, [open, mode, initialReading, plants, defaultPlantId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const parseRequiredFinite = (raw, label) => {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
      return { error: `${label} is required.` };
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      return { error: `${label} must be a valid finite number.` };
    }
    return { value: num };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (mode === 'create' && !String(plantId || '').trim()) {
      setErrorMsg('Plant ID is required.');
      return;
    }

    if (!timestampLocal) {
      setErrorMsg('Reading timestamp is required.');
      return;
    }

    let utcIso;
    try {
      utcIso = toUtcIso(new Date(timestampLocal));
    } catch {
      setErrorMsg('Provide a valid reading date and time.');
      return;
    }

    const powerParsed = parseRequiredFinite(actualPower, 'Actual power (kW)');
    if (powerParsed.error) {
      setErrorMsg(powerParsed.error);
      return;
    }
    if (powerParsed.value < 0) {
      setErrorMsg('Actual power must be >= 0 kW.');
      return;
    }

    const irrParsed = parseRequiredFinite(irradiation, 'Irradiation (kW/m²)');
    if (irrParsed.error) {
      setErrorMsg(irrParsed.error);
      return;
    }
    if (irrParsed.value < 0) {
      setErrorMsg('Irradiation must be >= 0 kW/m².');
      return;
    }

    const ambParsed = parseRequiredFinite(ambientTemp, 'Ambient temperature (°C)');
    if (ambParsed.error) {
      setErrorMsg(ambParsed.error);
      return;
    }

    const modParsed = parseRequiredFinite(moduleTemp, 'Module temperature (°C)');
    if (modParsed.error) {
      setErrorMsg(modParsed.error);
      return;
    }

    const payloadFields = {
      timestamp: utcIso,
      ambient_temperature: ambParsed.value,
      module_temperature: modParsed.value,
      irradiation: irrParsed.value,
      actual_power_kw: powerParsed.value,
      source,
    };

    setSubmitting(true);
    try {
      let saved;
      if (mode === 'edit' && initialReading) {
        saved = await updateReading(initialReading.id, payloadFields);
      } else {
        saved = await createReading({ plant_id: plantId.trim(), ...payloadFields });
      }
      onSuccess?.(saved, mode);
      onClose?.();
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to save actual reading.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reading-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 id="reading-modal-title" className={styles.title}>
              {mode === 'edit' ? `Edit Reading #${initialReading?.id}` : 'Add Actual Reading'}
            </h2>
            <p className={styles.subtitle}>
              Log measured AC inverter generation, module &amp; ambient thermal sensors, and
              irradiation
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Close reading modal"
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
              <label htmlFor="rd-plant" className={styles.label}>
                Plant ID<span className={styles.req}>*</span>
              </label>
              {mode === 'edit' ? (
                <input id="rd-plant" className="input-field mono" value={plantId} disabled />
              ) : (
                <select
                  id="rd-plant"
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
              <label htmlFor="rd-ts" className={styles.label}>
                Reading Timestamp<span className={styles.req}>*</span>
              </label>
              <input
                id="rd-ts"
                type="datetime-local"
                className="input-field mono"
                value={timestampLocal}
                onChange={(e) => setTimestampLocal(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="rd-power" className={styles.label}>
                Actual Power (kW)<span className={styles.req}>*</span>
              </label>
              <input
                id="rd-power"
                type="number"
                step="0.1"
                min="0"
                className="input-field tabular-nums"
                placeholder="e.g. 2190.4"
                value={actualPower}
                onChange={(e) => setActualPower(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="rd-irr" className={styles.label}>
                Irradiation (kW/m²)<span className={styles.req}>*</span>
              </label>
              <input
                id="rd-irr"
                type="number"
                step="0.01"
                min="0"
                className="input-field mono"
                value={irradiation}
                onChange={(e) => setIrradiation(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="rd-amb" className={styles.label}>
                Ambient Temp (°C)<span className={styles.req}>*</span>
              </label>
              <input
                id="rd-amb"
                type="number"
                step="0.1"
                className="input-field mono"
                value={ambientTemp}
                onChange={(e) => setAmbientTemp(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="rd-mod" className={styles.label}>
                Module Temp (°C)<span className={styles.req}>*</span>
              </label>
              <input
                id="rd-mod"
                type="number"
                step="0.1"
                className="input-field mono"
                value={moduleTemp}
                onChange={(e) => setModuleTemp(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="rd-source" className={styles.label}>
              Telemetry Source<span className={styles.req}>*</span>
            </label>
            <select
              id="rd-source"
              className="select-field"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="scada">scada</option>
              <option value="inverter">inverter</option>
              <option value="meter">meter</option>
              <option value="historical_dataset">historical_dataset</option>
              <option value="manual">manual</option>
            </select>
          </div>

          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={14} className="spin" /> : null}
              <span>{mode === 'edit' ? 'Save Reading' : 'Save Reading'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
