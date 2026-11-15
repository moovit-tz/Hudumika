/**
 * Support network — centres, zones, products, queues and agents for Bliss,
 * plus the centre scope every Bliss screen filters by.
 *
 * The scope ("All centres", one zone, or one centre) is one shared value:
 * picking it in the sidebar re-filters the inbox, overview and reports at
 * once. It is remembered in this browser only — what a person may see at all
 * is enforced by the API (support-network.service.ts), not by this choice.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api.js';

export type ZoneKind = 'country' | 'region' | 'zone' | 'area';
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL', 'LOW'] as const;

export interface GeoZone {
  id: string; parent_id: string | null; name: string; code: string | null; kind: ZoneKind;
  center_lat: number | null; center_lng: number | null; radius_km: number | null;
  timezone: string | null; status: 'active' | 'inactive';
}
export interface Centre {
  id: string; name: string; code: string | null; zone_id: string | null; site_type: string;
  address: string | null; city: string | null; region: string | null; country_code: string; timezone: string;
  latitude: number | null; longitude: number | null;
  opening_hours: Partial<Record<DayKey, [string, string]>> | null;
  support_enabled: boolean; status: string; open_now: boolean | null;
}
export interface FormField {
  key: string; label: string; type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: string[]; required?: boolean;
}
export const FIELD_TYPE_LABEL: Record<FormField['type'], string> = {
  text: 'Short text', textarea: 'Long text', number: 'Number', date: 'Date', select: 'Choice',
};

export interface SupportProduct {
  id: string; name: string; code: string | null; color: string | null; description: string | null;
  source_apps: string[]; sla_hours: Partial<Record<(typeof PRIORITIES)[number], number>>; status: 'active' | 'inactive';
  form_fields: FormField[];
}
export interface Queue {
  id: string; name: string; color: string; site_id: string | null; product_id: string | null;
  skills: string[]; languages: string[]; overflow: 'none' | 'zone' | 'network'; member_ids: string[];
}
export interface Membership {
  id: string; user_id: string; user_name: string; user_email: string;
  site_id: string | null; zone_id: string | null;
  role: 'agent' | 'lead' | 'centre_manager' | 'zone_manager';
  skills: string[]; languages: string[]; max_open: number;
}
export interface NetworkData {
  scope: { all: boolean; site_ids: string[]; managed_zone_ids: string[]; can_manage: boolean };
  zones: GeoZone[]; centres: Centre[]; products: SupportProduct[]; queues: Queue[];
  memberships: Membership[]; people: { id: string; name: string; email: string; role: string }[];
}
export interface CentreLive {
  id: string; name: string; zone_id: string | null; city: string | null; country_code: string;
  latitude: number | null; longitude: number | null; open_now: boolean;
  open: number; unassigned: number; breached: number; urgent: number; oldest_open: string | null;
  created_7d: number; resolved_7d: number; first_reply_hours: number | null; csat: number | null;
  agents: number; agents_online: number; agents_on_shift: number;
  calls_24h: number; unanswered_calls_24h: number;
}

export type Carrier = 'vodacom' | 'yas' | 'airtel' | 'halotel' | 'ttcl' | 'zantel' | 'other';
export const CARRIER_LABEL: Record<Carrier, string> = {
  vodacom: 'Vodacom', yas: 'Yas (Tigo)', airtel: 'Airtel', halotel: 'Halotel', ttcl: 'TTCL', zantel: 'Zantel', other: 'Other',
};
export const PROVIDER_LABEL: Record<SupportLine['provider'], string> = {
  africastalking: "Africa's Talking", sip: 'SIP / own PBX', meta: 'WhatsApp Cloud API (Meta)',
};
export interface MenuOption { digit: string; label: string; action: 'route' | 'voicemail'; product_id?: string | null; site_id?: string | null }
export interface SupportLine {
  id: string; kind: 'voice' | 'whatsapp'; name: string; phone_number: string; carrier: Carrier;
  provider: 'africastalking' | 'sip' | 'meta'; external_id: string | null;
  site_id: string | null; product_id: string | null; greeting: string | null; greeting_audio_url: string | null;
  menu: MenuOption[]; after_hours: 'voicemail' | 'overflow'; ring_agents: boolean; status: 'active' | 'inactive';
  webhook_url: string | null; calls_24h: number; missed_24h: number;
}
export interface CallRow {
  id: string; caller_number: string | null; status: string; digits: string | null; started_at: string;
  ended_at: string | null; duration_seconds: number | null; recording_url: string | null;
  ticket_id: string | null; ticket_ref: string | null; site_name: string | null; product_name: string | null;
  agent_name: string | null; line_name: string | null; line_number: string | null;
}

let cache: NetworkData | null = null;
let inflight: Promise<NetworkData> | null = null;
const listeners = new Set<(d: NetworkData) => void>();

export function loadNetwork(force = false): Promise<NetworkData> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = apiFetch('/v1/support/network').then((d: NetworkData) => {
      cache = d; inflight = null;
      listeners.forEach(fn => fn(d));
      return d;
    }).catch((e) => { inflight = null; throw e; });
  }
  return inflight;
}

/** The network, shared by every component that asks; `reload()` after a change. */
export function useSupportNetwork() {
  const [data, setData] = useState<NetworkData | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setData);
    if (!cache) loadNetwork().catch(e => setError(e?.message || 'Could not load the support network.'));
    return () => { listeners.delete(setData); };
  }, []);
  const reload = useCallback(() => loadNetwork(true).then(() => setError(null)).catch(e => setError(e?.message || 'Could not load the support network.')), []);
  return { data, error, reload };
}

// ── Scope ───────────────────────────────────────────────────────────────

export type CentreScope = { kind: 'all' } | { kind: 'zone'; id: string } | { kind: 'centre'; id: string };
const KEY = 'bliss.centreScope';
const scopeListeners = new Set<(s: CentreScope) => void>();

function readScope(): CentreScope {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && (v.kind === 'zone' || v.kind === 'centre') && typeof v.id === 'string') return v;
  } catch { /* storage blocked — default below */ }
  return { kind: 'all' };
}

let currentScope: CentreScope = readScope();

export function setCentreScope(s: CentreScope) {
  currentScope = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* per-browser convenience only */ }
  scopeListeners.forEach(fn => fn(s));
}

export function useCentreScope(): [CentreScope, (s: CentreScope) => void] {
  const [s, setS] = useState<CentreScope>(currentScope);
  useEffect(() => { scopeListeners.add(setS); return () => { scopeListeners.delete(setS); }; }, []);
  return [s, setCentreScope];
}

/** `site_id=…` / `zone_id=…` for an API query string ('' for all centres). */
export function scopeParams(s: CentreScope): string {
  if (s.kind === 'centre') return `site_id=${encodeURIComponent(s.id)}`;
  if (s.kind === 'zone') return `zone_id=${encodeURIComponent(s.id)}`;
  return '';
}

/** Append the scope to a URL that may already have a query string. */
export function withScope(url: string, s: CentreScope): string {
  const p = scopeParams(s);
  return p ? `${url}${url.includes('?') ? '&' : '?'}${p}` : url;
}

/** Zones as a depth-first list with depth, for indented pickers and trees. */
export function zoneTree(zones: GeoZone[]): { zone: GeoZone; depth: number }[] {
  const byParent = new Map<string | null, GeoZone[]>();
  const ids = new Set(zones.map(z => z.id));
  for (const z of zones) {
    const key = z.parent_id && ids.has(z.parent_id) ? z.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), z]);
  }
  const out: { zone: GeoZone; depth: number }[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const z of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen.has(z.id)) continue;
      seen.add(z.id);
      out.push({ zone: z, depth });
      walk(z.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = { country: 'Country', region: 'Region', zone: 'Zone', area: 'Area' };
export const ROLE_LABEL: Record<Membership['role'], string> = {
  agent: 'Agent', lead: 'Team lead', centre_manager: 'Centre manager', zone_manager: 'Zone manager',
};
