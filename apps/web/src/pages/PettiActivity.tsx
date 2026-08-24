import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { apiFetch } from '../lib/api.js';
import type { DateRange } from 'react-day-picker';

interface Wallet { id: string; name: string; currency: string; }
interface StaffMember { id: string; name: string; }
interface ActivityRow { id: string; action: string; walletId: string; amount: number; actorId: string | null; at: string; }

const ACTION_LABEL: Record<string, string> = {
  deposit_recorded: 'Deposit recorded', withdrawal_requested: 'Withdrawal requested',
  withdrawal_approved: 'Approved', withdrawal_rejected: 'Rejected', withdrawal_disbursed: 'Disbursed',
};
const ACTION_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  deposit_recorded: 'success', withdrawal_requested: 'warning',
  withdrawal_approved: 'info', withdrawal_rejected: 'error', withdrawal_disbursed: 'success',
};

function fmtDateTime(s: string) { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export function PettiActivity() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [walletId, setWalletId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    apiFetch('/v1/petti/wallets').then(res => setWallets(res.data || [])).catch(() => setWallets([]));
    apiFetch('/v1/oneid/users').then(setStaff).catch(() => setStaff([]));
  }, []);

  useEffect(() => { setPage(1); }, [walletId, actorId, range]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (walletId) params.set('wallet_id', walletId);
    if (actorId) params.set('actor_id', actorId);
    if (range?.from) params.set('from', range.from.toISOString());
    if (range?.to) params.set('to', range.to.toISOString());
    params.set('limit', String(pageSize));
    params.set('offset', String((page - 1) * pageSize));
    apiFetch(`/v1/petti/activity?${params.toString()}`)
      .then(res => { setRows(res.data || []); setTotal(res.total || 0); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [walletId, actorId, range, page]);

  const walletsById = useMemo(() => Object.fromEntries(wallets.map(w => [w.id, w])), [wallets]);
  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s.name])), [staff]);

  const walletOptions = useMemo(() => wallets.map(w => ({ value: w.id, label: w.name })), [wallets]);
  const actorOptions = useMemo(() => staff.map(s => ({ value: s.id, label: s.name })), [staff]);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Activity']}
        titlePlain="Activity"
        titleEm="log"
        subtitle="Who requested, approved, rejected, disbursed or deposited — every step, every wallet."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SingleSelectFilter label="Wallet" options={walletOptions} value={walletId} onChange={setWalletId} />
        <SingleSelectFilter label="By" options={actorOptions} value={actorId} onChange={setActorId} />
        <DateRangePicker range={range} onChange={setRange} placeholder="Any date" />
      </div>

      <SectionCard title="Activity" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No activity matches these filters.</div>
        ) : (
          <>
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Date & time', 'Action', 'Wallet', 'Amount', 'By'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDateTime(r.at)}</td>
                    <td style={{ padding: '12px 16px' }}><Badge variant={ACTION_VARIANT[r.action] || 'gray'}>{ACTION_LABEL[r.action] || r.action}</Badge></td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink)' }}>{walletsById[r.walletId]?.name || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{r.amount.toLocaleString()} {walletsById[r.walletId]?.currency || ''}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{r.actorId ? (staffById[r.actorId] || '—') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="event" />
          </>
        )}
      </SectionCard>
    </div>
  );
}
