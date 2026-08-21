import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import './SupportChat.css';

interface ChatSession { id: string; visitor_name: string | null; status: string; assigned_to: string | null; updated_at: string }
interface ChatMessage { id: string; session_id: string; sender_type: string; sender_id: string | null; content: string; created_at: string }

export const SupportChat: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadSessions() {
    apiFetch('/v1/support/chat/sessions').then(setSessions).catch(() => {});
  }

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeSession) { setMessages([]); return; }
    function loadMessages() {
      apiFetch(`/v1/support/chat/sessions/${activeSession}/messages`).then(setMessages).catch(() => {});
    }
    loadMessages();
    pollRef.current = setInterval(loadMessages, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeSession]);

  async function sendMessage() {
    if (!draft.trim() || !activeSession) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/v1/support/chat/sessions/${activeSession}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: draft }),
      });
      setMessages(prev => [...prev, msg]);
      setDraft('');
      loadSessions();
    } finally {
      setSending(false);
    }
  }

  const current = sessions.find(s => s.id === activeSession);

  return (
    <div className={`spc-shell${activeSession ? ' spc-shell--has-selection' : ''}`}>
      {/* Sidebar for chat sessions */}
      <div className="spc-sidebar">
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--navy)' }}>Live Chat</h2>
          <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            You are online
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              style={{
                width: '100%', textAlign: 'left', background: activeSession === s.id ? 'var(--bg)' : 'transparent',
                border: 'none', padding: '12px', borderRadius: 'var(--r)', cursor: 'pointer', marginBottom: 4
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{s.visitor_name ?? 'Visitor'}</span>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(s.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: s.status === 'waiting' ? '#f59e0b' : s.status === 'active' ? 'var(--green)' : 'var(--ink3)', textTransform: 'capitalize' }}>
                {s.status}
              </div>
            </button>
          ))}
          {sessions.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No chat sessions yet.</div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="spc-main">
        {activeSession && current ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '16px', background: 'var(--white)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" className="spc-back-btn" onClick={() => setActiveSession(null)} title="Back to sessions">
                <Icon name="arrowLeft" size={16} strokeWidth={2} />
              </button>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="user" size={18} color="var(--teal)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{current.visitor_name ?? 'Visitor'}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', textTransform: 'capitalize' }}>{current.status}</div>
              </div>
            </div>

            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink3)', marginBottom: 20 }}>No messages yet</div>
              )}
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.sender_type === 'agent' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  <div style={{
                    background: m.sender_type === 'agent' ? 'var(--teal)' : 'var(--white)',
                    color: m.sender_type === 'agent' ? '#fff' : 'var(--ink)',
                    padding: '12px 16px',
                    borderRadius: m.sender_type === 'agent' ? '12px 0 12px 12px' : '0 12px 12px 12px',
                    border: m.sender_type === 'agent' ? 'none' : '1px solid var(--border)',
                    fontSize: 14, maxWidth: '70%',
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 16, background: 'var(--white)', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !sending) sendMessage(); }}
                  placeholder="Type a reply..."
                  style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 9, border: '1.5px solid var(--border)', outline: 'none', fontFamily: 'var(--font)' }}
                />
                <button onClick={sendMessage} disabled={sending || !draft.trim()} style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: '0 20px', fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: sending || !draft.trim() ? 0.6 : 1 }}>Send</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
            <Icon name="message" size={48} />
            <div style={{ marginTop: 16, fontSize: 16, fontWeight: 600 }}>Select a chat to begin</div>
          </div>
        )}
      </div>
    </div>
  );
};
