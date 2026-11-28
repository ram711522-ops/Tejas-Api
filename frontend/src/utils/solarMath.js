/**
 * Cyclical time encoding matching api/main.py:
 *   angle = 2 * pi * hour_decimal / 24
 *   hour_sin = sin(angle), hour_cos = cos(angle)
 */

export function hourDecimalToSinCos(hourDecimal) {
  const clamped = ((Number(hourDecimal) % 24) + 24) % 24;
  const angle = (2 * Math.PI * clamped) / 24;
  return {
    hour_sin: Number(Math.sin(angle).toFixed(6)),
    hour_cos: Number(Math.cos(angle).toFixed(6)),
  };
}

export function timeStringToHourDecimal(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 12;
  const [hStr, mStr = '0'] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 12;
  return Math.min(23.99, Math.max(0, h + m / 60));
}
