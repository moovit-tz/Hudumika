import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader.js';
import { SectionCard } from '../../../components/SectionCard.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { Textarea } from '../../../components/ui/textarea.js';
import { Combobox } from '../../../components/ui/combobox.js';
import { SectionLoading } from '../../../components/ui/spinner.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../../components/ui/date-picker.js';
import { apiFetch } from '../../../lib/api.js';
import { showAlert } from '../../../lib/alert.js';
import { usePageSEO } from '../../../hooks/usePageSEO.js';
import { type Asset, type Powers, ASSET_TYPES, TYPE_LABEL, CONDITIONS, OWNERSHIP_LABEL, titleCase, errText } from './equipmentShared.js';

/**
 * Register or edit an asset. A dedicated page (not a modal): it is long, and
 * which sections apply depends on the type — a tool has no meter, a vehicle
 * has a registration, hired plant has a supplier and a hire period.
 */

const DEFAULT_METER: Record<string, string> = { heavy_machinery: 'HOURS', vehicle: 'KM', equipment: 'HOURS' };
const NONE = '__none';

export function EquipmentAssetFormPage() {
  const { assetId } = useParams<{ assetId?: string }>();
  const editing = !!assetId;
  usePageSEO(editing ? 'Edit asset' : 'Add asset', 'Register plant, vehicles and tools.');
  const navigate = useNavigate();
  const [v, setV] = useState<Record<string, any> | null>(editing ? null : { resource_type: 'heavy_machinery', ownership: 'OWNED', condition: 'GOOD', meter_unit: 'HOURS', rate_unit: 'DAY', currency: 'TZS' });
  const [powers, setPowers] = useState<Powers>({ manage: false, seeCost: false });
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ value: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/project-equipment/powers').then(setPowers).catch(() => undefined);
    apiFetch('/v1/hr/staff').then((r: any) => setPeople((Array.isArray(r) ? r : r.data ?? []).map((u: any) => ({ value: u.id, label: u.name })))).catch(() => undefined);
    apiFetch('/v1/suppliers').then((r: any) => setSuppliers((Array.isArray(r) ? r : r.data ?? []).map((s: any) => ({ value: s.id, label: s.name })))).catch(() => undefined);
    if (editing) apiFetch(`/v1/project-equipment/assets/${assetId}`).then((r: { asset: Asset }) => setV({ ...r.asset })).catch(e => setErrors(errText(e)));
  }, [assetId, editing]);

  if (!v) return errors ? <SectionCard collapsible={false}><p className="text-sm">{errors}</p></SectionCard> : <SectionLoading />;
  const set = (k: string) => (x: any) => setV(p => ({ ...p!, [k]: x?.target ? x.target.value : x }));
  const date = (k: string) => <DatePicker date={v[k] ? parseDateOnly(v[k]) ?? null : null} onChange={d => setV(p => ({ ...p!, [k]: d ? toDateOnlyString(d) : null }))} />;
  const hired = v.ownership !== 'OWNED';
  const hasMeter = v.resource_type !== 'tool' && v.resource_type !== 'facility';

  async function save() {
    setBusy(true); setErrors(null);
    const n = (x: unknown) => (x == null || String(x).trim() === '' ? null : Number(String(x).replace(/,/g, '')));
    const body: Record<string, any> = {
      resource_type: v!.resource_type, name: v!.name?.trim(), category: v!.category || null, manufacturer: v!.manufacturer || null,
      make_model: v!.make_model || null, serial_number: v!.serial_number || null, registration_number: v!.registration_number || null,
      year_built: n(v!.year_built), ownership: v!.ownership, owner_vendor_id: hired ? v!.owner_vendor_id || null : null,
      rental_reference: hired ? v!.rental_reference || null : null, rental_start: hired ? v!.rental_start || null : null, rental_end: hired ? v!.rental_end || null : null,
      home_site: v!.home_site || null, custodian_id: v!.custodian_id || null, condition: v!.condition,
      capacity_value: n(v!.capacity_value), capacity_unit: v!.capacity_unit || null,
      meter_unit: hasMeter && v!.meter_unit !== NONE ? v!.meter_unit || null : null,
      inspection_interval_days: n(v!.inspection_interval_days), next_inspection_due: v!.next_inspection_due || null,
      service_interval_days: n(v!.service_interval_days), service_interval_meter: hasMeter ? n(v!.service_interval_meter) : null,
      next_service_due: v!.next_service_due || null, notes: v!.notes || null,
    };
    if (!editing) { body.code = v!.code || null; if (body.meter_unit) body.meter_reading = n(v!.meter_reading); body.current_location = v!.home_site || null; }
    if (powers.seeCost) { body.cost_rate = n(v!.cost_rate) ?? 0; body.billing_rate = n(v!.billing_rate) ?? 0; body.rate_unit = v!.rate_unit; body.currency = v!.currency; }
    try {
      const saved = await apiFetch(editing ? `/v1/project-equipment/assets/${assetId}` : '/v1/project-equipment/assets', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      navigate(`/projects/equipment/${saved.id}`, { replace: editing });
    } catch (e) { setErrors(errText(e)); showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader variant="create" crumbs={[{ label: 'Projects', to: '/projects' }, { label: 'Equipment', to: '/projects/equipment' }, editing ? v.code : 'New']}
        titlePlain={editing ? 'Edit' : 'Add'} titleEm={editing ? v.name : 'asset'} backTo={editing ? `/projects/equipment/${assetId}` : '/projects/equipment'} backLabel="Back" />
      <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); save(); }}>
        <SectionCard title="Identity" collapsible={false}>
          <Grid>
            <F label="Type"><Select value={v.resource_type} onValueChange={t => setV(p => ({ ...p!, resource_type: t, meter_unit: p!.meter_unit && p!.meter_unit !== NONE ? p!.meter_unit : DEFAULT_METER[t] ?? NONE }))}>
              <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger><SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent></Select></F>
            <F label="Name" required><Input value={v.name ?? ''} onChange={set('name')} placeholder="e.g. Excavator 20t" required maxLength={200} /></F>
            <F label="Asset code" hint={editing ? 'Codes are fixed once registered.' : 'Leave blank to generate one.'}><Input value={v.code ?? ''} onChange={set('code')} disabled={editing} maxLength={50} /></F>
            <F label="Category"><Input value={v.category ?? ''} onChange={set('category')} placeholder="e.g. Earthmoving, Lifting, Survey" /></F>
            <F label="Manufacturer"><Input value={v.manufacturer ?? ''} onChange={set('manufacturer')} /></F>
            <F label="Model"><Input value={v.make_model ?? ''} onChange={set('make_model')} /></F>
            <F label="Serial number"><Input value={v.serial_number ?? ''} onChange={set('serial_number')} /></F>
            {(v.resource_type === 'vehicle' || v.resource_type === 'heavy_machinery') && <F label="Registration / plate"><Input value={v.registration_number ?? ''} onChange={set('registration_number')} /></F>}
            <F label="Year"><Input inputMode="numeric" value={v.year_built ?? ''} onChange={set('year_built')} /></F>
          </Grid>
        </SectionCard>

        <SectionCard title="Ownership & custody" collapsible={false}>
          <Grid>
            <F label="Ownership"><Select value={v.ownership} onValueChange={set('ownership')}><SelectTrigger aria-label="Ownership"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(OWNERSHIP_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></F>
            {hired && <F label="Hired from"><Combobox options={suppliers} value={v.owner_vendor_id ?? ''} onChange={set('owner_vendor_id')} placeholder="Choose a supplier" aria-label="Hired from" /></F>}
            {hired && <F label="Hire agreement reference"><Input value={v.rental_reference ?? ''} onChange={set('rental_reference')} /></F>}
            {hired && <F label="Hire starts">{date('rental_start')}</F>}
            {hired && <F label="Off-hire date" hint="Bookings past this date are refused.">{date('rental_end')}</F>}
            <F label="Home yard / site"><Input value={v.home_site ?? ''} onChange={set('home_site')} placeholder="Where it's kept when not on a project" /></F>
            <F label="Custodian" hint="Can reserve, issue, receive and inspect this asset."><Combobox options={people} value={v.custodian_id ?? ''} onChange={set('custodian_id')} placeholder="Who looks after it" aria-label="Custodian" /></F>
            <F label="Condition"><Select value={v.condition} onValueChange={set('condition')}><SelectTrigger aria-label="Condition"><SelectValue /></SelectTrigger>
              <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent></Select></F>
          </Grid>
        </SectionCard>

        <SectionCard title="Capacity, meter & schedules" collapsible={false}>
          <Grid>
            <F label="Capacity"><div className="flex gap-2"><Input className="min-w-0 flex-1" inputMode="decimal" value={v.capacity_value ?? ''} onChange={set('capacity_value')} aria-label="Capacity value" />
              <Input className="w-28" value={v.capacity_unit ?? ''} onChange={set('capacity_unit')} placeholder="t, m³, kVA" aria-label="Capacity unit" /></div></F>
            {hasMeter && <F label="Meter"><Select value={v.meter_unit ?? NONE} onValueChange={set('meter_unit')}><SelectTrigger aria-label="Meter"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>No meter</SelectItem><SelectItem value="HOURS">Hour meter</SelectItem><SelectItem value="KM">Odometer (km)</SelectItem><SelectItem value="MILES">Odometer (miles)</SelectItem><SelectItem value="CYCLES">Cycle counter</SelectItem></SelectContent></Select></F>}
            {hasMeter && !editing && v.meter_unit && v.meter_unit !== NONE && <F label="Current reading"><Input inputMode="decimal" value={v.meter_reading ?? ''} onChange={set('meter_reading')} /></F>}
            <F label="Inspect every (days)"><Input inputMode="numeric" value={v.inspection_interval_days ?? ''} onChange={set('inspection_interval_days')} /></F>
            <F label="Next inspection due">{date('next_inspection_due')}</F>
            <F label="Service every (days)"><Input inputMode="numeric" value={v.service_interval_days ?? ''} onChange={set('service_interval_days')} /></F>
            {hasMeter && v.meter_unit && v.meter_unit !== NONE && <F label={`…or every (${v.meter_unit === 'HOURS' ? 'hours' : v.meter_unit.toLowerCase()})`}><Input inputMode="decimal" value={v.service_interval_meter ?? ''} onChange={set('service_interval_meter')} /></F>}
            <F label="Next service due">{date('next_service_due')}</F>
          </Grid>
        </SectionCard>

        {powers.seeCost && (
          <SectionCard title="Rates" collapsible={false}>
            <p className="mb-3 text-sm" style={{ color: 'var(--ink3)' }}>Only administrators, finance and equipment managers see these.</p>
            <Grid>
              <F label={hired ? 'Hire rate (what you pay)' : 'Internal cost rate'}><Input inputMode="decimal" value={v.cost_rate ?? ''} onChange={set('cost_rate')} /></F>
              <F label="Charge-out rate"><Input inputMode="decimal" value={v.billing_rate ?? ''} onChange={set('billing_rate')} /></F>
              <F label="Per"><Select value={v.rate_unit ?? 'DAY'} onValueChange={set('rate_unit')}><SelectTrigger aria-label="Rate unit"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="HOUR">Hour</SelectItem><SelectItem value="DAY">Day</SelectItem><SelectItem value="WEEK">Week</SelectItem><SelectItem value="MONTH">Month</SelectItem></SelectContent></Select></F>
              <F label="Currency"><Input value={v.currency ?? 'TZS'} onChange={e => setV(p => ({ ...p!, currency: e.target.value.toUpperCase().slice(0, 3) }))} maxLength={3} /></F>
            </Grid>
          </SectionCard>
        )}

        <SectionCard title="Notes" collapsible={false}><Textarea rows={3} value={v.notes ?? ''} onChange={set('notes')} aria-label="Notes" /></SectionCard>

        {errors && <p className="text-sm" role="alert" style={{ color: 'var(--red)' }}>{errors}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Back</Button>
          <Button type="submit" loading={busy} disabled={!v.name?.trim()}>{editing ? 'Save changes' : 'Add to register'}</Button>
        </div>
      </form>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
function F({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1 text-sm"><span className="font-medium">{label}{required && <span aria-hidden style={{ color: 'var(--red)' }}> *</span>}</span>{children}{hint && <span className="text-xs" style={{ color: 'var(--ink3)' }}>{hint}</span>}</label>;
}
