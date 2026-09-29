import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface GatewayStatus { configured: boolean; provider: string | null; label: string | null; sandbox: boolean; chargeSupported: boolean }
interface Deposit { id: string; wallet_id: string; amount: string | number; method: string; gateway_provider: string | null; gateway_tx_ref: string | null; created_at: string; ref: string | null; }
interface Wallet { id: string; name: string; currency: string; }
interface CatalogEntry { id: string; name: string; region: string; configured: boolean; enabled: boolean; sandbox: boolean; chargeSupported: boolean }

export function PettiGateways() {
  usePageSEO('Payment Channels', 'Workspace connected payment gateways, mobile money rails, and recent gateway-channel deposits.');
  const [status, setStatus] = useState<GatewayStatus>({ configured: false, provider: null, label: null, sandbox: false, chargeSupported: false });
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/petti/gateway-status').catch(() => null),
      apiFetch('/v1/petti/gateway-catalog').catch(() => []),
      apiFetch('/v1/petti/deposits').then(r => r.data || []).catch(() => []),
      apiFetch('/v1/petti/wallets').then(r => r.data || []).catch(() => []),
    ]).then(([s, c, d, w]) => {
      if (s) setStatus(s);
      setCatalog(c || []);
      setDeposits((d as Deposit[]).filter(dep => dep.method === 'gateway'));
      setWallets(w);
    }).finally(() => setLoading(false));
  }, []);

  const walletName = (id: string) => wallets.find(w => w.id === id)?.name || 'Wallet';

  const enabledCount = useMemo(() => catalog.filter(g => g.enabled).length, [catalog]);
  const gatewayVolume = useMemo(() => deposits.reduce((s, d) => s + Number(d.amount || 0), 0), [deposits]);

  return (
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Gateways & Channels', 'Payment Channels']}
        titlePlain="Payment"
        titleEm="channels"
        subtitle="Connected mobile-money payment gateways and electronic banking channels for treasury liquidity top-ups."
        actions={
          <Link to="/workspace/settings?s=payment-gateways">
            <Button size="sm">
              <Icon name="settings" size={14} /> Configure in Settings
            </Button>
          </Link>
        }
      />

      {/* Metric Strip */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Connected Gateway</span>
            <Badge variant={status.configured ? 'success' : 'gray'}>
              {status.configured ? (status.sandbox ? 'Sandbox' : 'Live') : 'Offline'}
            </Badge>
          </div>
          <div className="petti-stat-value" style={{ fontSize: 20 }}>
            {status.configured ? (status.label || 'Configured') : 'None Connected'}
          </div>
          <div className="petti-stat-sub">
            <span>{status.chargeSupported ? 'Direct STK push charges active' : 'Manual deposit confirmation'}</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Active Channels</span>
            <Icon name="creditCard" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">{enabledCount} / {catalog.length}</div>
          <div className="petti-stat-sub">
            <span>Supported payment providers</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Gateway Inflow Volume</span>
            <Badge variant="success">INFLOW</Badge>
          </div>
          <div className="petti-stat-value" style={{ color: 'var(--green)' }}>
            +{gatewayVolume.toLocaleString()}
          </div>
          <div className="petti-stat-sub">
            <span>Deposited via gateway channels</span>
          </div>
        </div>
      </div>

      {/* Connected Gateway Primary Card */}
      <SectionCard title="Active Payment Gateway Integration" collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : status.configured ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)' }}>
            <FeaturedIcon variant={status.chargeSupported ? 'success' : 'warning'} size="lg">
              <Icon name="creditCard" size={24} />
            </FeaturedIcon>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{status.label}</span>
                <Badge variant={status.sandbox ? 'warning' : 'success'}>{status.sandbox ? 'Sandbox Testnet' : 'Live Production'}</Badge>
                <Badge variant={status.chargeSupported ? 'success' : 'gray'}>{status.chargeSupported ? 'Live STK Push Supported' : 'Manual Posting Mode'}</Badge>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: 12.5, color: 'var(--ink3)', maxWidth: 640, lineHeight: 1.5 }}>
                {status.chargeSupported
                  ? 'The digital deposit form can push automated mobile-money STK payment prompts directly to customer/finance mobile devices.'
                  : `Integration connected. Live auto-charging for ${status.label} is currently pending provider credentials certification.`}
              </p>
            </div>
            <Link to="/workspace/settings?s=payment-gateways">
              <Button variant="outline" size="sm">Manage Credentials</Button>
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 'var(--r-lg)' }}>
            <FeaturedIcon variant="gray" size="lg"><Icon name="creditCard" size={24} /></FeaturedIcon>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>No Payment Gateway Configured</div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
                All petty cash deposits are currently recorded manually. Connect an M-Pesa, Airtel Money, or bank gateway in Settings to enable automated payment collection.
              </p>
            </div>
            <Link to="/workspace/settings?s=payment-gateways">
              <Button size="sm">Connect Gateway</Button>
            </Link>
          </div>
        )}
      </SectionCard>

      {/* Available Channels Grid */}
      <SectionCard title="Supported Payment Channels & Rails" collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : (
          <>
            <p style={{ margin: '0 0 16px 0', fontSize: 12.5, color: 'var(--ink3)' }}>
              All mobile-money networks, commercial banks, and card processors available for automated workspace deposits.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {catalog.map(gw => (
                <div key={gw.id} className="petti-gateway-pill">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <FeaturedIcon variant={gw.enabled ? 'success' : gw.configured ? 'warning' : 'gray'} size="sm">
                      <Icon name={gw.region === 'Bank' ? 'building' : 'creditCard'} size={15} />
                    </FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {gw.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                        {gw.region} Â· {gw.enabled ? (gw.chargeSupported ? 'Live STK' : 'Manual only') : gw.configured ? 'Configured, disabled' : 'Not connected'}
                      </div>
                    </div>
                  </div>
                  <Badge variant={gw.enabled ? 'success' : 'gray'}>
                    {gw.enabled ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {/* Gateway Deposits Table */}
      <SectionCard title="Gateway-Routed Deposits Audit" padded={false} collapsible={false}>
        {deposits.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No deposits recorded via a payment gateway yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Ref', 'Date', 'Wallet', 'Amount', 'Provider', 'Provider Tx Ref'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deposits.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>{d.ref || 'â€”'}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{new Date(d.created_at).toLocaleString()}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{walletName(d.wallet_id)}</td>
                    <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--green)' }}>+{Number(d.amount).toLocaleString()}</td>
                    <td><Badge variant="info">{d.gateway_provider || 'â€”'}</Badge></td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font)', color: 'var(--ink2)' }}>{d.gateway_tx_ref || 'â€”'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
