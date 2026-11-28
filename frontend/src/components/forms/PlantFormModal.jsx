import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createPlant, updatePlant } from '../../api/plantsApi';
import { LocationPicker } from './LocationPicker';
import styles from './PlantFormModal.module.css';

const PLANT_TYPE_PRESETS = [
  'grid_tied',
  'utility_scale',
  'rooftop',
  'hybrid',
  'off_grid',
];

const PLANT_ID_REGEX = /^[A-Za-z0-9_-]+$/;

function buildInitialValues(plant) {
  if (!plant) {
    return {
      plant_id: '',
      plant_name: '',
      plant_type: 'grid_tied',
      installed_capacity_mw: '',
      latitude: '',
      longitude: '',
      tilt: '',
      azimuth: '',
    };
  }
  return {
    plant_id: plant.plant_id || '',
    plant_name: plant.plant_name || '',
    plant_type: plant.plant_type || 'grid_tied',
    installed_capacity_mw:
      plant.installed_capacity_mw !== undefined && plant.installed_capacity_mw !== null
        ? String(plant.installed_capacity_mw)
        : '',
    latitude:
      plant.latitude !== undefined && plant.latitude !== null ? String(plant.latitude) : '',
    longitude:
      plant.longitude !== undefined && plant.longitude !== null ? String(plant.longitude) : '',
    tilt: plant.tilt !== undefined && plant.tilt !== null ? String(plant.tilt) : '',
    azimuth: plant.azimuth !== undefined && plant.azimuth !== null ? String(plant.azimuth) : '',
  };
}

export function PlantFormModal({ open, initialPlant = null, onClose, onSaved }) {
  const isEdit = Boolean(initialPlant);
  const [values, setValues] = useState(() => buildInitialValues(initialPlant));
  const [locationMeta, setLocationMeta] = useState({ address: '', placeName: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(buildInitialValues(initialPlant));
      setLocationMeta({
        address: initialPlant?.formatted_address || '',
        placeName: initialPlant?.plant_name || '',
      });
      setFieldErrors({});
      setSubmitError('');
      setSubmitting(false);
    }
  }, [open, initialPlant]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const setField = (name, val) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (submitError) setSubmitError('');
  };

  const validate = () => {
    const errors = {};
    const pid = values.plant_id.trim();
    const pname = values.plant_name.trim();
    const ptype = values.plant_type.trim();

    if (!isEdit) {
      if (!pid) {
        errors.plant_id = 'Plant ID is required.';
      } else if (pid.length > 50) {
        errors.plant_id = 'Plant ID must be at most 50 characters.';
      } else if (!PLANT_ID_REGEX.test(pid)) {
        errors.plant_id = 'Only letters, numbers, "-" and "_" are allowed.';
      }
    }

    if (!pname) {
      errors.plant_name = 'Plant name is required.';
    } else if (pname.length > 100) {
      errors.plant_name = 'Plant name must be at most 100 characters.';
    }

    if (!ptype) {
      errors.plant_type = 'Plant type is required.';
    } else if (ptype.length > 50) {
      errors.plant_type = 'Plant type must be at most 50 characters.';
    }

    const cap = Number(values.installed_capacity_mw);
    if (values.installed_capacity_mw === '' || !Number.isFinite(cap) || cap <= 0) {
      errors.installed_capacity_mw = 'Capacity must be a number greater than 0 MW.';
    }

    const lat = Number(values.latitude);
    if (values.latitude === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Latitude must be between -90 and 90.';
    }

    const lon = Number(values.longitude);
    if (values.longitude === '' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      errors.longitude = 'Longitude must be between -180 and 180.';
    }

    if (values.tilt !== '') {
      const tilt = Number(values.tilt);
      if (!Number.isFinite(tilt) || tilt < 0 || tilt > 90) {
        errors.tilt = 'Tilt must be between 0° and 90°.';
      }
    }

    if (values.azimuth !== '') {
      const azimuth = Number(values.azimuth);
      if (!Number.isFinite(azimuth) || azimuth < 0 || azimuth > 360) {
        errors.azimuth = 'Azimuth must be between 0° and 360°.';
      }
    }

    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setFieldErrors({});

    try {
      const payload = {
        plant_name: values.plant_name.trim(),
        plant_type: values.plant_type.trim(),
        installed_capacity_mw: Number(values.installed_capacity_mw),
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        tilt: values.tilt === '' ? null : Number(values.tilt),
        azimuth: values.azimuth === '' ? null : Number(values.azimuth),
      };

      let saved;
      if (isEdit) {
        saved = await updatePlant(initialPlant.plant_id, payload);
      } else {
        saved = await createPlant({
          plant_id: values.plant_id.trim(),
          ...payload,
        });
      }
      onSaved?.(saved, isEdit ? 'updated' : 'created');
    } catch (err) {
      if (err?.status === 409) {
        setFieldErrors({
          plant_id: err.message || 'A plant with this plant_id already exists.',
        });
      } else if (err?.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      }
      setSubmitError(err?.message || 'Could not save plant.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plant-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div className={`surface-card ${styles.modal}`}>
        <div className={styles.header}>
          <div>
            <h2 id="plant-form-title" className={styles.title}>
              {isEdit ? `Edit Plant — ${initialPlant.plant_id}` : 'Register Solar Plant'}
            </h2>
            <p className={styles.subtitle}>
              {isEdit
                ? 'Update plant parameters. Plant ID is permanent and cannot be modified.'
                : 'Add a new solar plant to MySQL for weather, prediction, and alert monitoring.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="plant-id-input" className={styles.label}>
                Plant ID<span className={styles.req}>*</span>
              </label>
              <input
                id="plant-id-input"
                type="text"
                className={`input-field mono ${fieldErrors.plant_id ? styles.inputError : ''}`}
                placeholder="e.g. TEJAS001"
                value={values.plant_id}
                onChange={(e) => setField('plant_id', e.target.value)}
                disabled={isEdit || submitting}
                maxLength={50}
                required
              />
              {fieldErrors.plant_id ? (
                <span className={styles.fieldError}>{fieldErrors.plant_id}</span>
              ) : (
                <span className={styles.hint}>Letters, digits, hyphens, underscores (max 50)</span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="plant-type-input" className={styles.label}>
                Plant Type<span className={styles.req}>*</span>
              </label>
              <input
                id="plant-type-input"
                type="text"
                list="tejas-plant-types"
                className={`input-field ${fieldErrors.plant_type ? styles.inputError : ''}`}
                placeholder="e.g. grid_tied"
                value={values.plant_type}
                onChange={(e) => setField('plant_type', e.target.value)}
                disabled={submitting}
                maxLength={50}
                required
              />
              <datalist id="tejas-plant-types">
                {PLANT_TYPE_PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
              {fieldErrors.plant_type ? (
                <span className={styles.fieldError}>{fieldErrors.plant_type}</span>
              ) : null}
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="plant-name-input" className={styles.label}>
                Plant Name<span className={styles.req}>*</span>
              </label>
              <input
                id="plant-name-input"
                type="text"
                className={`input-field ${fieldErrors.plant_name ? styles.inputError : ''}`}
                placeholder="e.g. Anantapur Solar Park"
                value={values.plant_name}
                onChange={(e) => setField('plant_name', e.target.value)}
                disabled={submitting}
                maxLength={100}
                required
              />
              {fieldErrors.plant_name ? (
                <span className={styles.fieldError}>{fieldErrors.plant_name}</span>
              ) : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="plant-capacity-input" className={styles.label}>
                Installed Capacity (MW)<span className={styles.req}>*</span>
              </label>
              <input
                id="plant-capacity-input"
                type="number"
                step="any"
                min="0.001"
                className={`input-field mono ${
                  fieldErrors.installed_capacity_mw ? styles.inputError : ''
                }`}
                placeholder="e.g. 5.0"
                value={values.installed_capacity_mw}
                onChange={(e) => setField('installed_capacity_mw', e.target.value)}
                disabled={submitting}
                required
              />
              {fieldErrors.installed_capacity_mw ? (
                <span className={styles.fieldError}>{fieldErrors.installed_capacity_mw}</span>
              ) : null}
            </div>
          </div>

          <LocationPicker
            latitude={values.latitude}
            longitude={values.longitude}
            address={locationMeta.address}
            placeName={locationMeta.placeName}
            latitudeError={fieldErrors.latitude}
            longitudeError={fieldErrors.longitude}
            disabled={submitting}
            onLocationChange={({ latitude, longitude, address, placeName }) => {
              setValues((prev) => ({
                ...prev,
                latitude: latitude === '' || latitude === null ? '' : String(latitude),
                longitude: longitude === '' || longitude === null ? '' : String(longitude),
              }));
              setLocationMeta({
                address: address || '',
                placeName: placeName || '',
              });
              setFieldErrors((prev) => {
                if (!prev.latitude && !prev.longitude) return prev;
                const next = { ...prev };
                delete next.latitude;
                delete next.longitude;
                return next;
              });
              if (submitError) setSubmitError('');
            }}
            onManualCoordinateChange={(field, val) => setField(field, val)}
            onUsePlaceAsName={(name) => setField('plant_name', name.slice(0, 100))}
          />

          <div className={styles.row2}>
            <div className={styles.field}>
              <label htmlFor="plant-tilt-input" className={styles.label}>
                Panel Tilt (°) <span className={styles.hint}>(optional, 0–90)</span>
              </label>
              <input
                id="plant-tilt-input"
                type="number"
                step="any"
                min="0"
                max="90"
                className={`input-field mono ${fieldErrors.tilt ? styles.inputError : ''}`}
                placeholder="e.g. 15"
                value={values.tilt}
                onChange={(e) => setField('tilt', e.target.value)}
                disabled={submitting}
              />
              {fieldErrors.tilt ? (
                <span className={styles.fieldError}>{fieldErrors.tilt}</span>
              ) : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="plant-azimuth-input" className={styles.label}>
                Panel Azimuth (°) <span className={styles.hint}>(optional, 0–360)</span>
              </label>
              <input
                id="plant-azimuth-input"
                type="number"
                step="any"
                min="0"
                max="360"
                className={`input-field mono ${fieldErrors.azimuth ? styles.inputError : ''}`}
                placeholder="e.g. 180"
                value={values.azimuth}
                onChange={(e) => setField('azimuth', e.target.value)}
                disabled={submitting}
              />
              {fieldErrors.azimuth ? (
                <span className={styles.fieldError}>{fieldErrors.azimuth}</span>
              ) : null}
            </div>
          </div>

          {submitError ? (
            <div className={styles.formErrorBanner} role="alert">
              {submitError}
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={15} className="spin" /> : null}
              <span>{submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Register Plant'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
