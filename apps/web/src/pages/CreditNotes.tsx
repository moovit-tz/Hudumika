import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { FormPage, FormPageActions } from '../components/FormPage.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';

interface CreditNote {
  id: string; credit_note_number: string; original_invoice_id: string | null;
  customer_id: string | null; client_name: string | null; currency: string;
  credit_date: string | null; reason: string | null; status: 'DRAFT' | 'POSTED' | 'VOID';
  created_at: string;
}
interface DraftLine { name: string; rate: string; qty: string; tax_pct: string }
const emptyLine = (): DraftLine => ({ name: '', rate: '', qty: '1', tax_pct: '0' });

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

function statusColor(s: string) {
  if (s === 'VOID') return { bg: 'var(--red-l)', fg: 'var(--red)' };
  return { bg: 'var(--green-l)', fg: 'var(--green)' };
}

export function CreditNotes() {
  const { fmt } = useCurrency();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = location.pathname.endsWith('/new');

  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => apiFetch('/v1/credit-notes').then((d: any) => { if (Array.isArray(d)) setNotes(d); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // ── New credit note form ──
  const params = new URLSearchParams(location.search);
  const [invoiceId] = useState(params.get('invoice_id') || '');
  const [customerItem, setCustomerItem] = useState<PickerItem | null>(null);
  const [clientName, setClientName] = useState(params.get('client_name') || '');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res = await apiFetch(`/v1/customers?search=${encodeURIComponent(q)}`).catch(() => []);
    const list = Array.isArray(res) ? res : (res.data ?? []);
    return list.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || undefined }));
  }

  const updateLine = (i: number, patch: Partial<DraftLine>) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const total = lines.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.qty) || 1) * (1 + (Number(l.tax_pct) || 0) / 100), 0);

  async function submit() {
    const validLines = lines.filter(l => l.name.trim() && Number(l.rate) !== 0);
    if (validLines.length === 0) return showAlert('At least one line with a name and amount is required.');
    if (!clientName.trim() && !customerItem) return showAlert('A customer is required.');
    setSaving(true);
    try {
      await apiFetch('/v1/credit-notes', {
        method: 'POST',
        body: JSON.stringify({
          original_invoice_id: invoiceId || undefined,
          customer_id: customerItem?.id,
          client_name: clientName.trim() || customerItem?.label,
          reason: reason.trim() || undefined,
          items: validLines.map(l => ({ name: l.name.trim(), rate: Number(l.rate), qty: Number(l.qty) || 1, tax_pct: Number(l.tax_pct) || 0 })),
        }),
      });
      // The list route and this "new" route render the same component
      // instance (React Router doesn't remount across two sibling routes
      // with identical element types), so the mount-only `useEffect` above
      // never re-fires on navigate() below — the list previously stayed on
      // whatever it fetched before this credit note existed. Refetch here,
      // before navigating away, so the list is already current when it lands.
      await load();
      navigate('/finance/credit-notes');
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not issue this credit note.');
    } finally {
      setSaving(false);
    }
  }

  if (isNew) {
    return (
      <FormPage
        title="New Credit Note"
        subtitle={invoiceId ? 'Reduces the linked invoice’s outstanding balance.' : 'A standalone credit against a customer.'}
        onCancel={() => navigate('/finance/credit-notes')}
        actions={<FormPageActions onCancel={() => navigate('/finance/credit-notes')} onSave={submit} saving={saving} saveLabel="Issue Credit Note" />}
      >
        <div className="card" style={{ padding: 20 }}>
          {invoiceId && <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--teal-l)', borderRadius: 8, fontSize: 12.5, color: 'var(--teal)' }}>Linked to invoice <code style={{ fontFamily: 'var(--mono)' }}>{invoiceId}</code></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Customer</label>
              {invoiceId ? (
                <input style={inp} value={clientName} onChange={e => setClientName(e.target.value)} disabled />
              ) : (
                <EntityPicker label="" value={customerItem} onChange={setCustomerItem} search={searchCustomers} placeholder="Search customers…" />
              )}
            </div>
            <div><label style={lbl}>Reason</label><input style={inp} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Returned goods, pricing error" /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px 32px', gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Description</span><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Tax %</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px 32px', gap: 8, marginBottom: 8 }}>
              <input style={inp} value={l.name} onChange={e => updateLine(i, { name: e.target.value })} placeholder="What is being credited" />
              <input style={{ ...inp, textAlign: 'right' }} type="number" value={l.rate} onChange={e => updateLine(i, { rate: e.target.value })} placeholder="0.00" />
              <input style={{ ...inp, textAlign: 'right' }} type="number" value={l.qty} onChange={e => updateLine(i, { qty: e.target.value })} />
              <input style={{ ...inp, textAlign: 'right' }} type="number" value={l.tax_pct} onChange={e => updateLine(i, { tax_pct: e.target.value })} />
              <button type="button" onClick={() => removeLine(i)} disabled={lines.length <= 1} style={{ background: 'none', border: 'none', cursor: lines.length > 1 ? 'pointer' : 'not-allowed', opacity: lines.length > 1 ? 1 : 0.3, padding: 4 }}>
                <Icon name="trash" size={14} color="var(--red)" />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: 4, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={12} /> Add line
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Total: <span style={{ color: 'var(--red)' }}>{fmt(total)}</span></div>
          </div>
        </div>
      </FormPage>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading credit notes…</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Credit Notes']}
        titlePlain="Credit"
        titleEm="notes"
        subtitle="Amounts credited back against invoices."
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/finance/credit-notes/new')}>
            <Icon name="plus" size={13} /> New Credit Note
          </button>
        }
      />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rtbl-wrap">
          <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Number</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Reason</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {notes.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>No credit notes issued yet.</td></tr>
              ) : notes.map(n => {
                const sc = statusColor(n.status);
                return (
                  <tr key={n.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{n.credit_note_number}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{n.credit_date ? new Date(n.credit_date).toLocaleDateString('en-GB') : '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{n.client_name || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--ink3)' }}>{n.reason || '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: sc.bg, color: sc.fg }}>{n.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
