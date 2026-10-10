import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FormPage } from '../components/FormPage.js';
import { PageHeader } from '../components/PageHeader.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { formatAmount } from '../lib/currency.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { SectionCard } from '../components/SectionCard.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { PaginationBar } from '../components/PaginationBar.js';

interface Payment {
  id: string;
  kind: 'customer' | 'vendor';
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  method: string | null;
  payment_date: string | null;
  note: string | null;
  logged_by: string | null;
  created_at: string;
  document_number: string;
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
  currency: string;
}

interface PaymentStats {
  money_in: { currency: string; count: number; total: number }[];
  money_out: { currency: string; count: number; total: number }[];
  this_month_count: number;
}

function PaymentDetailPanel({ payment, onClose, isMobile }: { payment: Payment; onClose: () => void; isMobile?: boolean }) {
  const fmt = formatAmount;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="fileText" size={18} color="var(--blue)" /> Payment
        </h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Close payment details" onClick={onClose}>
          <Icon name="x" size={16} strokeWidth={2} />
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
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

        <SectionCard title="Transaction Details" padded={false}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Payment Mode', value: payment.method || '—' },
              { label: 'Logged By', value: payment.logged_by || 'System' },
              { label: 'Recorded', value: new Date(payment.created_at).toLocaleString('en-GB') },
            ].map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

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

export const FinancePayments: React.FC = () => {
  const isMobile = useIsMobile();
  const { currency: baseCurrency } = useCurrency();
  const fmt = formatAmount;
  const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const loadIdRef = useRef(0);

  const loadPayments = useCallback(async () => {
    const id = ++loadIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search.trim()) params.set('search', search.trim());
      if (activeTab === 'IN') params.set('direction', 'in');
      if (activeTab === 'OUT') params.set('direction', 'out');
      if (selectedCurrency) params.set('currency', selectedCurrency);
      const res = await apiFetch(`/v1/payments?${params}`);
      if (id !== loadIdRef.current) return;
      if (res && typeof res === 'object' && 'items' in res) {
        setPayments(res.items as Payment[]);
        setTotalItems(res.total as number);
      } else {
        setPayments(Array.isArray(res) ? res : []);
        setTotalItems(Array.isArray(res) ? res.length : 0);
      }
    } catch (err: any) {
      if (id !== loadIdRef.current) return;
      showAlert(err.message || 'Failed to load payments');
    } finally {
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [page, pageSize, search, activeTab, selectedCurrency]);

  const loadStats = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/payments/stats');
      setStats(res as PaymentStats);
    } catch { /* stats are non-critical */ }
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/invoices?page=1&page_size=100');
      const items = (res && 'items' in (res as any)) ? (res as any).items : (Array.isArray(res) ? res : []);
      setInvoices(items.map((r: any) => ({ id: r.id, invoice_number: r.invoice_number, client_name: r.client_name, bl_number: r.bl_number, received: Number(r.received || 0), currency: r.currency || 'TZS' })));
    } catch (err) { showAlert(err instanceof Error ? err.message : 'Could not load invoices.'); }
  }, []);

  useEffect(() => { loadStats(); loadInvoices(); }, [loadStats, loadInvoices]);
  useEffect(() => { const t = setTimeout(() => { loadPayments(); }, 250); return () => clearTimeout(t); }, [loadPayments]);

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'payments') setShowAdd(true);
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  const isSplit = selectedPayment !== null;

  const [fInvoice, setFInvoice] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fMode, setFMode] = useState('Bank Transfer');
  const [fNote, setFNote] = useState('');
  const [fFile, setFFile] = useState<File | null>(null);

  const selectedInvoice = invoices.find(i => i.id === fInvoice);

  const paymentAttempt = useRef<{ signature: string; key: string } | null>(null);
  const paymentBusy = useRef(false);
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fInvoice || !fAmount || paymentBusy.current) return;
    const signature = JSON.stringify([fInvoice, fAmount, fMode, fDate, fNote]);
    if (paymentAttempt.current?.signature !== signature) paymentAttempt.current = { signature, key: crypto.randomUUID() };
    paymentBusy.current = true;
    setSaving(true);

    try {
      await apiFetch(`/v1/invoices/${fInvoice}/payment`, {
        method: 'POST', headers: { 'Idempotency-Key': paymentAttempt.current.key },
        body: JSON.stringify({ amount: parseFloat(fAmount), method: fMode, payment_date: fDate, note: fNote || undefined }),
      });

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

      paymentAttempt.current = null;
      setShowAdd(false);
      setFInvoice(''); setFAmount(''); setFNote(''); setFMode('Bank Transfer'); setFFile(null);
      loadPayments();
      loadStats();
      loadInvoices();
    } catch (err: any) {
      showAlert(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
      paymentBusy.current = false;
    }
  };

  // Derive summary from stats (server-aggregated, not local list).
  const inStat = stats?.money_in.find(s => s.currency === selectedCurrency);
  const outStat = stats?.money_out.find(s => s.currency === selectedCurrency);
  const inTotal = inStat?.total ?? 0;
  const inCount = inStat?.count ?? 0;
  const outTotal = outStat?.total ?? 0;
  const outCount = outStat?.count ?? 0;
  const netTotal = inTotal - outTotal;
  const thisMonth = stats?.this_month_count ?? 0;
  const allCurrencies = [...new Set([
    baseCurrency,
    ...(stats?.money_in.map(s => s.currency) ?? []),
    ...(stats?.money_out.map(s => s.currency) ?? []),
  ])].sort();

  const paymentColumns = [
    {
      key: 'document', header: 'Document', accessor: 'document_number' as keyof Payment, sortable: true,
      render: (payment: Payment) => <div className="flex items-center gap-2"><Badge variant={payment.direction === 'in' ? 'info' : 'warning'}>{payment.direction === 'in' ? 'Received' : 'Paid'}</Badge><span className="font-semibold text-foreground">{payment.document_number}</span></div>,
    },
    { key: 'party', header: 'Party', accessor: 'party_name' as keyof Payment, sortable: true, render: (payment: Payment) => payment.party_name || 'Unknown' },
    ...(!isSplit ? [{ key: 'method', header: 'Mode', accessor: 'method' as keyof Payment, sortable: true, render: (payment: Payment) => payment.method || '—' }] : []),
    { key: 'date', header: 'Date', accessor: 'payment_date' as keyof Payment, sortable: true, hideAt: 'sm' as const, render: (payment: Payment) => payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-GB') : '—' },
    { key: 'amount', header: 'Amount', accessor: 'amount' as keyof Payment, sortable: true, align: 'right' as const, render: (payment: Payment) => <span className={payment.direction === 'in' ? 'font-bold text-[var(--green)]' : 'font-bold text-[var(--red)]'}>{payment.direction === 'in' ? '+' : '−'}{fmt(Number(payment.amount), (payment.currency || 'TZS') as any)}</span> },
  ];

  if (showAdd) {
    return (
      <FormPage
        title="Record Payment"
        subtitle="Match a received payment against an invoice and attach its proof."
        onCancel={() => setShowAdd(false)}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="payment-form" disabled={saving || !fInvoice || !Number.isFinite(Number(fAmount)) || Number(fAmount) <= 0}>{saving ? 'Saving…' : 'Save payment'}</Button>
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Amount ({selectedInvoice?.currency || baseCurrency})</label>
                  <Input aria-label="Payment amount" type="number" min="0.01" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Date</label>
                  <DatePicker date={parseDateOnly(fDate)} onChange={d => setFDate(toDateOnlyString(d))} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Payment Mode</label>
                <Select value={fMode} onValueChange={setFMode}>
                  <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
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
                <Textarea aria-label="Internal note" maxLength={2000} rows={2} value={fNote} onChange={e => setFNote(e.target.value)}></Textarea>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Proof of Payment (Receipt / Docs)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="file" id="fFile" style={{ display: 'none' }} onChange={e => setFFile(e.target.files?.[0] || null)} />
                  <Button type="button" variant="outline" onClick={() => document.getElementById('fFile')?.click()}>
                    <Icon name="upload" size={14} /> {fFile ? 'Change file' : 'Upload file'}
                  </Button>
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
            value: fmt(inTotal, selectedCurrency),
            sub1Label: 'RECEIPTS', sub1Value: String(inCount),
            sub2Label: 'THIS MONTH', sub2Value: String(thisMonth),
            barHighlight: 'var(--green)'
          },
          {
            title: 'MONEY OUT',
            value: fmt(outTotal, selectedCurrency),
            sub1Label: 'PAYMENTS', sub1Value: String(outCount),
            sub2Label: 'OUTBOUND', sub2Value: String(outCount),
            barHighlight: 'var(--red)'
          },
          {
            title: 'NET POSITION',
            value: fmt(netTotal, selectedCurrency),
            sub1Label: netTotal >= 0 ? 'SURPLUS' : 'DEFICIT', sub1Value: netTotal >= 0 ? 'IN' : 'OUT',
            sub2Label: 'STATUS', sub2Value: netTotal >= 0 ? 'NET POSITIVE' : 'NET NEGATIVE',
            barHighlight: netTotal >= 0 ? 'var(--teal)' : 'var(--gold)'
          },
          {
            title: 'ALL MOVEMENTS',
            value: String(totalItems),
            sub1Label: 'INBOUND', sub1Value: String(inCount),
            sub2Label: 'OUTBOUND', sub2Value: String(outCount),
            barHighlight: 'var(--blue)'
          },
        ]} />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', marginTop: 16 }}>
        <div style={{ flex: 1, display: isSplit ? 'none' : 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1); }}>
                <TabsList>
                  <TabsTrigger value="ALL">All</TabsTrigger>
                  <TabsTrigger value="IN">Received</TabsTrigger>
                  <TabsTrigger value="OUT">Paid</TabsTrigger>
                </TabsList>
              </Tabs>

              <SearchToolbar
                search={search}
                onSearch={v => { setSearch(v); setPage(1); }}
                placeholder="Search payments…"
                actions={<><Select value={selectedCurrency} onValueChange={v => { setSelectedCurrency(v); setPage(1); }}><SelectTrigger aria-label="Payment currency"><SelectValue /></SelectTrigger><SelectContent>{allCurrencies.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={() => setShowAdd(true)}><Icon name="plus" size={14} /> Record payment</Button></>}
              />
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 48, color: 'var(--ink3)', fontSize: 13 }}>Loading payments…</div>
            ) : !payments.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 48, gap: 8 }}>
                <Icon name="creditCard" size={32} style={{ color: 'var(--ink3)', opacity: 0.5 }} />
                <strong style={{ color: 'var(--ink2)' }}>No payment transactions</strong>
                <span style={{ color: 'var(--ink3)', fontSize: 13 }}>Customer receipts and supplier payments appear here after they are recorded.</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{paymentColumns.map(col => <th key={col.key} style={{ padding: '10px 14px', textAlign: (col.align as any) || 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>{col.header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {payments.map(payment => (
                      <tr key={payment.id} onClick={() => setSelectedPayment(payment)} style={{ cursor: 'pointer' }}>
                        {paymentColumns.map(col => (
                          <td key={col.key} style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink)', borderBottom: '1px solid var(--border)', textAlign: (col.align as any) || 'left' }}>
                            {col.render(payment)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', padding: '6px 14px' }}>
              <PaginationBar
                page={page}
                pageSize={pageSize}
                total={totalItems}
                onPageChange={setPage}
                onPageSizeChange={s => { setPageSize(s); setPage(1); }}
                pageSizeOptions={[10, 25, 50]}
                itemLabel="payment"
              />
            </div>
          </div>
        </div>

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
