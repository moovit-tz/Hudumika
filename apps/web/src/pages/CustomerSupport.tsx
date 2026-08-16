import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from '../components/Icon.js';
import { LiveChatWidget } from '../components/LiveChatWidget.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

/* ── Types ── */
interface Message {
  id: string;
  from: 'customer' | 'agent';
  body: string;
  ts: string;
}

interface Ticket {
  id: string;
  ref: string;
  subject: string;
  description?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';
  category: string;
  lastMessage: string;
  updatedAt: string;
  messages: Message[];
}

/** Maps a GET /v1/support/tickets (list) or /tickets/:id row to the shape
 *  this page renders. The list endpoint has no `messages` — a ticket opened
 *  from the list starts with an empty thread until loadThread() below fills
 *  it in from the detail endpoint. */
function mapTicket(row: any): Ticket {
  return {
    id: row.id,
    ref: row.ref,
    subject: row.subject,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    category: row.category,
    lastMessage: row.description ? String(row.description).slice(0, 140) : '',
    updatedAt: row.updated_at,
    messages: [],
  };
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    from: row.author_type === 'CUSTOMER' ? 'customer' : 'agent',
    body: row.content,
    ts: row.created_at,
  };
}

const STATUS_CFG: Record<Ticket['status'], { label: string; color: string; bg: string }> = {
  OPEN:        { label: 'Open',        color: '#0891b2', bg: '#ecfeff' },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--gold)', bg: 'var(--gold-l)' },
  RESOLVED:    { label: 'Resolved',    color: '#059669', bg: 'var(--green-l)' },
  CLOSED:      { label: 'Closed',      color: 'var(--ink2)', bg: '#f3f4f6' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: 'var(--ink2)' },
  NORMAL: { label: 'Normal', color: '#0891b2' },
  MEDIUM: { label: 'Medium', color: '#0891b2' },
  HIGH:   { label: 'High',   color: 'var(--gold)' },
  URGENT: { label: 'Urgent', color: 'var(--red)' },
};

/* ── Helpers ── */
function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 0)    return 'Just now';
  if (diffH < 1)    return 'Just now';
  if (diffH < 24)   return `${Math.round(diffH)}h ago`;
  if (diffH < 48)   return 'Yesterday';
  return d.toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' });
}

function fmtTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' });
}

/* ── Ticket card ── */
function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const st = STATUS_CFG[ticket.status] || STATUS_CFG.OPEN;
  const pr = PRIORITY_CFG[ticket.priority] || PRIORITY_CFG.NORMAL;
  const isActive = ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS';

  return (
    <button
      type="button"
      title={ticket.subject}
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${pr.color}`,
        borderRadius: 'var(--r)', padding: '16px',
        fontFamily: 'var(--font)',
        boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
        opacity: ticket.status === 'CLOSED' ? 0.7 : 1,
      }}
    >
      {/* Row 1: ref + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', fontFamily: 'var(--mono)', letterSpacing: '0.03em' }}>
          {ticket.ref}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: st.color, background: st.bg,
          borderRadius: 20, padding: '2px 9px',
        }}>
          {st.label}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>
          {fmtDate(ticket.updatedAt)}
        </span>
      </div>

      {/* Subject */}
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.35 }}>
        {ticket.subject}
      </div>

      {/* Last message preview */}
      {ticket.lastMessage && (
        <div style={{
          fontSize: 13, color: 'var(--ink2)', lineHeight: 1.45,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          marginBottom: 10,
        }}>
          {ticket.lastMessage}
        </div>
      )}

      {/* Footer: category + priority */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 11, color: 'var(--ink3)', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px',
        }}>
          {ticket.category}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: pr.color }}>
          {(PRIORITY_CFG[ticket.priority] || PRIORITY_CFG.NORMAL).label} Priority
        </span>
      </div>
    </button>
  );
}

/* ── Thread view ── */
function TicketThread({ ticket, threadLoading, onBack, onReply }: {
  ticket: Ticket;
  threadLoading: boolean;
  onBack: () => void;
  onReply: (msg: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const st = STATUS_CFG[ticket.status];

  async function submit() {
    const t = reply.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onReply(t);
      setReply('');
    } catch (err: any) {
      showAlert(err.message || 'Could not send your message — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--white)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <button type="button" title="Back to tickets" onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 0',
              display: 'flex', alignItems: 'center', gap: 4, color: 'var(--teal)',
              fontWeight: 600, fontSize: 14, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="chevronLeft" size={18} color="var(--teal)" />
            Back
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{ticket.ref}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: st.color, background: st.bg,
            borderRadius: 20, padding: '2px 9px', marginLeft: 'auto',
          }}>
            {st.label}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
          {ticket.subject}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{ticket.category}</div>
        {ticket.description && (
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
            {ticket.description}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {threadLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, margin: 'auto' }}>Loading conversation…</div>
        ) : ticket.messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, margin: 'auto' }}>No replies yet</div>
        ) : ticket.messages.map((msg) => {
          const isMe = msg.from === 'customer';
          return (
            <div key={msg.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isMe ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '82%',
                background: isMe ? 'var(--teal)' : 'var(--white)',
                color: isMe ? '#fff' : 'var(--ink)',
                borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                padding: '10px 14px',
                fontSize: 14,
                lineHeight: 1.5,
                border: isMe ? 'none' : '1px solid var(--border)',
                boxShadow: 'var(--elev-sm)',
              }}>
                {msg.body}
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0 }}>
                {isMe ? (user?.name?.split(' ')[0] ?? 'You') : 'Support Agent'} · {fmtTime(msg.ts)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Reply box */}
      {(ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS') && (
        <div style={{
          borderTop: '1px solid var(--border)', background: 'var(--white)',
          padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-end',
        }}>
          <textarea
            title="Your reply"
            placeholder="Type your message…"
            value={reply}
            disabled={sending}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={2}
            style={{
              flex: 1, resize: 'none', border: '1.5px solid var(--border)', borderRadius: 9,
              padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font)', color: 'var(--ink)',
              background: 'var(--bg)', outline: 'none',
              lineHeight: 1.5,
            }}
          />
          <button
            type="button"
            title="Send reply"
            onClick={submit}
            disabled={!reply.trim() || sending}
            style={{
              background: reply.trim() && !sending ? 'var(--teal)' : 'var(--border)',
              color: '#fff', border: 'none', borderRadius: 'var(--r)',
              width: 44, height: 44, cursor: reply.trim() && !sending ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}>
            <Icon name="send" size={18} color="#fff" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── New ticket modal ── */
function NewTicketModal({ onClose, onCreate, creating }: {
  onClose: () => void;
  onCreate: (subject: string, category: string, body: string) => Promise<void>;
  creating: boolean;
}) {
  const [subject, setSubject]   = useState('');
  const [category, setCategory] = useState('Clearance');
  const [body, setBody]         = useState('');

  async function submit() {
    if (!subject.trim() || !body.trim() || creating) return;
    try {
      await onCreate(subject.trim(), category, body.trim());
    } catch (err: any) {
      showAlert(err.message || 'Could not submit your ticket — please try again.');
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: '20px 20px 0 0',
        padding: '20px 20px 32px', maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font)' }}>
            New Support Ticket
          </span>
          <button type="button" title="Close" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={20} color="var(--ink3)" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Category */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6, fontFamily: 'var(--font)' }}>
              Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Ticket category" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Clearance', 'Documentation', 'Billing', 'Delivery', 'Quote', 'Other'].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6, fontFamily: 'var(--font)' }}>
              Subject
            </label>
            <input
              type="text"
              title="Ticket subject"
              placeholder="Brief description of your issue"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{
                width: '100%', border: '1.5px solid var(--border)', borderRadius: 9,
                padding: '11px 14px', fontSize: 14, fontFamily: 'var(--font)', color: 'var(--ink)',
                background: 'var(--bg)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Message */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6, fontFamily: 'var(--font)' }}>
              Message
            </label>
            <textarea
              title="Describe your issue"
              placeholder="Provide as much detail as possible…"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              style={{
                width: '100%', resize: 'none', border: '1.5px solid var(--border)', borderRadius: 9,
                padding: '11px 14px', fontSize: 14, fontFamily: 'var(--font)', color: 'var(--ink)',
                background: 'var(--bg)', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="button"
            title="Submit ticket"
            onClick={submit}
            disabled={!subject.trim() || !body.trim() || creating}
            style={{
              background: subject.trim() && body.trim() && !creating ? 'var(--teal)' : 'var(--border)',
              color: '#fff', border: 'none', borderRadius: 'var(--r)',
              padding: '14px', fontSize: 15, fontWeight: 700,
              cursor: subject.trim() && body.trim() && !creating ? 'pointer' : 'default',
              fontFamily: 'var(--font)', letterSpacing: '0.01em',
            }}>
            {creating ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export const CustomerSupport: React.FC = () => {
  const [tickets, setTickets]           = useState<Ticket[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState(false);
  const [selected, setSelected]         = useState<Ticket | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showNew, setShowNew]           = useState(false);
  const [creating, setCreating]         = useState(false);
  const [filter, setFilter]             = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');

  const load = () => {
    setLoading(true); setLoadError(false);
    apiFetch('/v1/support/tickets')
      .then((rows: any[]) => setTickets(Array.isArray(rows) ? rows.map(mapTicket) : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function openTicket(ticket: Ticket) {
    setSelected(ticket);
    setThreadLoading(true);
    try {
      const detail = await apiFetch(`/v1/support/tickets/${ticket.id}`);
      const full: Ticket = { ...mapTicket(detail), messages: (detail.messages ?? []).map(mapMessage) };
      setSelected(full);
      setTickets(prev => prev.map(t => t.id === full.id ? full : t));
    } catch {
      showAlert("Couldn't load this conversation — please try again.");
      setSelected(null);
    } finally {
      setThreadLoading(false);
    }
  }

  const filtered = tickets.filter(t => {
    if (filter === 'ALL')      return true;
    if (filter === 'OPEN')     return t.status === 'OPEN' || t.status === 'IN_PROGRESS';
    if (filter === 'RESOLVED') return t.status === 'RESOLVED' || t.status === 'CLOSED';
    return true;
  });

  async function handleReply(ticketId: string, msg: string) {
    const row = await apiFetch(`/v1/support/tickets/${ticketId}/customer-reply`, {
      method: 'POST', body: JSON.stringify({ content: msg }),
    });
    const newMsg = mapMessage(row);
    setSelected(prev => (prev && prev.id === ticketId) ? { ...prev, messages: [...prev.messages, newMsg] } : prev);
    setTickets(prev => prev.map(t => t.id === ticketId
      ? { ...t, lastMessage: msg, updatedAt: new Date().toISOString() }
      : t));
  }

  async function handleCreate(subject: string, category: string, body: string) {
    setCreating(true);
    try {
      const row = await apiFetch('/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, category, description: body, priority: 'NORMAL', channel: 'IN_APP' }),
      });
      const ticket = mapTicket(row);
      setTickets(prev => [ticket, ...prev]);
      setShowNew(false);
      setSelected(ticket);
    } finally {
      setCreating(false);
    }
  }

  /* ── Thread view ── */
  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', background: 'var(--bg)' }}>
        <TicketThread
          ticket={selected}
          threadLoading={threadLoading}
          onBack={() => setSelected(null)}
          onReply={(msg) => handleReply(selected.id, msg)}
        />
        {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreate={handleCreate} creating={creating} />}
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div style={{ padding: '0 0 20px', fontFamily: 'var(--font)' }}>
      {/* Page header */}
      <div style={{
        padding: '20px 16px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Support</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink3)' }}>
            {loading ? 'Loading…' : `${tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length} open ticket(s)`}
          </p>
        </div>
        <button
          type="button"
          title="Create new ticket"
          onClick={() => setShowNew(true)}
          style={{
            background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)',
            padding: 'var(--ds-btn-py) 18px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'var(--font)',
            display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="plus" size={16} color="#fff" />
          New
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ padding: '0 16px', display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['ALL', 'OPEN', 'RESOLVED'] as const).map(f => (
          <button
            key={f}
            type="button"
            title={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'var(--teal)' : 'var(--white)',
              color: filter === f ? '#fff' : 'var(--ink2)',
              border: `1.5px solid ${filter === f ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 20, padding: 'var(--ds-btn-py) 16px',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {f === 'ALL' ? 'All' : f === 'OPEN' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {/* Card list */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, height: 120 }} />
          ))
        ) : loadError ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="alertCircle" size={36} color="var(--red)" />
            <p style={{ color: 'var(--ink2)', fontSize: 14, margin: '12px 0 4px', fontWeight: 600 }}>Couldn't load your tickets</p>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px' }}>Check your connection and try again.</p>
            <button type="button" onClick={load} style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
            padding: '40px 20px', textAlign: 'center',
          }}>
            <Icon name="headphones" size={36} color="var(--ink3)" />
            <p style={{ color: 'var(--ink3)', fontSize: 15, margin: '12px 0 8px' }}>No tickets yet</p>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 20px' }}>
              Our support team is ready to help
            </p>
            <button type="button" title="Open new ticket" onClick={() => setShowNew(true)}
              style={{
                background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)',
                padding: 'var(--ds-btn-py) 22px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              Open a Ticket
            </button>
          </div>
        ) : (
          filtered.map(t => (
            <TicketCard key={t.id} ticket={t} onClick={() => openTicket(t)} />
          ))
        )}
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreate={handleCreate} creating={creating} />}
      <LiveChatWidget />
    </div>
  );
};
