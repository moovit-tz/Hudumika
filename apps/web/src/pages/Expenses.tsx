import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { showAlert } from '../lib/alert.js';

const CATS: Record<string, { label: string; color: string }> = {
  PORT_CHARGES:    { label: 'Port Charges',    color: 'var(--blue)' },
  CUSTOMS_DUTY:    { label: 'Customs Duty',    color: '#cf222e' },
  FREIGHT:         { label: 'Freight',         color: 'var(--teal)' },
  HANDLING:        { label: 'Handling',        color: '#9a6700' },
  TRANSPORT:       { label: 'Transport',       color: '#6e40c9' },
  INSPECTION_FEE:  { label: 'Inspection Fee',  color: '#059669' },
  AGENT_FEE:       { label: 'Agent Fee',       color: '#cf222e' },
  MISCELLANEOUS:   { label: 'Miscellaneous',   color: 'var(--ink3)' },
  FUEL:            { label: 'Fuel',            color: '#0891b2' },
  MAINTENANCE:     { label: 'Maintenance',     color: '#7c3aed' },
};

const SOURCE_LABEL: Record<string, string> = {
  fleet_vehicle: 'Fleet', fleet_fuel: 'Fleet · Fuel', fleet_maintenance: 'Fleet · Maintenance',
};

export type ExpenseSource = 'finance' | 'fleet_vehicle' | 'fleet_fuel' | 'fleet_maintenance';

export interface ExpenseListItem {
  id: string;
  source: ExpenseSource;
  name: string;
  amount: number;
  date: string;
  category: string;
  is_revenue: boolean;
  shipment_id: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  editable: boolean;
}

export interface ExpenseDetail {
  id: string;
  name: string;
  amount: number;
  expense_date: string;
  category: string;
  shipment_id: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  payment_mode: string | null;
  reference: string | null;
  note: string | null;
  is_revenue: boolean;
  attachment_data: string | null;
  efd_verified: boolean | null;
  efd_verified_at: string | null;
  efd_error: string | null;
}

function fmt(n: number) {
  return 'TZS ' + n.toLocaleString();
}

// ── Detail Panel (Aside) — only ever shown for editable ('finance') rows ──────
function ExpenseDetailPanel({ expense, onClose, onChanged, shipments, customers, suppliers, isMobile }: {
  expense: ExpenseDetail; onClose: () => void; onChanged: () => void;
  shipments: any[]; customers: any[]; suppliers: any[]; isMobile?: boolean;
}) {
  const { fmt } = useCurrency();
  const cat = CATS[expense.category];
  const job = shipments.find(j => j.id === expense.shipment_id);
  const client = customers.find(c => c.id === expense.customer_id);
  const supplier = suppliers.find(s => s.id === expense.supplier_id);
  const [efdChecking, setEfdChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function verifyEfdReceipt() {
    if (!expense.reference?.trim() || efdChecking) return;
    setEfdChecking(true);
    try {
      const result = await apiFetch('/v1/tra/verify-receipt', {
        method: 'POST',
        body: JSON.stringify({ rctvnum: expense.reference.trim() }),
      });
      await apiFetch(`/v1/finance/expenses/${expense.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          efd_verified: !!result.verified,
          efd_error: result.verified ? undefined : (result.error || 'Receipt could not be verified against TRA'),
        }),
      });
      onChanged();
    } catch (err: any) {
      await apiFetch(`/v1/finance/expenses/${expense.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ efd_verified: false, efd_error: err?.message || 'Verification request failed' }),
      }).catch(() => {});
      onChanged();
    } finally {
      setEfdChecking(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/v1/finance/expenses/${expense.id}`, { method: 'DELETE' });
      onClose();
      onChanged();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete expense');
      setDeleting(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', minWidth: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Expense Details</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={handleDelete} disabled={deleting} title="Delete" style={{ background: '#fee2e2', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-sm) 8px', cursor: deleting ? 'wait' : 'pointer', color: 'var(--red)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box'}}>
            <Icon name="trash" size={14} />
          </button>
          <button type="button" onClick={onClose} title="Close" style={{ background: 'var(--bg)', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-sm) 8px', cursor: 'pointer', color: 'var(--ink)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box'}}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {/* Title Block */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>{expense.name}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: expense.is_revenue ? 'var(--green)' : 'var(--red)' }}>
            {expense.is_revenue ? '+' : '-'}{fmt(expense.amount, 'TZS')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: cat ? `${cat.color}18` : 'var(--bg)', color: cat?.color || 'var(--ink)' }}>
              {cat?.label || expense.category}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }}>
              {expense.expense_date.split('T')[0]}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Payment Mode</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{expense.payment_mode || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Reference / Receipt #</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{expense.reference || '—'}</div>
            {expense.reference && (
              expense.efd_verified ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="checkCircle" size={13} color="#059669" />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#059669' }}>EFD Verified</span>
                </div>
              ) : (
                <div>
                  <button type="button" onClick={verifyEfdReceipt} disabled={efdChecking}
                    style={{ padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink2)', fontSize: 12, fontWeight: 700, cursor: efdChecking ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}}>
                    {efdChecking ? 'Checking with TRA…' : 'Verify with TRA'}
                  </button>
                  {expense.efd_error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{expense.efd_error}</div>}
                </div>
              )
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Shipment (Job)</div>
            {job ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--navy)', background: '#f1f5f9', padding: '4px 8px', borderRadius: 6 }}>
                <Icon name="package" size={12} /> {job.bl_number || job.ref_number}
              </div>
            ) : <div style={{ fontSize: 13, color: 'var(--ink3)' }}>—</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Linked Client</div>
            {client ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#065f46', background: '#ecfdf5', padding: '4px 8px', borderRadius: 6 }}>
                <Icon name="building" size={12} /> {client.name}
              </div>
            ) : <div style={{ fontSize: 13, color: 'var(--ink3)' }}>—</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>Paid To Supplier</div>
            {supplier ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#9a6700', background: '#fff8e1', padding: '4px 8px', borderRadius: 6 }}>
                <Icon name="warehouse" size={12} /> {supplier.name}
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
          {expense.attachment_data ? (
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 9, padding: 4, background: 'var(--bg)' }}>
              <img src={expense.attachment_data} alt="Receipt Attachment" style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }} />
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
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const [items, setItems] = useState<ExpenseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  function refresh() {
    setLoading(true);
    return apiFetch('/v1/finance/expenses')
      .then((res: any) => setItems(res?.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    apiFetch('/v1/shipments').then((res: any) => setShipments(res?.data ?? res ?? [])).catch(() => {});
    apiFetch('/v1/customers').then((res: any) => setCustomers(res.data ?? res ?? [])).catch(() => {});
    apiFetch('/v1/suppliers').then((res: any) => setSuppliers(Array.isArray(res) ? res : [])).catch(() => {});
  }, []);

  const [filterCat, setFilterCat] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ExpenseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isSplit = selectedId !== null;

  // Bulk Upload State
  const [bulkCsv, setBulkCsv] = useState('');

  const filtered = filterCat ? items.filter(e => e.category === filterCat) : items;
  const totalExp = filtered.filter(e => !e.is_revenue).reduce((s, e) => s + e.amount, 0);
  const totalRev = filtered.filter(e => e.is_revenue).reduce((s, e) => s + e.amount, 0);

  function exportCsv() {
    const rows = [
      ['Description', 'Date', 'Category', 'Type', 'Amount (TZS)', 'Source'],
      ...filtered.map(e => [
        e.name, e.date.split('T')[0], CATS[e.category]?.label ?? e.category,
        e.is_revenue ? 'Revenue' : 'Expense', e.amount, SOURCE_LABEL[e.source] || 'Finance',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function selectRow(item: ExpenseListItem) {
    if (!item.editable) {
      if (item.vehicle_id) navigate(`/tracking/vehicles/${item.vehicle_id}`);
      return;
    }
    setSelectedId(item.id);
    setDetailLoading(true);
    try {
      const detail = await apiFetch(`/v1/finance/expenses/${item.id}`);
      setSelectedDetail(detail);
    } catch {
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setSelectedDetail(null);
  }

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkSaving(true);

    const lines = bulkCsv.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0].toLowerCase().includes('name') || lines[0].toLowerCase().includes('amount')) {
      lines.shift();
    }

    for (const line of lines) {
      const cols = line.split(',');
      if (cols.length >= 2) {
        await apiFetch('/v1/finance/expenses', {
          method: 'POST',
          body: JSON.stringify({
            name: cols[0].trim(),
            amount: Number(cols[1].trim()) || 0,
            expense_date: cols[2] ? cols[2].trim() : new Date().toISOString().split('T')[0],
            category: cols[3] ? cols[3].trim() : 'MISCELLANEOUS',
            payment_mode: cols[4] ? cols[4].trim() : 'Cash',
            note: 'Imported via Bulk Upload',
          }),
        }).catch(() => {});
      }
    }

    setShowBulkUpload(false);
    setBulkCsv('');
    setBulkSaving(false);
    refresh();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--white)' }}>
      <div style={{ padding: '0 20px' }}>
        <PageHeader
          crumbs={['Finance', 'Expenses']}
          titlePlain="Expense"
          titleEm="tracking"
          subtitle="Costs and revenue across all shipments and operations — including fleet fuel, maintenance, and vehicle costs."
        />
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--white)' }}>
        <Link to="/finance/expenses/new"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 22px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'none' }}>
          <Icon name="plus" size={15} color="#fff" /> Add Expense
        </Link>
        <button type="button" onClick={() => setShowBulkUpload(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
          <Icon name="upload" size={14} color="var(--ink3)" /> Bulk Upload
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={exportCsv}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
          <Icon name="download" size={14} color="var(--ink3)" /> Export CSV
        </button>
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
                sub1Label: 'LINE ITEMS', sub1Value: String(items.filter(e => !e.is_revenue).length),
                sub2Label: 'AVG COST', sub2Value: fmt(items.filter(e => !e.is_revenue).length ? Math.round(totalExp / items.filter(e => !e.is_revenue).length) : 0, 'TZS'),
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
                sub2Label: 'ALL ITEMS', sub2Value: String(items.length),
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
          {!isSplit && <div className="th" style={{ flex: 1 }}>Source</div>}
          <div className="th" style={{ flex: 1, textAlign: 'right' }}>Amount (TZS)</div>
        </div>

        {/* Table Body */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          {!loading && filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>No expense records found.</div>}
          {filtered.map(e => {
            const cat = CATS[e.category];
            const isSel = selectedId === e.id;
            return (
              <div
                key={`${e.source}-${e.id}`}
                onClick={() => selectRow(e)}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: isSel ? '#f0f9ff' : 'var(--white)', cursor: 'pointer', transition: 'background 0.15s' }}
              >

                {/* Description */}
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{e.name}</div>
                  {isSplit && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{e.date.split('T')[0]}</div>}
                  {e.vehicle_label && !isSplit && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{e.vehicle_label}</div>}
                </div>

                {/* Date */}
                {!isSplit && <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{e.date.split('T')[0]}</div>}

                {/* Category */}
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: 'var(--font)', fontWeight: 600, fontSize: 10, padding: '2px 8px', borderRadius: 4, background: cat ? `${cat.color}18` : 'var(--bg)', color: cat?.color || 'var(--ink3)' }}>
                    {cat?.label || e.category}
                  </span>
                </div>

                {/* Source */}
                {!isSplit && (
                  <div style={{ flex: 1 }}>
                    {e.source !== 'finance' ? (
                      <span style={{ fontSize: 11, color: '#0891b2', background: '#ecfeff', padding: '2px 6px', borderRadius: 4, width: 'fit-content' }}>{SOURCE_LABEL[e.source]}</span>
                    ) : (
                      <>
                        {e.shipment_id && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--navy)', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, width: 'fit-content', marginBottom: 2 }}><Icon name="package" size={10} /> Job Link</div>}
                        {e.customer_id && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: '2px 6px', borderRadius: 4, width: 'fit-content' }}><Icon name="building" size={10} /> Client Link</div>}
                      </>
                    )}
                  </div>
                )}

                {/* Amount */}
                <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: e.is_revenue ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>
                  {e.is_revenue ? '+' : '-'}{(e.amount || 0).toLocaleString()}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Aside Detail Panel ── */}
      {isSplit && selectedDetail && !detailLoading && (
        <ExpenseDetailPanel
          expense={selectedDetail}
          onClose={closeDetail}
          onChanged={() => { refresh(); apiFetch(`/v1/finance/expenses/${selectedDetail.id}`).then(setSelectedDetail).catch(() => {}); }}
          shipments={shipments}
          customers={customers}
          suppliers={suppliers}
          isMobile={isMobile}
        />
      )}

      {/* ── Bulk Upload Modal — bulk CSV paste stays a dialog, unlike single Add Expense ── */}
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
                <button type="submit" className="btn btn-primary" disabled={bulkSaving}>{bulkSaving ? 'Importing…' : 'Import Data'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
