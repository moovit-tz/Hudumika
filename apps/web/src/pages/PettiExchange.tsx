import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; balance: number; }

export function PettiExchange() {
  usePageSEO('Exchange Money', 'Reference exchange rates for petty cash wallets in different currencies.');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [converting, setConverting] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/petti/wallets')
      .then(r => {
        const w: Wallet[] = r.data || [];
        setWallets(w);
        if (w.length > 0) setFromWalletId(w[0].id);
        if (w.length > 1) setToWalletId(w[1].id);
      })
      .catch(() => setWallets([]))
      .finally(() => setLoading(false));
  }, []);

  const fromWallet = wallets.find(w => w.id === fromWalletId);
  const toWallet = wallets.find(w => w.id === toWalletId);
  const sameCurrency = !!fromWallet && !!toWallet && fromWallet.currency === toWallet.currency;

  // Real published rates (fx-rates.routes.ts), not a hardcoded table — only
  // meaningful for display here, since wallet-to-wallet movement between
  // different currencies isn't supported yet (see the notice below).
  useEffect(() => {
    if (!fromWallet || !toWallet || sameCurrency) { setRate(null); return; }
    setRateLoading(true);
    apiFetch(`/v1/fx-rates/latest?base=${fromWallet.currency}&quote=${toWallet.currency}`)
      .then(r => setRate(r?.rate ?? null))
      .catch(() => setRate(null))
      .finally(() => setRateLoading(false));
  }, [fromWallet?.currency, toWallet?.currency, sameCurrency]);

  const convertedAmount = amount && rate ? (Number(amount) * rate).toFixed(2) : '0.00';

  async function handleExchange(e: React.FormEvent) {
    e.preventDefault();
    if (!fromWalletId || !toWalletId || fromWalletId === toWalletId || !amount || Number(amount) <= 0) {
      showAlert('Please select different source & destination wallets and a valid amount.');
      return;
    }
    if (!sameCurrency) {
      showAlert(`"${fromWallet?.name}" (${fromWallet?.currency}) and "${toWallet?.name}" (${toWallet?.currency}) are different currencies — moving money between wallets in different currencies isn't supported yet. Rates above are for reference only.`);
      return;
    }
    if (fromWallet && Number(amount) > fromWallet.balance) {
      showAlert(`Insufficient funds in ${fromWallet.name}.`);
      return;
    }

    setConverting(true);
    try {
      await apiFetch('/v1/petti/transfers', {
        method: 'POST',
        body: JSON.stringify({
          from_wallet_id: fromWalletId,
          to_wallet_id: toWalletId,
          amount: Number(amount),
        }),
      });
      showAlert(`Transferred ${Number(amount).toLocaleString()} ${fromWallet?.currency} to ${toWallet?.name}.`);
      setAmount('');
      const r = await apiFetch('/v1/petti/wallets');
      setWallets(r.data || []);
    } catch (err: any) {
      showAlert(err?.message || 'Failed to complete transfer.');
    } finally {
      setConverting(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Activities', 'Exchange Money']}
        titlePlain="Exchange"
        titleEm="money"
        subtitle="Convert funds between multi-currency petty cash wallets at real-time exchange rates."
      />

      <div className="petti-grid-2col" style={{ marginBottom: 24 }}>
        
        {/* Converter Form */}
        <SectionCard title="Currency Converter & Exchange" collapsible={false}>
          <form onSubmit={handleExchange} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>From Wallet (Sell) *</label>
                <select
                  value={fromWalletId} onChange={e => setFromWalletId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', fontWeight: 600 }}
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.balance.toLocaleString()} {w.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>To Wallet (Buy) *</label>
                <select
                  value={toWalletId} onChange={e => setToWalletId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', fontWeight: 600 }}
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.balance.toLocaleString()} {w.currency})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Amount to Sell *</label>
              <input
                type="number" required min="1" step="any"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
              />
            </div>

            {!sameCurrency && fromWallet && toWallet && (
              <div style={{ padding: '10px 14px', background: 'var(--gold-l)', borderRadius: 8, border: '1px solid var(--gold)', fontSize: 12, color: 'var(--ink2)' }}>
                <Icon name="alertTriangle" size={13} color="var(--gold)" style={{ marginRight: 6, verticalAlign: '-2px' }} />
                Moving money between wallets in different currencies isn't supported yet — the rate below is for reference only.
              </div>
            )}

            {/* Exchange Rate Box — real published rate (fx-rates.routes.ts), not a hardcoded table */}
            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Reference Rate</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>
                  {sameCurrency ? 'Same currency — no conversion needed'
                    : rateLoading ? 'Looking up rate…'
                    : rate ? `1 ${fromWallet?.currency} = ${rate} ${toWallet?.currency}`
                    : `No published rate for ${fromWallet?.currency}/${toWallet?.currency}`}
                </div>
              </div>

              {!sameCurrency && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Reference Total</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>
                    {convertedAmount} {toWallet?.currency || ''}
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={converting || !sameCurrency} style={{ background: 'var(--purple)', color: '#fff', padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="refresh" size={16} /> {converting ? 'Transferring…' : sameCurrency ? 'Transfer' : 'Different currencies — not yet supported'}
            </Button>
          </form>
        </SectionCard>

        {/* Info card — replaces a hardcoded table of fake FX pairs */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>How this works today</h4>
          <p style={{ margin: '0 0 10px 0', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
            Wallet-to-wallet transfers only move money between wallets in the <strong>same currency</strong>. When you pick two
            wallets in different currencies, this page looks up the real published rate between them for reference — it
            doesn't convert or move anything.
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.6 }}>
            Rates come from the platform's published FX rates, the same source FinOps uses elsewhere — not a fixed table.
          </p>
        </div>

      </div>
    </div>
  );
}
