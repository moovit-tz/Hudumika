import React, { useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { SectionCard } from '../components/SectionCard.js';
import { AdvancedCalcResultPanel } from '../components/AdvancedCalcResultPanel.js';
import { CustomerLeadPicker } from '../components/CustomerLeadPicker.js';
import type { PickerItem } from '../components/EntityPicker.js';
import { HsCodeField } from '../components/HsCodeField.js';
import { WizardShell, WizardStepCaption, WizardNavRow, Field, wizInputStyle } from '../components/CalcWizardShell.js';
import type { WizardStepItem } from '../components/CalcWizardShell.js';
import { apiFetch } from '../lib/api.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import type { AdvancedCalcResult } from '../lib/advancedCalculators.js';

const STEPS: WizardStepItem[] = [
  { label: 'Your Details', shortLabel: 'Details', desc: 'Customer & shipment reference', icon: 'user' },
  { label: 'Shipment Mode', shortLabel: 'Shipment', desc: 'CBM, weight & bills of lading', icon: 'truck' },
  { label: 'Cargo Items', shortLabel: 'Cargo', desc: 'HS code, description & FOB value', icon: 'box2' },
  { label: 'Review & Results', shortLabel: 'Results', desc: 'Duties, taxes & landed cost', icon: 'calculator' },
];

/** Sea LCL calculator — Aleka Logistics' own rate card (Corridor Levy,
 *  Handling, Removal, Storage, Stripping charges by CBM; separate Shipping
 *  Line/Clearance charges), layered on top of the platform's real HS-code
 *  duty/VAT engine. See advanced-calculators.service.ts for the full model
 *  and its verification against this rate card's own worked example.
 *  Same 4-step wizard shape as the FCL calculator (LandedCostPage.tsx) —
 *  see CalcWizardShell.tsx for the shared chrome. */
export const LclCalculatorPage: React.FC = () => {
  usePageSEO('LCL Calculator', 'Less-than-container-load shipping and taxes — CIF, duty/VAT, port charges, and the full ICD/Shipping Line/Clearance breakdown.');
  const [step, setStep] = useState(1);

  const [hsCode, setHsCode] = useState('');
  const [description, setDescription] = useState('');
  const [fob, setFob] = useState('');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState(''); // blank = auto (1% of CFR)
  const [cbm, setCbm] = useState('');
  const [weightMt, setWeightMt] = useState('');
  const [numBills, setNumBills] = useState('1');
  const [numUnits, setNumUnits] = useState('');
  const [transportation, setTransportation] = useState('');
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
      const r = await apiFetch('/v1/customs/lcl-advanced', {
        method: 'POST',
        body: JSON.stringify({
          hs_code: hsCode.trim(),
          description: description.trim() || undefined,
          fob_usd: parseFloat(fob) || 0,
          freight_usd: parseFloat(freight) || 0,
          insurance_usd: insurance ? parseFloat(insurance) : undefined,
          cbm: parseFloat(cbm) || 0,
          weight_mt: weightMt ? parseFloat(weightMt) : undefined,
          num_bills: numBills ? parseInt(numBills) : undefined,
          num_units: numUnits ? parseFloat(numUnits) : undefined,
          transportation_usd: transportation ? parseFloat(transportation) : undefined,
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
      if (!cbm || parseFloat(cbm) <= 0) return 'CBM is required — LCL is charged per cubic metre.';
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
        titlePlain="LCL"
        titleEm="calculator"
        subtitle="Less-than-container-load shipping and taxes — CIF, duty/VAT, port charges, and the full ICD/Shipping Line/Clearance breakdown."
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
                    source="LCL Calculator"
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="CBM *"><input className="input-field" type="number" value={cbm} onChange={e => setCbm(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Weight (MT)" hint="For Green Port"><input className="input-field" type="number" value={weightMt} onChange={e => setWeightMt(e.target.value)} style={wizInputStyle} /></Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Bills of Lading"><input className="input-field" type="number" value={numBills} onChange={e => setNumBills(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Total Units" hint="For per-unit cost"><input className="input-field" type="number" value={numUnits} onChange={e => setNumUnits(e.target.value)} style={wizInputStyle} /></Field>
                </div>
                <Field label="Transportation (USD)" hint="Port → warehouse, default $150"><input className="input-field" type="number" value={transportation} onChange={e => setTransportation(e.target.value)} style={wizInputStyle} /></Field>
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
                  <HsCodeField value={hsCode} onChange={setHsCode} onPick={r => { if (!description) setDescription(r.description); }} placeholder="e.g. 6307.90.90 or 'textile bags'" required />
                </Field>
                <Field label="Description"><input className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="Product description" style={wizInputStyle} /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="FOB Value (USD) *"><input className="input-field" type="number" value={fob} onChange={e => setFob(e.target.value)} style={wizInputStyle} /></Field>
                  <Field label="Freight (USD)"><input className="input-field" type="number" value={freight} onChange={e => setFreight(e.target.value)} style={wizInputStyle} /></Field>
                </div>
                <Field label="Insurance (USD)" hint="Blank = auto 1% of CFR"><input className="input-field" type="number" value={insurance} onChange={e => setInsurance(e.target.value)} style={wizInputStyle} /></Field>
              </div>
              {error && (
                <Banner variant="error" className="mt-4">{error}</Banner>
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
