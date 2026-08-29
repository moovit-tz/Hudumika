import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon, type IconName } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { MetricsRow, type MetricCardProps } from '../components/MetricCard.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { showAlert } from '../lib/alert.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; status: 'active' | 'closed'; balance: number; description?: string | null; }
interface Deposit { id: string; wallet_id: string; amount: string | number; recorded_by: string | null; created_at: string; method?: string; reference?: string | null; ref?: string | null; }
interface Withdrawal {
  id: string; wallet_id: string; amount: string | number; purpose: string; category?: string; status: string;
  requested_by: string; requested_at: string; approved_by: string | null; approved_at: string | null;
  disbursed_by: string | null; disbursed_at: string | null; payee_name?: string | null; ref?: string | null;
}
interface StaffMember { id: string; name: string; role?: string; }

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', approved: 'info', disbursed: 'success', rejected: 'error', deposited: 'success',
};

const CATEGORY_LABELS: Record<string, string> = {
  OFFICE_SUPPLIES: 'Office supplies',
  TRANSPORT: 'Transport',
  MEALS_ENTERTAINMENT: 'Meals & entertainment',
  UTILITIES: 'Utilities',
  STAFF_WELFARE: 'Staff welfare',
  REPAIRS_MAINTENANCE: 'Repairs & maintenance',
  POSTAGE_COURIER: 'Postage & courier',
  MISCELLANEOUS: 'Miscellaneous',
};

function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }

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

/**
 * PayMoney & DigiKash inspired Petti Cash Overview Dashboard.
 * Retains 100% backend API compliance with /v1/petti/* endpoints.
 */
export function PettiDashboard() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [openFlagCount, setOpenFlagCount] = useState(0);
  const [loading, setLoading] = useState(true);

  /* Modal States */
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositWalletId, setDepositWalletId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<'manual' | 'gateway'>('manual');
  const [depositPhone, setDepositPhone] = useState('');
  const [depositRef, setDepositRef] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositSaving, setDepositSaving] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<{ configured: boolean; provider: string | null; label: string | null; chargeSupported: boolean }>({ configured: false, provider: null, label: null, chargeSupported: false });

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestWalletId, setRequestWalletId] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestCategory, setRequestCategory] = useState('OFFICE_SUPPLIES');
  const [requestPurpose, setRequestPurpose] = useState('');
  const [requestPayee, setRequestPayee] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/wallets').then(res => res.data || []).catch(() => []),
      apiFetch('/v1/petti/deposits').then(res => res.data || []).catch(() => []),
      apiFetch('/v1/petti/withdrawals').then(res => res.data || []).catch(() => []),
      apiFetch('/v1/oneid/users').catch(() => []),
      apiFetch('/v1/petti/flags?status=open').then(res => res.data || []).catch(() => []),
    ]).then(([w, d, wd, s, flgs]) => {
      setWallets(w); setDeposits(d); setWithdrawals(wd); setStaff(s); setOpenFlagCount(flgs.length);
      if (w.length > 0) {
        setDepositWalletId(w[0].id);
        setRequestWalletId(w[0].id);
        setTransferFromId(w[0].id);
        if (w.length > 1) setTransferToId(w[1].id);
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    apiFetch('/v1/petti/gateway-status').then(setGatewayStatus).catch(() => {});
  }, []);

  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s.name])), [staff]);
  const walletsById = useMemo(() => Object.fromEntries(wallets.map(w => [w.id, w])), [wallets]);

  const pendingQueue = useMemo(() => {
    return withdrawals.filter(w => w.status === 'pending' || w.status === 'approved');
  }, [withdrawals]);

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
        { title: `Liquidity (${currency})`, value: `${balance.toLocaleString()} ${currency}`, icon: 'wallet', barHighlight: 'var(--teal)' },
        { title: 'Pending Vouchers', value: `${pendingAmount.toLocaleString()} ${currency}`, sub1Label: 'REQUESTS', sub1Value: String(pending.length), icon: 'clock', barHighlight: 'var(--gold)' },
        { title: 'Deposits In', value: `${depositedThisMonth.toLocaleString()} ${currency}`, trend: depositTrend, sub1Value: `${depositedThisMonth.toLocaleString()} ${currency}`, sub2Value: `${depositedLastMonth.toLocaleString()} ${currency}`, sub1Label: 'THIS MONTH', sub2Label: 'LAST MONTH', bars: hasDepositHistory ? depositBars : undefined, barHighlight: 'var(--green)' },
        { title: 'Disbursements Out', value: `${disbursedThisMonth.toLocaleString()} ${currency}`, trend: disburseTrend, invertTrend: true, sub1Value: `${disbursedThisMonth.toLocaleString()} ${currency}`, sub2Value: `${disbursedLastMonth.toLocaleString()} ${currency}`, sub1Label: 'THIS MONTH', sub2Label: 'LAST MONTH', bars: hasDisburseHistory ? disburseBars : undefined, barHighlight: 'var(--red)' },
      ];
      return { currency, cards };
    });
  }, [wallets, deposits, withdrawals]);

  const recentActivity = useMemo(() => {
    type Event = { id: string; wallet: string; text: string; actor: string; at: string; status: string; ref: string | null };
    const events: Event[] = [];
    for (const d of deposits) {
      events.push({
        id: `dep-${d.id}`, wallet: walletsById[d.wallet_id]?.name || '—',
        text: `deposited ${Number(d.amount).toLocaleString()} ${walletsById[d.wallet_id]?.currency || ''}`,
        actor: staffById[d.recorded_by || ''] || 'Finance Admin', at: d.created_at, status: 'deposited', ref: d.ref ?? null,
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
        actor: staffById[actorId || ''] || 'Staff Member', at, status: w.status, ref: w.ref ?? null,
      });
    }
    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12);
  }, [deposits, withdrawals, walletsById, staffById]);

  /* Action Handlers */
  async function handleDepositSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositWalletId || !depositAmount || Number(depositAmount) <= 0) return;
    if (depositMethod === 'gateway' && !depositPhone.trim()) return;
    setDepositSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${depositWalletId}/deposits`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(depositAmount),
          method: depositMethod,
          gateway_provider: depositMethod === 'gateway' ? gatewayStatus.provider ?? undefined : undefined,
          payer_msisdn: depositMethod === 'gateway' ? depositPhone.trim() : undefined,
          reference: depositRef || undefined,
          note: depositNote || undefined
        })
      });
      showAlert('Deposit recorded successfully.', { variant: 'success' });
      setDepositAmount(''); setDepositRef(''); setDepositNote(''); setDepositPhone('');
      setDepositModalOpen(false);
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to record deposit');
    } finally {
      setDepositSaving(false);
    }
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestWalletId || !requestAmount || Number(requestAmount) <= 0 || !requestPurpose) return;
    setRequestSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${requestWalletId}/withdrawals`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(requestAmount),
          category: requestCategory,
          purpose: requestPurpose.trim(),
          payee_name: requestPayee.trim() || undefined
        })
      });
      showAlert('Cash request submitted for approval.', { variant: 'success' });
      setRequestAmount(''); setRequestPurpose(''); setRequestPayee('');
      setRequestModalOpen(false);
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to submit cash request');
    } finally {
      setRequestSaving(false);
    }
  }

  async function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!transferFromId || !transferToId || transferFromId === transferToId || !transferAmount || Number(transferAmount) <= 0) return;
    setTransferSaving(true);
    try {
      await apiFetch('/v1/petti/transfers', {
        method: 'POST',
        body: JSON.stringify({
          from_wallet_id: transferFromId,
          to_wallet_id: transferToId,
          amount: Number(transferAmount),
          note: transferNote || undefined
        })
      });
      showAlert('Transfer completed successfully.', { variant: 'success' });
      setTransferAmount(''); setTransferNote('');
      setTransferModalOpen(false);
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to complete inter-wallet transfer');
    } finally {
      setTransferSaving(false);
    }
  }

  async function handleVoucherAction(id: string, action: 'approve' | 'disburse' | 'reject') {
    setActionBusyId(id);
    try {
      await apiFetch(`/v1/petti/withdrawals/${id}/${action}`, { method: 'POST' });
      showAlert(`Voucher ${action === 'disburse' ? 'disbursed' : action + 'd'} successfully.`, { variant: 'success' });
      loadData();
    } catch (err: any) {
      showAlert(err?.message || `Failed to ${action} voucher`);
    } finally {
      setActionBusyId(null);
    }
  }

  if (loading) return <SkeletonPage variant="dashboard" />;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 24px 4px' }}>

      <PageHeader
        crumbs={['Petti', 'Dashboard']}
        titlePlain="Petty cash"
        titleEm="operations"
        subtitle="Multi-currency wallets, deposits, voucher requests and inter-wallet transfers across your workspace."
      />

      {/* ── PayMoney & DigiKash Command Header Hero Banner ───────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0e1f3d 0%, #1e1b4b 45%, #0d7a6b 100%)',
        borderRadius: 16,
        padding: '28px 32px',
        color: '#ffffff',
        marginBottom: 24,
        boxShadow: '0 10px 30px rgba(14,31,61,0.2)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 260, height: 260,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)', pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
              }}>
                <Icon name="wallet" size={18} color="#ffffff" />
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                PayMoney &amp; DigiKash Petty Hub
              </span>
              {openFlagCount > 0 && (
                <Badge variant="warning" style={{ background: 'rgba(245,158,11,0.25)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)' }}>
                  <Icon name="flag" size={11} /> {openFlagCount} open flag{openFlagCount === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
              Manage multi-currency wallets, instant top-ups, voucher approval flows, and DigiKash mobile money/bank disbursement channels.
            </p>
          </div>

          {/* Quick Actions Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setDepositModalOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
                background: '#ffffff', color: 'var(--navy)', border: 'none',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
            >
              <Icon name="plus" size={15} /> + Deposit Funds
            </button>

            <button
              type="button"
              onClick={() => setRequestModalOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: '#ffffff', border: 'none',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
              }}
            >
              <Icon name="fileText" size={15} /> 💸 Request Cash
            </button>

            {wallets.length > 1 && (
              <button
                type="button"
                onClick={() => setTransferModalOpen(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)'
                }}
              >
                <Icon name="refresh" size={15} /> Inter-Wallet Transfer
              </button>
            )}

            <Link to="/petti/wallets" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
              background: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)',
              fontSize: 13, fontWeight: 600, textDecoration: 'none', backdropFilter: 'blur(4px)'
            }}>
              <Icon name="wallet" size={15} /> All Wallets
            </Link>
          </div>
        </div>
      </div>

      {/* ── PayMoney Multi-Currency Liquidity KPI Cards ──────────────────── */}
      {wallets.length === 0 ? (
        <SectionCard title="Get started with Petti" collapsible={false}>
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>
            No petty cash wallets configured yet. <Link to="/petti/wallets" style={{ color: 'var(--teal)', fontWeight: 700 }}>Create your first wallet</Link> to manage liquidity, top-ups, and disbursements.
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
          {currencyGroups.map(g => (
            <div key={g.currency}>
              {currencyGroups.length > 1 && (
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  {g.currency} Liquidity Overview
                </div>
              )}
              <MetricsRow cards={g.cards} />
            </div>
          ))}
        </div>
      )}

      {/* ── Payment Gateway Status — real, from Settings ▸ Finance ▸ Payment
          Gateways via GET /v1/petti/gateway-status. Used to fabricate a
          fixed list of 6 "Active" providers regardless of tenant config. ── */}
      <div style={{ marginBottom: 24 }}>
      <SectionCard
        title="Deposit Channel"
        action={
          <Badge variant={gatewayStatus.configured ? (gatewayStatus.chargeSupported ? 'success' : 'warning') : 'gray'}>
            <Icon name={gatewayStatus.configured ? 'check' : 'x'} size={11} />
            {gatewayStatus.configured ? '1 Gateway Connected' : 'No Gateway Connected'}
          </Badge>
        }
      >
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>The payment gateway this workspace has connected for mobile-money deposits</div>

        {gatewayStatus.configured ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <FeaturedIcon variant={gatewayStatus.chargeSupported ? 'success' : 'warning'} size="md"><Icon name="creditCard" size={18} /></FeaturedIcon>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{gatewayStatus.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                {gatewayStatus.chargeSupported
                  ? 'Live charges are supported — the Deposit form can push a real payment request.'
                  : 'Configured, but live charge-processing for this provider isn\'t wired into the platform yet — deposits must still be recorded manually.'}
              </div>
            </div>
            <Link to="/workspace/settings?s=payment-gateways" className="btn btn-secondary btn-sm">Manage</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', border: '1px dashed var(--border2)', borderRadius: 10, padding: '14px 16px' }}>
            <FeaturedIcon variant="gray" size="md"><Icon name="creditCard" size={18} /></FeaturedIcon>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>No payment gateway connected</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Deposits are recorded manually until one is connected — that still works, it's just not automatic.</div>
            </div>
            <Link to="/workspace/settings?s=payment-gateways" className="btn btn-secondary btn-sm">Connect a gateway</Link>
          </div>
        )}
      </SectionCard>
      </div>

      {/* ── Main 2-Column Dashboard Grid: Approval Queue & Activity ─────── */}
      <div className={pendingQueue.length > 0 ? 'petti-grid-2col' : ''} style={{ marginBottom: 24 }}>
        
        {/* ── Pending Voucher Approval Queue (PayMoney Signature) ───────── */}
        {pendingQueue.length > 0 && (
          <SectionCard
            padded={false}
            title={`Pending Voucher Approval Queue (${pendingQueue.length})`}
            action={<Link to="/petti/wallets" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>View All Wallets →</Link>}
          >
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingQueue.map(w => {
                const wallet = walletsById[w.wallet_id];
                const applicantName = staffById[w.requested_by] || 'Staff Member';
                const isPendingApproval = w.status === 'pending';
                const isApprovedReadyDisburse = w.status === 'approved';

                return (
                  <div key={w.id} style={{ padding: '14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                          {applicantName} — <span style={{ color: 'var(--teal)' }}>{Number(w.amount).toLocaleString()} {wallet?.currency || 'TZS'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                          Purpose: "{w.purpose}" • Category: {CATEGORY_LABELS[w.category || ''] || w.category || 'General'}
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANT[w.status] || 'gray'}>{w.status}</Badge>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                        Wallet: <strong>{wallet?.name || '—'}</strong> • {fmtDate(w.requested_at)}
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        {isPendingApproval && (
                          <>
                            <Button
                              size="sm"
                              disabled={actionBusyId === w.id}
                              onClick={() => handleVoucherAction(w.id, 'approve')}
                              style={{ background: 'var(--blue)', color: '#fff', fontSize: 11.5, height: 28, padding: '0 10px' }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionBusyId === w.id}
                              onClick={() => handleVoucherAction(w.id, 'reject')}
                              style={{ color: 'var(--red)', fontSize: 11.5, height: 28, padding: '0 10px' }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {isApprovedReadyDisburse && (
                          <Button
                            size="sm"
                            disabled={actionBusyId === w.id}
                            onClick={() => handleVoucherAction(w.id, 'disburse')}
                            style={{ background: 'var(--green)', color: '#fff', fontSize: 11.5, height: 28, padding: '0 10px' }}
                          >
                            Disburse Funds
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ── Recent Financial Activity Feed ──────────────────────────── */}
        <SectionCard
          padded={false}
          title="Recent Financial Activity"
          action={<span style={{ fontSize: 12, color: 'var(--ink3)' }}>Audit Stream</span>}
        >
          {recentActivity.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No activity recorded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentActivity.map((e, idx) => (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                  borderBottom: idx < recentActivity.length - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  <Badge variant={STATUS_VARIANT[e.status] || 'gray'} style={{ textTransform: 'capitalize', flexShrink: 0, minWidth: 70, textAlign: 'center' }}>
                    {e.status}
                  </Badge>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)' }}>
                    <strong>{e.actor}</strong> {e.text} <span style={{ color: 'var(--ink3)', fontSize: 12 }}>· {e.wallet}{e.ref ? ` · ${e.ref}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>{fmtDate(e.at)}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>

      {/* ── MODALS (Deposit, Request Cash, Inter-Wallet Transfer) ──────── */}

      {/* Deposit Modal */}
      <Dialog open={depositModalOpen} onOpenChange={setDepositModalOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle style={{ fontSize: 18, fontWeight: 800 }}>Deposit Funds to Wallet</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDepositSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Select Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                value={depositWalletId}
                onChange={setDepositWalletId}
                placeholder="Select wallet…"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Deposit Amount *</label>
              <input
                type="number" required min="1" step="any"
                value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                placeholder="e.g. 500000"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>How was this money received? *</label>
              <Select value={depositMethod} onValueChange={v => setDepositMethod(v as 'manual' | 'gateway')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual — bank transfer, cash, or already confirmed another way</SelectItem>
                  {gatewayStatus.configured && (
                    <SelectItem value="gateway" disabled={!gatewayStatus.chargeSupported}>
                      {gatewayStatus.label} {gatewayStatus.chargeSupported ? '— push a payment request' : '(not yet supported for live charges)'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {!gatewayStatus.configured && (
                <p style={{ margin: '5px 0 0 0', fontSize: 11, color: 'var(--ink3)' }}>
                  No payment gateway is connected for this workspace yet — <Link to="/workspace/settings?s=payment-gateways" style={{ color: 'var(--teal)' }}>connect one</Link> to push live mobile-money requests instead of recording deposits manually.
                </p>
              )}
            </div>

            {depositMethod === 'gateway' && gatewayStatus.chargeSupported && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Payer Phone Number *</label>
                <input
                  type="tel" required
                  value={depositPhone} onChange={e => setDepositPhone(e.target.value)}
                  placeholder="e.g. 0712345678"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                />
                <p style={{ margin: '5px 0 0 0', fontSize: 11, color: 'var(--ink3)' }}>A {gatewayStatus.label} payment request will be pushed to this number.</p>
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Reference Number</label>
              <input
                type="text"
                value={depositRef} onChange={e => setDepositRef(e.target.value)}
                placeholder="e.g. MPESA-REF-904821"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Deposit Note</label>
              <input
                type="text"
                value={depositNote} onChange={e => setDepositNote(e.target.value)}
                placeholder="e.g. Weekly replenishment for site operations"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="outline" onClick={() => setDepositModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={depositSaving}>
                {depositSaving ? 'Recording…' : 'Record Deposit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cash Voucher Request Modal */}
      <Dialog open={requestModalOpen} onOpenChange={setRequestModalOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle style={{ fontSize: 18, fontWeight: 800 }}>Request Petty Cash Voucher</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Select Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                value={requestWalletId}
                onChange={setRequestWalletId}
                placeholder="Select wallet…"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Requested Amount *</label>
              <input
                type="number" required min="1" step="any"
                value={requestAmount} onChange={e => setRequestAmount(e.target.value)}
                placeholder="e.g. 75000"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Expense Category</label>
              <Select value={requestCategory} onValueChange={setRequestCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Purpose / Justification *</label>
              <input
                type="text" required
                value={requestPurpose} onChange={e => setRequestPurpose(e.target.value)}
                placeholder="e.g. Emergency fuel for delivery van"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Payee Name (Optional)</label>
              <input
                type="text"
                value={requestPayee} onChange={e => setRequestPayee(e.target.value)}
                placeholder="e.g. Shell Station Mwenge"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="outline" onClick={() => setRequestModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={requestSaving} style={{ background: 'var(--green)', color: '#fff' }}>
                {requestSaving ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inter-Wallet Transfer Modal */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle style={{ fontSize: 18, fontWeight: 800 }}>Inter-Wallet Transfer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>From Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                value={transferFromId}
                onChange={setTransferFromId}
                placeholder="Select wallet…"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>To Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                value={transferToId}
                onChange={setTransferToId}
                placeholder="Select wallet…"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Transfer Amount *</label>
              <input
                type="number" required min="1" step="any"
                value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                placeholder="e.g. 200000"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Transfer Reason / Note</label>
              <input
                type="text"
                value={transferNote} onChange={e => setTransferNote(e.target.value)}
                placeholder="e.g. Rebalance operational funds"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="outline" onClick={() => setTransferModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={transferSaving}>
                {transferSaving ? 'Transferring…' : 'Execute Transfer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
