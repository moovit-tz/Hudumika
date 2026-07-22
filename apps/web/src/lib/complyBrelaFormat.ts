/** Strips non-digits and, only when exactly 9 digits result, groups them as
 *  "XXX-XXX-XXX". Never mangles real BRELA portal data that isn't a clean
 *  9-digit number (returns it unchanged), and returns '—' for empty input. */
export function formatDashedDigits9(raw?: string | null): string {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
  }
  return raw;
}

/** Maps a BRELA status string onto the platform's existing .comply-badge--*
 *  variants (all theme-aware) instead of a hand-picked hex pair. */
export function badgeVariantForStatus(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('dissolved')) return 'expired';
  if (s.includes('pending'))   return 'pending';
  if (s.includes('registered') || s.includes('active')) return 'active';
  return 'draft';
}
