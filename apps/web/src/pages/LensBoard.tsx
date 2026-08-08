import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';

/**
 * The kanban view.
 *
 * Columns come from `lens_columns`, so the board is configuration rather than a
 * hardcoded list, and `status` stays the source of truth — a column is a lens on
 * it, not a second place where state lives.
 *
 * Dragging a card is the one interaction that has to feel immediate, so the
 * card moves before the request lands and moves back if it fails. Dropping into
 * Done is the exception: closing needs a written resolution, so the drop opens
 * the panel and asks rather than quietly closing the item.
 */

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

interface Link { provider: string; kind: string; external_id: string; url: string | null; external_status: string | null }
interface Card {
  id: string; ref: string; kind: Kind; title: string; status: string;
  severity: string; confidence: Confidence; waiting_on: string | null;
  area_name: string | null; links: Link[];
}
interface Column { id: string; name: string; status: string; wip_limit: number | null; items: Card[]; count: number; over_wip: boolean }
interface Area { id: string; name: string }

const KIND_VARIANT: Record<Kind, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  BUG: 'error', FEATURE: 'brand', DEBT: 'warning', DECISION: 'info', QUESTION: 'gray', RISK: 'error',
};
const CONFIDENCE_VARIANT: Record<Confidence, 'success' | 'warning' | 'gray'> = {
  CONFIRMED: 'success', SUSPECTED: 'warning', UNVERIFIED: 'gray',
};
const PROVIDER_ICON: Record<string, string> = {
  github: 'gitBranch', slack: 'chatBubble', jira: 'layers', linear: 'list', circleci: 'refresh',
};

export function LensBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [ci, setCi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState('');
  const [kind, setKind] = useState('');
  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ card: Card; status: string } | null>(null);
  const [resolution, setResolution] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (area) p.set('area', area);
    if (kind) p.set('kind', kind);
    Promise.all([apiFetch(`/v1/lens/board?${p}`), apiFetch('/v1/lens/areas')])
      .then(([b, a]: any[]) => { setColumns(b ?? []); setAreas(a ?? []); })
      .catch(() => setColumns([]))
      .finally(() => setLoading(false));
    // CI is best-effort: no integration means no build, which is not an error.
    apiFetch('/v1/lens/ci').then(setCi).catch(() => setCi(null));
  }, [area, kind]);

  useEffect(() => { load(); }, [load]);

  async function move(card: Card, status: string) {
    if (card.status === status) return;
    // Closing is not a drag-and-drop action — it needs a written resolution,
    // so the drop asks instead of doing.
    if (status === 'DONE') { setClosing({ card, status }); setResolution(''); return; }

    // Optimistic: the card moves now and goes back if the server disagrees.
    const before = columns;
    setColumns(cols => cols.map(c => ({
      ...c,
      items: c.status === status
        ? [{ ...card, status }, ...c.items.filter(i => i.id !== card.id)]
        : c.items.filter(i => i.id !== card.id),
    })).map(c => ({ ...c, count: c.items.length, over_wip: c.wip_limit != null && c.items.length > c.wip_limit })));

    try {
      await apiFetch(`/v1/lens/items/${card.ref}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (e: any) {
      setColumns(before);
      setNotice({ kind: 'err', text: e?.message || `Could not move ${card.ref}` });
    }
  }

  async function confirmClose() {
    if (!closing || !resolution.trim()) return;
    try {
      await apiFetch(`/v1/lens/items/${closing.card.ref}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: closing.status, resolution: resolution.trim() }),
      });
      setNotice({ kind: 'ok', text: `${closing.card.ref} closed.` });
      setClosing(null); load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not close it' });
    }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Lens', 'Board']}
        titlePlain="Developer"
        titleEm="board"
        subtitle="Drag to change state. Closing asks how it was settled."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {ci?.ok && !ci.empty && (
              <span title={`Pipeline #${ci.number} · ${ci.vcs ?? ''}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
                padding: '5px 10px', borderRadius: 'var(--r-sm)',
                background: ci.state === 'created' ? 'var(--blue-l)' : 'var(--bg)',
                border: '1px solid var(--border)', color: 'var(--ink2)',
              }}>
                <Icon name="refresh" size={12} /> CI #{ci.number} · {ci.state}
              </span>
            )}
            <a href="/lens/list" className="btn btn-secondary btn-sm">List view</a>
            <a href="/lens/integrations" className="btn btn-secondary btn-sm">Integrations</a>
          </div>
        }
      />

      {notice && (
        <div style={{
          padding: '10px 14px', margin: '0 0 14px', borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 600,
          background: notice.kind === 'ok' ? 'var(--green-l)' : 'var(--red-l)',
          border: `1px solid ${notice.kind === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>{notice.text}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select value={area || '__all__'} onValueChange={v => setArea(v === '__all__' ? '' : v)}>
          <SelectTrigger style={{ minWidth: 170 }}><SelectValue placeholder="All areas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All areas</SelectItem>
            {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind || '__all__'} onValueChange={v => setKind(v === '__all__' ? '' : v)}>
          <SelectTrigger style={{ minWidth: 140 }}><SelectValue placeholder="All kinds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All kinds</SelectItem>
            {(['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK'] as Kind[])
              .map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
          {columns.map(col => (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); setOver(col.status); }}
              onDragLeave={() => setOver(o => (o === col.status ? null : o))}
              onDrop={e => { e.preventDefault(); setOver(null); if (dragging) move(dragging, col.status); setDragging(null); }}
              style={{
                flex: '1 0 280px', minWidth: 280, maxWidth: 360,
                background: over === col.status ? 'var(--teal-l)' : 'var(--bg)',
                border: `1px solid ${over === col.status ? 'var(--teal)' : 'var(--border)'}`,
                borderRadius: 'var(--r)', transition: 'background .12s, border-color .12s',
              }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {col.name}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: col.over_wip ? 'var(--red)' : 'var(--ink3)',
                }}>
                  {col.count}{col.wip_limit != null ? ` / ${col.wip_limit}` : ''}
                </span>
              </div>

              {/* Shown, never enforced. */}
              {col.over_wip && (
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--red)', background: 'var(--red-l)' }}>
                  Over the {col.wip_limit} limit — worth finishing something before starting more.
                </div>
              )}

              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
                {col.items.length === 0 && (
                  <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>Nothing here</div>
                )}
                {col.items.map(card => (
                  <div key={card.id}
                    draggable
                    onDragStart={() => setDragging(card)}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onClick={() => { window.location.href = `/lens/list?ref=${card.ref}`; }}
                    style={{
                      background: 'var(--white)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)', padding: '10px 11px', cursor: 'grab',
                      opacity: dragging?.id === card.id ? 0.5 : 1,
                      boxShadow: 'var(--elev-sm)',
                    }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>{card.ref}</span>
                      <Badge variant={KIND_VARIANT[card.kind]}>{card.kind}</Badge>
                      {/* The most useful thing on the card: has anyone actually
                          reproduced this? */}
                      {card.confidence !== 'CONFIRMED' && (
                        <Badge variant={CONFIDENCE_VARIANT[card.confidence]}>{card.confidence}</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>{card.title}</div>
                    {card.waiting_on && (
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>⏳ {card.waiting_on}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                      {card.area_name && (
                        <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{card.area_name}</span>
                      )}
                      {card.links.map(l => (
                        <a key={`${l.provider}-${l.external_id}`} href={l.url ?? '#'} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          title={`${l.provider} ${l.external_id}${l.external_status ? ` — ${l.external_status}` : ''}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--ink3)', textDecoration: 'none' }}>
                          <Icon name={(PROVIDER_ICON[l.provider] ?? 'link') as any} size={11} />
                          {l.external_id.length > 16 ? l.external_id.slice(0, 16) + '…' : l.external_id}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dropping into Done asks rather than closes. */}
      {closing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setClosing(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--white)', borderRadius: 'var(--r)', padding: 22, width: 'min(520px, 92vw)',
            boxShadow: 'var(--elev-lg)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Close {closing.card.ref}?
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 12 }}>
              How was it settled? An item closed without saying is the one you find a year later and
              cannot use.
            </div>
            <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={4}
              placeholder="e.g. Fixed in a1b2c3d; verified by re-running the period close."
              style={{
                width: '100%', padding: '9px 11px', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)',
                color: 'var(--ink)', background: 'var(--white)', resize: 'vertical', boxSizing: 'border-box',
              }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setClosing(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!resolution.trim()} onClick={confirmClose}>
                Close item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
