import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { apiFetch } from '../lib/api.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

interface GatewayStatus { configured: boolean; provider: string | null; label: string | null; sandbox: boolean; chargeSupported: boolean }
interface Deposit { id: string; wallet_id: string; amount: string | number; method: string; gateway_provider: string | null; gateway_tx_ref: string | null; created_at: string; }
interface Wallet { id: string; name: string; currency: string; }
interface CatalogEntry { id: string; name: string; region: string; configured: boolean; enabled: boolean; sandbox: boolean; chargeSupported: boolean }

/**
 * "Payment Channels" — real, single-source-of-truth status for the one
 * gateway a workspace can connect at Settings ▸ Finance ▸ Payment Gateways
 * (that screen is where credentials actually live and get tested; this page
 * doesn't duplicate that form — it shows what it means for Petti deposits
 * specifically, and a real audit trail of gateway-channel deposits).
 *
 * Used to be a fully local `useState` list of 24 hardcoded providers, all
 * marked "Active"/"Live API" with fabricated merchant IDs, saved via
 * `setTimeout` into component state that reverted on refresh — nothing on
 * the page ever reached the backend.
 */
export function PettiGateways() {
  usePageSEO('Payment Channels', 'This workspace\'s connected payment gateway, and its recent gateway-channel deposits.');
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

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Gateways & Channels', 'Payment Channels']}
        titlePlain="Payment"
        titleEm="channels"
        subtitle="The gateway this workspace has connected for mobile-money deposits, and its recent activity."
        actions={<Link to="/workspace/settings?s=payment-gateways" className="btn btn-primary btn-sm">Manage in Settings</Link>}
      />

      <SectionCard title="Connected Gateway" collapsible={false}>
        {loading ? (
          <div style={{ padding: 20, color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
        ) : status.configured ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <FeaturedIcon variant={status.chargeSupported ? 'success' : 'warning'} size="lg"><Icon name="creditCard" size={22} /></FeaturedIcon>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{status.label}</span>
                <Badge variant={status.sandbox ? 'warning' : 'success'}>{status.sandbox ? 'Sandbox' : 'Live'}</Badge>
                <Badge variant={status.chargeSupported ? 'success' : 'gray'}>{status.chargeSupported ? 'Charges supported' : 'Not wired for charges yet'}</Badge>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: 12.5, color: 'var(--ink3)', maxWidth: 560 }}>
                {status.chargeSupported
                  ? 'The Deposit form can push a real mobile-money payment request through this gateway.'
                  : `Configured, but Petti doesn't have a live charge-processing integration for ${status.label} yet — deposits still need to be recorded manually once funds are confirmed another way.`}
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', background: 'var(--bg)', border: '1px dashed var(--border2)', borderRadius: 10 }}>
            <FeaturedIcon variant="gray" size="lg"><Icon name="creditCard" size={22} /></FeaturedIcon>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>No payment gateway connected</div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
                Deposits are recorded manually. Connect a gateway at Settings ▸ Finance ▸ Payment Gateways to enable live mobile-money charges.
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      <div style={{ height: 20 }} />

      <SectionCard title="Available Channels" collapsible={false}>
        {loading ? (
          <div style={{ padding: 20, color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <>
          <p style={{ margin: '0 0 14px 0', fontSize: 12.5, color: 'var(--ink3)' }}>
            Every mobile-money and bank option Settings supports for Petti deposits, and whether this workspace has it configured.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {catalog.map(gw => (
              <div key={gw.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9 }}>
                <FeaturedIcon variant={gw.enabled ? 'success' : gw.configured ? 'warning' : 'gray'} size="sm"><Icon name="creditCard" size={15} /></FeaturedIcon>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gw.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {gw.enabled ? (gw.chargeSupported ? 'Connected · live charges' : 'Connected · manual only') : gw.configured ? 'Configured, not enabled' : 'Not connected'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </SectionCard>

      <div style={{ height: 20 }} />

      <SectionCard title="Gateway Deposits" padded={false} collapsible={false}>
        {deposits.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No deposits recorded via a payment gateway yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Date', 'Wallet', 'Amount', 'Provider', 'Provider Reference'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {deposits.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{new Date(d.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{walletName(d.wallet_id)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--green)' }}>+{Number(d.amount).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant="info">{d.gateway_provider || '—'}</Badge></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{d.gateway_tx_ref || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}
