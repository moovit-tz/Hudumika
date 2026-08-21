import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { SectionCard } from '../components/SectionCard.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { AdvancedCalcResultPanel } from '../components/AdvancedCalcResultPanel.js';
import { CustomerLeadPicker } from '../components/CustomerLeadPicker.js';
import type { PickerItem } from '../components/EntityPicker.js';
import { HsCodeField } from '../components/HsCodeField.js';
import { WizardShell, WizardStepCaption, WizardNavRow, Field, wizInputStyle } from '../components/CalcWizardShell.js';
import type { WizardStepItem } from '../components/CalcWizardShell.js';
import { apiFetch } from '../lib/api.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { showConfirm } from '../lib/confirm.js';
import type { AdvancedCalcResult, TransitRoute } from '../lib/advancedCalculators.js';

const STEPS: WizardStepItem[] = [
  { label: 'Your Details', shortLabel: 'Details', desc: 'Customer & shipment reference', icon: 'user' },
  { label: 'Shipment Mode', shortLabel: 'Shipment', desc: 'Destination, route & containers', icon: 'truck' },
  { label: 'Cargo Items', shortLabel: 'Cargo', desc: 'HS code, description & FOB value', icon: 'box2' },
  { label: 'Review & Results', shortLabel: 'Results', desc: 'Transit charges & totals', icon: 'calculator' },
];

/** Transit calculator — duty/VAT-exempt cargo passing through Dar es Salaam
 *  to a landlocked neighbour. Uses this workspace's own editable route
 *  reference table (distance, border post, weighbridge count, transport
 *  rate by container size) for the route-driven charges, plus Aleka
 *  Logistics' own bond premium/TANCIS entry/road-user/weighbridge rate card.
 *  See advanced-calculators.service.ts.
 *  Same 4-step wizard shape as the FCL calculator (LandedCostPage.tsx) —
 *  see CalcWizardShell.tsx for the shared chrome. The route reference table
 *  stays outside the steps — it's tenant reference data, not shipment input. */
export const TransitCalculatorPage: React.FC = () => {
  usePageSEO('Transit Calculator', 'Dar es Salaam → landlocked-neighbour transit cargo — duty/VAT exempt, priced from this workspace’s own editable route reference table.');
  const [step, setStep] = useState(1);

  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);

  const [destination, setDestination] = useState('');
  const [containerSize, setContainerSize] = useState<'20ft' | '40ft'>('20ft');
  const [numContainers, setNumContainers] = useState('1');
  const [hsCode, setHsCode] = useState('');
  const [description, setDescription] = useState('');
  const [fob, setFob] = useState('');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [cbm, setCbm] = useState('');
  const [numBills, setNumBills] = useState('1');
  const [escortFee, setEscortFee] = useState('');
  const [distanceOverride, setDistanceOverride] = useState('');
  const [checkpointsOverride, setCheckpointsOverride] = useState('');
  const [customerLead, setCustomerLead] = useState<PickerItem | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shipmentRef, setShipmentRef] = useState('');

  const [result, setResult] = useState<AdvancedCalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadRoutes() {
    setRoutesLoading(true);
    try {
      const r = await apiFetch('/v1/customs/transit-routes');
      const list: TransitRoute[] = r?.data ?? [];
      setRoutes(list);
      if (!destination && list.length > 0) setDestination(list[0].destination);
    } catch { /* leave empty rather than invent routes */ }
    setRoutesLoading(false);
  }
  useEffect(() => { loadRoutes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const selectedRoute = routes.find(r => r.destination === destination);

  async function calculate(): Promise<boolean> {
    setError('');
    setLoading(true);
    try {
      const r = await apiFetch('/v1/customs/transit', {
        method: 'POST',
        body: JSON.stringify({
          hs_code: hsCode.trim() || undefined,
          description: description.trim() || undefined,
          fob_usd: fob ? parseFloat(fob) : undefined,
          freight_usd: freight ? parseFloat(freight) : undefined,
          insurance_usd: insurance ? parseFloat(insurance) : undefined,
          destination,
          distance_km_override: distanceOverride ? parseFloat(distanceOverride) : undefined,
          weighbridge_count_override: checkpointsOverride ? parseInt(checkpointsOverride) : undefined,
          container_size: containerSize,
          num_containers: numContainers ? parseInt(numContainers) : undefined,
          cbm: cbm ? parseFloat(cbm) : undefined,
          num_bills: numBills ? parseInt(numBills) : undefined,
          escort_fee_usd: escortFee ? parseFloat(escortFee) : undefined,
          customer_name: customerName.trim() || undefined,
          shipment_ref: shipmentRef.trim() || undefined,
        }),
      });
      setResult(r);
      setLoading(false);
      return true;
    } catch (e: any) {
      setError(e.message ?? 'Calculation failed');
      setResult(null);
      setLoading(false);
      return false;
    }
  }

  function validateStep(s: number): string | null {
    if (s === 2) {
      if (!destination) return 'Select a destination.';
      return null;
    }
    return null;
  }
  const stepError = validateStep(step);

  async function continueFromCargo() {
    const ok = await calculate();
    if (ok) setStep(4);
  }

  function newCalculation() {
    setResult(null);
    setStep(1);
  }

  return (
    <div style={{ padding: '0 0 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['ClearOS', 'Landed Cost']}
        titlePlain="Transit"
        titleEm="calculator"
        subtitle="Dar es Salaam → landlocked-neighbour transit cargo — duty/VAT exempt, priced from this workspace's own editable route reference table."
      />

      <WizardShell steps={STEPS} step={step} setStep={setStep}>
        {step === 1 && (
          <>
            <WizardStepCaption steps={STEPS} index={0} />
            <SectionCard title="Your details" collapsible={false}>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 20 }}>
                Who this estimate is for. These appear on the exported PDF and don't affect any figure.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Company / Customer Name" hint="Search real customers & leads, or type a new name to add it as a lead.">
                  <CustomerLeadPicker
                    value={customerLead}
                    onChange={(item, details) => {
                      setCustomerLead(item);
                      setCustomerName(details?.name || item?.label || '');
                      setCustomerEmail(details?.email || '');
                      setCustomerPhone(details?.phone || '');
                    }}
                    source="Transit Calculator"
                  />
                </Field>
                <Field label="Shipment Ref"><input className="input-field" value={shipmentRef} onChange={e => setShipmentRef(e.target.value)} style={wizInputStyle} /></Field>
              </div>
              <WizardNavRow step={step} totalSteps={STEPS.length} setStep={setStep} />
            </SectionCard>
          </>
        )}

        {step === 2 && (
          <>
            <WizardStepCaption steps={STEPS} index={1} />
            <SectionCard title="Shipment mode" collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Destination *">
                  <Select value={destination} onValueChange={setDestination}>
                    <SelectTrigger className="h-9.5"><SelectValue placeholder={routesLoading ? 'Loading routes…' : 'Select destination'} /></SelectTrigger>
                    <SelectContent>{routes.map(r => <SelectItem key={r.id} value={r.destination}>{r.destination} — {r.border_post}</SelectItem>)}</SelectContent>
                  </Select>
                  {selectedRoute && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                      {selectedRoute.distance_km} km · {selectedRoute.weighbridge_count} checkpoints · 20ft ${selectedRoute.transport_20ft_usd} · 40ft ${selectedRoute.transport_40ft_usd}
                    </div>
                  )}
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Container Size">
                    <Select value={containerSize} onValueChange={v => setContainerSize(v as '20ft' | '40ft')}>
                      <SelectTrigger className="h-9.5"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="20ft">20ft</SelectItem><SelectItem value="40ft">40ft</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <Field label="Containers"><input className="input-field" type="number" value={numContainers} onChange={e => setNumContainers(e.target.value)} style={wizInputStyle} /></Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Distance override (km)"><input className="input-field" type="number" value={distanceOverride} onChange={e => setDistanceOverride(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Checkpoints override"><input className="input-field" type="number" value={checkpointsOverride} onChange={e => setCheckpointsOverride(e.target.value)} style={wizInputStyle} /></Field>
                </div>
                <Field label="Escort Fee (USD)" hint="Restricted/hazardous goods only"><input className="input-field" type="number" value={escortFee} onChange={e => setEscortFee(e.target.value)} style={wizInputStyle} /></Field>
              </div>
              <WizardNavRow step={step} totalSteps={STEPS.length} setStep={setStep} error={stepError} />
            </SectionCard>
          </>
        )}

        {step === 3 && (
          <>
            <WizardStepCaption steps={STEPS} index={2} />
            <SectionCard title="Cargo items" collapsible={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="HS Code" hint="Optional — record-keeping only, no duty applies">
                  <HsCodeField value={hsCode} onChange={setHsCode} onPick={r => { if (!description) setDescription(r.description); }} />
                </Field>
                <Field label="Description"><input className="input-field" value={description} onChange={e => setDescription(e.target.value)} style={wizInputStyle} /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="FOB Value (USD)"><input className="input-field" type="number" value={fob} onChange={e => setFob(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Freight (USD)"><input className="input-field" type="number" value={freight} onChange={e => setFreight(e.target.value)} style={wizInputStyle} /></Field>
                </div>
                <Field label="Insurance (USD)"><input className="input-field" type="number" value={insurance} onChange={e => setInsurance(e.target.value)} style={wizInputStyle} /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="CBM" hint="If also LCL-handled"><input className="input-field" type="number" value={cbm} onChange={e => setCbm(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Bills of Lading"><input className="input-field" type="number" value={numBills} onChange={e => setNumBills(e.target.value)} style={wizInputStyle} /></Field>
                </div>
              </div>
              {error && (
                <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)' }}>{error}</div>
              )}
              <WizardNavRow step={step} totalSteps={STEPS.length} setStep={setStep} error={stepError} busy={loading} onContinue={continueFromCargo} continueLabel="Calculate" />
            </SectionCard>
          </>
        )}

        {step === 4 && (
          <>
            <WizardStepCaption steps={STEPS} index={3} />
            <AdvancedCalcResultPanel
              result={result} loading={loading} error=""
              meta={{ customerName: customerName.trim() || undefined, customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim() || undefined, shipmentRef: shipmentRef.trim() || undefined, destination: selectedRoute ? `${destination} (via ${selectedRoute.border_post})` : destination || undefined }}
              onAmend={() => setStep(3)}
              onNewCalculation={newCalculation}
            />
            <div style={{ marginTop: 16 }}>
              <button type="button" onClick={() => setStep(3)}
                style={{ height: 'var(--ctl-h)', padding: '0 22px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="arrowLeft" size={14} /> Back
              </button>
            </div>
          </>
        )}
      </WizardShell>

      <div style={{ marginTop: 20 }}>
        <RouteReferenceTable routes={routes} onChanged={loadRoutes} />
      </div>
    </div>
  );
};

// ─── Editable route reference table ────────────────────────────────────────

function RouteReferenceTable({ routes, onChanged }: { routes: TransitRoute[]; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<TransitRoute>>({});
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  function startEdit(r: TransitRoute) {
    setEditingId(r.id);
    setDraft({ ...r });
    setAdding(false);
  }
  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setDraft({ destination: '', border_post: '', distance_km: 0, transport_20ft_usd: 0, transport_40ft_usd: 0, weighbridge_count: 0 });
  }
  function cancel() { setEditingId(null); setAdding(false); setDraft({}); }

  async function save() {
    if (!draft.destination) return;
    setSaving(true);
    try {
      const body = {
        destination: draft.destination,
        border_post: draft.border_post || undefined,
        distance_km: Number(draft.distance_km) || 0,
        transport_20ft_usd: Number(draft.transport_20ft_usd) || 0,
        transport_40ft_usd: Number(draft.transport_40ft_usd) || 0,
        weighbridge_count: Number(draft.weighbridge_count) || 0,
      };
      if (editingId) await apiFetch(`/v1/customs/transit-routes/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await apiFetch('/v1/customs/transit-routes', { method: 'POST', body: JSON.stringify(body) });
      cancel();
      onChanged();
    } catch { /* leave the form open so the user can retry */ }
    setSaving(false);
  }

  async function remove(id: string, destination: string) {
    if (!(await showConfirm(`Remove the "${destination}" route?`, { confirmLabel: 'Remove' }))) return;
    await apiFetch(`/v1/customs/transit-routes/${id}`, { method: 'DELETE' });
    onChanged();
  }

  const cellIn = (field: keyof TransitRoute, type: 'text' | 'number' = 'text') => (
    <input
      className="input-field"
      type={type}
      value={(draft[field] as any) ?? ''}
      onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
      style={{ width: '100%', boxSizing: 'border-box', height: 30, fontSize: 12 }}
    />
  );

  return (
    <SectionCard title="Route Reference Table" action={
      !adding && !editingId ? (
        <button type="button" onClick={startAdd} className="btn btn-secondary" style={{ height: 28, fontSize: 11.5, fontWeight: 700, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="plus" size={12} /> Add Route
        </button>
      ) : undefined
    } padded={false} defaultOpen={false}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {([
                ['Destination', 'left'], ['Border Post', 'left'], ['Dist (km)', 'right'],
                ['20ft (USD)', 'right'], ['40ft (USD)', 'right'], ['Checkpoints', 'right'], ['', 'left'],
              ] as [string, 'left' | 'right'][]).map(([h, align]) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: align, fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 12px' }}>{cellIn('destination')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('border_post')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('distance_km', 'number')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('transport_20ft_usd', 'number')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('transport_40ft_usd', 'number')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('weighbridge_count', 'number')}</td>
                <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}><RowActions onSave={save} onCancel={cancel} saving={saving} /></td>
              </tr>
            )}
            {routes.map(r => editingId === r.id ? (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 12px' }}>{cellIn('destination')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('border_post')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('distance_km', 'number')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('transport_20ft_usd', 'number')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('transport_40ft_usd', 'number')}</td>
                <td style={{ padding: '6px 12px' }}>{cellIn('weighbridge_count', 'number')}</td>
                <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}><RowActions onSave={save} onCancel={cancel} saving={saving} /></td>
              </tr>
            ) : (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: 'var(--ink)' }}>{r.destination}</td>
                <td style={{ padding: '7px 12px', color: 'var(--ink2)' }}>{r.border_post}</td>
                <td style={{ padding: '7px 12px', color: 'var(--ink2)', textAlign: 'right' }}>{r.distance_km}</td>
                <td style={{ padding: '7px 12px', color: 'var(--ink2)', textAlign: 'right' }}>${r.transport_20ft_usd}</td>
                <td style={{ padding: '7px 12px', color: 'var(--ink2)', textAlign: 'right' }}>${r.transport_40ft_usd}</td>
                <td style={{ padding: '7px 12px', color: 'var(--ink2)', textAlign: 'right' }}>{r.weighbridge_count}</td>
                <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => startEdit(r)} style={iconBtnStyle}><Icon name="edit" size={13} color="var(--ink3)" /></button>
                  <button type="button" onClick={() => remove(r.id, r.destination)} style={iconBtnStyle}><Icon name="trash" size={13} color="var(--red)" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function RowActions({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <>
      <button type="button" onClick={onSave} disabled={saving} style={{ ...iconBtnStyle, color: 'var(--teal)' }}><Icon name="check" size={14} color="var(--teal)" /></button>
      <button type="button" onClick={onCancel} style={iconBtnStyle}><Icon name="x" size={14} color="var(--ink3)" /></button>
    </>
  );
}

const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex', verticalAlign: 'middle' };
