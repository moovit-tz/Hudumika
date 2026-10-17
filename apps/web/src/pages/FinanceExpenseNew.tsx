import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { BackButton } from '../components/ui/BackButton.js';
import { PageHeader } from '../components/PageHeader.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Button } from '../components/ui/button.js';
import { ButtonSpinner } from '../components/ui/spinner.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { cn } from '../lib/utils.js';
import './FinanceExpenseNew.css';

const CATS: Record<string, string> = {
  PORT_CHARGES: 'Port Charges',
  CUSTOMS_DUTY: 'Customs Duty',
  FREIGHT: 'Freight',
  HANDLING: 'Handling',
  TRANSPORT: 'Transport',
  INSPECTION_FEE: 'Inspection Fee',
  AGENT_FEE: 'Agent Fee',
  MISCELLANEOUS: 'Miscellaneous',
};

interface ShipmentOpt {
  id: string;
  ref_number?: string;
  bl_number?: string | null;
  customer_name?: string;
}

interface CustomerOpt {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export const FinanceExpenseNew: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSupplierId = searchParams.get('supplier_id');

  const { currency, fmt } = useCurrency();
  const financeConfiguration = useFinanceConfiguration();
  const financeCapabilities = useFinanceCapabilities();
  const canUseBusinessLines = financeCapabilities.isEnabled('finance.accounting.advanced');

  const [shipments, setShipments] = useState<ShipmentOpt[]>([]);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [customCats, setCustomCats] = useState<{ id: string; name: string }[]>([]);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('__none__');
  const [shipmentId, setShipmentId] = useState('');
  const [clientId, setClientId] = useState('');
  const [supplierItem, setSupplierItem] = useState<PickerItem | null>(null);
  const [businessLineId, setBusinessLineId] = useState('');
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [attachment, setAttachment] = useState<string | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/shipments')
      .then((res: any) => setShipments(res?.data ?? res ?? []))
      .catch(() => {});

    apiFetch('/v1/customers')
      .then((res: any) => setCustomers(res?.data ?? res ?? []))
      .catch(() => {});

    apiFetch('/v1/settings')
      .then((res: any) => setCustomCats(res?.settings?.['expenses-categories']?.categories ?? []))
      .catch(() => {});

    if (preselectedSupplierId) {
      apiFetch(`/v1/suppliers/${preselectedSupplierId}`).then((s: any) => {
        if (s?.id) {
          setSupplierItem({
            id: s.id,
            label: s.name,
            sublabel: s.email || undefined,
            avatarUserId: s.id,
            avatarKind: 'suppliers',
            avatarType: 'company',
            avatarUrl: s.avatar_url || s.logo_url || undefined,
          });
        }
      }).catch(() => {});
    }
  }, [preselectedSupplierId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function processFile(file: File) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Please attach an image (PNG, JPG, WEBP) or a PDF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        setAttachment(ev.target.result);
        setError('');
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave() { setIsDragging(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function searchSuppliers(q: string): Promise<PickerItem[]> {
    const res: any = await apiFetch(`/v1/suppliers${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`);
    const list = Array.isArray(res) ? res : [];
    return list.slice(0, 25).map((s: any) => ({
      id: s.id,
      label: s.name,
      sublabel: s.email || undefined,
      avatarUserId: s.id,
      avatarKind: 'suppliers' as const,
      avatarType: 'company' as const,
      avatarUrl: s.avatar_url || s.logo_url || undefined,
    }));
  }

  async function createSupplier(supplierName: string): Promise<PickerItem> {
    const created = await apiFetch('/v1/suppliers', { method: 'POST', body: JSON.stringify({ name: supplierName }) });
    return { id: created.id, label: created.name };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Enter a name for this expense.'); return; }
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) { setError('Enter a valid amount.'); return; }
    const catValue = category === '__none__' ? 'MISCELLANEOUS' : category;

    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          amount: numAmount,
          expense_date: date,
          category: catValue,
          shipment_id: shipmentId || undefined,
          customer_id: clientId || undefined,
          supplier_id: supplierItem?.id || undefined,
          payment_mode: paymentMode,
          business_line_id: canUseBusinessLines && businessLineId ? businessLineId : undefined,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
          is_revenue: false,
          attachment_data: attachment,
        }),
      });
      navigate('/finance/expenses');
    } catch (err: any) {
      setError(err.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  }

  const numAmount = Number(amount) || 0;
  const selectedShipment = shipments.find(s => s.id === shipmentId);
  const categoryLabel = category === '__none__' ? 'Uncategorised' : (CATS[category] || customCats.find(c => c.name === category)?.name || category);

  return (
    <div className="expense-new-page">
      <BackButton to="/finance/expenses" label="Expenses" />

      <PageHeader
        crumbs={['Finance', 'Expenses']}
        titlePlain="New"
        titleEm="expense"
        subtitle="Operational cost with optional job, client, and supplier allocation."
      />

      {/* Hero Live Snapshot */}
      <div className="expense-hero-card">
        <div className="expense-hero-left">
          <span className="expense-hero-label">Total Expense Amount</span>
          <div className="expense-hero-val">
            <span>{fmt(numAmount)}</span>
            <span className="expense-hero-currency">{currency}</span>
          </div>
        </div>

        <div className="expense-hero-chips">
          <span className="expense-hero-chip teal">
            <Icon name="tag" size={12} />
            <span>{categoryLabel}</span>
          </span>
          <span className="expense-hero-chip">
            <Icon name="creditCard" size={12} />
            <span>{paymentMode}</span>
          </span>
          {selectedShipment && (
            <span className="expense-hero-chip">
              <Icon name="truck" size={12} />
              <span>Job: {selectedShipment.ref_number || selectedShipment.bl_number || 'Linked'}</span>
            </span>
          )}
          {supplierItem && (
            <span className="expense-hero-chip">
              <Icon name="user" size={12} />
              <span>Vendor: {supplierItem.label}</span>
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="expense-error-bar">
          <Icon name="alertTriangle" size={15} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="expense-error-dismiss">
            <Icon name="close" size={13} />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="expense-form">
        {/* ── What & how much ── */}
        <div className="expense-section-card">
          <div className="expense-section-header">
            <Icon name="receipt" size={15} className="expense-section-icon" />
            <h3 className="expense-section-title">Transaction</h3>
          </div>

          <div className="expense-form-grid">
            <div className="expense-field">
              <label className="expense-field-label">Description <span className="req">*</span></label>
              <Input
                required value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Forklift hire, port storage, agency fee"
              />
            </div>
            <div className="expense-field">
              <label className="expense-field-label">Amount ({currency}) <span className="req">*</span></label>
              <div className="expense-amount-wrap">
                <span className="expense-amount-badge">{currency}</span>
                <Input
                  type="number" min="0.01" step="0.01" required
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="expense-amount-input"
                />
              </div>
            </div>
          </div>

          <div className="expense-form-grid">
            <div className="expense-field">
              <label className="expense-field-label">Date <span className="req">*</span></label>
              <DatePicker date={parseDateOnly(date)} onChange={d => setDate(toDateOnlyString(d))} />
            </div>
            <div className="expense-field">
              <label className="expense-field-label">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Uncategorised</SelectItem>
                  {Object.entries(CATS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                  {customCats.filter(c => !(c.name in CATS)).map(c => (
                    <SelectItem key={`custom-${c.id}`} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── Link to job / client / vendor ── */}
        <div className="expense-section-card">
          <div className="expense-section-header">
            <Icon name="link" size={15} className="expense-section-icon" />
            <h3 className="expense-section-title">Allocation</h3>
          </div>

          <div className="expense-form-grid">
            <div className="expense-field">
              <label className="expense-field-label">Shipment (Job)</label>
              <Combobox
                options={[
                  { value: '', label: 'None' },
                  ...shipments.map(s => ({
                    value: s.id,
                    label: s.ref_number || (s.bl_number ? `BL: ${s.bl_number}` : s.customer_name || 'Shipment'),
                    sublabel: [s.bl_number && s.ref_number ? `BL: ${s.bl_number}` : null, s.customer_name].filter(Boolean).join(' · ') || undefined,
                  })),
                ]}
                value={shipmentId} onChange={setShipmentId}
                placeholder="None" searchPlaceholder="Search jobs…"
              />
            </div>
            <div className="expense-field">
              <label className="expense-field-label">Client</label>
              <Combobox
                options={[
                  { value: '', label: 'None' },
                  ...customers.map(c => ({ value: c.id, label: c.name, sublabel: c.email || c.phone || undefined })),
                ]}
                value={clientId} onChange={setClientId}
                placeholder="None" searchPlaceholder="Search clients…"
              />
            </div>
          </div>

          <div className={cn("expense-form-grid", !canUseBusinessLines && "expense-form-grid--single")}>
            <div className="expense-field">
              <EntityPicker
                label="Supplier / Vendor"
                value={supplierItem} onChange={setSupplierItem}
                search={searchSuppliers} onCreate={createSupplier}
                createLabel={(q) => `Add "${q}" as new supplier`}
                placeholder="Search suppliers…"
              />
            </div>
            {canUseBusinessLines && (
              <div className="expense-field">
                <label className="expense-field-label">Business Line</label>
                <Combobox
                  options={(financeConfiguration.data?.businessLines ?? [])
                    .filter(line => line.active)
                    .map(line => ({ value: line.id, label: line.name, sublabel: line.code }))}
                  value={businessLineId} onChange={setBusinessLineId}
                  placeholder="None" searchPlaceholder="Search…"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Payment & evidence ── */}
        <div className="expense-section-card">
          <div className="expense-section-header">
            <Icon name="creditCard" size={15} className="expense-section-icon" />
            <h3 className="expense-section-title">Payment & receipt</h3>
          </div>

          <div className="expense-form-grid">
            <div className="expense-field">
              <label className="expense-field-label">Payment method</label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Bank Transfer', 'Cash', 'Mobile Money', 'Cheque', 'Credit Card'].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="expense-field">
              <label className="expense-field-label">Reference #</label>
              <Input
                value={reference} onChange={e => setReference(e.target.value)}
                placeholder="Receipt, cheque, or transfer ref"
              />
            </div>
          </div>

          <div className="expense-field">
            <label className="expense-field-label">Receipt / voucher</label>
            {attachment ? (
              <div className="expense-attachment-card">
                <img src={attachment} alt="Receipt" className="expense-attachment-thumb" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="check" size={13} />
                    Receipt attached
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={{ cursor: 'pointer' }}>
                    <Button type="button" variant="outline" size="sm" asChild><span>Replace</span></Button>
                    <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFileChange} />
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAttachment(undefined)} title="Remove">
                    <Icon name="trash" size={14} />
                  </Button>
                </div>
              </div>
            ) : (
              <label
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                className={cn("expense-dropzone", isDragging && "expense-dropzone--active")}
              >
                <div className="expense-dropzone-icon"><Icon name="upload" size={16} /></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  Click or drag to attach a receipt
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>PNG, JPG, WEBP or PDF</div>
                <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFileChange} />
              </label>
            )}
          </div>

          <div className="expense-field">
            <label className="expense-field-label">Notes</label>
            <Textarea
              rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Optional context — container number, approval reference, etc."
            />
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="expense-actions-bar">
          <Button asChild variant="outline" type="button" disabled={saving}>
            <Link to="/finance/expenses">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving} style={{ minWidth: 130 }}>
            {saving ? <><ButtonSpinner /><span>Saving…</span></> : <><Icon name="check" size={15} /><span>Save expense</span></>}
          </Button>
        </div>
      </form>
    </div>
  );
};
