import React, { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch } from '../lib/api.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

// ─── constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'DRAFT',     label: 'Draft',          color: 'var(--ink3)' },
  { key: 'PENDING',   label: 'Pending Review',  color: '#9a6700' },
  { key: 'APPROVED',  label: 'Approved',         color: '#059669' },
  { key: 'CONVERTED', label: 'Converted',        color: 'var(--teal)' },
  { key: 'REJECTED',  label: 'Rejected',         color: '#cf222e' },
];

const STATUS_BG: Record<string, string> = {
  DRAFT:     '#f0f0f0',
  PENDING:   '#fff8e1',
  APPROVED:  '#e6f4ea',
  CONVERTED: '#e0f5f5',
  REJECTED:  '#fdecea',
};
const STATUS_FG: Record<string, string> = {
  DRAFT:     'var(--ink3)',
  PENDING:   '#9a6700',
  APPROVED:  '#059669',
  CONVERTED: 'var(--teal)',
  REJECTED:  '#cf222e',
};

const SHIPMENT_TYPES = ['AIR', 'SEA', 'ROAD', 'RAIL'];
const CURRENCIES     = ['USD', 'TZS', 'EUR', 'GBP'];
const CATEGORIES     = ['Freight', 'Handling', 'Customs', 'Insurance', 'Other'];
const TAX_RATES      = [0, 10, 18];

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, c = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: c, maximumFractionDigits: 0,
  }).format(n ?? 0);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toDateInput(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

// ─── blank line ───────────────────────────────────────────────────────────────

function blankLine() {
  return { description: '', category: 'Freight', quantity: 1, unit_price: 0, tax_rate: 0 };
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      background: STATUS_BG[status] || '#f0f0f0',
      color: STATUS_FG[status] || 'var(--ink3)',
    }}>{status}</span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, kind, onClose }: { msg: string; kind: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 3000,
      background: kind === 'success' ? 'var(--green)' : 'var(--red)',
      color: '#fff', borderRadius: 8, padding: '10px 18px',
      fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <Icon name={kind === 'success' ? 'check' : 'x'} size={16} />
      {msg}
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'var(--white)', borderRadius: 12, padding: 28, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Confirm</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 22 }}>{msg}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Change Modal ──────────────────────────────────────────────────────

function StatusModal({
  quote, onClose, onDone,
}: { quote: any; onClose: () => void; onDone: (q: any) => void }) {
  const [status, setStatus] = useState(quote.status);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const allowed = ['PENDING', 'APPROVED', 'REJECTED'].filter(s => s !== quote.status);

  async function save() {
    setSaving(true); setErr('');
    try {
      const updated = await apiFetch(`/v1/quotations/${quote.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      });
      onDone(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'var(--white)', borderRadius: 12, padding: 28, width: 380 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Change Status</div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>New Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="New Status" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {allowed.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {status === 'REJECTED' && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Rejection Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Enter rejection reason…" style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        )}
        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  quoteId, onClose, onEdit, onDelete, onStatusChange, onConvert,
}: {
  quoteId: string;
  onClose: () => void;
  onEdit: (q: any) => void;
  onDelete: (q: any) => void;
  onStatusChange: (q: any) => void;
  onConvert: (q: any) => void;
}) {
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/quotations/${quoteId}`)
      .then((d: any) => setQuote(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [quoteId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
        <div style={{ background: 'var(--white)', borderRadius: 12, padding: 40, fontSize: 14, color: 'var(--ink3)' }}>Loading…</div>
      </div>
    );
  }

  if (!quote) return null;

  const stageColor = STAGES.find(s => s.key === quote.status)?.color || 'var(--ink3)';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', zIndex: 1500 }}>
      <div style={{ background: 'var(--white)', width: 560, maxWidth: '95vw', height: '100vh', overflowY: 'auto', boxShadow: '-4px 0 32px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column' }}>
        {/* Panel header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--white)', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: stageColor, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)' }}>{quote.quote_number}</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{quote.title}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => onEdit(quote)}>
            <Icon name="edit" size={13} /> Edit
          </button>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => onStatusChange(quote)}>
            <Icon name="refresh" size={13} /> Status
          </button>
          {quote.status === 'APPROVED' && (
            <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => onConvert(quote)}>
              <Icon name="arrowRight" size={13} /> Convert to Shipment
            </button>
          )}
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--red)', borderColor: 'var(--red)' }}
            onClick={() => onDelete(quote)}>
            <Icon name="trash2" size={13} /> Delete
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', flex: 1 }}>
          {/* Status + customer */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
            <StatusBadge status={quote.status} />
          </div>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 20 }}>
            {[
              ['Customer', quote.customer_name || '—'],
              ['Shipment Type', quote.shipment_type || '—'],
              ['Currency', quote.currency],
              ['Valid From', fmtDate(quote.valid_from)],
              ['Valid Until', fmtDate(quote.valid_until)],
              ['Origin Port', quote.origin_port || '—'],
              ['Origin City', quote.origin_city || '—'],
              ['Destination Port', quote.destination_port || '—'],
              ['Destination City', quote.destination_city || '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{val}</div>
              </div>
            ))}
          </div>

          {quote.goods_description && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Goods Description</div>
              <div style={{ fontSize: 13, color: 'var(--ink)', background: 'var(--bg)', borderRadius: 6, padding: '8px 12px' }}>{quote.goods_description}</div>
            </div>
          )}

          {quote.notes && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 13, color: 'var(--ink)', background: 'var(--bg)', borderRadius: 6, padding: '8px 12px' }}>{quote.notes}</div>
            </div>
          )}

          {quote.rejection_reason && (
            <div style={{ marginBottom: 16, background: '#fdecea', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#cf222e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Rejection Reason</div>
              <div style={{ fontSize: 13, color: '#cf222e' }}>{quote.rejection_reason}</div>
            </div>
          )}

          {/* Lines table */}
          {quote.lines && quote.lines.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Line Items</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['#', 'Description', 'Category', 'Qty', 'Unit Price', 'Tax%', 'Total'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--ink3)', fontSize: 11, borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quote.lines.map((l: any) => (
                      <tr key={l.line_number} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', color: 'var(--ink3)' }}>{l.line_number}</td>
                        <td style={{ padding: '6px 8px' }}>{l.description}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--ink3)' }}>{l.category}</td>
                        <td style={{ padding: '6px 8px' }}>{l.quantity}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)' }}>{fmt(l.unit_price, quote.currency)}</td>
                        <td style={{ padding: '6px 8px' }}>{l.tax_rate}%</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(l.line_total, quote.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Subtotal</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(quote.subtotal, quote.currency)}</span>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Tax</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(quote.tax_amount, quote.currency)}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, borderTop: '2px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Total</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{fmt(quote.total_amount, quote.currency)}</span>
            </div>
          </div>

          {quote.converted_shipment_id && (
            <div style={{ marginTop: 16, background: '#e0f5f5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--teal)' }}>
              Converted to Shipment ID: <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{quote.converted_shipment_id}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quote Modal (Create / Edit) ──────────────────────────────────────────────

function QuoteModal({
  editQuote, customers, onClose, onSaved,
}: {
  editQuote: any | null;
  customers: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(editQuote);

  const [form, setForm] = useState<any>(() => ({
    title:              editQuote?.title ?? '',
    customer_id:        editQuote?.customer_id ?? '',
    shipment_type:      editQuote?.shipment_type ?? 'SEA',
    currency:           editQuote?.currency ?? 'USD',
    origin_port:        editQuote?.origin_port ?? '',
    origin_city:        editQuote?.origin_city ?? '',
    destination_port:   editQuote?.destination_port ?? '',
    destination_city:   editQuote?.destination_city ?? '',
    valid_from:         toDateInput(editQuote?.valid_from),
    valid_until:        toDateInput(editQuote?.valid_until),
    goods_description:  editQuote?.goods_description ?? '',
    notes:              editQuote?.notes ?? '',
  }));

  const [lines, setLines] = useState<any[]>(() =>
    editQuote?.lines?.length
      ? editQuote.lines.map((l: any) => ({
          description: l.description,
          category:    l.category,
          quantity:    l.quantity,
          unit_price:  l.unit_price,
          tax_rate:    l.tax_rate,
        }))
      : [blankLine()]
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const [customerItem, setCustomerItem] = useState<PickerItem | null>(() => {
    const c = customers.find((c: any) => c.id === (editQuote?.customer_id ?? ''));
    return c ? { id: c.id, label: c.name, sublabel: c.email || c.phone || undefined } : null;
  });

  async function searchCustomersLocal(q: string): Promise<PickerItem[]> {
    const ql = q.trim().toLowerCase();
    // Excludes draft companies (active===false) — e.g. BRELA imports still
    // sitting in Company Directory that haven't been marked complete yet —
    // from every quote/sale customer picker.
    const usable = customers.filter((c: any) => c.active !== false);
    const filtered = ql
      ? usable.filter((c: any) => (c.name || '').toLowerCase().includes(ql) || (c.email || '').toLowerCase().includes(ql))
      : usable;
    return filtered.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || c.phone || undefined }));
  }

  async function createCustomerInline(name: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/customers', { method: 'POST', body: JSON.stringify({ name }) });
    customers.push(created);
    return { id: created.id, label: created.name };
  }

  function setField(key: string, val: string) {
    setForm((f: any) => ({ ...f, [key]: val }));
  }

  function setLine(idx: number, key: string, val: any) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  function addLine() {
    setLines(ls => [...ls, blankLine()]);
  }

  function removeLine(idx: number) {
    setLines(ls => ls.filter((_, i) => i !== idx));
  }

  // Computed totals
  const computed = lines.map(l => {
    const lt = Number(l.quantity) * Number(l.unit_price);
    const ta = lt * (Number(l.tax_rate) / 100);
    return { lineTotal: lt, taxAmount: ta };
  });
  const subtotal  = computed.reduce((s, c) => s + c.lineTotal, 0);
  const totalTax  = computed.reduce((s, c) => s + c.taxAmount, 0);
  const grandTotal = subtotal + totalTax;

  async function save() {
    if (!form.title.trim()) { setErr('Title is required'); return; }
    if (!form.customer_id)  { setErr('Customer is required'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...form, lines };
      if (isEdit) {
        await apiFetch(`/v1/quotations/${editQuote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/v1/quotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--border)', fontSize: 13,
    background: 'var(--bg)', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--ink3)',
    textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
      <div style={{ background: 'var(--white)', borderRadius: 12, width: 720, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        {/* Modal header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--white)', zIndex: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{isEdit ? 'Edit Quotation' : 'New Quotation'}</div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ padding: '22px 22px 8px' }}>
          {/* Row 1: Title */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => setField('title', e.target.value)} style={inputStyle} placeholder="e.g. Sea Freight Quote – Mombasa to Dar" />
          </div>

          {/* Row 2: Customer + Shipment Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Customer *</label>
              <EntityPicker
                value={customerItem}
                onChange={(item) => { setCustomerItem(item); setField('customer_id', item?.id ?? ''); }}
                search={searchCustomersLocal} onCreate={createCustomerInline}
                createLabel={(q) => `Create new customer "${q}"`}
                placeholder="Search customers…"
              />
            </div>
            <div>
              <label style={labelStyle}>Shipment Type</label>
              <Select value={form.shipment_type} onValueChange={v => setField('shipment_type', v)}>
                <SelectTrigger aria-label="Shipment Type" style={inputStyle}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Currency + Valid From + Valid Until */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Currency</label>
              <Select value={form.currency} onValueChange={v => setField('currency', v)}>
                <SelectTrigger aria-label="Currency" style={inputStyle}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={labelStyle}>Valid From</label>
              <DatePicker date={parseDateOnly(form.valid_from)} onChange={d => setField('valid_from', toDateOnlyString(d))} />
            </div>
            <div>
              <label style={labelStyle}>Valid Until</label>
              <DatePicker date={parseDateOnly(form.valid_until)} onChange={d => setField('valid_until', toDateOnlyString(d))} />
            </div>
          </div>

          {/* Row 4: Ports & Cities */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Origin Port</label>
              <input value={form.origin_port} onChange={e => setField('origin_port', e.target.value)} style={inputStyle} placeholder="e.g. Mombasa" />
            </div>
            <div>
              <label style={labelStyle}>Origin City</label>
              <input value={form.origin_city} onChange={e => setField('origin_city', e.target.value)} style={inputStyle} placeholder="e.g. Mombasa" />
            </div>
            <div>
              <label style={labelStyle}>Destination Port</label>
              <input value={form.destination_port} onChange={e => setField('destination_port', e.target.value)} style={inputStyle} placeholder="e.g. Dar es Salaam" />
            </div>
            <div>
              <label style={labelStyle}>Destination City</label>
              <input value={form.destination_city} onChange={e => setField('destination_city', e.target.value)} style={inputStyle} placeholder="e.g. Dar es Salaam" />
            </div>
          </div>

          {/* Row 5: Goods Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Goods Description</label>
            <textarea value={form.goods_description} onChange={e => setField('goods_description', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Brief description of goods…" />
          </div>

          {/* Row 6: Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Internal notes or client instructions…" />
          </div>

          {/* Line items */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Line Items</div>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: 'var(--ds-btn-py-sm) 10px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={addLine}>
                <Icon name="plus" size={12} /> Add Line
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Description', 'Category', 'Qty', 'Unit Price', 'Tax%', 'Total', ''].map((h, i) => (
                      <th key={i} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--ink3)', fontSize: 11, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const c = computed[idx];
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 6px', minWidth: 160 }}>
                          <input value={line.description} onChange={e => setLine(idx, 'description', e.target.value)}
                            style={{ ...inputStyle, padding: '4px 6px', fontSize: 12 }} placeholder="Description" />
                        </td>
                        <td style={{ padding: '4px 6px', minWidth: 110 }}>
                          <Select value={line.category} onValueChange={v => setLine(idx, 'category', v)}>
                            <SelectTrigger aria-label="Category" style={{ ...inputStyle, height: 'auto', padding: '4px 6px', fontSize: 12 }}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td style={{ padding: '4px 6px', minWidth: 60 }}>
                          <input type="number" min={1} aria-label="Quantity" value={line.quantity} onChange={e => setLine(idx, 'quantity', Number(e.target.value))}
                            style={{ ...inputStyle, padding: '4px 6px', fontSize: 12, width: 60 }} />
                        </td>
                        <td style={{ padding: '4px 6px', minWidth: 100 }}>
                          <input type="number" min={0} step="0.01" aria-label="Unit Price" value={line.unit_price} onChange={e => setLine(idx, 'unit_price', Number(e.target.value))}
                            style={{ ...inputStyle, padding: '4px 6px', fontSize: 12, width: 100 }} />
                        </td>
                        <td style={{ padding: '4px 6px', minWidth: 65 }}>
                          <Select value={String(line.tax_rate)} onValueChange={v => setLine(idx, 'tax_rate', Number(v))}>
                            <SelectTrigger aria-label="Tax Rate" style={{ ...inputStyle, height: 'auto', padding: '4px 6px', fontSize: 12, width: 65 }}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TAX_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 90 }}>
                          {fmt(c.lineTotal, form.currency)}
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          {lines.length > 1 && (
                            <button type="button" title="Remove line" onClick={() => removeLine(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}>
                              <Icon name="x" size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals summary */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginTop: 12, paddingRight: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Subtotal: <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>{fmt(subtotal, form.currency)}</span></div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Tax: <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>{fmt(totalTax, form.currency)}</span></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', borderTop: '2px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                Total: <span style={{ fontFamily: 'var(--mono)' }}>{fmt(grandTotal, form.currency)}</span>
              </div>
            </div>
          </div>

          {/* Error + footer */}
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 22 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Quotation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Sales Page ──────────────────────────────────────────────────────────

export const Sales: React.FC = () => {
  const isMobile = useIsMobile();
  const [quotes, setQuotes]       = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  // UI state
  const [showModal, setShowModal]       = useState(false);
  const [editQuote, setEditQuote]       = useState<any>(null);   // null = create, object = edit
  const [detailId, setDetailId]         = useState<string | null>(null);
  const [statusQuote, setStatusQuote]   = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [toast, setToast]               = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, kind: 'success' | 'error' = 'success') => setToast({ msg, kind });

  const loadQuotes = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/quotations')
      .then((d: any) => setQuotes(Array.isArray(d) ? d : d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  useEffect(() => {
    apiFetch('/v1/customers')
      .then((d: any) => setCustomers(Array.isArray(d) ? d : d.data ?? []))
      .catch(() => {});
  }, []);

  const byStage    = (key: string) => quotes.filter(q => q.status === key);
  const total      = quotes.reduce((s, q) => s + (q.total_amount || 0), 0);
  const won        = quotes.filter(q => q.status === 'CONVERTED').reduce((s, q) => s + (q.total_amount || 0), 0);
  const winRate    = quotes.length ? Math.round((byStage('CONVERTED').length / quotes.length) * 100) : 0;

  function openCreate() { setEditQuote(null); setShowModal(true); }
  function openEdit(q: any) { setEditQuote(q); setDetailId(null); setShowModal(true); }

  function openDelete(q: any) {
    setDetailId(null);
    setConfirmDelete(q);
  }

  async function doDelete() {
    const q = confirmDelete;
    setConfirmDelete(null);
    try {
      await apiFetch(`/v1/quotations/${q.id}`, { method: 'DELETE' });
      showToast('Quotation deleted');
      loadQuotes();
    } catch {
      showToast('Failed to delete quotation', 'error');
    }
  }

  async function doConvert(q: any) {
    setDetailId(null);
    try {
      await apiFetch(`/v1/quotations/${q.id}/convert`, { method: 'POST' });
      showToast('Converted to shipment successfully');
      loadQuotes();
    } catch (e: any) {
      showToast(e.message || 'Conversion failed', 'error');
    }
  }

  function onSaved() {
    setShowModal(false);
    setEditQuote(null);
    showToast(editQuote ? 'Quotation updated' : 'Quotation created');
    loadQuotes();
  }

  function onStatusDone(updated: any) {
    setStatusQuote(null);
    showToast('Status updated');
    loadQuotes();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: isMobile ? '12px 16px' : '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Sales Pipeline</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Track quotations from draft to conversion</div>
        </div>
        <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }} onClick={openCreate}>
          <Icon name="plus" size={15} /> New Quotation
        </button>
      </div>

      {/* KPI row */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <MetricsRow cards={[
          {
            title: 'Total Quotes',
            value: loading ? '—' : String(quotes.length),
            trend: 6.4,
            sub1Label: 'APPROVED', sub1Value: loading ? '—' : String(byStage('APPROVED').length),
            sub2Label: 'WIN RATE', sub2Value: loading ? '—' : `${winRate}%`,
            bars: spark(80, 15, 'up'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
          },
          {
            title: 'Converted',
            value: loading ? '—' : String(byStage('CONVERTED').length),
            trend: 14.2,
            sub1Label: 'THIS MONTH', sub1Value: loading ? '—' : String(Math.floor(byStage('CONVERTED').length * 0.4)),
            sub2Label: 'THIS WEEK',  sub2Value: loading ? '—' : String(Math.floor(byStage('CONVERTED').length * 0.1)),
            bars: spark(81, 15, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
          },
          {
            title: 'Pipeline Value',
            value: loading ? '—' : fmt(total),
            trend: 3.1,
            sub1Label: 'WON REVENUE', sub1Value: loading ? '—' : fmt(won),
            sub2Label: 'AVG DEAL',    sub2Value: loading || !quotes.length ? '—' : fmt(Math.round(total / quotes.length)),
            bars: spark(82, 15, 'flat'), barColor: 'var(--gold-l)', barHighlight: 'var(--gold)',
          },
        ]} />
      </div>

      {/* Pipeline kanban */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '16px 20px', display: 'flex', gap: 12 }}>
        {STAGES.map(stage => {
          const cards = byStage(stage.key);
          return (
            <div key={stage.key} style={{ width: 240, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>{stage.label}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>{cards.length}</span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
                {loading && <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 12, padding: 16 }}>…</div>}
                {!loading && cards.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 12, padding: 20, borderRadius: 9, border: '1px dashed var(--border)' }}>
                    Empty
                  </div>
                )}
                {cards.map(q => (
                  <div
                    key={q.id}
                    className="card"
                    style={{ padding: 12, cursor: 'pointer', borderLeft: `3px solid ${stage.color}` }}
                    onClick={() => setDetailId(q.id)}
                  >
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--teal)', marginBottom: 4 }}>{q.quote_number}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--ink)' }}>{q.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 6 }}>{q.customer_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
                        {fmt(q.total_amount, q.currency)}
                      </div>
                      {/* Quick action buttons on card */}
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => openEdit(q)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 3 }}
                        >
                          <Icon name="edit" size={13} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => openDelete(q)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 3 }}
                        >
                          <Icon name="trash2" size={13} />
                        </button>
                      </div>
                    </div>
                    {q.valid_until && (
                      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 4 }}>
                        Valid until {fmtDate(q.valid_until)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {detailId && (
        <DetailPanel
          quoteId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={q => { setDetailId(null); openEdit(q); }}
          onDelete={q => openDelete(q)}
          onStatusChange={q => { setDetailId(null); setStatusQuote(q); }}
          onConvert={q => doConvert(q)}
        />
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <QuoteModal
          editQuote={editQuote}
          customers={customers}
          onClose={() => { setShowModal(false); setEditQuote(null); }}
          onSaved={onSaved}
        />
      )}

      {/* Status change modal */}
      {statusQuote && (
        <StatusModal
          quote={statusQuote}
          onClose={() => setStatusQuote(null)}
          onDone={onStatusDone}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmDialog
          msg={`Delete "${confirmDelete.title}"? This cannot be undone.`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          msg={toast.msg}
          kind={toast.kind}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
