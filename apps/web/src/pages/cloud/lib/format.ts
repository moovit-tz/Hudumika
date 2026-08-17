export function fmtSize(b?: number | null): string {
  if (!b) return '—';
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRelative(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'Opened just now';
  if (min < 60) return `Opened ${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Opened ${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `Opened ${day}d ago`;
  return `Opened ${fmtDate(d)}`;
}

// Matches TRASH_RETENTION_DAYS in apps/api/src/jobs/cloud-trash-expiry.job.ts
// (Google Drive's own default) — the daily job permanently deletes anything
// past this window, so this is real countdown math, not a cosmetic guess.
const TRASH_RETENTION_DAYS = 30;

export function fmtExpiresIn(trashedAt?: string | null): string {
  if (!trashedAt) return '—';
  const daysLeft = TRASH_RETENTION_DAYS - Math.floor((Date.now() - new Date(trashedAt).getTime()) / 86_400_000);
  if (daysLeft <= 0) return 'Expiring soon';
  if (daysLeft === 1) return 'Expires in 1 day';
  return `Expires in ${daysLeft} days`;
}

const AV_COLORS = ['#0d7a6b', '#0550ae', '#6e40c9', '#059669', '#9a6700', '#cf222e', '#d05c30', '#0e7490'];
export function avColor(n: string): string { return AV_COLORS[(n ?? '?').charCodeAt(0) % AV_COLORS.length]; }
export function initials(n: string): string { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
