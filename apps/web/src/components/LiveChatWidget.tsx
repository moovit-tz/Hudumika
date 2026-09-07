import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

/**
 * A real customer-facing live chat backed by the same support_tickets /
 * support_messages tables and customer-reply endpoint CustomerSupport.tsx's
 * own ticket thread already uses — not a second, parallel chat system.
 * Category 'Live Chat' just distinguishes a bubble-started conversation from
 * one filed through the full ticket form; an agent replying from Bliss's
 * Support inbox sees and answers it exactly like any other ticket.
 *
 * This used to be entirely client-side: every message vanished into a
 * setTimeout that faked an agent's reply and sent nothing anywhere. A real
 * customer typing a real question into this bubble was being told "an agent
 * will be with you shortly" while no agent, ticket, or record of any kind
 * was ever created.
 */
interface ChatMessage { id: string; from: 'agent' | 'customer'; text: string; ts: string }

export const LiveChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const loadThread = async (id: string) => {
    try {
      const detail: any = await apiFetch(`/v1/support/tickets/${id}`);
      setMessages((detail.messages || []).map((m: any) => ({
        id: m.id,
        from: m.author_type === 'CUSTOMER' ? 'customer' : 'agent',
        text: m.content,
        ts: m.created_at,
      })));
    } catch {
      setError("Couldn't load your conversation history.");
    }
  };

  // Resume an existing live-chat conversation rather than starting a fresh
  // one every time the bubble is reopened.
  useEffect(() => {
    if (!isOpen || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    apiFetch('/v1/support/tickets')
      .then(async (rows: any) => {
        const list = Array.isArray(rows) ? rows : (rows?.data ?? []);
        const existing = list.find((t: any) => t.category === 'Live Chat' && (t.status === 'OPEN' || t.status === 'IN_PROGRESS'));
        if (existing) {
          setTicketId(existing.id);
          await loadThread(existing.id);
        }
      })
      .catch(() => setError("Couldn't reach support right now."))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // A colleague/agent reply should appear the moment it's sent, not on the
  // next time the customer happens to reopen the bubble.
  useWebSocket((event) => {
    if (event.type !== 'support.message_received' || event.ticketId !== ticketId) return;
    loadThread(event.ticketId);
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput('');
    const optimistic: ChatMessage = { id: `pending-${Date.now()}`, from: 'customer', text, ts: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);

    try {
      let id = ticketId;
      if (!id) {
        const ticket: any = await apiFetch('/v1/support/tickets', {
          method: 'POST',
          body: JSON.stringify({
            subject: 'Live Chat',
            category: 'Live Chat',
            description: text,
            priority: 'NORMAL',
            channel: 'IN_APP',
          }),
        });
        id = ticket.id;
        setTicketId(id);
      }
      const row: any = await apiFetch(`/v1/support/tickets/${id}/customer-reply`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { id: row.id, from: 'customer', text: row.content, ts: row.created_at } : m));
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(text);
      setError(err?.message || "Couldn't send that message — please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'hsl(var(--primary))',
          border: 'none',
          color: 'hsl(var(--primary-foreground))',
          boxShadow: 'var(--elev)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'transform 0.2s',
          transform: isOpen ? 'scale(0.8)' : 'scale(1)'
        }}
      >
        <Icon name={isOpen ? 'x' : 'chatBubble'} size={28} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: 100,
          right: 24,
          width: 360,
          height: 500,
          background: 'var(--white)',
          borderRadius: 12,
          boxShadow: 'var(--elev-lg)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          overflow: 'hidden',
          fontFamily: 'var(--font)'
        }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="headphones" size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Live Chat</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>A real agent will reply here</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg)' }}>
            {loading ? (
              <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--ink3)', fontSize: 14 }}>Loading conversation…</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--ink3)' }}>
                <Icon name="messageSquare" size={32} />
                <div style={{ marginTop: 12, fontSize: 14 }}>Send a message to start chatting</div>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} style={{ alignSelf: msg.from === 'customer' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div style={{
                    background: msg.from === 'customer' ? 'hsl(var(--primary))' : 'var(--white)',
                    color: msg.from === 'customer' ? 'hsl(var(--primary-foreground))' : 'var(--ink)',
                    padding: '12px 16px',
                    borderRadius: msg.from === 'customer' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    boxShadow: 'var(--elev-sm)',
                    fontSize: 14,
                    lineHeight: 1.5
                  }}>
                    {msg.text}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, textAlign: msg.from === 'customer' ? 'right' : 'left' }}>
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <div style={{ padding: '8px 16px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 12.5, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: 16, background: 'var(--white)', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', borderRadius: 24, padding: '6px 6px 6px 16px' }}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
                disabled={sending}
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, fontFamily: 'var(--font)' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                style={{
                  width: 36, height: 36, borderRadius: '50%', background: input.trim() && !sending ? 'hsl(var(--primary))' : 'var(--border)',
                  border: 'none', color: 'hsl(var(--primary-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !sending ? 'pointer' : 'not-allowed', transition: 'background 0.2s'
                }}
              >
                <Icon name="send" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
