import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import './DriverChatPanel.css';

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
    if (!input.trim() || sending) return;
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
    <div className="driver-chat-panel">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Message {driverName}</div>
      <div className="driver-chat-messages">
        {messages.map(m => (
          <div key={m.id} style={{ alignSelf: m.sender_type === 'OPS' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
            <div style={{ background: m.sender_type === 'OPS' ? 'hsl(var(--primary))' : 'var(--bg)', color: m.sender_type === 'OPS' ? 'hsl(var(--primary-foreground))' : 'var(--ink)', borderRadius: 'var(--r-sm)', padding: '9px 13px', fontSize: 13, overflowWrap: 'anywhere' }}>
              {m.message}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 3, textAlign: m.sender_type === 'OPS' ? 'right' : 'left' }}>{new Date(m.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
        {messages.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>No messages yet.</div>}
        <div ref={bottomRef} />
      </div>
      {waStatus && <div style={{ padding: '6px 18px', fontSize: 12, color: 'var(--ink3)' }}>{waStatus}</div>}
      <div className="driver-chat-composer">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
          aria-label={`Message ${driverName}`}
          placeholder="Type a message…"
          />
        <Button type="button" size="sm" onClick={send} disabled={sending || !input.trim()}>
          Send
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={notifyWhatsApp} disabled={waSending || !input.trim() || !driverPhone} title={driverPhone ? 'Send via WhatsApp' : 'No phone on file'}>
          <Icon name="message" size={14} /> WhatsApp
        </Button>
      </div>
    </div>
  );
}
