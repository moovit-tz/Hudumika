import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { SEAL_DECLARATION_PROCEDURE_LABELS } from '@hudumika/types';

interface Lot { id: string; description: string; hsCode: string | null; ownerName?: string; qtyOnHand: number; uom: string; }
interface DutyLineItem { code: string; label: string; base: number; ratePct: number; amount: number; }
interface DutyQuote {
  hsCode: string; hsCodeDescription: string; cifValueLocal: number; lineItems: DutyLineItem[];
  totalDuty: number; totalTax: number; totalPayableLocal: number;
}

const PROCEDURE_CODES = Object.keys(SEAL_DECLARATION_PROCEDURE_LABELS);

export function ClearOSDeclarationNew() {
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [saving, setSaving] = useState(false);

  const [lotId, setLotId] = useState('');
  const [procedureCode, setProcedureCode] = useState(PROCEDURE_CODES[0]);
  const [declarationDate, setDeclarationDate] = useState<Date | undefined>(new Date());
  const [hsCode, setHsCode] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [invoiceValue, setInvoiceValue] = useState('');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [fxRate, setFxRate] = useState('2600');

  const [quote, setQuote] = useState<DutyQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    apiFetch('/v1/seal/lots-for-declaration?customs_status=FOREIGN_DUTY_SUSPENDED').then(setLots);
  }, []);

  useEffect(() => {
    if (!lotId) return;
    const lot = lots.find(l => l.id === lotId);
    if (lot?.hsCode && !hsCode) setHsCode(lot.hsCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId, lots]);

  const canQuote = hsCode.trim() && invoiceValue && Number(invoiceValue) > 0 && currency.trim() && fxRate && Number(fxRate) > 0;

  useEffect(() => {
    if (!canQuote) { setQuote(null); setQuoteError(''); return; }
    const handle = setTimeout(() => {
      setQuoting(true);
      apiFetch('/v1/seal/duty-quote', {
        method: 'POST',
        body: JSON.stringify({
          hsCode: hsCode.trim(), invoiceValue: Number(invoiceValue), freight: freight ? Number(freight) : 0,
          insurance: insurance ? Number(insurance) : 0, currency: currency.trim().toUpperCase(), fxRate: Number(fxRate),
        }),
      }).then(res => { setQuote(res); setQuoteError(''); })
        .catch(err => { setQuote(null); setQuoteError(err.message || 'Could not compute duty for this HS code.'); })
        .finally(() => setQuoting(false));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsCode, invoiceValue, freight, insurance, currency, fxRate]);

  const isReady = lotId && declarationDate && quote && !quoting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady) return;
    setSaving(true);
    try {
      const entry = await apiFetch('/v1/seal/customs-entries', {
        method: 'POST',
        body: JSON.stringify({
          lotId, procedureCode, declarationDate: toDateOnlyString(declarationDate!),
          hsCode: hsCode.trim(), countryOfOrigin: countryOfOrigin.trim().toUpperCase() || null,
          invoiceValue: Number(invoiceValue), freight: freight ? Number(freight) : 0, insurance: insurance ? Number(insurance) : 0,
          currency: currency.trim().toUpperCase(), fxRate: Number(fxRate),
        }),
      });
      navigate(`/clearos/declarations/${entry.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this declaration.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader crumbs={['ClearOS', 'Ops Command', 'Declarations']} titlePlain="New" titleEm="Declaration" subtitle="Every number below traces to a stored HS tariff line — the computation panel updates live as you type." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'flex-start', marginTop: 16 }}>
        <form onSubmit={handleSubmit} style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Lot (under bond)">
            <Combobox
              options={lots.map(l => ({ value: l.id, label: l.description, sublabel: [l.ownerName, l.hsCode ? `HS ${l.hsCode}` : null].filter(Boolean).join(' · ') }))}
              value={lotId} onChange={setLotId} placeholder="Search lots under bond…" emptyText="No suspended lots found."
            />
          </Field>

          <Field label="Procedure">
            <Select value={procedureCode} onValueChange={setProcedureCode}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROCEDURE_CODES.map(p => <SelectItem key={p} value={p}>{SEAL_DECLARATION_PROCEDURE_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="HS Code"><input type="text" className="input-field" value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="e.g. 7214.20.00" /></Field>
            <Field label="Country of Origin"><input type="text" className="input-field" value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="e.g. CN" maxLength={2} /></Field>
          </div>

          <Field label="Declaration Date"><DatePicker date={declarationDate} onChange={setDeclarationDate} /></Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="Invoice Value"><input type="number" min="0" step="any" className="input-field" value={invoiceValue} onChange={e => setInvoiceValue(e.target.value)} placeholder="0.00" /></Field>
            <Field label="Freight"><input type="number" min="0" step="any" className="input-field" value={freight} onChange={e => setFreight(e.target.value)} placeholder="0.00" /></Field>
            <Field label="Insurance"><input type="number" min="0" step="any" className="input-field" value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="0.00" /></Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Currency"><input type="text" className="input-field" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
            <Field label="FX Rate (to TZS)"><input type="number" min="0" step="any" className="input-field" value={fxRate} onChange={e => setFxRate(e.target.value)} /></Field>
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <button type="submit" className="btn btn-primary" disabled={!isReady || saving}>
              <Icon name="fileText" size={14} /> {saving ? 'Creating…' : 'Create Declaration'}
            </button>
          </div>
        </form>

        <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 14px' }}>Duty Computation</h2>
          {quoting ? (
            <div style={{ color: 'var(--ink3)' }}>Computing…</div>
          ) : quoteError ? (
            <div style={{ color: 'var(--red)', fontSize: 13 }}>{quoteError}</div>
          ) : !quote ? (
            <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Enter an HS code and invoice value to see the computation.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{quote.hsCodeDescription}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>CIF Value (local)</span><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{quote.cifValueLocal.toLocaleString()}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 4 }}>
                <thead><tr><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Line</th><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Base</th><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Rate</th><th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink3)' }}>Amount</th></tr></thead>
                <tbody>
                  {quote.lineItems.map(li => (
                    <tr key={li.code} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 0' }}>{li.label}</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{li.base.toLocaleString()}</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{li.ratePct}%</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{li.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span>Total Payable</span><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{quote.totalPayableLocal.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink3)' }}>{label}</label>
      {children}
    </div>
  );
}
