import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';

interface Payment {
  id: string;
  invoice_id: string;
  invoice_number: string;
  client_name: string | null;
  amount: number;
  method: string | null;
  payment_date: string | null;
  note: string | null;
  logged_by: string | null;
  created_at: string;
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
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="fileText" size={18} color="var(--blue)" /> Payment
        </h2>
        <button type="button" onClick={onClose} style={{ background: 'var(--bg)', border: 'none', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink3)' }}>
          <Icon name="x" size={16} strokeWidth={2} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Total Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: 20, background: '#f8fafc', borderRadius: 9, border: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>Amount Received</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)', lineHeight: 1 }}>{fmt(payment.amount, 'TZS')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>Date</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-GB') : '—'}</div>
          </div>
        </div>

        {/* Links */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Invoice</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
              {payment.invoice_number}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Client</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#065f46', background: '#ecfdf5', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
              {payment.client_name || 'Unknown'}
            </div>
          </div>
        </div>

        {/* Details List */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase' }}>
            Transaction Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Payment Mode', value: payment.method || '—' },
              { label: 'Logged By', value: payment.logged_by || 'System' },
              { label: 'Recorded', value: new Date(payment.created_at).toLocaleString('en-GB') },
            ].map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        {payment.note && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>Internal Note</div>
            <div style={{ padding: 16, background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 9, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
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
          if (!clientFolder) clientFolder = await apiFetch('/v1/files/folder', { method: 'POST', body: JSON.stringify({ name: clientName, parent_id: null, color: '#6366f1' }) });

          let blFolder = findFolder(blNumber, clientFolder.id);
          if (!blFolder) blFolder = await apiFetch('/v1/files/folder', { method: 'POST', body: JSON.stringify({ name: blNumber, parent_id: clientFolder.id, color: '#f59e0b' }) });

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

  const filtered = payments.filter(p =>
    !search ||
    p.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const thisMonth = payments.filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      {/* -- Header -- */}
      <div style={{ padding: isMobile ? '14px 16px' : '0 24px', paddingBottom: 0 }}>
        <PageHeader
          crumbs={['Finance', 'Payments']}
          titlePlain="Payment"
          titleEm="records"
          subtitle="Manage and reconcile received payments against invoices."
        />

        <MetricsRow cards={[
          {
            title: 'Total Collected',
            value: `TZS ${totalAmount.toLocaleString()}`,
            trend: 0,
            sub1Label: 'PAYMENTS', sub1Value: String(payments.length),
            sub2Label: 'THIS MONTH', sub2Value: String(thisMonth),
            bars: payments.length > 1 ? spark(payments.length, 15, 'up') : undefined, barColor: 'var(--green-l)', barHighlight: 'var(--green)'
          },
        ]} />
      </div>

      {/* -- Main Content Area -- */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* -- Left: List -- */}
        <div style={{ flex: isSplit ? '0 0 55%' : 1, padding: '24px 28px', borderRight: isSplit ? '1px solid var(--border)' : 'none', overflowY: 'auto' }}>
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
              <input type="text" placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 6, width: 250, fontSize: 13 }} />
            </div>

            <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', color: 'var(--ink3)', fontSize: 11.5, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>Invoice</th>
                  <th style={{ padding: '12px 16px' }}>Client</th>
                  {!isSplit && <th style={{ padding: '12px 16px' }}>Mode</th>}
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>Loading payments…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>No payments found.</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id} onClick={() => setSelectedPayment(p)} style={{ borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--navy)', cursor: 'pointer', background: selectedPayment?.id === p.id ? 'var(--bg)' : 'var(--white)' }}
                      onMouseEnter={e => { if (selectedPayment?.id !== p.id) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = selectedPayment?.id === p.id ? 'var(--bg)' : 'var(--white)'; }}>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                        {p.invoice_number}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isSplit ? 120 : 200 }}>
                        {p.client_name || 'Unknown'}
                      </div>
                    </td>
                    {!isSplit && (
                      <td style={{ padding: '12px 16px' }}>{p.method || '—'}</td>
                    )}
                    <td style={{ padding: '12px 16px', color: 'var(--ink2)' }}>{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB') : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {fmt(Number(p.amount), 'TZS')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
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

      {/* -- Record Payment Modal -- */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="card" style={{ width: 480, padding: 24, borderRadius: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>Record Payment</h2>
              <button type="button" className="dp-close" onClick={() => setShowAdd(false)}><Icon name="x" size={16} /></button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

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
                  <button type="button" onClick={() => document.getElementById('fFile')?.click()} style={{ padding: 'var(--ds-btn-py) 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink)' }}>
                    <Icon name="upload" size={14} /> {fFile ? 'Change File' : 'Upload File'}
                  </button>
                  {fFile && <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fFile.name}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>File will automatically be saved to File Manager &gt; Client Folder &gt; BL Number.</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};
