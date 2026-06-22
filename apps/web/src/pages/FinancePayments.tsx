import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { usePayments, addPayment, deletePayment, Payment } from '../data/paymentData.js';
import { addFolder, addFile, findFolderByName } from '../data/fileManagerStore.js';
import { INITIAL_INVOICES } from './Billing.js';
import { useCurrency } from '../hooks/useCurrency.js';

function extOf(name: string) { return name.split('.').pop()?.toLowerCase() ?? 'txt'; }

// ── Detail Panel (Aside) ───────────────────────────────────────────────────────
function PaymentDetailPanel({ payment, onClose, isMobile }: { payment: Payment; onClose: () => void; isMobile?: boolean }) {
  const { fmt } = useCurrency();
  const invoice = INITIAL_INVOICES.find(i => i.id === payment.invoiceId);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="fileText" size={18} color="var(--blue)" /> Payment {payment.id}
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
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)', lineHeight: 1 }}>{fmt(payment.amount, payment.currency)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>Date</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{payment.date}</div>
          </div>
        </div>

        {/* Links */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Invoice</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
              📄 {payment.invoiceId}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Client</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', background: '#dcfce7', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
              🏢 {payment.clientId}
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
              { label: 'Payment Mode', value: payment.paymentMode },
              { label: 'Transaction ID', value: payment.transactionId || '—' },
              { label: 'Logged By', value: 'System Admin' },
              ...(payment.attachmentName ? [{ label: 'Attachment', value: payment.attachmentName, isFile: true }] : []),
            ].map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: item.isFile ? 'var(--blue)' : 'var(--navy)', fontFamily: item.label === 'Transaction ID' ? 'var(--mono)' : 'var(--font)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.isFile && <Icon name="file" size={14} />} {item.value}
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

      {/* Footer Actions */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
        <button style={{ flex: 1, padding: '10px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Icon name="download" size={14} /> Receipt
        </button>
        <button onClick={() => { if (confirm('Delete this payment?')) { deletePayment(payment.id); onClose(); } }} style={{ padding: '10px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 9, color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export const FinancePayments: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const payments = usePayments();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
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
  const [fTransactionId, setFTransactionId] = useState('');
  const [fNote, setFNote] = useState('');
  const [fFile, setFFile] = useState<File | null>(null);

  const selectedInvoice = INITIAL_INVOICES.find(i => i.id === fInvoice);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fInvoice || !fAmount) return;

    let attachmentName;

    // Process attachment to File Manager
    if (fFile && selectedInvoice) {
      const clientName = selectedInvoice.client;
      const blNumber = selectedInvoice.blNumber || 'General';
      const today = new Date().toISOString().split('T')[0];

      // Create or find Client Folder
      const clientFolderId = findFolderByName(clientName)?.id || addFolder(clientName, null, '#6366f1');
      // Create or find BL Folder inside Client Folder
      const blFolderId = findFolderByName(blNumber, clientFolderId)?.id || addFolder(blNumber, clientFolderId, '#f59e0b');

      // Add the file to the BL Folder
      addFile({
        name: fFile.name,
        type: extOf(fFile.name),
        size: fFile.size,
        modified: today,
        created: today,
        parentId: blFolderId,
      });

      attachmentName = fFile.name;
    }

    addPayment({
      invoiceId: fInvoice,
      clientId: selectedInvoice?.client || 'Unknown',
      amount: parseFloat(fAmount),
      paymentMode: fMode,
      transactionId: fTransactionId,
      date: fDate,
      note: fNote,
      currency: 'TZS', // Hardcoded for now, ideally derived from invoice
      attachmentName,
    });

    setShowAdd(false);
    setFInvoice('');
    setFAmount('');
    setFTransactionId('');
    setFNote('');
    setFMode('Bank Transfer');
    setFFile(null);
  };

  const filtered = payments.filter(p =>
    !search ||
    p.invoiceId.toLowerCase().includes(search.toLowerCase()) ||
    p.clientId.toLowerCase().includes(search.toLowerCase()) ||
    p.transactionId.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      {/* ── Header ── */}
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
            trend: 8.4,
            sub1Label: 'PAYMENTS', sub1Value: String(payments.length),
            sub2Label: 'THIS MONTH', sub2Value: '12',
            bars: spark(150, 15, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)'
          },
          {
            title: 'Unreconciled',
            value: 'TZS 0',
            trend: 0,
            sub1Label: 'PENDING', sub1Value: '0',
            sub2Label: 'DRAFT', sub2Value: '0',
            bars: spark(151, 15, 'flat'), barColor: 'var(--gold-l)', barHighlight: 'var(--gold)'
          }
        ]} />
      </div>

      {/* ── Main Content Area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* ── Left: List ── */}
        <div style={{ flex: isSplit ? '0 0 55%' : 1, padding: '24px 28px', borderRight: isSplit ? '1px solid var(--border)' : 'none', overflowY: 'auto' }}>
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
              <input type="text" placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 6, width: 250, fontSize: 13 }} />
            </div>

            <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', color: 'var(--ink3)', fontSize: 11.5, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>Payment #</th>
                  <th style={{ padding: '12px 16px' }}>Invoice</th>
                  <th style={{ padding: '12px 16px' }}>Client</th>
                  {!isSplit && <th style={{ padding: '12px 16px' }}>Mode & TRX</th>}
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                  {!isSplit && <th style={{ padding: '12px 16px', width: 60 }}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>No payments found.</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id} onClick={() => setSelectedPayment(p)} style={{ borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--navy)', cursor: 'pointer', background: selectedPayment?.id === p.id ? 'var(--bg)' : 'var(--white)' }}
                      onMouseEnter={e => { if (selectedPayment?.id !== p.id) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = selectedPayment?.id === p.id ? 'var(--bg)' : 'var(--white)'; }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.id}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                        {p.invoiceId}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isSplit ? 120 : 200 }}>
                        {p.clientId}
                      </div>
                    </td>
                    {!isSplit && (
                      <td style={{ padding: '12px 16px' }}>
                        <div>{p.paymentMode}</div>
                        {p.transactionId && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>TRX: {p.transactionId}</div>}
                      </td>
                    )}
                    <td style={{ padding: '12px 16px', color: 'var(--ink2)' }}>{p.date}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {fmt(p.amount, p.currency)}
                    </td>
                    {!isSplit && (
                      <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => deletePayment(p.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                          <Icon name="trash" size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>

        {/* ── Right: Aside Detail Panel ── */}
        {isSplit && selectedPayment && (
          <PaymentDetailPanel
            payment={selectedPayment}
            onClose={() => setSelectedPayment(null)}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* ── Record Payment Modal ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="card" style={{ width: 480, padding: 24, borderRadius: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>Record Payment</h2>
              <button className="dp-close" onClick={() => setShowAdd(false)}>×</button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Select Invoice</label>
                <select className="input-field" value={fInvoice} onChange={e => setFInvoice(e.target.value)} required>
                  <option value="">-- Choose Invoice --</option>
                  {INITIAL_INVOICES.map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.id} - {inv.client}</option>
                  ))}
                </select>
                {selectedInvoice && (
                  <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>
                    Linked Client: <strong>{selectedInvoice.client}</strong>
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
                  <input type="date" className="input-field" value={fDate} onChange={e => setFDate(e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Payment Mode</label>
                  <select className="input-field" value={fMode} onChange={e => setFMode(e.target.value)}>
                    <option>Bank Transfer</option>
                    <option>Cash</option>
                    <option>Cheque</option>
                    <option>Mobile Money</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Transaction ID</label>
                  <input type="text" className="input-field" placeholder="Optional" value={fTransactionId} onChange={e => setFTransactionId(e.target.value)} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Internal Note</label>
                <textarea className="input-field" rows={2} value={fNote} onChange={e => setFNote(e.target.value)}></textarea>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Proof of Payment (Receipt / Docs)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="file" id="fFile" style={{ display: 'none' }} onChange={e => setFFile(e.target.files?.[0] || null)} />
                  <button type="button" onClick={() => document.getElementById('fFile')?.click()} style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink)' }}>
                    <Icon name="upload" size={14} /> {fFile ? 'Change File' : 'Upload File'}
                  </button>
                  {fFile && <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fFile.name}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>File will automatically be saved to File Manager &gt; Client Folder &gt; BL Number.</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Save Payment</button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};
