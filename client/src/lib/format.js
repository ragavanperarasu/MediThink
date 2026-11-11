const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "yesterday", "3 Nov 2026". */
export function timeAgo(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 2 * DAY) return 'yesterday';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return formatDate(date);
}

export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const plural = (count, one, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** "Ravi Kumar · 42 y · Male" — whatever parts the report printed. */
export const patientLine = (patient) =>
  [patient?.name, patient?.age, patient?.sex].filter(Boolean).join(' · ');
