import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Input } from '../components/ui/input.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface Wallet { id: string; name: string; currency: string; balance: number; status: string; }
interface Deposit { id: string; wallet_id: string; amount: string | number; method: string; reference: string | null; note: string | null; created_at: string; recorded_by: string | null; ref: string | null; }
interface GatewayStatus { configured: boolean; provider: string | null; label: string | null; chargeSupported: boolean }

const PRESET_AMOUNTS = [50000, 100000, 250000, 500000, 1000000];

export function PettiDeposit() {
  usePageSEO('Deposit Money', 'Top up petty cash wallets manually or via connected mobile-money payment channels.');
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

  const selectedWallet = useMemo(() => wallets.find(w => w.id === walletId), [wallets, walletId]);

  const projectedBalance = useMemo(() => {
    if (!selectedWallet) return 0;
    const current = Number(selectedWallet.balance) || 0;
    const added = Number(amount) || 0;
    return current + added;
  }, [selectedWallet, amount]);

  const totalDepositsVolume = useMemo(() => {
    return deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  }, [deposits]);

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
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Activities', 'Deposit Money']}
        titlePlain="Deposit"
        titleEm="liquidity"
        subtitle="Top up operational funds into your petty cash vaults with automated payment tracking."
      />

      {/* Summary Metrics */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Total Deposited Volume</span>
            <Badge variant="success">INFLOW</Badge>
          </div>
          <div className="petti-stat-value" style={{ color: 'var(--green)' }}>
            +{totalDepositsVolume.toLocaleString()}
          </div>
          <div className="petti-stat-sub">
            <Icon name="download" size={13} color="var(--green)" />
            <span>Across all recorded deposits</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Connected Gateway</span>
            <Badge variant={gatewayStatus.configured ? 'success' : 'gray'}>
              {gatewayStatus.configured ? 'Active' : 'Manual Mode'}
            </Badge>
          </div>
          <div className="petti-stat-value" style={{ fontSize: 20 }}>
            {gatewayStatus.configured ? (gatewayStatus.label || 'Configured') : 'Direct Cash / Bank'}
          </div>
          <div className="petti-stat-sub">
            <Icon name="checkCircle" size={13} color={gatewayStatus.chargeSupported ? 'var(--green)' : 'var(--ink3)'} />
            <span>{gatewayStatus.chargeSupported ? 'Live push charge enabled' : 'Manual verification required'}</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Selected Vault Balance</span>
            <Icon name="wallet" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">
            {selectedWallet ? (
              <span>{Number(selectedWallet.balance).toLocaleString()} <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{selectedWallet.currency}</span></span>
            ) : (
              'â€”'
            )}
          </div>
          <div className="petti-stat-sub">
            <Icon name="shield" size={13} color="var(--teal)" />
            <span>{selectedWallet?.name || 'No vault chosen'}</span>
          </div>
        </div>
      </div>

      <div className="petti-grid-2col" style={{ alignItems: 'stretch' }}>
        {/* Deposit Form */}
        <SectionCard title="Deposit Funds" collapsible={false}>
          <form onSubmit={handleDeposit} style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Select Target Wallet *</label>
                <Combobox
                  options={wallets.map(w => ({ value: w.id, label: `${w.name} â€” Balance: ${Number(w.balance).toLocaleString()} ${w.currency}` }))}
                  value={walletId}
                  onChange={setWalletId}
                  placeholder="Select walletâ€¦"
                />
              </div>

              <div className="petti-grid-form">
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payment Method *</label>
                  <Select value={method} onValueChange={v => setMethod(v as 'manual' | 'gateway')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual â€” Bank wire, cash drop, or EFT</SelectItem>
                      {gatewayStatus.configured && (
                        <SelectItem value="gateway" disabled={!gatewayStatus.chargeSupported}>
                          {gatewayStatus.label} {gatewayStatus.chargeSupported ? 'â€” Push live charge' : '(Integration pending)'}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {!gatewayStatus.configured && (
                    <p style={{ margin: '5px 0 0 0', fontSize: 11, color: 'var(--ink3)' }}>
                      No payment gateway connected â€” <Link to="/workspace/settings?s=payment-gateways" style={{ color: 'var(--teal)' }}>connect one</Link> for push STK requests.
                    </p>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Deposit Amount *</label>
                  <Input type="number" required min="1" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 500000" />
                  
                  {/* Preset Chips */}
                  <div className="petti-amount-chips">
                    {PRESET_AMOUNTS.map(preset => (
                      <button
                        key={preset}
                        type="button"
                        className="petti-amount-chip"
                        onClick={() => setAmount(String(preset))}
                      >
                        +{preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {method === 'gateway' && gatewayStatus.chargeSupported && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payer Phone Number *</label>
                  <Input type="tel" required value={payerMsisdn} onChange={e => setPayerMsisdn(e.target.value)} placeholder="e.g. 0712345678" />
                  <p style={{ margin: '5px 0 0 0', fontSize: 11, color: 'var(--ink3)' }}>A {gatewayStatus.label} prompt will be pushed to the phone number.</p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Payment Reference</label>
                  <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. MPESA-REF-890214 or SLIP-441" />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Deposit Note</label>
                  <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Monthly branch replenishment" />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={saving} style={{ padding: '12px', fontWeight: 700, fontSize: 14, marginTop: 12 }}>
              <Icon name="plus" size={16} /> {saving ? 'Processing Depositâ€¦' : `Confirm Deposit ${amount ? `(${Number(amount).toLocaleString()} ${selectedWallet?.currency || ''})` : ''}`}
            </Button>
          </form>
        </SectionCard>

        {/* Selected Wallet Card & Balance Projection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
          {selectedWallet ? (
            <div className="petti-virtual-card" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 220 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 24, borderRadius: 4, background: 'linear-gradient(135deg, #d4af37, #fef08a)', border: '1px solid rgba(255,255,255,0.4)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 5, left: 3, width: 26, height: 14, border: '1px solid rgba(0,0,0,0.3)', borderRadius: 2 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
                        Target Digital Vault
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 1 }}>{selectedWallet.name}</div>
                    </div>
                  </div>
                  <Badge variant="success" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>{selectedWallet.status || 'Active'}</Badge>
                </div>

                <div style={{ margin: '18px 0 14px 0' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>Current Balance</div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font)', color: '#fff', marginTop: 2 }}>
                    {Number(selectedWallet.balance).toLocaleString()} <span style={{ fontSize: 15, fontWeight: 700 }}>{selectedWallet.currency}</span>
                  </div>
                </div>

                {Number(amount) > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.12)', padding: '12px 14px', borderRadius: 'var(--r-sm)', border: '1px solid rgba(255,255,255,0.18)', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', fontWeight: 700 }}>Deposit Amount</span>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font)', color: '#10b981' }}>+{Number(amount).toLocaleString()} {selectedWallet.currency}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', fontWeight: 800 }}>Projected New Balance</span>
                      <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--font)', color: '#34d399' }}>{projectedBalance.toLocaleString()} {selectedWallet.currency}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'rgba(255,255,255,0.7)' }}>
                <span>Vault ID: {selectedWallet.id.slice(0, 8)}â€¦</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="checkCircle" size={12} color="#34d399" /> Instant Posting
                </span>
              </div>
            </div>
          ) : (
            <div className="petti-card" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
              Select a vault to preview live balance projection
            </div>
          )}

          {/* Settlement & Policy Summary Card */}
          <div className="petti-card" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px 20px', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="shield" size={14} color="var(--teal)" /> Liquidity & Settlement Terms
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
              <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase' }}>Posting Speed</div>
                <div style={{ fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>Instant Ledger Credit</div>
              </div>
              <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase' }}>Replenishment Fee</div>
                <div style={{ fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>0.00% (Corporate)</div>
              </div>
              <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase' }}>Reconciliation</div>
                <div style={{ fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>Auto-Linked to Ledger</div>
              </div>
              <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase' }}>Audit Status</div>
                <div style={{ fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>Full Timestamp Trace</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Deposits Table */}
      <SectionCard title="Recent Deposits History" padded={false} collapsible={false}>
        {deposits.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No deposit transactions recorded yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Ref', 'Date', 'Wallet', 'Amount', 'Method', 'Reference', 'Note'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deposits.map(d => {
                  const w = wallets.find(wall => wall.id === d.wallet_id);
                  return (
                    <tr key={d.id}>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{d.ref || 'â€”'}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{new Date(d.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{w?.name || 'Wallet'}</td>
                      <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--green)' }}>
                        +{Number(d.amount).toLocaleString()} {w?.currency || ''}
                      </td>
                      <td><Badge variant="success">{d.method || 'manual'}</Badge></td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font)', color: 'var(--ink2)' }}>{d.reference || 'â€”'}</td>
                      <td style={{ color: 'var(--ink3)' }}>{d.note || 'â€”'}</td>
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
