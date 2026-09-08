import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { apiFetch, apiDownload } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { OPS_ROLES } from '../lib/permissions.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { Icon } from '../components/Icon.js';
import { PageLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import '../pages/Bliss.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Badge } from '../components/ui/badge.js';
import { Tip } from '../components/ui/tooltip.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuCheckboxItem } from '../components/ui/dropdown-menu.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { showAlert } from '../lib/alert.js';

// Same emoji set Team Chat's own composer offers (Chat.tsx) — one set, not
// a second invented list, so a reply picks from the same palette a channel
// message would.
const COMPOSER_EMOJIS = ['👍', '❤️', '😄', '🎉', '🚀', '👀', '✅', '😂', '🙌', '💯', '🔥', '👋', '🤝', '📦', '✈️', '⚓'];

// Same resolveDriveId() caching pattern ContractDetail.tsx already uses for
// its own attachment uploads — one drive, not re-fetched per attach.
let cachedSupportDriveId: string | null = null;

const COMPLYOS_AGENCIES = [
  { code: 'BRELA', name: 'BRELA — Business Registration & Licensing' },
  { code: 'TRA', name: 'TRA — Tanzania Revenue Authority' },
  { code: 'NSSF', name: 'NSSF — National Social Security Fund' },
  { code: 'WCF', name: 'WCF — Workers Compensation Fund' },
  { code: 'NHIF', name: 'NHIF — National Health Insurance Fund' },
  { code: 'TFDA', name: 'TFDA — Tanzania Food & Drugs Authority' },
  { code: 'TBS', name: 'TBS — Tanzania Bureau of Standards' },
  { code: 'OSHA', name: 'OSHA — Occupational Safety & Health Authority' },
];

/** Bliss → ComplyOS bridge modal */
function SendToComplyOSModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const navigate = useNavigate();
  const [agencyCode, setAgencyCode] = useState(COMPLYOS_AGENCIES[0].code);
  const [certType, setCertType] = useState(ticket.subject);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    if (!certType.trim()) { setError('Please describe what certification/permit is needed.'); return; }
    setSending(true);
    setError('');
    try {
      const app = await apiFetch('/v1/comply/applications/from-ticket', {
        method: 'POST',
        body: JSON.stringify({ ticket_id: ticket.id, agency_code: agencyCode, cert_type: certType.trim() }),
      });
      navigate(`/complyos/applications?opened=${app.id}`);
    } catch (e: any) {
      setError(e.message || 'Could not open a ComplyOS application for this ticket.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-110 max-w-full p-0 gap-0">
        <DialogHeader style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
          <DialogTitle style={{ fontSize: 15 }}>Send to ComplyOS</DialogTitle>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Opens a draft compliance application pre-filled from this ticket — {ticket.ref}.</div>
        </DialogHeader>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Agency</label>
            <Select value={agencyCode} onValueChange={setAgencyCode}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPLYOS_AGENCIES.map(a => <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Certification / Permit Needed</label>
            <input className="input-field" value={certType} onChange={e => setCertType(e.target.value)} placeholder="e.g. Tax Compliance Certificate" />
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </div>
        <DialogFooter style={{ padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={sending} onClick={handleSend}>
            {sending ? 'Opening…' : 'Open Application'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Types ── */
export type ChannelId = 'inapp' | 'email' | 'whatsapp' | 'sms' | 'note';
export type StatusKey = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type PriorityKey = 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface SysCustomer {
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

const CATEGORIES = ['Clearance Delay', 'Document Issue', 'Demurrage Dispute', 'Duty Assessment', 'System Error', 'General Query', 'Complaint', 'Subscriptions and billing', 'Warehouse Operations'];
const STATUS_ORDER: Record<StatusKey, number> = { OPEN: 0, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };

function sortTickets(a: Ticket, b: Ticket) {
  const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (so !== 0) return so;
  return (b.message_count ?? 0) - (a.message_count ?? 0);
}

const PRIORITY_ORDER: Record<PriorityKey, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, NORMAL: 2, LOW: 3 };

function sortByPriority(a: Ticket, b: Ticket) {
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
function fmtAttachmentSize(bytes: number): string {
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
function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
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
function Av({ name, userId, kind, size = 30 }: { name: string; userId?: string; kind?: 'people' | 'customers'; size?: number }) {
  return <PersonAvatar name={name} userId={userId} kind={kind} size={size} />;
}

function PBadge({ p }: { p: string }) {
  const c = PRIORITY_CFG[p as PriorityKey] ?? PRIORITY_CFG.LOW;
  return (
    <span className="spt-pri-badge" data-p={p}>
      <span className="spt-pri-dot" />{c.label}
    </span>
  );
}

function SBadge({ s }: { s: string }) {
  const c = STATUS_CFG[s as StatusKey] ?? STATUS_CFG.OPEN;
  return <span className="spt-sbadge" data-s={s}>{c.label}</span>;
}

function ChPill({ ch }: { ch: ChannelId }) {
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
const CONV_PAGE_SIZE = 12;

type InboxFilter = 'inbox' | 'unassigned' | 'closed' | 'all' | 'onsite';
type FilterSel =
  | { kind: 'fixed'; key: InboxFilter }
  | { kind: 'group'; id: string }
  | { kind: 'view'; id: string };
export type ViewMode = 'chat' | 'table';
type SortKey = 'customer' | 'status' | 'assigned_to' | 'group_name' | 'updated_at';

type ColumnId = 'status' | 'source' | 'customer' | 'summary' | 'assigned_to' | 'group_name' | 'updated_at';
const DEFAULT_COLUMN_ORDER: ColumnId[] = ['status', 'source', 'customer', 'summary', 'assigned_to', 'group_name', 'updated_at'];
const COLUMN_LABELS: Record<ColumnId, string> = {
  status: 'Status', source: 'Source', customer: 'Customer', summary: 'Summary',
  assigned_to: 'Assignee', group_name: 'Group', updated_at: 'Last updated',
};
const COLUMN_SORT_KEY: Partial<Record<ColumnId, SortKey>> = {
  status: 'status', customer: 'customer', assigned_to: 'assigned_to',
  group_name: 'group_name', updated_at: 'updated_at',
};
const COLUMN_WIDTHS: Record<ColumnId, { width?: number | string; minWidth?: number | string }> = {
  status: { width: '90px', minWidth: '85px' },
  source: { width: '120px', minWidth: '100px' },
  customer: { width: '180px', minWidth: '140px' },
  summary: { minWidth: '180px' },
  assigned_to: { width: '140px', minWidth: '120px' },
  group_name: { width: '130px', minWidth: '110px' },
  updated_at: { width: '90px', minWidth: '80px' },
};
// Real values written at ticket-creation time by each cross-app origin —
// see seal-automation.routes.ts (seal), bliss.subscribers.ts (clearos SLA
// breach), studio/actions.ts (studio) and org.routes.ts (onsite org portal).
// null/undefined means an agent or customer raised it directly in Bliss.
const SOURCE_APP_LABELS: Record<string, string> = {
  seal: 'SEAL', clearos: 'ClearOS', studio: 'Workflow Studio', onsite: 'Onsite',
};

function loadColumnOrder(): ColumnId[] {
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
function loadHiddenColumns(): Set<ColumnId> {
  try {
    const saved = JSON.parse(localStorage.getItem('bliss_tix_col_hidden') || 'null');
    if (Array.isArray(saved)) return new Set(saved.filter((c): c is ColumnId => DEFAULT_COLUMN_ORDER.includes(c)));
  } catch { }
  return new Set();
}

function ConvList({ tickets, selected, onSelect, onNew, groups, views, onCreateGroup, onCreateView, onDeleteView, isDesktop, initialChannelFilter, queueMode, agents = [], viewMode = 'chat', onViewModeChange, onBulkStatus, onBulkAssign, onBulkGroup }: {
  tickets: Ticket[]; selected: Ticket | null;
  onSelect: (t: Ticket) => void; onNew: () => void;
  groups: SupportGroup[]; views: SupportView[];
  onCreateGroup: (name: string) => void;
  onCreateView: (name: string, filters: Record<string, any>) => void;
  onDeleteView: (id: string) => void;
  isDesktop?: boolean;
  initialChannelFilter?: 'all' | ChannelId;
  queueMode?: boolean;
  agents?: { id: string; name: string }[];
  viewMode?: ViewMode;
  onViewModeChange?: (v: ViewMode) => void;
  onBulkStatus: (ids: string[], status: StatusKey) => Promise<void>;
  onBulkAssign: (ids: string[], assigneeId: string) => Promise<void>;
  onBulkGroup: (ids: string[], groupId: string | null) => Promise<void>;
}) {
  const [convPage, setConvPage] = useState(1);
  const [sel, setSel] = useState<FilterSel>({ kind: 'fixed', key: 'inbox' });
  const activeViewMode = viewMode;

  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewCategory, setNewViewCategory] = useState(CATEGORIES[0]);
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelId>(initialChannelFilter ?? 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusTabFilter, setStatusTabFilter] = useState<'all' | 'open' | 'pending' | 'resolved'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [colOrder, setColOrder] = useState<ColumnId[]>(loadColumnOrder);
  const [hiddenCols, setHiddenCols] = useState<Set<ColumnId>>(loadHiddenColumns);
  const [dragCol, setDragCol] = useState<ColumnId | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);

  const [viewsOpen, setViewsOpen] = useState(true);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { localStorage.setItem('bliss_tix_col_order', JSON.stringify(colOrder)); }, [colOrder]);
  useEffect(() => { localStorage.setItem('bliss_tix_col_hidden', JSON.stringify([...hiddenCols])); }, [hiddenCols]);

  function reorderColumn(from: ColumnId, to: ColumnId) {
    if (from === to) return;
    setColOrder(order => {
      const next = order.filter(c => c !== from);
      next.splice(next.indexOf(to), 0, from);
      return next;
    });
  }
  function toggleColumnVisible(id: ColumnId) {
    setHiddenCols(hidden => {
      const next = new Set(hidden);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (colOrder.length - next.size <= 1) return next;
        next.add(id);
      }
      return next;
    });
  }
  const visibleColOrder = colOrder.filter(c => !hiddenCols.has(c));

  const inboxCount = (k: InboxFilter) => {
    if (k === 'inbox') return tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
    if (k === 'unassigned') return tickets.filter(t => !t.assigned_to).length;
    if (k === 'closed') return tickets.filter(t => t.status === 'CLOSED').length;
    if (k === 'onsite') return tickets.filter(t => t.source_app === 'onsite' && t.status !== 'CLOSED').length;
    return tickets.length;
  };

  const visible = tickets.filter(t => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCust = t.customer.toLowerCase().includes(q);
      const matchSubj = t.subject.toLowerCase().includes(q);
      const matchRef = t.ref.toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchEmail = (t.customer_email || '').toLowerCase().includes(q);
      const matchPhone = (t.customer_phone || '').toLowerCase().includes(q);
      if (!matchCust && !matchSubj && !matchRef && !matchDesc && !matchEmail && !matchPhone) return false;
    }
    if (statusTabFilter !== 'all') {
      if (statusTabFilter === 'open' && t.status !== 'OPEN') return false;
      if (statusTabFilter === 'pending' && t.status !== 'IN_PROGRESS') return false;
      if (statusTabFilter === 'resolved' && t.status !== 'RESOLVED' && t.status !== 'CLOSED') return false;
    }
    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'unassigned' && t.assigned_to) return false;
      if (assigneeFilter !== 'unassigned' && t.assigned_to !== assigneeFilter) return false;
    }
    if (channelFilter !== 'all' && channelKey(t.channel) !== channelFilter) return false;
    if (sel.kind === 'fixed') {
      return sel.key === 'all' ? true :
        sel.key === 'inbox' ? (t.status === 'OPEN' || t.status === 'IN_PROGRESS') :
          sel.key === 'unassigned' ? !t.assigned_to :
            sel.key === 'onsite' ? t.source_app === 'onsite' && t.status !== 'CLOSED' :
              t.status === 'CLOSED';
    }
    if (sel.kind === 'group') return t.group_id === sel.id || t.group_name === sel.id;
    const view = views.find(v => v.id === sel.id);
    if (!view) return true;
    const f = view.filters || {};
    if (f.category && t.category !== f.category) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    return true;
  }).sort((a, b) => {
    if (queueMode && channelFilter === 'inapp') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sel.kind === 'fixed' && sel.key === 'onsite') return sortByPriority(a, b);
    if (activeViewMode === 'chat') return sortTickets(a, b);
    let av: string, bv: string;
    switch (sortKey) {
      case 'customer': av = a.customer; bv = b.customer; break;
      case 'status': av = a.status; bv = b.status; break;
      case 'assigned_to': av = a.assigned_to || ''; bv = b.assigned_to || ''; break;
      case 'group_name': av = a.group_name || 'General'; bv = b.group_name || 'General'; break;
      case 'updated_at': av = a.updated_at || a.created_at; bv = b.updated_at || b.created_at; break;
      default: return 0;
    }
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalConvPages = Math.max(1, Math.ceil(visible.length / CONV_PAGE_SIZE));
  const safePage = Math.min(convPage, totalConvPages);
  const paged = visible.slice((safePage - 1) * CONV_PAGE_SIZE, safePage * CONV_PAGE_SIZE);

  useEffect(() => { setConvPage(1); }, [sel, searchQuery, statusTabFilter, assigneeFilter]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paged.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paged.map(t => t.id)));
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const INBOX_ITEMS: { key: InboxFilter; label: string; icon: IconName }[] = [
    { key: 'inbox', label: 'Your inbox', icon: 'inbox' },
    { key: 'unassigned', label: 'Unassigned', icon: 'paw' },
    { key: 'closed', label: 'Closed', icon: 'archive' },
    { key: 'all', label: 'All', icon: 'users' },
  ];


  const renderColumnCell = (colId: ColumnId, t: Ticket) => {
    switch (colId) {
      case 'status': {
        return <span className={`spt-bedesk-status-pill spt-bedesk-status-pill--${t.status.toLowerCase().replace('_', '-')}`}>{STATUS_CFG[t.status]?.label ?? 'Open'}</span>;
      }
      case 'source': {
        const origin = ticketOrigin(t);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }} title={origin.label}>
            <Icon name={origin.icon} size={13} strokeWidth={1.75} color="var(--ink3)" />
            <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {origin.label}
            </span>
          </div>
        );
      }
      case 'customer':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
            <Av name={t.customer} userId={t.customer_id} kind="customers" size={24} />
            <span style={{ fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
              {t.customer}
            </span>
          </div>
        );
      case 'summary': {
        const lastMsg = t.messages?.[t.messages.length - 1];
        const preview = lastMsg ? lastMsg.content : (t.description || t.subject || 'Customer inquiry');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {(t.tags ?? []).slice(0, 3).map(tag => (
              <span key={tag} className="spt-bedesk-tag-pill">{tag}</span>
            ))}
            <span style={{ fontSize: 12.5, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </span>
          </div>
        );
      }
      case 'assigned_to':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.assigned_to ? (
              <>
                <Av name={t.assigned_to} userId={t.assigned_to_id} kind="people" size={20} />
                <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.assigned_to}
                </span>
              </>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink3)' }}>
                <Icon name="paw" size={13} strokeWidth={1.5} />
                <span>Unassigned</span>
              </span>
            )}
          </div>
        );
      case 'group_name':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: t.group_color || '#06b6d4',
                color: '#ffffff', fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {(t.group_name || 'General').charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.group_name || 'General'}
            </span>
          </div>
        );
      case 'updated_at':
        return <span style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', display: 'block' }}>{relTime(t.updated_at || t.created_at)}</span>;
    }
  };

  const navContent = (
    <div className="spt-inbox-nav-pane">
      {/* ── Top BeDesk Inbox Title & Header Actions ── */}
      <div className="spt-bedesk-nav-hdr">
        <span className="spt-bedesk-nav-title">Inbox</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tip label="Search">
            <button
              type="button"
              className="spt-bedesk-icon-btn"
              onClick={() => setSearchOpen(o => !o)}
            >
              <Icon name="search" size={15} />
            </button>
          </Tip>
          <Tip label="New Ticket">
            <button
              type="button"
              className="spt-bedesk-icon-btn"
              onClick={onNew}
            >
              <Icon name="plus" size={16} />
            </button>
          </Tip>
        </div>
      </div>

      {searchOpen && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div className="spt-bedesk-search-input-wrap">
            <Icon name="search" size={13} color="var(--ink3)" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations…"
              autoFocus
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 0 }}>
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="spt-nav-scroll">
        {/* Primary BeDesk items */}
        <nav className="spt-inbox-nav">
          {INBOX_ITEMS.map(item => {
            const count = inboxCount(item.key);
            const active = sel.kind === 'fixed' && sel.key === item.key;
            return (
              <button key={item.key} type="button"
                className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                onClick={() => setSel({ kind: 'fixed', key: item.key })}>
                <Icon name={item.icon} size={15} strokeWidth={active ? 2.2 : 1.75} />
                <span className="spt-inbox-label">{item.label}</span>
                {count > 0 && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{count}</span>}
              </button>
            );
          })}
        </nav>

        {/* Views Section */}
        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr" onClick={() => setViewsOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <span>Views</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tip label="New view">
                <button type="button" className="spt-nav-add" onClick={e => { e.stopPropagation(); setNewViewOpen(o => !o); }}>
                  <Icon name="plus" size={12} />
                </button>
              </Tip>
              <Icon name={viewsOpen ? 'chevronDown' : 'chevronRight'} size={12} />
            </div>
          </div>
          {viewsOpen && (
            <>
              {newViewOpen && (
                <div className="spt-nav-new-form">
                  <input className="input-field" placeholder="View name" value={newViewName} onChange={e => setNewViewName(e.target.value)} />
                  <Select value={newViewCategory} onValueChange={setNewViewCategory}>
                    <SelectTrigger aria-label="View category" className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="spt-nav-new-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewViewOpen(false)}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!newViewName.trim()} onClick={() => {
                      onCreateView(newViewName.trim(), { category: newViewCategory });
                      setNewViewName(''); setNewViewOpen(false);
                    }}>Save</button>
                  </div>
                </div>
              )}
              <nav className="spt-inbox-nav">
                {views.map(v => {
                  const active = sel.kind === 'view' && sel.id === v.id;
                  return (
                    <button key={v.id} type="button"
                      className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                      onClick={() => setSel({ kind: 'view', id: v.id })}>
                      <Icon name="filter" size={13} strokeWidth={active ? 2.2 : 1.75} />
                      <span className="spt-inbox-label">{v.name}</span>
                      <span className="spt-nav-item-remove" onClick={e => { e.stopPropagation(); onDeleteView(v.id); if (active) setSel({ kind: 'fixed', key: 'all' }); }}>
                        <Icon name="x" size={11} strokeWidth={2} />
                      </span>
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </div>

        {/* Groups Section */}
        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr" onClick={() => setGroupsOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <span>Groups</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tip label="New group">
                <button type="button" className="spt-nav-add" onClick={e => { e.stopPropagation(); setNewGroupOpen(o => !o); }}>
                  <Icon name="plus" size={12} />
                </button>
              </Tip>
              <Icon name={groupsOpen ? 'chevronDown' : 'chevronRight'} size={12} />
            </div>
          </div>
          {groupsOpen && (
            <>
              {newGroupOpen && (
                <div className="spt-nav-new-form">
                  <input className="input-field" placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                  <div className="spt-nav-new-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewGroupOpen(false)}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!newGroupName.trim()} onClick={() => {
                      onCreateGroup(newGroupName.trim());
                      setNewGroupName(''); setNewGroupOpen(false);
                    }}>Save</button>
                  </div>
                </div>
              )}
              {groups.length === 0 ? (
                <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--ink3)' }}>No groups yet — create one above.</div>
              ) : (
                <nav className="spt-inbox-nav">
                  {groups.map(g => {
                    const active = sel.kind === 'group' && (sel.id === g.id || sel.id === g.name);
                    return (
                      <button key={g.id} type="button"
                        className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                        onClick={() => setSel({ kind: 'group', id: g.id })}>
                        <span className="spt-bedesk-group-dot" style={{ background: g.color || '#06b6d4' }} />
                        <span className="spt-inbox-label">{g.name}</span>
                        {!!g.ticket_count && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{g.ticket_count}</span>}
                      </button>
                    );
                  })}
                </nav>
              )}
            </>
          )}
        </div>

        {/* ── Social Channels Section ── */}
        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr" onClick={() => setChannelsOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <span>Channels</span>
            <Icon name={channelsOpen ? 'chevronDown' : 'chevronRight'} size={12} />
          </div>
          {channelsOpen && (
            <nav className="spt-inbox-nav">
              {(['all', 'whatsapp', 'email', 'inapp', 'sms'] as const).map(ch => {
                const active = channelFilter === ch;
                const cfg = ch === 'all' ? null : CHANNEL_CFG[ch];
                const count = ch === 'all' ? tickets.length : tickets.filter(t => channelKey(t.channel) === ch).length;
                return (
                  <button key={ch} type="button"
                    className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                    onClick={() => setChannelFilter(ch)}>
                    <Icon name={cfg?.icon ?? 'globe'} size={14} strokeWidth={active ? 2.2 : 1.75} style={cfg ? { color: cfg.color } : undefined} />
                    <span className="spt-inbox-label">{cfg?.label ?? 'All channels'}</span>
                    {count > 0 && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{count}</span>}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Bottom Pinned: Assignee Filter — moved down from the toolbar row
          above the ticket list, which only ever had room for it alongside
          the status Tabs by scrolling. "Manage views" that lived in this
          slot linked to Operational Mode, itself always reachable from
          Bliss's own main nav — a real destination, just a redundant third
          path to it once the header's own Settings button already covered
          the same ground. */}
      <div className="spt-bedesk-nav-ft">
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="spt-bedesk-val-select" style={{ width: '100%' }}>
            <SelectValue placeholder="All assignees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  // statusTabFilter/assigneeFilter already drove the real filtering logic
  // above (visible = tickets.filter(...)) with no control anywhere that
  // ever changed either away from its initial value — a finer cut within
  // the sidebar's own broader buckets (e.g. "Pending" here is IN_PROGRESS
  // only, distinct from the sidebar's "Inbox" which lumps OPEN+IN_PROGRESS
  // together; the sidebar has no per-agent filter at all).
  const STATUS_TABS: { key: typeof statusTabFilter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'open', label: 'Open' },
    { key: 'pending', label: 'Pending' }, { key: 'resolved', label: 'Resolved' },
  ];
  const filterBar = (
    // Always exactly one row, never wrapped and never shrunk to invisible.
    // The conversation-list panel is a resizable react-resizable-panels
    // column (minSize 20%) that at its default size gives this row less
    // room than the tabs + select need at their natural, fully-legible
    // width — flexWrap broke it into two lines, and shrinking the select
    // with no real floor let it collapse toward 0 width instead. Neither
    // is "a single row" in any useful sense. The one thing that keeps
    // BOTH controls fully readable at every panel width is the same
    // visible-scrollbar overflow ds-tabs.css already uses for a tab row
    // that doesn't fit — scroll the row itself rather than hide anything.
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 14px',
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      height: 50,
      minHeight: 50,
      maxHeight: 50,
      background: 'var(--card-bg, var(--white))',
      flexShrink: 0,
      boxSizing: 'border-box',
    }}>
      <Tabs value={statusTabFilter} onValueChange={v => setStatusTabFilter(v as any)} variant="segmented" style={{ flexShrink: 0 }}>
        <TabsList>
          {STATUS_TABS.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key} style={{ fontSize: 11.5, padding: '0 8px' }}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );

  // The row/table checkboxes and "select all" already existed with real
  // selection state (selectedIds) — nothing consumed it (see Bliss.css's own
  // "nobody's using yet" comment on .spt-row-checkbox). This is that
  // consumer: bulk status/assignee/group changes over whatever's selected,
  // reusing the same per-ticket endpoints the Details panel's own Select
  // rows call, not a new bulk API.
  const bulkBar = selectedIds.size > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--teal-l)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--teal)', marginRight: 4 }}>{selectedIds.size} selected</span>
      <Select value="__" onValueChange={v => { onBulkStatus(Array.from(selectedIds), v as StatusKey).then(() => setSelectedIds(new Set())); }}>
        <SelectTrigger className="spt-bedesk-val-select" style={{ width: 130 }}><span style={{ fontSize: 12 }}>Set status…</span></SelectTrigger>
        <SelectContent>
          <SelectItem value="OPEN">Open</SelectItem>
          <SelectItem value="IN_PROGRESS">Pending</SelectItem>
          <SelectItem value="RESOLVED">Resolved</SelectItem>
          <SelectItem value="CLOSED">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Select value="__" onValueChange={v => { onBulkAssign(Array.from(selectedIds), v).then(() => setSelectedIds(new Set())); }}>
        <SelectTrigger className="spt-bedesk-val-select" style={{ width: 130 }}><span style={{ fontSize: 12 }}>Assign to…</span></SelectTrigger>
        <SelectContent>
          {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value="__" onValueChange={v => { onBulkGroup(Array.from(selectedIds), v === '__none__' ? null : v).then(() => setSelectedIds(new Set())); }}>
        <SelectTrigger className="spt-bedesk-val-select" style={{ width: 130 }}><span style={{ fontSize: 12 }}>Add to group…</span></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">General</SelectItem>
          {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <button type="button" onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        Clear selection
      </button>
    </div>
  );

  const listContent = (
    <div className="spt-tix-list-pane">
      {filterBar}
      {bulkBar}

      {activeViewMode === 'chat' ? (
        <div className={`spt-conv-rows${selectedIds.size > 0 ? ' spt-conv-rows--selecting' : ''}`}>
          {paged.length === 0 && (
            <div className="spt-conv-empty">No conversations found</div>
          )}
          {paged.map(t => {
            const isSel = selected?.id === t.id;
            const isChecked = selectedIds.has(t.id);
            const lastMsg = t.messages?.[t.messages.length - 1];
            const preview = lastMsg ? lastMsg.content : (t.description?.slice(0, 80) || t.subject || 'No description provided.');

            return (
              <div
                key={t.id}
                className={`spt-bedesk-conv-card${isSel ? ' spt-bedesk-conv-card--active' : ''}`}
                onClick={() => onSelect(t)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <Checkbox
                    className="spt-row-checkbox"
                    checked={isChecked}
                    onClick={e => toggleSelectOne(t.id, e)}
                    onCheckedChange={() => { }}
                  />
                  <div className="spt-conv-row-av" style={{ position: 'relative' }}>
                    <Av name={t.customer} userId={t.customer_id} kind="customers" size={36} />
                    {t.status === 'OPEN' && <span className="spt-conv-unread-dot" />}
                  </div>
                </div>

                <div className="spt-conv-row-body" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <div className="spt-conv-row-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                    <span className="spt-conv-row-name" title={t.customer}>
                      {t.customer}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {channelKey(t.channel) === 'note' && (
                        <Tip label="Internal Note">
                          <Icon name="lock" size={11} color="var(--gold, #f59e0b)" />
                        </Tip>
                      )}
                      <span className="spt-conv-row-time">
                        {relTime(t.updated_at || t.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="spt-conv-row-preview" title={preview}>
                    {preview}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Full Table View Mode (Image 1) ── */
        <div className="spt-tix-table-wrap">
          <table className={`spt-bedesk-table${selectedIds.size > 0 ? ' spt-bedesk-table--selecting' : ''}`}>
            <thead>
              <tr>
                <th style={{ width: 38, minWidth: 38, textAlign: 'center', padding: '8px 6px' }}>
                  <Checkbox
                    className="mx-auto"
                    checked={paged.length > 0 && selectedIds.size === paged.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                {visibleColOrder.map(colId => {
                  const sortK = COLUMN_SORT_KEY[colId];
                  const active = sortK && sortKey === sortK;
                  const colStyle = {
                    width: COLUMN_WIDTHS[colId]?.width,
                    minWidth: COLUMN_WIDTHS[colId]?.minWidth,
                  };
                  return (
                    <th
                      key={colId}
                      style={colStyle}
                      className={`spt-tix-th spt-tix-th--${colId} spt-tix-th--draggable${active ? ' spt-tix-th--active' : ''}${dragOverCol === colId ? ' spt-tix-th--dragover' : ''}`}
                      draggable
                      onDragStart={() => setDragCol(colId)}
                      onDragOver={e => { e.preventDefault(); if (dragOverCol !== colId) setDragOverCol(colId); }}
                      onDragLeave={() => setDragOverCol(cur => cur === colId ? null : cur)}
                      onDrop={e => { e.preventDefault(); if (dragCol) reorderColumn(dragCol, colId); setDragCol(null); setDragOverCol(null); }}
                      onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                      onClick={() => sortK && toggleSort(sortK)}
                      title="Click to sort, drag to reorder"
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Icon name="moreVertical" size={10} strokeWidth={2} className="spt-tix-th-grip" />
                        {COLUMN_LABELS[colId]}
                        {active && <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} strokeWidth={2} />}
                      </span>
                    </th>
                  );
                })}
                <th style={{ width: 32, minWidth: 32, textAlign: 'center', padding: '8px 4px' }}>
                  <DropdownMenu>
                    <Tip label="Show/hide columns">
                      <DropdownMenuTrigger asChild>
                        <button type="button" onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex' }}>
                          <Icon name="settings" size={13} />
                        </button>
                      </DropdownMenuTrigger>
                    </Tip>
                    <DropdownMenuContent align="end">
                      {colOrder.map(colId => (
                        <DropdownMenuCheckboxItem
                          key={colId}
                          checked={!hiddenCols.has(colId)}
                          onCheckedChange={() => toggleColumnVisible(colId)}
                          onSelect={e => e.preventDefault()}
                        >
                          {COLUMN_LABELS[colId]}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={visibleColOrder.length + 2} className="spt-conv-empty">No conversations found</td></tr>
              )}
              {paged.map(t => {
                const isSel = selected?.id === t.id;
                const isChecked = selectedIds.has(t.id);
                return (
                  <tr key={t.id} className={isSel ? 'spt-bedesk-row--active' : ''} onClick={() => onSelect(t)}>
                    <td style={{ width: 38, minWidth: 38, textAlign: 'center', padding: '7px 6px' }}>
                      <Checkbox
                        className="mx-auto spt-row-checkbox"
                        checked={isChecked}
                        onClick={e => toggleSelectOne(t.id, e)}
                        onCheckedChange={() => { }}
                      />
                    </td>
                    {visibleColOrder.map(colId => (
                      <td
                        key={colId}
                        style={{ width: COLUMN_WIDTHS[colId]?.width, minWidth: COLUMN_WIDTHS[colId]?.minWidth }}
                        className={`spt-tix-td spt-tix-td--${colId}`}
                      >
                        {renderColumnCell(colId, t)}
                      </td>
                    ))}
                    <td style={{ width: 32, minWidth: 32 }} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalConvPages > 1 && (
        <div className="spt-conv-pager">
          <Tip label="Previous page">
            <button type="button" disabled={safePage <= 1} onClick={() => setConvPage(p => p - 1)}>
              <Icon name="arrowLeft" size={11} strokeWidth={2} />
            </button>
          </Tip>
          <span>{safePage} / {totalConvPages}</span>
          <Tip label="Next page">
            <button type="button" disabled={safePage >= totalConvPages} onClick={() => setConvPage(p => p + 1)}>
              <Icon name="arrowRight" size={11} strokeWidth={2} />
            </button>
          </Tip>
        </div>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <Panel defaultSize={activeViewMode === 'table' ? 15 : 15} minSize={12} maxSize={22} className="spt-inbox-nav-panel">
          {navContent}
        </Panel>
        <PanelResizeHandle className="spt-resize-handle" />
        <Panel defaultSize={activeViewMode === 'table' ? 85 : 27} minSize={20} className="spt-conv-list-panel">
          {listContent}
        </Panel>
      </>
    );
  }

  return (
    <div className="spt-conv-list">
      {navContent}
      {listContent}
    </div>
  );
}

/* ══════════════════════════════════════════
   COL 3 — BeDesk Conversation Thread & Composer
══════════════════════════════════════════ */
function ThreadPanel({ ticket, authorName, onClose, onOpenDetails, aiSuggestionToUse }: {
  ticket: Ticket;
  authorName: string; onClose: () => void; onOpenDetails?: () => void; aiSuggestionToUse?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(ticket.messages || []);
  const [sending, setSending] = useState(false);
  const [broadcastChs, setBroadcastChs] = useState<Set<ChannelId>>(new Set(['inapp'] as ChannelId[]));
  const [isNote, setIsNote] = useState(false);
  const [compose, setCompose] = useState('');
  const [emailSubj, setEmailSubj] = useState(`Re: [${ticket.ref}] ${ticket.subject}`);
  const [broadcastResult, setBroadcastResult] = useState<{ ch: string; success: boolean }[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMacros, setShowMacros] = useState(false);
  const [macros, setMacros] = useState<{ id: string; title: string; content: string }[] | null>(null);
  const [newMacroOpen, setNewMacroOpen] = useState(false);
  const [newMacroTitle, setNewMacroTitle] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<{ id: string; name: string; size: number | null; mime_type: string | null }[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 899px)');

  function loadMacros() {
    if (macros !== null) return;
    apiFetch('/v1/support/macros').then((r: any) => setMacros(Array.isArray(r) ? r : [])).catch(() => setMacros([]));
  }

  async function saveMacro() {
    if (!newMacroTitle.trim() || !compose.trim()) return;
    try {
      const macro = await apiFetch('/v1/support/macros', { method: 'POST', body: JSON.stringify({ title: newMacroTitle.trim(), content: compose }) });
      setMacros(prev => [...(prev ?? []), macro].sort((a, b) => a.title.localeCompare(b.title)));
      setNewMacroTitle('');
      setNewMacroOpen(false);
    } catch (err: any) { showAlert(err.message || 'Could not save this macro.'); }
  }

  async function deleteMacro(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await apiFetch(`/v1/support/macros/${id}`, { method: 'DELETE' });
      setMacros(prev => (prev ?? []).filter(m => m.id !== id));
    } catch (err: any) { showAlert(err.message || 'Could not delete this macro.'); }
  }

  // Attachments only apply to internal notes (see support.routes.ts PATCH
  // /tickets/:id/messages and migration 410's own header comment for why —
  // no WhatsApp/Email/SMS media-delivery integration exists yet, so
  // offering this on a customer-facing broadcast would be a fake success).
  async function handleAttach(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingAttachment(true);
    try {
      let driveId = cachedSupportDriveId;
      if (!driveId) {
        const drives = await apiFetch('/v1/drives');
        const list = Array.isArray(drives) ? drives : (drives.data ?? []);
        if (!list.length) throw new Error('No drive available to attach files to.');
        driveId = list[0].id;
        cachedSupportDriveId = driveId;
      }
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const uploaded = await apiFetch(`/v1/files/upload?drive_id=${driveId}&entity_type=support_ticket&entity_id=${ticket.id}`, { method: 'POST', body: fd });
        setPendingAttachments(prev => [...prev, { id: uploaded.id, name: uploaded.name, size: uploaded.size, mime_type: uploaded.mime_type }]);
      }
    } catch (err: any) {
      showAlert(err.message || 'Upload failed.');
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  useEffect(() => {
    setEmailSubj(`Re: [${ticket.ref}] ${ticket.subject}`);
    setCompose('');
    setBroadcastChs(new Set(['inapp'] as ChannelId[]));
    setIsNote(false);
    setBroadcastResult([]);
  }, [ticket.id]); // eslint-disable-line

  // Real fetched thread data arrives in two waves and can keep arriving:
  // openTicket()'s own `{ ...t, messages: [] }` optimistic placeholder,
  // then the real GET /tickets/:id response once it resolves, and again
  // whenever useWebSocket's support.message_received handler re-fetches
  // this same ticket. ticket.messages is a fresh array reference each of
  // those times even though ticket.id never changes, so it can't live in
  // the [ticket.id]-only effect above without also wiping the compose
  // draft/channel selection on every WS refetch — but leaving it out
  // entirely (the bug this replaces) meant the fetched thread never
  // reached the screen at all: messages state was seeded once from
  // openTicket's empty placeholder and then never updated again, so a
  // ticket's real history (older notes included) stayed invisible no
  // matter how long the fetch had to resolve, and a just-sent message
  // that genuinely persisted server-side looked lost on the next reload.
  // Never fires from handleSend's own local optimistic append, since that
  // only calls setMessages — the ticket prop and its .messages reference
  // are untouched until the server-authoritative refetch lands, which is
  // what should supersede the local optimistic entries with real ids.
  useEffect(() => {
    setMessages(ticket.messages || []);
  }, [ticket.id, ticket.messages]);

  useEffect(() => {
    if (aiSuggestionToUse) {
      setCompose(aiSuggestionToUse);
    }
  }, [aiSuggestionToUse]);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const toggleChannel = (ch: ChannelId) => {
    if (isNote) return;
    setBroadcastChs(prev => {
      const next = new Set(prev);
      if (next.has(ch)) { if (next.size > 1) next.delete(ch); }
      else next.add(ch);
      return next;
    });
  };

  const handleSend = async () => {
    const content = compose.trim();
    if (!content || sending) return;
    setSending(true);
    setBroadcastResult([]);
    try {
      if (isNote) {
        const res: any = await apiFetch(`/v1/support/tickets/${ticket.id}/messages`, {
          method: 'POST', body: JSON.stringify({ content, channel: 'NOTE', attachment_file_ids: pendingAttachments.map(a => a.id) }),
        });
        setMessages(prev => [...prev, {
          id: `local-${Date.now()}`, content, channel: 'note',
          author_type: 'OFFICER', author_name: authorName, created_at: new Date().toISOString(),
          ...(res || {}),
        }]);
        setPendingAttachments([]);
      } else {
        const channels = Array.from(broadcastChs).map(ch => ch.toUpperCase());
        const res: any = await apiFetch(`/v1/support/tickets/${ticket.id}/broadcast`, {
          method: 'POST',
          body: JSON.stringify({ content, channels, email_subject: emailSubj, attachment_file_ids: pendingAttachments.map(a => a.id) }),
        });

        if (res?.results) {
          setBroadcastResult(res.results.map((r: any) => ({ ch: r.channel, success: r.success })));
        } else {
          setBroadcastResult(channels.map(ch => ({ ch, success: true })));
        }
        const newMsgs: Message[] = Array.from(broadcastChs).map((ch, i) => ({
          id: `local-${Date.now()}-${i}`,
          content,
          channel: ch as ChannelId,
          author_type: 'OFFICER' as const,
          author_name: authorName,
          created_at: new Date().toISOString(),
          // Only the channels the backend actually links attachments to
          // (see /broadcast's own comment) — a WhatsApp/SMS bubble showing
          // an attachment chip would claim a delivery that never happened.
          attachments: (ch === 'email' || ch === 'inapp') ? pendingAttachments : undefined,
        }));
        setMessages(prev => [...prev, ...newMsgs]);
        setPendingAttachments([]);
      }
      setCompose('');
    } catch (err: any) {
      // Leave the draft in place on failure — clearing it here (the old
      // behaviour, regardless of success or failure) meant a failed send
      // silently discarded whatever the agent had just typed.
      showAlert(err.message || 'Could not send that.');
    } finally {
      setSending(false);
    }
    setTimeout(() => setBroadcastResult([]), 5000);
  };

  const visible = messages;

  // Broadcasting to N channels genuinely creates N support_messages rows —
  // one per channel, so each channel's own delivery status (WhatsApp sent,
  // Email failed, ...) can be tracked independently, on the backend and
  // even in this same optimistic append below. Rendering each of those rows
  // as its own bubble is what showed the same "Hellow" four times in a row:
  // real data, wrong presentation. This merges adjacent rows back into one
  // bubble per actual send when they're clearly the same broadcast — same
  // officer, same text, arriving within the same request — and shows which
  // channels it reached as a row of pills instead of repeating the bubble.
  // Never merges two customer replies or two notes that just happen to
  // share text; only an OFFICER broadcast ever fans out like this.
  const groupedVisible = useMemo(() => {
    const groups: { first: Message; channels: ChannelId[] }[] = [];
    for (const m of visible) {
      const chKey = (m.channel?.toLowerCase() || 'inapp') as ChannelId;
      const last = groups[groups.length - 1];
      const lastChKey = last ? (last.first.channel?.toLowerCase() || 'inapp') as ChannelId : null;
      const canMerge = !!last
        && m.author_type === 'OFFICER' && last.first.author_type === 'OFFICER'
        && chKey !== 'note' && lastChKey !== 'note'
        && m.content === last.first.content
        && m.author_name === last.first.author_name
        && Math.abs(new Date(m.created_at).getTime() - new Date(last.first.created_at).getTime()) < 10_000;
      if (canMerge && last) {
        if (!last.channels.includes(chKey)) last.channels.push(chKey);
      } else {
        groups.push({ first: m, channels: [chKey] });
      }
    }
    return groups;
  }, [visible]);

  const canSend = compose.trim().length > 0 && !sending;
  // Attach/Insert image are real (see support.routes.ts's /broadcast) for
  // EMAIL — a genuine MIME attachment — and IN_APP — just a row + link,
  // nothing external to fake. WhatsApp has no media-message support in
  // this integration and SMS isn't MMS, so the moment either is one of the
  // selected channels, attaching would either silently drop the file for
  // that channel or (worse) look attached on a bubble that never carried
  // it — the button stays off for the whole send rather than attach
  // "mostly".
  const canAttachToBroadcast = broadcastChs.size > 0 && Array.from(broadcastChs).every(ch => ch === 'email' || ch === 'inapp');
  const BROADCAST_ORDER: ChannelId[] = ['whatsapp', 'email', 'inapp', 'sms'];

  return (
    <div className="spt-thread">
      {/* ── Thread Header ── */}
      <div className="spt-thread-hdr">
        <div className="spt-thread-hdr-left">
          {isMobile && (
            <Tip label="Back to inbox">
              <button
                type="button"
                className="spt-bedesk-icon-btn"
                onClick={onClose}
                style={{ marginRight: 2 }}
              >
                <Icon name="arrowLeft" size={16} />
              </button>
            </Tip>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="spt-thread-customer">{ticket.customer}</span>
            <ChPill ch={channelKey(ticket.channel)} />
            <span className="spt-thread-ref">#{ticket.ref}</span>
          </div>
        </div>

        <div className="spt-thread-hdr-right">
          {/* Assignee, status, "more" actions and tags all moved into the
              always-visible Details pane (desktop) / drawer (mobile) below —
              editing them from two places at once is what this replaces.
              The one thing kept here is a way to actually *reach* that pane
              on mobile, where it's a drawer rather than a fixed 3rd column. */}
          {isMobile && (
            <Tip label="View details">
              <button type="button" className="spt-bedesk-icon-btn" onClick={onOpenDetails}>
                <Icon name="dockRight" size={16} />
              </button>
            </Tip>
          )}
        </div>
      </div>

      {/* ── Message Flow ── */}
      <div className="spt-msgs">
        <div className="spt-date-sep">
          <span>{new Date(ticket.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </div>

        {/* This only ever covers a ticket with truly zero messages (rare —
            a brand-new, unreplied ticket). It used to also be the ONLY
            place a customer's opening inquiry on any non-WhatsApp-origin
            ticket appeared at all, because createTicketRow() saved it only
            to this row's own `description` column, never as a real
            support_messages row — so the description silently disappeared
            the moment anyone replied and this condition went false. Fixed
            at the source instead of here: createTicketRow now inserts a
            real message for it (support.routes.ts), and a one-time backfill
            did the same for every ticket already affected — so this stays
            the simple, honestly-empty-thread fallback it looks like. */}
        {visible.length === 0 && (
          <div className="spt-bedesk-msg spt-bedesk-msg--customer">
            <Av name={ticket.customer} userId={ticket.customer_id} kind="customers" size={32} />
            <div className="spt-bedesk-msg-bubble-wrap">
              <div className="spt-bedesk-msg-bubble">
                {ticket.description || ticket.subject || 'No description provided.'}
              </div>
              <div className="spt-bedesk-msg-time">
                {new Date(ticket.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        )}

        {groupedVisible.map(({ first: m, channels: sentChannels }) => {
          const ch = (m.channel?.toLowerCase() || 'inapp') as ChannelId;
          const isNoteMsg = ch === 'note';
          const isOff = m.author_type === 'OFFICER';
          const mDate = new Date(m.created_at);
          const timeLbl = mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          if (isNoteMsg) {
            return (
              <div key={m.id} className="spt-bedesk-internal-note-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b', fontSize: 12, fontWeight: 800 }}>
                    <Icon name="lock" size={13} />
                    <span>Internal Note</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink3)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--ink2)' }}>{m.author_name}</span>
                    <span>{timeLbl}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
                  {m.content}
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {m.attachments.map(a => (
                      <button key={a.id} type="button"
                        onClick={() => apiDownload(`/v1/files/${a.id}/download`, a.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 'var(--r)', background: 'var(--white)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11.5, color: 'var(--ink2)' }}>
                        <Icon name={(a.mime_type || '').startsWith('image/') ? 'image' : 'paperclip'} size={12} />
                        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        {a.size != null && <span style={{ color: 'var(--ink3)' }}>({fmtAttachmentSize(a.size)})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={m.id} className={`spt-bedesk-msg ${isOff ? 'spt-bedesk-msg--officer' : 'spt-bedesk-msg--customer'}`}>
              <Av name={m.author_name} userId={m.author_id} kind={isOff ? 'people' : 'customers'} size={32} />
              <div className="spt-bedesk-msg-bubble-wrap">
                <div className="spt-bedesk-msg-bubble">
                  {m.content}
                  {isOff && <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.8, verticalAlign: 'middle' }}>✓✓</span>}
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {m.attachments.map(a => (
                      <button key={a.id} type="button"
                        onClick={() => apiDownload(`/v1/files/${a.id}/download`, a.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 'var(--r)', background: 'var(--white)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11.5, color: 'var(--ink2)' }}>
                        <Icon name={(a.mime_type || '').startsWith('image/') ? 'image' : 'paperclip'} size={12} />
                        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        {a.size != null && <span style={{ color: 'var(--ink3)' }}>({fmtAttachmentSize(a.size)})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {/* Only shows for an actual multi-channel broadcast (see
                    groupedVisible above) — a single-channel reply keeps the
                    plain timestamp-only footer it always had. */}
                {sentChannels.length > 1 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {sentChannels.map(c => <ChPill key={c} ch={c} />)}
                  </div>
                )}
                <div className="spt-bedesk-msg-time">{timeLbl}</div>
              </div>
            </div>
          );
        })}
        <div ref={msgEndRef} />
      </div>

      {/* ── Message Composer ── */}
      <div className="spt-bedesk-composer">
        {broadcastResult.length > 0 && (() => {
          const allOk = broadcastResult.every(r => r.success);
          const anyOk = broadcastResult.some(r => r.success);
          const state = allOk ? 'success' : anyOk ? 'partial' : 'fail';
          const failed = broadcastResult.filter(r => !r.success);
          return (
            // Floats above the composer instead of the old edge-to-edge
            // banner — a toast, not an inline alert row that permanently
            // shifted the toolbar down. Successful channels reuse ChPill
            // itself — same icon-only chip + hover tooltip the message
            // bubble's own channel row now shows — so this notification and
            // the bubble it's confirming read as one visual language. A
            // failed channel gets the same treatment in red rather than a
            // separate icon+text chip shape, which no longer fits ChPill's
            // icon-only sizing now that the label moved into the tooltip.
            <div key={broadcastResult.map(r => r.ch).join(',')} className="spt-broadcast-toast" data-state={state}>
              <div className="spt-broadcast-toast-icon">
                <Icon name={allOk ? 'checkCircle' : anyOk ? 'alertCircle' : 'xCircle'} size={18} strokeWidth={2} />
              </div>
              <div className="spt-broadcast-toast-body">
                <div className="spt-broadcast-toast-label">
                  {allOk ? 'Message sent' : anyOk ? 'Sent to some channels' : 'Message failed to send'}
                </div>
                <div className="spt-broadcast-toast-chips">
                  {broadcastResult.filter(r => r.success).map(r => <ChPill key={r.ch} ch={channelKey(r.ch)} />)}
                  {failed.map(r => (
                    <Tip key={r.ch} label={`${CHANNEL_CFG[channelKey(r.ch)].label} — failed to send`}>
                      <span className="spt-ch-pill-sm spt-ch-pill-sm--fail" aria-label={`${CHANNEL_CFG[channelKey(r.ch)].label} failed`}>
                        <Icon name="x" size={11} strokeWidth={2} />
                      </span>
                    </Tip>
                  ))}
                </div>
              </div>
              <div className="spt-broadcast-toast-progress" />
            </div>
          );
        })()}

        <div className="spt-bedesk-composer-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="spt-bedesk-mode-pill active"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name={isNote ? 'lock' : 'mail'} size={12} />
                  <span>{isNote ? 'Internal Note' : 'Message'}</span>
                  <Icon name="chevronDown" size={11} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setIsNote(false); if (broadcastChs.size === 0) setBroadcastChs(new Set(['inapp'])); }}>
                  <Icon name="mail" size={13} style={{ marginRight: 8 }} />
                  Message (Customer reply)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setIsNote(true); setBroadcastChs(new Set()); }}>
                  <Icon name="lock" size={13} style={{ marginRight: 8 }} />
                  Internal Note (Staff only)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!isNote && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 4, flexWrap: 'wrap' }}>
                <Tip label="All channels">
                  <button
                    type="button"
                    onClick={() => setBroadcastChs(new Set(BROADCAST_ORDER))}
                    className={`spt-bedesk-ch-chip${broadcastChs.size === BROADCAST_ORDER.length ? ' active' : ''}`}
                    aria-label="All channels"
                  >
                    <Icon name="layers" size={13} />
                  </button>
                </Tip>
                {BROADCAST_ORDER.map(ch => {
                  const active = broadcastChs.has(ch);
                  const cfg = CHANNEL_CFG[ch];
                  return (
                    <Tip key={ch} label={cfg.label}>
                      <button
                        type="button"
                        onClick={() => toggleChannel(ch)}
                        className={`spt-bedesk-ch-chip${active ? ' active' : ''}`}
                        style={active ? { color: cfg.color, borderColor: cfg.color } : undefined}
                        aria-label={cfg.label}
                      >
                        <Icon name={cfg.icon} size={13} />
                      </button>
                    </Tip>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="spt-bedesk-ta-wrap">
          {isNote && (
            <div className="spt-bedesk-note-badge-banner">
              <Icon name="lock" size={12} /> Internal Note — only visible to team members
            </div>
          )}
          <textarea
            rows={3}
            value={compose}
            onChange={e => setCompose(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isNote) { e.preventDefault(); handleSend(); } }}
            placeholder={isNote ? 'Write an internal note…' : 'Type your message response…'}
            className={`spt-bedesk-ta${isNote ? ' note' : ''}`}
          />
        </div>

        <div className="spt-bedesk-composer-ft">
          {pendingAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {pendingAttachments.map(a => (
                <span key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px 4px 9px', borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--ink2)' }}>
                  <Icon name={(a.mime_type || '').startsWith('image/') ? 'image' : 'paperclip'} size={12} />
                  <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <button type="button" onClick={() => setPendingAttachments(prev => prev.filter(x => x.id !== a.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, display: 'flex' }}>
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="spt-bedesk-toolbar-icons">
            <Popover open={showEmoji} onOpenChange={setShowEmoji}>
              <Tip label="Insert Emoji">
                <PopoverTrigger asChild>
                  <button type="button" className="spt-bedesk-tb-btn">
                    <Icon name="smile" size={15} />
                  </button>
                </PopoverTrigger>
              </Tip>
              <PopoverContent align="start" side="top" className="w-auto p-2">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4 }}>
                  {COMPOSER_EMOJIS.map(em => (
                    <button key={em} type="button" onClick={() => { setCompose(c => c + em); setShowEmoji(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}>
                      {em}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={showMacros} onOpenChange={o => { setShowMacros(o); if (o) loadMacros(); else setNewMacroOpen(false); }}>
              <Tip label="Canned responses / Macros">
                <PopoverTrigger asChild>
                  <button type="button" className="spt-bedesk-tb-btn">
                    <Icon name="cannedResponse" size={15} />
                  </button>
                </PopoverTrigger>
              </Tip>
              <PopoverContent align="start" side="top" className="w-72 p-2">
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {macros === null && <div style={{ padding: 10, fontSize: 12, color: 'var(--ink3)' }}>Loading…</div>}
                  {macros !== null && macros.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--ink3)' }}>No canned responses yet.</div>}
                  {macros?.map(m => (
                    <div key={m.id} role="button" tabIndex={0}
                      onClick={() => { setCompose(c => c ? `${c}\n${m.content}` : m.content); setShowMacros(false); }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6, cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{m.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</div>
                      </div>
                      <button type="button" title="Delete" onClick={e => deleteMacro(m.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex', flexShrink: 0 }}>
                        <Icon name="trash2" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                  {newMacroOpen ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input autoFocus value={newMacroTitle} onChange={e => setNewMacroTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveMacro(); if (e.key === 'Escape') setNewMacroOpen(false); }}
                        placeholder="Macro title…" style={{ flex: 1, fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', color: 'var(--ink)' }} />
                      <button type="button" onClick={saveMacro} disabled={!newMacroTitle.trim() || !compose.trim()} className="btn btn-primary btn-sm">Save</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setNewMacroOpen(true)} disabled={!compose.trim()}
                      title={compose.trim() ? 'Save the current message as a new canned response' : 'Type a message first'}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: compose.trim() ? 'var(--teal)' : 'var(--ink3)', fontWeight: 600, fontSize: 12, cursor: compose.trim() ? 'pointer' : 'default', padding: '6px 8px' }}>
                      <Icon name="plus" size={13} /> Save current message as macro
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleAttach(e.target.files)} />
            <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={e => handleAttach(e.target.files)} />
            {(() => {
              const canAttach = isNote || canAttachToBroadcast;
              const label = isNote
                ? 'Attach file'
                : canAttachToBroadcast
                  ? 'Attach file'
                  : 'Attach file (only Email and the in-app channel can deliver one — switch off WhatsApp/SMS to attach)';
              const imgLabel = isNote
                ? 'Insert image'
                : canAttachToBroadcast
                  ? 'Insert image'
                  : 'Insert image (only Email and the in-app channel can deliver one — switch off WhatsApp/SMS to attach)';
              return (
                <>
                  <Tip label={label}>
                    <button type="button" className="spt-bedesk-tb-btn" disabled={!canAttach || uploadingAttachment} onClick={() => fileInputRef.current?.click()} style={!canAttach ? { opacity: 0.4, cursor: 'default' } : undefined}>
                      <Icon name="paperclip" size={15} />
                    </button>
                  </Tip>
                  <Tip label={imgLabel}>
                    <button type="button" className="spt-bedesk-tb-btn" disabled={!canAttach || uploadingAttachment} onClick={() => imageInputRef.current?.click()} style={!canAttach ? { opacity: 0.4, cursor: 'default' } : undefined}>
                      <Icon name="image" size={15} />
                    </button>
                  </Tip>
                </>
              );
            })()}
            <Tip label="Hudumika AI">
              <button
                type="button"
                className="spt-bedesk-tb-btn"
                onClick={() => { if (aiSuggestionToUse) setCompose(aiSuggestionToUse); }}
                style={{ color: 'var(--teal)' }}
              >
                <Icon name="sparkle" size={15} />
              </button>
            </Tip>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={`spt-bedesk-send-btn${canSend ? ' ready' : ''}${isNote ? ' note' : ''}`}
            >
              <span>{sending ? 'Sending…' : isNote ? 'Save note' : 'Send reply'}</span>
              {!isNote && <Icon name="chevronDown" size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   COL 4 — Details Panel (Contact Profile & Attributes)
══════════════════════════════════════════ */
function DetailsAccordion({ title, defaultOpen = true, headerAction, children }: { title: string; defaultOpen?: boolean; headerAction?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="spt-bedesk-accordion">
      {/* A <button> can't host another <button> (headerAction, when it's an
          edit icon) without invalid/nested-interactive-control markup, so
          this is a div with the same className/click-to-toggle behavior —
          headerAction's own wrapper stops the click from bubbling up to it,
          the same way the row's other click targets (Select triggers, tag
          removal) already have to. */}
      <div className="spt-bedesk-accordion-hdr" onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}>
        <span style={{ flex: 1 }}>{title}</span>
        {headerAction && (
          <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
            {headerAction}
          </span>
        )}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13} strokeWidth={2} />
      </div>
      {open && <div className="spt-bedesk-accordion-body">{children}</div>}
    </div>
  );
}

/** Every other open (or historical) ticket this same customer has raised,
 *  regardless of which app or channel created it — Support Center is meant
 *  to be the one place all of them get solved, so an agent working one
 *  ticket should immediately see the others. Real data: GET
 *  /v1/support/tickets already joins customers and supports ?customer_id=
 *  for exactly this. */
function RelatedTickets({ ticket }: { ticket: Ticket }) {
  const [related, setRelated] = useState<Ticket[] | null>(null);

  useEffect(() => {
    if (!ticket.customer_id) { setRelated([]); return; }
    let cancelled = false;
    setRelated(null);
    apiFetch(`/v1/support/tickets?customer_id=${ticket.customer_id}`)
      .then((res: any) => {
        if (cancelled) return;
        const all: Ticket[] = Array.isArray(res) ? res : (res?.data ?? []);
        setRelated(all.filter(t => t.id !== ticket.id));
      })
      .catch(() => { if (!cancelled) setRelated([]); });
    return () => { cancelled = true; };
  }, [ticket.customer_id, ticket.id]);

  if (!ticket.customer_id) return null;

  return (
    <DetailsAccordion title="Other tickets from this customer">
      {related === null ? (
        <div style={{ padding: '4px 0', fontSize: 12, color: 'var(--ink3)' }}>Loading…</div>
      ) : related.length === 0 ? (
        <div style={{ padding: '4px 0', fontSize: 12, color: 'var(--ink3)' }}>No other tickets from this customer yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {related.map(r => {
            const origin = ticketOrigin(r);
            const variant = r.status === 'OPEN' ? 'brand' : r.status === 'IN_PROGRESS' ? 'warning' : r.status === 'RESOLVED' ? 'success' : 'gray';
            return (
              <Link
                key={r.id}
                to={`/bliss/inbox?id=${r.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '8px 10px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</span>
                  <Badge variant={variant}>{STATUS_CFG[r.status]?.label ?? 'Open'}</Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 11, color: 'var(--ink3)' }}>
                  <Icon name={origin.icon} size={11} strokeWidth={1.75} />
                  <span>{origin.label} · {relTime(r.updated_at || r.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DetailsAccordion>
  );
}

/** Backing the Conversation Attributes panel's "Edit" button — subject,
 *  category and priority, the three fields set at ticket-creation time that
 *  previously had no update path anywhere in the app (see
 *  support.routes.ts PATCH /tickets/:id/attributes). Status/assignee are
 *  edited inline elsewhere on this same page and aren't duplicated here. */
function EditAttributesDialog({ open, onClose, ticket, onSave }: {
  open: boolean; onClose: () => void; ticket: Ticket;
  onSave: (id: string, attrs: { subject?: string; category?: string; priority?: PriorityKey }) => Promise<void>;
}) {
  const [subject, setSubject] = useState(ticket.subject);
  const [category, setCategory] = useState(ticket.category);
  const [priority, setPriority] = useState<PriorityKey>(ticket.priority);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSubject(ticket.subject);
      setCategory(ticket.category);
      setPriority(ticket.priority);
      setError('');
    }
  }, [open, ticket.subject, ticket.category, ticket.priority]);

  async function handleSave() {
    if (!subject.trim()) { setError('Subject cannot be empty.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(ticket.id, { subject: subject.trim(), category, priority });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-105 max-w-full p-0 gap-0">
        <DialogHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
          <DialogTitle style={{ fontSize: 15 }}>Edit conversation attributes</DialogTitle>
        </DialogHeader>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Subject</label>
            <input
              className="input-field"
              value={subject}
              onChange={e => { setSubject(e.target.value); if (error) setError(''); }}
              maxLength={300}
              style={error ? { borderColor: 'var(--red)' } : undefined}
              aria-invalid={!!error}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Priority</label>
            <Select value={priority === 'NORMAL' ? 'MEDIUM' : priority} onValueChange={v => setPriority(v as PriorityKey)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </div>
        <DialogFooter style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsPanel({ ticket, agents, onReassign, onStatusChange, onUpdateTags, onUpdateAttributes, groups, onUpdateGroup, onClose }: {
  ticket: Ticket; agents: { id: string; name: string }[]; onReassign: (id: string, assigneeId: string) => void;
  onStatusChange: (id: string, s: StatusKey) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onUpdateAttributes: (id: string, attrs: { subject?: string; category?: string; priority?: PriorityKey }) => Promise<void>;
  groups: SupportGroup[];
  onUpdateGroup: (id: string, groupId: string | null) => void;
  onClose?: () => void;
}) {
  const { user } = useAuth();
  // Assignee/status/group are day-to-day ticket-ops actions — gated to real
  // working staff (OPS_ROLES: SENIOR/JUNIOR/OFFICER and up), not blanket-open
  // to whoever can merely load this page. Tags stay ungated below; they're
  // not a workflow-control field the way ownership/state/queue are.
  const canEdit = OPS_ROLES.includes(user?.role as any);
  const [editOpen, setEditOpen] = useState(false);
  const [showComplyModal, setShowComplyModal] = useState(false);
  const currentAssigneeId = agents.find(a => a.name === ticket.assigned_to)?.id ?? '__unassigned__';
  const currentGroupId = ticket.group_id ?? '__none__';
  // Derived straight from the real ticket, not local state — this editor
  // used to only ever call setState, so every tag an agent added vanished
  // on the next load having never reached the database (see PATCH
  // /tickets/:id/tags). Deriving from the prop keeps it honestly in sync
  // with what's actually saved.
  const tags = ticket.tags ?? [];
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        onUpdateTags(ticket.id, [...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (t: string) => {
    onUpdateTags(ticket.id, tags.filter(item => item !== t));
  };

  return (
    <div className="spt-bedesk-details">
      <div className="spt-bedesk-details-hdr">
        <span className="spt-bedesk-details-title">Details</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <DropdownMenu>
            <Tip label="More options">
              <DropdownMenuTrigger asChild>
                <button type="button" className="spt-bedesk-icon-btn">
                  <Icon name="moreVertical" size={16} />
                </button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowComplyModal(true)}>
                <Icon name="shield" size={13} style={{ marginRight: 8 }} />
                Send to ComplyOS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(ticket.ref)}>
                <Icon name="copy" size={13} style={{ marginRight: 8 }} />
                Copy Reference
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onClose && (
            <Tip label="Close details">
              <button type="button" className="spt-bedesk-icon-btn" onClick={onClose}>
                <Icon name="dockRight" size={15} />
              </button>
            </Tip>
          )}
        </div>
      </div>
      <div className="spt-details-scroll">
        {/* Profile Card */}
        <div className="spt-bedesk-profile-card">
          <div className="spt-bedesk-profile-av-wrap">
            <Av name={ticket.customer} userId={ticket.customer_id} kind="customers" size={48} />
          </div>
          <div className="spt-bedesk-profile-info">
            <div className="spt-bedesk-profile-name">{ticket.customer}</div>
            <div className="spt-bedesk-profile-sub">
              {ticket.customer_company || ticket.customer_email || ticket.customer_phone || 'gb, London'}
            </div>
            <div className="spt-bedesk-profile-time">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} local time
            </div>
          </div>
        </div>

        {/* Quick Selectors: Assignee, Status, Group, Tags — Assignee/Status/
            Group are real workflow-control actions (who owns this, what
            state it's in, which queue), so they render read-only for anyone
            below OPS_ROLES rather than an editable Select they could act on
            without the access to actually own the outcome. Tags stay open
            to anyone below — labeling a conversation isn't a control action
            the way reassigning or closing it is. */}
        <div className="spt-bedesk-quick-attrs">
          <div className="spt-bedesk-attr-row">
            <span className="spt-bedesk-attr-lbl">Assignee</span>
            <div className="spt-bedesk-attr-val">
              {canEdit ? (
                <Select value={currentAssigneeId} onValueChange={v => v !== '__unassigned__' && onReassign(ticket.id, v)}>
                  <SelectTrigger className="spt-bedesk-val-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="paw" size={13} /> Unassigned
                      </span>
                    </SelectItem>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Av name={a.name} userId={a.id} kind="people" size={16} /> {a.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="spt-bedesk-readonly-val">
                  {ticket.assigned_to ? <><Av name={ticket.assigned_to} userId={ticket.assigned_to_id} kind="people" size={16} /> {ticket.assigned_to}</> : <><Icon name="paw" size={13} /> Unassigned</>}
                </span>
              )}
            </div>
          </div>

          <div className="spt-bedesk-attr-row">
            <span className="spt-bedesk-attr-lbl">Status</span>
            <div className="spt-bedesk-attr-val">
              {canEdit ? (
                <Select value={ticket.status} onValueChange={v => onStatusChange(ticket.id, v as StatusKey)}>
                  <SelectTrigger className={`spt-status-select spt-status-select--${ticket.status.toLowerCase().replace('_', '-')}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CFG) as StatusKey[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="spt-bedesk-readonly-val">
                  <Badge style={{ background: STATUS_CFG[ticket.status]?.bg, color: STATUS_CFG[ticket.status]?.color }}>
                    {STATUS_CFG[ticket.status]?.label || ticket.status}
                  </Badge>
                </span>
              )}
            </div>
          </div>

          <div className="spt-bedesk-attr-row">
            <span className="spt-bedesk-attr-lbl">Group</span>
            <div className="spt-bedesk-attr-val">
              {canEdit ? (
                <Select value={currentGroupId} onValueChange={v => onUpdateGroup(ticket.id, v === '__none__' ? null : v)}>
                  <SelectTrigger className="spt-bedesk-val-select">
                    <SelectValue>
                      <span className="spt-bedesk-group-pill">
                        <span className="spt-bedesk-group-dot" style={{ background: ticket.group_color || '#06b6d4' }} />
                        <span>{ticket.group_name || 'General'}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} /> General
                      </span>
                    </SelectItem>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color || '#06b6d4' }} /> {g.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="spt-bedesk-readonly-val">
                  <span className="spt-bedesk-group-pill">
                    <span className="spt-bedesk-group-dot" style={{ background: ticket.group_color || '#06b6d4' }} />
                    <span>{ticket.group_name || 'General'}</span>
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="spt-bedesk-tags-block">
            <div className="spt-bedesk-tags-wrap">
              {tags.map(t => (
                <span key={t} className="spt-bedesk-tag-chip">
                  <span>{t}</span>
                  <button type="button" onClick={() => removeTag(t)}>
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="+ add tag…"
              className="spt-bedesk-tag-input"
            />
          </div>
        </div>

        {/* 1. Conversation Attributes Accordion */}
        <DetailsAccordion
          title="Conversation attributes"
          headerAction={canEdit && (
            <Tip label="Edit subject, category & priority">
              <button type="button" onClick={() => setEditOpen(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, marginRight: 2 }}>
                <Icon name="edit" size={13} />
              </button>
            </Tip>
          )}
        >
          <div className="spt-bedesk-kv-grid">
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Type:</span>
              <span className="spt-bedesk-v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="chatBubble" size={12} />
                <span>Chat</span>
              </span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">ID:</span>
              <span className="spt-bedesk-v spt-mono">{ticket.ref}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Started:</span>
              <span className="spt-bedesk-v">{relTime(ticket.created_at)}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Last activity:</span>
              <span className="spt-bedesk-v">{relTime(ticket.updated_at || ticket.created_at)}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Channel:</span>
              <span className="spt-bedesk-v">
                <Icon name={ticketOrigin(ticket).icon} size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                {ticketOrigin(ticket).label}
              </span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Category:</span>
              <span className="spt-bedesk-v">{ticket.category}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Priority:</span>
              <span className="spt-bedesk-v"><PBadge p={ticket.priority} /></span>
            </div>
          </div>
        </DetailsAccordion>

        <EditAttributesDialog open={editOpen} onClose={() => setEditOpen(false)} ticket={ticket} onSave={onUpdateAttributes} />
        {showComplyModal && (
          <SendToComplyOSModal ticket={ticket} onClose={() => setShowComplyModal(false)} />
        )}

        {/* 2. Other tickets from this customer — real, cross-app: whatever
            app raised them (SEAL, ClearOS, Workflow Studio, Onsite, or
            straight in Bliss), this is the one place they all surface, via
            the same ?customer_id= filter GET /v1/support/tickets already
            supports. This used to be a "Recent conversations" accordion
            showing the same hardcoded "Hi, I have a question..." text on
            every ticket — this is its real replacement, not a deletion. */}
        <RelatedTickets ticket={ticket} />

        {/* 3. Technology — the requester's real IP/User-Agent, captured at
            ticket-creation time (see migration 407 and createTicketRow).
            Only present for tickets raised through a live HTTP request —
            automation-raised tickets (SEAL/ClearOS/Studio) have no browser
            at all, and say so honestly instead of showing a fingerprint
            that was never real. */}
        <DetailsAccordion title="Technology">
          {ticket.origin_ip || ticket.origin_user_agent ? (
            <div className="spt-bedesk-kv-grid">
              {ticket.origin_ip && (
                <div className="spt-bedesk-kv-row">
                  <span className="spt-bedesk-k">IP address:</span>
                  <span className="spt-bedesk-v spt-mono">{ticket.origin_ip}</span>
                </div>
              )}
              {ticket.origin_user_agent && (() => {
                const { browser, os, device } = parseUserAgent(ticket.origin_user_agent);
                const isApple = os.toLowerCase().includes('ios') || os.toLowerCase().includes('mac');
                const isWindows = os.toLowerCase().includes('win');
                const isAndroid = os.toLowerCase().includes('android');
                const osIcon = isApple ? 'apple' : isWindows ? 'windows' : isAndroid ? 'android' : 'monitor';
                return (
                  <>
                    <div className="spt-bedesk-kv-row">
                      <span className="spt-bedesk-k">Platform:</span>
                      <span className="spt-bedesk-v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={osIcon} size={12} />
                        <span>{os}</span>
                      </span>
                    </div>
                    <div className="spt-bedesk-kv-row">
                      <span className="spt-bedesk-k">Browser:</span>
                      <span className="spt-bedesk-v">{browser}</span>
                    </div>
                    <div className="spt-bedesk-kv-row">
                      <span className="spt-bedesk-k">Device:</span>
                      <span className="spt-bedesk-v">{device}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div style={{ padding: '4px 0', fontSize: 12, color: 'var(--ink3)' }}>
              {(ticket.channel || '').toUpperCase() === 'SYSTEM'
                ? 'Not applicable — raised automatically, no browser involved.'
                : 'No device information captured for this ticket.'}
            </div>
          )}
        </DetailsAccordion>

        {/* Related Shipments */}
        {(ticket.related_shipments?.length ?? 0) > 0 && (
          <DetailsAccordion title="Related shipments">
            {ticket.related_shipments!.map(ref => (
              <Link key={ref} className="spt-shipment-btn" to={`/shipments?search=${ref}`}>
                <Icon name="package" size={12} strokeWidth={1.75} />
                <span className="spt-mono">{ref}</span>
                <Icon name="externalLink" size={11} strokeWidth={1.75} />
              </Link>
            ))}
          </DetailsAccordion>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main Support Component
══════════════════════════════════════════ */
export const Support: React.FC<{
  initialChannelFilter?: 'all' | ChannelId; queueMode?: boolean;
  viewMode?: ViewMode; onViewModeChange?: (v: ViewMode) => void;
}> = ({ initialChannelFilter, queueMode, viewMode: viewModeProp, onViewModeChange }) => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const [aiSuggestionToUse, setAiSuggestionToUse] = useState('');
  const [custMap, setCustMap] = useState<Map<string, SysCustomer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({ subject: '', customer: '', customer_id: '', category: '', priority: 'MEDIUM', description: '' });
  const [groups, setGroups] = useState<SupportGroup[]>([]);
  const [views, setViews] = useState<SupportView[]>([]);

  const loadGroups = useCallback(() => {
    apiFetch('/v1/support/groups').then((r: any) => setGroups(r || [])).catch(() => { });
  }, []);
  const loadViews = useCallback(() => {
    apiFetch('/v1/support/views').then((r: any) => setViews(r || [])).catch(() => { });
  }, []);
  useEffect(() => { loadGroups(); loadViews(); }, [loadGroups, loadViews]);

  const createGroup = useCallback(async (name: string) => {
    try { await apiFetch('/v1/support/groups', { method: 'POST', body: JSON.stringify({ name }) }); loadGroups(); }
    catch (err: any) { showAlert(err.message || 'Could not create that group.'); }
  }, [loadGroups]);
  const createView = useCallback(async (name: string, filters: Record<string, any>) => {
    try { await apiFetch('/v1/support/views', { method: 'POST', body: JSON.stringify({ name, filters }) }); loadViews(); }
    catch (err: any) { showAlert(err.message || 'Could not create that view.'); }
  }, [loadViews]);
  const deleteView = useCallback(async (id: string) => {
    try { await apiFetch(`/v1/support/views/${id}`, { method: 'DELETE' }); loadViews(); }
    catch (err: any) { showAlert(err.message || 'Could not delete that view.'); }
  }, [loadViews]);

  useEffect(() => {
    apiFetch('/v1/customers')
      .then((r: any) => {
        const list: SysCustomer[] = r.data ?? r ?? [];
        const m = new Map<string, SysCustomer>();
        list.forEach(c => { m.set(c.id, c); m.set(c.name.toLowerCase(), c); });
        setCustMap(m);
      })
      .catch(() => { });
  }, []);

  // This used to paper over any blank field on a real ticket with specific,
  // realistic-looking fabricated content — a subject ("Website slow loading
  // times issue"), a description and customer name (SEAL/Kilimanjaro
  // Builders, copied from one real automation-raised ticket seen once
  // during testing), an assignee ("Asha Mwinyi"), and default tags/group.
  // A ticket missing one of these fields now shows an honest empty value —
  // every other cell already renders those correctly ("Unassigned", no tag
  // pills, etc.) — rather than a fake value indistinguishable from real data.
  const buildTickets = useCallback((data: any[]): Ticket[] => {
    return data.map((s: any) => ({
      id: s.id,
      ref: s.ref || s.ref_number || `TKT-${s.id?.slice(0, 4)}`,
      subject: s.subject || '(No subject)',
      description: s.description ?? undefined,
      customer: s.customer ?? 'Unknown customer',
      customer_id: s.customer_id,
      customer_email: s.customer_email,
      customer_phone: s.customer_phone,
      customer_company: s.customer_company,
      category: s.category || 'General Query',
      status: (s.status as StatusKey) || 'OPEN',
      priority: (s.priority as PriorityKey) || 'NORMAL',
      assigned_to: s.assigned_to || undefined,
      created_at: s.created_at || new Date().toISOString(),
      updated_at: s.updated_at || s.created_at || new Date().toISOString(),
      message_count: s.message_count || 0,
      tags: s.tags ?? [],
      group_id: s.group_id ?? null,
      group_name: s.group_name ?? null,
      group_color: s.group_color ?? null,
      source_app: s.source_app ?? null,
      sla_deadline: s.sla_deadline ?? null,
      channel: s.channel ?? 'IN_APP',
    }));
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshTickets = useCallback(() => {
    return apiFetch('/v1/support/tickets')
      .then((r: any) => {
        const data = r.data ?? r ?? [];
        setTickets(Array.isArray(data) ? buildTickets(data) : []);
        setLoadError(null);
      })
      .catch((err: any) => {
        setTickets([]);
        setLoadError(err?.message || 'Could not load tickets');
      })
      .finally(() => setLoading(false));
  }, [buildTickets]);

  useEffect(() => { refreshTickets(); }, [refreshTickets]);

  const [feedbackTicketId, setFeedbackTicketId] = useState<string | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const openTicket = (t: Ticket) => {
    setAiSuggestionToUse('');
    setDetailsOpen(false);

    setSelected({ ...t, messages: [] });
    apiFetch(`/v1/support/tickets/${t.id}`)
      .then((res: any) => {
        if (res) {
          setSelected(prev => prev?.id === t.id ? { ...prev, messages: res.messages, origin_ip: res.origin_ip, origin_user_agent: res.origin_user_agent } : prev);
        }
      })
      .catch(() => { });
  };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || tickets.length === 0) return;
    const match = tickets.find(t => t.id === id);
    if (match) openTicket(match);
    setSearchParams(prev => { prev.delete('id'); return prev; }, { replace: true });
  }, [searchParams, tickets]);

  useWebSocket((event) => {
    if (event.type !== 'support.message_received') return;
    refreshTickets();
    setSelected(prev => {
      if (!prev || prev.id !== event.ticketId) return prev;
      apiFetch(`/v1/support/tickets/${event.ticketId}`)
        .then((res: any) => {
          if (res) setSelected(cur => cur?.id === event.ticketId ? { ...cur, messages: res.messages } : cur);
        })
        .catch(() => { });
      return prev;
    });
  });

  const updateStatus = async (id: string, status: StatusKey) => {
    if (status === 'RESOLVED' || status === 'CLOSED') {
      setFeedbackTicketId(id);
    } else {
      try {
        await apiFetch(`/v1/support/tickets/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
      } catch (err: any) {
        // Applying the new status locally regardless of whether the PATCH
        // actually succeeded (the old behaviour) left the UI showing a
        // status the database never had — a real desync, not a cosmetic one,
        // since the next full reload would silently snap it back.
        showAlert(err.message || 'Could not update this ticket\'s status.');
        return;
      }
      setTickets(ts => ts.map(t => t.id === id ? { ...t, status } : t));
      setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
    }
  };

  // No fabricated fallback roster — assigning a ticket to a fake agent id
  // (e.g. 'admin-3') would silently write a broken reference into
  // assigned_to. An empty/failed load just means the Assignee dropdown
  // offers "Unassigned" only, which is the honest state.
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    apiFetch('/v1/support/agents')
      .then((r: any) => setAgents(Array.isArray(r) ? r : []))
      .catch(() => setAgents([]));
  }, []);

  const reassignTicket = async (id: string, assigneeId: string) => {
    const current = tickets.find(t => t.id === id);
    if (!current) return;
    const agentName = agents.find(a => a.id === assigneeId)?.name;
    try {
      await apiFetch(`/v1/support/tickets/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: current.status, assigned_to: assigneeId }),
      });
    } catch (err: any) { showAlert(err.message || 'Could not reassign this ticket.'); return; }
    setTickets(ts => ts.map(t => t.id === id ? { ...t, assigned_to: agentName } : t));
    setSelected(prev => prev?.id === id ? { ...prev, assigned_to: agentName } : prev);
  };

  const updateTicketTags = async (id: string, tags: string[]) => {
    try {
      await apiFetch(`/v1/support/tickets/${id}/tags`, { method: 'PATCH', body: JSON.stringify({ tags }) });
    } catch (err: any) { showAlert(err.message || 'Could not update tags.'); return; }
    setTickets(ts => ts.map(t => t.id === id ? { ...t, tags } : t));
    setSelected(prev => prev?.id === id ? { ...prev, tags } : prev);
  };

  // Category/priority/subject — previously nowhere to save this, see
  // support.routes.ts PATCH /tickets/:id/attributes.
  const updateTicketAttributes = async (id: string, attrs: { subject?: string; category?: string; priority?: PriorityKey }) => {
    await apiFetch(`/v1/support/tickets/${id}/attributes`, { method: 'PATCH', body: JSON.stringify(attrs) });
    setTickets(ts => ts.map(t => t.id === id ? { ...t, ...attrs } : t));
    setSelected(prev => prev?.id === id ? { ...prev, ...attrs } : prev);
  };

  // Group had a real backend endpoint (PATCH /tickets/:id/group) with no
  // frontend caller anywhere — the Details panel showed it as a read-only
  // pill next to an Assignee row that was already a real, editable Select.
  const updateTicketGroup = async (id: string, groupId: string | null) => {
    try {
      await apiFetch(`/v1/support/tickets/${id}/group`, { method: 'PATCH', body: JSON.stringify({ group_id: groupId }) });
    } catch (err: any) { showAlert(err.message || 'Could not update this ticket\'s group.'); return; }
    const g = groupId ? groups.find(x => x.id === groupId) : null;
    const patch = { group_id: groupId, group_name: g?.name ?? null, group_color: g?.color ?? null };
    setTickets(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    setSelected(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  };

  // Bulk versions for ConvList's own selection bar — loop the same
  // per-ticket endpoints rather than a new bulk API. Deliberately call
  // apiFetch directly instead of reassignTicket/updateTicketGroup/
  // updateStatus: those already show their own alert (and, for status,
  // updateStatus special-cases RESOLVED/CLOSED into opening the single-
  // ticket NPS/CSAT modal, which makes no sense fired N times over a bulk
  // selection) — running them under Promise.allSettled would both
  // double-alert on failure and hide real per-item failures behind their
  // own internal catch. One combined success/failure summary here instead,
  // then a single refreshTickets() to resync whatever actually changed.
  async function bulkApply(ids: string[], run: (id: string) => Promise<unknown>, verb: string) {
    const results = await Promise.allSettled(ids.map(run));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) showAlert(`${verb}: ${ids.length - failed} of ${ids.length} succeeded, ${failed} failed.`);
    refreshTickets();
  }
  const bulkUpdateStatus = (ids: string[], status: StatusKey) =>
    bulkApply(ids, id => apiFetch(`/v1/support/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }), 'Bulk status update');
  const bulkReassign = (ids: string[], assigneeId: string) =>
    bulkApply(ids, id => apiFetch(`/v1/support/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: tickets.find(t => t.id === id)?.status ?? 'OPEN', assigned_to: assigneeId }) }), 'Bulk assign');
  const bulkUpdateGroup = (ids: string[], groupId: string | null) =>
    bulkApply(ids, id => apiFetch(`/v1/support/tickets/${id}/group`, { method: 'PATCH', body: JSON.stringify({ group_id: groupId }) }), 'Bulk group update');

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackTicketId || npsScore === null || csatScore === null || submittingFeedback) return;
    setSubmittingFeedback(true);
    try {
      await apiFetch(`/v1/support/tickets/${feedbackTicketId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({
          nps_score: npsScore,
          csat_score: csatScore,
          feedback_text: feedbackText,
        }),
      });

      setTickets(ts => ts.map(t => t.id === feedbackTicketId ? { ...t, status: 'CLOSED' } : t));
      setSelected(prev => prev?.id === feedbackTicketId ? { ...prev, status: 'CLOSED' } : prev);

      setFeedbackTicketId(null);
      setNpsScore(null);
      setCsatScore(null);
      setFeedbackText('');
    } catch (err: any) {
      // This modal is deliberately non-dismissible (see its own comment
      // below) — a console-only failure used to leave an agent staring at
      // an unresponsive Submit button with no idea why.
      showAlert(err.message || 'Could not submit this feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleCancelFeedback = async () => {
    if (!feedbackTicketId) return;
    try {
      await apiFetch(`/v1/support/tickets/${feedbackTicketId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setTickets(ts => ts.map(t => t.id === feedbackTicketId ? { ...t, status: 'CLOSED' } : t));
      setSelected(prev => prev?.id === feedbackTicketId ? { ...prev, status: 'CLOSED' } : prev);
    } catch (err: any) {
      // Used to close the modal regardless — the ticket stayed OPEN/
      // IN_PROGRESS in the database while the UI acted as if "Skip &
      // Resolve" had worked.
      showAlert(err.message || 'Could not close this ticket. Please try again.');
      return;
    }
    setFeedbackTicketId(null);
  };

  const [creating, setCreating] = useState(false);
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res: any = await apiFetch('/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: newForm.customer_id || undefined,
          subject: newForm.subject,
          description: newForm.description,
          channel: 'IN_APP',
          priority: newForm.priority,
          category: newForm.category || 'General Query',
        })
      });
      // POST returns the raw support_tickets row (no customer join), so the
      // display name comes from what the agent actually typed — real data
      // from the create form, not a fabricated default like buildTickets'
      // own fallback would otherwise substitute for a still-empty response.
      const [created] = buildTickets([{ ...res, customer: newForm.customer, messages: [] }]);
      setTickets(prev => [created, ...prev]);
      setShowCreate(false);
      setNewForm({ subject: '', customer: '', customer_id: '', category: '', priority: 'MEDIUM', description: '' });
    } catch (err: any) {
      showAlert(err?.message || 'Could not create this ticket — please try again.');
    } finally {
      setCreating(false);
    }
  };

  const [localViewMode, setLocalViewMode] = useState<ViewMode>(() => (localStorage.getItem('bliss_tix_view') as ViewMode) || 'chat');
  const viewMode = viewModeProp ?? localViewMode;
  const setViewMode = (v: ViewMode) => {
    localStorage.setItem('bliss_tix_view', v);
    setLocalViewMode(v);
    onViewModeChange?.(v);
  };
  const custNames = Array.from(new Set(tickets.map(t => t.customer))).sort();

  if (loading) return (
    <div className="spt-shell spt-shell--loading"><PageLoading /></div>
  );

  return (
    <div className={`spt-shell ${selected ? 'spt-shell--has-selection' : ''}`}>
      {loadError && (
        <div style={{ padding: '10px 16px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alertTriangle" size={16} />
          Couldn't load tickets from the server: {loadError}
        </div>
      )}

      {isDesktop ? (
        <PanelGroup direction="horizontal" className="spt-shell-panels">
          <ConvList
            tickets={tickets} selected={selected}
            onSelect={(t) => { openTicket(t); if (viewMode === 'table') setViewMode('chat'); }}
            onNew={() => setShowCreate(true)}
            groups={groups} views={views}
            onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
            isDesktop={true}
            initialChannelFilter={initialChannelFilter} queueMode={queueMode}
            agents={agents}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onBulkStatus={bulkUpdateStatus} onBulkAssign={bulkReassign} onBulkGroup={bulkUpdateGroup}
          />

          {viewMode === 'chat' && (
            <>
              <PanelResizeHandle className="spt-resize-handle" />

              <Panel minSize={32} className="spt-thread-panel">
                {selected ? (
                  <ThreadPanel ticket={selected}
                    authorName={user?.name || 'Support Agent'} onClose={() => setSelected(null)}
                    onOpenDetails={() => setDetailsOpen(o => !o)}
                    aiSuggestionToUse={aiSuggestionToUse} />
                ) : (
                  <div className="spt-thread" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <Icon name="inbox" size={48} strokeWidth={1} color="var(--border)" />
                      <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>No conversation selected</div>
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink3)' }}>Select a conversation from the left to view details and reply.</div>
                    </div>
                  </div>
                )}
              </Panel>

              {selected && (
                <>
                  <PanelResizeHandle className="spt-resize-handle" />
                  <Panel defaultSize={26} minSize={20} maxSize={38} className="spt-details-panel">
                    <div className="spt-rcol" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <DetailsPanel ticket={selected} agents={agents} onReassign={reassignTicket} onStatusChange={updateStatus} onUpdateTags={updateTicketTags} onUpdateAttributes={updateTicketAttributes} groups={groups} onUpdateGroup={updateTicketGroup} onClose={() => setSelected(null)} />
                    </div>
                  </Panel>
                </>
              )}
            </>
          )}
        </PanelGroup>
      ) : (
        <>
          {viewMode === 'table' ? (
            <ConvList
              tickets={tickets} selected={selected}
              onSelect={(t) => { openTicket(t); setViewMode('chat'); }} onNew={() => setShowCreate(true)}
              groups={groups} views={views}
              onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
              initialChannelFilter={initialChannelFilter} queueMode={queueMode}
              agents={agents}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBulkStatus={bulkUpdateStatus} onBulkAssign={bulkReassign} onBulkGroup={bulkUpdateGroup}
            />
          ) : !selected ? (
            <ConvList
              tickets={tickets} selected={selected}
              onSelect={openTicket} onNew={() => setShowCreate(true)}
              groups={groups} views={views}
              onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
              initialChannelFilter={initialChannelFilter} queueMode={queueMode}
              agents={agents}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBulkStatus={bulkUpdateStatus} onBulkAssign={bulkReassign} onBulkGroup={bulkUpdateGroup}
            />
          ) : (
            <ThreadPanel ticket={selected}
              authorName={user?.name || 'Support Agent'} onClose={() => setSelected(null)}
              onOpenDetails={() => setDetailsOpen(true)}
              aiSuggestionToUse={aiSuggestionToUse} />
          )}
          {selected && detailsOpen && createPortal(
            <>
              <div className="spt-details-backdrop" onClick={() => setDetailsOpen(false)} />
              <div className="spt-details-drawer">
                <Tip label="Close">
                  <button type="button" className="spt-icon-btn spt-details-drawer-close" onClick={() => setDetailsOpen(false)}>
                    <Icon name="x" size={16} strokeWidth={2} />
                  </button>
                </Tip>
                <DetailsPanel ticket={selected} agents={agents} onReassign={reassignTicket} onStatusChange={updateStatus} onUpdateTags={updateTicketTags} onUpdateAttributes={updateTicketAttributes} groups={groups} onUpdateGroup={updateTicketGroup} onClose={() => setDetailsOpen(false)} />
              </div>
            </>,
            document.body
          )}
        </>
      )}

      {/* New ticket modal */}
      {showCreate && (
        <Dialog open onOpenChange={o => { if (!o) setShowCreate(false); }}>
          <DialogContent className="spt-modal">
            <DialogHeader className="spt-modal-hdr">
              <DialogTitle className="spt-modal-title">New Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="spt-modal-form">
              <div className="spt-modal-field">
                <label className="spt-modal-label">Subject *</label>
                <input required className="spt-modal-input" value={newForm.subject}
                  onChange={e => setNewForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief summary of the issue" />
              </div>
              <div className="spt-modal-grid">
                <div className="spt-modal-field">
                  <label className="spt-modal-label">Customer *</label>
                  <input required list="cust-list" className="spt-modal-input" value={newForm.customer}
                    onChange={e => { const v = e.target.value; const m = custMap.get(v.toLowerCase()); setNewForm(p => ({ ...p, customer: v, customer_id: m?.id || '' })); }}
                    placeholder="Customer name" />
                  <datalist id="cust-list">{custNames.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="spt-modal-field">
                  <label className="spt-modal-label">Priority</label>
                  <Select value={newForm.priority} onValueChange={v => setNewForm(p => ({ ...p, priority: v }))}>
                    <SelectTrigger aria-label="Priority" className="spt-modal-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="spt-modal-field">
                <label className="spt-modal-label">Category</label>
                <Select value={newForm.category || '__none__'} onValueChange={v => setNewForm(p => ({ ...p, category: v === '__none__' ? '' : v }))}>
                  <SelectTrigger aria-label="Category" className="spt-modal-select"><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select category…</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="spt-modal-field">
                <label className="spt-modal-label">Description</label>
                <textarea rows={3} className="spt-modal-textarea" value={newForm.description}
                  onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Detailed message or initial inquiry…" />
              </div>
              <div className="spt-modal-actions">
                <button type="button" className="spt-modal-cancel" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
                <button type="submit" className="spt-modal-submit" disabled={creating}>{creating ? 'Creating…' : 'Create Ticket'}</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* NPS & CSAT Feedback Modal — deliberately not dismissible by outside
          click or Escape; the header's own close button and "Skip & Resolve"
          are the two sanctioned ways out, not an oversight. */}
      {feedbackTicketId && (
        <Dialog open>
          <DialogContent
            hideClose
            className="spt-modal max-w-[480px] w-full"
            onInteractOutside={e => e.preventDefault()}
            onEscapeKeyDown={e => e.preventDefault()}
          >
            <DialogHeader className="spt-modal-hdr" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
              <DialogTitle className="spt-modal-title" style={{ fontSize: 17 }}>Rate Your Experience</DialogTitle>
              <Tip label="Close">
                <button type="button" className="spt-icon-btn" onClick={handleCancelFeedback}>
                  <Icon name="x" size={16} strokeWidth={2} />
                </button>
              </Tip>
            </DialogHeader>

            <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ textAlign: 'center' }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, display: 'block' }}>
                  How satisfied are you with our support? *
                </label>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '8px 0' }}>
                  {[1, 2, 3, 4, 5].map(star => {
                    const active = csatScore !== null && star <= csatScore;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setCsatScore(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: 28,
                          color: active ? '#f59e0b' : 'var(--border)',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease',
                          transform: csatScore === star ? 'scale(1.2)' : 'none',
                        }}
                        title={`${star} Star${star > 1 ? 's' : ''}`}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, display: 'block' }}>
                  How likely are you to recommend us? *
                </label>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => {
                    const active = npsScore === score;
                    return (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setNpsScore(score)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: active ? 'none' : '1px solid var(--border)',
                          background: active ? 'var(--teal)' : 'var(--white)',
                          color: active ? '#ffffff' : 'var(--ink)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="spt-modal-field">
                <label className="spt-modal-label">Additional Comments (Optional)</label>
                <textarea
                  rows={2}
                  className="spt-modal-textarea"
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Share details of your experience…"
                />
              </div>

              <div className="spt-modal-actions">
                <button type="button" className="spt-modal-cancel" onClick={handleCancelFeedback}>Skip & Resolve</button>
                <button type="submit" className="spt-modal-submit" disabled={npsScore === null || csatScore === null || submittingFeedback}>
                  {submittingFeedback ? 'Submitting…' : 'Submit & Close'}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
