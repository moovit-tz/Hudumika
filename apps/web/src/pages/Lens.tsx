import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';

/**
 * Lens — the internal developer record.
 *
 * What is pending, what is broken, what was decided and why. It exists because
 * that knowledge otherwise lives in commit messages and in whoever last touched
 * a thing, which is why the same traps get hit twice.
 *
 * The column that makes it different from a generic tracker is `confidence`.
 * The recurring failure in this codebase is not ignorance but confident
 * wrongness — findings that looked solid and were not. So an item says whether
 * anybody actually ran it, and "unproven" is a headline figure rather than a
 * detail.
 */

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK';
type Status = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

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
  BUG: 'error', FEATURE: 'brand', DEBT: 'warning',
  DECISION: 'info', QUESTION: 'gray', RISK: 'error',
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

const KINDS: Kind[] = ['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK'];
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX'];
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const CONFIDENCES: Confidence[] = ['CONFIRMED', 'SUSPECTED', 'UNVERIFIED'];

const card: React.CSSProperties = {
  background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
};
const label: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4,
};
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13,
  fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', width: '100%',
};

export function Lens() {
  const [items, setItems] = useState<Item[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<(Item & { events?: Event[] }) | null>(null);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [fKind, setFKind] = useState('');
  const [fArea, setFArea] = useState('');
  const [fConfidence, setFConfidence] = useState('');
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fKind) params.set('kind', fKind);
    if (fArea) params.set('area', fArea);
    if (fConfidence) params.set('confidence', fConfidence);
    if (q) params.set('q', q);
    if (showClosed) params.set('include_closed', '1');
    Promise.all([
      apiFetch(`/v1/lens/items?${params}`),
      apiFetch('/v1/lens/areas'),
      apiFetch('/v1/lens/stats'),
    ])
      .then(([i, a, s]: any[]) => { setItems(i ?? []); setAreas(a ?? []); setStats(s ?? null); })
      .catch(() => { setItems([]); })
      .finally(() => setLoading(false));
  }, [fKind, fArea, fConfidence, q, showClosed]);

  useEffect(() => { load(); }, [load]);

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

  const grouped = useMemo(() => {
    const by = new Map<string, Item[]>();
    for (const it of items) {
      const k = it.area_name ?? 'Unassigned';
      by.set(k, [...(by.get(k) ?? []), it]);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  if (composing) {
    return <Compose areas={areas} onClose={() => setComposing(false)}
      onSaved={(ref) => { setComposing(false); setNotice({ kind: 'ok', text: `${ref} opened.` }); load(); }} />;
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Lens', 'Board']}
        titlePlain="Developer"
        titleEm="record"
        subtitle="What is pending, what is broken, and what was decided — across the whole platform."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
            <Icon name="plus" size={14} color="#fff" /> New item
          </button>
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

      {stats && (
        <MetricsRow cards={[
          { title: 'Open items', value: String(stats.open),
            sub1Label: 'Closed', sub1Value: String(stats.total - stats.open) },
          { title: 'Bugs open', value: String(stats.by_kind.BUG ?? 0),
            sub1Label: 'Risks', sub1Value: String(stats.by_kind.RISK ?? 0) },
          { title: 'Critical / high', value: String((stats.by_severity.CRITICAL ?? 0) + (stats.by_severity.HIGH ?? 0)),
            sub1Label: 'Critical', sub1Value: String(stats.by_severity.CRITICAL ?? 0) },
          // The number this whole tool exists to keep visible.
          { title: 'Not yet reproduced', value: String(stats.unproven),
            sub1Label: 'Confirmed', sub1Value: String(stats.by_confidence.CONFIRMED ?? 0) },
        ]} />
      )}

      {/* Filters */}
      <div style={{ ...card, padding: '10px 12px', margin: '0 0 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select value={fKind || '__all__'} onValueChange={v => setFKind(v === '__all__' ? '' : v)}>
          <SelectTrigger style={{ minWidth: 130 }}><SelectValue placeholder="All kinds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All kinds</SelectItem>
            {KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fArea || '__all__'} onValueChange={v => setFArea(v === '__all__' ? '' : v)}>
          <SelectTrigger style={{ minWidth: 160 }}><SelectValue placeholder="All areas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All areas</SelectItem>
            {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fConfidence || '__all__'} onValueChange={v => setFConfidence(v === '__all__' ? '' : v)}>
          <SelectTrigger style={{ minWidth: 170 }}><SelectValue placeholder="Any confidence" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any confidence</SelectItem>
            {CONFIDENCES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink2)' }}>
          <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
          Show closed
        </label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, body, evidence…"
          style={{ ...input, width: 'auto', flex: '1 1 220px', marginLeft: 'auto', minWidth: 200 }} />
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
          Nothing matches. {showClosed ? '' : 'Closed items are hidden — tick "Show closed" to include them.'}
        </div>
      ) : grouped.map(([area, list]) => (
        <div key={area} style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {area} · {list.length}
            </span>
          </div>
          {list.map(it => (
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
        </div>
      ))}

      {selected && (
        <Detail item={selected} areas={areas} onClose={() => setSelected(null)} onPatch={patch}
          onNote={async (note) => {
            await apiFetch(`/v1/lens/items/${selected.ref}/notes`, {
              method: 'POST', body: JSON.stringify({ note }),
            });
            open(selected.ref);
          }} />
      )}
    </div>
  );
}

/* ── Detail ─────────────────────────────────────────────────────────────── */
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
