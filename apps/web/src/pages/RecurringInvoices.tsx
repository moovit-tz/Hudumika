import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { useTaxCodes } from '../data/taxCodeData.js';

type Freq = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
type State = 'ACTIVE' | 'PAUSED' | 'ENDED';
const FREQ_LABEL: Record<Freq, string> = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Annually' };

interface RecurringInvoice {
  id: string; name: string | null; customer_id: string | null; client_name: string | null;
  frequency: Freq; currency: string; amount: number; tax_rate: number; tax_code_id: string | null;
  description: string | null; payment_terms: string | null; next_due: string | null; end_date: string | null;
  state: State; invoices_generated: number; total_billed: number;
}

function mapApi(d: any): RecurringInvoice {
  return {
    id: d.id, name: d.name, customer_id: d.customer_id, client_name: d.client_name,
    frequency: d.frequency || 'MONTHLY', currency: d.currency || 'TZS',
    amount: Number(d.amount) || 0, tax_rate: Number(d.tax_rate) || 0, tax_code_id: d.tax_code_id,
    description: d.description, payment_terms: d.payment_terms, next_due: d.next_due, end_date: d.end_date,
    state: d.state || 'ACTIVE', invoices_generated: Number(d.invoices_generated) || 0, total_billed: Number(d.total_billed) || 0,
  };
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

function RecurFormPanel({ initial, onSave, onClose }: { initial: RecurringInvoice | null; onSave: (data: any) => Promise<void>; onClose: () => void }) {
  const salesTaxCodes = useTaxCodes().filter(c => c.appliesTo !== 'PURCHASE');
  const [name, setName] = useState(initial?.name ?? '');
  const [customerItem, setCustomerItem] = useState<PickerItem | null>(initial?.customer_id ? { id: initial.customer_id, label: initial.client_name || '' } : null);
  const [clientName, setClientName] = useState(initial?.client_name ?? '');
  const [frequency, setFrequency] = useState<Freq>(initial?.frequency ?? 'MONTHLY');
  const [currency, setCurrency] = useState(initial?.currency ?? 'TZS');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [taxCodeId, setTaxCodeId] = useState<string | null>(initial?.tax_code_id ?? null);
  const [taxRate, setTaxRate] = useState(initial?.tax_rate ?? 0);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [paymentTerms, setPaymentTerms] = useState(initial?.payment_terms ?? 'Net 30');
  const [nextDue, setNextDue] = useState(initial?.next_due ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const [saving, setSaving] = useState(false);

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res = await apiFetch(`/v1/customers?search=${encodeURIComponent(q)}`).catch(() => []);
    const list = Array.isArray(res) ? res : (res.data ?? []);
    return list.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || undefined }));
  }
  async function createCustomerInline(name: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/customers', { method: 'POST', body: JSON.stringify({ name }) });
    return { id: created.id, label: created.name };
  }
  function handleCustomerChange(item: PickerItem | null) {
    setCustomerItem(item);
    if (item) setClientName(item.label);
  }

  const total = amount * (1 + taxRate / 100);

  async function submit() {
    if (!name.trim()) return showAlert('A template name is required.');
    if (!clientName.trim() && !customerItem) return showAlert('A customer is required.');
    if (amount <= 0) return showAlert('Amount must be greater than zero.');
    if (!nextDue) return showAlert('Next due date is required.');
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), customer_id: customerItem?.id || undefined, client_name: clientName.trim() || customerItem?.label,
        frequency, currency, amount, tax_code_id: taxCodeId, tax_rate: taxCodeId ? undefined : taxRate,
        description: description.trim() || undefined, payment_terms: paymentTerms.trim() || undefined,
        next_due: nextDue, end_date: endDate || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: 'var(--white)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{initial ? 'Edit Recurring Invoice' : 'New Recurring Invoice'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Auto-generates invoices on schedule</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Template Name *</label><input type="text" placeholder="e.g. Monthly Retainer" value={name} onChange={e => setName(e.target.value)} style={inp} /></div>
          <div style={{ marginBottom: 14 }}>
            <EntityPicker label="Customer *" value={customerItem} onChange={handleCustomerChange} search={searchCustomers} onCreate={createCustomerInline} createLabel={q => `Create new customer "${q}"`} placeholder="Search customers…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Frequency</label><Select value={frequency} onValueChange={v => setFrequency(v as Freq)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(FREQ_LABEL) as Freq[]).map(f => <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}</SelectContent></Select></div>
            <div><label style={lbl}>Currency</label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['TZS', 'USD', 'KES', 'EUR', 'GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Amount</label><input type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} style={inp} /></div>
            <div>
              <label style={lbl}>Tax treatment</label>
              <Select value={taxCodeId ?? '__none__'} onValueChange={v => {
                if (v === '__none__') { setTaxCodeId(null); return; }
                const tc = salesTaxCodes.find(c => c.id === v);
                setTaxCodeId(v); if (tc) setTaxRate(tc.rate);
              }}>
                <SelectTrigger><SelectValue placeholder="Not classified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not classified</SelectItem>
                  {salesTaxCodes.map(tc => <SelectItem key={tc.id} value={tc.id}>{tc.code} · {tc.rate}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Next due date</label><DatePicker date={parseDateOnly(nextDue)} onChange={d => setNextDue(toDateOnlyString(d) ?? '')} /></div>
            <div><label style={lbl}>End date (optional)</label><DatePicker date={parseDateOnly(endDate)} onChange={d => setEndDate(toDateOnlyString(d) ?? '')} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Payment terms</label><input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} style={inp} /></div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Description</label><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} style={{ ...inp, resize: 'vertical' }} /></div>
          <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 9, fontSize: 13, color: 'var(--ink2)' }}>
            Total per cycle: <strong style={{ color: 'var(--teal)' }}>{currency} {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
          </div>
        </div>
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save Template'}</button>
        </div>
      </div>
    </>
  );
}

export function RecurringInvoices() {
  const { fmt } = useCurrency();
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringInvoice | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const load = () => apiFetch('/v1/invoices/recurring').then((d: any) => { if (Array.isArray(d)) setRecurring(d.map(mapApi)); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function handleSave(data: any) {
    try {
      if (editing) await apiFetch(`/v1/invoices/recurring/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      else await apiFetch('/v1/invoices/recurring', { method: 'POST', body: JSON.stringify(data) });
      setShowForm(false); setEditing(null);
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this template.');
    }
  }

  async function handleGenerate(r: RecurringInvoice) {
    setGeneratingId(r.id);
    try {
      await apiFetch(`/v1/invoices/recurring/${r.id}/generate`, { method: 'POST' });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Failed to generate invoice');
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleToggle(r: RecurringInvoice) {
    const nextState = r.state === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    await apiFetch(`/v1/invoices/recurring/${r.id}`, { method: 'PATCH', body: JSON.stringify({ state: nextState }) }).catch(() => {});
    await load();
  }

  async function handleDelete(r: RecurringInvoice) {
    if (!(await showConfirm(`Delete the recurring template "${r.name}"? This does not affect invoices already generated.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/invoices/recurring/${r.id}`, { method: 'DELETE' }).catch(() => {});
    await load();
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading recurring invoices…</div>;

  const totalMonthly = recurring.filter(r => r.frequency === 'MONTHLY' && r.state === 'ACTIVE').reduce((a, r) => a + r.amount * (1 + r.tax_rate / 100), 0);
  const activeCount = recurring.filter(r => r.state === 'ACTIVE').length;
  const pausedCount = recurring.filter(r => r.state === 'PAUSED').length;
  const invoicesGenerated = recurring.reduce((s, r) => s + r.invoices_generated, 0);
  const totalBilled = recurring.reduce((s, r) => s + r.total_billed, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Invoices']}
        titlePlain="Recurring"
        titleEm="invoices"
        subtitle="Templates that auto-generate a real invoice on schedule."
      />

      <MetricsRow cards={[
          {
            title: 'Total Templates', value: String(recurring.length),
            sub1Label: 'ACTIVE', sub1Value: String(activeCount),
            sub2Label: 'PAUSED', sub2Value: String(pausedCount), barHighlight: 'var(--teal)',
          },
          {
            title: 'Monthly Recurring', value: fmt(totalMonthly),
            sub1Label: 'MONTHLY ACTIVE', sub1Value: String(recurring.filter(r => r.frequency === 'MONTHLY' && r.state === 'ACTIVE').length),
            sub2Label: 'ALL ACTIVE', sub2Value: String(activeCount), barHighlight: 'var(--blue)',
          },
          {
            title: 'Invoices Generated', value: String(invoicesGenerated),
            sub1Label: 'TOTAL BILLED', sub1Value: fmt(totalBilled),
            sub2Label: 'TEMPLATES', sub2Value: String(recurring.length), barHighlight: 'var(--green)',
          },
          {
            title: 'Active Rate', value: `${recurring.length ? Math.round((activeCount / recurring.length) * 100) : 0}%`,
            sub1Label: 'ACTIVE', sub1Value: String(activeCount),
            sub2Label: 'TOTAL', sub2Value: String(recurring.length), barHighlight: 'var(--purple)',
          },
        ]} />

      <div style={{ padding: '16px 0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Link to="/finance/invoices" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <Icon name="arrowLeft" size={13} /> All Invoices
        </Link>
        <button type="button" onClick={() => { setEditing(null); setShowForm(true); }}
          style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> New Template
        </button>
      </div>

      <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {recurring.length === 0 ? (
          <div style={{ padding: '64px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Icon name="refresh" size={32} color="var(--ink3)" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No recurring invoices set up yet</div>
          </div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl">
            <thead><tr style={{ background: 'var(--bg)' }}>
              {['Template', 'Customer', 'Frequency', 'Amount', 'Next Due', 'Invoices', 'State', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {recurring.map(r => {
                const total = r.amount * (1 + r.tax_rate / 100);
                const dueD = r.next_due ? new Date(r.next_due) : null;
                const dueSoon = dueD ? dueD.getTime() - Date.now() < 14 * 86400000 : false;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', opacity: r.state === 'PAUSED' ? 0.55 : 1 }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</div>
                      {r.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{r.description.length > 50 ? r.description.slice(0, 50) + '…' : r.description}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--ink2)' }}>{r.client_name}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--ink2)' }}>{FREQ_LABEL[r.frequency]}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 700 }}>{fmt(total, r.currency)}</td>
                    <td style={{ padding: '12px 14px', color: dueSoon && r.state === 'ACTIVE' ? 'var(--gold)' : 'var(--ink2)', fontWeight: dueSoon ? 700 : 400 }}>
                      {r.next_due ? new Date(r.next_due).toLocaleDateString('en-GB') : '—'}
                      {dueSoon && r.state === 'ACTIVE' && <span style={{ fontSize: 10, display: 'block', color: 'var(--gold)' }}>Due soon</span>}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--ink2)' }}>{r.invoices_generated}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: r.state === 'ACTIVE' ? 'var(--green-l)' : r.state === 'PAUSED' ? 'var(--gold-l)' : 'var(--bg)', color: r.state === 'ACTIVE' ? 'var(--green)' : r.state === 'PAUSED' ? 'var(--gold)' : 'var(--ink3)' }}>{r.state}</span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button type="button" title="Generate invoice now" onClick={() => handleGenerate(r)} disabled={r.state !== 'ACTIVE' || generatingId === r.id}
                          style={{ background: 'none', border: 'none', cursor: r.state === 'ACTIVE' ? 'pointer' : 'default', color: r.state === 'ACTIVE' ? 'var(--teal)' : 'var(--border)', padding: 5, borderRadius: 'var(--r-sm)', display: 'flex' }}>
                          <Icon name="zap" size={14} />
                        </button>
                        <button type="button" title="Edit" onClick={() => { setEditing(r); setShowForm(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 5, borderRadius: 'var(--r-sm)', display: 'flex' }}><Icon name="edit" size={14} /></button>
                        <button type="button" title={r.state === 'ACTIVE' ? 'Pause' : 'Resume'} onClick={() => handleToggle(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', padding: 5, borderRadius: 'var(--r-sm)', display: 'flex' }}><Icon name={r.state === 'ACTIVE' ? 'pause' : 'chevronRight'} size={14} /></button>
                        <button type="button" title="Delete" onClick={() => handleDelete(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 5, borderRadius: 'var(--r-sm)', display: 'flex' }}><Icon name="trash" size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {showForm && <RecurFormPanel initial={editing} onSave={handleSave} onClose={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}
