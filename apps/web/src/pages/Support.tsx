import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Customer360Sidebar, CustomerContext } from '../components/Customer360Sidebar.js';
import '../pages/Bliss.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

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
      <div style={{ background: 'var(--white)', borderRadius: 14, width: 440, maxWidth: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Send to ComplyOS</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Opens a draft compliance application pre-filled from this ticket — {ticket.ref}.</div>
          </div>
          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} onClick={onClose}><Icon name="x" size={16} /></button>
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
  email:    { label: 'Email',    icon: 'mail',       color: '#2563eb',     bg: '#eff6ff',       border: '#2563eb',     btnLabel: 'Send Email'        },
  whatsapp: { label: 'WhatsApp', icon: 'chatBubble', color: '#047857',     bg: '#ecfdf5',       border: '#047857',     btnLabel: 'Send via WhatsApp' },
  sms:      { label: 'SMS',      icon: 'smartphone', color: '#7c3aed',     bg: '#f5f3ff',       border: '#7c3aed',     btnLabel: 'Send SMS'          },
  note:     { label: 'Note',     icon: 'fileText',   color: '#92400e',     bg: '#fefce8',       border: '#92400e',     btnLabel: 'Save Note'         },
};

const CATEGORIES = ['Clearance Delay', 'Document Issue', 'Demurrage Dispute', 'Duty Assessment', 'System Error', 'General Query', 'Complaint'];
const OFFICERS   = ['Amina Hassan', 'John Mwangi', 'Fatuma Ally', 'Peter Kimani', 'Grace Osei'];
const STATUS_ORDER: Record<StatusKey, number> = { OPEN: 0, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };

type MsgFilter = 'all' | 'whatsapp' | 'email' | 'note' | 'autosent' | 'sms';
const MSG_TABS: { key: MsgFilter; label: string; color: string }[] = [
  { key: 'all',      label: 'All',       color: 'var(--ink2)'  },
  { key: 'whatsapp', label: 'WhatsApp',  color: '#047857'      },
  { key: 'email',    label: 'Email',     color: '#2563eb'      },
  { key: 'note',     label: 'Internal',  color: '#92400e'      },
  { key: 'autosent', label: 'Auto-sent', color: 'var(--ink3)'  },
  { key: 'sms',      label: 'SMS',       color: '#7c3aed'      },
];

function sortTickets(a: Ticket, b: Ticket) {
  const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (so !== 0) return so;
  return (b.message_count ?? 0) - (a.message_count ?? 0);
}

/* ── Helpers ── */
const AVATAR_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30','#0e7490'];
const initials    = (n: string) => n.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
const avatarColor = (n: string) => AVATAR_COLORS[((n ?? '?').charCodeAt(0)) % AVATAR_COLORS.length];
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

/* ── Atom components ── */
function Av({ name, size = 28 }: { name: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.setProperty('--av-size', `${size}px`);
    ref.current.style.setProperty('--av-bg', avatarColor(name));
    ref.current.style.setProperty('--av-fs', `${Math.round(size * 0.34)}px`);
  }, [size, name]);
  return <div ref={ref} className="spt-av">{initials(name)}</div>;
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

type InboxFilter = 'inbox' | 'unassigned' | 'closed' | 'all';
type FilterSel =
  | { kind: 'fixed'; key: InboxFilter }
  | { kind: 'group'; id: string }
  | { kind: 'view'; id: string };
type ViewMode = 'list' | 'table';
type SortKey = 'customer' | 'status' | 'assigned_to' | 'group_name' | 'updated_at';

function ConvList({ tickets, selected, onSelect, onNew, groups, views, onCreateGroup, onCreateView, onDeleteView, isDesktop }: {
  tickets: Ticket[]; selected: Ticket | null;
  onSelect: (t: Ticket) => void; onNew: () => void;
  groups: SupportGroup[]; views: SupportView[];
  onCreateGroup: (name: string) => void;
  onCreateView: (name: string, filters: Record<string, any>) => void;
  onDeleteView: (id: string) => void;
  isDesktop?: boolean;
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

  useEffect(() => { localStorage.setItem('bliss_tix_view', viewMode); }, [viewMode]);

  const inboxCount = (k: InboxFilter) => {
    if (k === 'inbox')      return tickets.filter(t => t.status === 'IN_PROGRESS').length;
    if (k === 'unassigned') return tickets.filter(t => !t.assigned_to).length;
    if (k === 'closed')     return tickets.filter(t => t.status === 'CLOSED').length;
    return tickets.length;
  };

  const visible = tickets.filter(t => {
    if (sel.kind === 'fixed') {
      return sel.key === 'all'        ? true :
        sel.key === 'inbox'      ? t.status === 'IN_PROGRESS' :
        sel.key === 'unassigned' ? !t.assigned_to :
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

  useEffect(() => { setConvPage(1); }, [sel]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const INBOX_ITEMS: { key: InboxFilter; label: string; icon: IconName }[] = [
    { key: 'inbox',      label: 'Your inbox',  icon: 'mail'      },
    { key: 'unassigned', label: 'Unassigned',  icon: 'users'     },
    { key: 'closed',     label: 'Closed',      icon: 'checkCircle' },
    { key: 'all',        label: 'All',         icon: 'list'      },
  ];

  const activeFilterName = sel.kind === 'fixed' ? INBOX_ITEMS.find(i => i.key === sel.key)?.label :
    (sel.kind === 'group' ? groups.find(g => g.id === sel.id)?.name : views.find(v => v.id === sel.id)?.name) || 'Inbox';

  const navContent = (
    <div className="spt-inbox-nav-pane">
      <div className="spt-conv-hdr">
        <span className="spt-conv-title">Inbox</span>
        <div className="spt-conv-hdr-actions">
          <button type="button" className="spt-icon-btn spt-icon-btn--primary" title="New ticket" onClick={onNew}>
            <Icon name="plus" size={14} strokeWidth={2.5} />
          </button>
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
        <div className="spt-view-toggle">
          <button type="button" title="List view" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
            <Icon name="menu" size={13} strokeWidth={1.75} />
          </button>
          <button type="button" title="Table view" className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
            <Icon name="grid" size={13} strokeWidth={1.75} />
          </button>
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
                  <Av name={t.customer} size={34} />
                  {t.status === 'OPEN' && <span className="spt-conv-unread-dot" />}
                </div>
                <div className="spt-conv-row-body">
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
                <SortTh label="Status"   k="status"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Customer" k="customer"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th>Summary</th>
                <SortTh label="Assignee" k="assigned_to"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Group"    k="group_name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Updated"  k="updated_at"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={7} className="spt-conv-empty">No conversations found</td></tr>
              )}
              {paged.map(t => {
                const isSel = selected?.id === t.id;
                return (
                  <tr key={t.id} className={isSel ? 'spt-tix-row--active' : ''} onClick={() => onSelect(t)}>
                    <td><Av name={t.customer} size={26} /></td>
                    <td><SBadge s={t.status} /></td>
                    <td className="spt-tix-td-customer">{t.customer}</td>
                    <td className="spt-tix-td-summary">
                      {(t.tags || []).slice(0, 2).map(tag => <span key={tag} className="spt-tag spt-tag-sm">{tag}</span>)}
                      <span className="spt-tix-subject">{t.subject}</span>
                    </td>
                    <td>{t.assigned_to || <span className="spt-tix-muted">Unassigned</span>}</td>
                    <td>{t.group_name
                      ? <span className="spt-group-pill"><span className="spt-group-dot" data-color={t.group_color || 'teal'} />{t.group_name}</span>
                      : <span className="spt-tix-muted">—</span>}</td>
                    <td className="spt-tix-muted">{relTime(t.updated_at || t.created_at)}</td>
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

function SortTh({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className={`spt-tix-th${active ? ' spt-tix-th--active' : ''}`} onClick={() => onSort(k)}>
      {label}
      {active && <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} strokeWidth={2} />}
    </th>
  );
}

/* ══════════════════════════════════════════
   COL 2 — Comms Hub Thread + Composer
══════════════════════════════════════════ */
function ThreadPanel({ ticket, onStatusChange, authorName, onClose, onOpenDetails, aiSuggestionToUse }: {
  ticket: Ticket; onStatusChange: (id: string, s: StatusKey) => void;
  authorName: string; onClose: () => void; onOpenDetails?: () => void; aiSuggestionToUse?: string;
}) {
  const [messages, setMessages]   = useState<Message[]>(ticket.messages || []);
  const [sending, setSending]     = useState(false);
  // Multi-channel broadcast — Set of active channels
  const [broadcastChs, setBroadcastChs] = useState<Set<ChannelId>>(new Set(['inapp'] as ChannelId[]));
  const [isNote, setIsNote]       = useState(false);
  const [msgFilter, setMsgFilter] = useState<MsgFilter>('all');
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
    setMsgFilter('all');
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

  const msgCounts: Record<MsgFilter, number> = {
    all:      messages.length,
    whatsapp: messages.filter(m => m.channel?.toLowerCase() === 'whatsapp').length,
    email:    messages.filter(m => m.channel?.toLowerCase() === 'email').length,
    note:     messages.filter(m => m.channel?.toLowerCase() === 'note').length,
    autosent: 0,
    sms:      messages.filter(m => m.channel?.toLowerCase() === 'sms').length,
  };

  const visible = msgFilter === 'all' ? messages
    : messages.filter(m => (m.channel?.toLowerCase() || 'inapp') === msgFilter);

  const canSend = compose.trim().length > 0 && !sending;

  const BROADCAST_ORDER: ChannelId[] = ['whatsapp', 'email', 'sms', 'inapp'];


  return (
    <div className="spt-thread">

      {/* ── Thread header — matches TicketGo layout ── */}
      <div className="spt-thread-hdr">
        <div className="spt-thread-hdr-left">
          <Icon name="message" size={14} strokeWidth={1.75} />
          <span className="spt-thread-customer">{ticket.customer}</span>
          <span className="spt-thread-ref">{ticket.ref}</span>
        </div>
        <div className="spt-thread-hdr-right">
          <Select value={ticket.status} onValueChange={v => onStatusChange(ticket.id, v as StatusKey)}>
            <SelectTrigger aria-label="Status" className={`spt-status-select spt-status-select--${ticket.status.toLowerCase().replace('_', '-')}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
          <button type="button" className="spt-icon-btn" title="More options">
            <Icon name="moreVertical" size={15} strokeWidth={1.75} />
          </button>
          <button type="button" className="spt-icon-btn" title="Label conversation">
            <Icon name="tag" size={14} strokeWidth={1.75} />
          </button>
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
            Close
          </button>
        </div>
      </div>

      {/* ── Channel filter tabs ── */}
      <div className="spt-ch-tabs">
        {MSG_TABS.map(tab => {
          const count  = msgCounts[tab.key];
          const active = msgFilter === tab.key;
          return (
            <button key={tab.key} type="button"
              className={`spt-ch-tab${active ? ' spt-ch-tab--active' : ''}`}
              onClick={() => setMsgFilter(tab.key)}>
              <span className="spt-ch-dot" />
              {tab.label}
              <span className="spt-ch-count">{count}</span>
            </button>
          );
        })}
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
                <div className="spt-note">
                  <div className="spt-note-meta">
                    <Av name={m.author_name} size={30} />
                    <span className="spt-note-author">{m.author_name}</span>
                    <span className="spt-note-time">{timeLbl}</span>
                    <span className="spt-note-badge"><Icon name="lock" size={10} /> Internal</span>
                  </div>
                  <div className="spt-note-card">
                    <div className="spt-note-card-hdr">INTERNAL NOTE</div>
                    <div className="spt-note-card-body">{m.content}</div>
                    <div className="spt-note-card-ft">
                      <span>{timeLbl}</span>
                      <span>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="lock" size={10} /> Internal · not visible to customer</span>
                    </div>
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
                      <div className="spt-bubble">{m.content}</div>
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={msgEndRef} />
      </div>

      {/* ── Composer ── */}
      <div className="spt-composer">

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

        {/* Broadcast channel toggles */}
        <div className="spt-broadcast-row">
          <span className="spt-broadcast-label">Broadcast to:</span>
          <div className="spt-broadcast-chs">
            {BROADCAST_ORDER.map(ch => {
              const cfg = CHANNEL_CFG[ch];
              const active = !isNote && broadcastChs.has(ch);
              return (
                <button key={ch} type="button"
                  className={`spt-broadcast-btn${active ? ' spt-broadcast-btn--active' : ''}`}
                  data-ch={ch}
                  onClick={() => { setIsNote(false); toggleChannel(ch); }}
                  title={`Toggle ${cfg.label} broadcast`}>
                  <Icon name={cfg.icon} size={12} strokeWidth={2} />
                  {cfg.label}
                  {active && <span className="spt-broadcast-dot" />}
                </button>
              );
            })}
          </div>
          <button type="button"
            className={`spt-note-toggle-btn${isNote ? ' spt-note-toggle-btn--active' : ''}`}
            onClick={() => { setIsNote(n => !n); setBroadcastChs(new Set()); }}>
            <Icon name="lock" size={12} strokeWidth={2} />
            Internal Note
          </button>
        </div>

        {/* To: row */}
        <div className="spt-to-row">
          <span className="spt-to-label">To:</span>
          <div className="spt-to-chips">
            <span className="spt-to-chip">
              <Av name={ticket.customer} size={18} />
              {ticket.customer}{ticket.customer_phone ? ` (${ticket.customer_phone})` : ''}
              <button type="button" className="spt-to-chip-rm" title="Remove recipient">×</button>
            </span>
            <button type="button" className="spt-to-add">+ Add</button>
          </div>
        </div>

        {/* Subject line (email in broadcast) */}
        {!isNote && broadcastChs.has('email') && (
          <div className="spt-subject-row">
            <span className="spt-subject-label">Subject:</span>
            <input className="spt-subject-input" value={emailSubj} title="Email subject"
              onChange={e => setEmailSubj(e.target.value)} placeholder="Email subject" />
          </div>
        )}

        {/* Textarea */}
        <div className="spt-compose-area">
          {isNote && (
            <div className="spt-note-warning">
              <Icon name="lock" size={12} /> Internal note — not visible to customer
            </div>
          )}
          <textarea rows={3} value={compose}
            className={`spt-compose-ta${isNote ? ' spt-compose-ta--note' : ''}`}
            onChange={e => setCompose(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isNote) { e.preventDefault(); handleSend(); } }}
            placeholder={isNote ? 'Write an internal note…' : broadcastChs.size > 1 ? `Broadcast to ${broadcastChs.size} channels…` : 'Type a message…'}
          />
        </div>

        {/* Toolbar + Send */}
        <div className="spt-toolbar">
          <div className="spt-toolbar-icons">
            {(['paperclip', 'slash', 'bold', 'smile', 'clock', 'link'] as IconName[]).map(icon => (
              <button key={icon} type="button" className="spt-toolbar-btn" title={icon}>
                <Icon name={icon} size={14} strokeWidth={1.75} />
              </button>
            ))}
          </div>
          <div className="spt-toolbar-right">
            {!isNote && broadcastChs.size > 1 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-l)', padding: '2px 8px', borderRadius: 8 }}>
                <Icon name="zap" size={11} /> Broadcast × {broadcastChs.size}
              </span>
            )}
            <button type="button"
              className={`spt-send-btn${canSend ? ' spt-send-btn--whatsapp' : ' spt-send-btn--disabled'}`}
              onClick={handleSend} disabled={!canSend} title="Send message">
              {sending ? 'Sending…' : isNote ? <><Icon name="save" size={13} /> Save Note</> : broadcastChs.size > 1 ? <><Icon name="zap" size={13} /> Send to {broadcastChs.size}</> : 'Send ↑'}
            </button>
          </div>
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

function DetailsPanel({ ticket }: { ticket: Ticket }) {
  const [rules, setRules] = useState({
    dailyStatusWa: true, dailyStatusEmail: true, missingDoc: true,
    demurrageAlert: true, stageAdvance: true, paymentRequest: false,
  });

  const RULE_LIST = [
    { key: 'dailyStatusWa',    dot: '#047857', label: 'Daily status → WhatsApp'   },
    { key: 'dailyStatusEmail', dot: '#2563eb', label: 'Daily status → Email'       },
    { key: 'missingDoc',       dot: '#d97706', label: 'Missing doc reminder (24h)' },
    { key: 'demurrageAlert',   dot: '#dc2626', label: 'Demurrage alert'            },
    { key: 'stageAdvance',     dot: '#047857', label: 'Stage advance notification' },
    { key: 'paymentRequest',   dot: '#6b7280', label: 'Payment confirmation'       },
  ] as const;

  return (
    <div className="spt-details">

      {/* Header */}
      <div className="spt-details-hdr">
        <span className="spt-details-title">Details</span>
        <button type="button" className="spt-icon-btn" title="Expand">
          <Icon name="maximize" size={13} strokeWidth={1.75} />
        </button>
      </div>

      <div className="spt-details-scroll">

        {/* Contact card */}
        <div className="spt-contact-card">
          <Av name={ticket.customer} size={40} />
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
              {ticket.assigned_to ? (
                <span className="spt-detail-assignee">
                  <Av name={ticket.assigned_to} size={18} />{ticket.assigned_to}
                </span>
              ) : (
                <span className="spt-detail-unassigned">
                  <Icon name="user" size={13} strokeWidth={1.75} /> Unassigned
                </span>
              )}
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

        {/* Auto-notification rules */}
        <AccordionSection title="Auto-notifications" defaultOpen={false}>
          {RULE_LIST.map(r => (
            <div key={r.key} className="spt-rule-row">
              <span className="spt-rule-dot" data-rule={r.key} />
              <span className="spt-rule-label">{r.label}</span>
              <button type="button" className="spt-toggle" title={rules[r.key] ? 'Disable' : 'Enable'}
                data-on={rules[r.key] ? 'true' : undefined}
                onClick={() => setRules(p => ({ ...p, [r.key]: !p[r.key] }))}>
                <span className="spt-toggle-knob" />
                <span className="spt-toggle-dot" />
              </button>
            </div>
          ))}
        </AccordionSection>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main Support component
══════════════════════════════════════════ */
export const Support: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    }));
  }, []);

  const mockMsgs = (t: Ticket): Message[] => {
    const now = Date.now();
    const off = t.assigned_to || 'Support Team';
    return [
      { id:'1', content:`Hi, we have an issue with clearance for BL #${t.ref}. Customs is requesting additional documents.`, author_name:t.customer, author_type:'CUSTOMER', channel:'email',    created_at: new Date(now-18000000).toISOString() },
      { id:'2', content:'Thank you for reaching out. We are reviewing the request. Which specific documents are being asked for?', author_name:off, author_type:'OFFICER', channel:'email',    created_at: new Date(now-14400000).toISOString() },
      { id:'3', content:'They need the Certificate of Origin and the Packing List.', author_name:t.customer, author_type:'CUSTOMER', channel:'whatsapp', created_at: new Date(now-10800000).toISOString() },
      { id:'4', content:'Escalated to priority. Need duty officer to review CO before clearance proceeds.', author_name:off, author_type:'OFFICER', channel:'note',     created_at: new Date(now-7200000).toISOString() },
      { id:'5', content:'We have contacted your shipper. Certificate of Origin expected within 24 hours.', author_name:off, author_type:'OFFICER', channel:'whatsapp', created_at: new Date(now-3600000).toISOString() },
    ];
  };

  const DEMO_TICKETS: Ticket[] = [
    {
      id: 'demo-1', ref: 'SUP-1092',
      subject: 'Discrepancy in Bank Balance',
      description: 'The ledger balance does not match the dashboard balance for TZS account.',
      customer: 'Dangote Industries EA', customer_id: 'demo-c1',
      customer_email: 'logistics@dangote.co.tz', customer_phone: '+255712345678',
      customer_company: 'Dangote Industries East Africa',
      category: 'Bank Account Dispute', status: 'OPEN', priority: 'URGENT',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
      message_count: 2, tags: ['finance', 'discrepancy'],
    },
    {
      id: 'demo-2', ref: 'SUP-1093',
      subject: 'Claim Status Enquiry — POL-MTR-99823',
      description: 'Looking to check the status of motor insurance claim POL-MTR-99823.',
      customer: 'Simba Cement Ltd', customer_id: 'demo-c2',
      customer_email: 'info@simba.co.tz', customer_phone: '+255754123456',
      customer_company: 'Simba Cement Ltd',
      category: 'Insurance Claim', status: 'IN_PROGRESS', priority: 'HIGH',
      assigned_to: 'Amina Hassan',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      message_count: 3, tags: ['insurance', 'claim'],
    },
    {
      id: 'demo-3', ref: 'SUP-1094',
      subject: 'Loan Repayment Schedule Request',
      description: 'Customer requesting updated amortization schedule for loan LN-2026-8831.',
      customer: 'East Africa Breweries', customer_id: 'demo-c3',
      customer_email: 'finance@eab.com', customer_phone: '+254787654321',
      customer_company: 'East Africa Breweries',
      category: 'Loan Management', status: 'OPEN', priority: 'NORMAL',
      created_at: new Date(Date.now() - 10800000).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString(),
      message_count: 1, tags: ['loan'],
    },
    {
      id: 'demo-4', ref: 'SUP-1095',
      subject: 'Credit Card Transaction Dispute',
      description: 'Unauthorized transaction of $450 appeared on CC-4111-XXXX-XXXX-9921.',
      customer: 'Kariakoo Traders Ltd', customer_id: 'demo-c4',
      customer_email: 'admin@kariakoo.co.tz', customer_phone: '+255765432109',
      customer_company: 'Kariakoo Traders Ltd',
      category: 'Card Dispute', status: 'IN_PROGRESS', priority: 'URGENT',
      assigned_to: 'John Mwangi',
      created_at: new Date(Date.now() - 14400000).toISOString(),
      updated_at: new Date(Date.now() - 5400000).toISOString(),
      message_count: 5, tags: ['credit-card', 'dispute'],
    },
    {
      id: 'demo-5', ref: 'SUP-1090',
      subject: 'Account Opening Documentation',
      description: 'Corporate account onboarding — awaiting CRB clearance.',
      customer: 'TPC Group', customer_id: 'demo-c5',
      customer_email: 'accounts@tpc.co.tz', customer_phone: '+255743987654',
      customer_company: 'TPC Group Tanzania',
      category: 'Account Services', status: 'RESOLVED', priority: 'LOW',
      assigned_to: 'Fatuma Ally',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 43200000).toISOString(),
      message_count: 7, tags: ['onboarding'],
    },
  ];

  useEffect(() => {
    apiFetch('/v1/support/tickets')
      .then((r: any) => {
        const data = r.data ?? r ?? [];
        if (Array.isArray(data) && data.length > 0) {
          setTickets(buildTickets(data));
        } else {
          // Fallback to rich demo data so page is always populated
          setTickets(DEMO_TICKETS);
        }
      })
      .catch(() => {
        setTickets(DEMO_TICKETS);
      })
      .finally(() => setLoading(false));
  }, [buildTickets]);


  const [feedbackTicketId, setFeedbackTicketId] = useState<string | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const DEMO_MESSAGES: Record<string, Message[]> = {
    'demo-1': [
      { id: 'm1', content: 'Hello, my dashboard is showing a balance of TZS 4.5B but our physical bank statement shows TZS 4.7B. Please look into this immediately.', author_name: 'Dangote Industries EA', author_type: 'CUSTOMER', channel: 'inapp', created_at: new Date(Date.now() - 3600000).toISOString() },
      { id: 'm2', content: 'Hi, thank you for reaching out. We have logged this query and our finance reconciliation team is reviewing the transaction logs. We will update you within 2 hours.', author_name: 'Amina Hassan', author_type: 'OFFICER', channel: 'inapp', created_at: new Date(Date.now() - 1800000).toISOString() },
    ],
    'demo-2': [
      { id: 'm3', content: 'Hi, did anyone check on the motor claim for POL-MTR-99823? It has been 3 weeks since submission.', author_name: 'Simba Cement Ltd', author_type: 'CUSTOMER', channel: 'whatsapp', created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: 'm4', content: 'Hello! We can confirm your claim is under active review. The assessor visited the site yesterday and the report is expected by EOD tomorrow.', author_name: 'Amina Hassan', author_type: 'OFFICER', channel: 'whatsapp', created_at: new Date(Date.now() - 5400000).toISOString() },
      { id: 'm5', content: 'Thank you Amina. Please ensure it is processed before Friday as we need the vehicle for a major delivery.', author_name: 'Simba Cement Ltd', author_type: 'CUSTOMER', channel: 'whatsapp', created_at: new Date(Date.now() - 3600000).toISOString() },
    ],
    'demo-3': [
      { id: 'm6', content: 'We need an updated amortization schedule for our loan LN-2026-8831. The current one in the portal seems outdated after last month\'s restructuring.', author_name: 'East Africa Breweries', author_type: 'CUSTOMER', channel: 'email', created_at: new Date(Date.now() - 10800000).toISOString() },
    ],
    'demo-4': [
      { id: 'm7', content: 'There is an unauthorized transaction of $450 on my card CC-4111-XXXX-XXXX-9921 dated yesterday at 11:43 PM. I did not authorize this.', author_name: 'Kariakoo Traders Ltd', author_type: 'CUSTOMER', channel: 'inapp', created_at: new Date(Date.now() - 14400000).toISOString() },
      { id: 'm8', content: 'We are escalating this to our fraud investigation team immediately. The card has been temporarily frozen for your protection.', author_name: 'John Mwangi', author_type: 'OFFICER', channel: 'inapp', created_at: new Date(Date.now() - 10800000).toISOString() },
      { id: 'm9', content: 'Fraud team confirmed this was a suspicious transaction from outside Tanzania. Initiating chargeback now.', author_name: 'John Mwangi', author_type: 'OFFICER', channel: 'note', created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: 'm10', content: 'Chargeback has been submitted. You should see the refund within 3–5 business days. A new card will be couriered to your registered address.', author_name: 'John Mwangi', author_type: 'OFFICER', channel: 'inapp', created_at: new Date(Date.now() - 5400000).toISOString() },
      { id: 'm11', content: 'Thank you so much for the quick response. Appreciated!', author_name: 'Kariakoo Traders Ltd', author_type: 'CUSTOMER', channel: 'inapp', created_at: new Date(Date.now() - 3600000).toISOString() },
    ],
    'demo-5': [],
  };

  const DEMO_ASSETS: Record<string, any[]> = {
    'demo-c1': [
      { id: 'a1', asset_type: 'BANK_ACCOUNT', asset_ref: 'TZS-1002-9938-12', status: 'ACTIVE', metadata: { balance: 4500000000, currency: 'TZS' } },
      { id: 'a2', asset_type: 'LOAN', asset_ref: 'LN-2026-8831', status: 'ACTIVE', metadata: { balance: 1200000000, currency: 'TZS', rate: 0.12 } },
    ],
    'demo-c2': [
      { id: 'a3', asset_type: 'INSURANCE_POLICY', asset_ref: 'POL-MTR-99823', status: 'ACTIVE', metadata: { expires_at: '2027-12-31' } },
    ],
    'demo-c3': [
      { id: 'a4', asset_type: 'LOAN', asset_ref: 'LN-2025-4421', status: 'ACTIVE', metadata: { balance: 550000000, currency: 'TZS' } },
    ],
    'demo-c4': [
      { id: 'a5', asset_type: 'CREDIT_CARD', asset_ref: 'CC-4111-XXXX-XXXX-9921', status: 'ACTIVE', metadata: { balance: 15000, currency: 'USD' } },
    ],
    'demo-c5': [
      { id: 'a6', asset_type: 'BANK_ACCOUNT', asset_ref: 'TZS-9901-2233-04', status: 'PENDING', metadata: { balance: 0, currency: 'TZS' } },
    ],
  };

  const DEMO_INVOICES: Record<string, any[]> = {
    'demo-c1': [
      { id: 'i1', invoice_number: 'INV-2026-0012', total_amount: 4500000, status: 'Paid', bill_date: '2026-06-01', due_date: '2026-06-15' },
      { id: 'i2', invoice_number: 'INV-2026-0014', total_amount: 980000, status: 'Overdue', bill_date: '2026-06-10', due_date: '2026-06-24' },
    ],
    'demo-c2': [
      { id: 'i3', invoice_number: 'INV-2026-0005', total_amount: 2350000, status: 'Paid', bill_date: '2026-05-14', due_date: '2026-05-28' },
    ],
    'demo-c3': [
      { id: 'i4', invoice_number: 'INV-2026-0010', total_amount: 1540000, status: 'Pending', bill_date: '2026-06-18', due_date: '2026-07-02' },
    ],
  };

  const DEMO_SHIPMENTS: Record<string, any[]> = {
    'demo-c1': [
      { id: 's1', ref_number: 'CLR-2026-0001', goods_desc: 'Industrial Machinery Parts', stage: 'CUSTOMS', port_of_loading: 'Shanghai', port_of_discharge: 'Dar es Salaam', updated_at: '2026-07-06T12:00:00Z' },
      { id: 's2', ref_number: 'CLR-2026-0005', goods_desc: 'Raw Gypsum Bulk', stage: 'CLEARED', port_of_loading: 'Mombasa', port_of_discharge: 'Nairobi', updated_at: '2026-07-05T09:00:00Z' },
    ],
    'demo-c2': [
      { id: 's3', ref_number: 'CLR-2026-0016', goods_desc: 'Clinker Shipments', stage: 'INSPECTION', port_of_loading: 'Salalah', port_of_discharge: 'Tanga', updated_at: '2026-07-06T15:00:00Z' },
    ],
  };

  const openTicket = (t: Ticket) => {
    setAiSuggestionToUse('');
    setDetailsOpen(false);
    if (t.id.startsWith('demo-')) {
      const msgs = DEMO_MESSAGES[t.id] || [];
      const assets = DEMO_ASSETS[t.customer_id || ''] || [];
      const invoices = DEMO_INVOICES[t.customer_id || ''] || [];
      const shipments = DEMO_SHIPMENTS[t.customer_id || ''] || [];
      setSelected({
        ...t, messages: msgs,
        customerContext: {
          customer_id: t.customer_id || '',
          customer_name: t.customer,
          customer_email: t.customer_email,
          customer_phone: t.customer_phone,
          customer_company: t.customer_company,
          kyc_status: 'VERIFIED',
          assets,
          invoices,
          shipments,
        }
      });
      return;
    }

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
            kyc_status: 'VERIFIED',
            assets: res.assets,
            invoices: res.invoices,
            shipments: res.shipments,
          } } : prev);
        }
      })
      .catch(() => {});
  };


  const updateStatus = async (id: string, status: StatusKey) => {
    if (status === 'RESOLVED' || status === 'CLOSED') {
      setFeedbackTicketId(id);
    } else {
      const targetStage = status === 'IN_PROGRESS' ? 'ASSESSMENT' : 'DOCS_RECEIVED';
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

  const handleCreate = (e: React.FormEvent) => {
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
    
    apiFetch('/v1/support/tickets', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: t.customer_id,
        subject: t.subject,
        description: t.description,
        channel: 'IN_APP',
        priority: t.priority,
        category: t.category
      })
    }).then((res: any) => {
      setTickets(prev => [{...t, id: res.id, ref: res.ref_number}, ...prev]);
    });
    setShowCreate(false);
    setNewForm({ subject:'', customer:'', customer_id:'', category:'', priority:'MEDIUM', description:'' });
  };

  const custNames = Array.from(new Set(tickets.map(t => t.customer))).sort();

  if (loading) return (
    <div className="spt-shell spt-shell--loading">Loading…</div>
  );

  return (
    <div className={`spt-shell ${selected ? 'spt-shell--has-selection' : ''}`}>

      {/* For desktop, we use a Resizable PanelGroup. On mobile, we use CSS hiding logic as before. */}
      {isDesktop ? (
        <PanelGroup direction="horizontal" className="spt-shell-panels">
          <ConvList
            tickets={tickets} selected={selected}
            onSelect={openTicket} onNew={() => setShowCreate(true)}
            groups={groups} views={views}
            onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
            isDesktop={true}
          />

          <PanelResizeHandle className="spt-resize-handle" />

          <Panel minSize={40} className="spt-thread-panel">
            {selected ? (
              <ThreadPanel ticket={selected} onStatusChange={updateStatus}
                authorName={user?.name || 'Officer'} onClose={() => setSelected(null)}
                aiSuggestionToUse={aiSuggestionToUse} />
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
                <div className="spt-rcol" style={{ width: '100%', height: '100%' }}>
                  <Customer360Sidebar
                    context={selected.customerContext}
                    ticketId={selected.id}
                    onUseAiReply={setAiSuggestionToUse}
                  />
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
          />
          {selected && (
            <ThreadPanel ticket={selected} onStatusChange={updateStatus}
              authorName={user?.name || 'Officer'} onClose={() => setSelected(null)}
              onOpenDetails={() => setDetailsOpen(true)}
              aiSuggestionToUse={aiSuggestionToUse} />
          )}
          {selected && detailsOpen && createPortal(
            <>
              <div className="spt-details-backdrop" onClick={() => setDetailsOpen(false)} />
              <div className="spt-details-drawer">
                <button type="button" className="spt-icon-btn spt-details-drawer-close" onClick={() => setDetailsOpen(false)} title="Close">
                  <Icon name="close" size={16} strokeWidth={2} />
                </button>
                <Customer360Sidebar
                  context={selected.customerContext}
                  ticketId={selected.id}
                  onUseAiReply={setAiSuggestionToUse}
                />
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
                <button type="button" className="spt-modal-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="spt-modal-submit">Create Ticket</button>
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
                          color: active ? '#f59e0b' : 'var(--border)',
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
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#f59e0b' }}>
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
                    
                    let activeBg = 'var(--teal)';
                    let activeColor = '#fff';
                    if (isDetractor) { activeBg = 'var(--red)'; }
                    else if (isPassive) { activeBg = 'var(--gold)'; }
                    
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
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          boxShadow: active ? '0 4px 6px rgba(0,0,0,0.1)' : 'none',
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
                    background: (npsScore === null || csatScore === null) ? 'var(--border)' : 'var(--teal)',
                    color: '#fff',
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
