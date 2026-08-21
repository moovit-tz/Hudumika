import React, { useState } from 'react';
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
import type { AdvancedCalcResult } from '../lib/advancedCalculators.js';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'TZS'];

const STEPS: WizardStepItem[] = [
  { label: 'Your Details', shortLabel: 'Details', desc: 'Customer & shipment reference', icon: 'user' },
  { label: 'Shipment Mode', shortLabel: 'Shipment', desc: 'Currency, weight & AWBs', icon: 'send' },
  { label: 'Cargo Items', shortLabel: 'Cargo', desc: 'HS code, description & FOB value', icon: 'box2' },
  { label: 'Review & Results', shortLabel: 'Results', desc: 'Duties, taxes & landed cost', icon: 'calculator' },
];

/** Air Freight calculator — Aleka Logistics' own airport tariff/agency rate
 *  card (Documentation, TAA, Notification, Handling, Equipment, Security
 *  Surcharge, Data Discharge TANCIS — TZS-denominated regardless of the
 *  shipment currency), layered on the platform's real HS-code duty/VAT
 *  engine. See advanced-calculators.service.ts.
 *  Same 4-step wizard shape as the FCL calculator (LandedCostPage.tsx) —
 *  see CalcWizardShell.tsx for the shared chrome. */
export const AirCalculatorPage: React.FC = () => {
  usePageSEO('Air Freight Calculator', 'Air consignment shipping and taxes — CIF in any currency, duty/VAT, and the full airport cargo/agency charge breakdown.');
  const [step, setStep] = useState(1);

  const [hsCode, setHsCode] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [fob, setFob] = useState('');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [numAwbs, setNumAwbs] = useState('1');
  const [numUnits, setNumUnits] = useState('');
  const [transportationTzs, setTransportationTzs] = useState('');
  const [customerLead, setCustomerLead] = useState<PickerItem | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shipmentRef, setShipmentRef] = useState('');

  const [result, setResult] = useState<AdvancedCalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function calculate(): Promise<boolean> {
    setError('');
    setLoading(true);
    try {
      const r = await apiFetch('/v1/customs/air-advanced', {
        method: 'POST',
        body: JSON.stringify({
          hs_code: hsCode.trim(),
          description: description.trim() || undefined,
          currency,
          fob: parseFloat(fob) || 0,
          freight: freight ? parseFloat(freight) : undefined,
          insurance: insurance ? parseFloat(insurance) : undefined,
          weight_kg: parseFloat(weightKg) || 0,
          num_awbs: numAwbs ? parseInt(numAwbs) : undefined,
          num_units: numUnits ? parseFloat(numUnits) : undefined,
          transportation_tzs: transportationTzs ? parseFloat(transportationTzs) : undefined,
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
      if (!weightKg || parseFloat(weightKg) <= 0) return 'Weight (KG) is required — airfreight bills on chargeable weight.';
      return null;
    }
    if (s === 3) {
      if (!hsCode.trim()) return 'Select an HS code for the cargo.';
      if (!fob || parseFloat(fob) <= 0) return 'Enter an FOB value greater than zero.';
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
        titlePlain="Air freight"
        titleEm="calculator"
        subtitle="Air consignment shipping and taxes — CIF in any currency, duty/VAT, and the full airport cargo/agency charge breakdown."
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
                    source="Air Freight Calculator"
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
                <Field label="Currency">
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-9.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Weight (KG) *"><input className="input-field" type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Number of AWBs"><input className="input-field" type="number" value={numAwbs} onChange={e => setNumAwbs(e.target.value)} style={wizInputStyle} /></Field>
                </div>
                <Field label="Total Units" hint="For per-unit cost"><input className="input-field" type="number" value={numUnits} onChange={e => setNumUnits(e.target.value)} style={wizInputStyle} /></Field>
                <Field label="Transportation (TZS)" hint="Airport → warehouse, default 0"><input className="input-field" type="number" value={transportationTzs} onChange={e => setTransportationTzs(e.target.value)} style={wizInputStyle} /></Field>
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
                <Field label="HS Code *">
                  <HsCodeField value={hsCode} onChange={setHsCode} onPick={r => { if (!description) setDescription(r.description); }} placeholder="e.g. 0602.20.00 or 'plant seedlings'" required />
                </Field>
                <Field label="Description"><input className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="Product description" style={wizInputStyle} /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label={`FOB Value (${currency}) *`}><input className="input-field" type="number" value={fob} onChange={e => setFob(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Air Freight" hint="0 if prepaid"><input className="input-field" type="number" value={freight} onChange={e => setFreight(e.target.value)} style={wizInputStyle} /></Field>
                </div>
                <Field label="Insurance" hint="Blank = auto 1% of CFR"><input className="input-field" type="number" value={insurance} onChange={e => setInsurance(e.target.value)} style={wizInputStyle} /></Field>
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
              meta={{ customerName: customerName.trim() || undefined, customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim() || undefined, shipmentRef: shipmentRef.trim() || undefined }}
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
    </div>
  );
};
