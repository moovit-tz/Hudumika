import React, { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { useExpenses, addExpense, deleteExpense, Expense } from '../data/expenseData.js';
import { getJobs } from './clearanceData.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';

const CATS: Record<string, { label: string; color: string }> = {
  PORT_CHARGES:    { label: 'Port Charges',    color: 'var(--blue)' },
  CUSTOMS_DUTY:    { label: 'Customs Duty',    color: '#cf222e' },
  FREIGHT:         { label: 'Freight',         color: 'var(--teal)' },
  HANDLING:        { label: 'Handling',        color: '#9a6700' },
  TRANSPORT:       { label: 'Transport',       color: '#6e40c9' },
  INSPECTION_FEE:  { label: 'Inspection Fee',  color: '#1a7f37' },
  AGENT_FEE:       { label: 'Agent Fee',       color: '#cf222e' },
  MISCELLANEOUS:   { label: 'Miscellaneous',   color: 'var(--ink3)' },
};

function fmt(n: number) {
  return 'TZS ' + n.toLocaleString();
}

// ── Detail Panel (Aside) ───────────────────────────────────────────────────────
function ExpenseDetailPanel({ expense, onClose, customers, isMobile }: { expense: Expense; onClose: () => void; customers: any[]; isMobile?: boolean }) {
  const { fmt } = useCurrency();
  const cat = CATS[expense.category];
  const jobs = getJobs();
  const job = jobs.find(j => j.id === expense.shipmentId);
  const client = customers.find(c => c.id === expense.clientId);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', minWidth: 0, overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Expense Details</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => { deleteExpense(expense.id); onClose(); }} title="Delete" style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: 'var(--red)' }}>
            <Icon name="trash" size={14} />
          </button>
          <button type="button" onClick={onClose} title="Close" style={{ background: 'var(--bg)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: 'var(--ink)' }}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        
        {/* Title Block */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>{expense.name}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: expense.isRevenue ? 'var(--green)' : 'var(--red)' }}>
            {expense.isRevenue ? '+' : '-'}{fmt(expense.amount, 'TZS')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: cat ? `${cat.color}18` : 'var(--bg)', color: cat?.color || 'var(--ink)' }}>
              {cat?.label || expense.category}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }}>
              {expense.date}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Payment Mode</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{expense.paymentMode}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Reference / Receipt #</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{expense.reference || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Shipment (Job)</div>
            {job ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', background: '#f1f5f9', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
                📦 {job.bl || job.customer}
              </div>
            ) : <div style={{ fontSize: 13, color: 'var(--ink3)' }}>—</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Client</div>
            {client ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', background: '#dcfce7', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
                🏢 {client.name}
              </div>
            ) : <div style={{ fontSize: 13, color: 'var(--ink3)' }}>—</div>}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Notes / Description</div>
          <div style={{ fontSize: 13, color: 'var(--ink)', background: 'var(--bg)', padding: 12, borderRadius: 9, minHeight: 60, whiteSpace: 'pre-wrap' }}>
            {expense.note || <span style={{ color: 'var(--ink3)', fontStyle: 'italic' }}>No additional notes provided.</span>}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>Receipt Attachment</div>
          {expense.attachmentUrl ? (
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 9, padding: 4, background: 'var(--bg)' }}>
              <img src={expense.attachmentUrl} alt="Receipt Attachment" style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }} />
            </div>
          ) : (
            <div style={{ border: '1.5px dashed var(--border)', borderRadius: 9, padding: 30, textAlign: 'center', background: 'var(--bg)', color: 'var(--ink3)' }}>
              <Icon name="paperclip" size={24} style={{ opacity: 0.5, marginBottom: 8 }} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>No attachment uploaded</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export const Expenses: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const expenses = useExpenses();
  const jobs = getJobs();
  const [customers, setCustomers] = React.useState<any[]>([]);

  React.useEffect(() => {
    apiFetch('/v1/customers').then((res: any) => setCustomers(res.data ?? res ?? [])).catch(() => {});
  }, []);
  React.useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'expenses') setShowAdd(true);
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  const [filterCat, setFilterCat] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const isSplit = selectedExpense !== null;

  // Form State
  const [fName, setFName] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fCategory, setFCategory] = useState('PORT_CHARGES');
  const [fShipment, setFShipment] = useState('');
  const [fClient, setFClient] = useState('');
  const [fPaymentMode, setFPaymentMode] = useState('Bank Transfer');
  const [fReference, setFReference] = useState('');
  const [fNote, setFNote] = useState('');
  const [fIsRevenue, setFIsRevenue] = useState(false);
  const [fAttachment, setFAttachment] = useState<string | undefined>();

  // Bulk Upload State
  const [bulkCsv, setBulkCsv] = useState('');

  const filtered = filterCat ? expenses.filter(e => e.category === filterCat) : expenses;
  const totalExp = filtered.filter(e => !e.isRevenue).reduce((s, e) => s + e.amount, 0);
  const totalRev = filtered.filter(e => e.isRevenue).reduce((s, e) => s + e.amount, 0);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setFAttachment(ev.target.result); };
    reader.readAsDataURL(file);
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    
    addExpense({
      name: fName,
      amount: Number(fAmount),
      date: fDate,
      category: fCategory,
      shipmentId: fShipment,
      clientId: fClient,
      paymentMode: fPaymentMode,
      reference: fReference,
      note: fNote,
      isRevenue: fIsRevenue,
      attachmentUrl: fAttachment,
    });
    
    setShowAdd(false);
    setSaving(false);
    
    // Reset Form
    setFName(''); setFAmount(''); setFDate(new Date().toISOString().split('T')[0]);
    setFCategory('PORT_CHARGES'); setFShipment(''); setFClient('');
    setFPaymentMode('Bank Transfer'); setFReference(''); setFNote(''); setFIsRevenue(false); setFAttachment(undefined);
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    
    const lines = bulkCsv.split('\n').map(l => l.trim()).filter(Boolean);
    // Ignore header if present
    if (lines[0].toLowerCase().includes('name') || lines[0].toLowerCase().includes('amount')) {
      lines.shift();
    }
    
    for (const line of lines) {
      const cols = line.split(',');
      if (cols.length >= 2) {
        addExpense({
          name: cols[0].trim(),
          amount: Number(cols[1].trim()) || 0,
          date: cols[2] ? cols[2].trim() : new Date().toISOString().split('T')[0],
          category: cols[3] ? cols[3].trim() : 'MISCELLANEOUS',
          shipmentId: '',
          clientId: '',
          paymentMode: cols[4] ? cols[4].trim() : 'Cash',
          reference: '',
          note: 'Imported via Bulk Upload',
          isRevenue: false,
        });
      }
    }
    
    setShowBulkUpload(false);
    setBulkCsv('');
    setSaving(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--white)' }}>
      <div style={{ padding: '0 20px' }}>
        <PageHeader
          crumbs={['Finance', 'Expenses']}
          titlePlain="Expense"
          titleEm="tracking"
          subtitle="Costs and revenue across all shipments and operations."
        />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Left: List Panel ── */}
      <div style={{ width: isSplit ? '42%' : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s ease', borderRight: isSplit ? '1px solid var(--border)' : 'none' }}>

        {/* KPI row */}
        {!isSplit && (
          <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
            <MetricsRow cards={[
              {
                title: 'Total Costs',
                value: fmt(totalExp, 'TZS'),
                trend: -4.2,
                invertTrend: true,
                sub1Label: 'LINE ITEMS', sub1Value: String(expenses.filter(e => !e.isRevenue).length),
                sub2Label: 'AVG COST', sub2Value: fmt(expenses.filter(e => !e.isRevenue).length ? Math.round(totalExp / expenses.filter(e => !e.isRevenue).length) : 0, 'TZS'),
                bars: spark(70, 15, 'down'), barColor: 'var(--red-l)', barHighlight: 'var(--red)',
              },
              {
                title: 'Total Revenue',
                value: fmt(totalRev, 'TZS'),
                trend: 11.3,
                sub1Label: 'THIS MONTH', sub1Value: fmt(Math.round(totalRev * 0.38), 'TZS'),
                sub2Label: 'THIS WEEK', sub2Value: fmt(Math.round(totalRev * 0.09), 'TZS'),
                bars: spark(71, 15, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
              },
              {
                title: 'Net Margin',
                value: fmt(totalRev - totalExp, 'TZS'),
                trend: !totalRev ? 0 : parseFloat(((totalRev - totalExp) / totalRev * 100).toFixed(1)),
                sub1Label: 'MARGIN %', sub1Value: !totalRev ? '—' : `${Math.round(((totalRev - totalExp) / totalRev) * 100)}%`,
                sub2Label: 'ALL ITEMS', sub2Value: String(expenses.length),
                bars: spark(72, 15, 'up'), barColor: 'var(--purple-l)', barHighlight: 'var(--purple)',
              },
            ]} />
          </div>
        )}

        {/* Category chips */}
        <div className="filter-bar" style={{ padding: '12px 20px', overflowX: 'auto', flexShrink: 0 }}>
          <button type="button" className={`fc${!filterCat ? ' on' : ''}`} onClick={() => setFilterCat('')}>All</button>
          {Object.entries(CATS).map(([k, v]) => (
            <button type="button" key={k} className={`fc${filterCat === k ? ' on' : ''}`} onClick={() => setFilterCat(k)}>{v.label}</button>
          ))}
        </div>

        {/* Table Header */}
        <div style={{ display: 'flex', padding: '8px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div className="th" style={{ flex: 2 }}>Description</div>
          {!isSplit && <div className="th" style={{ flex: 1 }}>Date</div>}
          <div className="th" style={{ flex: 1 }}>Category</div>
          {!isSplit && <div className="th" style={{ flex: 1 }}>Links</div>}
          <div className="th" style={{ flex: 1, textAlign: 'right' }}>Amount (TZS)</div>
        </div>

        {/* Table Body */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          {filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>No expense records found.</div>}
          {filtered.map(e => {
            const cat = CATS[e.category];
            const isSel = selectedExpense?.id === e.id;
            return (
              <div 
                key={e.id} 
                onClick={() => setSelectedExpense(e)}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: isSel ? '#f0f9ff' : 'var(--white)', cursor: 'pointer', transition: 'background 0.15s' }}
              >
                
                {/* Description */}
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{e.name}</div>
                  {isSplit && e.date && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{e.date}</div>}
                  {e.attachmentUrl && !isSplit && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}><Icon name="paperclip" size={10} /> Attached</div>}
                </div>

                {/* Date */}
                {!isSplit && <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{e.date}</div>}

                {/* Category */}
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: 'var(--font)', fontWeight: 600, fontSize: 10, padding: '2px 8px', borderRadius: 4, background: cat ? `${cat.color}18` : 'var(--bg)', color: cat?.color || 'var(--ink3)' }}>
                    {cat?.label || e.category}
                  </span>
                  {!isSplit && <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 4 }}>{e.paymentMode}</div>}
                </div>

                {/* Links */}
                {!isSplit && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {e.shipmentId && <div style={{ fontSize: 11, color: 'var(--navy)', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, width: 'fit-content' }}>📦 Job Link</div>}
                    {e.clientId && <div style={{ fontSize: 11, color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: 4, width: 'fit-content' }}>🏢 Client Link</div>}
                  </div>
                )}

                {/* Amount */}
                <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: e.isRevenue ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>
                  {e.isRevenue ? '+' : '-'}{(e.amount || 0).toLocaleString()}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Aside Detail Panel ── */}
      {isSplit && selectedExpense && (
        <ExpenseDetailPanel
          expense={selectedExpense}
          onClose={() => setSelectedExpense(null)}
          customers={customers}
          isMobile={isMobile}
        />
      )}

      {/* ── Add Expense Modal ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="card" style={{ width: '90%', maxWidth: 540, padding: 24, borderRadius: 9, boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Add Expense / Revenue</h2>
              <button type="button" className="dp-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Expense Name</label>
                  <input type="text" className="input-field" placeholder="e.g. Forklift Hire" required value={fName} onChange={e => setFName(e.target.value)} />
                </div>
                <div style={{ width: 140 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Amount (TZS)</label>
                  <input type="number" className="input-field" placeholder="0" required value={fAmount} onChange={e => setFAmount(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Date</label>
                  <input type="date" className="input-field" required value={fDate} onChange={e => setFDate(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Category</label>
                  <select className="input-field" value={fCategory} onChange={e => setFCategory(e.target.value)}>
                    {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Link to Shipment (Job)</label>
                  <select className="input-field" value={fShipment} onChange={e => setFShipment(e.target.value)}>
                    <option value="">-- None --</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.bl ? `BL: ${j.bl}` : j.customer}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Link to Client</label>
                  <select className="input-field" value={fClient} onChange={e => setFClient(e.target.value)}>
                    <option value="">-- None --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Payment Mode</label>
                  <select className="input-field" value={fPaymentMode} onChange={e => setFPaymentMode(e.target.value)}>
                    <option>Bank Transfer</option>
                    <option>Cash</option>
                    <option>Mobile Money</option>
                    <option>Cheque</option>
                    <option>Credit Card</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Reference #</label>
                  <input type="text" className="input-field" placeholder="Receipt / Cheque no" value={fReference} onChange={e => setFReference(e.target.value)} />
                </div>
              </div>

              {/* Attachment */}
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Attach Receipt (Image)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', border: '1.5px dashed var(--border)', borderRadius: 9, cursor: 'pointer', background: 'var(--bg)' }}>
                  {fAttachment ? (
                    <>
                      <img src={fAttachment} alt="Attachment" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>File attached! Click to change.</div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 40, height: 40, borderRadius: 4, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="uploadCloud" size={16} /></div>
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Click to upload receipt image (PNG, JPG)</div>
                    </>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Note / Description</label>
                <textarea className="input-field" rows={2} placeholder="Optional notes about this expense..." value={fNote} onChange={e => setFNote(e.target.value)} style={{ resize: 'none' }}></textarea>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={fIsRevenue} onChange={e => setFIsRevenue(e.target.checked)} />
                  Record as Revenue / Income instead
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bulk Upload Modal ── */}
      {showBulkUpload && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBulkUpload(false)}>
          <div className="card" style={{ width: '90%', maxWidth: 540, padding: 24, borderRadius: 9, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Bulk Upload Expenses</h2>
              <button type="button" className="dp-close" onClick={() => setShowBulkUpload(false)}>×</button>
            </div>
            
            <form onSubmit={handleBulkUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Paste CSV Data</label>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 8 }}>Format: <code style={{ background: 'var(--bg)', padding: '2px 4px', borderRadius: 4 }}>Name, Amount, Date, Category, PaymentMode</code></div>
                <textarea 
                  className="input-field" 
                  rows={8} 
                  placeholder={"Port Charges, 250000, 2026-06-14, PORT_CHARGES, Bank Transfer\nLunch, 15000, 2026-06-14, MISCELLANEOUS, Cash"} 
                  required 
                  value={bulkCsv} 
                  onChange={e => setBulkCsv(e.target.value)} 
                  style={{ resize: 'none', fontFamily: 'monospace', fontSize: 12 }}
                ></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkUpload(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Importing…' : 'Import Data'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
