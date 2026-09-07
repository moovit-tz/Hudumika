import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { Icon } from '../components/Icon.js';
import { PageLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Customer360Sidebar, CustomerContext } from '../components/Customer360Sidebar.js';
import '../pages/Bliss.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { showAlert } from '../lib/alert.js';

const COMPLYOS_AGENCIES = [
  { code: 'BRELA', name: 'BRELA — Business Registration & Licensing' },
  { code: 'TRA',   name: 'TRA — Tanzania Revenue Authority' },
  { code: 'NSSF',  name: 'NSSF — National Social Security Fund' },
  { code: 'WCF',   name: 'WCF — Workers Compensation Fund' },
  { code: 'NHIF',  name: 'NHIF — National Health Insurance Fund' },
  { code: 'TFDA',  name: 'TFDA — Tanzania Food & Drugs Authority' },
  { code: 'TBS',   name: 'TBS — Tanzania Bureau of Standards' },
  { code: 'OSHA',  name: 'OSHA — Occupational Safety & Health Authority' },
];

/** Bliss → ComplyOS bridge modal — raises a draft ComplyOS application pre-filled with this ticket's context (PRD 7.2: a support ticket surfacing a compliance gap should open a ComplyOS workflow without asking the client to re-explain the issue). */
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--white)', borderRadius: 14, width: 440, maxWidth: '100%', border: '1px solid var(--border)', boxShadow: 'var(--elev-lg)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Send to ComplyOS</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Opens a draft compliance application pre-filled from this ticket — {ticket.ref}.</div>
          </div>
          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
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
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={sending} onClick={handleSend}>
            {sending ? 'Opening…' : 'Open Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Types ── */
type ChannelId = 'inapp' | 'email' | 'whatsapp' | 'sms' | 'note';
type StatusKey  = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type PriorityKey = 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface SysCustomer {
  id: string; name: string; email?: string; phone?: string;
  company?: string; total_shipments?: number;
}

interface Ticket {
  id: string; ref: string; subject: string; description?: string;
  customer: string; customer_id?: string; customer_email?: string;
  customer_phone?: string; customer_company?: string;
  category: string; status: StatusKey; priority: PriorityKey;
  assigned_to?: string; created_at: string; updated_at?: string;
  messages?: Message[]; message_count?: number;
  tags?: string[]; related_shipments?: string[];
  customerContext?: CustomerContext;
  group_id?: string | null; group_name?: string | null; group_color?: string | null;
  source_app?: string | null; sla_deadline?: string | null;
  /** The channel this conversation originated on (WHATSAPP/EMAIL/IN_APP/SMS/
   *  SYSTEM) — always selected by the backend but never mapped or rendered
   *  in the list until now, so a WhatsApp conversation and an email one
   *  looked identical in the inbox. */
  channel?: string | null;
}

interface SupportGroup { id: string; name: string; color: string; ticket_count?: number; }
interface SupportView { id: string; name: string; filters: Record<string, any>; }

interface Message {
  id: string; content: string; author_name: string;
  author_type: 'OFFICER' | 'CUSTOMER'; channel?: ChannelId; created_at: string;
}

/* ── Config ── */
const PRIORITY_CFG: Record<PriorityKey, { bg: string; color: string; label: string }> = {
  URGENT: { bg: 'var(--red-l)',   color: 'var(--red)',   label: 'Urgent' },
  HIGH:   { bg: 'var(--gold-l)', color: 'var(--gold)',  label: 'High'   },
  NORMAL: { bg: 'var(--blue-l)', color: 'var(--blue)',  label: 'Normal' },
  MEDIUM: { bg: 'var(--blue-l)', color: 'var(--blue)',  label: 'Medium' },
  LOW:    { bg: 'var(--bg)',     color: 'var(--ink2)',  label: 'Low'    },
};

const STATUS_CFG: Record<StatusKey, { bg: string; color: string; label: string }> = {
  OPEN:        { bg: 'var(--red-l)',   color: 'var(--red)',   label: 'Open'        },
  IN_PROGRESS: { bg: 'var(--gold-l)', color: 'var(--gold)',  label: 'In Progress' },
  RESOLVED:    { bg: 'var(--green-l)',color: 'var(--green)', label: 'Resolved'    },
  CLOSED:      { bg: 'var(--bg)',     color: 'var(--ink2)',  label: 'Closed'      },
};

const CHANNEL_CFG: Record<ChannelId, { label: string; icon: IconName; color: string; bg: string; border: string; btnLabel: string }> = {
  inapp:    { label: 'Reply',    icon: 'message',    color: 'var(--teal)', bg: 'var(--teal-l)', border: 'var(--teal)', btnLabel: 'Send Reply'        },
  email:    { label: 'Email',    icon: 'mail',       color: 'var(--blue)', bg: 'var(--blue-l)',       border: 'var(--blue)', btnLabel: 'Send Email'        },
  whatsapp: { label: 'WhatsApp', icon: 'chatBubble', color: 'var(--green)',bg: 'var(--green-l)',      border: 'var(--green)',btnLabel: 'Send via WhatsApp' },
  sms:      { label: 'SMS',      icon: 'smartphone', color: 'var(--purple)',bg: 'var(--purple-l)',     border: 'var(--purple)',btnLabel: 'Send SMS'          },
  note:     { label: 'Note',     icon: 'fileText',   color: 'var(--gold)', bg: 'var(--gold-l)',       border: 'var(--gold)', btnLabel: 'Save Note'         },
};

const CATEGORIES = ['Clearance Delay', 'Document Issue', 'Demurrage Dispute', 'Duty Assessment', 'System Error', 'General Query', 'Complaint'];
const STATUS_ORDER: Record<StatusKey, number> = { OPEN: 0, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };

function sortTickets(a: Ticket, b: Ticket) {
  const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (so !== 0) return so;
  return (b.message_count ?? 0) - (a.message_count ?? 0);
}

const PRIORITY_ORDER: Record<PriorityKey, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, NORMAL: 2, LOW: 3 };

/** Urgent-first, then soonest SLA deadline — the first place in this
 *  ticketing system priority actually decides order rather than just
 *  drawing a badge/border colour on rows sorted by something else. */
function sortByPriority(a: Ticket, b: Ticket) {
  const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (po !== 0) return po;
  const ad = a.sla_deadline ? new Date(a.sla_deadline).getTime() : Infinity;
  const bd = b.sla_deadline ? new Date(b.sla_deadline).getTime() : Infinity;
  return ad - bd;
}

/* ── Helpers ── */
const relTime = (d: string) => {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '—';
  const s = Math.floor((Date.now() - parsed.getTime()) / 1000);
  if (s < 0)      return 'Just now';
  if (s < 60)     return 'Just now';
  if (s < 3600)   return `${Math.floor(s / 60)}m`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h`;
  if (s < 172800) return 'Yesterday';
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/** Backend channel values (WHATSAPP/EMAIL/IN_APP/SMS/SYSTEM, from the
 *  createTicketSchema enum) mapped onto the badge's own key space. */
function channelKey(channel?: string | null): ChannelId {
  switch ((channel || '').toUpperCase()) {
    case 'WHATSAPP': return 'whatsapp';
    case 'SMS':       return 'sms';
    case 'SYSTEM':    return 'note';
    case 'EMAIL':     return 'email';
    default:          return 'inapp';
  }
}

/* ── Atom components ── */
function Av({ name, userId, kind, size = 28 }: { name: string; userId?: string; kind?: 'people' | 'customers'; size?: number }) {
  return <PersonAvatar userId={userId} kind={kind} name={name} size={size} />;
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
    <span className="spt-ch-pill-sm" data-ch={ch}>
      <Icon name={c.icon} size={9} strokeWidth={2} />{c.label}
    </span>
  );
}

/* ══════════════════════════════════════════
   COL 1 — Conversation list
══════════════════════════════════════════ */
const CONV_PAGE_SIZE = 8;

type InboxFilter = 'inbox' | 'unassigned' | 'closed' | 'all' | 'onsite';
type FilterSel =
  | { kind: 'fixed'; key: InboxFilter }
  | { kind: 'group'; id: string }
  | { kind: 'view'; id: string };
type ViewMode = 'list' | 'table';
type SortKey = 'customer' | 'status' | 'assigned_to' | 'group_name' | 'updated_at';

/* Table-view columns — order and visibility are per-user (localStorage),
 * not per-tenant config, matching how viewMode itself is already persisted
 * a few lines below. 'avatar' isn't in here: it's a fixed leading column,
 * same as a spreadsheet's row-selector, not something a user reorders away. */
type ColumnId = 'status' | 'customer' | 'summary' | 'assigned_to' | 'group_name' | 'updated_at';
const DEFAULT_COLUMN_ORDER: ColumnId[] = ['status', 'customer', 'summary', 'assigned_to', 'group_name', 'updated_at'];
const COLUMN_LABELS: Record<ColumnId, string> = {
  status: 'Status', customer: 'Customer', summary: 'Summary',
  assigned_to: 'Assignee', group_name: 'Group', updated_at: 'Updated',
};
const COLUMN_SORT_KEY: Partial<Record<ColumnId, SortKey>> = {
  status: 'status', customer: 'customer', assigned_to: 'assigned_to',
  group_name: 'group_name', updated_at: 'updated_at',
};

function loadColumnOrder(): ColumnId[] {
  try {
    const saved = JSON.parse(localStorage.getItem('bliss_tix_col_order') || 'null');
    if (Array.isArray(saved)) {
      const kept = saved.filter((c): c is ColumnId => DEFAULT_COLUMN_ORDER.includes(c));
      const missing = DEFAULT_COLUMN_ORDER.filter(c => !kept.includes(c));
      if (kept.length) return [...kept, ...missing];
    }
  } catch {}
  return DEFAULT_COLUMN_ORDER;
}
function loadHiddenColumns(): Set<ColumnId> {
  try {
    const saved = JSON.parse(localStorage.getItem('bliss_tix_col_hidden') || 'null');
    if (Array.isArray(saved)) return new Set(saved.filter((c): c is ColumnId => DEFAULT_COLUMN_ORDER.includes(c)));
  } catch {}
  return new Set();
}

function renderColumnCell(colId: ColumnId, t: Ticket): React.ReactNode {
  switch (colId) {
    case 'status':      return <SBadge s={t.status} />;
    case 'customer':    return t.customer;
    case 'summary':     return (
      <>
        <ChPill ch={channelKey(t.channel)} />
        {(t.tags || []).slice(0, 2).map(tag => <span key={tag} className="spt-tag spt-tag-sm">{tag}</span>)}
        <span className="spt-tix-subject">{t.subject}</span>
      </>
    );
    case 'assigned_to': return t.assigned_to || <span className="spt-tix-muted">Unassigned</span>;
    case 'group_name':  return t.group_name
      ? <span className="spt-group-pill"><span className="spt-group-dot" data-color={t.group_color || 'teal'} />{t.group_name}</span>
      : <span className="spt-tix-muted">—</span>;
    case 'updated_at':  return relTime(t.updated_at || t.created_at);
  }
}
const COLUMN_CELL_CLASS: Partial<Record<ColumnId, string>> = {
  customer: 'spt-tix-td-customer', summary: 'spt-tix-td-summary', updated_at: 'spt-tix-muted',
};

function ConvList({ tickets, selected, onSelect, onNew, groups, views, onCreateGroup, onCreateView, onDeleteView, isDesktop, initialChannelFilter, queueMode, agents = [] }: {
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
}) {
  const [convPage, setConvPage] = useState(1);
  const [sel, setSel]           = useState<FilterSel>({ kind: 'fixed', key: 'unassigned' });
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('bliss_tix_view') as ViewMode) || 'list');
  const [sortKey, setSortKey]   = useState<SortKey>('updated_at');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newViewOpen, setNewViewOpen]   = useState(false);
  const [newViewName, setNewViewName]   = useState('');
  const [newViewCategory, setNewViewCategory] = useState(CATEGORIES[0]);
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelId>(initialChannelFilter ?? 'all');
  const [searchQuery, setSearchQuery]     = useState('');
  const [statusTabFilter, setStatusTabFilter] = useState<'all' | 'open' | 'pending' | 'resolved'>('all');
  const [assigneeFilter, setAssigneeFilter]   = useState<string>('all');
  const [colOrder, setColOrder]   = useState<ColumnId[]>(loadColumnOrder);
  const [hiddenCols, setHiddenCols] = useState<Set<ColumnId>>(loadHiddenColumns);
  const [dragCol, setDragCol]     = useState<ColumnId | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);

  useEffect(() => { localStorage.setItem('bliss_tix_view', viewMode); }, [viewMode]);
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
        // Never let every column disappear — at least one must stay visible.
        if (colOrder.length - next.size <= 1) return next;
        next.add(id);
      }
      return next;
    });
  }
  const visibleColOrder = colOrder.filter(c => !hiddenCols.has(c));

  const inboxCount = (k: InboxFilter) => {
    if (k === 'inbox')      return tickets.filter(t => t.status === 'IN_PROGRESS').length;
    if (k === 'unassigned') return tickets.filter(t => !t.assigned_to).length;
    if (k === 'closed')     return tickets.filter(t => t.status === 'CLOSED').length;
    if (k === 'onsite')     return tickets.filter(t => t.source_app === 'onsite' && t.status !== 'CLOSED').length;
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
      return sel.key === 'all'        ? true :
        sel.key === 'inbox'      ? t.status === 'IN_PROGRESS' :
        sel.key === 'unassigned' ? !t.assigned_to :
        sel.key === 'onsite'     ? t.source_app === 'onsite' && t.status !== 'CLOSED' :
        t.status === 'CLOSED';
    }
    if (sel.kind === 'group') return t.group_id === sel.id;
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
    if (viewMode !== 'table') return sortTickets(a, b);
    let av: string, bv: string;
    switch (sortKey) {
      case 'customer':     av = a.customer; bv = b.customer; break;
      case 'status':       av = a.status; bv = b.status; break;
      case 'assigned_to':  av = a.assigned_to || ''; bv = b.assigned_to || ''; break;
      case 'group_name':   av = a.group_name || ''; bv = b.group_name || ''; break;
      default:              av = a.updated_at || a.created_at; bv = b.updated_at || b.created_at;
    }
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalConvPages = Math.max(1, Math.ceil(visible.length / CONV_PAGE_SIZE));
  const safePage = Math.min(convPage, totalConvPages);
  const paged = visible.slice((safePage - 1) * CONV_PAGE_SIZE, safePage * CONV_PAGE_SIZE);

  useEffect(() => { setConvPage(1); }, [sel, searchQuery, statusTabFilter, assigneeFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const INBOX_ITEMS: { key: InboxFilter; label: string; icon: IconName }[] = [
    { key: 'inbox',      label: 'Your inbox',  icon: 'mail'      },
    { key: 'unassigned', label: 'Unassigned',  icon: 'users'     },
    { key: 'onsite',     label: 'Onsite priority queue', icon: 'monitor' },
    { key: 'closed',     label: 'Closed',      icon: 'checkCircle' },
    { key: 'all',        label: 'All',         icon: 'list'      },
  ];

  const activeFilterName = sel.kind === 'fixed' ? INBOX_ITEMS.find(i => i.key === sel.key)?.label :
    (sel.kind === 'group' ? groups.find(g => g.id === sel.id)?.name : views.find(v => v.id === sel.id)?.name) || 'Inbox';

  const navContent = (
    <div className="spt-inbox-nav-pane">
      <div className="spt-conv-hdr" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: '12px 14px' }}>
        {/* Assignee filter — where the "Shared Inbox" label used to sit —
            plus a compact search, both on one row with the new-ticket button. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger style={{ height: 28, fontSize: 12, fontWeight: 800, border: 'none', background: 'transparent', color: 'var(--ink)', padding: '0 4px 0 0', flexShrink: 0 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {agents.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '5px 8px', width: 150 }}>
              <Icon name="search" size={12} color="var(--ink3)" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search…"
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11.5, color: 'var(--ink)', width: '100%', minWidth: 0 }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 0, flexShrink: 0 }}>
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
            <button type="button" className="spt-icon-btn spt-icon-btn--primary" title="New ticket" onClick={onNew}>
              <Icon name="plus" size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Status filter tabs matching Image 1 (Open, Pending, Resolved) */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', margin: '4px -14px -10px' }}>
          {(['open', 'pending', 'resolved', 'all'] as const).map(st => {
            const active = statusTabFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusTabFilter(st)}
                style={{
                  flex: 1, padding: '8px 4px', border: 'none', borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
                  background: 'transparent', color: active ? 'var(--ink)' : 'var(--ink3)', fontSize: 12, fontWeight: active ? 800 : 600,
                  cursor: 'pointer', textTransform: 'capitalize'
                }}>
                {st}
              </button>
            );
          })}
        </div>
      </div>

      <div className="spt-nav-scroll">
        <nav className="spt-inbox-nav">
          {INBOX_ITEMS.map(item => {
            const count  = inboxCount(item.key);
            const active = sel.kind === 'fixed' && sel.key === item.key;
            return (
              <button key={item.key} type="button"
                className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                onClick={() => setSel({ kind: 'fixed', key: item.key })}>
                <Icon name={item.icon} size={14} strokeWidth={active ? 2.2 : 1.75} />
                <span className="spt-inbox-label">{item.label}</span>
                {count > 0 && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr"><span>Channels</span></div>
          <nav className="spt-inbox-nav">
            {(['all', 'whatsapp', 'email', 'inapp', 'sms'] as const).map(ch => {
              const active = channelFilter === ch;
              const cfg = ch === 'all' ? null : CHANNEL_CFG[ch];
              return (
                <button key={ch} type="button"
                  className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                  onClick={() => setChannelFilter(ch)}>
                  <Icon name={cfg?.icon ?? 'globe'} size={13} strokeWidth={active ? 2.2 : 1.75} style={cfg ? { color: cfg.color } : undefined} />
                  <span className="spt-inbox-label">{cfg?.label ?? 'All channels'}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr">
            <span>Views</span>
            <button type="button" className="spt-nav-add" title="New view" onClick={() => setNewViewOpen(o => !o)}>
              <Icon name="plus" size={11} strokeWidth={2.5} />
            </button>
          </div>
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
            {views.length === 0 && !newViewOpen && <div className="spt-nav-empty">No saved views yet</div>}
          </nav>
        </div>

        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr">
            <span>Groups</span>
            <button type="button" className="spt-nav-add" title="New group" onClick={() => setNewGroupOpen(o => !o)}>
              <Icon name="plus" size={11} strokeWidth={2.5} />
            </button>
          </div>
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
          <nav className="spt-inbox-nav">
            {groups.map(g => {
              const active = sel.kind === 'group' && sel.id === g.id;
              return (
                <button key={g.id} type="button"
                  className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                  onClick={() => setSel({ kind: 'group', id: g.id })}>
                  <span className="spt-group-dot" data-color={g.color} />
                  <span className="spt-inbox-label">{g.name}</span>
                  {!!g.ticket_count && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{g.ticket_count}</span>}
                </button>
              );
            })}
            {groups.length === 0 && !newGroupOpen && <div className="spt-nav-empty">No groups yet</div>}
          </nav>
        </div>
      </div>
    </div>
  );

  const listContent = (
    <div className="spt-tix-list-pane">
      <div className="spt-tix-list-hdr">
        <span className="spt-tix-list-title">
          <Icon name={sel.kind === 'fixed' ? 'inbox' : (sel.kind === 'group' ? 'users' : 'filter')} size={16} strokeWidth={2} />
          {activeFilterName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {viewMode === 'table' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" title="Show/hide columns" className="spt-col-config-btn">
                  <Icon name="columns" size={13} strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {colOrder.map(colId => (
                  <DropdownMenuCheckboxItem
                    key={colId}
                    checked={!hiddenCols.has(colId)}
                    onCheckedChange={() => toggleColumnVisible(colId)}
                  >
                    {COLUMN_LABELS[colId]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="spt-view-toggle">
            <button type="button" title="List view" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
              <Icon name="menu" size={13} strokeWidth={1.75} />
            </button>
            <button type="button" title="Table view" className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
              <Icon name="grid" size={13} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="spt-conv-rows">
          {paged.length === 0 && (
            <div className="spt-conv-empty">No conversations found</div>
          )}
          {paged.map(t => {
            const isSel   = selected?.id === t.id;
            const urgHigh = t.priority === 'URGENT' || t.priority === 'HIGH';
            const lastMsg = t.messages?.[t.messages.length - 1];
            const preview = lastMsg ? lastMsg.content : (t.description?.slice(0, 60) ?? '');
            const accentCls = urgHigh
              ? (t.priority === 'URGENT' ? ' spt-conv-row--urgent' : ' spt-conv-row--high')
              : '';
            return (
              <div key={t.id}
                className={`spt-conv-row${isSel ? ' spt-conv-row--active' : ''}${accentCls}`}
                onClick={() => onSelect(t)}>
                <div className="spt-conv-row-av">
                  <Av name={t.customer} userId={t.customer_id} kind="customers" size={34} />
                  {t.status === 'OPEN' && <span className="spt-conv-unread-dot" />}
                </div>
                <div className="spt-conv-row-body">
                  <div className="spt-conv-row-meta">
                    <span className="spt-conv-row-ref">#{t.ref}</span>
                    <ChPill ch={channelKey(t.channel)} />
                  </div>
                  <div className="spt-conv-row-top">
                    <span className="spt-conv-row-name">{t.customer}</span>
                    <span className="spt-conv-row-time">{relTime(t.updated_at || t.created_at)}</span>
                  </div>
                  <div className="spt-conv-row-subject">{t.subject}</div>
                  <div className="spt-conv-row-preview">{preview}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="spt-tix-table-wrap">
          <table className="spt-tix-table">
            <thead>
              <tr>
                <th />
                {visibleColOrder.map(colId => {
                  const sortK = COLUMN_SORT_KEY[colId];
                  const active = sortK && sortKey === sortK;
                  return (
                    <th
                      key={colId}
                      className={`spt-tix-th spt-tix-th--draggable${active ? ' spt-tix-th--active' : ''}${dragOverCol === colId ? ' spt-tix-th--dragover' : ''}`}
                      draggable
                      onDragStart={() => setDragCol(colId)}
                      onDragOver={e => { e.preventDefault(); if (dragOverCol !== colId) setDragOverCol(colId); }}
                      onDragLeave={() => setDragOverCol(cur => cur === colId ? null : cur)}
                      onDrop={e => { e.preventDefault(); if (dragCol) reorderColumn(dragCol, colId); setDragCol(null); setDragOverCol(null); }}
                      onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                      onClick={() => sortK && toggleSort(sortK)}
                      title="Drag to reorder"
                    >
                      <Icon name="moreVertical" size={11} strokeWidth={2} className="spt-tix-th-grip" />
                      {COLUMN_LABELS[colId]}
                      {active && <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} strokeWidth={2} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={visibleColOrder.length + 1} className="spt-conv-empty">No conversations found</td></tr>
              )}
              {paged.map(t => {
                const isSel = selected?.id === t.id;
                return (
                  <tr key={t.id} className={isSel ? 'spt-tix-row--active' : ''} onClick={() => onSelect(t)}>
                    <td><Av name={t.customer} userId={t.customer_id} kind="customers" size={26} /></td>
                    {visibleColOrder.map(colId => (
                      <td key={colId} className={COLUMN_CELL_CLASS[colId]}>{renderColumnCell(colId, t)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalConvPages > 1 && (
        <div className="spt-conv-pager">
          <button type="button" disabled={safePage <= 1} onClick={() => setConvPage(p => p - 1)} title="Previous page">
            <Icon name="arrowLeft" size={11} strokeWidth={2} />
          </button>
          <span>{safePage} / {totalConvPages}</span>
          <button type="button" disabled={safePage >= totalConvPages} onClick={() => setConvPage(p => p + 1)} title="Next page">
            <Icon name="arrowRight" size={11} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <Panel defaultSize={15} minSize={10} maxSize={20} className="spt-inbox-nav-panel">
          {navContent}
        </Panel>
        <PanelResizeHandle className="spt-resize-handle" />
        <Panel defaultSize={viewMode === 'table' ? 55 : 25} minSize={20} className="spt-conv-list-panel">
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
   COL 2 — Comms Hub Thread + Composer
══════════════════════════════════════════ */
function ThreadPanel({ ticket, onStatusChange, authorName, onClose, onOpenDetails, aiSuggestionToUse, agents = [], onReassign }: {
  ticket: Ticket; onStatusChange: (id: string, s: StatusKey) => void;
  authorName: string; onClose: () => void; onOpenDetails?: () => void; aiSuggestionToUse?: string;
  agents?: { id: string; name: string }[];
  onReassign?: (id: string, assigneeId: string) => void;
}) {
  const [messages, setMessages]   = useState<Message[]>(ticket.messages || []);
  const [sending, setSending]     = useState(false);
  // Multi-channel broadcast — Set of active channels
  const [broadcastChs, setBroadcastChs] = useState<Set<ChannelId>>(new Set(['inapp'] as ChannelId[]));
  const [isNote, setIsNote]       = useState(false);
  const [compose, setCompose]     = useState('');
  const [emailSubj, setEmailSubj] = useState(`Re: [${ticket.ref}] ${ticket.subject}`);
  const [broadcastResult, setBroadcastResult] = useState<{ch: string; success: boolean}[]>([]);
  const [showComplyModal, setShowComplyModal] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(ticket.messages || []);
    setEmailSubj(`Re: [${ticket.ref}] ${ticket.subject}`);
    setCompose('');
    setBroadcastChs(new Set(['inapp'] as ChannelId[]));
    setIsNote(false);
    setBroadcastResult([]);
  }, [ticket.id]); // eslint-disable-line

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
          method: 'POST', body: JSON.stringify({ content, channel: 'NOTE' }),
        }).catch(() => null);
        setMessages(prev => [...prev, {
          id: `local-${Date.now()}`, content, channel: 'note',
          author_type: 'OFFICER', author_name: authorName, created_at: new Date().toISOString(),
          ...(res || {}),
        }]);
      } else {
        const channels = Array.from(broadcastChs).map(ch => ch.toUpperCase());
        const res: any = await apiFetch(`/v1/support/tickets/${ticket.id}/broadcast`, {
          method: 'POST',
          body: JSON.stringify({ content, channels, email_subject: emailSubj }),
        }).catch(() => null);

        if (res?.results) {
          setBroadcastResult(res.results.map((r: any) => ({ ch: r.channel, success: r.success })));
        } else {
          setBroadcastResult(channels.map(ch => ({ ch, success: true })));
        }
        // Add merged outbound messages to the thread
        const newMsgs: Message[] = Array.from(broadcastChs).map((ch, i) => ({
          id: `local-${Date.now()}-${i}`,
          content,
          channel: ch as ChannelId,
          author_type: 'OFFICER' as const,
          author_name: authorName,
          created_at: new Date().toISOString(),
        }));
        setMessages(prev => [...prev, ...newMsgs]);
      }
    } catch { /* silent */ }
    setCompose('');
    setSending(false);
    setTimeout(() => setBroadcastResult([]), 5000);
  };

  const visible = messages;

  const canSend = compose.trim().length > 0 && !sending;

  const BROADCAST_ORDER: ChannelId[] = ['whatsapp', 'email', 'sms', 'inapp'];


  return (
    <div className="spt-thread">

      {/* ── Thread header — matches reference design ── */}
      <div className="spt-thread-hdr" style={{ padding: '12px 18px', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
        {/* Full contact/channel detail lives in the Customer tab on the
            right (Customer360Sidebar) — this header just identifies who
            and what ticket, not a second copy of their profile. */}
        <div className="spt-thread-hdr-left" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Av name={ticket.customer} userId={ticket.customer_id} kind="customers" size={38} />
          <div style={{ minWidth: 0 }}>
            <div className="spt-thread-customer" style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{ticket.customer}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <ChPill ch={channelKey(ticket.channel)} />
              <span className="spt-thread-ref" style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>#{ticket.ref}</span>
            </div>
          </div>
        </div>

        <div className="spt-thread-hdr-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Assignee Selector Dropdown matching Image 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '2px 8px' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>ASSIGNEE:</span>
            <Select value={agents.find(a => a.name === ticket.assigned_to)?.id || '__unassigned__'} onValueChange={v => onReassign && v !== '__unassigned__' && onReassign(ticket.id, v)}>
              <SelectTrigger style={{ height: 28, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, padding: '0 4px', color: 'var(--ink)' }}>
                <SelectValue placeholder={ticket.assigned_to || 'Unassigned'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Select value={ticket.status} onValueChange={v => onStatusChange(ticket.id, v as StatusKey)}>
            <SelectTrigger aria-label="Status" className={`spt-status-select spt-status-select--${ticket.status.toLowerCase().replace('_', '-')}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>

          <button type="button" className="spt-icon-btn" title="Send to ComplyOS — open a compliance application from this ticket" onClick={() => setShowComplyModal(true)}>
            <Icon name="shield" size={14} strokeWidth={1.75} />
          </button>
          {onOpenDetails && (
            <button type="button" className="spt-icon-btn spt-details-toggle" title="Customer details" onClick={onOpenDetails}>
              <Icon name="user" size={15} strokeWidth={1.75} />
            </button>
          )}
          <button type="button" className="spt-close-btn" onClick={onClose}>
            <Icon name="x" size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Message thread ── */}
      <div className="spt-msgs">
        <div className="spt-sys-event">
          <span className="spt-sys-pill">
            <Icon name="fileText" size={11} strokeWidth={2} />
            Case <span className="spt-mono">{ticket.ref}</span> opened · {relTime(ticket.created_at)}
          </span>
        </div>
        {ticket.description && (
          <div className="spt-sys-event">
            <span className="spt-sys-pill">
              <Icon name="paperclip" size={11} strokeWidth={2} />
              {ticket.description.slice(0, 70)}
            </span>
          </div>
        )}

        {visible.length === 0 && (
          <div className="spt-msgs-empty">
            <Icon name="message" size={28} strokeWidth={1.25} />
            <div>No messages — use the composer below</div>
          </div>
        )}

        {visible.map((m, idx) => {
          const ch     = (m.channel?.toLowerCase() || 'inapp') as ChannelId;
          const isNote = ch === 'note';
          const isOff  = m.author_type === 'OFFICER';
          const prev   = visible[idx - 1];
          const mDate  = new Date(m.created_at);
          const pDate  = prev ? new Date(prev.created_at) : null;
          const showDate = !pDate || mDate.toDateString() !== pDate.toDateString();
          const dateLbl = mDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const timeLbl = mDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

          return (
            <React.Fragment key={m.id}>
              {showDate && (
                <div className="spt-date-sep"><span>{dateLbl}</span></div>
              )}

              {isNote ? (
                <div style={{ margin: '14px 0', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 12, padding: '12px 16px', color: 'var(--gold)', boxShadow: 'var(--elev)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 800 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gold)' }}>
                      <Icon name="lock" size={13} />
                      <span>Internal Note</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>{m.author_name}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, fontWeight: 500, color: 'var(--gold)' }}>
                    {m.content}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 10.5, fontWeight: 600, color: 'var(--gold)', marginTop: 6 }}>
                    {timeLbl}
                  </div>
                </div>
              ) : (
                <div className={`spt-msg${isOff ? ' spt-msg--officer' : ' spt-msg--customer'}`}>
                  <div className="spt-msg-inner">
                    <Av name={m.author_name} size={28} />
                    <div className="spt-msg-content">
                      <div className="spt-msg-meta">
                        <span className="spt-msg-author">{m.author_name}</span>
                        <span className="spt-msg-time">{timeLbl}</span>
                        <ChPill ch={ch} />
                      </div>
                      <div className={`spt-bubble ${isOff ? 'spt-bubble--dark' : ''}`} style={isOff ? { background: 'var(--ink)', color: 'var(--white)', borderRadius: '14px 14px 4px 14px' } : undefined}>
                        {m.content}
                        {isOff && <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>✓✓</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={msgEndRef} />
      </div>

      {/* ── Composer matching reference design ── */}
      <div className="spt-composer" style={{ padding: 14, background: 'var(--white)', borderTop: '1px solid var(--border)' }}>

        {/* Broadcast success toast */}
        {broadcastResult.length > 0 && (
          <div className="spt-broadcast-toast">
            {broadcastResult.map(r => (
              <span key={r.ch} className={`spt-broadcast-toast-chip${r.success ? '' : ' spt-broadcast-toast-chip--fail'}`}>
                {r.success ? '✓' : '✗'} {r.ch}
              </span>
            ))}
            <span className="spt-broadcast-toast-label">Sent!</span>
          </div>
        )}

        {/* Top Reply / Note pill toggle + Status indicators matching Image 1 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => { setIsNote(false); if (broadcastChs.size === 0) setBroadcastChs(new Set(['inapp'])); }}
              style={{
                padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: !isNote ? 'var(--ink)' : 'transparent',
                color: !isNote ? 'var(--white)' : 'var(--ink2)',
                fontSize: 12, fontWeight: 800
              }}>
              Reply
            </button>
            <button
              type="button"
              onClick={() => { setIsNote(true); setBroadcastChs(new Set()); }}
              style={{
                padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: isNote ? 'var(--gold)' : 'transparent',
                color: isNote ? '#fff' : 'var(--ink2)',
                fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4
              }}>
              <Icon name="lock" size={11} /> Note
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>STATUS:</span>
              <span style={{ color: ticket.status === 'OPEN' ? 'var(--red)' : ticket.status === 'RESOLVED' ? 'var(--green)' : 'var(--gold)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border)' }}>
                ● {ticket.status}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>Mark:</span>
              <button type="button" onClick={() => onStatusChange(ticket.id, 'IN_PROGRESS')} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>Pending</button>
              <button type="button" onClick={() => onStatusChange(ticket.id, 'RESOLVED')} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>Resolved</button>
            </div>
          </div>
        </div>

        {/* Textarea */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          {isNote && (
            <div style={{ background: 'var(--gold-l)', color: 'var(--gold)', padding: '6px 12px', borderRadius: '8px 8px 0 0', fontSize: 11.5, fontWeight: 700, border: '1px solid var(--gold)', borderBottom: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="lock" size={12} /> Internal Note — visible only to staff
            </div>
          )}
          <textarea
            rows={3}
            value={compose}
            onChange={e => setCompose(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isNote) { e.preventDefault(); handleSend(); } }}
            placeholder={isNote ? 'Write an internal note…' : 'Type your message response…'}
            style={{
              width: '100%', padding: 12, borderRadius: isNote ? '0 0 8px 8px' : 8,
              border: isNote ? '1px solid var(--gold)' : '1px solid var(--border)',
              background: isNote ? 'var(--gold-l)' : 'var(--white)',
              color: 'var(--ink)', fontSize: 13, outline: 'none', resize: 'vertical',
              fontFamily: 'var(--font)', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Bottom Toolbar matching Image 1 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} title="Attach file">
              <Icon name="paperclip" size={16} />
            </button>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} title="Insert Emoji">
              <Icon name="smile" size={16} />
            </button>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 4 }} title="AI Sparkles Suggestion" onClick={() => { if (aiSuggestionToUse) setCompose(aiSuggestionToUse); }}>
              <Icon name="sparkle" size={16} />
            </button>

            {/* Broadcast channel pills — "All" is a one-click shortcut for
                selecting every channel at once, instead of toggling each
                one individually every time a reply should go out everywhere. */}
            {!isNote && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setBroadcastChs(new Set(BROADCAST_ORDER))}
                  style={{
                    padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border)',
                    background: broadcastChs.size === BROADCAST_ORDER.length ? 'var(--teal-l)' : 'transparent',
                    color: broadcastChs.size === BROADCAST_ORDER.length ? 'var(--teal)' : 'var(--ink3)',
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer'
                  }}>
                  All
                </button>
                {BROADCAST_ORDER.map(ch => {
                  const active = broadcastChs.has(ch);
                  const cfg = CHANNEL_CFG[ch];
                  return (
                    <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                      style={{
                        padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border)',
                        background: active ? cfg.bg : 'transparent', color: active ? cfg.color : 'var(--ink3)',
                        fontSize: 10.5, fontWeight: 700, cursor: 'pointer'
                      }}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: canSend ? (isNote ? 'var(--gold)' : 'var(--ink)') : 'var(--border)',
              color: canSend ? '#ffffff' : 'var(--ink3)',
              fontSize: 13, fontWeight: 800, cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s'
            }}>
            <Icon name="send" size={13} /> {sending ? 'Sending…' : isNote ? 'Save Note' : 'Send Reply'}
          </button>
        </div>
      </div>

      {showComplyModal && (
        <SendToComplyOSModal ticket={ticket} onClose={() => setShowComplyModal(false)} />
      )}
    </div>
  );
}


/* ══════════════════════════════════════════
   COL 3 — Details Panel (TicketGo-style)
══════════════════════════════════════════ */
function AccordionSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="spt-detail-section">
      <button type="button" className="spt-detail-section-hdr" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13} strokeWidth={2} />
      </button>
      {open && <div className="spt-detail-section-body">{children}</div>}
    </div>
  );
}

function DetailsPanel({ ticket, agents, onReassign }: {
  ticket: Ticket; agents: { id: string; name: string }[]; onReassign: (id: string, assigneeId: string) => void;
}) {
  const currentAssigneeId = agents.find(a => a.name === ticket.assigned_to)?.id ?? '__unassigned__';
  return (
    <div className="spt-details">

      {/* Header */}
      <div className="spt-details-hdr">
        <span className="spt-details-title">Details</span>
      </div>

      <div className="spt-details-scroll">

        {/* Contact card */}
        <div className="spt-contact-card">
          <Av name={ticket.customer} userId={ticket.customer_id} kind="customers" size={40} />
          <div className="spt-contact-info">
            <div className="spt-contact-name">{ticket.customer}</div>
            {ticket.customer_email && <div className="spt-contact-meta">{ticket.customer_email}</div>}
            {ticket.customer_company && <div className="spt-contact-meta">{ticket.customer_company}</div>}
            {ticket.customer_phone && <div className="spt-contact-meta">{ticket.customer_phone}</div>}
          </div>
        </div>

        {/* Assignee / Status rows */}
        <div className="spt-detail-rows">
          <div className="spt-detail-row">
            <span className="spt-detail-row-label">Assignee</span>
            <span className="spt-detail-row-val">
              <Select value={currentAssigneeId} onValueChange={v => v !== '__unassigned__' && onReassign(ticket.id, v)}>
                <SelectTrigger aria-label="Assignee" className="spt-assignee-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__" disabled={currentAssigneeId === '__unassigned__'}>
                    <span className="spt-detail-unassigned"><Icon name="user" size={13} strokeWidth={1.75} /> Unassigned</span>
                  </SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="spt-detail-assignee"><Av name={a.name} size={18} />{a.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          </div>
          <div className="spt-detail-row">
            <span className="spt-detail-row-label">Status</span>
            <span className="spt-detail-row-val">
              <SBadge s={ticket.status} />
            </span>
          </div>
          <div className="spt-detail-row">
            <span className="spt-detail-row-label">Priority</span>
            <span className="spt-detail-row-val"><PBadge p={ticket.priority} /></span>
          </div>
        </div>

        {/* Tags */}
        {(ticket.tags?.length ?? 0) > 0 && (
          <div className="spt-tags-row">
            {ticket.tags!.map(tag => (
              <span key={tag} className="spt-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Conversation attributes */}
        <AccordionSection title="Conversation attributes">
          <div className="spt-attr-grid">
            <span className="spt-attr-key">Ref</span>
            <span className="spt-attr-val spt-mono">{ticket.ref}</span>
            <span className="spt-attr-key">Category</span>
            <span className="spt-attr-val">{ticket.category}</span>
            <span className="spt-attr-key">Started</span>
            <span className="spt-attr-val">{relTime(ticket.created_at)}</span>
            <span className="spt-attr-key">Last activity</span>
            <span className="spt-attr-val">{relTime(ticket.updated_at || ticket.created_at)}</span>
          </div>
        </AccordionSection>

        {/* Related shipments */}
        {(ticket.related_shipments?.length ?? 0) > 0 && (
          <AccordionSection title="Related shipments">
            {ticket.related_shipments!.map(ref => (
              <Link key={ref} className="spt-shipment-btn"
                to={`/shipments?search=${ref}`}>
                <Icon name="package" size={12} strokeWidth={1.75} />
                <span className="spt-mono">{ref}</span>
                <Icon name="externalLink" size={11} strokeWidth={1.75} />
              </Link>
            ))}
          </AccordionSection>
        )}

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main Support component
══════════════════════════════════════════ */
export const Support: React.FC<{ initialChannelFilter?: 'all' | ChannelId; queueMode?: boolean }> = ({ initialChannelFilter, queueMode }) => {
  const { user } = useAuth();
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'customer' | 'ticket'>('customer');
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const [aiSuggestionToUse, setAiSuggestionToUse] = useState('');
  const [custMap, setCustMap]   = useState<Map<string, SysCustomer>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm]   = useState({ subject: '', customer: '', customer_id: '', category: '', priority: 'MEDIUM', description: '' });
  const [groups, setGroups]     = useState<SupportGroup[]>([]);
  const [views, setViews]       = useState<SupportView[]>([]);

  const loadGroups = useCallback(() => {
    apiFetch('/v1/support/groups').then((r: any) => setGroups(r || [])).catch(() => {});
  }, []);
  const loadViews = useCallback(() => {
    apiFetch('/v1/support/views').then((r: any) => setViews(r || [])).catch(() => {});
  }, []);
  useEffect(() => { loadGroups(); loadViews(); }, [loadGroups, loadViews]);

  const createGroup = useCallback(async (name: string) => {
    try { await apiFetch('/v1/support/groups', { method: 'POST', body: JSON.stringify({ name }) }); loadGroups(); } catch {}
  }, [loadGroups]);
  const createView = useCallback(async (name: string, filters: Record<string, any>) => {
    try { await apiFetch('/v1/support/views', { method: 'POST', body: JSON.stringify({ name, filters }) }); loadViews(); } catch {}
  }, [loadViews]);
  const deleteView = useCallback(async (id: string) => {
    try { await apiFetch(`/v1/support/views/${id}`, { method: 'DELETE' }); loadViews(); } catch {}
  }, [loadViews]);

  useEffect(() => {
    apiFetch('/v1/customers')
      .then((r: any) => {
        const list: SysCustomer[] = r.data ?? r ?? [];
        const m = new Map<string, SysCustomer>();
        list.forEach(c => { m.set(c.id, c); m.set(c.name.toLowerCase(), c); });
        setCustMap(m);
      })
      .catch(() => {});
  }, []);

  const buildTickets = useCallback((data: any[]): Ticket[] => {
    return data.map((s: any) => ({
      id: s.id,
      ref: s.ref || s.ref_number,
      subject: s.subject || 'No Subject',
      description: s.description || '',
      customer: s.customer ?? 'Unknown',
      customer_id: s.customer_id,
      customer_email: s.customer_email,
      customer_phone: s.customer_phone,
      customer_company: s.customer_company,
      category: s.category || 'General Inquiry',
      status: s.status as StatusKey,
      priority: s.priority as PriorityKey,
      assigned_to: s.assigned_to,
      created_at: s.created_at,
      updated_at: s.updated_at || s.created_at,
      message_count: s.message_count || 0,
      tags: s.tags || [],
      group_id: s.group_id ?? null,
      group_name: s.group_name ?? null,
      group_color: s.group_color ?? null,
      source_app: s.source_app ?? null,
      sla_deadline: s.sla_deadline ?? null,
      channel: s.channel ?? null,
    }));
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshTickets = useCallback(() => {
    return apiFetch('/v1/support/tickets')
      .then((r: any) => {
        const data = r.data ?? r ?? [];
        // An empty array is the real state for a tenant with no tickets yet
        // — not a signal to fall back to fabricated conversations. A
        // support inbox that shows a fake "Dangote Industries EA" dispute
        // over a real balance dispute isn't a working inbox, it's a lie an
        // agent could act on.
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

    setSelected({ ...t, messages: [], customerContext: undefined });
    apiFetch(`/v1/support/tickets/${t.id}`)
      .then((res: any) => {
        if (res) {
          setSelected(prev => prev?.id === t.id ? { ...prev, messages: res.messages, customerContext: {
            customer_id: res.customer_id,
            customer_name: res.customer,
            customer_email: res.customer_email,
            customer_phone: res.customer_phone,
            customer_company: res.customer_company,
            customer_country: res.customer_country,
            // No customer-level KYC field exists anywhere in this schema —
            // this used to hardcode 'VERIFIED' for every customer regardless
            // of reality, showing every agent a false trust badge. Leaving
            // kyc_status unset means Customer360Sidebar's badge (which only
            // renders when a value is present) correctly shows nothing
            // rather than a fabricated claim.
            assets: res.assets,
            invoices: res.invoices,
            shipments: res.shipments,
          } } : prev);
        }
      })
      .catch(() => {});
  };

  // Every "open this ticket" notification (new ticket, reassigned, SLA
  // escalation, IMAP-ingested reply) links here with ?id=<ticket>, but
  // nothing ever read it — clicking a notification always landed on a
  // generic, nothing-selected inbox. Runs once tickets have actually loaded
  // so the id can be resolved to a real Ticket object, then clears the
  // param so it doesn't re-fire on an unrelated navigation.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || tickets.length === 0) return;
    const match = tickets.find(t => t.id === id);
    if (match) openTicket(match);
    setSearchParams(prev => { prev.delete('id'); return prev; }, { replace: true });
  }, [searchParams, tickets]);

  // A reply — whether an inbound WhatsApp message, a customer's own
  // in-app message, or a colleague's outbound reply on a ticket this agent
  // also has open — used to only ever show up after a manual page refresh:
  // nothing in this file (or anywhere else in the app) ever listened for
  // the backend's own `support.message_received` broadcast. Refresh the
  // list unconditionally (new tickets, reordering by updated_at) and the
  // open thread when the event is for the ticket currently on screen.
  useWebSocket((event) => {
    if (event.type !== 'support.message_received') return;
    refreshTickets();
    setSelected(prev => {
      if (!prev || prev.id !== event.ticketId) return prev;
      apiFetch(`/v1/support/tickets/${event.ticketId}`)
        .then((res: any) => {
          if (res) setSelected(cur => cur?.id === event.ticketId ? { ...cur, messages: res.messages } : cur);
        })
        .catch(() => {});
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
      } catch {}
      setTickets(ts => ts.map(t => t.id === id ? { ...t, status } : t));
      setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
    }
  };

  // The backend has always supported this (PATCH .../status accepts
  // assigned_to alongside status, and fires a real 'reassigned'
  // notification) — there was just no picker anywhere in the inbox to call
  // it with. Once a ticket falls outside whatever auto-assign rule applies
  // (or none is configured), it had no way to be manually claimed.
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { apiFetch('/v1/support/agents').then((r: any) => setAgents(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  const reassignTicket = async (id: string, assigneeId: string) => {
    const current = tickets.find(t => t.id === id);
    if (!current) return;
    const agentName = agents.find(a => a.id === assigneeId)?.name;
    try {
      await apiFetch(`/v1/support/tickets/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: current.status, assigned_to: assigneeId }),
      });
    } catch { return; }
    setTickets(ts => ts.map(t => t.id === id ? { ...t, assigned_to: agentName } : t));
    setSelected(prev => prev?.id === id ? { ...prev, assigned_to: agentName } : prev);
  };

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
    } catch (err) {
      console.error('Failed to submit support feedback', err);
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
    } catch {}
    setFeedbackTicketId(null);
  };

  const [creating, setCreating] = useState(false);
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const t: Ticket = {
      id: Date.now().toString(),
      ref: `TKT-${1000 + tickets.length}`,
      subject: newForm.subject, description: newForm.description,
      customer: newForm.customer, customer_id: newForm.customer_id || undefined,
      category: newForm.category || 'General Query',
      status: 'OPEN', priority: newForm.priority as PriorityKey,
      created_at: new Date().toISOString(), messages: [],
    };

    setCreating(true);
    try {
      const res: any = await apiFetch('/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: t.customer_id,
          subject: t.subject,
          description: t.description,
          channel: 'IN_APP',
          priority: t.priority,
          category: t.category
        })
      });
      setTickets(prev => [{ ...t, id: res.id, ref: res.ref_number }, ...prev]);
      setShowCreate(false);
      setNewForm({ subject: '', customer: '', customer_id: '', category: '', priority: 'MEDIUM', description: '' });
    } catch (err: any) {
      // The modal used to close and reset the form synchronously regardless
      // of whether this call ever succeeded — a 400 (e.g. a typed customer
      // name with no matching customer_id) meant the ticket silently wasn't
      // created and the agent had no way to know except noticing it missing.
      showAlert(err?.message || 'Could not create this ticket — please try again.');
    } finally {
      setCreating(false);
    }
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

      {/* For desktop, we use a Resizable PanelGroup. On mobile, we use CSS hiding logic as before. */}
      {isDesktop ? (
        <PanelGroup direction="horizontal" className="spt-shell-panels">
          <ConvList
            tickets={tickets} selected={selected}
            onSelect={openTicket} onNew={() => setShowCreate(true)}
            groups={groups} views={views}
            onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
            isDesktop={true}
            initialChannelFilter={initialChannelFilter} queueMode={queueMode}
            agents={agents}
          />

          <PanelResizeHandle className="spt-resize-handle" />

          <Panel minSize={40} className="spt-thread-panel">
            {selected ? (
              <ThreadPanel ticket={selected} onStatusChange={updateStatus}
                authorName={user?.name || 'Officer'} onClose={() => setSelected(null)}
                aiSuggestionToUse={aiSuggestionToUse} agents={agents} onReassign={reassignTicket} />
            ) : (
              <div className="spt-thread" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                <div style={{ textAlign: 'center' }}>
                  <Icon name="mail" size={48} strokeWidth={1} color="var(--border)" />
                  <div style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: 'var(--ink2)' }}>No conversation selected</div>
                  <div style={{ marginTop: 8, fontSize: 14 }}>Select a conversation from the left to view details.</div>
                </div>
              </div>
            )}
          </Panel>

          {selected && (
            <>
              <PanelResizeHandle className="spt-resize-handle" />
              <Panel defaultSize={25} minSize={20} maxSize={35} className="spt-details-panel">
                <div className="spt-rcol" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div className="spt-rcol-tabs">
                    <button type="button" className={rightTab === 'customer' ? 'active' : ''} onClick={() => setRightTab('customer')}>Customer</button>
                    <button type="button" className={rightTab === 'ticket' ? 'active' : ''} onClick={() => setRightTab('ticket')}>Ticket</button>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                    {rightTab === 'customer' ? (
                      <Customer360Sidebar
                        context={selected.customerContext}
                        ticketId={selected.id}
                        onUseAiReply={setAiSuggestionToUse}
                        onClose={() => setSelected(null)}
                      />
                    ) : (
                      <DetailsPanel ticket={selected} agents={agents} onReassign={reassignTicket} />
                    )}
                  </div>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      ) : (
        <>
          {/* Mobile layout */}
          <ConvList
            tickets={tickets} selected={selected}
            onSelect={openTicket} onNew={() => setShowCreate(true)}
            groups={groups} views={views}
            onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
            initialChannelFilter={initialChannelFilter} queueMode={queueMode}
            agents={agents}
          />
          {selected && (
            <ThreadPanel ticket={selected} onStatusChange={updateStatus}
              authorName={user?.name || 'Officer'} onClose={() => setSelected(null)}
              onOpenDetails={() => setDetailsOpen(true)}
              aiSuggestionToUse={aiSuggestionToUse} agents={agents} onReassign={reassignTicket} />
          )}
          {selected && detailsOpen && createPortal(
            <>
              <div className="spt-details-backdrop" onClick={() => setDetailsOpen(false)} />
              <div className="spt-details-drawer">
                <button type="button" className="spt-icon-btn spt-details-drawer-close" onClick={() => setDetailsOpen(false)} title="Close">
                  <Icon name="close" size={16} strokeWidth={2} />
                </button>
                <div className="spt-rcol-tabs">
                  <button type="button" className={rightTab === 'customer' ? 'active' : ''} onClick={() => setRightTab('customer')}>Customer</button>
                  <button type="button" className={rightTab === 'ticket' ? 'active' : ''} onClick={() => setRightTab('ticket')}>Ticket</button>
                </div>
                {rightTab === 'customer' ? (
                  <Customer360Sidebar
                    context={selected.customerContext}
                    ticketId={selected.id}
                    onUseAiReply={setAiSuggestionToUse}
                    onClose={() => setDetailsOpen(false)}
                  />
                ) : (
                  <DetailsPanel ticket={selected} agents={agents} onReassign={reassignTicket} />
                )}
              </div>
            </>,
            document.body
          )}
        </>
      )}

      {/* New ticket modal */}
      {showCreate && (
        <div className="spt-modal-overlay"
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="spt-modal">
            <div className="spt-modal-hdr">
              <h2 className="spt-modal-title">New Support Ticket</h2>
              <button type="button" className="spt-icon-btn" onClick={() => setShowCreate(false)} title="Close">
                <Icon name="x" size={18} strokeWidth={2} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="spt-modal-form">
              <div className="spt-modal-field">
                <label className="spt-modal-label">Subject *</label>
                <input required className="spt-modal-input" value={newForm.subject}
                  onChange={e => setNewForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief description of the issue" />
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
                  placeholder="Detailed description…" />
              </div>
              <div className="spt-modal-actions">
                <button type="button" className="spt-modal-cancel" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
                <button type="submit" className="spt-modal-submit" disabled={creating}>{creating ? 'Creating…' : 'Create Ticket'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* NPS & CSAT Feedback Modal */}
      {feedbackTicketId && (
        <div className="spt-modal-overlay" style={{ display: 'flex', zIndex: 1100 }}>
          <div className="spt-modal" style={{ maxWidth: 500, width: '100%' }}>
            <div className="spt-modal-hdr" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 18 }}>
              <h2 className="spt-modal-title" style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>Rate Your Experience</h2>
              <button type="button" className="spt-icon-btn" onClick={handleCancelFeedback} title="Close">
                <Icon name="x" size={18} strokeWidth={2} />
              </button>
            </div>
            
            <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* CSAT (1-5 Stars) */}
              <div style={{ textAlign: 'center' }}>
                <label style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, display: 'block' }}>
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
                          fontSize: 32,
                          color: active ? 'var(--gold)' : 'var(--border)',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease',
                          transform: csatScore === star ? 'scale(1.2)' : 'none',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.25)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = csatScore === star ? 'scale(1.2)' : 'none'; }}
                        title={`${star} Star${star > 1 ? 's' : ''}`}
                      >
                        <Icon name="star" size={28} duotone={active} />
                      </button>
                    );
                  })}
                </div>
                {csatScore !== null && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gold)' }}>
                    {csatScore === 5 ? 'Excellent!' : csatScore === 4 ? 'Very Good' : csatScore === 3 ? 'Satisfactory' : csatScore === 2 ? 'Needs Improvement' : 'Unsatisfactory'}
                  </span>
                )}
              </div>

              {/* NPS (0-10 Buttons) */}
              <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, display: 'block' }}>
                  How likely are you to recommend Hudumika Workspaces to others? *
                </label>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>On a scale from 0 (Not Likely) to 10 (Extremely Likely)</span>
                
                <div style={{ display: 'flex', gap: 5, justifyContent: 'center', margin: '14px 0', flexWrap: 'wrap' }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => {
                    const active = npsScore === score;
                    const isDetractor = score <= 6;
                    const isPassive = score === 7 || score === 8;
                    
                    let activeBg = 'hsl(var(--primary))';
                    let activeColor = 'hsl(var(--primary-foreground))';
                    if (isDetractor) { activeBg = 'var(--red)'; activeColor = '#fff'; }
                    else if (isPassive) { activeBg = 'var(--gold)'; activeColor = '#fff'; }
                    
                    return (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setNpsScore(score)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          border: active ? 'none' : '1px solid var(--border)',
                          background: active ? activeBg : 'var(--white)',
                          color: active ? activeColor : 'var(--ink)',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          boxShadow: active ? 'var(--elev)' : 'none',
                        }}
                        title={String(score)}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--ink3)' }}>
                  <span>0 - Not likely</span>
                  <span>10 - Very likely</span>
                </div>
              </div>

              {/* Feedback text comments */}
              <div className="spt-modal-field" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label className="spt-modal-label" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                  Additional Comments (Optional)
                </label>
                <textarea
                  rows={3}
                  className="spt-modal-textarea"
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Share details of your experience..."
                />
              </div>

              {/* Actions */}
              <div className="spt-modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
                <button
                  type="button"
                  className="spt-modal-cancel"
                  onClick={handleCancelFeedback}
                >
                  Skip & Resolve
                </button>
                <button
                  type="submit"
                  className="spt-modal-submit"
                  disabled={npsScore === null || csatScore === null || submittingFeedback}
                  style={{
                    background: (npsScore === null || csatScore === null) ? 'var(--border)' : 'hsl(var(--primary))',
                    color: (npsScore === null || csatScore === null) ? 'var(--ink3)' : 'hsl(var(--primary-foreground))',
                    fontWeight: 700,
                    cursor: (npsScore === null || csatScore === null || submittingFeedback) ? 'not-allowed' : 'pointer',
                    opacity: (npsScore === null || csatScore === null) ? 0.6 : 1,
                  }}
                >
                  {submittingFeedback ? 'Submitting…' : 'Submit & Close'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
