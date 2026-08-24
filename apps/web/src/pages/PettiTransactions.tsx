import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { apiFetch } from '../lib/api.js';
import type { DateRange } from 'react-day-picker';

interface Wallet { id: string; name: string; currency: string; }
interface StaffMember { id: string; name: string; }
interface TxRow {
  id: string; type: 'deposit' | 'withdrawal' | 'transfer'; wallet_id: string;
  amount: string | number; status: string | null; category: string | null;
  description: string | null; actor_id: string | null; occurred_at: string;
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

  useEffect(() => {
    apiFetch('/v1/petti/wallets').then(res => setWallets(res.data || [])).catch(() => setWallets([]));
    apiFetch('/v1/oneid/users').then(setStaff).catch(() => setStaff([]));
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

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Transactions']}
        titlePlain="Transaction"
        titleEm="ledger"
        subtitle="Every deposit, withdrawal and transfer across every wallet, in one place."
      />

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

      <SectionCard title="Transactions" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No transactions match these filters.</div>
        ) : (
          <>
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Date', 'Type', 'Wallet', 'Description', 'Category', 'Amount', 'Status', 'By'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.type}-${r.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(r.occurred_at)}</td>
                    <td style={{ padding: '12px 16px' }}><Badge variant={TYPE_VARIANT[r.type] || 'gray'}>{TYPE_LABEL[r.type] || r.type}</Badge></td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink)' }}>{walletsById[r.wallet_id]?.name || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{r.category ? (CATEGORY_LABELS[r.category] || r.category) : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: r.type === 'deposit' ? 'var(--green)' : r.type === 'withdrawal' ? 'var(--red)' : 'var(--ink)' }}>
                      {r.type === 'deposit' ? '+' : r.type === 'withdrawal' ? '-' : ''}{Number(r.amount).toLocaleString()} {walletsById[r.wallet_id]?.currency || ''}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{r.status && <Badge variant={STATUS_VARIANT[r.status] || 'gray'} style={{ textTransform: 'capitalize' }}>{r.status}</Badge>}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{r.actor_id ? (staffById[r.actor_id] || '—') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="transaction" />
          </>
        )}
      </SectionCard>
    </div>
  );
}
