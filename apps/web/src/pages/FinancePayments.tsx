import React, { useState, useEffect, useCallback } from 'react';
import { FormPage } from '../components/FormPage.js';
import { PageHeader } from '../components/PageHeader.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { SectionCard } from '../components/SectionCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';

interface Payment {
  id: string;
  /** 'customer' = money received against an invoice; 'vendor' = money paid on a bill. */
  kind: 'customer' | 'vendor';
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  method: string | null;
  payment_date: string | null;
  note: string | null;
  logged_by: string | null;
  created_at: string;
  /** Invoice number (customer) or bill number (vendor). */
  document_number: string;
  /** Customer name (in) or supplier name (out). */
  party_name: string | null;
  invoice_id?: string;
  bill_id?: string;
}

interface InvoiceOption {
  id: string;
  invoice_number: string;
  client_name: string | null;
  bl_number: string | null;
  received: number;
}

// -- Detail Panel (Aside) -------------------------------------------------------
function PaymentDetailPanel({ payment, onClose, isMobile }: { payment: Payment; onClose: () => void; isMobile?: boolean }) {
  const { fmt } = useCurrency();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="fileText" size={18} color="var(--blue)" /> Payment
        </h2>
        <button type="button" onClick={onClose} style={{ background: 'var(--bg)', border: 'none', width: 'var(--ctl-h-xs)', height: 'var(--ctl-h-xs)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink3)' }}>
          <Icon name="x" size={16} strokeWidth={2} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Total Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: 20, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>{payment.direction === 'in' ? 'Amount Received' : 'Amount Paid'}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: payment.direction === 'in' ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font)', lineHeight: 1 }}>{payment.direction === 'in' ? '+' : '−'}{fmt(payment.amount, (payment.currency || 'TZS') as any)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>Date</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-GB') : '—'}</div>
          </div>
        </div>

        {/* Links */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>{payment.direction === 'in' ? 'Linked Invoice' : 'Linked Bill'}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', background: 'var(--blue-l)', padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-block' }}>
              {payment.document_number}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>{payment.direction === 'in' ? 'Linked Client' : 'Linked Supplier'}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', background: 'var(--green-l)', padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-block' }}>
              {payment.party_name || 'Unknown'}
            </div>
          </div>
        </div>

        {/* Details List */}
        <SectionCard title="Transaction Details" padded={false}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Payment Mode', value: payment.method || '—' },
              { label: 'Logged By', value: payment.logged_by || 'System' },
              { label: 'Recorded', value: new Date(payment.created_at).toLocaleString('en-GB') },
            ].map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Note */}
        {payment.note && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>Internal Note</div>
            <div style={{ padding: 16, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--gold)', lineHeight: 1.5 }}>
              {payment.note}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Main Page ------------------------------------------------------------------

export const FinancePayments: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/payments');
      setPayments(Array.isArray(res) ? res : []);
    } catch (err: any) {
      showAlert(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/invoices');
      setInvoices(Array.isArray(res) ? res.map((r: any) => ({ id: r.id, invoice_number: r.invoice_number, client_name: r.client_name, bl_number: r.bl_number, received: Number(r.received || 0) })) : []);
    } catch { /* invoice picker just stays empty */ }
  }, []);

  useEffect(() => { loadPayments(); loadInvoices(); }, [loadPayments, loadInvoices]);

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'payments') setShowAdd(true);
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  const isSplit = selectedPayment !== null;

  // Modal State
  const [fInvoice, setFInvoice] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fMode, setFMode] = useState('Bank Transfer');
  const [fNote, setFNote] = useState('');
  const [fFile, setFFile] = useState<File | null>(null);

  const selectedInvoice = invoices.find(i => i.id === fInvoice);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fInvoice || !fAmount) return;
    setSaving(true);

    try {
      await apiFetch(`/v1/invoices/${fInvoice}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount: parseFloat(fAmount), method: fMode, payment_date: fDate, note: fNote || undefined }),
      });

      // Attach the receipt/proof to the Cloud file manager (real backend —
      // find/create the client + BL folders, then upload into it).
      if (fFile && selectedInvoice) {
        try {
          const clientName = selectedInvoice.client_name || 'Unknown Client';
          const blNumber = selectedInvoice.bl_number || 'General';
          const allFiles: any[] = await apiFetch('/v1/files');
          const findFolder = (name: string, parentId: string | null) =>
            allFiles.find(f => f.type === 'folder' && !f.is_trash && f.name === name && f.parent_id === parentId);

          let clientFolder = findFolder(clientName, null);
          if (!clientFolder) clientFolder = await apiFetch('/v1/files/folder', { method: 'POST', body: JSON.stringify({ name: clientName, parent_id: null, color: 'var(--purple)' }) });

          let blFolder = findFolder(blNumber, clientFolder.id);
          if (!blFolder) blFolder = await apiFetch('/v1/files/folder', { method: 'POST', body: JSON.stringify({ name: blNumber, parent_id: clientFolder.id, color: 'var(--gold)' }) });

          const form = new FormData();
          form.append('file', fFile);
          await apiFetch(`/v1/files/upload?parent_id=${encodeURIComponent(blFolder.id)}`, { method: 'POST', body: form });
        } catch (err: any) {
          showAlert(err.message || 'Payment recorded, but failed to attach receipt to Cloud files');
        }
      }

      setShowAdd(false);
      setFInvoice(''); setFAmount(''); setFNote(''); setFMode('Bank Transfer'); setFFile(null);
      loadPayments();
      loadInvoices();
    } catch (err: any) {
      showAlert(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const filtered = payments.filter(p => {
    const matchesTab = activeTab === 'ALL'
      || (activeTab === 'IN' && p.direction === 'in')
      || (activeTab === 'OUT' && p.direction === 'out');
    const matchesSearch = !search ||
      p.document_number?.toLowerCase().includes(search.toLowerCase()) ||
      (p.party_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.method || '').toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Money in (customer receipts) vs money out (supplier payments), and the net.
  const inRows = payments.filter(p => p.direction === 'in');
  const outRows = payments.filter(p => p.direction === 'out');
  const inTotal = inRows.reduce((sum, p) => sum + Number(p.amount), 0);
  const outTotal = outRows.reduce((sum, p) => sum + Number(p.amount), 0);
  const netTotal = inTotal - outTotal;

  const thisMonth = payments.filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const paymentColumns: TableColumn<Payment>[] = [
    {
      key: 'document', header: 'Document', accessor: 'document_number', sortable: true,
      render: payment => <div className="flex items-center gap-2"><Badge variant={payment.direction === 'in' ? 'info' : 'warning'}>{payment.direction === 'in' ? 'Received' : 'Paid'}</Badge><span className="font-semibold text-foreground">{payment.document_number}</span></div>,
    },
    { key: 'party', header: 'Party', accessor: 'party_name', sortable: true, render: payment => payment.party_name || 'Unknown' },
    ...(!isSplit ? [{ key: 'method', header: 'Mode', accessor: 'method' as keyof Payment, sortable: true, render: (payment: Payment) => payment.method || '—' }] : []),
    { key: 'date', header: 'Date', accessor: 'payment_date', sortable: true, hideAt: 'sm' as const, render: payment => payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-GB') : '—' },
    { key: 'amount', header: 'Amount', accessor: 'amount', sortable: true, align: 'right' as const, render: payment => <span className={payment.direction === 'in' ? 'font-bold text-[var(--green)]' : 'font-bold text-[var(--red)]'}>{payment.direction === 'in' ? '+' : '−'}{fmt(Number(payment.amount), (payment.currency || 'TZS') as any)}</span> },
  ];

  // Full page, matching Quotations: the form replaces the list rather than
  // floating over it. Submit stays on the <form> so Enter still saves.
  if (showAdd) {
    return (
      <FormPage
        title="Record Payment"
        subtitle="Match a received payment against an invoice and attach its proof."
        onCancel={() => setShowAdd(false)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</button>
            <button type="submit" form="payment-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
          </>
        }
      >
        <form id="payment-form" onSubmit={handleSave} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Select Invoice</label>
                <Combobox
                  options={invoices.map(inv => ({ value: inv.id, label: `${inv.invoice_number} - ${inv.client_name || 'Unknown'}` }))}
                  value={fInvoice} onChange={setFInvoice} placeholder="-- Choose Invoice --"
                />
                {selectedInvoice && (
                  <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>
                    Linked Client: <strong>{selectedInvoice.client_name || 'Unknown'}</strong>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Amount (TZS)</label>
                  <input type="number" className="input-field" value={fAmount} onChange={e => setFAmount(e.target.value)} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Date</label>
                  <DatePicker date={parseDateOnly(fDate)} onChange={d => setFDate(toDateOnlyString(d))} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Payment Mode</label>
                <Select value={fMode} onValueChange={setFMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Internal Note</label>
                <textarea className="input-field" rows={2} value={fNote} onChange={e => setFNote(e.target.value)}></textarea>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Proof of Payment (Receipt / Docs)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="file" id="fFile" style={{ display: 'none' }} onChange={e => setFFile(e.target.files?.[0] || null)} />
                  <button type="button" onClick={() => document.getElementById('fFile')?.click()} style={{ padding: 'var(--ds-btn-py) 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    <Icon name="upload" size={14} /> {fFile ? 'Change File' : 'Upload File'}
                  </button>
                  {fFile && <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fFile.name}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>File will automatically be saved to File Manager &gt; Client Folder &gt; BL Number.</div>
              </div>
        </form>
      </FormPage>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      {/* -- Header -- */}
      <div style={{ padding: 0 }}>
        <PageHeader
          crumbs={['FINANCE', 'PAYMENTS']}
          titlePlain="Payment"
          titleEm="transactions"
          subtitle="Every payment in and out — customer receipts against invoices and supplier payments against bills."
        />

        <MetricsRow cards={[
          {
            title: 'MONEY IN',
            value: fmt(inTotal, 'TZS'),
            sub1Label: 'RECEIPTS', sub1Value: String(inRows.length),
            sub2Label: 'THIS MONTH', sub2Value: String(thisMonth),
            barHighlight: 'var(--green)'
          },
          {
            title: 'MONEY OUT',
            value: fmt(outTotal, 'TZS'),
            sub1Label: 'PAYMENTS', sub1Value: String(outRows.length),
            sub2Label: 'OUTBOUND', sub2Value: String(outRows.length),
            barHighlight: 'var(--red)'
          },
          {
            title: 'NET POSITION',
            value: fmt(netTotal, 'TZS'),
            sub1Label: netTotal >= 0 ? 'SURPLUS' : 'DEFICIT', sub1Value: netTotal >= 0 ? 'IN' : 'OUT',
            sub2Label: 'STATUS', sub2Value: netTotal >= 0 ? 'NET POSITIVE' : 'NET NEGATIVE',
            barHighlight: netTotal >= 0 ? 'var(--teal)' : 'var(--gold)'
          },
          {
            title: 'ALL MOVEMENTS',
            value: String(payments.length),
            sub1Label: 'INBOUND', sub1Value: String(inRows.length),
            sub2Label: 'OUTBOUND', sub2Value: String(outRows.length),
            barHighlight: 'var(--blue)'
          },
        ]} />
      </div>

      {/* -- Main Content Area -- */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', marginTop: 16 }}>

        {/* -- Left: List -- */}
        <div style={{ flex: 1, display: isSplit ? 'none' : 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="ALL">All ({payments.length})</TabsTrigger>
                  <TabsTrigger value="IN">Received ({inRows.length})</TabsTrigger>
                  <TabsTrigger value="OUT">Paid ({outRows.length})</TabsTrigger>
                </TabsList>
              </Tabs>

              <SearchToolbar
                search={search}
                onSearch={setSearch}
                placeholder="Search payments…"
                actions={<Button size="sm" onClick={() => setShowAdd(true)}><Icon name="plus" size={14} /> Record payment</Button>}
              />
            </div>

            <DataTable
              columns={paymentColumns}
              rows={filtered}
              loading={loading}
              filteredEmpty={(!!search || activeTab !== 'ALL') && filtered.length === 0}
              empty={!loading && payments.length === 0}
              emptyIcon="creditCard"
              emptyTitle="No payment transactions"
              emptyMessage="Customer receipts and supplier payments appear here after they are recorded."
              defaultSortKey="date"
              defaultSortDir="desc"
              pageSize={15}
              onRowClick={setSelectedPayment}
            />
          </div>
        </div>

        {/* -- Right: Aside Detail Panel -- */}
        {isSplit && selectedPayment && (
          <PaymentDetailPanel
            payment={selectedPayment}
            onClose={() => setSelectedPayment(null)}
            isMobile={isMobile}
          />
        )}
      </div>

    </div>
  );
};
