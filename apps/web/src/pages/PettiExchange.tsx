import React, { useEffect, useState, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { Button } from '../components/ui/button.js';
import { Combobox } from '../components/ui/combobox.js';
import { Input } from '../components/ui/input.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; balance: number; }

export function PettiExchange() {
  usePageSEO('Exchange Money', 'Reference real-time exchange rates and convert funds between multi-currency petty cash wallets.');
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

  const fromWallet = useMemo(() => wallets.find(w => w.id === fromWalletId), [wallets, fromWalletId]);
  const toWallet = useMemo(() => wallets.find(w => w.id === toWalletId), [wallets, toWalletId]);
  const sameCurrency = !!fromWallet && !!toWallet && fromWallet.currency === toWallet.currency;

  useEffect(() => {
    if (!fromWallet || !toWallet || sameCurrency) { setRate(null); return; }
    setRateLoading(true);
    apiFetch(`/v1/fx-rates/latest?base=${fromWallet.currency}&quote=${toWallet.currency}`)
      .then(r => setRate(r?.rate ?? null))
      .catch(() => setRate(null))
      .finally(() => setRateLoading(false));
  }, [fromWallet?.currency, toWallet?.currency, sameCurrency]);

  const convertedAmount = amount && rate ? (Number(amount) * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

  async function handleExchange(e: React.FormEvent) {
    e.preventDefault();
    if (!fromWalletId || !toWalletId || fromWalletId === toWalletId || !amount || Number(amount) <= 0) {
      showAlert('Please select different source & destination wallets and a valid amount.');
      return;
    }
    if (!sameCurrency) {
      showAlert(`"${fromWallet?.name}" (${fromWallet?.currency}) and "${toWallet?.name}" (${toWallet?.currency}) are different currencies — cross-currency auto-conversion is currently restricted to reference lookup only.`);
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
      showAlert(`Transferred ${Number(amount).toLocaleString()} ${fromWallet?.currency} to ${toWallet?.name}.`, { variant: 'success' });
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
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Activities', 'Exchange Money']}
        titlePlain="FX"
        titleEm="exchange"
        subtitle="Convert balances between currencies using the current reference rates."
      />

      {/* Summary Metrics */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Reference Currency Pair</span>
            <Badge variant="brand">{fromWallet?.currency || 'USD'} → {toWallet?.currency || 'TZS'}</Badge>
          </div>
          <div className="petti-stat-value" style={{ fontSize: 20 }}>
            {sameCurrency ? '1:1 Parity' : rate ? `1 ${fromWallet?.currency} = ${rate} ${toWallet?.currency}` : 'Checking live rates…'}
          </div>
          <div className="petti-stat-sub">
            <span>Published platform exchange rate</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Source Vault Balance</span>
            <Icon name="wallet" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">
            {fromWallet ? `${Number(fromWallet.balance).toLocaleString()} ${fromWallet.currency}` : '—'}
          </div>
          <div className="petti-stat-sub">
            <span>{fromWallet?.name || 'Select source'}</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Destination Vault Balance</span>
            <Icon name="wallet" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">
            {toWallet ? `${Number(toWallet.balance).toLocaleString()} ${toWallet.currency}` : '—'}
          </div>
          <div className="petti-stat-sub">
            <span>{toWallet?.name || 'Select destination'}</span>
          </div>
        </div>
      </div>

      <div className="petti-grid-2col">
        {/* Converter Form */}
        <SectionCard title="Currency Converter & Transfer Desk" collapsible={false}>
          <form onSubmit={handleExchange} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="petti-grid-form">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>From Wallet (Sell) *</label>
                <Combobox
                  options={wallets.map(w => ({ value: w.id, label: `${w.name} (${Number(w.balance).toLocaleString()} ${w.currency})` }))}
                  value={fromWalletId}
                  onChange={setFromWalletId}
                  placeholder="Select wallet…"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>To Wallet (Buy) *</label>
                <Combobox
                  options={wallets.map(w => ({ value: w.id, label: `${w.name} (${Number(w.balance).toLocaleString()} ${w.currency})` }))}
                  value={toWalletId}
                  onChange={setToWalletId}
                  placeholder="Select wallet…"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Amount to Convert *</label>
              <Input type="number" required min="1" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount in source currency" />
            </div>

            {!sameCurrency && fromWallet && toWallet && (
              <Banner variant="warning">
                Direct cross-currency automatic settlement is reserved for connected corporate banking rails. The exchange calculation below reflects live market reference rates.
              </Banner>
            )}

            {/* Exchange Rate Box */}
            <div style={{ padding: '14px 18px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Live Benchmark Rate</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>
                  {sameCurrency ? 'Same currency — no conversion required'
                    : rateLoading ? 'Querying live platform FX engine…'
                    : rate ? `1 ${fromWallet?.currency} = ${rate} ${toWallet?.currency}`
                    : `No active rate published for ${fromWallet?.currency}/${toWallet?.currency}`}
                </div>
              </div>

              {!sameCurrency && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Calculated Total</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--teal)', fontFamily: 'var(--font)' }}>
                    {convertedAmount} {toWallet?.currency || ''}
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={converting || !sameCurrency} style={{ padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="refresh" size={16} /> {converting ? 'Transferring…' : sameCurrency ? 'Execute Transfer' : 'Cross-Currency (Reference Only)'}
            </Button>
          </form>
        </SectionCard>

        {/* Info Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="petti-card">
            <h4 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Treasury FX Mechanics</h4>
            <p style={{ margin: '0 0 12px 0', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
              Transfers between wallets with the <strong>same currency</strong> post immediately. For different currencies, Petti uses the configured FX rate to calculate the converted amount.
            </p>
            <div style={{ background: 'var(--bg)', padding: '12px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>Central FX Engine</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4 }}>
                Exchange values match the official platform FX rates shared across Customs and Corporate Accounting.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
