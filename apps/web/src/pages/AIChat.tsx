import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { apiFetch } from '../lib/api.js';
import '../pages/AI.css';

interface ToolCallLog { name: string; input: Record<string, any>; result: any }
interface ChatMessage { role: 'user' | 'assistant'; content: string; toolCalls?: ToolCallLog[] }

const SUGGESTIONS = [
  'Which shipments are at risk this week?',
  'Who owes us the most money right now?',
  'Give me a summary for Simba Logistics',
];

const TOOL_LABELS: Record<string, string> = {
  get_at_risk_shipments: 'Checked at-risk shipments',
  search_shipments: 'Searched shipments',
  get_aged_receivables: 'Checked aged receivables',
  get_customer_info: 'Looked up customer',
};

/** The thread being continued. Held here so a reload lands back in the same
 *  conversation instead of silently starting a new one — the transcript is in
 *  Postgres either way, but without this the user could never get back to it. */
const ACTIVE_KEY = 'hudumika_ai_conversation';

export const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
  const [restoring, setRestoring] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Reopen the last thread from the server. A thread that was deleted, or that
  // belongs to a different login, 404s — in which case forget it and start
  // clean rather than leaving a dead id in storage forever.
  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (!id) return;
    setRestoring(true);
    apiFetch(`/v1/ai/conversations/${id}`)
      .then(res => {
        setMessages((res.messages ?? []).map((m: any) => ({
          role: m.role,
          content: m.content,
          toolCalls: m.tool_calls ? (typeof m.tool_calls === 'string' ? JSON.parse(m.tool_calls) : m.tool_calls) : undefined,
        })));
      })
      .catch(() => { localStorage.removeItem(ACTIVE_KEY); setConversationId(null); })
      .finally(() => setRestoring(false));
  }, []);

  function startNew() {
    localStorage.removeItem(ACTIVE_KEY);
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || sending) return;
    setMessages(prev => [...prev, { role: 'user', content }]);
    setDraft('');
    setSending(true);
    setError(null);
    try {
      // Only the new turn goes up; the history the model sees is read from the
      // database, so the client is no longer the owner of the transcript.
      const res = await apiFetch('/v1/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content, conversation_id: conversationId }),
      });
      if (res.conversation_id && res.conversation_id !== conversationId) {
        setConversationId(res.conversation_id);
        localStorage.setItem(ACTIVE_KEY, res.conversation_id);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply, toolCalls: res.toolCalls }]);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reach the assistant');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 760, margin: '0 auto', width: '100%' }}>
      {/* Only shown once a thread exists — there is nothing to leave otherwise. */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 20px 0' }}>
          <button type="button" onClick={startNew} className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Icon name="plus" size={12} /> New conversation
          </button>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
        {restoring && messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40, color: 'var(--ink3)', fontSize: 13 }}>
            Loading your last conversation…
          </div>
        )}
        {!restoring && messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40, color: 'var(--ink3)' }}>
            <Icon name="sparkle" size={32} color="#6d28d9" />
            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Ask about your shipments, customers, or receivables</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => send(s)} className="btn btn-secondary btn-sm" style={{ fontSize: 13 }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
            <div style={{ maxWidth: '78%' }}>
              {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {m.toolCalls.map((tc, ti) => (
                    <span key={ti} style={{ fontSize: 10.5, fontWeight: 600, color: '#6d28d9', background: 'var(--purple-l)', padding: '3px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="checkCircle" size={10} color="#6d28d9" /> {TOOL_LABELS[tc.name] ?? tc.name}
                    </span>
                  ))}
                </div>
              )}
              <div style={{
                padding: '11px 15px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                background: m.role === 'user' ? 'var(--teal)' : 'var(--white)',
                color: m.role === 'user' ? '#fff' : 'var(--ink)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          </div>
        ))}

        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 14 }}>
            <div style={{ padding: '11px 15px', borderRadius: '2px 12px 12px 12px', background: 'var(--white)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--ink3)' }}>
              Thinking…
            </div>
          </div>
        )}

        {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      </div>

      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--white)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !sending) send(); }}
            placeholder="Ask about shipments, customers, receivables…"
            className="input-field"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={sending || !draft.trim()} onClick={() => send()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
