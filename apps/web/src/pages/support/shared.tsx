import React from 'react';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Tip } from '../../components/ui/tooltip.js';

// Same emoji set Team Chat's own composer offers (Chat.tsx) — one set, not
// a second invented list, so a reply picks from the same palette a channel
// message would.
export const COMPOSER_EMOJIS = ['👍', '❤️', '😄', '🎉', '🚀', '👀', '✅', '😂', '🙌', '💯', '🔥', '👋', '🤝', '📦', '✈️', '⚓'];

// Same resolveDriveId() caching pattern ContractDetail.tsx already uses for
// its own attachment uploads — one drive, not re-fetched per attach.
export let cachedSupportDriveId: string | null = null;
export function setCachedSupportDriveId(v: string | null) { cachedSupportDriveId = v; }

export const COMPLYOS_AGENCIES = [
  { code: 'BRELA', name: 'BRELA — Business Registration & Licensing' },
  { code: 'TRA', name: 'TRA — Tanzania Revenue Authority' },
  { code: 'NSSF', name: 'NSSF — National Social Security Fund' },
  { code: 'WCF', name: 'WCF — Workers Compensation Fund' },
  { code: 'NHIF', name: 'NHIF — National Health Insurance Fund' },
  { code: 'TFDA', name: 'TFDA — Tanzania Food & Drugs Authority' },
  { code: 'TBS', name: 'TBS — Tanzania Bureau of Standards' },
  { code: 'OSHA', name: 'OSHA — Occupational Safety & Health Authority' },
];

/* ── Types ── */
export type ChannelId = 'inapp' | 'email' | 'whatsapp' | 'sms' | 'note';
export type StatusKey = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type PriorityKey = 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SysCustomer {
  id: string; name: string; email?: string; phone?: string;
  company?: string; total_shipments?: number;
}

export interface Ticket {
  id: string; ref: string; subject: string; description?: string;
  customer: string; customer_id?: string; customer_email?: string;
  customer_phone?: string; customer_company?: string;
  category: string; status: StatusKey; priority: PriorityKey;
  // Both list and detail endpoints already join `users` and return this
  // (u.id as assigned_to_id) — it just never made it into this interface,
  // so every assignee avatar fell back to initials for want of an id to
  // look a real photo up by, even for a real staff account that has one.
  assigned_to?: string; assigned_to_id?: string; created_at: string; updated_at?: string;
  messages?: Message[]; message_count?: number;
  tags?: string[]; related_shipments?: string[];
  group_id?: string | null; group_name?: string | null; group_color?: string | null;
  source_app?: string | null; sla_deadline?: string | null;
  channel?: string | null;
  origin_ip?: string | null; origin_user_agent?: string | null;
}

export interface SupportGroup { id: string; name: string; color: string; ticket_count?: number; }
export interface SupportView { id: string; name: string; filters: Record<string, any>; }

export interface MessageAttachment { id: string; name: string; size: number | null; mime_type: string | null }
export interface Message {
  id: string; content: string; author_name: string;
  // Real column on support_messages (messaging.service.ts and the inbound
  // webhook both write it — the customer's id for CUSTOMER messages, the
  // sending officer's user id for OFFICER ones) that GET .../messages was
  // already returning via selectAll(); this interface just never declared
  // it, so every message bubble fell back to initials regardless of
  // whether a real photo existed.
  author_id?: string;
  author_type: 'OFFICER' | 'CUSTOMER'; channel?: ChannelId; created_at: string;
  attachments?: MessageAttachment[];
}

/* ── Config ── */
export const PRIORITY_CFG: Record<PriorityKey, { bg: string; color: string; label: string }> = {
  URGENT: { bg: 'var(--red-l)', color: 'var(--red)', label: 'Urgent' },
  HIGH: { bg: 'var(--gold-l)', color: 'var(--gold)', label: 'High' },
  NORMAL: { bg: 'var(--blue-l)', color: 'var(--blue)', label: 'Normal' },
  MEDIUM: { bg: 'var(--blue-l)', color: 'var(--blue)', label: 'Medium' },
  LOW: { bg: 'var(--bg)', color: 'var(--ink2)', label: 'Low' },
};

export const STATUS_CFG: Record<StatusKey, { bg: string; color: string; label: string }> = {
  OPEN: { bg: 'var(--teal-l)', color: 'var(--teal)', label: 'Open' },
  IN_PROGRESS: { bg: 'var(--gold-l)', color: 'var(--gold)', label: 'Pending' },
  RESOLVED: { bg: 'var(--green-l)', color: 'var(--green)', label: 'Resolved' },
  CLOSED: { bg: 'var(--bg)', color: 'var(--ink3)', label: 'Closed' },
};

export const CHANNEL_CFG: Record<ChannelId, { label: string; icon: IconName; color: string; bg: string; border: string; btnLabel: string }> = {
  // Fixed indigo, not var(--teal) — --teal is the tenant/app's own brand
  // accent (CLAUDE.md: "the per-app accent, not a fixed colour") and can be
  // anything a tenant picks, including a near-black navy — which is exactly
  // what Bliss's own accent resolves to. That made this pill render as a
  // heavy dark chip next to WhatsApp/Email/SMS's soft, evenly-saturated
  // ones (all fixed hues themselves), the mismatch the "chat bubbles" report
  // was pointing at. A channel identity is categorical, not brand — same
  // reasoning as Badge's semantic variants staying off --teal.
  inapp: { label: 'Chat', icon: 'message', color: '#6366F1', bg: 'rgba(99,102,241,0.12)', border: '#6366F1', btnLabel: 'Send Reply' },
  email: { label: 'Email', icon: 'mail', color: 'var(--blue)', bg: 'var(--blue-l)', border: 'var(--blue)', btnLabel: 'Send Email' },
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp', color: '#25D366', bg: 'rgba(37,211,102,0.12)', border: '#25D366', btnLabel: 'Send via WhatsApp' },
  sms: { label: 'SMS', icon: 'smartphone', color: 'var(--purple)', bg: 'var(--purple-l)', border: 'var(--purple)', btnLabel: 'Send SMS' },
  note: { label: 'Note', icon: 'lock', color: 'var(--gold)', bg: 'var(--gold-l)', border: 'var(--gold)', btnLabel: 'Save Note' },
};

export const CATEGORIES = ['Clearance Delay', 'Document Issue', 'Demurrage Dispute', 'Duty Assessment', 'System Error', 'General Query', 'Complaint', 'Subscriptions and billing', 'Warehouse Operations'];
export const STATUS_ORDER: Record<StatusKey, number> = { OPEN: 0, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };

export function sortTickets(a: Ticket, b: Ticket) {
  const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (so !== 0) return so;
  return (b.message_count ?? 0) - (a.message_count ?? 0);
}

export const PRIORITY_ORDER: Record<PriorityKey, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, NORMAL: 2, LOW: 3 };

export function sortByPriority(a: Ticket, b: Ticket) {
  const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (po !== 0) return po;
  const ad = a.sla_deadline ? new Date(a.sla_deadline).getTime() : Infinity;
  const bd = b.sla_deadline ? new Date(b.sla_deadline).getTime() : Infinity;
  return ad - bd;
}

/* ── Helpers ── */
export const relTime = (d: string) => {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '—';
  const s = Math.floor((Date.now() - parsed.getTime()) / 1000);
  if (s < 0) return 'Just now';
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return 'yesterday';
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

// Same formatting ShipmentDetail.tsx's own attachment list already uses.
export function fmtAttachmentSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// Instagram/Facebook/Telegram were removed from ChannelId entirely — the
// backend's own MessageChannel type (packages/types/src/core.ts) never
// included them, so selecting one in the broadcast composer and hitting
// Send fell through MessagingService.dispatchOutbound's if/else with no
// matching branch: it silently saved a support_messages row marked
// OUTBOUND/success and showed the agent a "Sent" toast, while nothing was
// ever actually dispatched to the customer. A fake success is worse than no
// button at all. Real Meta Graph API integration for either is a genuine
// project (OAuth page linking, webhook subscriptions) — see Channel
// Settings for the honest "not connected" state instead of a fake channel.
export function channelKey(channel?: string | null): ChannelId {
  switch ((channel || '').toUpperCase()) {
    case 'WHATSAPP': return 'whatsapp';
    case 'SMS': return 'sms';
    case 'SYSTEM': return 'note';
    case 'EMAIL': return 'email';
    default: return 'inapp';
  }
}

// Real values written at ticket-creation time by each cross-app origin —
// see seal-automation.routes.ts (seal), bliss.subscribers.ts (clearos SLA
// breach), studio/actions.ts (studio) and org.routes.ts (onsite org portal).
// null/undefined means an agent or customer raised it directly in Bliss.
export const SOURCE_APP_LABELS: Record<string, string> = {
  seal: 'SEAL', clearos: 'ClearOS', studio: 'Workflow Studio', onsite: 'Onsite',
};

/** Where a ticket actually came from — distinct from channelKey(), which
 *  maps SYSTEM to the "note" pill for in-thread messages (an internal
 *  system-authored message reads like a note). Applied to a whole ticket's
 *  origin that's wrong — a SYSTEM-channel ticket is one a cross-app
 *  automation raised on a customer's behalf (SEAL, ClearOS, Workflow
 *  Studio, the Onsite org portal — see SOURCE_APP_LABELS), not a note. */
export function ticketOrigin(t: Pick<Ticket, 'channel' | 'source_app'>): { icon: IconName; label: string } {
  if ((t.channel || '').toUpperCase() === 'SYSTEM') {
    const appLabel = t.source_app ? (SOURCE_APP_LABELS[t.source_app] || t.source_app) : null;
    return { icon: 'zap', label: appLabel ? `${appLabel} Automation` : 'System Automation' };
  }
  const cfg = CHANNEL_CFG[channelKey(t.channel)];
  return { icon: cfg.icon, label: cfg.label };
}

/** Minimal, dependency-free User-Agent read — good enough for the handful
 *  of major browsers/OSes this needs to label, without pulling in a parsing
 *  library for what's ultimately a "Technology" info card. Order matters:
 *  Edge and Opera UAs both still carry a Chrome token, and Chrome's own UA
 *  carries a Safari token, so the more specific checks must run first. */
export function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    'Unknown browser';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' :
    'Unknown OS';
  const device = /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';
  return { browser, os, device };
}

/* ── Atom components ──
   Av used to hand-roll its own colour-hash + initials circle, ignoring the
   userId/kind props every call site already passed it — meaning even a
   ticket with a real assigned agent never showed their actual photo here,
   only ever colored initials. Delegates to the real PersonAvatar now, the
   same fix CLAUDE.md documents for the rest of the platform's ad-hoc avatar
   divs — every existing <Av name userId kind size /> call site is unchanged. */
export function Av({ name, userId, kind, size = 30 }: { name: string; userId?: string; kind?: 'people' | 'customers'; size?: number }) {
  return <PersonAvatar name={name} userId={userId} kind={kind} size={size} />;
}

export function PBadge({ p }: { p: string }) {
  const c = PRIORITY_CFG[p as PriorityKey] ?? PRIORITY_CFG.LOW;
  return (
    <span className="spt-pri-badge" data-p={p}>
      <span className="spt-pri-dot" />{c.label}
    </span>
  );
}

export function SBadge({ s }: { s: string }) {
  const c = STATUS_CFG[s as StatusKey] ?? STATUS_CFG.OPEN;
  return <span className="spt-sbadge" data-s={s}>{c.label}</span>;
}

export function ChPill({ ch }: { ch: ChannelId }) {
  const c = CHANNEL_CFG[ch] ?? CHANNEL_CFG.inapp;
  return (
    <Tip label={c.label}>
      <span className="spt-ch-pill-sm" data-ch={ch} aria-label={c.label} style={{ color: c.color, background: c.bg, borderColor: c.border }}>
        <Icon name={c.icon} size={11} strokeWidth={2} />
      </span>
    </Tip>
  );
}

/* ══════════════════════════════════════════
   COL 1 & COL 2 — BeDesk Inbox Nav & List/Table
══════════════════════════════════════════ */
export const CONV_PAGE_SIZE = 12;

export type InboxFilter = 'inbox' | 'unassigned' | 'closed' | 'all' | 'onsite';
export type FilterSel =
  | { kind: 'fixed'; key: InboxFilter }
  | { kind: 'group'; id: string }
  | { kind: 'view'; id: string };
export type ViewMode = 'chat' | 'table';
export type SortKey = 'customer' | 'status' | 'assigned_to' | 'group_name' | 'updated_at';

export type ColumnId = 'status' | 'source' | 'customer' | 'summary' | 'assigned_to' | 'group_name' | 'updated_at';
export const DEFAULT_COLUMN_ORDER: ColumnId[] = ['status', 'source', 'customer', 'summary', 'assigned_to', 'group_name', 'updated_at'];
export const COLUMN_LABELS: Record<ColumnId, string> = {
  status: 'Status', source: 'Source', customer: 'Customer', summary: 'Summary',
  assigned_to: 'Assignee', group_name: 'Group', updated_at: 'Last updated',
};
export const COLUMN_SORT_KEY: Partial<Record<ColumnId, SortKey>> = {
  status: 'status', customer: 'customer', assigned_to: 'assigned_to',
  group_name: 'group_name', updated_at: 'updated_at',
};
export const COLUMN_WIDTHS: Record<ColumnId, { width?: number | string; minWidth?: number | string }> = {
  status: { width: '90px', minWidth: '85px' },
  source: { width: '120px', minWidth: '100px' },
  customer: { width: '180px', minWidth: '140px' },
  summary: { minWidth: '180px' },
  assigned_to: { width: '140px', minWidth: '120px' },
  group_name: { width: '130px', minWidth: '110px' },
  updated_at: { width: '90px', minWidth: '80px' },
};

export function loadColumnOrder(): ColumnId[] {
  try {
    const saved = JSON.parse(localStorage.getItem('bliss_tix_col_order') || 'null');
    if (Array.isArray(saved)) {
      const kept = saved.filter((c): c is ColumnId => DEFAULT_COLUMN_ORDER.includes(c));
      const missing = DEFAULT_COLUMN_ORDER.filter(c => !kept.includes(c));
      if (kept.length) return [...kept, ...missing];
    }
  } catch { }
  return DEFAULT_COLUMN_ORDER;
}
export function loadHiddenColumns(): Set<ColumnId> {
  try {
    const saved = JSON.parse(localStorage.getItem('bliss_tix_col_hidden') || 'null');
    if (Array.isArray(saved)) return new Set(saved.filter((c): c is ColumnId => DEFAULT_COLUMN_ORDER.includes(c)));
  } catch { }
  return new Set();
}
