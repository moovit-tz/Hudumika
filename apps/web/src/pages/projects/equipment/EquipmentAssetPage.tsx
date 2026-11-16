import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader.js';
import { SectionCard } from '../../../components/SectionCard.js';
import { PersonAvatar } from '../../../components/PersonAvatar.js';
import { Icon } from '../../../components/Icon.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { Textarea } from '../../../components/ui/textarea.js';
import { Badge } from '../../../components/ui/badge.js';
import { Switch } from '../../../components/ui/switch.js';
import { SectionLoading } from '../../../components/ui/spinner.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../../components/ui/DataTable.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../../components/ui/date-picker.js';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu.js';
import { apiFetch } from '../../../lib/api.js';
import { showAlert } from '../../../lib/alert.js';
import { usePageSEO } from '../../../hooks/usePageSEO.js';
import { type Asset, type Booking, type Powers, AvailabilityBadge, BookingBadge, TYPE_LABEL, OWNERSHIP_LABEL, METER_LABEL, CONDITIONS, titleCase, fmtDate, fmtNum, errText, meterText } from './equipmentShared.js';
import { BookingActions } from './BookingActions.js';
import { BookingDialog } from './BookingDialog.js';

interface Detail {
  asset: Asset; allocations: Booking[]; events: any[]; readings: any[]; inspections: any[]; certificates: any[];
  maintenance: any[]; documents: any[]; powers: Powers; can_handle: boolean;
}
type Form = 'inspection' | 'reading' | 'maintenance' | 'certificate' | 'dispose' | 'book' | null;

const EVENT_LABEL: Record<string, string> = {
  REGISTERED: 'Registered', IMPORTED: 'Imported', UPDATED: 'Details changed', LOCATION_CHANGED: 'Moved', REQUESTED: 'Requested',
  RESERVED: 'Reserved', DECLINED: 'Request declined', CANCELLED: 'Booking cancelled', ISSUED: 'Issued', RETURNED: 'Received back',
  REASSIGNED: 'Moved to another project', INSPECTED: 'Inspected', CERTIFICATE_ADDED: 'Certificate added',
  MAINTENANCE_SCHEDULED: 'Maintenance scheduled', MAINTENANCE_STARTED: 'Maintenance started', MAINTENANCE_COMPLETED: 'Maintenance completed',
  MAINTENANCE_CANCELLED: 'Maintenance cancelled', DISPOSED: 'Disposed',
};

export function EquipmentAssetPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Form>(null);
  const load = useCallback(() => {
    apiFetch(`/v1/project-equipment/assets/${assetId}`).then((r: Detail) => { setD(r); setError(''); }).catch(e => setError(errText(e)));
  }, [assetId]);
  useEffect(() => { load(); }, [load]);
  usePageSEO(d ? `${d.asset.name} · Equipment` : 'Equipment', 'Asset details, bookings, inspections and history.');

  if (error) return (
    <div className="flex flex-col gap-4">
      <PageHeader crumbs={[{ label: 'Projects', to: '/projects' }, { label: 'Equipment', to: '/projects/equipment' }]} titlePlain="Asset" titleEm="unavailable" />
      <SectionCard collapsible={false}><p className="text-sm">{error}</p><Button className="mt-3" variant="outline" onClick={() => navigate('/projects/equipment')}>Back to the register</Button></SectionCard>
    </div>
  );
  if (!d) return <SectionLoading />;
  const { asset: a, powers } = d;
  const disposed = a.status === 'decommissioned';
  const handle = d.can_handle && !disposed;
  const bookings = d.allocations.map(b => ({ ...b, can_handle: d.can_handle }));
  const openWork = d.maintenance.filter(m => ['SCHEDULED', 'IN_PROGRESS'].includes(m.status));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader crumbs={[{ label: 'Projects', to: '/projects' }, { label: 'Equipment', to: '/projects/equipment' }, a.code]} title={a.name}
        subtitle={`${TYPE_LABEL[a.resource_type]}${a.make_model ? ` · ${[a.manufacturer, a.make_model].filter(Boolean).join(' ')}` : ''}`}
        actions={disposed ? <AvailabilityBadge asset={a} /> : (
          <div className="flex flex-wrap items-center gap-2">
            <AvailabilityBadge asset={a} />
            <Button onClick={() => setForm('book')}><Icon name="calendar" size={14} /> Book for a project</Button>
            {(handle || powers.manage) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More asset actions"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {handle && <DropdownMenuItem onClick={() => setForm('inspection')}><Icon name="clipboardList" size={14} /> Record inspection</DropdownMenuItem>}
                  {handle && a.meter_unit && <DropdownMenuItem onClick={() => setForm('reading')}><Icon name="activity" size={14} /> Log meter reading</DropdownMenuItem>}
                  {handle && <DropdownMenuItem onClick={() => setForm('maintenance')}><Icon name="tool" size={14} /> Log maintenance or breakdown</DropdownMenuItem>}
                  {powers.manage && <DropdownMenuItem onClick={() => setForm('certificate')}><Icon name="fileText" size={14} /> Add certificate</DropdownMenuItem>}
                  {powers.manage && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate(`/projects/equipment/${a.id}/edit`)}><Icon name="edit" size={14} /> Edit details</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setForm('dispose')}><Icon name="trash" size={14} /> Dispose</DropdownMenuItem></>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )} />

      {(a.eligibility && !a.eligibility.ok) && (
        <SectionCard title="Why it can't be booked" collapsible={false}>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">{a.eligibility.reasons.map(r => <li key={r}>{r}</li>)}</ul>
          {disposed && a.fixed_asset_id && <p className="mt-2 text-sm" style={{ color: 'var(--ink3)' }}>Record the disposal in FinOps fixed assets too; depreciation and book value are kept there.</p>}
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Details" collapsible={false} className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item label="Code">{a.code}</Item>
            <Item label="Serial number">{a.serial_number}</Item>
            {a.registration_number && <Item label="Registration">{a.registration_number}</Item>}
            {a.year_built && <Item label="Year">{a.year_built}</Item>}
            <Item label="Ownership">{OWNERSHIP_LABEL[a.ownership]}{a.vendor_name ? ` from ${a.vendor_name}` : ''}{a.rental_reference ? ` (${a.rental_reference})` : ''}</Item>
            {a.ownership !== 'OWNED' && <Item label="Hire period">{fmtDate(a.rental_start)} – {fmtDate(a.rental_end)}</Item>}
            <Item label="Where it is">{a.issued_to ? <>{a.issued_to.project_name}{a.current_location && a.current_location !== a.issued_to.project_name ? `, ${a.current_location}` : ''}</> : a.current_location}</Item>
            <Item label="Home yard">{a.home_site}</Item>
            <Item label="Custodian">{a.custodian_id ? <span className="inline-flex items-center gap-2"><PersonAvatar userId={a.custodian_id} name={a.custodian_name ?? ''} src={a.custodian_avatar_url} size={22} />{a.custodian_name}</span> : null}</Item>
            <Item label="Condition">{titleCase(a.condition)}</Item>
            <Item label="Capacity">{a.capacity_value != null ? `${fmtNum(a.capacity_value)} ${a.capacity_unit ?? ''}` : a.capacity_rating}</Item>
            <Item label="Meter">{a.meter_unit ? <>{meterText(a)}{a.meter_read_at && <span style={{ color: 'var(--ink3)' }}> · read {fmtDate(a.meter_read_at)}</span>}</> : null}</Item>
            <Item label="Next inspection">{a.next_inspection_due ? fmtDate(a.next_inspection_due) : null}{a.inspection_interval_days ? <span style={{ color: 'var(--ink3)' }}> · every {a.inspection_interval_days} days</span> : null}</Item>
            <Item label="Next service">{[a.next_service_due && fmtDate(a.next_service_due), a.next_service_meter != null && a.meter_unit && `at ${fmtNum(a.next_service_meter)} ${METER_LABEL[a.meter_unit]}`].filter(Boolean).join(' or ') || null}</Item>
            {powers.seeCost && <Item label="Cost rate">{a.cost_rate ? `${a.currency} ${fmtNum(a.cost_rate)} per ${a.rate_unit.toLowerCase()}` : null}</Item>}
            {powers.seeCost && <Item label="Charge-out rate">{a.billing_rate ? `${a.currency} ${fmtNum(a.billing_rate)} per ${a.rate_unit.toLowerCase()}` : null}</Item>}
            {a.fixed_asset_id && <Item label="Book value"><Link to="/finops/fixed-assets" className="underline">In FinOps fixed assets</Link></Item>}
            {a.vehicle_id && <Item label="Tracking"><Link to="/tracking" className="underline">Live position in Tracking</Link></Item>}
            {a.notes && <div className="sm:col-span-2"><Item label="Notes">{a.notes}</Item></div>}
          </dl>
        </SectionCard>
        <Documents asset={a} docs={d.documents} canUpload={handle} onDone={load} />
      </div>

      <SectionCard title="Bookings" padded={false} collapsible={false}>
        <DataTable rows={bookings} empty={!bookings.length} emptyIcon="calendar" emptyTitle="Never booked" emptyMessage="Book it for a project to see it here."
          columns={[
            { key: 'project', header: 'Project', render: b => b.project_name ? <Link to={`/projects/${b.project_id}`} className="line-clamp-2 max-w-[18rem] font-medium" title={b.project_name} onClick={e => e.stopPropagation()}>{b.project_name}</Link> : '—' },
            { key: 'dates', header: 'Dates', render: b => <span className="whitespace-nowrap tabular-nums">{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</span> },
            { key: 'handover', header: 'Handover', hideAt: 'md', render: b => b.handed_to_name ?? (b.requested_by_name ? `Requested by ${b.requested_by_name}` : '—') },
            { key: 'status', header: 'Status', render: b => <BookingBadge booking={b} /> },
            { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', render: b => <BookingActions booking={b} onDone={load} /> },
          ] as TableColumn<Booking>[]} />
      </SectionCard>

      {(openWork.length > 0 || d.maintenance.length > 0) && <Maintenance rows={d.maintenance} handle={handle} seeCost={powers.seeCost} currency={a.currency} meterUnit={a.meter_unit} onDone={load} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Inspections" padded={false} collapsible={false}>
          <DataTable rows={d.inspections} empty={!d.inspections.length} emptyIcon="clipboardList" emptyTitle="No inspections yet" compact columns={[
            { key: 'when', header: 'Date', render: (i: any) => fmtDate(i.inspected_at) },
            { key: 'type', header: 'Type', hideAt: 'sm', render: (i: any) => titleCase(i.inspection_type) },
            { key: 'result', header: 'Result', render: (i: any) => <span className="flex flex-col items-start gap-1"><Badge variant={i.result === 'PASS' ? 'success' : i.result === 'FAIL' ? 'error' : 'warning'}>{titleCase(i.result)}</Badge>{i.defects && <span className="text-xs">{i.defects}</span>}</span> },
            { key: 'by', header: 'By', hideAt: 'md', render: (i: any) => i.inspected_by_name ?? '—' },
          ]} />
        </SectionCard>
        <SectionCard title="Certificates" padded={false} collapsible={false}>
          <DataTable rows={d.certificates} empty={!d.certificates.length} emptyIcon="fileText" emptyTitle="No certificates" compact columns={[
            { key: 'type', header: 'Certificate', render: (c: any) => <span className="flex flex-col"><span className="font-medium">{c.certificate_type}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>{[c.reference, c.issuer].filter(Boolean).join(' · ')}</span></span> },
            { key: 'exp', header: 'Expires', render: (c: any) => c.expires_on ? <span style={{ color: c.expires_on < new Date().toISOString().slice(0, 10) ? 'var(--red)' : undefined }}>{fmtDate(c.expires_on)}</span> : 'No expiry' },
            { key: 'blocks', header: 'Required', hideAt: 'sm', render: (c: any) => c.blocks_assignment ? 'Required to book' : 'For reference' },
          ]} />
        </SectionCard>
      </div>

      <SectionCard title="History" collapsible={false}>
        <ol className="flex flex-col gap-3">
          {d.events.map(e => (
            <li key={e.id} className="flex items-start gap-3 text-sm">
              {e.actor_id ? <PersonAvatar userId={e.actor_id} name={e.actor_name ?? ''} src={e.actor_avatar_url} size={26} /> : <span className="inline-block size-6.5" />}
              <span className="flex min-w-0 flex-col">
                <span><strong>{EVENT_LABEL[e.event_type] ?? titleCase(e.event_type)}</strong>{e.project_name ? ` · ${e.project_name}` : ''}{(e.from_location || e.to_location) && e.from_location !== e.to_location ? ` · ${e.from_location ?? '—'} → ${e.to_location ?? '—'}` : ''}</span>
                <span className="text-xs" style={{ color: 'var(--ink3)' }}>{e.actor_name ?? 'System'}{e.impersonated_by ? ' (Hudumika support)' : ''} · {new Date(e.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{eventDetail(e)}</span>
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>

      {form === 'book' && <BookingDialog assetId={a.id} onClose={() => setForm(null)} onBooked={load} />}
      {form && form !== 'book' && <AssetForm kind={form} asset={a} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
    </div>
  );
}

function eventDetail(e: any) {
  const x = e.details ?? {};
  if (e.event_type === 'INSPECTED') return ` · ${titleCase(x.result)}`;
  if (e.event_type === 'RETURNED' || e.event_type === 'ISSUED') return [x.condition && ` · ${titleCase(x.condition)}`, x.meter != null && ` · meter ${fmtNum(x.meter)}`, x.late && ' · returned late'].filter(Boolean).join('');
  if (e.event_type === 'UPDATED' && x.changes) return ` · ${Object.keys(x.changes).map(k => k.replace(/_/g, ' ')).join(', ')}`;
  if (x.reason) return ` · ${x.reason}`;
  return '';
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5"><dt className="text-xs" style={{ color: 'var(--ink3)' }}>{label}</dt><dd className="wrap-break-word">{children || <span style={{ color: 'var(--ink3)' }}>—</span>}</dd></div>;
}

let cachedDrive: string | null = null;
async function driveId() {
  if (cachedDrive) return cachedDrive;
  const drives = await apiFetch('/v1/drives');
  const list = Array.isArray(drives) ? drives : drives.data ?? [];
  if (!list.length) throw new Error('No drive is available to store documents.');
  return (cachedDrive = list[0].id as string);
}

/** Drive decides access and logs the open; a short-lived signed URL opens it. */
async function openFile(id: string) {
  try { const { url } = await apiFetch(`/v1/files/${id}/signed-url`); window.open(url, '_blank', 'noopener'); }
  catch (e) { showAlert(errText(e), { variant: 'error' }); }
}

function Documents({ asset, docs, canUpload, onDone }: { asset: Asset; docs: any[]; canUpload: boolean; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const drive = await driveId();
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append('file', file);
        await apiFetch(`/v1/files/upload?drive_id=${drive}&entity_type=project_resource&entity_id=${asset.id}`, { method: 'POST', body: form });
      }
      onDone();
    } catch (e) { showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <SectionCard title="Documents & photos" collapsible={false}
      action={canUpload ? <><input ref={input} type="file" multiple hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={e => upload(e.target.files)} />
        <Button size="sm" variant="outline" loading={busy} onClick={() => input.current?.click()}><Icon name="upload" size={14} /> Upload</Button></> : undefined}>
      {docs.length ? (
        <ul className="flex flex-col gap-2 text-sm">{docs.map(f => (
          <li key={f.id} className="flex items-center justify-between gap-2">
            <button type="button" className="min-w-0 truncate text-left underline" title={f.name} onClick={() => openFile(f.id)}>{f.name}</button>
            <span className="shrink-0 text-xs" style={{ color: 'var(--ink3)' }}>{fmtDate(f.created_at)}</span>
          </li>))}</ul>
      ) : <p className="text-sm" style={{ color: 'var(--ink3)' }}>Manuals, hire agreements, photos and certificates, stored in Drive.</p>}
    </SectionCard>
  );
}

function Maintenance({ rows, handle, seeCost, currency, meterUnit, onDone }: { rows: any[]; handle: boolean; seeCost: boolean; currency: string; meterUnit: string | null; onDone: () => void }) {
  const [closing, setClosing] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function start(id: string) {
    setBusy(id);
    try { await apiFetch(`/v1/project-equipment/maintenance/${id}/start`, { method: 'POST', body: '{}' }); onDone(); }
    catch (e) { showAlert(errText(e), { variant: 'error' }); } finally { setBusy(null); }
  }
  return (
    <SectionCard title="Maintenance" padded={false} collapsible={false}>
      <DataTable rows={rows} compact columns={[
        { key: 'what', header: 'Work', render: (m: any) => <span className="flex flex-col"><span className="font-medium">{m.description}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>{titleCase(m.kind)}{m.scheduled_for ? ` · planned ${fmtDate(m.scheduled_for)}` : ''}</span></span> },
        { key: 'status', header: 'Status', render: (m: any) => <Badge variant={m.status === 'IN_PROGRESS' ? 'warning' : m.status === 'COMPLETED' ? 'success' : 'gray'}>{titleCase(m.status)}</Badge> },
        { key: 'down', header: 'Downtime', align: 'right', hideAt: 'sm', render: (m: any) => m.downtime_hours != null ? <span className="tabular-nums">{fmtNum(m.downtime_hours)} h</span> : '—' },
        ...(seeCost ? [{ key: 'cost', header: 'Cost', align: 'right' as const, hideAt: 'md' as const, render: (m: any) => m.cost != null ? <span className="tabular-nums">{currency} {fmtNum(m.cost)}</span> : '—' }] : []),
        { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', render: (m: any) => !handle ? null
          : m.status === 'SCHEDULED' ? <Button size="sm" variant="outline" loading={busy === m.id} onClick={() => start(m.id)}>Start</Button>
            : m.status === 'IN_PROGRESS' ? <Button size="sm" onClick={() => setClosing(m)}>Complete</Button> : null },
      ]} />
      {closing && <CompleteDialog m={closing} seeCost={seeCost} meterUnit={meterUnit} onClose={() => setClosing(null)} onDone={() => { setClosing(null); onDone(); }} />}
    </SectionCard>
  );
}

function CompleteDialog({ m, seeCost, meterUnit, onClose, onDone }: { m: any; seeCost: boolean; meterUnit: string | null; onClose: () => void; onDone: () => void }) {
  const [hours, setHours] = useState('');
  const [cost, setCost] = useState('');
  const [meter, setMeter] = useState('');
  const [condition, setCondition] = useState('GOOD');
  const [busy, setBusy] = useState(false);
  const n = (v: string) => (v.trim() ? Number(v.replace(/,/g, '')) : null);
  async function submit() {
    setBusy(true);
    try {
      await apiFetch(`/v1/project-equipment/maintenance/${m.id}/complete`, { method: 'POST', body: JSON.stringify({ downtime_hours: n(hours), cost: seeCost ? n(cost) : undefined, meter_at_service: n(meter), condition }) });
      onDone();
    } catch (e) { showAlert(errText(e), { variant: 'error' }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Complete maintenance</DialogTitle><DialogDescription>{m.description}</DialogDescription></DialogHeader>
        <DialogBody><form id="eq-complete" className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); submit(); }}>
          <F label="Downtime (hours)" hint="Leave blank to use the time since it started."><Input inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} /></F>
          {seeCost && <F label="Cost"><Input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} /></F>}
          {meterUnit && <F label={`Meter (${METER_LABEL[meterUnit]})`}><Input inputMode="decimal" value={meter} onChange={e => setMeter(e.target.value)} /></F>}
          <F label="Condition after"><Select value={condition} onValueChange={setCondition}><SelectTrigger aria-label="Condition after"><SelectValue /></SelectTrigger>
            <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent></Select></F>
        </form></DialogBody>
        <DialogFooter><Button variant="outline" onClick={onClose}>Back</Button><Button type="submit" form="eq-complete" loading={busy}>Complete</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{label}</span>{children}{hint && <span className="text-xs" style={{ color: 'var(--ink3)' }}>{hint}</span>}</label>;
}

/** The small single-purpose records: inspection, meter reading, maintenance, certificate, disposal. */
function AssetForm({ kind, asset, onClose, onDone }: { kind: Exclude<Form, null | 'book'>; asset: Asset; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<Record<string, any>>({ inspection_type: 'PERIODIC', result: 'PASS', kind: 'SERVICE', blocks_assignment: true, start_now: false });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: any) => setV(p => ({ ...p, [k]: x?.target ? x.target.value : x }));
  const date = (k: string) => <DatePicker date={v[k] ? parseDateOnly(v[k]) ?? null : null} onChange={d => setV(p => ({ ...p, [k]: d ? toDateOnlyString(d) : null }))} />;
  const n = (s: unknown) => (s == null || String(s).trim() === '' ? null : Number(String(s).replace(/,/g, '')));
  const spec = {
    inspection: { title: 'Record inspection', path: 'inspections', body: () => ({ inspection_type: v.inspection_type, result: v.result, defects: v.defects || null, next_due: v.next_due || null }), ok: v.result === 'PASS' || !!v.defects?.trim() },
    reading: { title: 'Log meter reading', path: 'readings', body: () => ({ reading: n(v.reading) }), ok: n(v.reading) != null },
    maintenance: { title: 'Log maintenance or breakdown', path: 'maintenance', body: () => ({ kind: v.kind, description: v.description, scheduled_for: v.scheduled_for || null, start_now: !!v.start_now }), ok: (v.description ?? '').trim().length >= 3 },
    certificate: { title: 'Add certificate', path: 'certificates', body: () => ({ certificate_type: v.certificate_type, reference: v.reference || null, issuer: v.issuer || null, issued_on: v.issued_on || null, expires_on: v.expires_on || null, blocks_assignment: !!v.blocks_assignment }), ok: (v.certificate_type ?? '').trim().length >= 2 },
    dispose: { title: `Dispose of ${asset.name}`, path: 'dispose', body: () => ({ reason: v.reason }), ok: (v.reason ?? '').trim().length >= 5 },
  }[kind];
  async function submit() {
    setBusy(true);
    try { await apiFetch(`/v1/project-equipment/assets/${asset.id}/${spec.path}`, { method: 'POST', body: JSON.stringify(spec.body()) }); onDone(); }
    catch (e) { showAlert(errText(e), { variant: 'error' }); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{spec.title}</DialogTitle><DialogDescription>{asset.code} · {asset.name}</DialogDescription></DialogHeader>
        <DialogBody><form id="eq-form" className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); submit(); }}>
          {kind === 'inspection' && <>
            <F label="Type"><Select value={v.inspection_type} onValueChange={set('inspection_type')}><SelectTrigger aria-label="Inspection type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="PRE_USE">Pre-use check</SelectItem><SelectItem value="PERIODIC">Periodic</SelectItem><SelectItem value="STATUTORY">Statutory</SelectItem></SelectContent></Select></F>
            <F label="Result"><Select value={v.result} onValueChange={set('result')}><SelectTrigger aria-label="Result"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="PASS">Pass</SelectItem><SelectItem value="PASS_WITH_DEFECTS">Pass with defects</SelectItem><SelectItem value="FAIL">Fail: take out of use</SelectItem></SelectContent></Select></F>
            {v.result !== 'PASS' && <F label="Defects found"><Textarea rows={3} value={v.defects ?? ''} onChange={set('defects')} /></F>}
            <F label="Next inspection due" hint={asset.inspection_interval_days ? `Leave blank for ${asset.inspection_interval_days} days from today.` : undefined}>{date('next_due')}</F>
          </>}
          {kind === 'reading' && <F label={`Reading (${METER_LABEL[asset.meter_unit ?? ''] ?? ''})`} hint={`Last: ${meterText(asset)}`}><Input inputMode="decimal" value={v.reading ?? ''} onChange={set('reading')} autoFocus /></F>}
          {kind === 'maintenance' && <>
            <F label="Kind"><Select value={v.kind} onValueChange={set('kind')}><SelectTrigger aria-label="Kind"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="SERVICE">Scheduled service</SelectItem><SelectItem value="REPAIR">Repair</SelectItem><SelectItem value="BREAKDOWN">Breakdown</SelectItem></SelectContent></Select></F>
            <F label="What needs doing"><Textarea rows={3} value={v.description ?? ''} onChange={set('description')} /></F>
            <F label="Planned for">{date('scheduled_for')}</F>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Start now: takes it out of use</span><Switch checked={!!v.start_now} onCheckedChange={set('start_now')} aria-label="Start now" /></label>
          </>}
          {kind === 'certificate' && <>
            <F label="Certificate"><Input value={v.certificate_type ?? ''} onChange={set('certificate_type')} placeholder="e.g. Load test (LOLER), Road licence, Insurance" /></F>
            <div className="grid gap-3 sm:grid-cols-2"><F label="Reference"><Input value={v.reference ?? ''} onChange={set('reference')} /></F><F label="Issued by"><Input value={v.issuer ?? ''} onChange={set('issuer')} /></F></div>
            <div className="grid gap-3 sm:grid-cols-2"><F label="Issued">{date('issued_on')}</F><F label="Expires">{date('expires_on')}</F></div>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Required to book: block bookings once it expires</span><Switch checked={!!v.blocks_assignment} onCheckedChange={set('blocks_assignment')} aria-label="Required to book" /></label>
          </>}
          {kind === 'dispose' && <>
            <p className="text-sm">It stays in the register's history but can't be booked or edited again.{asset.fixed_asset_id ? ' Record the disposal in FinOps fixed assets for the accounts.' : ''}</p>
            <F label="Reason"><Textarea rows={3} value={v.reason ?? ''} onChange={set('reason')} placeholder="Sold, scrapped, written off, returned to hirer…" /></F>
          </>}
        </form></DialogBody>
        <DialogFooter><Button variant="outline" onClick={onClose}>Back</Button>
          <Button type="submit" form="eq-form" loading={busy} disabled={!spec.ok} variant={kind === 'dispose' ? 'destructive' : 'default'}>{kind === 'dispose' ? 'Dispose' : 'Save'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
