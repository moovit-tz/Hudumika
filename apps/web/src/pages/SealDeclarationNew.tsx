import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { SEAL_DECLARATION_PROCEDURE_LABELS } from '@hudumika/types';
import './Seal.css';

interface Lot { id: string; description: string; hsCode: string | null; customsStatus: string; }
interface DutyLineItem { code: string; label: string; base: number; ratePct: number; amount: number; }
interface DutyQuote {
  hsCode: string; hsCodeDescription: string; cifValueLocal: number; lineItems: DutyLineItem[];
  totalDuty: number; totalTax: number; totalPayableLocal: number;
}

const PROCEDURE_CODES = Object.keys(SEAL_DECLARATION_PROCEDURE_LABELS);

export function SealDeclarationNew() {
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
    apiFetch('/v1/seal/lots?customs_status=FOREIGN_DUTY_SUSPENDED').then(setLots);
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
      navigate(`/seal/declarations/${entry.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this declaration.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <button type="button" className="seal-btn-secondary" onClick={() => navigate('/seal/declarations')} style={{ marginBottom: 12 }}>
            <Icon name="arrowLeft" size={13} />
            <span>Back to Declarations</span>
          </button>
          <h1 className="seal-page-title">New Declaration</h1>
          <p className="seal-page-sub">Every number below traces to a stored HS tariff line — the computation panel updates live as you type.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'flex-start' }}>
        <form onSubmit={handleSubmit} className="seal-card">
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Lot (under bond)</label>
              <Combobox
                options={lots.map(l => ({ value: l.id, label: l.description, sublabel: l.hsCode ? `HS ${l.hsCode}` : undefined }))}
                value={lotId} onChange={setLotId} placeholder="Search lots under bond…" emptyText="No suspended lots found."
              />
            </div>

            <div className="seal-field-row">
              <label className="seal-field-label">Procedure</label>
              <Select value={procedureCode} onValueChange={setProcedureCode}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROCEDURE_CODES.map(p => <SelectItem key={p} value={p}>{SEAL_DECLARATION_PROCEDURE_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="seal-field-row">
                <label className="seal-field-label">HS Code</label>
                <input type="text" className="input-field" value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="e.g. 7214.20.00" />
              </div>
              <div className="seal-field-row">
                <label className="seal-field-label">Country of Origin</label>
                <input type="text" className="input-field" value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="e.g. CN" maxLength={2} />
              </div>
            </div>

            <div className="seal-field-row">
              <label className="seal-field-label">Declaration Date</label>
              <DatePicker date={declarationDate} onChange={setDeclarationDate} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="seal-field-row">
                <label className="seal-field-label">Invoice Value</label>
                <input type="number" min="0" step="any" className="input-field" value={invoiceValue} onChange={e => setInvoiceValue(e.target.value)} placeholder="0.00" />
              </div>
              <div className="seal-field-row">
                <label className="seal-field-label">Freight</label>
                <input type="number" min="0" step="any" className="input-field" value={freight} onChange={e => setFreight(e.target.value)} placeholder="0.00" />
              </div>
              <div className="seal-field-row">
                <label className="seal-field-label">Insurance</label>
                <input type="number" min="0" step="any" className="input-field" value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="seal-field-row">
                <label className="seal-field-label">Currency</label>
                <input type="text" className="input-field" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </div>
              <div className="seal-field-row">
                <label className="seal-field-label">FX Rate (to TZS)</label>
                <input type="number" min="0" step="any" className="input-field" value={fxRate} onChange={e => setFxRate(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <button type="submit" className="seal-btn-primary" disabled={!isReady || saving}>
                <Icon name="fileText" size={14} />
                <span>{saving ? 'Creating…' : 'Create Declaration'}</span>
              </button>
            </div>
          </div>
        </form>

        <div className="seal-card">
          <div className="seal-card-hdr"><h2 className="seal-card-title">Duty Computation</h2></div>
          <div style={{ padding: 20 }}>
            {quoting ? (
              <div className="seal-empty">Computing…</div>
            ) : quoteError ? (
              <div style={{ color: 'var(--red)', fontSize: 13 }}>{quoteError}</div>
            ) : !quote ? (
              <div className="seal-empty">Enter an HS code and invoice value to see the computation.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{quote.hsCodeDescription}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CIF Value (local)</span><span className="seal-mono">{quote.cifValueLocal.toLocaleString()}</span>
                </div>
                <table className="seal-table" style={{ marginTop: 4 }}>
                  <thead><tr><th>Line</th><th>Base</th><th>Rate</th><th>Amount</th></tr></thead>
                  <tbody>
                    {quote.lineItems.map(li => (
                      <tr key={li.code}>
                        <td>{li.label}</td>
                        <td className="seal-mono">{li.base.toLocaleString()}</td>
                        <td className="seal-mono">{li.ratePct}%</td>
                        <td className="seal-mono">{li.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <span>Total Payable</span><span className="seal-mono">{quote.totalPayableLocal.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
