import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { BackButton } from '../components/ui/BackButton.js';
import { PageHeader } from '../components/PageHeader.js';

const CATS: Record<string, string> = {
  PORT_CHARGES: 'Port Charges', CUSTOMS_DUTY: 'Customs Duty', FREIGHT: 'Freight',
  HANDLING: 'Handling', TRANSPORT: 'Transport', INSPECTION_FEE: 'Inspection Fee',
  AGENT_FEE: 'Agent Fee', MISCELLANEOUS: 'Miscellaneous',
};

interface ShipmentOpt { id: string; ref_number?: string; bl_number?: string | null; customer_name?: string }
interface CustomerOpt { id: string; name: string }

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const FinanceExpenseNew: React.FC = () => {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<ShipmentOpt[]>([]);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  // Categories an admin added at Settings ▸ Finance ▸ Expenses Categories
  // (tenant_settings key 'expenses-categories') — merged in alongside the
  // built-in CATS so that screen's categories are actually selectable here,
  // not just persisted and ignored.
  const [customCats, setCustomCats] = useState<{ id: string; name: string }[]>([]);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('PORT_CHARGES');
  const [shipmentId, setShipmentId] = useState('');
  const [clientId, setClientId] = useState('');
  const [supplierItem, setSupplierItem] = useState<PickerItem | null>(null);
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [isRevenue, setIsRevenue] = useState(false);
  const [attachment, setAttachment] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/shipments').then((res: any) => setShipments(res?.data ?? res ?? [])).catch(() => setShipments([]));
    apiFetch('/v1/customers').then((res: any) => setCustomers(res?.data ?? res ?? [])).catch(() => setCustomers([]));
    apiFetch('/v1/settings').then((res: any) => setCustomCats(res?.settings?.['expenses-categories']?.categories ?? [])).catch(() => setCustomCats([]));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setAttachment(ev.target.result); };
    reader.readAsDataURL(file);
  }

  async function searchSuppliers(q: string): Promise<PickerItem[]> {
    const res: any = await apiFetch(`/v1/suppliers${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`).catch(() => []);
    const list = Array.isArray(res) ? res : [];
    return list.slice(0, 25).map((s: any) => ({ id: s.id, label: s.name, sublabel: s.email || undefined }));
  }

  async function createSupplier(name: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/suppliers', { method: 'POST', body: JSON.stringify({ name }) });
    return { id: created.id, label: created.name };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          name, amount: Number(amount), expense_date: date, category,
          shipment_id: shipmentId || undefined, customer_id: clientId || undefined,
          supplier_id: supplierItem?.id || undefined, payment_mode: paymentMode,
          reference: reference || undefined, note: note || undefined,
          is_revenue: isRevenue, attachment_data: attachment,
        }),
      });
      navigate('/finance/expenses');
    } catch (err: any) { setError(err.message || 'Failed to save expense'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <BackButton to="/finance/expenses" label="Expenses" />
      <PageHeader
        crumbs={['FinOps', 'Expenses', 'New']}
        titlePlain="New"
        titleEm="expense"
        subtitle="Record a cost or revenue line — link it to a shipment or customer if it belongs to one."
      />

      <form onSubmit={submit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Expense Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Forklift Hire" style={inputStyle} />
          </div>
          <div style={{ width: 140 }}>
            <label style={labelStyle}>Amount (TZS)</label>
            <input type="number" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Date</label>
            <DatePicker date={parseDateOnly(date)} onChange={d => setDate(toDateOnlyString(d))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                {customCats.filter(c => !(c.name in CATS)).map(c => <SelectItem key={`custom-${c.id}`} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Link to Shipment (Job)</label>
            <Combobox
              options={[{ value: '', label: '-- None --' }, ...shipments.map(s => ({ value: s.id, label: s.bl_number ? `BL: ${s.bl_number}` : s.ref_number || s.customer_name || 'Untitled shipment' }))]}
              value={shipmentId} onChange={setShipmentId} placeholder="-- None --"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Link to Client</label>
            <Combobox
              options={[{ value: '', label: '-- None --' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
              value={clientId} onChange={setClientId} placeholder="-- None --"
            />
          </div>
        </div>

        <EntityPicker
          label="Paid to Supplier (optional)" value={supplierItem} onChange={setSupplierItem}
          search={searchSuppliers} onCreate={createSupplier}
          createLabel={(q) => `Create new supplier "${q}"`}
          placeholder="Search suppliers…"
          hint="Link this expense to a supplier so it shows on their Vendors page."
        />

        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Payment Mode</label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Bank Transfer', 'Cash', 'Mobile Money', 'Cheque', 'Credit Card'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Reference #</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Receipt / Cheque no" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Attach Receipt (Image)</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1.5px dashed var(--border)', borderRadius: 9, cursor: 'pointer', background: 'var(--bg)' }}>
            {attachment ? (
              <>
                <img src={attachment} alt="Attachment" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>File attached! Click to change.</div>
              </>
            ) : (
              <>
                <div style={{ width: 40, height: 40, borderRadius: 4, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="upload" size={16} /></div>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Click to upload receipt image (PNG, JPG)</div>
              </>
            )}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </label>
        </div>

        <div>
          <label style={labelStyle}>Note / Description</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Optional notes about this expense..." />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={isRevenue} onChange={e => setIsRevenue(e.target.checked)} />
          Record as Revenue / Income instead
        </label>

        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Link to="/finance/expenses" style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
          <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {saving ? 'Saving…' : 'Save Expense'}
          </button>
        </div>
      </form>
    </div>
  );
};
