import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
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

export const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || sending) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setDraft('');
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch('/v1/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: nextMessages.map(m => ({ role: m.role, content: m.content })) }),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply, toolCalls: res.toolCalls }]);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reach the assistant');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
        {messages.length === 0 && (
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
                    <span key={ti} style={{ fontSize: 10.5, fontWeight: 600, color: '#6d28d9', background: '#f5f3ff', padding: '3px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fef2f2', color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{error}</div>
        )}
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
