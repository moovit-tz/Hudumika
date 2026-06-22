import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';

/* ── Types ── */
type ChannelId = 'inapp' | 'email' | 'whatsapp' | 'sms' | 'note';
type StatusKey  = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type PriorityKey = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type StatusFilter = 'all' | StatusKey;

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
}

interface Message {
  id: string; content: string; author_name: string;
  author_type: 'OFFICER' | 'CUSTOMER'; channel?: ChannelId; created_at: string;
}

/* ── Config ── */
const PRIORITY_CFG: Record<PriorityKey, { bg: string; color: string; label: string }> = {
  URGENT: { bg: 'var(--red-l)',   color: 'var(--red)',   label: 'Urgent' },
  HIGH:   { bg: 'var(--gold-l)', color: 'var(--gold)',  label: 'High'   },
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
  whatsapp: { label: 'WhatsApp', icon: 'chatBubble', color: '#15803d',     bg: '#f0fdf4',       border: '#15803d',     btnLabel: 'Send via WhatsApp' },
  sms:      { label: 'SMS',      icon: 'smartphone', color: '#7c3aed',     bg: '#f5f3ff',       border: '#7c3aed',     btnLabel: 'Send SMS'          },
  note:     { label: 'Note',     icon: 'fileText',   color: '#92400e',     bg: '#fefce8',       border: '#92400e',     btnLabel: 'Save Note'         },
};

const CHANNEL_LIST: ChannelId[] = ['inapp', 'email', 'whatsapp', 'sms', 'note'];
const CATEGORIES = ['Clearance Delay', 'Document Issue', 'Demurrage Dispute', 'Duty Assessment', 'System Error', 'General Query', 'Complaint'];
const OFFICERS   = ['Amina Hassan', 'John Mwangi', 'Fatuma Ally', 'Peter Kimani', 'Grace Osei'];
const PAGE_SIZES = [5, 10, 20, 25, 50];
const STATUS_ORDER: Record<StatusKey, number> = { OPEN: 0, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };

type MsgFilter = 'all' | 'whatsapp' | 'email' | 'note' | 'autosent' | 'sms';
const MSG_TABS: { key: MsgFilter; label: string; color: string }[] = [
  { key: 'all',      label: 'All',       color: 'var(--ink2)'  },
  { key: 'whatsapp', label: 'WhatsApp',  color: '#15803d'      },
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
const AVATAR_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#1a7f37','#9a6700','#cf222e','#d05c30','#0e7490'];
const initials    = (n: string) => n.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
const avatarColor = (n: string) => AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length];
const fmtDate     = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const relTime = (d: string) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)     return 'Just now';
  if (s < 3600)   return `${Math.floor(s / 60)}m`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h`;
  if (s < 172800) return 'Yesterday';
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/* ── Atom components ── */
function Av({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarColor(name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.34, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font)', letterSpacing: '0.03em' }}>
      {initials(name)}
    </div>
  );
}

function PBadge({ p }: { p: string }) {
  const c = PRIORITY_CFG[p as PriorityKey] ?? PRIORITY_CFG.LOW;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />{c.label}
    </span>
  );
}

function SBadge({ s }: { s: string }) {
  const c = STATUS_CFG[s as StatusKey] ?? STATUS_CFG.OPEN;
  return <span style={{ padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</span>;
}

function ChPill({ ch }: { ch: ChannelId }) {
  const c = CHANNEL_CFG[ch] ?? CHANNEL_CFG.inapp;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 9, background: c.bg, color: c.color, fontSize: 10, fontWeight: 700 }}>
      <Icon name={c.icon} size={9} strokeWidth={2} />{c.label}
    </span>
  );
}

/* ══════════════════════════════════════════
   FULL-WIDTH TICKET ROW
══════════════════════════════════════════ */
function TicketRow({ ticket, onSelect }: { ticket: Ticket; onSelect: () => void }) {
  const priCfg = PRIORITY_CFG[ticket.priority];
  const isUnread = ticket.status === 'OPEN';

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 16px',
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${priCfg.color}`,
        borderRadius: 9, marginBottom: 6,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Av name={ticket.customer} size={38} />
        {isUnread && <span style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--white)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: isUnread ? 700 : 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{ticket.subject}</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{ticket.customer}</span>
          {ticket.description && ` · ${ticket.description.slice(0, 90)}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <SBadge s={ticket.status} />
        <PBadge p={ticket.priority} />
        <span style={{ fontSize: 11, color: 'var(--ink3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.category}</span>
        {ticket.assigned_to && <Av name={ticket.assigned_to} size={22} />}
        {(ticket.message_count ?? 0) > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--ink3)' }}>
            <Icon name="message" size={11} strokeWidth={1.75} />{ticket.message_count}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--ink3)', minWidth: 30, textAlign: 'right' }}>{relTime(ticket.updated_at || ticket.created_at)}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGINATION BAR
══════════════════════════════════════════ */
function PaginationBar({ page, totalPages, total, pageSize, setPage, setPageSize }: {
  page: number; totalPages: number; total: number;
  pageSize: number; setPage: (p: number) => void; setPageSize: (n: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end   = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const btn = (label: React.ReactNode, onClick: () => void, active = false, disabled = false) => (
    <button
      key={String(label)} type="button" onClick={onClick} disabled={disabled}
      style={{ minWidth: 30, height: 30, padding: '0 7px', border: `1.5px solid ${active ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 7, background: active ? 'var(--teal)' : 'var(--white)', color: active ? '#fff' : disabled ? 'var(--ink3)' : 'var(--ink)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >{label}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', minWidth: 160 }}>
        {total === 0 ? 'No tickets' : `Showing ${from}–${to} of ${total} ticket${total !== 1 ? 's' : ''}`}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {btn('«', () => setPage(1), false, page === 1)}
        {btn('‹', () => setPage(page - 1), false, page === 1)}
        {pages.map(p => btn(p, () => setPage(p), p === page))}
        {btn('›', () => setPage(page + 1), false, page >= totalPages)}
        {btn('»', () => setPage(totalPages), false, page >= totalPages)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 160, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Per page:</span>
        <select title="Tickets per page" value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
          style={{ padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', background: 'var(--white)', cursor: 'pointer' }}>
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   FULL-WIDTH TICKET LIST (no selection)
══════════════════════════════════════════ */
function FullTicketList({ tickets, filter, setFilter, search, setSearch, onSelect, onNew, page, setPage, pageSize, setPageSize }: {
  tickets: Ticket[];
  filter: StatusFilter; setFilter: (f: StatusFilter) => void;
  search: string; setSearch: (s: string) => void;
  onSelect: (t: Ticket) => void; onNew: () => void;
  page: number; setPage: (p: number) => void;
  pageSize: number; setPageSize: (n: number) => void;
}) {
  const cnt = (k: StatusFilter) => k === 'all' ? tickets.length : tickets.filter(t => t.status === k).length;

  const filtered = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return t.subject.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q);
  }).sort(sortTickets);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'OPEN', label: 'Open' },
    { key: 'IN_PROGRESS', label: 'Active' }, { key: 'RESOLVED', label: 'Resolved' },
    { key: 'CLOSED', label: 'Closed' },
  ];

  const metrics = [
    { label: 'Total',    value: tickets.length,              color: 'var(--ink)',  bg: 'var(--bg)'      },
    { label: 'Open',     value: cnt('OPEN'),                  color: 'var(--red)',  bg: 'var(--red-l)'   },
    { label: 'Active',   value: cnt('IN_PROGRESS'),           color: 'var(--gold)', bg: 'var(--gold-l)'  },
    { label: 'Resolved', value: cnt('RESOLVED'),              color: 'var(--green)',bg: 'var(--green-l)' },
    { label: 'Closed',   value: cnt('CLOSED'),                color: 'var(--ink3)', bg: 'var(--bg)'      },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Metrics / header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 6 }}>
          <Icon name="headphones" size={18} strokeWidth={2} style={{ color: 'var(--teal)' } as React.CSSProperties} />
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Support</span>
        </div>
        {metrics.map(m => (
          <div key={m.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 14px', borderRadius: 9, background: m.bg, border: `1px solid ${m.color}22` }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</span>
            <span style={{ fontSize: 11.5, color: m.color, fontWeight: 600 }}>{m.label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button type="button" onClick={onNew}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--teal)', border: 'none', borderRadius: 9, cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)' }}>
            <Icon name="plus" size={13} strokeWidth={2.5} /> New Ticket
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--border)', flexShrink: 0 }}>
          {TABS.map((tab, i) => {
            const active = filter === tab.key;
            const count  = cnt(tab.key);
            return (
              <button key={tab.key} type="button" onClick={() => { setFilter(tab.key); setPage(1); }}
                style={{ padding: '6px 12px', border: 'none', borderRight: i < TABS.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', background: active ? 'var(--teal)' : 'var(--white)', color: active ? '#fff' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                {tab.label}
                {count > 0 && <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 9, background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg)', color: active ? '#fff' : 'var(--ink3)', fontWeight: 700 }}>{count}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Icon name="search" size={13} strokeWidth={1.75} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' } as React.CSSProperties} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by subject, customer or ref…"
            style={{ width: '100%', padding: '7px 28px 7px 30px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 12.5, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' as const, outline: 'none' }} />
          {search && <button type="button" onClick={() => { setSearch(''); setPage(1); }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>
          <Icon name="zap" size={11} strokeWidth={2} /> Unread first
        </span>
      </div>

      {/* Ticket rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {paged.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)' }}>
            <Icon name="headphones" size={32} strokeWidth={1.25} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.3 } as React.CSSProperties} />
            <div style={{ fontSize: 14 }}>No tickets found</div>
          </div>
        ) : paged.map(t => <TicketRow key={t.id} ticket={t} onSelect={() => onSelect(t)} />)}
      </div>

      {/* Pagination */}
      <PaginationBar page={safePage} totalPages={totalPages} total={filtered.length}
        pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </div>
  );
}

/* ══════════════════════════════════════════
   COL 1 — Conversation list (3-col mode)
══════════════════════════════════════════ */
const CONV_PAGE_SIZE = 8;

function ConvList({ tickets, selected, onSelect, onBack, onNew, search, setSearch, filter, setFilter }: {
  tickets: Ticket[]; selected: Ticket | null;
  onSelect: (t: Ticket) => void; onBack: () => void; onNew: () => void;
  search: string; setSearch: (s: string) => void;
  filter: StatusFilter; setFilter: (f: StatusFilter) => void;
}) {
  const [convPage, setConvPage] = useState(1);
  const cnt = (k: StatusFilter) => k === 'all' ? tickets.length : tickets.filter(t => t.status === k).length;

  const visible = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return t.subject.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q);
  }).sort(sortTickets);

  const totalConvPages = Math.max(1, Math.ceil(visible.length / CONV_PAGE_SIZE));
  const safePage = Math.min(convPage, totalConvPages);
  const paged = visible.slice((safePage - 1) * CONV_PAGE_SIZE, safePage * CONV_PAGE_SIZE);

  useEffect(() => { setConvPage(1); }, [filter, search]);

  const TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'OPEN', label: 'Open' },
    { key: 'IN_PROGRESS', label: 'Active' }, { key: 'RESOLVED', label: 'Resolved' },
  ];

  return (
    <div style={{ width: 300, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button type="button" onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', padding: '2px 0' }}>
            <Icon name="arrowLeft" size={13} strokeWidth={2.5} /> All Tickets
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 9, background: 'var(--teal-l)', color: 'var(--teal)', fontWeight: 700 }}>{tickets.length}</span>
            <button type="button" onClick={onNew} title="New ticket" style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--teal)', border: 'none', borderRadius: 7, cursor: 'pointer', color: '#fff' }}>
              <Icon name="plus" size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={13} strokeWidth={1.75} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ width: '100%', padding: '6px 26px 6px 28px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 12, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--bg)', boxSizing: 'border-box' as const, outline: 'none' }} />
          {search && <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 14, padding: 0 }}>×</button>}
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 4px' }}>
        {TABS.map(tab => {
          const active = filter === tab.key;
          const count  = cnt(tab.key);
          return (
            <button key={tab.key} type="button" onClick={() => setFilter(tab.key)}
              style={{ padding: '7px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)', color: active ? 'var(--teal)' : 'var(--ink3)', borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
              {tab.label}
              {count > 0 && <span style={{ fontSize: 10, padding: '0 4px', borderRadius: 9, background: active ? 'var(--teal-l)' : 'var(--bg)', color: active ? 'var(--teal)' : 'var(--ink3)', fontWeight: 700 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {paged.length === 0 && (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No conversations found</div>
        )}
        {paged.map(t => {
          const isSel  = selected?.id === t.id;
          const priCfg = PRIORITY_CFG[t.priority];
          const urgHigh= t.priority === 'URGENT' || t.priority === 'HIGH';
          const lastMsg= t.messages?.[t.messages.length - 1];
          return (
            <div key={t.id} onClick={() => onSelect(t)}
              style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'var(--teal-l)' : 'var(--white)', borderLeft: `3px solid ${urgHigh ? priCfg.color : isSel ? 'var(--teal)' : 'transparent'}`, transition: 'background 0.1s' }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isSel ? 'var(--teal-l)' : 'var(--white)'; }}
            >
              <div style={{ display: 'flex', gap: 9 }}>
                <Av name={t.customer} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? 'var(--teal)' : 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{t.customer}</span>
                    <span style={{ fontSize: 10, color: 'var(--ink3)', flexShrink: 0 }}>{relTime(t.updated_at || t.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{t.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                    {lastMsg ? `${lastMsg.author_type === 'OFFICER' ? '↳ ' : ''}${lastMsg.content}` : t.description?.slice(0, 55) ?? '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <SBadge s={t.status} />
                    {lastMsg?.channel && <ChPill ch={lastMsg.channel as ChannelId} />}
                    {(t.message_count ?? 0) > 0 && (
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--ink3)' }}>
                        <Icon name="message" size={10} strokeWidth={1.75} />{t.message_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact pagination footer */}
      {totalConvPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderTop: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
          <button type="button" disabled={safePage <= 1} onClick={() => setConvPage(p => p - 1)}
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', color: safePage <= 1 ? 'var(--ink3)' : 'var(--ink)', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.4 : 1, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)' }}>
            <Icon name="arrowLeft" size={11} strokeWidth={2} /> Prev
          </button>
          <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
            {safePage} / {totalConvPages}
            <span style={{ marginLeft: 4, color: 'var(--ink3)', fontWeight: 400 }}>({visible.length})</span>
          </span>
          <button type="button" disabled={safePage >= totalConvPages} onClick={() => setConvPage(p => p + 1)}
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', color: safePage >= totalConvPages ? 'var(--ink3)' : 'var(--ink)', cursor: safePage >= totalConvPages ? 'not-allowed' : 'pointer', opacity: safePage >= totalConvPages ? 0.4 : 1, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)' }}>
            Next <Icon name="arrowRight" size={11} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   COL 2 — Comms Hub Thread + Composer
══════════════════════════════════════════ */
function ThreadPanel({ ticket, onStatusChange, authorName, onClose }: {
  ticket: Ticket; onStatusChange: (id: string, s: StatusKey) => void;
  authorName: string; onClose: () => void;
}) {
  const [messages, setMessages]   = useState<Message[]>(ticket.messages || []);
  const [sending, setSending]     = useState(false);
  const [sendCh, setSendCh]       = useState<ChannelId>('inapp');
  const [msgFilter, setMsgFilter] = useState<MsgFilter>('all');
  const [compose, setCompose]     = useState('');
  const [emailSubj, setEmailSubj] = useState(`Re: [${ticket.ref}] ${ticket.subject}`);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(ticket.messages || []);
    setEmailSubj(`Re: [${ticket.ref}] ${ticket.subject}`);
    setCompose('');
    setSendCh('inapp');
    setMsgFilter('all');
  }, [ticket.id]); // eslint-disable-line

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    const content = compose.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await apiFetch(`/v1/shipments/${ticket.id}/messages`, {
        method: 'POST', body: JSON.stringify({ content, channel: sendCh.toUpperCase() }),
      });
    } catch { /* silent */ }
    setMessages(prev => [...prev, {
      id: Date.now().toString(), content, channel: sendCh,
      author_name: authorName, author_type: 'OFFICER' as const,
      created_at: new Date().toISOString(),
    }]);
    setCompose('');
    setSending(false);
  };

  const msgCounts: Record<MsgFilter, number> = {
    all:      messages.length,
    whatsapp: messages.filter(m => m.channel === 'whatsapp').length,
    email:    messages.filter(m => m.channel === 'email').length,
    note:     messages.filter(m => m.channel === 'note').length,
    autosent: 0,
    sms:      messages.filter(m => m.channel === 'sms').length,
  };

  const visible = msgFilter === 'all' ? messages
    : messages.filter(m => (m.channel || 'inapp') === msgFilter);

  const chCfg   = CHANNEL_CFG[sendCh];
  const sCfg    = STATUS_CFG[ticket.status];
  const smsLeft = 160 - compose.length;
  const canSend = compose.trim().length > 0 && !sending;

  const SEND_TABS: { ch: ChannelId; label: string }[] = [
    { ch: 'whatsapp', label: 'WhatsApp'      },
    { ch: 'email',    label: 'Email'         },
    { ch: 'note',     label: 'Internal Note' },
    { ch: 'inapp',    label: 'WeChat'        },
    { ch: 'sms',      label: 'SMS'           },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', minWidth: 0 }}>

      {/* ── Comms Hub header ── */}
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--navy)' }}>Comms Hub</span>
        <span style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 2px' }}>—</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--teal)', fontWeight: 700, letterSpacing: '0.04em' }}>{ticket.ref}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7, alignItems: 'center' }}>
          <select title="Status" value={ticket.status} onChange={e => onStatusChange(ticket.id, e.target.value as StatusKey)}
            style={{ padding: '4px 8px', border: `1.5px solid ${sCfg.color}55`, borderRadius: 7, fontSize: 11.5, fontFamily: 'var(--font)', color: sCfg.color, background: sCfg.bg, fontWeight: 700, cursor: 'pointer' }}>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <button type="button"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--white)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink2)' }}>
            <Icon name="users" size={12} strokeWidth={2} /> Participants
          </button>
          <button type="button"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--white)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink2)' }}>
            <Icon name="zap" size={12} strokeWidth={2} /> Rules
          </button>
          <button type="button"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', border: 'none', borderRadius: 7, background: 'var(--navy)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', color: '#fff' }}>
            <Icon name="plus" size={12} strokeWidth={2.5} /> Compose
          </button>
          <button type="button" onClick={onClose} title="Close"
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--ink3)', flexShrink: 0 }}>
            <Icon name="x" size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Channel filter tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--white)', padding: '0 16px', flexShrink: 0, overflowX: 'auto' }}>
        {MSG_TABS.map(tab => {
          const count  = msgCounts[tab.key];
          const active = msgFilter === tab.key;
          return (
            <button key={tab.key} type="button" onClick={() => setMsgFilter(tab.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 13px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? tab.color : 'var(--ink3)', borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: count > 0 || active ? tab.color : 'var(--border)', opacity: active ? 1 : 0.55, flexShrink: 0 }} />
              {tab.label}
              <span style={{ fontSize: 11, fontWeight: 700, color: active ? tab.color : 'var(--ink3)' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Message thread ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>

        {/* System event: case opened */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 11.5, color: 'var(--ink3)' }}>
            <Icon name="fileText" size={11} strokeWidth={2} />
            Case <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', margin: '0 2px' }}>{ticket.ref}</span> opened · {relTime(ticket.created_at)}
          </span>
        </div>
        {ticket.description && (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 11.5, color: 'var(--ink3)' }}>
              <Icon name="paperclip" size={11} strokeWidth={2} />
              {ticket.description.slice(0, 70)}
            </span>
          </div>
        )}

        {visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink3)' }}>
            <Icon name="message" size={28} strokeWidth={1.25} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 } as React.CSSProperties} />
            <div style={{ fontSize: 13 }}>No messages — use the composer below</div>
          </div>
        )}

        {visible.map((m, idx) => {
          const ch     = (m.channel || 'inapp') as ChannelId;
          const isNote = ch === 'note';
          const isOff  = m.author_type === 'OFFICER';

          /* date separator */
          const prev     = visible[idx - 1];
          const mDate    = new Date(m.created_at);
          const pDate    = prev ? new Date(prev.created_at) : null;
          const showDate = !pDate || mDate.toDateString() !== pDate.toDateString();
          const dateLbl  = mDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const timeLbl  = mDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

          return (
            <React.Fragment key={m.id}>
              {showDate && (
                <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink3)', letterSpacing: '0.02em' }}>{dateLbl}</span>
                </div>
              )}

              {isNote ? (
                /* ── Internal Note card ── */
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                    <Av name={m.author_name} size={30} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{m.author_name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{timeLbl}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#fef9c3', border: '1px solid #fde04788', borderRadius: 6, fontSize: 10.5, fontWeight: 700, color: '#92400e' }}>
                      🔒 Internal
                    </span>
                  </div>
                  <div style={{ marginLeft: 39, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ padding: '7px 14px', background: '#fefce8', borderBottom: '1px solid #fde04766' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>INTERNAL NOTE</span>
                    </div>
                    <div style={{ padding: '11px 14px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.65 }}>{m.content}</div>
                    <div style={{ padding: '6px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{timeLbl}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>·</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>🔒 Internal · not visible to customer</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Regular message bubble ── */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOff ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, flexDirection: isOff ? 'row-reverse' : 'row', maxWidth: '78%' }}>
                    <Av name={m.author_name} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexDirection: isOff ? 'row-reverse' : 'row' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{m.author_name}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{timeLbl}</span>
                        <ChPill ch={ch} />
                      </div>
                      <div style={{ padding: '9px 14px', borderRadius: isOff ? '12px 2px 12px 12px' : '2px 12px 12px 12px', background: isOff ? 'var(--navy)' : 'var(--white)', color: isOff ? '#fff' : 'var(--ink)', fontSize: 13, lineHeight: 1.6, border: isOff ? 'none' : '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        {m.content}
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

      {/* ── Composer ── */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>

        {/* Send via pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 600, marginRight: 10, flexShrink: 0 }}>Send via:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SEND_TABS.map(({ ch, label }) => {
              const c      = CHANNEL_CFG[ch];
              const active = sendCh === ch;
              return (
                <button key={ch} type="button" onClick={() => setSendCh(ch)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', border: `1.5px solid ${active ? c.color : 'var(--border)'}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', background: active ? c.bg : 'var(--white)', color: active ? c.color : 'var(--ink3)', whiteSpace: 'nowrap', transition: 'all 0.12s' }}>
                  <Icon name={c.icon} size={11} strokeWidth={2} />{label}
                </button>
              );
            })}
          </div>
        </div>

        {/* To: recipient chip row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderBottom: '1px solid var(--border)', minHeight: 34 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', flexShrink: 0 }}>To:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 6px', background: 'var(--teal-l)', border: '1px solid var(--teal)', borderRadius: 20, fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
              <Av name={ticket.customer} size={18} />
              {ticket.customer}{ticket.customer_phone ? ` (${ticket.customer_phone})` : ''}
              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: '0 0 0 2px', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
            </span>
            <button type="button" style={{ fontSize: 12, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>+ Add</button>
          </div>
        </div>

        {/* Subject line (email only) */}
        {sendCh === 'email' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', flexShrink: 0, width: 52 }}>Subject:</span>
            <input value={emailSubj} onChange={e => setEmailSubj(e.target.value)}
              style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5, fontFamily: 'var(--font)', color: 'var(--ink)', outline: 'none' }} />
          </div>
        )}

        {/* Textarea */}
        <div style={{ padding: '10px 14px 4px' }}>
          {sendCh === 'note' && (
            <div style={{ fontSize: 11, color: '#92400e', fontWeight: 600, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>🔒</span> Internal note — not visible to customer
            </div>
          )}
          <textarea rows={3} value={compose}
            onChange={e => setCompose(sendCh === 'sms' ? e.target.value.slice(0, 160) : e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && sendCh !== 'email') { e.preventDefault(); handleSend(); } }}
            placeholder={sendCh === 'note' ? 'Write an internal note…' : sendCh === 'email' ? 'Compose email body…' : sendCh === 'whatsapp' ? 'WhatsApp message…' : sendCh === 'sms' ? 'SMS (160 chars)…' : 'Type a message…'}
            style={{ width: '100%', resize: 'none', padding: '6px 0', border: 'none', borderTop: `1.5px solid ${sendCh !== 'inapp' ? chCfg.border + '55' : 'var(--border)'}`, fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', lineHeight: 1.6, background: sendCh === 'note' ? '#fefce8' : 'transparent', boxSizing: 'border-box' as const, outline: 'none' }} />
        </div>

        {/* Toolbar + Send */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 14px 10px' }}>
          <div style={{ display: 'flex', gap: 1 }}>
            {(['paperclip', 'slash', 'bold', 'smile', 'clock', 'link'] as IconName[]).map(icon => (
              <button key={icon} type="button"
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 5, color: 'var(--ink3)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <Icon name={icon} size={14} strokeWidth={1.75} />
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sendCh === 'sms' && (
              <span style={{ fontSize: 11, color: smsLeft < 20 ? 'var(--red)' : 'var(--ink3)', fontWeight: 600 }}>{smsLeft}</span>
            )}
            <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 600 }}>
              {sendCh === 'note' ? '🔒 Note' : sendCh === 'email' ? 'Email' : sendCh === 'whatsapp' ? 'WhatsApp' : sendCh === 'sms' ? 'SMS' : 'WeChat'}
            </span>
            <button type="button" onClick={handleSend} disabled={!canSend}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 20px', border: 'none', borderRadius: 9, background: canSend ? (sendCh === 'note' ? '#92400e' : chCfg.color) : 'var(--border)', color: canSend ? '#fff' : 'var(--ink3)', cursor: canSend ? 'pointer' : 'not-allowed', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13.5, transition: 'background 0.12s' }}>
              {sending ? 'Sending…' : 'Send'} {!sending && <Icon name="arrowUp" size={13} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   COL 3 — Channel Status Panel
══════════════════════════════════════════ */
function ChannelStatusPanel({ ticket }: { ticket: Ticket }) {
  const navigate = useNavigate();
  const [rules, setRules] = useState({
    dailyStatusWa:    true,
    dailyStatusEmail: true,
    missingDoc:       true,
    demurrageAlert:   true,
    stageAdvance:     true,
    paymentRequest:   false,
  });

  const totalMsgs  = ticket.message_count ?? (ticket.messages?.length ?? 0);
  const emailMsgs  = ticket.messages?.filter(m => m.channel === 'email').length  ?? 0;
  const noteMsgs   = ticket.messages?.filter(m => m.channel === 'note').length   ?? 0;
  const waMsgs     = ticket.messages?.filter(m => m.channel === 'whatsapp').length ?? 0;
  const custSlug   = ticket.customer.toLowerCase().replace(/\s+/g, '');

  const RULE_LIST = [
    { key: 'dailyStatusWa',    dot: '#15803d', label: 'Daily status update (08:00 EAT) → WhatsApp' },
    { key: 'dailyStatusEmail', dot: '#2563eb', label: 'Daily status update → Email (CC)'            },
    { key: 'missingDoc',       dot: '#d97706', label: 'Missing doc reminder (24h, max 3)'           },
    { key: 'demurrageAlert',   dot: '#dc2626', label: 'Demurrage alert → WhatsApp + Email'          },
    { key: 'stageAdvance',     dot: '#15803d', label: 'Stage advance notification'                  },
    { key: 'paymentRequest',   dot: '#6b7280', label: 'Payment confirmation request'                },
  ] as const;

  const WA_MEMBERS = [
    { name: ticket.customer,                 role: 'Customer' },
    { name: ticket.assigned_to || 'Officer', role: 'Officer'  },
    { name: 'Finance Officer',               role: 'Finance'  },
    { name: 'ClearOS Bot',                   role: 'Auto'     },
  ];

  return (
    <div style={{ width: 292, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>Channel Status</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Total messages */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Messages this case</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{totalMsgs} msgs</span>
        </div>

        {/* Email */}
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="mail" size={14} color="#2563eb" strokeWidth={2} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>Email</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>● Connected</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 8 }}>
            SMTP · ops@{custSlug}.co.tz (primary)<br />
            cc: finance@{custSlug}.co.tz
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)' }}>
            <span>Messages this case</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{emailMsgs} emails</span>
          </div>
        </div>

        {/* Internal Notes */}
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="fileText" size={14} color="#92400e" strokeWidth={2} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>Internal Notes</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>● Active</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 8 }}>
            Visible to officers and managers only.<br />Never sent to customer.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)' }}>
            <span>Notes this case</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{noteMsgs} notes</span>
          </div>
        </div>

        {/* WhatsApp */}
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="chatBubble" size={14} color="#15803d" strokeWidth={2} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>WhatsApp</span>
            {waMsgs > 0
              ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>● Active</span>
              : <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--bg)', color: 'var(--ink3)', border: '1px solid var(--border)' }}>○ Not configured</span>
            }
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 8 }}>
            {waMsgs > 0
              ? `Linked to ${ticket.customer_phone || ticket.customer}.`
              : 'Customer has not linked a WhatsApp ID. Activate in customer settings.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)' }}>
            <span>Messages this case</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{waMsgs}</span>
          </div>
        </div>

        {/* Related shipments (compact) */}
        {(ticket.related_shipments?.length ?? 0) > 0 && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Related Shipments</div>
            {ticket.related_shipments!.map(ref => (
              <button key={ref} type="button" onClick={() => navigate(`/shipments?search=${ref}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', marginBottom: 4, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' }}>
                <Icon name="package" size={12} strokeWidth={1.75} style={{ color: 'var(--teal)', flexShrink: 0 } as React.CSSProperties} />
                <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700, flex: 1 }}>{ref}</span>
                <Icon name="externalLink" size={11} strokeWidth={1.75} style={{ color: 'var(--ink3)', flexShrink: 0 } as React.CSSProperties} />
              </button>
            ))}
          </div>
        )}

        {/* Auto-notification rules */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 16px 5px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>
            Auto-notification Rules
          </div>
          {RULE_LIST.map(r => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.dot, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.45 }}>{r.label}</span>
              <button type="button"
                onClick={() => setRules(p => ({ ...p, [r.key]: !p[r.key] }))}
                style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: rules[r.key] ? 'var(--teal)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.18s' }}>
                <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.18s', left: rules[r.key] ? 18 : 2 }} />
              </button>
            </div>
          ))}
        </div>

        {/* WA Group Members */}
        <div>
          <div style={{ padding: '8px 16px 5px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>
            WA Group Members
          </div>
          <div style={{ padding: '5px 16px 5px', background: 'var(--bg)', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            DI-OPERATIONS-GROUP
          </div>
          {WA_MEMBERS.map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <Av name={m.name} size={26} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--ink3)', flexShrink: 0 }}>{m.role}</span>
            </div>
          ))}
        </div>

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
  const [custMap, setCustMap]   = useState<Map<string, SysCustomer>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<StatusFilter>('all');
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm]   = useState({ subject: '', customer: '', customer_id: '', category: '', priority: 'MEDIUM', description: '' });

  useEffect(() => { setPage(1); }, [filter, search]);

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

  const buildTickets = useCallback((shipments: any[]): Ticket[] => {
    const phones = ['+255 712 345 678','+255 754 123 456','+255 787 654 321','+255 765 432 109','+255 743 987 654'];
    return shipments.slice(0, 40).map((s: any, i: number) => ({
      id: s.id,
      ref: s.ref_number || `TKT-${1000 + i}`,
      subject: `Clearance issue — ${s.goods_desc?.slice(0, 45) ?? s.ref_number}`,
      description: `Support case for ${s.customer_name ?? 'client'} re shipment ${s.ref_number}. ${s.goods_desc ?? ''}.`,
      customer: s.customer_name ?? 'Unknown',
      customer_id: s.customer_id,
      customer_email: `${(s.customer_name ?? 'unknown').toLowerCase().replace(/\s+/g, '.')}@customer.com`,
      customer_phone: phones[i % phones.length],
      customer_company: s.customer_name,
      category: CATEGORIES[i % CATEGORIES.length],
      status: (s.active_risk_types?.includes('DEMURRAGE') ? 'OPEN' :
               s.active_risk_types?.includes('SLA_BREACH') ? 'IN_PROGRESS' :
               s.stage === 'CLOSED' ? 'CLOSED' : 'IN_PROGRESS') as StatusKey,
      priority: (s.active_risk_types?.includes('DEMURRAGE') ? 'URGENT' :
                 s.active_risk_types?.includes('SLA_BREACH') ? 'HIGH' :
                 i % 5 === 0 ? 'LOW' : 'MEDIUM') as PriorityKey,
      assigned_to: OFFICERS[i % OFFICERS.length],
      created_at: s.created_at,
      updated_at: s.updated_at || s.created_at,
      message_count: (i + 2) % 9,
      tags: [CATEGORIES[i % CATEGORIES.length].toLowerCase().replace(/\s+/g, '-')],
      related_shipments: [s.ref_number],
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

  useEffect(() => {
    apiFetch('/v1/shipments')
      .then((r: any) => setTickets(buildTickets(r.data ?? r ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [buildTickets]);

  const openTicket = (t: Ticket) => {
    setSelected({ ...t, messages: mockMsgs(t) });
    apiFetch(`/v1/shipments/${t.id}/timeline`)
      .then((tl: any) => {
        if (tl?.messages?.length) setSelected(prev => prev?.id === t.id ? { ...prev, messages: tl.messages } : prev);
      })
      .catch(() => {});
  };

  const updateStatus = (id: string, status: StatusKey) => {
    setTickets(ts => ts.map(t => t.id === id ? { ...t, status } : t));
    setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
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
    setTickets(prev => [t, ...prev]);
    setShowCreate(false);
    setNewForm({ subject:'', customer:'', customer_id:'', category:'', priority:'MEDIUM', description:'' });
  };

  const custNames = Array.from(new Set(tickets.map(t => t.customer))).sort();

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', fontFamily: 'var(--font)', background: 'var(--bg)' }}>

      {selected ? (
        /* ── 3-column layout ── */
        <>
          <ConvList
            tickets={tickets} selected={selected} onSelect={openTicket}
            onBack={() => setSelected(null)} onNew={() => setShowCreate(true)}
            search={search} setSearch={setSearch} filter={filter} setFilter={setFilter}
          />
          <ThreadPanel ticket={selected} onStatusChange={updateStatus}
            authorName={user?.name || 'Officer'} onClose={() => setSelected(null)} />
          <ChannelStatusPanel ticket={selected} />
        </>
      ) : (
        /* ── Full-width list ── */
        <FullTicketList
          tickets={tickets} filter={filter} setFilter={setFilter}
          search={search} setSearch={setSearch}
          onSelect={openTicket} onNew={() => setShowCreate(true)}
          page={page} setPage={setPage}
          pageSize={pageSize} setPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      )}

      {/* New ticket modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: '90%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>New Support Ticket</h2>
              <button type="button" onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex', borderRadius: 6 }}>
                <Icon name="close" size={18} strokeWidth={2} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Subject *</label>
                <input required value={newForm.subject} onChange={e => setNewForm(p => ({ ...p, subject: e.target.value }))} placeholder="Brief description of the issue"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font)', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Customer *</label>
                  <input required list="cust-list" value={newForm.customer}
                    onChange={e => { const v = e.target.value; const m = custMap.get(v.toLowerCase()); setNewForm(p => ({ ...p, customer: v, customer_id: m?.id || '' })); }}
                    placeholder="Customer name"
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font)', boxSizing: 'border-box' as const }} />
                  <datalist id="cust-list">{custNames.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Priority</label>
                  <select title="Priority" value={newForm.priority} onChange={e => setNewForm(p => ({ ...p, priority: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', cursor: 'pointer' }}>
                    <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option><option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Category</label>
                <select title="Category" value={newForm.category} onChange={e => setNewForm(p => ({ ...p, category: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', cursor: 'pointer' }}>
                  <option value="">Select category…</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Description</label>
                <textarea rows={3} value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Detailed description…"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowCreate(false)}
                  style={{ padding: '8px 18px', border: '1.5px solid var(--border)', borderRadius: 9, background: 'var(--white)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink)' }}>Cancel</button>
                <button type="submit"
                  style={{ padding: '8px 20px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font)' }}>Create Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
