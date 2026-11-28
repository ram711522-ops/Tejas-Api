/**
 * UTC-safe date utilities aligned with TEJAS FastAPI timezone requirements.
 * Backend query params (start_date, end_date) and body timestamps require
 * timezone-aware ISO strings (e.g. ...Z).
 */

export function toUtcIso(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }
  return d.toISOString();
}

export function getPresetDateRange(windowKey) {
  const end = new Date();
  const start = new Date(end.getTime());

  switch (windowKey) {
    case '24h':
      start.setHours(start.getHours() - 24);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setDate(start.getDate() - 7);
  }

  return {
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  };
}

export function formatTimestamp(isoString, timeZone) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSeconds < 60) return rtf.format(diffSeconds, 'second');
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, 'day');
}
