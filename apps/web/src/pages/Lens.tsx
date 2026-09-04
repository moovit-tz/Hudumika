import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { SectionCard } from '../components/SectionCard.js';

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK';
type Status = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

interface Link { provider: string; kind: string; external_id: string; url: string | null; external_status: string | null }
interface Card {
  id: string; ref: string; kind: Kind; title: string; status: string;
  severity: string; confidence: Confidence; waiting_on: string | null;
  area_name: string | null; links: Link[];
}
interface Column { id: string; name: string; status: string; wip_limit: number | null; items: Card[]; count: number; over_wip: boolean }

interface Item {
  id: string; ref: string; kind: Kind; title: string; body: string | null;
  area_id: string | null; area_name?: string | null;
  status: Status; severity: Severity; confidence: Confidence;
  evidence: string | null; waiting_on: string | null;
  refs: string[]; tags: string[];
  resolution: string | null; created_at: string;
}
interface Area { id: string; name: string; kind: string; description: string | null }
interface Stats {
  total: number; open: number; unproven: number;
  by_kind: Record<string, number>; by_severity: Record<string, number>;
  by_confidence: Record<string, number>;
}
interface Event { id: string; kind: string; detail: string | null; actor_name: string | null; created_at: string }

const KIND_VARIANT: Record<Kind, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  BUG: 'error', FEATURE: 'brand', DEBT: 'warning', DECISION: 'info', QUESTION: 'gray', RISK: 'error',
};
const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: 'var(--red)', HIGH: 'var(--gold)', NORMAL: 'var(--ink3)', LOW: 'var(--ink3)',
};
const CONFIDENCE_VARIANT: Record<Confidence, 'success' | 'warning' | 'gray'> = {
  CONFIRMED: 'success', SUSPECTED: 'warning', UNVERIFIED: 'gray',
};
const CONFIDENCE_HINT: Record<Confidence, string> = {
  CONFIRMED: 'Somebody ran this and it behaved as described.',
  SUSPECTED: 'A reading of the code. Nobody has reproduced it yet.',
  UNVERIFIED: 'Reported, not yet looked at.',
};
const PROVIDER_ICON: Record<string, string> = {
  github: 'gitBranch', slack: 'chatBubble', jira: 'layers', linear: 'list', circleci: 'refresh',
};

const KINDS: Kind[] = ['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK'];
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX'];
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const CONFIDENCES: Confidence[] = ['CONFIRMED', 'SUSPECTED', 'UNVERIFIED'];

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' };
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13,
  fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', width: '100%',
};
const label: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4,
};

export function Lens() {
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [items, setItems] = useState<Item[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ci, setCi] = useState<any>(null);
  const [selected, setSelected] = useState<(Item & { events?: Event[] }) | null>(null);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [fKind, setFKind] = useState('');
  const [fArea, setFArea] = useState('');
  const [fConfidence, setFConfidence] = useState('');
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  // List view only — the board doesn't paginate (a kanban column with a page
  // boundary through it makes drag-and-drop nonsensical), so this drives
  // /v1/lens/items alone, which the board's own /v1/lens/board call never
  // touches.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ card: Card; status: string } | null>(null);
  const [resolution, setResolution] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fKind) params.set('kind', fKind);
    if (fArea) params.set('area', fArea);
    if (fConfidence) params.set('confidence', fConfidence);
    if (q) params.set('q', q);
    if (showClosed) params.set('include_closed', '1');
    const itemParams = new URLSearchParams(params);
    itemParams.set('limit', String(PAGE_SIZE));
    itemParams.set('offset', String((page - 1) * PAGE_SIZE));
    Promise.all([
      apiFetch(`/v1/lens/items?${itemParams}`),
      apiFetch(`/v1/lens/board?${params}`),
      apiFetch('/v1/lens/areas'),
      apiFetch('/v1/lens/stats'),
    ])
      .then(([i, b, a, s]: any[]) => { setItems(i?.data ?? []); setTotal(i?.total ?? 0); setColumns(b ?? []); setAreas(a ?? []); setStats(s ?? null); })
      .catch(() => { setItems([]); setTotal(0); setColumns([]); })
      .finally(() => setLoading(false));

    apiFetch('/v1/lens/ci').then(setCi).catch(() => setCi(null));
  }, [fKind, fArea, fConfidence, q, showClosed, page]);

  useEffect(() => { load(); }, [load]);
  // A filter/search change makes the current page number meaningless against
  // the new result set — back to page 1 rather than showing a page that may
  // no longer exist (or silently skipping matches on pages 1..n-1).
  useEffect(() => { setPage(1); }, [fKind, fArea, fConfidence, q, showClosed]);

  async function open(ref: string) {
    try { setSelected(await apiFetch(`/v1/lens/items/${ref}`)); }
    catch { setNotice({ kind: 'err', text: `Could not open ${ref}` }); }
  }

  async function patch(ref: string, body: Record<string, unknown>) {
    try {
      await apiFetch(`/v1/lens/items/${ref}`, { method: 'PATCH', body: JSON.stringify(body) });
      await open(ref); load();
      setNotice({ kind: 'ok', text: `${ref} updated.` });
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not update that item' });
    }
  }

  async function move(card: Card, status: string) {
    if (card.status === status) return;
    if (status === 'DONE') { setClosing({ card, status }); setResolution(''); return; }

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

  if (composing) {
    return <Compose areas={areas} onClose={() => setComposing(false)}
      onSaved={(ref) => { setComposing(false); setNotice({ kind: 'ok', text: `${ref} opened.` }); load(); }} />;
  }

  return (
    <div className="page-layout" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        crumbs={['Lens']}
        titlePlain="Developer"
        titleEm="record"
        subtitle="What is pending, what is broken, and what was decided — across the whole platform."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              {(['board', 'list'] as const).map(m => (
                <button key={m} type="button" onClick={() => setViewMode(m)} style={{
                  padding: '6px 12px', border: 'none', background: viewMode === m ? 'var(--teal)' : 'var(--white)',
                  color: viewMode === m ? '#fff' : 'var(--ink3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  fontWeight: 600, fontSize: 12
                }}>
                  <Icon name={m === 'board' ? 'columns' : 'list'} size={14} style={{ marginRight: 6 }} color={viewMode === m ? '#fff' : 'var(--ink3)'} />
                  {m === 'board' ? 'Board' : 'List'}
                </button>
              ))}
            </div>

            <button type="button" className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>
              <Icon name="plus" size={14} color="#fff" /> New item
            </button>
          </div>
        }
      />

      {notice && (
        <div style={{
          padding: '10px 14px', margin: '0 0 14px', borderRadius: 'var(--r)',
          fontSize: 12.5, fontWeight: 600,
          background: notice.kind === 'ok' ? 'var(--green-l)' : 'var(--red-l)',
          border: `1px solid ${notice.kind === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>{notice.text}</div>
      )}

      {/* Filters */}
      <div style={{ margin: '0 0 16px', flexShrink: 0 }}>
      <SectionCard>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select value={fKind || '__all__'} onValueChange={v => setFKind(v === '__all__' ? '' : v)}>
            <SelectTrigger style={{ minWidth: 130, width: 'auto' }}><SelectValue placeholder="All kinds" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All kinds</SelectItem>
              {KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fArea || '__all__'} onValueChange={v => setFArea(v === '__all__' ? '' : v)}>
            <SelectTrigger style={{ minWidth: 160, width: 'auto' }}><SelectValue placeholder="All areas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All areas</SelectItem>
              {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {viewMode === 'list' && (
            <Select value={fConfidence || '__all__'} onValueChange={v => setFConfidence(v === '__all__' ? '' : v)}>
              <SelectTrigger style={{ minWidth: 170, width: 'auto' }}><SelectValue placeholder="Any confidence" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Any confidence</SelectItem>
                {CONFIDENCES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink2)' }}>
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
            Show closed
          </label>
        </div>

        <div style={{ flex: '1 1 220px', minWidth: 200, maxWidth: 400, marginLeft: 'auto' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, body, evidence…"
            style={{ ...input, width: '100%' }} />
        </div>
        </div>
      </SectionCard>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
      ) : viewMode === 'board' ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8, flex: 1, height: 0 }}>
          {columns.map(col => (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); setOver(col.status); }}
              onDragLeave={() => setOver(o => (o === col.status ? null : o))}
              onDrop={e => { e.preventDefault(); setOver(null); if (dragging) move(dragging, col.status); setDragging(null); }}
              style={{
                display: 'flex', flexDirection: 'column',
                flex: '0 0 280px', height: '100%',
                background: over === col.status ? 'var(--teal-l)' : 'var(--bg)',
                border: `1px solid ${over === col.status ? 'var(--teal)' : 'var(--border)'}`,
                borderRadius: '10px', transition: 'background .12s, border-color .12s',
              }}>
              <div style={{ padding: '12px 14px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>
                  {col.name}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, background: col.over_wip ? 'var(--red)' : 'var(--border)', color: col.over_wip ? '#fff' : 'var(--ink2)', padding: '2px 6px', borderRadius: 10 }}>
                  {col.count}{col.wip_limit != null ? ` / ${col.wip_limit}` : ''}
                </span>
              </div>

              {col.over_wip && (
                <div style={{ margin: '0 10px', padding: '6px 12px', fontSize: 11, color: 'var(--red)', background: 'var(--red-l)', borderRadius: 4, flexShrink: 0 }}>
                  Over {col.wip_limit} limit — finish something first.
                </div>
              )}

              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto' }}>
                {col.items.map(card => (
                  <div key={card.id}
                    draggable
                    onDragStart={() => setDragging(card)}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onClick={() => open(card.ref)}
                    style={{
                      background: 'var(--white)',
                      borderRadius: 8, padding: '10px 12px', cursor: 'grab',
                      opacity: dragging?.id === card.id ? 0.5 : 1,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04)',
                    }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>{card.ref}</span>
                      <Badge variant={KIND_VARIANT[card.kind]}>{card.kind}</Badge>
                      {card.confidence !== 'CONFIRMED' && (
                        <Badge variant={CONFIDENCE_VARIANT[card.confidence]}>{card.confidence}</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.4 }}>{card.title}</div>
                    {card.waiting_on && (
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>⏳ {card.waiting_on}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                      {card.area_name && (
                        <span style={{ fontSize: 10, color: 'var(--ink3)' }}>{card.area_name}</span>
                      )}
                      {card.links.map(l => (
                        <a key={`${l.provider}-${l.external_id}`} href={l.url ?? '#'} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          title={`${l.provider} ${l.external_id}${l.external_status ? ` — ${l.external_status}` : ''}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--ink3)', textDecoration: 'none' }}>
                          <Icon name={(PROVIDER_ICON[l.provider] ?? 'link') as any} size={11} />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 8 }}>
            {items.length === 0 ? (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
                Nothing matches. {showClosed ? '' : 'Closed items are hidden — tick "Show closed" to include them.'}
              </div>
            ) : (
              <SectionCard padded={false}>
                {items.map(it => (
                  <button key={it.id} type="button" onClick={() => open(it.ref)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', background: 'none',
                      border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      padding: '12px 16px', fontFamily: 'var(--font)',
                    }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>{it.ref}</span>
                      <Badge variant={KIND_VARIANT[it.kind]}>{it.kind}</Badge>
                      <Badge variant={CONFIDENCE_VARIANT[it.confidence]}>{it.confidence}</Badge>
                      {it.status !== 'OPEN' && <Badge variant="gray">{it.status.replace('_', ' ')}</Badge>}
                      {it.area_name && <Badge variant="info">{it.area_name}</Badge>}
                      {(it.severity === 'CRITICAL' || it.severity === 'HIGH') && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: SEVERITY_COLOR[it.severity] }}>{it.severity}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>{it.title}</div>
                    {it.waiting_on && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>Waiting on: {it.waiting_on}</div>
                    )}
                  </button>
                ))}
              </SectionCard>
            )}
          </div>

          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 2px 2px', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <Icon name="chevronLeft" size={14} /> Prev
                </button>
                <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>
                  Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={page * PAGE_SIZE >= total}
                  onClick={() => setPage(p => p + 1)}>
                  Next <Icon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <Detail item={selected} areas={areas} onClose={() => setSelected(null)} onPatch={patch}
          onNote={async (note) => {
            await apiFetch(`/v1/lens/items/${selected.ref}/events`, { method: 'POST', body: JSON.stringify({ kind: 'NOTE', detail: note }) });
            open(selected.ref); load();
          }} />
      )}

      {closing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setClosing(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--white)', borderRadius: 'var(--r)', width: 420, padding: 20, boxShadow: 'var(--elev-lg)',
            border: '1px solid var(--border)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--ink)' }}>Close {closing.card.ref}</h3>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 16, lineHeight: 1.5 }}>
              Closing an item requires a resolution. What happened here? Was it fixed, proven false, or abandoned?
            </div>
            <textarea
              autoFocus
              value={resolution} onChange={e => setResolution(e.target.value)}
              placeholder="e.g. Fixed in #123"
              style={{ ...input, width: '100%', minHeight: 80, marginBottom: 16, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setClosing(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!resolution.trim()} onClick={confirmClose}>Close {closing.card.ref}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Compose({ areas, onClose, onSaved }: {
  areas: Area[]; onClose: () => void; onSaved: (ref: string) => void;
}) {
  const [f, setF] = useState({
    kind: 'BUG' as Kind, title: '', body: '', area_id: '',
    severity: 'NORMAL' as Severity, confidence: 'SUSPECTED' as Confidence,
    evidence: '', waiting_on: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!f.title.trim()) { setErr('A title is required'); return; }
    setSaving(true); setErr('');
    try {
      const r: any = await apiFetch('/v1/lens/items', {
        method: 'POST',
        body: JSON.stringify({ ...f, area_id: f.area_id || null, waiting_on: f.waiting_on || null }),
      });
      onSaved(r.ref);
    } catch (e: any) {
      setErr(e?.message || 'Could not save');
    } finally { setSaving(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader crumbs={['Lens', 'New']} titlePlain="New" titleEm="item"
        subtitle="Say what it is, and say how you know." />

      <div className="card" style={{ maxWidth: 760, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {err && (
          <div style={{ gridColumn: '1 / -1', padding: '9px 12px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 'var(--r-sm)', color: 'var(--red)', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Title *</label>
          <input style={input} value={f.title} onChange={e => setF({ ...f, title: e.target.value })}
            placeholder="What is wrong, or what is missing" />
        </div>

        <div>
          <label style={label}>Kind</label>
          <Select value={f.kind} onValueChange={v => setF({ ...f, kind: v as Kind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label style={label}>Area</label>
          <Select value={f.area_id || '__none__'} onValueChange={v => setF({ ...f, area_id: v === '__none__' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label style={label}>Severity</label>
          <Select value={f.severity} onValueChange={v => setF({ ...f, severity: v as Severity })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label style={label}>Confidence</label>
          <Select value={f.confidence} onValueChange={v => setF({ ...f, confidence: v as Confidence })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CONFIDENCES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.45, marginTop: 3 }}>
            {CONFIDENCE_HINT[f.confidence]}
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>What it is</label>
          <textarea style={{ ...input, minHeight: 96, resize: 'vertical' } as React.CSSProperties}
            value={f.body} onChange={e => setF({ ...f, body: e.target.value })}
            placeholder="What happens, where, and what it costs." />
        </div>

        {/* Asked separately from the description on purpose. "What it does" and
            "how you know" are different claims, and conflating them is how a
            reading of the code becomes a reported fact. */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>How you know</label>
          <textarea style={{ ...input, minHeight: 84, resize: 'vertical', fontFamily: 'var(--mono)' } as React.CSSProperties}
            value={f.evidence} onChange={e => setF({ ...f, evidence: e.target.value })}
            placeholder="The command you ran, the figures that came back, the query that returned the row. Leave blank if you have not reproduced it — that is what SUSPECTED means." />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Waiting on</label>
          <input style={input} value={f.waiting_on} onChange={e => setF({ ...f, waiting_on: e.target.value })}
            placeholder="A person, a decision, an authority — anything blocking it" />
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || !f.title.trim()} onClick={save}>
            {saving ? 'Saving…' : 'Open item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ item, areas, onClose, onPatch, onNote }: {
  item: Item & { events?: Event[] };
  areas: Area[];
  onClose: () => void;
  onPatch: (ref: string, body: Record<string, unknown>) => void;
  onNote: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState(item.resolution ?? '');
  const [closing, setClosing] = useState<Status | null>(null);

  const refs = Array.isArray(item.refs) ? item.refs : [];
  const tags = Array.isArray(item.tags) ? item.tags : [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(680px, 100%)', height: '100%', background: 'var(--white)',
        overflowY: 'auto', borderLeft: '1px solid var(--border)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--ink3)' }}>{item.ref}</span>
              <Badge variant={KIND_VARIANT[item.kind]}>{item.kind}</Badge>
              <Badge variant={CONFIDENCE_VARIANT[item.confidence]}>{item.confidence}</Badge>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{item.title}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, height: 'fit-content' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {item.body && (
            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{item.body}</div>
          )}

          {/* The proof, given its own place — it is the point of the record. */}
          <div>
            <div style={label}>How it is known — {CONFIDENCE_HINT[item.confidence]}</div>
            <div style={{
              fontSize: 12.5, color: item.evidence ? 'var(--ink2)' : 'var(--gold)', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', padding: '10px 12px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--mono)',
            }}>
              {item.evidence ?? 'No evidence recorded. Nothing here has been reproduced.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink2)' }}>
            <div><span style={{ color: 'var(--ink3)' }}>Area</span> · {item.area_name ?? '—'}</div>
            <div><span style={{ color: 'var(--ink3)' }}>Severity</span> · {item.severity}</div>
            <div><span style={{ color: 'var(--ink3)' }}>Status</span> · {item.status.replace('_', ' ')}</div>
            {item.waiting_on && <div><span style={{ color: 'var(--ink3)' }}>Waiting on</span> · {item.waiting_on}</div>}
          </div>

          {(refs.length > 0 || tags.length > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {refs.map(r => (
                <span key={r} style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: '3px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--ink2)' }}>{r}</span>
              ))}
              {tags.map(t => <Badge key={t} variant="gray">{t}</Badge>)}
            </div>
          )}

          {/* Moving confidence is the most meaningful edit here, so it is one click. */}
          <div>
            <div style={label}>Confidence</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CONFIDENCES.map(c => (
                <button key={c} type="button"
                  className={item.confidence === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => onPatch(item.ref, { confidence: c })}>{c}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={label}>Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUSES.map(st => (
                <button key={st} type="button"
                  className={item.status === st ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => {
                    // Closing demands a resolution — the same rule the database
                    // enforces, asked here rather than rejected later.
                    if (st === 'DONE' || st === 'WONTFIX') { setClosing(st); return; }
                    onPatch(item.ref, { status: st });
                  }}>{st.replace('_', ' ')}</button>
              ))}
            </div>
          </div>

          {closing && (
            <div style={{ padding: '12px 14px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)' }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 8 }}>
                How was it settled? An item closed without saying is the one you find a year later and cannot use.
              </div>
              <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={3}
                style={{ ...input, resize: 'vertical' } as React.CSSProperties}
                placeholder="e.g. Fixed in a1b2c3d; verified by re-running the period close." />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={!resolution.trim()}
                  onClick={() => { onPatch(item.ref, { status: closing, resolution }); setClosing(null); }}>
                  Close as {closing}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClosing(null)}>Cancel</button>
              </div>
            </div>
          )}

          {item.resolution && (
            <div>
              <div style={label}>Resolution</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{item.resolution}</div>
            </div>
          )}

          {/* Append-only, like every other trail here. */}
          <div>
            <div style={label}>History</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Add an observation — kept forever, never overwritten."
              style={{ ...input, resize: 'vertical', marginBottom: 8 } as React.CSSProperties} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!note.trim()}
              onClick={async () => { await onNote(note.trim()); setNote(''); }}>Add note</button>

            <div style={{ marginTop: 12 }}>
              {(item.events ?? []).map(e => (
                <div key={e.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {new Date(e.created_at).toLocaleString()} · {e.actor_name ?? 'system'} · {e.kind}
                  </div>
                  {e.detail}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── New item ───────────────────────────────────────────────────────────── */