import React, { useEffect, useState, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Combobox } from '../components/ui/combobox.js';
import { Input } from '../components/ui/input.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; balance: number; }
interface Transfer { id: string; from_wallet_id: string; to_wallet_id: string; amount: string | number; note: string | null; created_at: string; ref: string | null; }

export function PettiSend() {
  usePageSEO('Send / Transfer Money', 'Transfer funds between petty cash wallets instantly with real-time balance updates.');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/wallets').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/transfers').then(r => r.data || []).catch(() => []),
    ]).then(([w, t]) => {
      setWallets(w); setTransfers(t);
      if (w.length > 0 && !fromWalletId) setFromWalletId(w[0].id);
      if (w.length > 1 && !toWalletId) setToWalletId(w[1].id);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const sourceWallet = useMemo(() => wallets.find(w => w.id === fromWalletId), [wallets, fromWalletId]);
  const destWallet = useMemo(() => wallets.find(w => w.id === toWalletId), [wallets, toWalletId]);

  const sourceRemaining = useMemo(() => {
    if (!sourceWallet) return 0;
    return Math.max(0, (Number(sourceWallet.balance) || 0) - (Number(amount) || 0));
  }, [sourceWallet, amount]);

  const destProjected = useMemo(() => {
    if (!destWallet) return 0;
    return (Number(destWallet.balance) || 0) + (Number(amount) || 0);
  }, [destWallet, amount]);

  const totalTransfersVolume = useMemo(() => {
    return transfers.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [transfers]);

  function setPercentageAmount(pct: number) {
    if (!sourceWallet) return;
    const val = Math.floor((Number(sourceWallet.balance) || 0) * pct);
    setAmount(String(val));
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!fromWalletId || !toWalletId) {
      showAlert('Please select source and destination wallets.');
      return;
    }
    if (fromWalletId === toWalletId) {
      showAlert('Source and destination wallets must be different.');
      return;
    }
    if (sourceWallet && destWallet && sourceWallet.currency !== destWallet.currency) {
      showAlert(`"${sourceWallet.name}" (${sourceWallet.currency}) and "${destWallet.name}" (${destWallet.currency}) are different currencies — wallet-to-wallet transfers only work between wallets in the same currency today.`);
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showAlert('Please enter a valid transfer amount.');
      return;
    }
    if (sourceWallet && Number(amount) > sourceWallet.balance) {
      showAlert(`Insufficient funds in ${sourceWallet.name}. Balance: ${Number(sourceWallet.balance).toLocaleString()} ${sourceWallet.currency}`);
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/v1/petti/transfers', {
        method: 'POST',
        body: JSON.stringify({
          from_wallet_id: fromWalletId,
          to_wallet_id: toWalletId,
          amount: Number(amount),
          note: note.trim() || undefined,
        }),
      });
      showAlert('Inter-wallet transfer completed successfully.', { variant: 'success' });
      setAmount(''); setNote('');
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to complete transfer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Activities', 'Send / Transfer Money']}
        titlePlain="Inter-Vault"
        titleEm="transfers"
        subtitle="Transfer liquidity between your multi-currency petty cash vaults in real time with instant ledger posting."
      />

      {/* Summary Metrics */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Total Transferred Volume</span>
            <Icon name="refresh" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">{totalTransfersVolume.toLocaleString()}</div>
          <div className="petti-stat-sub">
            <span>Cumulative liquidity rebalances</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Source Vault Balance</span>
            <Badge variant="gray">{sourceWallet?.currency || 'TZS'}</Badge>
          </div>
          <div className="petti-stat-value">
            {sourceWallet ? `${Number(sourceWallet.balance).toLocaleString()}` : '—'}
          </div>
          <div className="petti-stat-sub">
            <span>{sourceWallet?.name || 'Select source'}</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Transfers Executed</span>
            <Badge variant="success">{transfers.length}</Badge>
          </div>
          <div className="petti-stat-value">{transfers.length}</div>
          <div className="petti-stat-sub">
            <span>Completed rebalance transactions</span>
          </div>
        </div>
      </div>

      <div className="petti-grid-2col">
        {/* Transfer Form */}
        <SectionCard title="Inter-Wallet Transfer" collapsible={false}>
          <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="petti-grid-form">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>From Source Wallet *</label>
                <Combobox
                  options={wallets.map(w => ({ value: w.id, label: `${w.name} (${Number(w.balance).toLocaleString()} ${w.currency})` }))}
                  value={fromWalletId}
                  onChange={setFromWalletId}
                  placeholder="Select wallet…"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>To Destination Wallet *</label>
                <Combobox
                  options={wallets.map(w => ({ value: w.id, label: `${w.name} (${Number(w.balance).toLocaleString()} ${w.currency})` }))}
                  value={toWalletId}
                  onChange={setToWalletId}
                  placeholder="Select wallet…"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Transfer Amount *</label>
              <Input type="number" required min="1" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 150000" />
              
              {/* Preset Chips */}
              <div className="petti-amount-chips">
                <button type="button" className="petti-amount-chip" onClick={() => setPercentageAmount(0.25)}>25%</button>
                <button type="button" className="petti-amount-chip" onClick={() => setPercentageAmount(0.5)}>50%</button>
                <button type="button" className="petti-amount-chip" onClick={() => setPercentageAmount(0.75)}>75%</button>
                <button type="button" className="petti-amount-chip" onClick={() => setPercentageAmount(1.0)}>100% Max</button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Reason / Transfer Note</label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Rebalancing regional branch liquidity" />
            </div>

            <Button type="submit" disabled={saving} style={{ padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="send" size={16} /> {saving ? 'Transferring…' : 'Execute Instant Transfer'}
            </Button>
          </form>
        </SectionCard>

        {/* Transfer Visualizer Flow */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="petti-card">
            <h4 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>Real-Time Transfer Flow</h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Source Card */}
              <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Source Vault</span>
                  <Badge variant="gray">DEBIT</Badge>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{sourceWallet?.name || 'Select Wallet'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4, color: 'var(--ink2)' }}>
                  <span>Current: <strong>{Number(sourceWallet?.balance || 0).toLocaleString()} {sourceWallet?.currency}</strong></span>
                  {Number(amount) > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>Remaining: {sourceRemaining.toLocaleString()}</span>}
                </div>
              </div>

              {/* Transfer Connector */}
              <div style={{ textAlign: 'center', padding: '4px 0', color: 'var(--teal)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 12, background: 'var(--teal-l)', padding: '3px 10px', borderRadius: 12 }}>
                  ↓ {Number(amount) > 0 ? `${Number(amount).toLocaleString()} ${sourceWallet?.currency || ''}` : 'Instant Transfer'} ↓
                </span>
                <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
              </div>

              {/* Destination Card */}
              <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Destination Vault</span>
                  <Badge variant="success">CREDIT</Badge>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{destWallet?.name || 'Select Wallet'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4, color: 'var(--ink2)' }}>
                  <span>Current: <strong>{Number(destWallet?.balance || 0).toLocaleString()} {destWallet?.currency}</strong></span>
                  {Number(amount) > 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>Projected: {destProjected.toLocaleString()}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer History Table */}
      <SectionCard title="Transfer History" padded={false} collapsible={false}>
        {transfers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No inter-wallet transfers recorded yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Ref', 'Date', 'From Wallet', 'To Wallet', 'Amount', 'Note'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => {
                  const fw = wallets.find(w => w.id === t.from_wallet_id);
                  const tw = wallets.find(w => w.id === t.to_wallet_id);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink2)' }}>{t.ref || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{new Date(t.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{fw?.name || 'Source'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--teal)' }}>{tw?.name || 'Destination'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--navy)' }}>
                        {Number(t.amount).toLocaleString()} {fw?.currency || ''}
                      </td>
                      <td style={{ color: 'var(--ink3)' }}>{t.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
