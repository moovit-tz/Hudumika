import { Badge } from '../../../components/ui/badge.js';

/** Shapes returned by /v1/project-equipment (apps/api/src/services/project-equipment.service.ts). */
export interface Powers { manage: boolean; seeCost: boolean }
export interface Eligibility { ok: boolean; reasons: string[] }
export interface Asset {
  id: string; code: string; name: string; resource_type: string; category: string | null; manufacturer: string | null;
  make_model: string | null; serial_number: string | null; registration_number: string | null; year_built: number | null;
  ownership: 'OWNED' | 'RENTED' | 'LEASED'; owner_vendor_id: string | null; vendor_name: string | null;
  rental_reference: string | null; rental_start: string | null; rental_end: string | null;
  home_site: string | null; current_location: string | null; custodian_id: string | null; custodian_name: string | null; custodian_avatar_url: string | null;
  condition: string; status: 'available' | 'allocated' | 'maintenance' | 'decommissioned';
  capacity_value: number | null; capacity_unit: string | null; capacity_rating: string | null;
  meter_unit: string | null; meter_reading: number | null; meter_read_at: string | null;
  inspection_interval_days: number | null; next_inspection_due: string | null;
  service_interval_days: number | null; service_interval_meter: number | null; next_service_due: string | null; next_service_meter: number | null;
  fixed_asset_id: string | null; vehicle_id: string | null; disposed_at: string | null; disposal_reason: string | null; notes: string | null;
  currency: string; rate_unit: string; cost_rate?: number; billing_rate?: number;
  eligibility?: Eligibility;
  issued_to?: { allocation_id: string; project_id: string; project_name: string; end_date: string; overdue: boolean } | null;
}
export interface Booking {
  id: string; project_id: string; project_name: string | null; resource_id: string; resource_name: string | null; resource_code: string | null;
  start_date: string; end_date: string; allocated_pct: number; status: 'requested' | 'confirmed' | 'issued' | 'completed' | 'released';
  requested_by_name: string | null; handed_to: string | null; handed_to_name: string | null; issue_condition: string | null; return_condition: string | null;
  issue_meter: number | null; return_meter: number | null; cancel_reason: string | null; notes: string | null; overdue: boolean; can_handle?: boolean;
}

export const TYPE_LABEL: Record<string, string> = {
  heavy_machinery: 'Heavy machinery', equipment: 'Equipment', tool: 'Tool', vehicle: 'Vehicle', facility: 'Facility', personnel: 'Personnel',
};
export const ASSET_TYPES = ['heavy_machinery', 'equipment', 'tool', 'vehicle', 'facility'] as const;
export const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
export const OWNERSHIP_LABEL: Record<string, string> = { OWNED: 'Owned', RENTED: 'Rented', LEASED: 'Leased' };
export const METER_LABEL: Record<string, string> = { HOURS: 'hours', KM: 'km', MILES: 'miles', CYCLES: 'cycles' };
export const titleCase = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const errText = (e: unknown) => ((e as any)?.message as string) || 'Something went wrong. Try again.';

/** One badge for "can it be booked now", with the reason when it can't. */
export function AvailabilityBadge({ asset }: { asset: Pick<Asset, 'status' | 'eligibility' | 'issued_to'> }) {
  if (asset.status === 'decommissioned') return <Badge variant="gray">Disposed</Badge>;
  if (asset.issued_to) return <Badge variant={asset.issued_to.overdue ? 'error' : 'info'}>{asset.issued_to.overdue ? 'Overdue return' : 'On site'}</Badge>;
  if (asset.eligibility && !asset.eligibility.ok) return <Badge variant="warning" title={asset.eligibility.reasons.join('\n')}>Unavailable</Badge>;
  return <Badge variant="success">Available</Badge>;
}

const BOOKING_BADGE: Record<Booking['status'], { label: string; variant: 'gray' | 'warning' | 'brand' | 'info' | 'success' }> = {
  requested: { label: 'Requested', variant: 'warning' }, confirmed: { label: 'Reserved', variant: 'brand' },
  issued: { label: 'On site', variant: 'info' }, completed: { label: 'Returned', variant: 'success' }, released: { label: 'Cancelled', variant: 'gray' },
};
export function BookingBadge({ booking }: { booking: Pick<Booking, 'status' | 'overdue'> }) {
  if (booking.overdue) return <Badge variant="error">Overdue return</Badge>;
  const b = BOOKING_BADGE[booking.status];
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

export function meterText(a: Pick<Asset, 'meter_reading' | 'meter_unit'>) {
  return a.meter_unit ? `${fmtNum(a.meter_reading)} ${METER_LABEL[a.meter_unit] ?? ''}` : '—';
}
