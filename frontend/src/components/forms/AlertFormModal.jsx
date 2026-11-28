import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createAlert, updateAlert } from '../../api/alertsApi';
import styles from './ObservatoryModal.module.css';

export function AlertFormModal({
  open,
  mode = 'create',
  initialAlert = null,
  plants = [],
  onClose,
  onSuccess,
}) {
  const [plantId, setPlantId] = useState('');
  const [predictedPower, setPredictedPower] = useState('2000');
  const [actualPower, setActualPower] = useState('1100');
  const [severity, setSeverity] = useState('medium');
  const [status, setStatus] = useState('open');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    if (mode === 'edit' && initialAlert) {
      setPlantId(initialAlert.plant_id || '');
      setSeverity(initialAlert.severity || 'medium');
      setStatus(initialAlert.status || 'open');
      setMessage(initialAlert.message || '');
    } else {
      setPlantId(plants[0]?.plant_id || '');
      setPredictedPower('2000');
      setActualPower('1100');
      setSeverity('medium');
      setStatus('open');
      setMessage('');
    }
  }, [open, mode, initialAlert, plants]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!message.trim()) {
      setErrorMsg('Provide a descriptive alert message.');
      return;
    }

    setSubmitting(true);
    try {
      let saved;
      if (mode === 'edit' && initialAlert) {
        saved = await updateAlert(initialAlert.id, {
          severity,
          status,
          message: message.trim(),
        });
      } else {
        const pred = Number(predictedPower);
        const act = Number(actualPower);
        const residual = act - pred;
        const devPct = pred > 0 ? Math.abs((residual / pred) * 100) : 0;
        saved = await createAlert({
          plant_id: plantId,
          predicted_power_kw: pred,
          actual_power_kw: act,
          residual_kw: Number(residual.toFixed(2)),
          deviation_percent: Number(devPct.toFixed(2)),
          severity,
          status,
          message: message.trim(),
        });
      }
      onSuccess?.(saved, mode);
      onClose?.();
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to save alert.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 id="alert-modal-title" className={styles.title}>
              {mode === 'edit' ? `Update Alert #${initialAlert?.id}` : 'Raise Deviation Alert'}
            </h2>
            <p className={styles.subtitle}>
              {mode === 'edit'
                ? 'Update severity, workflow status, or operator notes'
                : 'Log a manual deviation alert against a monitored plant'}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Close alert modal"
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

          {mode === 'create' ? (
            <>
              <div className={styles.field}>
                <label htmlFor="al-plant" className={styles.label}>
                  Plant ID<span className={styles.req}>*</span>
                </label>
                <select
                  id="al-plant"
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
              </div>

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label htmlFor="al-pred" className={styles.label}>
                    Predicted Power (kW)<span className={styles.req}>*</span>
                  </label>
                  <input
                    id="al-pred"
                    type="number"
                    step="0.1"
                    min="0"
                    className="input-field mono"
                    value={predictedPower}
                    onChange={(e) => setPredictedPower(e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="al-act" className={styles.label}>
                    Actual Power (kW)<span className={styles.req}>*</span>
                  </label>
                  <input
                    id="al-act"
                    type="number"
                    step="0.1"
                    min="0"
                    className="input-field mono"
                    value={actualPower}
                    onChange={(e) => setActualPower(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : null}

          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="al-sev" className={styles.label}>
                Severity
              </label>
              <select
                id="al-sev"
                className="select-field"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="al-status" className={styles.label}>
                Status
              </label>
              <select
                id="al-status"
                className="select-field"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="open">open</option>
                <option value="acknowledged">acknowledged</option>
                <option value="resolved">resolved</option>
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="al-msg" className={styles.label}>
              Operator Message<span className={styles.req}>*</span>
            </label>
            <input
              id="al-msg"
              className="input-field"
              placeholder="e.g. Inverter string output dropped below threshold"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={14} className="spin" /> : null}
              <span>{mode === 'edit' ? 'Save Changes' : 'Create Alert'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
