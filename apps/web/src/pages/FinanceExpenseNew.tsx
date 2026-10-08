import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { BackButton } from '../components/ui/BackButton.js';
import { PageHeader } from '../components/PageHeader.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Button } from '../components/ui/button.js';
import './FinanceIndustries.css';
import { SectionCard } from '../components/SectionCard.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';

const CATS: Record<string, string> = {
  PORT_CHARGES: 'Port Charges', CUSTOMS_DUTY: 'Customs Duty', FREIGHT: 'Freight',
  HANDLING: 'Handling', TRANSPORT: 'Transport', INSPECTION_FEE: 'Inspection Fee',
  AGENT_FEE: 'Agent Fee', MISCELLANEOUS: 'Miscellaneous',
};

interface ShipmentOpt { id: string; ref_number?: string; bl_number?: string | null; customer_name?: string }
interface CustomerOpt { id: string; name: string }

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const FinanceExpenseNew: React.FC = () => {
  const navigate = useNavigate();
  const financeConfiguration = useFinanceConfiguration();
  const financeCapabilities = useFinanceCapabilities();
  const canUseBusinessLines = financeCapabilities.isEnabled('finance.accounting.advanced');
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
  const [businessLineId, setBusinessLineId] = useState('');
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [isRevenue, setIsRevenue] = useState(false);
  const [attachment, setAttachment] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/shipments').then((res: any) => setShipments(res?.data ?? res ?? [])).catch(err => setError(err.message || 'Could not load shipments.'));
    apiFetch('/v1/customers').then((res: any) => setCustomers(res?.data ?? res ?? [])).catch(err => setError(err.message || 'Could not load CRM customers.'));
    apiFetch('/v1/settings').then((res: any) => setCustomCats(res?.settings?.['expenses-categories']?.categories ?? [])).catch(err => setError(err.message || 'Could not load expense categories.'));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setAttachment(ev.target.result); };
    reader.readAsDataURL(file);
  }

  async function searchSuppliers(q: string): Promise<PickerItem[]> {
    const res: any = await apiFetch(`/v1/suppliers${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`);
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
          business_line_id: canUseBusinessLines && businessLineId ? businessLineId : undefined,
          reference: reference || undefined, note: note || undefined,
          is_revenue: isRevenue, attachment_data: attachment,
        }),
      });
      navigate('/finance/expenses');
    } catch (err: any) { setError(err.message || 'Failed to save expense'); }
    finally { setSaving(false); }
  }

  return (
    <div className="industry-page">
      <BackButton to="/finance/expenses" label="Expenses" />
      <PageHeader
        crumbs={['Finance', 'Expenses', 'New']}
        titlePlain="New"
        titleEm="expense"
        subtitle="Record a cost or revenue line — link it to a shipment or customer if it belongs to one."
      />

      <SectionCard>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="industry-form-grid">
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Expense Name</label>
            <Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Forklift Hire"  />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Amount (TZS)</label>
            <Input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"  />
          </div>
        </div>

        <div className="industry-form-grid">
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

        <div className="industry-form-grid">
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

        {canUseBusinessLines && (
          <div>
            <label style={labelStyle}>Business Line (optional)</label>
            <Combobox
              options={(financeConfiguration.data?.businessLines ?? []).filter(line => line.active).map(line => ({ value: line.id, label: line.name, sublabel: line.code }))}
              value={businessLineId}
              onChange={setBusinessLineId}
              placeholder="Unassigned"
              searchPlaceholder="Search business lines…"
            />
          </div>
        )}

        <div className="industry-form-grid">
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
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Receipt / Cheque no"  />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Attach Receipt (Image)</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1.5px dashed var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', background: 'var(--bg)' }}>
            {attachment ? (
              <>
                <img src={attachment} alt="Attachment" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 'var(--r-sm)'}} />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>File attached! Click to change.</div>
              </>
            ) : (
              <>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="upload" size={16} /></div>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Click to upload receipt image (PNG, JPG)</div>
              </>
            )}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </label>
        </div>

        <div>
          <label style={labelStyle}>Note / Description</label>
          <Textarea value={note} onChange={e => setNote(e.target.value)}  placeholder="Optional notes about this expense..." />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <Checkbox checked={isRevenue} onCheckedChange={c => setIsRevenue(c === true)} />
          Record as Revenue / Income instead
        </label>

        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Button asChild variant="outline"><Link to="/finance/expenses">Cancel</Link></Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving�' : 'Save expense'}</Button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
};
