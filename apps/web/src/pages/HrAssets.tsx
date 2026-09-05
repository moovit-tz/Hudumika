import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SkeletonPage } from '../components/ui/skeleton.js';

/**
 * Company assets and who is holding them.
 *
 * An asset is only out if it was assigned and has not been returned. Once a
 * return is recorded it is available again, while still naming whoever last
 * had it — losing that would make "who had the laptop before it came back
 * broken" unanswerable.
 *
 * Handing over an asset that is still out is refused rather than silently
 * reassigned, since the previous holder would otherwise stop being recorded
 * as having something they are still physically holding.
 */

interface Asset {
  id: string; name: string; type: string; serial_number: string;
  assigned_to: string | null; assigned_date: string | null; returned_date: string | null;
  condition_notes: string | null; holder_name: string | null; out: boolean;
}
interface EmploymentOption { employment_id: string; first_name: string; last_name: string }

const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 12,
  background: 'var(--card-bg, var(--white))', overflow: 'hidden',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink3)',
};

const TYPE_ICON: Record<string, string> = {
  LAPTOP: 'monitor', PHONE: 'smartphone', VEHICLE: 'truck', TOOL: 'briefcase', OTHER: 'package',
};

export function HrAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [people, setPeople] = useState<EmploymentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, e] = await Promise.all([apiFetch('/v1/hr/assets'), apiFetch('/v1/hr/employments')]);
      setAssets(Array.isArray(a) ? a : []);
      setPeople(Array.isArray(e) ? e : []);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load assets.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(what: string, fn: () => Promise<any>) {
    setBusy(what); setError('');
    try { await fn(); await load(); setAdding(false); setActing(null); }
    catch (err: any) { setError(err?.message ?? 'That did not work.'); }
    finally { setBusy(''); }
  }

  const out = useMemo(() => assets.filter(a => a.out).length, [assets]);
  // A real by-type breakdown (laptops / phones / vehicles …) computed from the
  // loaded assets — no invented inventory.
  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) { const t = (a.type || 'OTHER').toUpperCase(); m[t] = (m[t] || 0) + 1; }
    return Object.entries(m).sort((x, y) => y[1] - x[1]);
  }, [assets]);
  const prettyType = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

  if (loading) return <SkeletonPage variant="table" />;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['NexusHR', 'Records']}
        titlePlain="Company"
        titleEm="assets"
        subtitle="Company equipment and who is currently holding it."
        actions={
          <Button type="button" variant={adding ? 'outline' : 'default'} size="sm" onClick={() => setAdding(a => !a)}>
            <Icon name={adding ? 'x' : 'plus'} size={13} /> {adding ? 'Cancel' : 'Add Asset'}
          </Button>
        }
      />

      {error && (
        <div style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--red-l)',
                      color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      <div className="mc-row">
        {([
          ['Assets', assets.length, 'var(--ink)'],
          ['Out with someone', out, 'var(--ink)'],
          ['Available', assets.length - out, 'var(--ink)'],
        ] as const).map(([l, v, colour]) => (
          <div key={l} className="mc-card">
            <div style={label}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colour, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>

      {byType.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 16px' }}>
          {byType.map(([t, n]) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5, background: 'var(--white)' }}>
              <Icon name={(TYPE_ICON[t] || 'package') as any} size={13} color="var(--ink3)" />
              <span style={{ color: 'var(--ink2)' }}>{prettyType(t)}</span>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{n}</span>
            </span>
          ))}
        </div>
      )}

      {adding && <AssetPane busy={busy}
        onCreate={d => act('asset', () => apiFetch('/v1/hr/assets', { method: 'POST', body: JSON.stringify(d) }))} />}

      {assets.length === 0 ? (
        <div style={{ ...card, padding: 34, textAlign: 'center' }}>
          <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="package" size={20} /></FeaturedIcon>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 10 }}>No assets recorded.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assets.map(a => (
            <div key={a.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', flexWrap: 'wrap' }}>
                <FeaturedIcon variant={a.out ? 'warning' : 'gray'} size="sm" shape="square">
                  <Icon name={(TYPE_ICON[a.type] ?? 'package') as any} size={13} />
                </FeaturedIcon>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                    {a.type.replace(/_/g, ' ').toLowerCase()} · serial {a.serial_number}
                  </div>
                </div>

                <div style={{ minWidth: 190, fontSize: 12 }}>
                  {a.out ? (
                    <>
                      <div style={{ color: 'var(--ink)' }}>with {a.holder_name ?? 'someone no longer on file'}</div>
                      <div style={{ color: 'var(--ink3)', fontSize: 11.5 }}>since {String(a.assigned_date).slice(0, 10)}</div>
                    </>
                  ) : a.holder_name ? (
                    // Available, but the last holder is still worth naming.
                    <div style={{ color: 'var(--ink3)' }}>
                      returned {String(a.returned_date).slice(0, 10)} by {a.holder_name}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--ink3)' }}>never assigned</div>
                  )}
                </div>

                <Badge variant={a.out ? 'warning' : 'success'}>{a.out ? 'out' : 'available'}</Badge>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setActing(acting === a.id ? null : a.id)}>
                  {acting === a.id ? 'Cancel' : a.out ? 'Record return' : 'Hand over'}
                </Button>
              </div>

              {a.condition_notes && (
                <div style={{ padding: '0 15px 11px 15px', fontSize: 11.5, color: 'var(--ink3)' }}>{a.condition_notes}</div>
              )}

              {acting === a.id && (
                <AssignPane asset={a} people={people} busy={busy === 'assign-' + a.id}
                  onSubmit={(employmentId, date) => act('assign-' + a.id, () =>
                    apiFetch(`/v1/hr/assets/${a.id}/assignment`, {
                      method: 'PATCH', body: JSON.stringify({ employment_id: employmentId, date }),
                    }))} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetPane({ busy, onCreate }: { busy: string; onCreate: (d: any) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('LAPTOP');
  const [serial, setSerial] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ ...label, color: 'var(--ink)', marginBottom: 12 }}>New asset</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>What it is</div>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dell Latitude 5440" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Type</div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['LAPTOP', 'PHONE', 'VEHICLE', 'TOOL', 'OTHER'].map(t => (
                <SelectItem key={t} value={t}>{t.toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          {/* Required: an asset with no serial cannot be told apart from
              another of the same model when one comes back damaged. */}
          <div style={{ ...label, marginBottom: 4 }}>Serial number</div>
          <Input value={serial} onChange={e => setSerial(e.target.value)} placeholder="Its unique identifier" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ ...label, marginBottom: 4 }}>Condition <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any marks or faults it already has" />
        </div>
      </div>
      <Button type="button" style={{ marginTop: 12 }} disabled={!name.trim() || !serial.trim() || !!busy}
        onClick={() => onCreate({ name: name.trim(), type, serial_number: serial.trim(), condition_notes: notes || null })}>
        {busy === 'asset' ? 'Saving…' : 'Add asset'}
      </Button>
    </div>
  );
}

function AssignPane({ asset, people, busy, onSubmit }: {
  asset: Asset; people: EmploymentOption[]; busy: boolean;
  onSubmit: (employmentId: string | null, date: string) => void;
}) {
  const [who, setWho] = useState('');
  const [when, setWhen] = useState<Date | undefined>(new Date());
  const returning = asset.out;

  return (
    <div style={{ padding: '13px 15px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        {!returning && (
          <div>
            <div style={{ ...label, marginBottom: 4 }}>Hand it to</div>
            <Combobox
              options={people.map(p => ({ value: p.employment_id, label: `${p.first_name} ${p.last_name}` }))}
              value={who} onChange={setWho}
              placeholder={people.length ? 'Choose a person…' : 'Nobody has a contract yet'}
              emptyText="No person found." />
          </div>
        )}
        <div>
          <div style={{ ...label, marginBottom: 4 }}>{returning ? 'Returned on' : 'Handed over on'}</div>
          <DatePicker date={when} onChange={setWhen} />
        </div>
      </div>
      {returning && (
        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 9 }}>
          {asset.holder_name ?? 'The holder'} stays recorded as having had it — the asset simply becomes available again.
        </div>
      )}
      {/* Labelled distinctly from the row's own toggle button: two controls
          reading "Hand over" on the same card is ambiguous to anyone
          navigating by label rather than by position. */}
      <Button type="button" size="sm" style={{ marginTop: 11 }}
        disabled={busy || !when || (!returning && !who)}
        onClick={() => onSubmit(returning ? null : who, toDateOnlyString(when!))}>
        {busy ? 'Saving…' : returning ? 'Confirm return' : 'Confirm handover'}
      </Button>
    </div>
  );
}
