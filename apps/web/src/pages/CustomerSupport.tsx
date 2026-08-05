import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
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
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  category: string;
  lastMessage: string;
  updatedAt: string;
  messages: Message[];
}

/* ── Mock data ── */
const MOCK_TICKETS: Ticket[] = [
  {
    id: 't1',
    ref: 'TKT-0041',
    subject: 'Documents missing for CLR-2026-0003',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    category: 'Documentation',
    lastMessage: 'We are reviewing your packing list and will update you shortly.',
    updatedAt: '2026-06-14T10:22:00Z',
    messages: [
      { id: 'm1', from: 'customer', body: 'The packing list I uploaded seems to be rejected. Can you advise?', ts: '2026-06-14T09:05:00Z' },
      { id: 'm2', from: 'agent',    body: 'We are reviewing your packing list and will update you shortly.', ts: '2026-06-14T10:22:00Z' },
    ],
  },
  {
    id: 't2',
    ref: 'TKT-0038',
    subject: 'Customs delay — ETA update needed',
    status: 'OPEN',
    priority: 'URGENT',
    category: 'Clearance',
    lastMessage: 'Please provide an updated ETA for our shipment CLR-2026-0001.',
    updatedAt: '2026-06-13T16:44:00Z',
    messages: [
      { id: 'm1', from: 'customer', body: 'Please provide an updated ETA for our shipment CLR-2026-0001.', ts: '2026-06-13T16:44:00Z' },
    ],
  },
  {
    id: 't3',
    ref: 'TKT-0031',
    subject: 'Invoice TZS 4.2M — payment receipt',
    status: 'RESOLVED',
    priority: 'NORMAL',
    category: 'Billing',
    lastMessage: 'Payment confirmed. Receipt has been sent to your email.',
    updatedAt: '2026-06-10T08:00:00Z',
    messages: [
      { id: 'm1', from: 'customer', body: 'Can I get a receipt for the payment I made on June 9th?', ts: '2026-06-09T14:00:00Z' },
      { id: 'm2', from: 'agent',    body: 'Payment confirmed. Receipt has been sent to your email.', ts: '2026-06-10T08:00:00Z' },
    ],
  },
];

const STATUS_CFG: Record<Ticket['status'], { label: string; color: string; bg: string }> = {
  OPEN:        { label: 'Open',        color: '#0891b2', bg: '#ecfeff' },
  IN_PROGRESS: { label: 'In Progress', color: '#d97706', bg: '#fef3c7' },
  RESOLVED:    { label: 'Resolved',    color: '#059669', bg: '#ecfdf5' },
  CLOSED:      { label: 'Closed',      color: '#6b7280', bg: '#f3f4f6' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: '#6b7280' },
  NORMAL: { label: 'Normal', color: '#0891b2' },
  MEDIUM: { label: 'Medium', color: '#0891b2' },
  HIGH:   { label: 'High',   color: '#d97706' },
  URGENT: { label: 'Urgent', color: '#dc2626' },
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
      <div style={{
        fontSize: 13, color: 'var(--ink2)', lineHeight: 1.45,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        marginBottom: 10,
      }}>
        {ticket.lastMessage}
      </div>

      {/* Footer: category + priority */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 11, color: 'var(--ink3)', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px',
        }}>
          {ticket.category}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: pr.color }}>
          {pr.label} Priority
        </span>
      </div>
    </button>
  );
}

/* ── Thread view ── */
function TicketThread({ ticket, onBack, onReply }: {
  ticket: Ticket;
  onBack: () => void;
  onReply: (msg: string) => void;
}) {
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const st = STATUS_CFG[ticket.status];

  function submit() {
    const t = reply.trim();
    if (!t) return;
    onReply(t);
    setReply('');
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
              fontWeight: 600, fontSize: 14, fontFamily: 'var(--font)',
            }}>
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
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ticket.messages.map((msg) => {
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
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
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
            disabled={!reply.trim()}
            style={{
              background: reply.trim() ? 'var(--teal)' : 'var(--border)',
              color: '#fff', border: 'none', borderRadius: 'var(--r)',
              width: 44, height: 44, cursor: reply.trim() ? 'pointer' : 'default',
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
function NewTicketModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (subject: string, category: string, body: string) => void;
}) {
  const [subject, setSubject]   = useState('');
  const [category, setCategory] = useState('Clearance');
  const [body, setBody]         = useState('');

  function submit() {
    if (!subject.trim() || !body.trim()) return;
    onCreate(subject.trim(), category, body.trim());
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
            disabled={!subject.trim() || !body.trim()}
            style={{
              background: subject.trim() && body.trim() ? 'var(--teal)' : 'var(--border)',
              color: '#fff', border: 'none', borderRadius: 'var(--r)',
              padding: '14px', fontSize: 15, fontWeight: 700,
              cursor: subject.trim() && body.trim() ? 'pointer' : 'default',
              fontFamily: 'var(--font)', letterSpacing: '0.01em',
            }}>
            Submit Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export const CustomerSupport: React.FC = () => {
  const [tickets, setTickets]           = useState<Ticket[]>(MOCK_TICKETS);
  const [selected, setSelected]         = useState<Ticket | null>(null);
  const [showNew, setShowNew]           = useState(false);
  const [filter, setFilter]             = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');

  const filtered = tickets.filter(t => {
    if (filter === 'ALL')      return true;
    if (filter === 'OPEN')     return t.status === 'OPEN' || t.status === 'IN_PROGRESS';
    if (filter === 'RESOLVED') return t.status === 'RESOLVED' || t.status === 'CLOSED';
    return true;
  });

  function handleReply(ticketId: string, msg: string) {
    setTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      const newMsg: Message = {
        id: `m${Date.now()}`,
        from: 'customer',
        body: msg,
        ts: new Date().toISOString(),
      };
      return { ...t, messages: [...t.messages, newMsg], lastMessage: msg, updatedAt: new Date().toISOString() };
    }));
    setSelected(prev => {
      if (!prev || prev.id !== ticketId) return prev;
      const newMsg: Message = {
        id: `m${Date.now()}`,
        from: 'customer',
        body: msg,
        ts: new Date().toISOString(),
      };
      return { ...prev, messages: [...prev.messages, newMsg], lastMessage: msg, updatedAt: new Date().toISOString() };
    });
  }

  function handleCreate(subject: string, category: string, body: string) {
    const newTicket: Ticket = {
      id: `t${Date.now()}`,
      ref: `TKT-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      subject,
      status: 'OPEN',
      priority: 'NORMAL',
      category,
      lastMessage: body,
      updatedAt: new Date().toISOString(),
      messages: [{ id: 'm1', from: 'customer', body, ts: new Date().toISOString() }],
    };
    setTickets(prev => [newTicket, ...prev]);
    setShowNew(false);
    setSelected(newTicket);
  }

  /* ── Thread view ── */
  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', background: 'var(--bg)' }}>
        <TicketThread
          ticket={selected}
          onBack={() => setSelected(null)}
          onReply={(msg) => handleReply(selected.id, msg)}
        />
        {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
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
            {tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length} open ticket(s)
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
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
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
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            {f === 'ALL' ? 'All' : f === 'OPEN' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {/* Card list */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
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
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
              Open a Ticket
            </button>
          </div>
        ) : (
          filtered.map(t => (
            <TicketCard key={t.id} ticket={t} onClick={() => setSelected(t)} />
          ))
        )}
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
      <LiveChatWidget />
    </div>
  );
};
