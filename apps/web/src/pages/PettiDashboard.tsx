import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { showAlert } from '../lib/alert.js';
import './Petti.css';

interface Wallet {
  id: string;
  name: string;
  currency: string;
  status: 'active' | 'closed';
  balance: number;
  description?: string | null;
}

interface Withdrawal {
  id: string;
  wallet_id: string;
  amount: string | number;
  purpose: string;
  category?: string;
  status: string;
  requested_by: string;
  requested_at: string;
  ref?: string | null;
}

interface TxRow {
  id: string;
  type: 'deposit' | 'withdrawal' | 'transfer';
  wallet_id: string;
  amount: string | number;
  status: string | null;
  description: string | null;
  actor_id: string | null;
  occurred_at: string;
  ref: string | null;
}

interface CatalogEntry {
  id: string;
  name: string;
  region: string;
  configured: boolean;
  enabled: boolean;
  sandbox: boolean;
  chargeSupported: boolean;
}

interface FxRate { currency: string; rate: number; }

export function PettiDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [recentTx, setRecentTx] = useState<TxRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  /* Modals */
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositWalletId, setDepositWalletId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<'manual' | 'gateway'>('manual');
  const [depositRef, setDepositRef] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositSaving, setDepositSaving] = useState(false);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestWalletId, setRequestWalletId] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestCategory, setRequestCategory] = useState('OFFICE_SUPPLIES');
  const [requestPurpose, setRequestPurpose] = useState('');
  const [requestPayee, setRequestPayee] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/wallets').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/withdrawals').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/transactions?limit=5').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/gateway-catalog').catch(() => []),
      apiFetch('/v1/customs/fx-rates').catch(() => ({})),
    ]).then(([w, wi, tx, cat, fx]) => {
      setWallets(Array.isArray(w) ? w : []);
      setWithdrawals(Array.isArray(wi) ? wi : []);
      setRecentTx(Array.isArray(tx) ? tx : []);
      setCatalog(Array.isArray(cat) ? cat : []);
      setFxRates(typeof fx === 'object' && fx !== null ? fx : {});
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const totalBalance = useMemo(() =>
    wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0), [wallets]);

  const pendingWithdrawals = useMemo(() =>
    withdrawals.filter(w => w.status === 'pending'), [withdrawals]);

  const pendingTotal = useMemo(() =>
    pendingWithdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0), [pendingWithdrawals]);

  const primaryWallet = wallets.find(w => w.status === 'active') || wallets[0];

  // FX pairs for ticker strip — rates are USD-pivot, rate = units per 1 USD
  const fxPairs = useMemo(() => {
    const r = fxRates as Record<string, number>;
    const convert = (from: string, to: string) => {
      const fr = r[from], tr = r[to];
      if (!fr || !tr) return null;
      return tr / fr;
    };
    return [
      { pair: 'USD / TZS', rate: convert('USD', 'TZS') },
      { pair: 'EUR / TZS', rate: convert('EUR', 'TZS') },
      { pair: 'GBP / TZS', rate: convert('GBP', 'TZS') },
      { pair: 'KES / TZS', rate: convert('KES', 'TZS') },
    ].filter(p => p.rate !== null);
  }, [fxRates]);

  const walletsById = useMemo(() => new Map(wallets.map(w => [w.id, w])), [wallets]);

  /* Deposit */
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositWalletId || !depositAmount) return;
    setDepositSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${depositWalletId}/deposits`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(depositAmount),
          method: depositMethod,
          reference: depositRef || undefined,
          note: depositNote || undefined,
        }),
      });
      showAlert('Deposit recorded.', { variant: 'success' });
      setDepositModalOpen(false);
      setDepositAmount(''); setDepositRef(''); setDepositNote('');
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to deposit funds.', { variant: 'error' });
    } finally { setDepositSaving(false); }
  };

  /* Transfer */
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId || !transferAmount) return;
    if (transferFromId === transferToId) {
      showAlert('Source and destination wallets must be different.', { variant: 'error' }); return;
    }
    setTransferSaving(true);
    try {
      await apiFetch('/v1/petti/transfers', {
        method: 'POST',
        body: JSON.stringify({
          from_wallet_id: transferFromId,
          to_wallet_id: transferToId,
          amount: Number(transferAmount),
          note: transferNote || undefined,
        }),
      });
      showAlert('Transfer completed.', { variant: 'success' });
      setTransferModalOpen(false);
      setTransferAmount(''); setTransferNote('');
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to complete transfer.', { variant: 'error' });
    } finally { setTransferSaving(false); }
  };

  /* Request */
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestWalletId || !requestAmount || !requestPurpose) return;
    setRequestSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${requestWalletId}/withdrawals`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(requestAmount),
          category: requestCategory,
          purpose: requestPurpose,
          payee_name: requestPayee || undefined,
        }),
      });
      showAlert('Expense claim submitted for approval.', { variant: 'success' });
      setRequestModalOpen(false);
      setRequestAmount(''); setRequestPurpose(''); setRequestPayee('');
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to submit expense request.', { variant: 'error' });
    } finally { setRequestSaving(false); }
  };

  const activeWallets = wallets.filter(w => w.status === 'active');
  const enabledGateways = catalog.filter(g => g.enabled);

  return (
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Overview']}
        titlePlain="Digital Treasury &"
        titleEm="banking"
        subtitle="Multi-currency digital wallets, automated petty cash disbursements, and real-time capital liquidity."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => { setDepositWalletId(activeWallets[0]?.id || ''); setDepositModalOpen(true); }}>
              <Icon name="plus" size={14} /> Deposit Funds
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setTransferFromId(activeWallets[0]?.id || ''); setTransferToId(activeWallets[1]?.id || ''); setTransferModalOpen(true); }}>
              <Icon name="refresh" size={14} /> Transfer Capital
            </Button>
            <Button variant="default" size="sm" onClick={() => { setRequestWalletId(activeWallets[0]?.id || ''); setRequestModalOpen(true); }}>
              <Icon name="send" size={14} /> Expense Claim
            </Button>
          </div>
        }
      />

      {/* FX Ticker — live rates from the platform's FX engine */}
      <div className="petti-fx-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>
          <Icon name="activity" size={13} color="var(--teal)" />
          <span>FX Rates:</span>
        </div>
        {fxPairs.length === 0 ? (
          <span style={{ fontSize: 11, color: 'var(--ink3)' }}>No rates loaded</span>
        ) : fxPairs.map(p => (
          <div key={p.pair} className="petti-fx-item">
            <span>{p.pair}</span>
            <span style={{ color: 'var(--ink)' }}>{p.rate!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)', padding: '0 4px', flexShrink: 0 }}>
          Source: <strong style={{ color: 'var(--ink2)' }}>Platform FX Engine</strong>
        </div>
      </div>

      {/* Banking Operations Hero + Wallet Summary */}
      <div className="petti-bento">
        {/* Hero */}
        <div className="petti-hero-col" style={{ gridColumn: 'span 7' }}>
          <div className="petti-banking-hero">
            <div className="petti-hero-glow-1" />
            <div className="petti-hero-glow-2" />
            <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.8)' }}>Treasury Health Center</span>
                  <Badge variant="brand" style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff' }}>
                    ● {activeWallets.length} Active {activeWallets.length === 1 ? 'Wallet' : 'Wallets'}
                  </Badge>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', margin: 0, fontFamily: 'var(--font)' }}>
                  Digital Banking Operations Center
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.12)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Consolidated Balance</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {(primaryWallet?.currency || 'TZS')} {totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                    {wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Pending Requests</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', marginTop: 4 }}>
                    {pendingWithdrawals.length} voucher{pendingWithdrawals.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                    {pendingTotal.toLocaleString()} pending
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Payment Gateways</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', marginTop: 4 }}>
                    {enabledGateways.length} active
                  </div>
                  <div style={{ fontSize: 11, color: enabledGateways.length > 0 ? '#10b981' : 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                    {enabledGateways.length > 0 ? enabledGateways.map(g => g.name).join(', ') : 'None configured'}
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 'var(--r-sm)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="sparkle" size={15} color="#10b981" />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                  {pendingWithdrawals.length > 0
                    ? `${pendingWithdrawals.length} pending expense voucher${pendingWithdrawals.length !== 1 ? 's' : ''} awaiting approval.`
                    : 'No pending expense vouchers — all disbursements are up to date.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Wallet Card */}
        <div className="petti-hero-col" style={{ gridColumn: 'span 5' }}>
          {primaryWallet ? (
            <div className="petti-virtual-card" onClick={() => navigate(`/petti/wallets/${primaryWallet.id}`)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Primary Wallet</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', marginTop: 2 }}>{primaryWallet.name}</div>
                </div>
                <Badge variant="success" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>{primaryWallet.status}</Badge>
              </div>

              <div style={{ margin: '20px 0' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'uppercase' }}>Available Balance</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {Number(primaryWallet.balance).toLocaleString()} <span style={{ fontSize: 14, opacity: 0.7 }}>{primaryWallet.currency}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  {wallets.filter(w => w.status === 'active').length} active · {wallets.filter(w => w.status === 'closed').length} closed
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  View detail <Icon name="arrowRight" size={11} />
                </div>
              </div>
            </div>
          ) : (
            <div className="petti-virtual-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <Icon name="wallet" size={32} color="rgba(255,255,255,0.4)" />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>No wallets yet</div>
              <Button variant="outline" size="sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} onClick={() => navigate('/petti/wallets')}>
                Create a wallet
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Wallet Grid */}
      <div className="petti-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Treasury Accounts & Wallets</h3>
            <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '2px 0 0 0' }}>
              Multi-currency segregated vaults for operational expenses, mobile money gateways, and tax escrow
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/petti/wallets')}>
            Manage All Wallets <Icon name="arrowRight" size={12} />
          </Button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>Loading wallets…</div>
        ) : wallets.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>
            No wallets yet. <button type="button" style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }} onClick={() => navigate('/petti/wallets')}>Create one</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'stretch' }}>
            {wallets.map(w => (
              <div key={w.id} className="petti-wallet-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/petti/wallets/${w.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{w.currency} Wallet</span>
                  <Badge variant={w.status === 'active' ? 'success' : 'gray'}>{w.status}</Badge>
                </div>
                <div className="petti-wallet-card-body">
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{w.description || 'Corporate vault'}</div>
                </div>
                <div className="petti-wallet-footer">
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 600 }}>Balance</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)', fontVariantNumeric: 'tabular-nums' }}>
                      {w.currency} {(Number(w.balance) || 0).toLocaleString()}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setDepositWalletId(w.id); setDepositModalOpen(true); }}>
                    Deposit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions + Payment Intermediaries */}
      <div className="petti-bento">
        {/* Recent Transactions */}
        <div className="petti-bento-12-7" style={{ gridColumn: 'span 7' }}>
          <div className="petti-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Recent Activity & Transfers</h3>
                <p style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '2px 0 0 0' }}>Latest deposits, withdrawals and wallet transfers</p>
              </div>
              <Link to="/petti/transactions" style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>View All</Link>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentTx.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>No transactions recorded yet.</div>
              ) : recentTx.map(tx => {
                const wallet = walletsById.get(tx.wallet_id);
                const isIn = tx.type === 'deposit';
                const isOut = tx.type === 'withdrawal';
                return (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {tx.actor_id ? (
                        <PersonAvatar userId={tx.actor_id} name="—" size={32} />
                      ) : (
                        <FeaturedIcon variant={isIn ? 'success' : isOut ? 'error' : 'brand'} size="sm" shape="circle">
                          <Icon name={isIn ? 'plus' : isOut ? 'minus' : 'refresh'} size={14} />
                        </FeaturedIcon>
                      )}
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tx.description || tx.type}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                          {wallet?.name || 'Wallet'} · {new Date(tx.occurred_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: isIn ? 'var(--green)' : isOut ? 'var(--red)' : 'var(--ink)' }}>
                        {isIn ? '+' : isOut ? '−' : ''}{Number(tx.amount).toLocaleString()} {wallet?.currency || ''}
                      </div>
                      {tx.status && <Badge variant={tx.status === 'disbursed' ? 'success' : tx.status === 'rejected' ? 'error' : tx.status === 'pending' ? 'warning' : 'gray'} style={{ fontSize: 9.5 }}>{tx.status}</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Payment Intermediaries */}
        <div className="petti-bento-12-5" style={{ gridColumn: 'span 5' }}>
          <div className="petti-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Payment Channels</h3>
              <Badge variant={enabledGateways.length > 0 ? 'success' : 'gray'}>
                {enabledGateways.length > 0 ? `${enabledGateways.length} Active` : 'None Active'}
              </Badge>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {catalog.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink3)' }}>
                  No gateways configured.<br />
                  <Link to="/workspace/settings?s=payment-gateways" style={{ color: 'var(--teal)', fontWeight: 700 }}>Connect one in Settings</Link>
                </div>
              ) : catalog.map(gw => (
                <div key={gw.id} className="petti-gateway-pill">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FeaturedIcon variant={gw.enabled ? 'success' : gw.configured ? 'warning' : 'gray'} size="sm">
                      <Icon name={gw.region === 'Bank' ? 'building' : 'creditCard'} size={13} />
                    </FeaturedIcon>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{gw.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                        {gw.region} · {gw.enabled ? (gw.chargeSupported ? 'Live charges' : 'Manual only') : gw.configured ? 'Configured, disabled' : 'Not connected'}
                        {gw.sandbox && ' · Sandbox'}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: gw.enabled ? 'var(--green)' : 'var(--ink3)' }}>
                    {gw.enabled ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 'auto' }}>
              <Link to="/petti/gateways" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>
                View gateway details →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Deposit Modal */}
      <Dialog open={depositModalOpen} onOpenChange={setDepositModalOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Deposit Funds</DialogTitle></DialogHeader>
          <form onSubmit={handleDepositSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Target Wallet</label>
              <Select value={depositWalletId} onValueChange={setDepositWalletId}>
                <SelectTrigger><SelectValue placeholder="Select wallet…" /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Amount</label>
              <Input type="number" min="1" step="any" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Enter deposit amount" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Method</label>
              <Select value={depositMethod} onValueChange={v => setDepositMethod(v as 'manual' | 'gateway')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual — bank transfer / cash</SelectItem>
                  <SelectItem value="gateway">Mobile Money gateway</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Reference</label>
              <Input value={depositRef} onChange={e => setDepositRef(e.target.value)} placeholder="e.g. MP99104 or BANK-REF" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Note</label>
              <Input value={depositNote} onChange={e => setDepositNote(e.target.value)} placeholder="e.g. Monthly replenishment" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Button type="button" variant="outline" onClick={() => setDepositModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={depositSaving}>{depositSaving ? 'Depositing…' : 'Confirm Deposit'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Inter-Wallet Transfer</DialogTitle></DialogHeader>
          <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>From Wallet</label>
              <Select value={transferFromId} onValueChange={setTransferFromId}>
                <SelectTrigger><SelectValue placeholder="Select source…" /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency} {(Number(w.balance) || 0).toLocaleString()})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>To Wallet</label>
              <Select value={transferToId} onValueChange={setTransferToId}>
                <SelectTrigger><SelectValue placeholder="Select destination…" /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency} {(Number(w.balance) || 0).toLocaleString()})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Amount</label>
              <Input type="number" min="1" step="any" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="Enter transfer amount" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Note</label>
              <Input value={transferNote} onChange={e => setTransferNote(e.target.value)} placeholder="e.g. Replenish weekly petty cash vault" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Button type="button" variant="outline" onClick={() => setTransferModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={transferSaving}>{transferSaving ? 'Transferring…' : 'Execute Transfer'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Request Modal */}
      <Dialog open={requestModalOpen} onOpenChange={setRequestModalOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Submit Expense Claim</DialogTitle></DialogHeader>
          <form onSubmit={handleRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Source Wallet</label>
              <Select value={requestWalletId} onValueChange={setRequestWalletId}>
                <SelectTrigger><SelectValue placeholder="Select wallet…" /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Category</label>
              <Select value={requestCategory} onValueChange={setRequestCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFFICE_SUPPLIES">Office Supplies</SelectItem>
                  <SelectItem value="TRANSPORT">Transport & Fuel</SelectItem>
                  <SelectItem value="MEALS_ENTERTAINMENT">Meals & Staff Welfare</SelectItem>
                  <SelectItem value="UTILITIES">Utilities & Internet</SelectItem>
                  <SelectItem value="REPAIRS_MAINTENANCE">Repairs & Maintenance</SelectItem>
                  <SelectItem value="MISCELLANEOUS">Miscellaneous</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Amount</label>
              <Input type="number" min="1" step="any" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} placeholder="Enter claim amount" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Purpose & Justification</label>
              <Input value={requestPurpose} onChange={e => setRequestPurpose(e.target.value)} placeholder="e.g. Fuel receipt for DSM Port inspection run" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Payee / Beneficiary (optional)</label>
              <Input value={requestPayee} onChange={e => setRequestPayee(e.target.value)} placeholder="e.g. Puma Energy Service Station" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Button type="button" variant="outline" onClick={() => setRequestModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={requestSaving}>{requestSaving ? 'Submitting…' : 'Submit Claim'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
