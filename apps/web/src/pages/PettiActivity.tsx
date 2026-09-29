import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import type { DateRange } from 'react-day-picker';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; }
interface StaffMember { id: string; name: string; }
interface ActivityRow { id: string; action: string; walletId: string; amount: number; actorId: string | null; at: string; ref: string | null; }

const ACTION_LABEL: Record<string, string> = {
  deposit_recorded: 'Deposit Recorded', withdrawal_requested: 'Withdrawal Requested',
  withdrawal_approved: 'Approved by Dept', withdrawal_rejected: 'Rejected', withdrawal_disbursed: 'Disbursed by Finance',
};
const ACTION_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  deposit_recorded: 'success', withdrawal_requested: 'warning',
  withdrawal_approved: 'info', withdrawal_rejected: 'error', withdrawal_disbursed: 'success',
};

function fmtDateTime(s: string) { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export function PettiActivity() {
  usePageSEO('Activity Logs', 'Complete audit trail of petty cash operations, approvals, rejections, and disbursements.');
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
    apiFetch('/v1/ondi/users').then(setStaff).catch(() => setStaff([]));
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

  const depositCount = useMemo(() => rows.filter(r => r.action === 'deposit_recorded').length, [rows]);
  const disburseCount = useMemo(() => rows.filter(r => r.action === 'withdrawal_disbursed').length, [rows]);

  return (
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Activity']}
        titlePlain="Audit & Activity"
        titleEm="logs"
        subtitle="Chronological audit timeline of every deposit, approval, rejection, and disbursement across all wallets."
      />

      {/* Summary Metrics */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Total Logged Events</span>
            <Icon name="clock" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">{total}</div>
          <div className="petti-stat-sub">
            <span>Audit trail entries</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Deposits Logged</span>
            <Badge variant="success">INFLOW</Badge>
          </div>
          <div className="petti-stat-value" style={{ color: 'var(--green)' }}>{depositCount}</div>
          <div className="petti-stat-sub">
            <span>Top-up records</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Disbursements Executed</span>
            <Badge variant="brand">PAID</Badge>
          </div>
          <div className="petti-stat-value">{disburseCount}</div>
          <div className="petti-stat-sub">
            <span>Approved payouts</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SingleSelectFilter label="Wallet" options={walletOptions} value={walletId} onChange={setWalletId} />
        <SingleSelectFilter label="Processed By" options={actorOptions} value={actorId} onChange={setActorId} />
        <DateRangePicker range={range} onChange={setRange} placeholder="Any date" />
      </div>

      <SectionCard title="Chronological Activity Ledger" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No activity entries match these filters.</div>
        ) : (
          <>
            <div className="petti-table-wrap">
              <table className="petti-table">
                <thead>
                  <tr>
                    {['Ref', 'Date & Time', 'Action Event', 'Target Wallet', 'Amount', 'Actor'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{r.ref || 'â€”'}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmtDateTime(r.at)}</td>
                      <td><Badge variant={ACTION_VARIANT[r.action] || 'gray'}>{ACTION_LABEL[r.action] || r.action}</Badge></td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{walletsById[r.walletId]?.name || 'â€”'}</td>
                      <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--navy)' }}>
                        {r.amount.toLocaleString()} {walletsById[r.walletId]?.currency || ''}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{r.actorId ? (staffById[r.actorId] || 'â€”') : 'System Engine'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="event" />
          </>
        )}
      </SectionCard>
    </div>
  );
}
