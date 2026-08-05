import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

/* ── SVG brand marks (vector, no 3D) ─────────────────────────────── */
const XeroLogo = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="9" fill="#13b5ea"/>
    <path d="M13 13l14 14M27 13L13 27" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
  </svg>
);
const SageLogo = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="9" fill="#00b050"/>
    <path d="M12 21.5l7 7 11-14" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const QuickBooksLogo = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="9" fill="#2ca01c"/>
    <circle cx="20" cy="20" r="9" stroke="white" strokeWidth="2.5" fill="none"/>
    <path d="M18 15v10m-2-5h4a2 2 0 000-4h-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const TallyLogo = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="9" fill="#ff6f00"/>
    <path d="M12 17h16M20 17v11" stroke="white" strokeWidth="4" strokeLinecap="round"/>
  </svg>
);

type TabId = 'connected' | 'marketplace';

interface MarketplaceItem {
  id: string;
  name: string;
  category: string;
  color: string;
  bg: string;
  initials: string;
  desc: string;
  tags: string[];
}

const MARKETPLACE: MarketplaceItem[] = [
  { id: 'wave',        name: 'Wave Accounting',  category: 'Accounting',     color: '#1e3a5f', bg: 'rgba(30,58,95,0.1)',    initials: 'W',  desc: 'Free accounting software for small businesses. Sync invoices and expenses.',            tags: ['accounting', 'free', 'invoices'] },
  { id: 'freshbooks',  name: 'FreshBooks',       category: 'Accounting',     color: '#1d9bf0', bg: 'rgba(29,155,240,0.1)',  initials: 'FB', desc: 'Cloud accounting with time tracking, invoicing and expense management.',              tags: ['accounting', 'invoices', 'time'] },
  { id: 'zoho',        name: 'Zoho Books',       category: 'Accounting',     color: '#e4430d', bg: 'rgba(228,67,13,0.1)',   initials: 'ZB', desc: 'End-to-end accounting with GST/VAT, inventory and banking integration.',              tags: ['accounting', 'inventory', 'tax'] },
  { id: 'netsuite',    name: 'Oracle NetSuite',  category: 'ERP',            color: '#c74300', bg: 'rgba(199,67,0,0.1)',    initials: 'NS', desc: 'Enterprise ERP with advanced financial management and global compliance.',            tags: ['erp', 'enterprise', 'compliance'] },
  { id: 'myob',        name: 'MYOB',             category: 'Accounting',     color: '#0d3349', bg: 'rgba(13,51,73,0.1)',    initials: 'MY', desc: 'Business management software popular in Australia and New Zealand.',                   tags: ['accounting', 'payroll', 'au'] },
  { id: 'odoo',        name: 'Odoo',             category: 'ERP',            color: '#714b67', bg: 'rgba(113,75,103,0.1)',  initials: 'OD', desc: 'Open-source ERP covering accounting, inventory, sales and HR.',                      tags: ['erp', 'open-source', 'inventory'] },
  { id: 'stripe',      name: 'Stripe',           category: 'Payments',       color: '#635bff', bg: 'rgba(99,91,255,0.1)',   initials: 'S',  desc: 'Accept online payments and reconcile with invoices automatically.',                   tags: ['payments', 'online', 'reconcile'] },
  { id: 'square',      name: 'Square',           category: 'Payments',       color: '#111827', bg: 'rgba(17,24,39,0.1)',    initials: 'SQ', desc: 'Point-of-sale and invoicing with automatic journal entries.',                        tags: ['payments', 'pos', 'invoices'] },
  { id: 'flutterwave', name: 'Flutterwave',      category: 'Local Payments', color: '#f5a623', bg: 'rgba(245,166,35,0.1)', initials: 'FW', desc: 'Africa-focused payment gateway. Accept mobile money, cards and bank transfers.',      tags: ['payments', 'africa', 'mobile money'] },
  { id: 'mpesa',       name: 'M-Pesa',           category: 'Local Payments', color: '#41ad49', bg: 'rgba(65,173,73,0.1)',   initials: 'MP', desc: 'Safaricom M-Pesa integration for East Africa mobile money reconciliation.',           tags: ['payments', 'mobile money', 'kenya', 'tanzania'] },
  { id: 'paypal',      name: 'PayPal',           category: 'Payments',       color: '#003087', bg: 'rgba(0,48,135,0.1)',    initials: 'PP', desc: 'Accept PayPal and import transactions into your chart of accounts.',                 tags: ['payments', 'online', 'international'] },
  { id: 'airtel',      name: 'Airtel Money',     category: 'Local Payments', color: '#e40000', bg: 'rgba(228,0,0,0.1)',     initials: 'AM', desc: 'Airtel Money integration for Tanzania and East Africa mobile payments.',             tags: ['payments', 'mobile money', 'tanzania'] },
];

const PROVIDER_BRANDS: Record<string, { name: string; color: string; bg: string; Logo: React.FC; desc: string }> = {
  XERO:       { name: 'Xero',       color: '#13b5ea', bg: 'rgba(19,181,234,0.08)',  Logo: XeroLogo,       desc: 'Sync invoices, bills, and payments with Xero Accounting.' },
  SAGE:       { name: 'Sage',       color: '#00b050', bg: 'rgba(0,176,80,0.08)',    Logo: SageLogo,       desc: 'Sync financial transactions with Sage Business Cloud.' },
  QUICKBOOKS: { name: 'QuickBooks', color: '#2ca01c', bg: 'rgba(44,160,28,0.08)',   Logo: QuickBooksLogo, desc: 'Sync accounts and sales receipts with QuickBooks Online.' },
  TALLY:      { name: 'Tally',      color: '#ff6f00', bg: 'rgba(255,111,0,0.08)',   Logo: TallyLogo,      desc: 'Export journal vouchers and bills to Tally Prime Gateway.' },
};

export function AccountingIntegrations() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('connected');
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  const [activeConfigProvider, setActiveConfigProvider] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [orgId, setOrgId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const loadData = async () => {
    try {
      const data = await apiFetch('/v1/accounting-integrations');
      setIntegrations(data.integrations || []);
      setLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleConnectClick = (provider: any) => {
    setActiveConfigProvider(provider.provider);
    setClientId(provider.config?.client_id || '');
    setClientSecret('••••••••••••••••');
    setOrgId(provider.config?.organization_id || '');
    setBaseUrl(provider.config?.base_url || '');
  };

  const handleSaveConfig = async () => {
    if (!activeConfigProvider) return;
    setSavingProvider(activeConfigProvider);
    try {
      await apiFetch(`/v1/accounting-integrations/${activeConfigProvider}/connect`, {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret === '••••••••••••••••' ? undefined : clientSecret,
          organization_id: orgId,
          base_url: baseUrl,
        }),
      });
      setActiveConfigProvider(null);
      await loadData();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setSavingProvider(null);
    }
  };

  const handleDisconnect = async (providerName: string) => {
    if (!(await showConfirm(`Are you sure you want to disconnect ${providerName}?`, { variant: 'warning', confirmLabel: 'Disconnect' }))) return;
    try {
      await apiFetch(`/v1/accounting-integrations/${providerName}/disconnect`, { method: 'POST' });
      await loadData();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Disconnection failed');
    }
  };

  const handleSyncNow = async (providerName: string) => {
    setSyncingProvider(providerName);
    try {
      await apiFetch(`/v1/accounting-integrations/${providerName}/sync`, { method: 'POST' });
      await loadData();
      showAlert(`Chart of Accounts synced successfully from ${providerName}!`);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleInstall = async (item: MarketplaceItem) => {
    setInstallingId(item.id);
    try {
      await apiFetch(`/v1/accounting-integrations/marketplace/${item.id}/request`, {
        method: 'POST',
        body: JSON.stringify({ providerName: item.name }),
      });
      showAlert(`${item.name} has been added to your integration queue. Our team will reach out to complete setup.`);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Failed to request integration');
    } finally {
      setInstallingId(null);
    }
  };

  const filteredMarketplace = MARKETPLACE.filter(item => {
    if (!marketplaceSearch) return true;
    const q = marketplaceSearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || item.tags.some(t => t.includes(q));
  });

  const categories = ['All', ...Array.from(new Set(MARKETPLACE.map(m => m.category)))];
  const [activeCat, setActiveCat] = useState('All');
  const displayed = activeCat === 'All' ? filteredMarketplace : filteredMarketplace.filter(m => m.category === activeCat);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading integrations…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'var(--bg)' }}>
      <PageHeader
        crumbs={['FinOps', 'Integrations']}
        titlePlain="Accounting"
        titleEm="integrations"
        subtitle="Connect the ledger to Xero, QuickBooks or Zoho and keep them in step."
      />

      {/* Page header + tabs */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '20px 24px 0', flexShrink: 0 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Integrations</h2>
        <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 16px' }}>Connect ClearOS with your accounting platforms and payment providers.</p>
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border)', marginTop: 4 }}>
          {(['connected', 'marketplace'] as TabId[]).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              style={{ padding: 'var(--ds-btn-py) 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'var(--font)', color: activeTab === tab ? 'var(--teal)' : 'var(--ink3)', borderBottom: activeTab === tab ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s' }}>
              {tab === 'connected' ? 'Connected Platforms' : 'Marketplace'}
              {tab === 'connected' && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)' }}>{integrations.filter(i => i.status === 'CONNECTED').length}</span>}
              {tab === 'marketplace' && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink3)' }}>{MARKETPLACE.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

        {/* ── Connected tab ── */}
        {activeTab === 'connected' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, marginBottom: 28 }}>
              {integrations.map(p => {
                const brand = PROVIDER_BRANDS[p.provider];
                if (!brand) return null;
                const isConnected = p.status === 'CONNECTED';
                const { Logo } = brand;
                return (
                  <div key={p.provider} style={{ border: `1.5px solid ${isConnected ? brand.color + '4d' : 'var(--border)'}`, borderRadius: 12, background: 'var(--white)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: isConnected ? `0 2px 12px ${brand.color}18` : 'none' }}>
                    <div style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
                      <div style={{ flexShrink: 0 }}><Logo /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{brand.name}</span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: isConnected ? '#ecfdf5' : '#fee2e2', color: isConnected ? '#047857' : '#b91c1c', fontWeight: 700 }}>
                            {isConnected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 5, lineHeight: 1.45 }}>{brand.desc}</div>
                        {p.last_sync_at && (
                          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>
                            Last synced: <strong>{new Date(p.last_sync_at).toLocaleString()}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '12px 18px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      {isConnected ? (
                        <>
                          <button type="button" className="btn btn-secondary btn-sm" disabled={syncingProvider === p.provider} onClick={() => handleSyncNow(p.provider)}>
                            {syncingProvider === p.provider ? 'Syncing…' : 'Sync CoA'}
                          </button>
                          <button type="button" style={{ fontSize: 13, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }} onClick={() => handleDisconnect(p.provider)}>
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleConnectClick(p)}>
                          Configure
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Connection config panel */}
            {activeConfigProvider && (() => {
              const brand = PROVIDER_BRANDS[activeConfigProvider];
              const isOauth = activeConfigProvider === 'XERO' || activeConfigProvider === 'QUICKBOOKS';
              return (
                <div style={{ padding: '20px 22px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 28 }}>
                  <h4 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flexShrink: 0 }}>{React.createElement(brand.Logo)}</div>
                    Configure {brand.name} Connection
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 18 }}>
                    {isOauth ? (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Client ID</label>
                          <input className="input-field" value={clientId} onChange={e => setClientId(e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Client Secret</label>
                          <input className="input-field" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Organization ID (optional)</label>
                          <input className="input-field" value={orgId} onChange={e => setOrgId(e.target.value)} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>API Gateway URL</label>
                          <input className="input-field" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="e.g. http://localhost:9000" />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Access Token / API Key</label>
                          <input className="input-field" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Company / Organization ID</label>
                          <input className="input-field" value={orgId} onChange={e => setOrgId(e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveConfigProvider(null)}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={savingProvider === activeConfigProvider} onClick={handleSaveConfig}>
                      {savingProvider === activeConfigProvider ? 'Connecting…' : 'Save & Connect'}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Sync logs */}
            <div className="card">
              <div style={{ paddingBottom: 12, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Recent Sync Logs</h3>
              </div>
              <div className="rtbl-wrap">
                <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Time</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Platform</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Type</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>External ID</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--ink3)', fontStyle: 'italic' }}>
                          No sync logs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      logs.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{new Date(l.synced_at).toLocaleString()}</td>
                          <td style={{ padding: '9px 12px', fontWeight: 600 }}>{PROVIDER_BRANDS[l.provider]?.name || l.provider}</td>
                          <td style={{ padding: '9px 12px' }}>{l.entity_type}</td>
                          <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 11.5 }}>{l.external_id || '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: l.status === 'SUCCESS' ? '#ecfdf5' : '#fee2e2', color: l.status === 'SUCCESS' ? '#047857' : '#b91c1c', fontWeight: 700 }}>{l.status}</span>
                          </td>
                          <td style={{ padding: '9px 12px', color: l.status === 'SUCCESS' ? 'var(--ink3)' : '#dc2626' }}>
                            {l.status === 'SUCCESS' ? 'Synchronized successfully' : l.error_message}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Marketplace tab ── */}
        {activeTab === 'marketplace' && (
          <>
            {/* Search + category filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
                <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  value={marketplaceSearch}
                  onChange={e => setMarketplaceSearch(e.target.value)}
                  placeholder="Search integrations…"
                  style={{ width: '100%', paddingLeft: 34, paddingRight: 10, paddingTop: 10, paddingBottom: 10, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13.5, fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {categories.map(cat => (
                  <button key={cat} type="button" onClick={() => setActiveCat(cat)}
                    style={{ padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: activeCat === cat ? '1.5px solid var(--teal)' : '1px solid var(--border)', background: activeCat === cat ? 'var(--teal-l)' : 'var(--white)', color: activeCat === cat ? 'var(--teal)' : 'var(--ink2)' }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {displayed.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink3)' }}>
                <Icon name="search" size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>No integrations found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Try a different search term or category.</div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {displayed.map(item => (
                <div key={item.id} style={{ border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--white)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = item.color; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${item.color}20`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                  <div style={{ padding: 18, flex: 1, display: 'flex', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${item.color}30` }}>
                      <span style={{ fontWeight: 800, fontSize: 13.5, color: item.color, fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.02em' }}>{item.initials}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>{item.name}</span>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: item.bg, color: item.color, fontWeight: 700 }}>{item.category}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.45 }}>{item.desc}</div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={installingId === item.id} onClick={() => handleInstall(item)}>
                      {installingId === item.id ? 'Adding…' : '+ Add Integration'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
