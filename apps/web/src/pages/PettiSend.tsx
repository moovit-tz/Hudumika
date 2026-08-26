import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Combobox } from '../components/ui/combobox.js';
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

  const sourceWallet = wallets.find(w => w.id === fromWalletId);
  const destWallet = wallets.find(w => w.id === toWalletId);

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
      showAlert(`Insufficient funds in ${sourceWallet.name}. Balance: ${sourceWallet.balance.toLocaleString()} ${sourceWallet.currency}`);
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
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Activities', 'Send / Transfer Money']}
        titlePlain="Send"
        titleEm="money"
        subtitle="Transfer funds instantly between your workspace petty cash wallets."
      />

      <div className="petti-grid-2col" style={{ marginBottom: 24 }}>
        
        {/* Transfer Form */}
        <SectionCard title="Inter-Wallet Transfer" collapsible={false}>
          <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>From Source Wallet *</label>
                <Combobox
                  options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                  value={fromWalletId}
                  onChange={setFromWalletId}
                  placeholder="Select wallet…"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>To Destination Wallet *</label>
                <Combobox
                  options={wallets.map(w => ({ value: w.id, label: `${w.name} (${w.balance.toLocaleString()} ${w.currency})` }))}
                  value={toWalletId}
                  onChange={setToWalletId}
                  placeholder="Select wallet…"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Transfer Amount *</label>
              <input
                type="number" required min="1" step="any"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 150000"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Reason / Transfer Note</label>
              <input
                type="text"
                value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Rebalancing regional branch liquidity"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <Button type="submit" disabled={saving} style={{ background: 'var(--navy)', color: '#fff', padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="send" size={16} /> {saving ? 'Transferring…' : 'Execute Instant Transfer'}
            </Button>
          </form>
        </SectionCard>

        {/* Transfer Visualizer */}
        <div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>Transfer Visualizer</h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Source</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{sourceWallet?.name || 'Select Wallet'}</div>
                <div style={{ fontSize: 13, color: 'var(--ink2)', fontFamily: 'var(--mono)', marginTop: 4 }}>
                  Balance: {sourceWallet?.balance.toLocaleString()} {sourceWallet?.currency}
                </div>
              </div>

              <div style={{ textAlign: 'center', color: 'var(--teal)', fontWeight: 800 }}>
                ↓ Instant Transfer ↓
              </div>

              <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Destination</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{destWallet?.name || 'Select Wallet'}</div>
                <div style={{ fontSize: 13, color: 'var(--ink2)', fontFamily: 'var(--mono)', marginTop: 4 }}>
                  Balance: {destWallet?.balance.toLocaleString()} {destWallet?.currency}
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
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Ref', 'Date', 'From Wallet', 'To Wallet', 'Amount', 'Note'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {transfers.map(t => {
                const fw = wallets.find(w => w.id === t.from_wallet_id);
                const tw = wallets.find(w => w.id === t.to_wallet_id);
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink2)' }}>{t.ref || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{new Date(t.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fw?.name || 'Source'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>{tw?.name || 'Destination'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--ink)' }}>
                      {Number(t.amount).toLocaleString()} {fw?.currency || ''}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{t.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}
