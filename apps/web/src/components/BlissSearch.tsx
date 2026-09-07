import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';

interface TicketHit { id: string; ref: string; subject: string; status: string; customer: string | null }
interface ArticleHit { id: string; title: string; category_id: string | null }
interface ChatHit { kind: 'channel' | 'message'; channelId: string; label: string; preview: string | null }
interface SearchResults { tickets: TicketHit[]; articles: ArticleHit[]; chats: ChatHit[] }

const EMPTY: SearchResults = { tickets: [], articles: [], chats: [] };

/** One search box across Bliss's three real data surfaces — tickets, the
 *  knowledge base, and the caller's own chat channels/DMs — backed by
 *  GET /v1/support/search. Built for the mobile header, where there was
 *  previously no way to reach the ticket-list search once a thread (or
 *  Team Chat) was open; works the same on desktop if mounted there too. */
export function BlissSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/support/search?q=${encodeURIComponent(q)}`)
        .then((r: any) => setResults({ tickets: r?.tickets ?? [], articles: r?.articles ?? [], chats: r?.chats ?? [] }))
        .catch(() => setResults(EMPTY))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const hasQuery = query.trim().length >= 2;
  const hasResults = results.tickets.length > 0 || results.articles.length > 0 || results.chats.length > 0;

  function go(path: string) {
    navigate(path);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Icon name="search" size={15} color="var(--ink3)" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search tickets, chats, knowledge base…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)' }}
        />
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} title="Close search">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {!hasQuery && (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, padding: '32px 0' }}>
            Type at least 2 characters to search everything in Bliss.
          </div>
        )}

        {hasQuery && loading && (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, padding: '32px 0' }}>Searching…</div>
        )}

        {hasQuery && !loading && !hasResults && (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, padding: '32px 0' }}>No matches for "{query.trim()}".</div>
        )}

        {hasQuery && !loading && results.tickets.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Tickets</div>
            {results.tickets.map(t => (
              <button key={t.id} type="button" onClick={() => go(`/bliss/inbox?id=${t.id}`)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', marginBottom: 6, cursor: 'pointer' }}>
                <Icon name="inbox" size={15} color="var(--teal)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>#{t.ref} · {t.customer || 'Unknown'} · {t.status}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {hasQuery && !loading && results.chats.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Team Chat</div>
            {results.chats.map((c, i) => (
              <button key={`${c.channelId}-${i}`} type="button" onClick={() => go(`/bliss/inbox?view=team&channel=${c.channelId}`)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', marginBottom: 6, cursor: 'pointer' }}>
                <Icon name="chatBubble" size={15} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.label}</div>
                  {c.preview && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.preview}</div>}
                </div>
              </button>
            ))}
          </div>
        )}

        {hasQuery && !loading && results.articles.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Knowledge Base</div>
            {results.articles.map(a => (
              <button key={a.id} type="button" onClick={() => go(`/bliss/kb?id=${a.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', marginBottom: 6, cursor: 'pointer' }}>
                <Icon name="fileText" size={15} color="var(--blue)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
