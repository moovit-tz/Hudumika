import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';

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

export function PettiWithdrawals() {
  usePageSEO('Withdrawals', 'Withdraw money, view withdrawal list and configure withdrawal payment channels.');
  const [activeTab, setActiveTab] = useState<'withdraw' | 'list' | 'settings'>('list');
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

  async function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletId || !amount || Number(amount) <= 0 || !purpose) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${walletId}/withdrawals`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          purpose,
          payee_name: payeeName.trim() || undefined,
        }),
      });
      showAlert('Withdrawal request submitted for approval.');
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
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Activities', 'Withdrawals']}
        titlePlain="Withdrawals"
        titleEm="management"
        subtitle="Withdraw cash from petty wallets, view withdrawal logs and manage disbursement channels."
      />

      {/* PayMoney Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} variant="segmented">
        <TabsList style={{ marginBottom: 20 }}>
          {[
            { key: 'list', label: 'Withdrawal List', icon: 'list' },
            { key: 'withdraw', label: 'Withdraw Money', icon: 'plus' },
            { key: 'settings', label: 'Withdrawal Settings & Channels', icon: 'grid' },
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
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Ref', 'Date', 'Wallet', 'Purpose', 'Amount', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {withdrawals.map(w => {
                  const wall = wallets.find(x => x.id === w.wallet_id);
                  return (
                    <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink2)' }}>{w.ref || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{new Date(w.requested_at).toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{wall?.name || 'Wallet'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{w.purpose}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--red)' }}>
                        -{Number(w.amount).toLocaleString()} {wall?.currency || ''}
                      </td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[w.status] || 'gray'}>{w.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      )}

      {activeTab === 'withdraw' && (
        <SectionCard title="Initiate Cash Withdrawal" collapsible={false}>
          <form onSubmit={handleWithdrawSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 540 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Source Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                value={walletId}
                onChange={setWalletId}
                placeholder="Select wallet…"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Withdrawal Amount *</label>
              <input
                type="number" required min="1" step="any"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payee / Vendor Name (Optional)</label>
              <input
                type="text"
                value={payeeName} onChange={e => setPayeeName(e.target.value)}
                placeholder="e.g. Shell Station Mwenge"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Purpose / Notes *</label>
              <input
                type="text" required
                value={purpose} onChange={e => setPurpose(e.target.value)}
                placeholder="Reason for cash withdrawal"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink3)' }}>This submits a request for approval and finance release — it doesn't disburse funds immediately.</p>

            <Button type="submit" variant="destructive" disabled={saving} style={{ padding: '12px', fontWeight: 700, fontSize: 14 }}>
              {saving ? 'Submitting…' : 'Submit Withdrawal Request'}
            </Button>
          </form>
        </SectionCard>
      )}

      {activeTab === 'settings' && (
        <SectionCard title="Disbursement Channel" collapsible={false}>
          <p style={{ margin: '0 0 14px 0', fontSize: 12.5, color: 'var(--ink3)' }}>
            Petti doesn't route disbursements through a payout channel yet — Finance releases an approved request as a
            manual cash-out, recorded straight into FinOps Expenses. The gateway below only affects <strong>deposits</strong>,
            shown here for reference.
          </p>
          {gatewayStatus.configured ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <FeaturedIcon variant={gatewayStatus.chargeSupported ? 'success' : 'warning'} size="md"><Icon name="creditCard" size={18} /></FeaturedIcon>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{gatewayStatus.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{gatewayStatus.chargeSupported ? 'Live deposit charges supported.' : 'Configured, but live charges for this provider aren\'t wired in yet.'}</div>
              </div>
              <Link to="/workspace/settings?s=payment-gateways" className="btn btn-secondary btn-sm">Manage</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', border: '1px dashed var(--border2)', borderRadius: 10, padding: '14px 16px' }}>
              <FeaturedIcon variant="gray" size="md"><Icon name="creditCard" size={18} /></FeaturedIcon>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>No payment gateway connected</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Deposits are recorded manually until one is connected.</div>
              </div>
              <Link to="/workspace/settings?s=payment-gateways" className="btn btn-secondary btn-sm">Connect a gateway</Link>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
