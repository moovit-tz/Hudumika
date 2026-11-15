import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { Banner } from '../../components/ui/alert.js';
import { Switch } from '../../components/ui/switch.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Spinner } from '../../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Icon } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { NetworkMap } from './NetworkMap.js';
import {
  useSupportNetwork, setCentreScope, zoneTree, DAYS, PRIORITIES, ZONE_KIND_LABEL, ROLE_LABEL,
  FIELD_TYPE_LABEL, CARRIER_LABEL, PROVIDER_LABEL,
  type SupportLine, type CallRow, type MenuOption, type Carrier,
  type CentreLive, type Centre, type GeoZone, type SupportProduct, type Queue, type Membership, type DayKey, type NetworkData, type FormField,
} from '../../lib/supportNetwork.js';

/** A field's key from its label: "Transaction ID" -> "transaction_id". */
const keyFrom = (label: string) => (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40) || 'field');

type DraftField = FormField & { optionsText?: string };

function FieldsBuilder({ fields, onChange }: { fields: DraftField[]; onChange: (f: DraftField[]) => void }) {
  const set = (i: number, patch: Partial<DraftField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) => { const n = [...fields]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map((f, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) minmax(130px, 1fr) minmax(160px, 2fr) auto auto', gap: 8, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 8, overflowX: 'auto' }}>
          <Input aria-label="Field label" value={f.label} placeholder="e.g. Transaction ID" onChange={e => set(i, { label: e.target.value, key: f.key && f.key !== keyFrom(f.label) ? f.key : keyFrom(e.target.value) })} />
          <Pick value={f.type} onChange={v => set(i, { type: (v ?? 'text') as FormField['type'] })}
            options={(Object.keys(FIELD_TYPE_LABEL) as FormField['type'][]).map(t => ({ value: t, label: FIELD_TYPE_LABEL[t] }))} />
          {f.type === 'select'
            ? <Input aria-label="Choices" value={f.optionsText ?? (f.options ?? []).join(', ')} placeholder="Choices, comma-separated" onChange={e => set(i, { optionsText: e.target.value })} />
            : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>key: {f.key || '—'}</span>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
            <Checkbox checked={!!f.required} onCheckedChange={c => set(i, { required: !!c })} /> Required
          </label>
          <div style={{ display: 'flex', gap: 2 }}>
            <Button type="button" size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronUp" size={14} /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" size={14} /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label="Remove field" onClick={() => onChange(fields.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></Button>
          </div>
        </div>
      ))}
      <div><Button type="button" size="sm" variant="outline" onClick={() => onChange([...fields, { key: '', label: '', type: 'text' }])}><Icon name="plus" size={14} /> Add field</Button></div>
    </div>
  );
}

type Tab = 'control' | 'zones' | 'centres' | 'products' | 'queues' | 'agents' | 'lines';
const TABS: { id: Tab; label: string }[] = [
  { id: 'control', label: 'Control room' }, { id: 'zones', label: 'Zones' }, { id: 'centres', label: 'Centres' },
  { id: 'products', label: 'Products' }, { id: 'queues', label: 'Queues' }, { id: 'agents', label: 'Agents' },
  { id: 'lines', label: 'Lines' },
];

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 13, verticalAlign: 'middle' };
const NONE = '__none__';

const csv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
const num = (s: string) => (s.trim() === '' ? null : Number(s));
const ago = (iso: string | null) => {
  if (!iso) return '—';
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
};

async function call(method: string, url: string, body?: unknown) {
  return apiFetch(`/v1/support/network${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{hint}</span>}
    </label>
  );
}

function Pick({ value, onChange, options, placeholder, none }: {
  value: string | null; onChange: (v: string | null) => void;
  options: { value: string; label: string }[]; placeholder?: string; none?: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={v => onChange(v === NONE ? null : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {none && <SelectItem value={NONE}>{none}</SelectItem>}
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 };

/** The inline editor shell: shown above a table, never a pop-up. */
function Editor({ title, onCancel, onSave, saving, children }: { title: string; onCancel: () => void; onSave: () => void; saving: boolean; children: React.ReactNode }) {
  return (
    <SectionCard title={title} collapsible={false}>
      <form onSubmit={e => { e.preventDefault(); onSave(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </SectionCard>
  );
}

// ── Control room ────────────────────────────────────────────────────────
function ControlRoom({ data }: { data: NetworkData }) {
  const navigate = useNavigate();
  const [live, setLive] = useState<{ unplaced_open: number | null; centres: CentreLive[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'map'>('table');

  useEffect(() => {
    let alive = true;
    const load = () => apiFetch('/v1/support/network/overview')
      .then((d: any) => { if (alive) { setLive(d); setError(null); } })
      .catch((e: any) => alive && setError(e?.message || 'Could not load the live view.'));
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const zoneOf = useMemo(() => {
    // centre → every zone above it, so filtering by a region includes its zones' centres.
    const byId = new Map(data.zones.map(z => [z.id, z]));
    return (zoneId: string | null) => {
      const out = new Set<string>(); let cur = zoneId ? byId.get(zoneId) : undefined;
      while (cur && !out.has(cur.id)) { out.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
      return out;
    };
  }, [data.zones]);

  if (error) return <Banner variant="error">{error}</Banner>;
  if (!live) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  const rows = live.centres.filter(c => !zone || zoneOf(c.zone_id).has(zone));
  const sum = (k: keyof CentreLive) => rows.reduce((a, c) => a + (Number(c[k]) || 0), 0);
  const zoneName = (id: string | null) => data.zones.find(z => z.id === id)?.name ?? '—';
  const tiles = [
    { label: 'Centres open now', value: `${rows.filter(c => c.open_now).length} / ${rows.length}`, icon: 'mapPin' as const },
    { label: 'Open tickets', value: sum('open'), icon: 'package' as const },
    { label: 'Unassigned', value: sum('unassigned'), icon: 'users' as const, warn: sum('unassigned') > 0 },
    { label: 'Past SLA', value: sum('breached'), icon: 'alertTriangle' as const, bad: sum('breached') > 0 },
    { label: 'Agents online', value: `${sum('agents_online')} / ${sum('agents')}`, icon: 'activity' as const },
  ];

  if (!live.centres.length) {
    return (
      <Banner variant="info" title="No centres yet">
        Add your zones, then your centres, on the tabs above. Once a centre has support switched on, new tickets are routed to it and it appears here live.
      </Banner>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 220 }}>
          <Pick value={zone} onChange={setZone} none="Every zone"
            options={zoneTree(data.zones).map(({ zone: z, depth }) => ({ value: z.id, label: `${'— '.repeat(depth)}${z.name}` }))} />
        </div>
        <Tabs value={view} onValueChange={v => setView(v as 'table' | 'map')} variant="segmented">
          <TabsList><TabsTrigger value="table">Table</TabsTrigger><TabsTrigger value="map">Map</TabsTrigger></TabsList>
        </Tabs>
        {live.unplaced_open ? (
          <Badge variant="warning">{live.unplaced_open} open ticket{live.unplaced_open === 1 ? '' : 's'} not placed in any centre</Badge>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <Icon name={t.icon} size={13} /> {t.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: t.bad ? 'var(--red)' : t.warn ? 'var(--gold)' : 'var(--ink)' }}>{t.value}</div>
          </div>
        ))}
      </div>

      {view === 'map' ? (
        <NetworkMap centres={rows} zones={data.zones.filter(z => !zone || zoneOf(z.id).has(zone) || z.id === zone)}
          onOpenInbox={id => { setCentreScope({ kind: 'centre', id }); navigate('/bliss/inbox'); }} />
      ) : (
      <SectionCard title={`Centres (${rows.length})`} padded={false} collapsible={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>
              {['Centre', 'Zone', 'Status', 'Open', 'Unassigned', 'Past SLA', 'Urgent', 'Oldest', 'Agents online', 'Calls (24h)', 'First reply (7d)', 'CSAT (7d)', ''].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td style={{ ...td, fontWeight: 600, minWidth: 190 }}>{c.name}<div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 400 }}>{[c.city, c.country_code].filter(Boolean).join(', ')}</div></td>
                  <td style={{ ...td, minWidth: 130 }}>{zoneName(c.zone_id)}</td>
                  <td style={td}><Badge variant={c.open_now ? 'success' : 'gray'}>{c.open_now ? 'Open' : 'Closed'}</Badge></td>
                  <td style={td}>{c.open}</td>
                  <td style={{ ...td, color: c.unassigned ? 'var(--gold)' : undefined, fontWeight: c.unassigned ? 700 : undefined }}>{c.unassigned}</td>
                  <td style={{ ...td, color: c.breached ? 'var(--red)' : undefined, fontWeight: c.breached ? 700 : undefined }}>{c.breached}</td>
                  <td style={td}>{c.urgent}</td>
                  <td style={td}>{ago(c.oldest_open)}</td>
                  <td style={td}>{c.agents_online} / {c.agents}{c.agents_on_shift ? <span style={{ color: 'var(--ink3)' }}> · {c.agents_on_shift} on shift</span> : null}</td>
                  <td style={td}>{c.calls_24h}{c.unanswered_calls_24h ? <span style={{ color: 'var(--red)' }}> · {c.unanswered_calls_24h} unanswered</span> : null}</td>
                  <td style={td}>{c.first_reply_hours == null ? '—' : `${c.first_reply_hours} h`}</td>
                  <td style={td}>{c.csat == null ? '—' : c.csat}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Button size="sm" variant="outline" onClick={() => { setCentreScope({ kind: 'centre', id: c.id }); navigate('/bliss/inbox'); }}>
                      Open inbox
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      )}
    </div>
  );
}

// ── Zones ───────────────────────────────────────────────────────────────
function Zones({ data, reload }: { data: NetworkData; reload: () => void }) {
  const [edit, setEdit] = useState<Partial<GeoZone> & { id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const tree = zoneTree(data.zones);
  const centresIn = (id: string) => data.centres.filter(c => c.zone_id === id).length;

  const save = async () => {
    if (!edit?.name?.trim()) return showAlert('Give the zone a name.');
    setSaving(true);
    try {
      const body = { name: edit.name, code: edit.code || null, kind: edit.kind ?? 'zone', parent_id: edit.parent_id ?? null,
        center_lat: edit.center_lat ?? null, center_lng: edit.center_lng ?? null, radius_km: edit.radius_km ?? null, timezone: edit.timezone || null };
      await call(edit.id ? 'PATCH' : 'POST', edit.id ? `/zones/${edit.id}` : '/zones', body);
      setEdit(null); reload();
    } catch (e: any) { showAlert(e?.message || 'Could not save the zone.'); } finally { setSaving(false); }
  };
  const remove = async (z: GeoZone) => {
    if (!(await showConfirm(`Delete ${z.name}? Its centres and sub-zones stay, without a zone.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await call('DELETE', `/zones/${z.id}`); reload(); } catch (e: any) { showAlert(e?.message || 'Could not delete the zone.'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {edit && (
        <Editor title={edit.id ? `Edit ${edit.name}` : 'New zone'} onCancel={() => setEdit(null)} onSave={save} saving={saving}>
          <div style={grid}>
            <Field label="Name"><Input value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Coast Region" /></Field>
            <Field label="Code"><Input value={edit.code ?? ''} onChange={e => setEdit({ ...edit, code: e.target.value })} placeholder="e.g. TZ-COAST" /></Field>
            <Field label="Kind"><Pick value={edit.kind ?? 'zone'} onChange={v => setEdit({ ...edit, kind: (v ?? 'zone') as GeoZone['kind'] })}
              options={(Object.keys(ZONE_KIND_LABEL) as GeoZone['kind'][]).map(k => ({ value: k, label: ZONE_KIND_LABEL[k] }))} /></Field>
            <Field label="Inside"><Pick value={edit.parent_id ?? null} onChange={v => setEdit({ ...edit, parent_id: v })} none="Top level"
              options={tree.filter(t => t.zone.id !== edit.id).map(({ zone, depth }) => ({ value: zone.id, label: `${'— '.repeat(depth)}${zone.name}` }))} /></Field>
            <Field label="Centre latitude"><Input inputMode="decimal" value={edit.center_lat ?? ''} onChange={e => setEdit({ ...edit, center_lat: num(e.target.value) })} placeholder="-6.7924" /></Field>
            <Field label="Centre longitude"><Input inputMode="decimal" value={edit.center_lng ?? ''} onChange={e => setEdit({ ...edit, center_lng: num(e.target.value) })} placeholder="39.2083" /></Field>
            <Field label="Radius (km)" hint="Optional: the area this zone covers"><Input inputMode="decimal" value={edit.radius_km ?? ''} onChange={e => setEdit({ ...edit, radius_km: num(e.target.value) })} /></Field>
            <Field label="Timezone"><Input value={edit.timezone ?? ''} onChange={e => setEdit({ ...edit, timezone: e.target.value })} placeholder="Africa/Dar_es_Salaam" /></Field>
          </div>
        </Editor>
      )}
      <SectionCard title={`Zones (${data.zones.length})`} padded={false} collapsible={false}
        action={data.scope.can_manage && !edit ? <Button size="sm" onClick={() => setEdit({ kind: 'zone' })}><Icon name="plus" size={14} /> Add zone</Button> : undefined}>
        {!tree.length ? <div style={{ padding: 24, color: 'var(--ink3)' }}>No zones yet. Start with your countries or regions, then add zones inside them.</div> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Zone', 'Kind', 'Code', 'Centres', 'Area', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{tree.map(({ zone: z, depth }) => (
              <tr key={z.id}>
                <td style={{ ...td, fontWeight: 600, paddingLeft: 12 + depth * 22 }}>{depth > 0 && <span style={{ color: 'var(--ink3)' }}>└ </span>}{z.name}</td>
                <td style={td}>{ZONE_KIND_LABEL[z.kind]}</td>
                <td style={td}>{z.code ?? '—'}</td>
                <td style={td}>{centresIn(z.id)}</td>
                <td style={{ ...td, fontSize: 12, color: 'var(--ink3)' }}>{z.center_lat != null && z.center_lng != null ? `${Number(z.center_lat).toFixed(3)}, ${Number(z.center_lng).toFixed(3)}${z.radius_km ? ` · ${z.radius_km} km` : ''}` : '—'}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {data.scope.can_manage && <>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${z.name}`} onClick={() => setEdit(z)}><Icon name="edit" size={14} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${z.name}`} onClick={() => remove(z)}><Icon name="trash" size={14} /></Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Centres ─────────────────────────────────────────────────────────────
const DAY_LABEL: Record<DayKey, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function HoursEditor({ value, onChange }: { value: Centre['opening_hours']; onChange: (v: Centre['opening_hours']) => void }) {
  const always = !value;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <Switch checked={always} onCheckedChange={c => onChange(c ? null : { mon: ['08:00', '17:00'], tue: ['08:00', '17:00'], wed: ['08:00', '17:00'], thu: ['08:00', '17:00'], fri: ['08:00', '17:00'] })} />
        Open around the clock
      </label>
      {!always && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {DAYS.map(d => {
            const h = value?.[d];
            return (
              <div key={d} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                  <Checkbox checked={!!h} onCheckedChange={c => {
                    const next = { ...(value ?? {}) };
                    if (c) next[d] = ['08:00', '17:00']; else delete next[d];
                    onChange(next);
                  }} />
                  {DAY_LABEL[d]}
                </label>
                {h ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Input type="time" value={h[0]} onChange={e => onChange({ ...value, [d]: [e.target.value, h[1]] })} aria-label={`${DAY_LABEL[d]} opens`} />
                    <Input type="time" value={h[1]} onChange={e => onChange({ ...value, [d]: [h[0], e.target.value] })} aria-label={`${DAY_LABEL[d]} closes`} />
                  </div>
                ) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Closed</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Centres({ data, reload }: { data: NetworkData; reload: () => void }) {
  const [edit, setEdit] = useState<Partial<Centre> | null>(null);
  const [saving, setSaving] = useState(false);
  const zones = zoneTree(data.zones);
  const zoneName = (id: string | null) => data.zones.find(z => z.id === id)?.name ?? '—';
  const agentsAt = (id: string) => data.memberships.filter(m => m.site_id === id).length;

  const save = async () => {
    if (!edit?.name?.trim()) return showAlert('Give the centre a name.');
    setSaving(true);
    try {
      const body = {
        name: edit.name, code: edit.code || null, zone_id: edit.zone_id ?? null, address: edit.address || null,
        city: edit.city || null, region: edit.region || null, country_code: (edit.country_code || 'TZ').toUpperCase(),
        timezone: edit.timezone || 'Africa/Dar_es_Salaam', latitude: edit.latitude ?? null, longitude: edit.longitude ?? null,
        opening_hours: edit.opening_hours ?? null, support_enabled: edit.support_enabled ?? true,
        ...(edit.id ? {} : { site_type: 'contact_centre' }),
      };
      await call(edit.id ? 'PATCH' : 'POST', edit.id ? `/centres/${edit.id}` : '/centres', body);
      setEdit(null); reload();
    } catch (e: any) { showAlert(e?.message || 'Could not save the centre.'); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {edit && (
        <Editor title={edit.id ? `Edit ${edit.name}` : 'New centre'} onCancel={() => setEdit(null)} onSave={save} saving={saving}>
          <div style={grid}>
            <Field label="Name"><Input value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Dar es Salaam Hub" /></Field>
            <Field label="Code"><Input value={edit.code ?? ''} onChange={e => setEdit({ ...edit, code: e.target.value })} placeholder="e.g. DSM-01" /></Field>
            <Field label="Zone"><Pick value={edit.zone_id ?? null} onChange={v => setEdit({ ...edit, zone_id: v })} none="No zone"
              options={zones.map(({ zone, depth }) => ({ value: zone.id, label: `${'— '.repeat(depth)}${zone.name}` }))} /></Field>
            <Field label="City"><Input value={edit.city ?? ''} onChange={e => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="Country (2 letters)"><Input maxLength={2} value={edit.country_code ?? 'TZ'} onChange={e => setEdit({ ...edit, country_code: e.target.value })} /></Field>
            <Field label="Timezone"><Input value={edit.timezone ?? 'Africa/Dar_es_Salaam'} onChange={e => setEdit({ ...edit, timezone: e.target.value })} /></Field>
            <Field label="Latitude" hint="Used to send customers to the nearest open centre"><Input inputMode="decimal" value={edit.latitude ?? ''} onChange={e => setEdit({ ...edit, latitude: num(e.target.value) })} placeholder="-6.7924" /></Field>
            <Field label="Longitude"><Input inputMode="decimal" value={edit.longitude ?? ''} onChange={e => setEdit({ ...edit, longitude: num(e.target.value) })} placeholder="39.2083" /></Field>
            <Field label="Address"><Input value={edit.address ?? ''} onChange={e => setEdit({ ...edit, address: e.target.value })} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Switch checked={edit.support_enabled ?? true} onCheckedChange={c => setEdit({ ...edit, support_enabled: c })} />
            Takes support work (new tickets can be routed here)
          </label>
          <Field label="Opening hours (centre's own timezone)"><HoursEditor value={edit.opening_hours ?? null} onChange={v => setEdit({ ...edit, opening_hours: v })} /></Field>
        </Editor>
      )}
      <SectionCard title={`Centres (${data.centres.length})`} padded={false} collapsible={false}
        action={data.scope.can_manage && !edit ? <Button size="sm" onClick={() => setEdit({ support_enabled: true, country_code: 'TZ', timezone: 'Africa/Dar_es_Salaam' })}><Icon name="plus" size={14} /> Add centre</Button> : undefined}>
        {!data.centres.length ? <div style={{ padding: 24, color: 'var(--ink3)' }}>No centres yet.</div> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Centre', 'Zone', 'Location', 'Hours', 'Agents', 'Support', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.centres.map(c => (
              <tr key={c.id}>
                <td style={{ ...td, fontWeight: 600, minWidth: 180 }}>{c.name}{c.code && <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 400 }}>{c.code}</div>}</td>
                <td style={td}>{zoneName(c.zone_id)}</td>
                <td style={td}>
                  {[c.city, c.country_code].filter(Boolean).join(', ') || '—'}
                  {c.latitude != null && c.longitude != null && (
                    <div><a href={`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=14/${c.latitude}/${c.longitude}`} target="_blank" rel="noreferrer" style={{ fontSize: 11.5 }}>
                      {Number(c.latitude).toFixed(4)}, {Number(c.longitude).toFixed(4)}
                    </a></div>
                  )}
                </td>
                <td style={{ ...td, fontSize: 12 }}>{!c.opening_hours ? '24/7' : DAYS.filter(d => c.opening_hours?.[d]).map(d => `${DAY_LABEL[d]} ${c.opening_hours![d]![0]}–${c.opening_hours![d]![1]}`).join(' · ') || 'Closed'}</td>
                <td style={td}>{agentsAt(c.id)}</td>
                <td style={td}>{c.support_enabled ? <Badge variant={c.open_now ? 'success' : 'gray'}>{c.open_now ? 'Open now' : 'Closed now'}</Badge> : <Badge variant="gray">Off</Badge>}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {data.scope.can_manage && <Button size="sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}><Icon name="edit" size={14} /></Button>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Products ────────────────────────────────────────────────────────────
function Products({ data, reload }: { data: NetworkData; reload: () => void }) {
  const [edit, setEdit] = useState<(Partial<SupportProduct> & { appsText?: string; draftFields?: DraftField[] }) | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = data.scope.all;

  const save = async () => {
    if (!edit?.name?.trim()) return showAlert('Give the product a name.');
    setSaving(true);
    try {
      const sla: Record<string, number> = {};
      for (const p of PRIORITIES) { const v = Number(edit.sla_hours?.[p]); if (v > 0) sla[p] = v; }
      const draft = edit.draftFields ?? edit.form_fields ?? [];
      const form_fields = draft.filter(f => f.label.trim()).map(f => ({
        key: f.key || keyFrom(f.label), label: f.label.trim(), type: f.type, required: !!f.required,
        ...(f.type === 'select' ? { options: csv((f as DraftField).optionsText ?? (f.options ?? []).join(', ')) } : {}),
      }));
      if (form_fields.some(f => f.type === 'select' && !f.options?.length)) { setSaving(false); return showAlert('A choice field needs at least one choice.'); }
      const body = { name: edit.name, code: edit.code || null, color: edit.color || null, description: edit.description || null,
        source_apps: csv(edit.appsText ?? (edit.source_apps ?? []).join(', ')), sla_hours: sla, status: edit.status ?? 'active', form_fields };
      await call(edit.id ? 'PATCH' : 'POST', edit.id ? `/products/${edit.id}` : '/products', body);
      setEdit(null); reload();
    } catch (e: any) { showAlert(e?.message || 'Could not save the product.'); } finally { setSaving(false); }
  };
  const remove = async (p: SupportProduct) => {
    if (!(await showConfirm(`Delete ${p.name}? Its tickets keep their history but lose the product tag.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await call('DELETE', `/products/${p.id}`); reload(); } catch (e: any) { showAlert(e?.message || 'Could not delete the product.'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {edit && (
        <Editor title={edit.id ? `Edit ${edit.name}` : 'New product line'} onCancel={() => setEdit(null)} onSave={save} saving={saving}>
          <div style={grid}>
            <Field label="Name"><Input value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Rides" /></Field>
            <Field label="Code"><Input value={edit.code ?? ''} onChange={e => setEdit({ ...edit, code: e.target.value })} placeholder="e.g. RIDES" /></Field>
            <Field label="Raised from apps" hint="Comma-separated app ids, e.g. clearos, tracking">
              <Input value={edit.appsText ?? (edit.source_apps ?? []).join(', ')} onChange={e => setEdit({ ...edit, appsText: e.target.value })} />
            </Field>
            <Field label="Description"><Input value={edit.description ?? ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
          <Field label="Resolve within (hours), by priority" hint="Blank uses the workspace default (Urgent 4 · High 8 · Medium/Normal 24 · Low 48)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {PRIORITIES.map(p => (
                <label key={p} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                  <Input inputMode="decimal" value={edit.sla_hours?.[p] ?? ''} onChange={e => setEdit({ ...edit, sla_hours: { ...(edit.sla_hours ?? {}), [p]: e.target.value === '' ? undefined : Number(e.target.value) } })} />
                </label>
              ))}
            </div>
          </Field>
          <Field label="Ticket form" hint="What to ask when a ticket is raised for this product. Shown on the New Ticket form and in the ticket's details.">
            <FieldsBuilder fields={edit.draftFields ?? edit.form_fields ?? []} onChange={f => setEdit({ ...edit, draftFields: f })} />
          </Field>
        </Editor>
      )}
      <SectionCard title={`Product lines (${data.products.length})`} padded={false} collapsible={false}
        action={isAdmin && !edit ? <Button size="sm" onClick={() => setEdit({ status: 'active', sla_hours: {} })}><Icon name="plus" size={14} /> Add product</Button> : undefined}>
        {!data.products.length ? <div style={{ padding: 24, color: 'var(--ink3)' }}>No product lines yet. Add one per kind of support (e.g. Rides, Delivery, Payments), each with its own SLA.</div> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Product', 'From apps', 'SLA (hours)', 'Form', 'Queues', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.products.map(p => (
              <tr key={p.id}>
                <td style={{ ...td, fontWeight: 600, minWidth: 160 }}>{p.name}{p.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 400 }}>{p.description}</div>}</td>
                <td style={td}>{p.source_apps.length ? p.source_apps.join(', ') : '—'}</td>
                <td style={{ ...td, fontSize: 12 }}>{PRIORITIES.filter(k => p.sla_hours?.[k]).map(k => `${k.charAt(0) + k.slice(1).toLowerCase()} ${p.sla_hours[k]}`).join(' · ') || 'Default'}</td>
                <td style={{ ...td, fontSize: 12 }}>{(p.form_fields ?? []).length ? (p.form_fields ?? []).map(f => f.label).join(' · ') : '—'}</td>
                <td style={td}>{data.queues.filter(q => q.product_id === p.id).length}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {isAdmin && <>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEdit(p)}><Icon name="edit" size={14} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}><Icon name="trash" size={14} /></Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Queues ──────────────────────────────────────────────────────────────
function Queues({ data, reload }: { data: NetworkData; reload: () => void }) {
  const [edit, setEdit] = useState<(Partial<Queue> & { skillsText?: string; langText?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const centreName = (id: string | null) => (id ? data.centres.find(c => c.id === id)?.name ?? '—' : 'Whole network');
  const productName = (id: string | null) => (id ? data.products.find(p => p.id === id)?.name ?? '—' : 'Any product');
  // People who may work this queue: anyone in its centre, or anyone at all for a network-wide queue.
  const eligible = useMemo(() => {
    if (!edit) return [];
    const ids = edit.site_id ? new Set(data.memberships.filter(m => m.site_id === edit.site_id).map(m => m.user_id)) : null;
    const pool = data.people.length ? data.people : data.memberships.map(m => ({ id: m.user_id, name: m.user_name, email: m.user_email, role: '' }));
    const uniq = new Map(pool.map(p => [p.id, p]));
    return [...uniq.values()].filter(p => !ids || ids.has(p.id));
  }, [edit, data]);

  const save = async () => {
    if (!edit?.name?.trim()) return showAlert('Give the queue a name.');
    setSaving(true);
    try {
      const body = { name: edit.name, site_id: edit.site_id ?? null, product_id: edit.product_id ?? null,
        skills: csv(edit.skillsText ?? (edit.skills ?? []).join(', ')), languages: csv(edit.langText ?? (edit.languages ?? []).join(', ')),
        overflow: edit.overflow ?? 'zone', member_ids: edit.member_ids ?? [] };
      await call(edit.id ? 'PATCH' : 'POST', edit.id ? `/queues/${edit.id}` : '/queues', body);
      setEdit(null); reload();
    } catch (e: any) { showAlert(e?.message || 'Could not save the queue.'); } finally { setSaving(false); }
  };
  const remove = async (q: Queue) => {
    if (!(await showConfirm(`Delete the ${q.name} queue? Its tickets stay, without a queue.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await call('DELETE', `/queues/${q.id}`); reload(); } catch (e: any) { showAlert(e?.message || 'Could not delete the queue.'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {edit && (
        <Editor title={edit.id ? `Edit ${edit.name}` : 'New queue'} onCancel={() => setEdit(null)} onSave={save} saving={saving}>
          <div style={grid}>
            <Field label="Name"><Input value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Rides · Dar es Salaam" /></Field>
            <Field label="Centre"><Pick value={edit.site_id ?? null} onChange={v => setEdit({ ...edit, site_id: v })} none="Whole network"
              options={data.centres.filter(c => c.support_enabled).map(c => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Product"><Pick value={edit.product_id ?? null} onChange={v => setEdit({ ...edit, product_id: v })} none="Any product"
              options={data.products.map(p => ({ value: p.id, label: p.name }))} /></Field>
            <Field label="When nobody here is free"><Pick value={edit.overflow ?? 'zone'} onChange={v => setEdit({ ...edit, overflow: (v ?? 'zone') as Queue['overflow'] })}
              options={[{ value: 'zone', label: 'Send to another centre in the zone' }, { value: 'network', label: 'Send anywhere in the network' }, { value: 'none', label: 'Wait in this queue' }]} /></Field>
            <Field label="Skills" hint="Comma-separated"><Input value={edit.skillsText ?? (edit.skills ?? []).join(', ')} onChange={e => setEdit({ ...edit, skillsText: e.target.value })} placeholder="payments, refunds" /></Field>
            <Field label="Languages" hint="Comma-separated"><Input value={edit.langText ?? (edit.languages ?? []).join(', ')} onChange={e => setEdit({ ...edit, langText: e.target.value })} placeholder="sw, en" /></Field>
          </div>
          <Field label={`Who works this queue (${(edit.member_ids ?? []).length})`} hint={edit.site_id ? 'People added to this centre on the Agents tab.' : undefined}>
            {!eligible.length ? <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{edit.site_id ? 'Nobody is in this centre yet — add them on the Agents tab.' : 'No people available.'}</span> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {eligible.map(p => {
                  const on = (edit.member_ids ?? []).includes(p.id);
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: 6, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                      <Checkbox checked={on} onCheckedChange={c => setEdit({ ...edit, member_ids: c ? [...(edit.member_ids ?? []), p.id] : (edit.member_ids ?? []).filter(x => x !== p.id) })} />
                      <PersonAvatar userId={p.id} name={p.name} size={22} />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </Field>
        </Editor>
      )}
      <SectionCard title={`Queues (${data.queues.length})`} padded={false} collapsible={false}
        action={data.scope.can_manage && !edit ? <Button size="sm" onClick={() => setEdit({ overflow: 'zone', member_ids: [] })}><Icon name="plus" size={14} /> Add queue</Button> : undefined}>
        {!data.queues.length ? <div style={{ padding: 24, color: 'var(--ink3)' }}>No queues yet. A queue is a centre and/or product, and the people who work it.</div> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Queue', 'Centre', 'Product', 'People', 'Overflow', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.queues.map(q => (
              <tr key={q.id}>
                <td style={{ ...td, fontWeight: 600, minWidth: 180 }}>{q.name}{(q.skills.length > 0 || q.languages.length > 0) && <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 400 }}>{[...q.skills, ...q.languages].join(' · ')}</div>}</td>
                <td style={td}>{centreName(q.site_id)}</td>
                <td style={td}>{productName(q.product_id)}</td>
                <td style={td}>{q.member_ids.length}</td>
                <td style={td}>{q.overflow === 'zone' ? 'Zone' : q.overflow === 'network' ? 'Network' : 'None'}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {data.scope.can_manage && <>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${q.name}`} onClick={() => setEdit(q)}><Icon name="edit" size={14} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${q.name}`} onClick={() => remove(q)}><Icon name="trash" size={14} /></Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Agents ──────────────────────────────────────────────────────────────
function Agents({ data, reload }: { data: NetworkData; reload: () => void }) {
  type Draft = Partial<Membership> & { where?: 'centre' | 'zone'; skillsText?: string; langText?: string };
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const placeName = (m: Membership) => m.site_id ? data.centres.find(c => c.id === m.site_id)?.name ?? '—' : data.zones.find(z => z.id === m.zone_id)?.name ?? '—';

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const common = { skills: csv(edit.skillsText ?? (edit.skills ?? []).join(', ')), languages: csv(edit.langText ?? (edit.languages ?? []).join(', ')), max_open: edit.max_open ?? 15 };
      if (edit.id) await call('PATCH', `/memberships/${edit.id}`, { ...common, ...(edit.zone_id ? {} : { role: edit.role }) });
      else {
        if (!edit.user_id) { setSaving(false); return showAlert('Choose a person.'); }
        const zone = edit.where === 'zone';
        if (zone ? !edit.zone_id : !edit.site_id) { setSaving(false); return showAlert(zone ? 'Choose a zone.' : 'Choose a centre.'); }
        await call('POST', '/memberships', { ...common, user_id: edit.user_id, site_id: zone ? null : edit.site_id, zone_id: zone ? edit.zone_id : null, role: zone ? 'zone_manager' : (edit.role ?? 'agent') });
      }
      setEdit(null); reload();
    } catch (e: any) { showAlert(e?.message || 'Could not save.'); } finally { setSaving(false); }
  };
  const remove = async (m: Membership) => {
    if (!(await showConfirm(`Remove ${m.user_name} from ${placeName(m)}?`, { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try { await call('DELETE', `/memberships/${m.id}`); reload(); } catch (e: any) { showAlert(e?.message || 'Could not remove.'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {edit && (
        <Editor title={edit.id ? `Edit ${edit.user_name}` : 'Add a person to a centre or zone'} onCancel={() => setEdit(null)} onSave={save} saving={saving}>
          <div style={grid}>
            {!edit.id && <>
              <Field label="Person"><Pick value={edit.user_id ?? null} onChange={v => setEdit({ ...edit, user_id: v ?? undefined })} placeholder="Choose a person"
                options={data.people.map(p => ({ value: p.id, label: `${p.name} · ${p.email}` }))} /></Field>
              <Field label="Works at"><Pick value={edit.where ?? 'centre'} onChange={v => setEdit({ ...edit, where: (v ?? 'centre') as 'centre' | 'zone' })}
                options={[{ value: 'centre', label: 'A centre' }, { value: 'zone', label: 'Oversees a zone (zone manager)' }]} /></Field>
              {edit.where === 'zone'
                ? <Field label="Zone"><Pick value={edit.zone_id ?? null} onChange={v => setEdit({ ...edit, zone_id: v })} placeholder="Choose a zone"
                    options={zoneTree(data.zones).map(({ zone, depth }) => ({ value: zone.id, label: `${'— '.repeat(depth)}${zone.name}` }))} /></Field>
                : <Field label="Centre"><Pick value={edit.site_id ?? null} onChange={v => setEdit({ ...edit, site_id: v })} placeholder="Choose a centre"
                    options={data.centres.map(c => ({ value: c.id, label: c.name }))} /></Field>}
            </>}
            {(edit.id ? !edit.zone_id : edit.where !== 'zone') && (
              <Field label="Role"><Pick value={edit.role ?? 'agent'} onChange={v => setEdit({ ...edit, role: (v ?? 'agent') as Membership['role'] })}
                options={(['agent', 'lead', 'centre_manager'] as const).map(r => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
            )}
            <Field label="Skills" hint="Comma-separated"><Input value={edit.skillsText ?? (edit.skills ?? []).join(', ')} onChange={e => setEdit({ ...edit, skillsText: e.target.value })} /></Field>
            <Field label="Languages" hint="Comma-separated"><Input value={edit.langText ?? (edit.languages ?? []).join(', ')} onChange={e => setEdit({ ...edit, langText: e.target.value })} placeholder="sw, en" /></Field>
            <Field label="Max open tickets" hint="Routing stops giving them work at this many"><Input inputMode="numeric" value={edit.max_open ?? 15} onChange={e => setEdit({ ...edit, max_open: Number(e.target.value) || 1 })} /></Field>
          </div>
        </Editor>
      )}
      <SectionCard title={`People (${data.memberships.length})`} padded={false} collapsible={false}
        action={data.scope.can_manage && !edit && data.people.length > 0 ? <Button size="sm" onClick={() => setEdit({ where: 'centre', role: 'agent', max_open: 15 })}><Icon name="plus" size={14} /> Add person</Button> : undefined}>
        {!data.memberships.length ? <div style={{ padding: 24, color: 'var(--ink3)' }}>Nobody is in a centre yet. Until someone is, every agent sees every ticket, as before.</div> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Person', 'Centre / zone', 'Role', 'Skills & languages', 'Capacity', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.memberships.map(m => (
              <tr key={m.id}>
                <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PersonAvatar userId={m.user_id} name={m.user_name} size={26} /><div><div style={{ fontWeight: 600 }}>{m.user_name}</div><div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{m.user_email}</div></div></div></td>
                <td style={td}>{placeName(m)}</td>
                <td style={td}><Badge variant={m.role === 'zone_manager' || m.role === 'centre_manager' ? 'brand' : 'gray'}>{ROLE_LABEL[m.role]}</Badge></td>
                <td style={{ ...td, fontSize: 12 }}>{[...m.skills, ...m.languages].join(' · ') || '—'}</td>
                <td style={td}>{m.max_open}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {data.scope.can_manage && <>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${m.user_name}`} onClick={() => setEdit(m)}><Icon name="edit" size={14} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${m.user_name}`} onClick={() => remove(m)}><Icon name="trash" size={14} /></Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Lines: phone and WhatsApp numbers per centre ────────────────────────
const CALL_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'gray' | 'info' }> = {
  completed: { label: 'Answered', variant: 'success' }, ringing: { label: 'Ringing', variant: 'info' },
  menu: { label: 'In menu', variant: 'info' }, voicemail: { label: 'Voicemail', variant: 'warning' },
  after_hours: { label: 'After hours', variant: 'warning' }, missed: { label: 'Missed', variant: 'error' },
};

function MenuBuilder({ data, menu, onChange }: { data: NetworkData; menu: MenuOption[]; onChange: (m: MenuOption[]) => void }) {
  const set = (i: number, patch: Partial<MenuOption>) => onChange(menu.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const free = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].find(d => !menu.some(o => o.digit === d));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {menu.map((o, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px minmax(140px, 1.4fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr) auto', gap: 8, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 8, overflowX: 'auto' }}>
          <Pick value={o.digit} onChange={v => set(i, { digit: v ?? o.digit })}
            options={['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].filter(d => d === o.digit || !menu.some(x => x.digit === d)).map(d => ({ value: d, label: `Key ${d}` }))} />
          <Input aria-label="Option name" value={o.label} placeholder="e.g. Payments" onChange={e => set(i, { label: e.target.value })} />
          <Pick value={o.action} onChange={v => set(i, { action: (v ?? 'route') as MenuOption['action'] })}
            options={[{ value: 'route', label: 'Connect to an agent' }, { value: 'voicemail', label: 'Take a message' }]} />
          <Pick value={o.product_id ?? null} onChange={v => set(i, { product_id: v })} none="Line's product"
            options={data.products.map(p => ({ value: p.id, label: p.name }))} />
          <Pick value={o.site_id ?? null} onChange={v => set(i, { site_id: v })} none="Line's centre"
            options={data.centres.filter(c => c.support_enabled).map(c => ({ value: c.id, label: c.name }))} />
          <Button type="button" size="sm" variant="ghost" aria-label="Remove option" onClick={() => onChange(menu.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></Button>
        </div>
      ))}
      {free && menu.length < 10 && (
        <div><Button type="button" size="sm" variant="outline" onClick={() => onChange([...menu, { digit: free, label: '', action: 'route' }])}><Icon name="plus" size={14} /> Add option</Button></div>
      )}
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
      <code style={{ fontSize: 12, padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflowX: 'auto', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{value}</code>
      <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => showAlert(value, { title: 'Copy this address' }))}>
        {done ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function Lines({ data }: { data: NetworkData }) {
  type Draft = Partial<SupportLine>;
  const [lines, setLines] = useState<SupportLine[] | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => Promise.all([apiFetch('/v1/support/network/lines'), apiFetch('/v1/support/network/calls?limit=30')])
    .then(([l, c]: any) => { setLines(l); setCalls(c); setError(null); })
    .catch((e: any) => setError(e?.message || 'Could not load lines.'));
  useEffect(() => { load(); }, []);
  const centreName = (id: string | null) => data.centres.find(c => c.id === id)?.name ?? '—';
  const productName = (id: string | null) => data.products.find(p => p.id === id)?.name ?? '—';

  const save = async () => {
    if (!edit?.name?.trim() || !edit.phone_number?.trim()) return showAlert('Give the line a name and its number.');
    if ((edit.menu ?? []).some(o => !o.label.trim())) return showAlert('Name every menu option, e.g. "Payments".');
    setSaving(true);
    try {
      const body = {
        kind: edit.kind ?? 'voice', name: edit.name, phone_number: edit.phone_number, carrier: edit.carrier ?? 'other',
        provider: edit.provider ?? (edit.kind === 'whatsapp' ? 'meta' : 'africastalking'), external_id: edit.external_id || null,
        site_id: edit.site_id ?? null, product_id: edit.product_id ?? null, greeting: edit.greeting || null,
        greeting_audio_url: edit.greeting_audio_url || null, menu: edit.kind === 'whatsapp' ? [] : (edit.menu ?? []),
        after_hours: edit.after_hours ?? 'voicemail', ring_agents: edit.ring_agents ?? true, status: edit.status ?? 'active',
      };
      const saved: SupportLine = await call(edit.id ? 'PATCH' : 'POST', edit.id ? `/lines/${edit.id}` : '/lines', body);
      setEdit(saved.webhook_url && !edit.id && saved.kind === 'voice' ? { ...saved } : null);
      await load();
    } catch (e: any) { showAlert(e?.message || 'Could not save the line.'); } finally { setSaving(false); }
  };
  const remove = async (l: SupportLine) => {
    if (!(await showConfirm(`Remove the line ${l.name} (${l.phone_number})? Calls to it will be rejected.`, { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try { await call('DELETE', `/lines/${l.id}`); load(); } catch (e: any) { showAlert(e?.message || 'Could not remove the line.'); }
  };
  const rotate = async (l: SupportLine) => {
    if (!(await showConfirm('Make a new callback address? The old one stops working, so update it in Africa\'s Talking straight away.', { confirmLabel: 'Make new address' }))) return;
    try { const r = await call('POST', `/lines/${l.id}/rotate-token`); setEdit(e => e ? { ...e, webhook_url: r.webhook_url } : e); load(); }
    catch (e: any) { showAlert(e?.message || 'Could not change the address.'); }
  };

  if (error) return <Banner variant="error">{error}</Banner>;
  if (!lines) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  const voice = (edit?.kind ?? 'voice') === 'voice';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {edit && (
        <Editor title={edit.id ? `Edit ${edit.name}` : 'New line'} onCancel={() => setEdit(null)} onSave={save} saving={saving}>
          <div style={grid}>
            <Field label="Type"><Pick value={edit.kind ?? 'voice'} onChange={v => setEdit({ ...edit, kind: (v ?? 'voice') as SupportLine['kind'] })}
              options={[{ value: 'voice', label: 'Phone line' }, { value: 'whatsapp', label: 'WhatsApp number' }]} /></Field>
            <Field label="Name"><Input value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Dar es Salaam hotline" /></Field>
            <Field label="Number"><Input value={edit.phone_number ?? ''} onChange={e => setEdit({ ...edit, phone_number: e.target.value })} placeholder="+255 754 000 000" /></Field>
            <Field label="Network"><Pick value={edit.carrier ?? 'other'} onChange={v => setEdit({ ...edit, carrier: (v ?? 'other') as Carrier })}
              options={(Object.keys(CARRIER_LABEL) as Carrier[]).map(c => ({ value: c, label: CARRIER_LABEL[c] }))} /></Field>
            {voice && <Field label="Connected through" hint="The voice platform your number is connected to"><Pick value={edit.provider ?? 'africastalking'} onChange={v => setEdit({ ...edit, provider: (v ?? 'africastalking') as SupportLine['provider'] })}
              options={[{ value: 'africastalking', label: PROVIDER_LABEL.africastalking }, { value: 'sip', label: PROVIDER_LABEL.sip }]} /></Field>}
            {!voice && <Field label="Meta phone number ID" hint="WhatsApp Manager → Phone numbers"><Input value={edit.external_id ?? ''} onChange={e => setEdit({ ...edit, external_id: e.target.value })} /></Field>}
            <Field label="Centre"><Pick value={edit.site_id ?? null} onChange={v => setEdit({ ...edit, site_id: v })} none="Route by caller"
              options={data.centres.filter(c => c.support_enabled).map(c => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Product"><Pick value={edit.product_id ?? null} onChange={v => setEdit({ ...edit, product_id: v })} none="None"
              options={data.products.map(p => ({ value: p.id, label: p.name }))} /></Field>
          </div>
          {voice && (
            <>
              <div style={grid}>
                <Field label="Greeting" hint="Spoken when someone calls"><Input value={edit.greeting ?? ''} onChange={e => setEdit({ ...edit, greeting: e.target.value })} placeholder="Karibu! Thank you for calling…" /></Field>
                <Field label="Or a recorded greeting (URL)" hint="An MP3 or WAV, e.g. a Swahili recording"><Input value={edit.greeting_audio_url ?? ''} onChange={e => setEdit({ ...edit, greeting_audio_url: e.target.value })} placeholder="https://…/greeting.mp3" /></Field>
                <Field label="When the centre is closed"><Pick value={edit.after_hours ?? 'voicemail'} onChange={v => setEdit({ ...edit, after_hours: (v ?? 'voicemail') as SupportLine['after_hours'] })}
                  options={[{ value: 'voicemail', label: 'Take a message' }, { value: 'overflow', label: 'Connect to another open centre' }]} /></Field>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Switch checked={edit.ring_agents ?? true} onCheckedChange={c => setEdit({ ...edit, ring_agents: c })} />
                Ring the agent the call is routed to (uses the phone number on their profile); otherwise take a message
              </label>
              <Field label='Phone menu ("press 1 for…")' hint="Leave empty to connect callers straight away.">
                <MenuBuilder data={data} menu={edit.menu ?? []} onChange={m => setEdit({ ...edit, menu: m })} />
              </Field>
            </>
          )}
          {edit.webhook_url && (
            <Banner variant="info" title={voice ? "Paste this in Africa's Talking" : 'WhatsApp webhook'}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span>{voice
                  ? "In your Africa's Talking account, open Voice → Phone numbers, choose this number and set its callback URL to:"
                  : 'In Meta App Dashboard → WhatsApp → Configuration, the webhook for this number must point to:'}</span>
                <CopyField value={edit.webhook_url} />
                {voice && edit.id && <div><Button type="button" size="sm" variant="ghost" onClick={() => rotate(edit as SupportLine)}>Make a new address</Button></div>}
              </div>
            </Banner>
          )}
        </Editor>
      )}

      <SectionCard title={`Lines (${lines.length})`} padded={false} collapsible={false}
        action={data.scope.can_manage && !edit ? <Button size="sm" onClick={() => setEdit({ kind: 'voice', carrier: 'vodacom', provider: 'africastalking', menu: [], ring_agents: true, after_hours: 'voicemail' })}><Icon name="plus" size={14} /> Add line</Button> : undefined}>
        {!lines.length ? (
          <div style={{ padding: 24, color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>No lines yet. Add each centre's phone number (and WhatsApp number) here.</span>
            <span style={{ fontSize: 12.5 }}>Vodacom, Yas, Airtel and Halotel provide business numbers through a business line or SIP trunk; connect that number to a voice platform such as Africa's Talking, then paste the callback address shown here into it.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Line', 'Number', 'Centre', 'Product', 'Menu', 'Calls (24h)', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{lines.map(l => (
              <tr key={l.id}>
                <td style={{ ...td, fontWeight: 600, minWidth: 170 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={l.kind === 'voice' ? 'phone' : 'chatBubble'} size={13} />{l.name}</span>
                  {l.status === 'inactive' && <> <Badge variant="gray">Off</Badge></>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.phone_number}<div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{CARRIER_LABEL[l.carrier]} · {PROVIDER_LABEL[l.provider]}</div></td>
                <td style={td}>{centreName(l.site_id)}</td>
                <td style={td}>{productName(l.product_id)}</td>
                <td style={{ ...td, fontSize: 12 }}>{l.kind === 'voice' ? (l.menu.length ? l.menu.map(o => `${o.digit}: ${o.label}`).join(' · ') : 'Straight through') : '—'}</td>
                <td style={td}>{l.calls_24h}{l.missed_24h ? <span style={{ color: 'var(--red)' }}> · {l.missed_24h} missed</span> : null}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {data.scope.can_manage && <>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${l.name}`} onClick={() => setEdit(l)}><Icon name="edit" size={14} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${l.name}`} onClick={() => remove(l)}><Icon name="trash" size={14} /></Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>

      <SectionCard title="Recent calls" padded={false} collapsible={false}>
        {!calls.length ? <div style={{ padding: 24, color: 'var(--ink3)' }}>No calls yet.</div> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['When', 'Caller', 'Line', 'Chose', 'Centre', 'Agent', 'Result', 'Ticket'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{calls.map(c => (
              <tr key={c.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{new Date(c.started_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.caller_number ?? '—'}</td>
                <td style={td}>{c.line_name ?? '—'}</td>
                <td style={td}>{c.product_name ?? (c.digits ? `Key ${c.digits}` : '—')}</td>
                <td style={td}>{c.site_name ?? '—'}</td>
                <td style={td}>{c.agent_name ?? '—'}</td>
                <td style={td}>
                  <Badge variant={CALL_STATUS[c.status]?.variant ?? 'gray'}>{CALL_STATUS[c.status]?.label ?? c.status}</Badge>
                  {c.duration_seconds ? <span style={{ fontSize: 12, color: 'var(--ink3)' }}> {Math.round(c.duration_seconds)} s</span> : null}
                  {c.recording_url && <div><a href={c.recording_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Recording</a></div>}
                </td>
                <td style={td}>{c.ticket_ref ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}

export function SupportNetwork() {
  usePageSEO('Support Network', 'Run support across centres, zones and product lines.');
  const { data, error, reload } = useSupportNetwork();
  const [tab, setTab] = useState<Tab>(() => {
    const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
    return (TABS.some(t => t.id === h) ? h : 'control') as Tab;
  });
  const choose = (t: Tab) => { setTab(t); try { history.replaceState(null, '', `#${t}`); } catch { /* cosmetic */ } };
  // Follow the address when only its #tab changes (a link, or back/forward).
  useEffect(() => {
    const onHash = () => { const h = location.hash.slice(1); if (TABS.some(t => t.id === h)) setTab(h as Tab); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader crumbs={['Bliss', 'Network']} titlePlain="Support" titleEm="network"
        subtitle="Your centres, zones and product lines — where tickets go, who works them, and how each centre is doing right now." />
      <Tabs value={tab} onValueChange={v => choose(v as Tab)} variant="segmented">
        <TabsList wrap>{TABS.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      {error && <Banner variant="error">{error}</Banner>}
      {!data ? <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : (
        <>
          {!data.scope.can_manage && tab !== 'control' && <Banner variant="info">You can see the centres you belong to. A workspace admin or zone manager makes changes here.</Banner>}
          {tab === 'control' && <ControlRoom data={data} />}
          {tab === 'zones' && <Zones data={data} reload={reload} />}
          {tab === 'centres' && <Centres data={data} reload={reload} />}
          {tab === 'products' && <Products data={data} reload={reload} />}
          {tab === 'queues' && <Queues data={data} reload={reload} />}
          {tab === 'agents' && <Agents data={data} reload={reload} />}
          {tab === 'lines' && <Lines data={data} />}
        </>
      )}
    </div>
  );
}
