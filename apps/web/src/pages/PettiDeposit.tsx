import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; balance: number; status: string; }
interface Deposit { id: string; wallet_id: string; amount: string | number; method: string; reference: string | null; note: string | null; created_at: string; recorded_by: string | null; ref: string | null; }
interface GatewayStatus { configured: boolean; provider: string | null; label: string | null; chargeSupported: boolean }

export function PettiDeposit() {
  usePageSEO('Deposit Money', 'Top up petty cash wallets manually, or via a connected mobile-money gateway.');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({ configured: false, provider: null, label: null, chargeSupported: false });

  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'manual' | 'gateway'>('manual');
  const [payerMsisdn, setPayerMsisdn] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/wallets').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/deposits').then(r => r.data || []).catch(() => []),
    ]).then(([w, d]) => {
      setWallets(w); setDeposits(d);
      if (w.length > 0 && !walletId) setWalletId(w[0].id);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { apiFetch('/v1/petti/gateway-status').then(setGatewayStatus).catch(() => {}); }, []);

  const selectedWallet = wallets.find(w => w.id === walletId);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletId || !amount || Number(amount) <= 0) {
      showAlert('Please select a wallet and enter a valid deposit amount.');
      return;
    }
    if (method === 'gateway' && !payerMsisdn.trim()) {
      showAlert('Enter the payer\'s phone number to push a payment request.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${walletId}/deposits`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          method,
          gateway_provider: method === 'gateway' ? gatewayStatus.provider ?? undefined : undefined,
          payer_msisdn: method === 'gateway' ? payerMsisdn.trim() : undefined,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      showAlert('Deposit completed successfully.', { variant: 'success' });
      setAmount(''); setReference(''); setNote(''); setPayerMsisdn('');
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to complete deposit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Activities', 'Deposit Money']}
        titlePlain="Deposit"
        titleEm="money"
        subtitle="Top up liquidity into your digital petty wallets using configured payment channels."
      />

      <div className="petti-grid-2col" style={{ marginBottom: 24 }}>
        
        {/* Deposit Form */}
        <SectionCard title="Deposit Funds" collapsible={false}>
          <form onSubmit={handleDeposit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Select Target Wallet *</label>
              <Combobox
                options={wallets.map(w => ({ value: w.id, label: `${w.name} — Balance: ${w.balance.toLocaleString()} ${w.currency}` }))}
                value={walletId}
                onChange={setWalletId}
                placeholder="Select wallet…"
              />
            </div>

            <div className="petti-grid-form" style={{ marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>How was this money received? *</label>
                <Select value={method} onValueChange={v => setMethod(v as 'manual' | 'gateway')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual — bank transfer, cash, or already confirmed</SelectItem>
                    {gatewayStatus.configured && (
                      <SelectItem value="gateway" disabled={!gatewayStatus.chargeSupported}>
                        {gatewayStatus.label} {gatewayStatus.chargeSupported ? '— push a payment request' : '(not yet supported for live charges)'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {!gatewayStatus.configured && (
                  <p style={{ margin: '5px 0 0 0', fontSize: 11, color: 'var(--ink3)' }}>
                    No payment gateway connected — <Link to="/workspace/settings?s=payment-gateways" style={{ color: 'var(--teal)' }}>connect one</Link> to push live requests.
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Deposit Amount *</label>
                <input
                  type="number" required min="1" step="any"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 500000"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
                />
              </div>
            </div>

            {method === 'gateway' && gatewayStatus.chargeSupported && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payer Phone Number *</label>
                <input
                  type="tel" required
                  value={payerMsisdn} onChange={e => setPayerMsisdn(e.target.value)}
                  placeholder="e.g. 0712345678"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }}
                />
                <p style={{ margin: '5px 0 0 0', fontSize: 11, color: 'var(--ink3)' }}>A {gatewayStatus.label} payment request will be pushed to this number.</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payment Reference</label>
                <input
                  type="text"
                  value={reference} onChange={e => setReference(e.target.value)}
                  placeholder="e.g. MPESA-REF-890214"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Deposit Note</label>
                <input
                  type="text"
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Monthly replenishment"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                />
              </div>
            </div>

            <Button type="submit" disabled={saving} style={{ background: 'var(--teal)', color: '#fff', padding: '12px', fontWeight: 700, fontSize: 14 }}>
              <Icon name="plus" size={16} /> {saving ? 'Processing Deposit…' : `Deposit ${amount ? `${Number(amount).toLocaleString()} ${selectedWallet?.currency || ''}` : 'Money'}`}
            </Button>
          </form>
        </SectionCard>

        {/* Selected Wallet Card */}
        <div>
          {selectedWallet && (
            <div style={{
              background: 'linear-gradient(135deg, #0e1f3d 0%, #0d7a6b 100%)',
              borderRadius: 16, padding: '24px', color: '#ffffff', boxShadow: '0 8px 24px rgba(14,31,61,0.15)',
              marginBottom: 16
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
                Target Digital Wallet
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, margin: '6px 0 16px 0' }}>{selectedWallet.name}</div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>Available Balance</div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)' }}>
                {selectedWallet.balance.toLocaleString()} <span style={{ fontSize: 16 }}>{selectedWallet.currency}</span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Recent Deposits Table */}
      <SectionCard title="Recent Deposits History" padded={false} collapsible={false}>
        {deposits.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No deposit transactions recorded yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Ref', 'Date', 'Wallet', 'Amount', 'Method', 'Reference', 'Note'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {deposits.map(d => {
                const w = wallets.find(wall => wall.id === d.wallet_id);
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink2)' }}>{d.ref || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{new Date(d.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{w?.name || 'Wallet'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--green)' }}>
                      +{Number(d.amount).toLocaleString()} {w?.currency || ''}
                    </td>
                    <td style={{ padding: '12px 16px' }}><Badge variant="success">{d.method || 'manual'}</Badge></td>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{d.reference || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{d.note || '—'}</td>
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
