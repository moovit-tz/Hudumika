import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import type { DateRange } from 'react-day-picker';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; }
interface StaffMember { id: string; name: string; }
interface TxRow {
  id: string; type: 'deposit' | 'withdrawal' | 'transfer'; wallet_id: string;
  amount: string | number; status: string | null; category: string | null;
  description: string | null; actor_id: string | null; occurred_at: string;
  method?: string; reference?: string; ref: string | null;
}

const TYPE_LABEL: Record<string, string> = { deposit: 'Deposit', withdrawal: 'Withdrawal', transfer: 'Transfer' };
const TYPE_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  deposit: 'success', withdrawal: 'info', transfer: 'gray',
};
const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', approved: 'info', disbursed: 'success', rejected: 'error', completed: 'gray',
};
const CATEGORY_LABELS: Record<string, string> = {
  OFFICE_SUPPLIES: 'Office supplies', TRANSPORT: 'Transport', MEALS_ENTERTAINMENT: 'Meals & entertainment',
  UTILITIES: 'Utilities', STAFF_WELFARE: 'Staff welfare', REPAIRS_MAINTENANCE: 'Repairs & maintenance',
  POSTAGE_COURIER: 'Postage & courier', MISCELLANEOUS: 'Miscellaneous',
};

function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

export function PettiTransactions() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [walletId, setWalletId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  /* View Mode & Modal State */
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedTx, setSelectedTx] = useState<TxRow | null>(null);

  useEffect(() => {
    apiFetch('/v1/petti/wallets').then(res => setWallets(res.data || [])).catch(() => setWallets([]));
    apiFetch('/v1/ondi/users').then(setStaff).catch(() => setStaff([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [walletId, type, status, debouncedSearch, range]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (walletId) params.set('wallet_id', walletId);
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (range?.from) params.set('from', range.from.toISOString());
    if (range?.to) params.set('to', range.to.toISOString());
    params.set('limit', String(pageSize));
    params.set('offset', String((page - 1) * pageSize));
    apiFetch(`/v1/petti/transactions?${params.toString()}`)
      .then(res => { setRows(res.data || []); setTotal(res.total || 0); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [walletId, type, status, debouncedSearch, range, page]);

  const walletsById = useMemo(() => Object.fromEntries(wallets.map(w => [w.id, w])), [wallets]);
  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s.name])), [staff]);

  const walletOptions = useMemo(() => wallets.map(w => ({ value: w.id, label: w.name })), [wallets]);
  const typeOptions = [
    { value: 'deposit', label: 'Deposit' }, { value: 'withdrawal', label: 'Withdrawal' }, { value: 'transfer', label: 'Transfer' },
  ];
  const statusOptions = [
    { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
    { value: 'disbursed', label: 'Disbursed' }, { value: 'rejected', label: 'Rejected' },
  ];

  /* Export CSV Function */
  function exportCSV() {
    if (rows.length === 0) { showAlert('No transactions to export.'); return; }
    const headers = ['ID', 'Date', 'Type', 'Wallet', 'Description', 'Category', 'Amount', 'Currency', 'Status', 'Recorded By'];
    const csvContent = [
      headers.join(','),
      ...rows.map(r => [
        `"${r.id}"`,
        `"${new Date(r.occurred_at).toISOString()}"`,
        `"${r.type}"`,
        `"${(walletsById[r.wallet_id]?.name || '').replace(/"/g, '""')}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`,
        `"${r.category || ''}"`,
        r.amount,
        `"${walletsById[r.wallet_id]?.currency || ''}"`,
        `"${r.status || ''}"`,
        `"${r.actor_id ? (staffById[r.actor_id] || '') : ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `petti_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* Print Voucher Function */
  function printVoucher(r: TxRow) {
    const wall = walletsById[r.wallet_id];
    const actorName = r.actor_id ? (staffById[r.actor_id] || 'Staff Member') : 'Finance Admin';
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`
      <html>
        <head>
          <title>Voucher Receipt - ${r.id}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #161A1E; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d7a6b; padding-bottom: 16px; margin-bottom: 24px; }
            .brand { font-size: 22px; font-weight: 800; color: #0d7a6b; }
            .hero-card { background: #0e1f3d; color: #fff; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
            .hero-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.7); }
            .hero-amount { font-size: 32px; font-weight: 900; margin-top: 4px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px; margin-bottom: 30px; }
            .label { color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11px; }
            .value { font-weight: 600; font-size: 14px; margin-top: 2px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #64748b; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">HUDUMIKA · PETTI CASH</div>
              <div style="font-size: 12px; color: #64748b;">Official Financial Transaction Voucher</div>
            </div>
            <div style="text-align: right; font-size: 12px;">
              <strong>Voucher No:</strong> ${r.ref || r.id}<br/>
              <strong>Date:</strong> ${new Date(r.occurred_at).toLocaleString()}
            </div>
          </div>

          <div class="hero-card">
            <div class="hero-title">${TYPE_LABEL[r.type] || r.type} Amount</div>
            <div class="hero-amount">${Number(r.amount).toLocaleString()} ${wall?.currency || ''}</div>
          </div>

          <div class="grid">
            <div><div class="label">Wallet Name</div><div class="value">${wall?.name || '—'}</div></div>
            <div><div class="label">Status</div><div class="value" style="text-transform: uppercase;">${r.status || 'Completed'}</div></div>
            <div><div class="label">Expense Category</div><div class="value">${r.category ? (CATEGORY_LABELS[r.category] || r.category) : 'General'}</div></div>
            <div><div class="label">Processed By</div><div class="value">${actorName}</div></div>
            <div style="grid-column: span 2;"><div class="label">Description / Purpose</div><div class="value">${r.description || '—'}</div></div>
          </div>

          <div class="footer">
            Generated by Hudumika Petti Operations • Certified Audit Voucher
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Transactions']}
        titlePlain="Transaction"
        titleEm="ledger"
        subtitle="Every deposit, withdrawal and transfer across every wallet, in one place."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View Mode Switcher */}
            <Tabs value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)} variant="segmented">
              <TabsList>
                <TabsTrigger value="list" title="Table List View">
                  <Icon name="list" size={14} />
                </TabsTrigger>
                <TabsTrigger value="grid" title="Card Grid View">
                  <Icon name="grid" size={14} />
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Icon name="fileText" size={14} /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Toolbar Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SingleSelectFilter label="Wallet" options={walletOptions} value={walletId} onChange={setWalletId} />
        <SingleSelectFilter label="Type" options={typeOptions} value={type} onChange={setType} />
        <SingleSelectFilter label="Status" options={statusOptions} value={status} onChange={setStatus} />
        <DateRangePicker range={range} onChange={setRange} placeholder="Any date" />
        <Input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search description…" style={{ maxWidth: 240, marginLeft: 'auto' }}
        />
      </div>

      {viewMode === 'list' ? (
        <SectionCard title="Transactions List" padded={false} collapsible={false}>
          {loading ? (
            <SectionLoading />
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No transactions match these filters.</div>
          ) : (
            <>
              <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Ref', 'Date', 'Type', 'Wallet', 'Description', 'Category', 'Amount', 'Status', 'By', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={`${r.type}-${r.id}`}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setSelectedTx(r)}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink2)' }}>{r.ref || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(r.occurred_at)}</td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={TYPE_VARIANT[r.type] || 'gray'}>{TYPE_LABEL[r.type] || r.type}</Badge></td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{walletsById[r.wallet_id]?.name || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{r.category ? (CATEGORY_LABELS[r.category] || r.category) : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: r.type === 'deposit' ? 'var(--green)' : r.type === 'withdrawal' ? 'var(--red)' : 'var(--ink)' }}>
                        {r.type === 'deposit' ? '+' : r.type === 'withdrawal' ? '-' : ''}{Number(r.amount).toLocaleString()} {walletsById[r.wallet_id]?.currency || ''}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{r.status && <Badge variant={STATUS_VARIANT[r.status] || 'gray'} style={{ textTransform: 'capitalize' }}>{r.status}</Badge>}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{r.actor_id ? (staffById[r.actor_id] || '—') : '—'}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); printVoucher(r); }}>
                          Print <Icon name="printer" size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="transaction" />
            </>
          )}
        </SectionCard>
      ) : (
        /* Card Grid View Mode */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
          {loading ? (
            <SectionLoading />
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No transactions found.</div>
          ) : (
            rows.map(r => {
              const wall = walletsById[r.wallet_id];
              return (
                <div key={`${r.type}-${r.id}`} className="petti-card-interactive" onClick={() => setSelectedTx(r)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Badge variant={TYPE_VARIANT[r.type] || 'gray'}>{TYPE_LABEL[r.type] || r.type}</Badge>
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtDate(r.occurred_at)}</span>
                  </div>

                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--mono)', color: r.type === 'deposit' ? 'var(--green)' : r.type === 'withdrawal' ? 'var(--red)' : 'var(--ink)', marginBottom: 4 }}>
                    {r.type === 'deposit' ? '+' : r.type === 'withdrawal' ? '-' : ''}{Number(r.amount).toLocaleString()} {wall?.currency || ''}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{wall?.name || 'Wallet'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>{r.description || 'No description'}</div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                    {r.status && <Badge variant={STATUS_VARIANT[r.status] || 'gray'}>{r.status}</Badge>}
                    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); printVoucher(r); }}>
                      Print Voucher
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Transaction Detail Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        {selectedTx && (
          <DialogContent className="max-w-md p-6">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 800 }}>Transaction Voucher Detail</DialogTitle>
            </DialogHeader>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
              <div style={{ padding: '16px', background: 'var(--navy)', color: '#fff', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>{TYPE_LABEL[selectedTx.type] || selectedTx.type} Amount</div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {Number(selectedTx.amount).toLocaleString()} {walletsById[selectedTx.wallet_id]?.currency || ''}
                </div>
                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>{selectedTx.ref || selectedTx.id}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Wallet</div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>{walletsById[selectedTx.wallet_id]?.name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Status</div>
                  <div style={{ marginTop: 2 }}><Badge variant={STATUS_VARIANT[selectedTx.status || ''] || 'gray'}>{selectedTx.status || 'Completed'}</Badge></div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Category</div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>{selectedTx.category ? (CATEGORY_LABELS[selectedTx.category] || selectedTx.category) : 'General'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Processed By</div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>{selectedTx.actor_id ? (staffById[selectedTx.actor_id] || 'Staff') : 'Admin'}</div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Description / Purpose</div>
                  <div style={{ fontWeight: 500, color: 'var(--ink)', marginTop: 2 }}>{selectedTx.description || '—'}</div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Date &amp; Time</div>
                  <div style={{ fontWeight: 500, color: 'var(--ink3)', marginTop: 2 }}>{new Date(selectedTx.occurred_at).toLocaleString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <Button variant="outline" onClick={() => setSelectedTx(null)}>Close</Button>
                <Button onClick={() => printVoucher(selectedTx)}>
                  <Icon name="printer" size={14} /> Print Voucher Receipt
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
