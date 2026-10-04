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
import { SectionCard } from '../components/SectionCard.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';

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
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-120 sm:max-w-120 flex flex-col p-0 gap-0">
        <SheetHeader style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <SheetTitle style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{initial ? 'Edit Recurring Invoice' : 'New Recurring Invoice'}</SheetTitle>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Auto-generates invoices on schedule</div>
        </SheetHeader>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Template Name *</label><Input type="text" placeholder="e.g. Monthly Retainer" value={name} onChange={e => setName(e.target.value)} /></div>
          <div style={{ marginBottom: 14 }}>
            <EntityPicker label="Customer *" value={customerItem} onChange={handleCustomerChange} search={searchCustomers} onCreate={createCustomerInline} createLabel={q => `Create new customer "${q}"`} placeholder="Search customers…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Frequency</label><Select value={frequency} onValueChange={v => setFrequency(v as Freq)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(FREQ_LABEL) as Freq[]).map(f => <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}</SelectContent></Select></div>
            <div><label style={lbl}>Currency</label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['TZS', 'USD', 'KES', 'EUR', 'GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Amount</label><Input type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} /></div>
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
          <div style={{ marginBottom: 14 }}><label style={lbl}>Payment terms</label><Input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} /></div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Description</label><Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className="resize-y" /></div>
          <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--ink2)' }}>
            Total per cycle: <strong style={{ color: 'var(--teal)' }}>{currency} {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
          </div>
        </div>
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save Template'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function RecurringInvoices() {
  const { fmt } = useCurrency();
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringInvoice | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string | null>(null);

  const load = () => apiFetch('/v1/invoices/recurring').then((d: any) => { if (Array.isArray(d)) setRecurring(d.map(mapApi)); }).catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not load recurring invoices.')).finally(() => setLoading(false));
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
    try {
      await apiFetch(`/v1/invoices/recurring/${r.id}`, { method: 'PATCH', body: JSON.stringify({ state: nextState }) });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not update this template.');
    }
  }

  async function handleDelete(r: RecurringInvoice) {
    if (!(await showConfirm(`Delete the recurring template "${r.name}"? This does not affect invoices already generated.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/invoices/recurring/${r.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not delete this template.');
    }
  }

  const totalMonthly = recurring.filter(r => r.frequency === 'MONTHLY' && r.state === 'ACTIVE').reduce((a, r) => a + r.amount * (1 + r.tax_rate / 100), 0);
  const activeCount = recurring.filter(r => r.state === 'ACTIVE').length;
  const pausedCount = recurring.filter(r => r.state === 'PAUSED').length;
  const invoicesGenerated = recurring.reduce((s, r) => s + r.invoices_generated, 0);
  const totalBilled = recurring.reduce((s, r) => s + r.total_billed, 0);
  const query = search.trim().toLowerCase();
  const filtered = recurring.filter(r => {
    const matchesQuery = !query || [r.name, r.client_name, r.description, r.frequency].some(value => value?.toLowerCase().includes(query));
    return matchesQuery && (!stateFilter || r.state === stateFilter);
  });

  const columns: TableColumn<RecurringInvoice>[] = [
    {
      key: 'template', header: 'Template', accessor: 'name', sortable: true,
      render: r => <div><div className="font-semibold text-foreground">{r.name}</div>{r.description && <div className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground">{r.description}</div>}</div>,
    },
    { key: 'customer', header: 'Customer', accessor: 'client_name', sortable: true, render: r => r.client_name || 'Unassigned' },
    { key: 'frequency', header: 'Frequency', accessor: 'frequency', sortable: true, hideAt: 'sm', render: r => FREQ_LABEL[r.frequency] },
    { key: 'amount', header: 'Amount', align: 'right', render: r => <span className="font-semibold text-foreground">{fmt(r.amount * (1 + r.tax_rate / 100), r.currency)}</span> },
    {
      key: 'due', header: 'Next due', accessor: 'next_due', sortable: true,
      render: r => {
        const dueDate = r.next_due ? new Date(r.next_due) : null;
        const dueSoon = dueDate && r.state === 'ACTIVE' && dueDate.getTime() >= Date.now() && dueDate.getTime() - Date.now() < 14 * 86400000;
        return <div className={dueSoon ? 'font-semibold text-[var(--gold)]' : ''}>{dueDate ? dueDate.toLocaleDateString('en-GB') : '—'}{dueSoon && <div className="text-xs">Due soon</div>}</div>;
      },
    },
    { key: 'invoices', header: 'Invoices', accessor: 'invoices_generated', sortable: true, align: 'center', hideAt: 'md' },
    { key: 'state', header: 'State', accessor: 'state', sortable: true, render: r => <Badge variant={r.state === 'ACTIVE' ? 'success' : r.state === 'PAUSED' ? 'warning' : 'gray'}>{r.state}</Badge> },
    {
      key: 'actions', header: '', width: 48, align: 'right',
      render: r => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${r.name || 'recurring invoice'}`}><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={r.state !== 'ACTIVE' || generatingId === r.id} onSelect={() => handleGenerate(r)}><Icon name="zap" size={15} />Generate invoice</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setEditing(r); setShowForm(true); }}><Icon name="edit" size={15} />Edit template</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleToggle(r)}><Icon name={r.state === 'ACTIVE' ? 'pause' : 'chevronRight'} size={15} />{r.state === 'ACTIVE' ? 'Pause' : 'Resume'}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => handleDelete(r)}><Icon name="trash" size={15} />Delete template</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
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

      <div className="py-4">
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search templates, customers, or frequency…"
          quickFilter={{
            label: 'State', value: stateFilter, onChange: setStateFilter, allLabel: 'All states',
            options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'PAUSED', label: 'Paused' }, { value: 'ENDED', label: 'Ended' }],
          }}
          actions={<><Button asChild variant="outline" size="sm"><Link to="/finance/invoices"><Icon name="arrowLeft" size={13} />All invoices</Link></Button><Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}><Icon name="plus" size={14} />New template</Button></>}
        />
      </div>

      <SectionCard collapsible={false} padded={false}>
        <DataTable
          columns={columns}
          rows={filtered}
          loading={loading}
          filteredEmpty={(!!query || !!stateFilter) && filtered.length === 0}
          empty={!loading && recurring.length === 0}
          emptyIcon="refresh"
          emptyTitle="No recurring invoices"
          emptyMessage="Create a template to generate invoices automatically on a schedule."
          emptyAction={{ label: 'New template', onClick: () => { setEditing(null); setShowForm(true); } }}
          defaultSortKey="due"
          defaultSortDir="asc"
          pageSize={12}
        />
      </SectionCard>

      {showForm && <RecurFormPanel initial={editing} onSave={handleSave} onClose={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}
