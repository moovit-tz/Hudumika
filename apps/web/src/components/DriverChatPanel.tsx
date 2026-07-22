import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';

interface Message { id: string; sender_type: 'OPS' | 'DRIVER'; message: string; created_at: string }

export function DriverChatPanel({ driverId, driverName, driverPhone }: { driverId: string; driverName: string; driverPhone: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waStatus, setWaStatus] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    apiFetch(`/v1/tracking/drivers/${driverId}/messages`).then(setMessages).catch(() => setMessages([]));
  }, [driverId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    if (!input.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/v1/tracking/drivers/${driverId}/messages`, { method: 'POST', body: JSON.stringify({ message: input.trim() }) });
      setInput('');
      reload();
    } finally { setSending(false); }
  }

  async function notifyWhatsApp() {
    if (!input.trim()) return;
    setWaSending(true); setWaStatus('');
    try {
      const res = await apiFetch(`/v1/tracking/drivers/${driverId}/notify-whatsapp`, { method: 'POST', body: JSON.stringify({ message: input.trim() }) });
      setWaStatus(res.success ? 'Sent via WhatsApp' : (res.error || 'Failed to send'));
    } catch (err: any) {
      setWaStatus(err.message || 'Failed to send');
    } finally { setWaSending(false); }
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Message {driverName}</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200 }}>
        {messages.map(m => (
          <div key={m.id} style={{ alignSelf: m.sender_type === 'OPS' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
            <div style={{ background: m.sender_type === 'OPS' ? 'var(--teal)' : 'var(--bg)', color: m.sender_type === 'OPS' ? '#fff' : 'var(--ink)', borderRadius: 12, padding: '9px 13px', fontSize: 13 }}>
              {m.message}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 3, textAlign: m.sender_type === 'OPS' ? 'right' : 'left' }}>{new Date(m.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
        {messages.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>No messages yet.</div>}
        <div ref={bottomRef} />
      </div>
      {waStatus && <div style={{ padding: '6px 18px', fontSize: 12, color: 'var(--ink3)' }}>{waStatus}</div>}
      <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)' }} />
        <button type="button" onClick={send} disabled={sending || !input.trim()}
          style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: input.trim() ? 1 : 0.5 }}>
          Send
        </button>
        <button type="button" onClick={notifyWhatsApp} disabled={waSending || !input.trim() || !driverPhone} title={driverPhone ? 'Send via WhatsApp' : 'No phone on file'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: input.trim() && driverPhone ? 1 : 0.5 }}>
          <Icon name="message" size={14} /> WhatsApp
        </button>
      </div>
    </div>
  );
}
