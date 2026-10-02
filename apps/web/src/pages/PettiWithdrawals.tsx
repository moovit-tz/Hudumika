import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Input } from '../components/ui/input.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; balance: number; }
interface GatewayStatus { configured: boolean; provider: string | null; label: string | null; chargeSupported: boolean }
interface Withdrawal {
  id: string; wallet_id: string; amount: string | number; purpose: string; category?: string; status: string;
  requested_by: string; requested_at: string; approved_by: string | null; approved_at: string | null;
  disbursed_by: string | null; disbursed_at: string | null; payee_name?: string | null; ref: string | null;
}

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', approved: 'info', disbursed: 'success', rejected: 'error',
};

const PRESET_AMOUNTS = [25000, 50000, 100000, 250000];

export function PettiWithdrawals() {
  usePageSEO('Withdrawals', 'Withdraw money, view withdrawal list and configure withdrawal payment channels.');
  const [activeTab, setActiveTab] = useState<'list' | 'withdraw' | 'settings'>('list');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  /* Form State */
  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [saving, setSaving] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({ configured: false, provider: null, label: null, chargeSupported: false });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/wallets').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/withdrawals').then(r => r.data || []).catch(() => []),
    ]).then(([w, wd]) => {
      setWallets(w); setWithdrawals(wd);
      if (w.length > 0 && !walletId) setWalletId(w[0].id);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { apiFetch('/v1/petti/gateway-status').then(setGatewayStatus).catch(() => {}); }, []);

  const totalWithdrawnVolume = useMemo(() => {
    return withdrawals.filter(w => w.status === 'disbursed').reduce((s, w) => s + Number(w.amount || 0), 0);
  }, [withdrawals]);

  const pendingCount = useMemo(() => withdrawals.filter(w => w.status === 'pending').length, [withdrawals]);

  async function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletId || !amount || Number(amount) <= 0 || !purpose.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${walletId}/withdrawals`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          purpose: purpose.trim(),
          payee_name: payeeName.trim() || undefined,
        }),
      });
      showAlert('Withdrawal request submitted for approval.', { variant: 'success' });
      setAmount(''); setPurpose(''); setPayeeName('');
      setActiveTab('list');
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to submit withdrawal request.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Activities', 'Withdrawals']}
        titlePlain="Cash"
        titleEm="withdrawals"
        subtitle="Manage petty cash disbursements, view authorization queues, and inspect payout channels."
      />

      {/* Summary Metrics */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Total Disbursed Volume</span>
            <Badge variant="success">PAID</Badge>
          </div>
          <div className="petti-stat-value" style={{ color: 'var(--red)' }}>
            -{totalWithdrawnVolume.toLocaleString()}
          </div>
          <div className="petti-stat-sub">
            <span>Posted into FinOps Expenses</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Pending Approval</span>
            <Badge variant={pendingCount > 0 ? 'warning' : 'gray'}>{pendingCount} In Queue</Badge>
          </div>
          <div className="petti-stat-value">{pendingCount}</div>
          <div className="petti-stat-sub">
            <span>Vouchers awaiting sign-off</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Total Withdrawals</span>
            <Icon name="fileText" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">{withdrawals.length}</div>
          <div className="petti-stat-sub">
            <span>All historical claims</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} variant="segmented">
        <TabsList>
          {[
            { key: 'list', label: 'Withdrawal List', icon: 'list' },
            { key: 'withdraw', label: 'Initiate Withdrawal', icon: 'plus' },
            { key: 'settings', label: 'Channels & Settings', icon: 'grid' },
          ].map(t => (
            <TabsTrigger key={t.key} value={t.key}>
              <Icon name={t.icon as any} size={14} /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeTab === 'list' && (
        <SectionCard title="Withdrawal Transactions List" padded={false} collapsible={false}>
          {withdrawals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No withdrawals recorded yet.</div>
          ) : (
            <div className="petti-table-wrap">
              <table className="petti-table">
                <thead>
                  <tr>
                    {['Ref', 'Date', 'Wallet', 'Purpose', 'Payee', 'Amount', 'Status'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map(w => {
                    const wall = wallets.find(x => x.id === w.wallet_id);
                    return (
                      <tr key={w.id}>
                        <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{w.ref || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{new Date(w.requested_at).toLocaleString()}</td>
                        <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{wall?.name || 'Wallet'}</td>
                        <td style={{ color: 'var(--ink)' }}>{w.purpose}</td>
                        <td style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{w.payee_name || '—'}</td>
                        <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--red)' }}>
                          -{Number(w.amount).toLocaleString()} {wall?.currency || ''}
                        </td>
                        <td><Badge variant={STATUS_VARIANT[w.status] || 'gray'}>{w.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'withdraw' && (
        <SectionCard title="Initiate Cash Withdrawal" collapsible={false}>
          <form onSubmit={handleWithdrawSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 580 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Source Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${Number(w.balance).toLocaleString()} ${w.currency})` }))}
                value={walletId}
                onChange={setWalletId}
                placeholder="Select wallet…"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Withdrawal Amount *</label>
              <Input type="number" required min="1" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter withdrawal amount" />
              
              {/* Preset Chips */}
              <div className="petti-amount-chips">
                {PRESET_AMOUNTS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className="petti-amount-chip"
                    onClick={() => setAmount(String(preset))}
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payee / Beneficiary Name (Optional)</label>
              <Input value={payeeName} onChange={e => setPayeeName(e.target.value)} placeholder="e.g. Shell Station Mwenge / Office Supplies Ltd" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Purpose / Notes *</label>
              <Input required value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Reason for cash disbursement" />
            </div>

            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink3)' }}>
              Submitting creates a pending voucher for department authorization and finance release.
            </p>

            <Button type="submit" variant="destructive" disabled={saving} style={{ padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="minus" size={16} /> {saving ? 'Submitting…' : 'Submit Withdrawal Request'}
            </Button>
          </form>
        </SectionCard>
      )}

      {activeTab === 'settings' && (
        <SectionCard title="Disbursement Channels & Gateways" collapsible={false}>
          <p style={{ margin: '0 0 16px 0', fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5 }}>
            Petti disbursements are issued directly upon authorized sign-off, recorded immediately in <strong>FinOps Expenses</strong>. Connected gateways below manage incoming liquidity and multi-channel deposits.
          </p>
          {gatewayStatus.configured ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
              <FeaturedIcon variant={gatewayStatus.chargeSupported ? 'success' : 'warning'} size="md"><Icon name="creditCard" size={18} /></FeaturedIcon>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{gatewayStatus.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{gatewayStatus.chargeSupported ? 'Live deposit charges active.' : 'Connected gateway channel.'}</div>
              </div>
              <Link to="/workspace/settings?s=payment-gateways">
                <Button variant="outline" size="sm">Manage Gateway</Button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
              <FeaturedIcon variant="gray" size="md"><Icon name="creditCard" size={18} /></FeaturedIcon>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>No Payment Gateway Connected</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Deposits and disbursements operate via direct manual records.</div>
              </div>
              <Link to="/workspace/settings?s=payment-gateways">
                <Button variant="outline" size="sm">Connect Gateway</Button>
              </Link>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
