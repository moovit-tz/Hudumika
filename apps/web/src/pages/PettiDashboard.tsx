import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { MetricsRow, type MetricCardProps } from '../components/MetricCard.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { apiFetch } from '../lib/api.js';

interface Wallet { id: string; name: string; currency: string; status: 'active' | 'closed'; balance: number; }
interface Deposit { id: string; wallet_id: string; amount: string | number; recorded_by: string | null; created_at: string; }
interface Withdrawal {
  id: string; wallet_id: string; amount: string | number; purpose: string; status: string;
  requested_by: string; requested_at: string; approved_by: string | null; approved_at: string | null;
  disbursed_by: string | null; disbursed_at: string | null;
}
interface StaffMember { id: string; name: string; }

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', approved: 'info', disbursed: 'success', rejected: 'error', deposited: 'success',
};

function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }

/** Buckets amounts into the last `weeks` Monday-start weeks (oldest first),
 *  for MetricCard's sparkline. Real history only — MetricCard itself omits
 *  the sparkline entirely when every bucket is empty, never fabricating one. */
function weeklyBars(rows: { amount: string | number; at: string }[], weeks = 8): number[] {
  const now = new Date();
  const dayMs = 86400000;
  const weekIndex = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / (7 * dayMs));
  const buckets = new Array(weeks).fill(0);
  for (const r of rows) {
    const idx = weekIndex(r.at);
    if (idx >= 0 && idx < weeks) buckets[weeks - 1 - idx] += Number(r.amount) || 0;
  }
  return buckets;
}

export function PettiDashboard() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [openFlagCount, setOpenFlagCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/wallets').then(res => res.data || []).catch(() => []),
      apiFetch('/v1/petti/deposits').then(res => res.data || []).catch(() => []),
      apiFetch('/v1/petti/withdrawals').then(res => res.data || []).catch(() => []),
      apiFetch('/v1/oneid/users').catch(() => []),
      apiFetch('/v1/petti/flags?status=open').then(res => res.data || []).catch(() => []),
    ]).then(([w, d, wd, s, flgs]) => {
      setWallets(w); setDeposits(d); setWithdrawals(wd); setStaff(s); setOpenFlagCount(flgs.length);
    }).finally(() => setLoading(false));
  }, []);

  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s.name])), [staff]);
  const walletsById = useMemo(() => Object.fromEntries(wallets.map(w => [w.id, w])), [wallets]);

  const currencyGroups = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const currencies = Array.from(new Set(wallets.map(w => w.currency)));
    return currencies.map(currency => {
      const walletIds = new Set(wallets.filter(w => w.currency === currency).map(w => w.id));
      const balance = wallets.filter(w => w.currency === currency && w.status === 'active').reduce((s, w) => s + w.balance, 0);

      const currDeposits = deposits.filter(d => walletIds.has(d.wallet_id));
      const currWithdrawals = withdrawals.filter(w => walletIds.has(w.wallet_id));

      const pending = currWithdrawals.filter(w => w.status === 'pending' || w.status === 'approved');
      const pendingAmount = pending.reduce((s, w) => s + Number(w.amount), 0);

      const depositedThisMonth = currDeposits.filter(d => new Date(d.created_at) >= monthStart).reduce((s, d) => s + Number(d.amount), 0);
      const depositedLastMonth = currDeposits.filter(d => new Date(d.created_at) >= lastMonthStart && new Date(d.created_at) < monthStart).reduce((s, d) => s + Number(d.amount), 0);
      const depositTrend = depositedLastMonth > 0 ? ((depositedThisMonth - depositedLastMonth) / depositedLastMonth) * 100 : 0;

      const disbursed = currWithdrawals.filter(w => w.status === 'disbursed' && w.disbursed_at);
      const disbursedThisMonth = disbursed.filter(w => new Date(w.disbursed_at!) >= monthStart).reduce((s, w) => s + Number(w.amount), 0);
      const disbursedLastMonth = disbursed.filter(w => new Date(w.disbursed_at!) >= lastMonthStart && new Date(w.disbursed_at!) < monthStart).reduce((s, w) => s + Number(w.amount), 0);
      const disburseTrend = disbursedLastMonth > 0 ? ((disbursedThisMonth - disbursedLastMonth) / disbursedLastMonth) * 100 : 0;

      const depositBars = weeklyBars(currDeposits.map(d => ({ amount: d.amount, at: d.created_at })));
      const disburseBars = weeklyBars(disbursed.map(w => ({ amount: w.amount, at: w.disbursed_at! })));
      const hasDepositHistory = depositBars.some(v => v > 0);
      const hasDisburseHistory = disburseBars.some(v => v > 0);

      const cards: MetricCardProps[] = [
        { title: `Balance (${currency})`, value: `${balance.toLocaleString()} ${currency}`, icon: 'wallet', barHighlight: 'var(--teal)' },
        { title: 'Pending action', value: `${pendingAmount.toLocaleString()} ${currency}`, sub1Label: 'REQUESTS', sub1Value: String(pending.length), icon: 'clock', barHighlight: 'var(--gold)' },
        { title: 'Deposited', value: `${depositedThisMonth.toLocaleString()} ${currency}`, trend: depositTrend, sub1Value: `${depositedThisMonth.toLocaleString()} ${currency}`, sub2Value: `${depositedLastMonth.toLocaleString()} ${currency}`, sub1Label: 'THIS MONTH', sub2Label: 'LAST MONTH', bars: hasDepositHistory ? depositBars : undefined, barHighlight: 'var(--green)' },
        { title: 'Disbursed', value: `${disbursedThisMonth.toLocaleString()} ${currency}`, trend: disburseTrend, invertTrend: true, sub1Value: `${disbursedThisMonth.toLocaleString()} ${currency}`, sub2Value: `${disbursedLastMonth.toLocaleString()} ${currency}`, sub1Label: 'THIS MONTH', sub2Label: 'LAST MONTH', bars: hasDisburseHistory ? disburseBars : undefined, barHighlight: 'var(--red)' },
      ];
      return { currency, cards };
    });
  }, [wallets, deposits, withdrawals]);

  const recentActivity = useMemo(() => {
    type Event = { id: string; wallet: string; text: string; actor: string; at: string; status: string };
    const events: Event[] = [];
    for (const d of deposits) {
      events.push({
        id: `dep-${d.id}`, wallet: walletsById[d.wallet_id]?.name || '—',
        text: `deposited ${Number(d.amount).toLocaleString()} ${walletsById[d.wallet_id]?.currency || ''}`,
        actor: staffById[d.recorded_by || ''] || 'Someone', at: d.created_at, status: 'deposited',
      });
    }
    for (const w of withdrawals) {
      const isLatestDisbursed = w.status === 'disbursed' && w.disbursed_at;
      const isLatestApproval = (w.status === 'approved' || w.status === 'rejected') && w.approved_at;
      const at = isLatestDisbursed ? w.disbursed_at! : isLatestApproval ? w.approved_at! : w.requested_at;
      const actorId = isLatestDisbursed ? w.disbursed_by : isLatestApproval ? w.approved_by : w.requested_by;
      const verb = w.status === 'disbursed' ? 'disbursed' : w.status === 'approved' ? 'approved' : w.status === 'rejected' ? 'rejected' : 'requested';
      events.push({
        id: `wd-${w.id}`, wallet: walletsById[w.wallet_id]?.name || '—',
        text: `${verb} ${Number(w.amount).toLocaleString()} ${walletsById[w.wallet_id]?.currency || ''} for "${w.purpose}"`,
        actor: staffById[actorId || ''] || 'Someone', at, status: w.status,
      });
    }
    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);
  }, [deposits, withdrawals, walletsById, staffById]);

  if (loading) return <SkeletonPage variant="dashboard" />;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Dashboard']}
        titlePlain="Petty cash"
        titleEm="overview"
        subtitle="Balances, pending approvals and this month's movement across every wallet."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {openFlagCount > 0 && (
              <Badge variant="warning"><Icon name="flag" size={11} /> {openFlagCount} open flag{openFlagCount === 1 ? '' : 's'}</Badge>
            )}
            <Link to="/petti/wallets"><span className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="wallet" size={14} /> All wallets</span></Link>
          </div>
        }
      />

      {wallets.length === 0 ? (
        <SectionCard title="Get started" collapsible={false}>
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>
            No wallets yet. <Link to="/petti/wallets" style={{ color: 'var(--teal)' }}>Create one</Link> to start tracking petty cash.
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
          {currencyGroups.map(g => (
            <div key={g.currency}>
              {currencyGroups.length > 1 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{g.currency}</div>
              )}
              <MetricsRow cards={g.cards} />
            </div>
          ))}
        </div>
      )}

      <SectionCard title="Recent activity" padded={false} collapsible={false}>
        {recentActivity.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No activity yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentActivity.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <Badge variant={STATUS_VARIANT[e.status] || 'gray'} style={{ textTransform: 'capitalize', flexShrink: 0 }}>{e.status}</Badge>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)' }}>
                  <strong>{e.actor}</strong> {e.text} <span style={{ color: 'var(--ink3)' }}>· {e.wallet}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>{fmtDate(e.at)}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
