// ─── OneIdSSO.tsx — Perfected Ondi SSO, Benchmark, Flow & Feature Map ──
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionCard } from '../components/SectionCard.js';

interface SsoProvider {
  id: string; provider_type: string; name: string; enabled: boolean;
  config: Record<string, any>; created_at: string;
}

interface OauthClient {
  id: string; client_id: string; client_secret_hash: string | null;
  name: string; logo_url: string | null; redirect_uris: any;
  first_party: boolean; created_at: string;
}

function AddClientModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [firstParty, setFirstParty] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientId.trim() || !redirectUris.trim()) return;
    setSaving(true);

    const uris = redirectUris.split(',').map(u => u.trim()).filter(Boolean);

    try {
      await apiFetch('/v1/oneid/oauth-clients', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          name,
          redirect_uris: uris,
          logo_url: logoUrl || null,
          first_party: firstParty,
          client_secret: clientSecret || null,
        }),
      });
      onAdded();
      onClose();
    } finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 460, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Add SSO Client Application</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 18 }}>Configure an external app (relying party) to authenticate users using Ondi.</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Application display name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Corporate Helpdesk" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Client ID (Unique slug)</label>
            <input required value={clientId} onChange={e => setClientId(e.target.value)} placeholder="e.g. corp-helpdesk" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Callback / Redirect URIs (comma-separated)</label>
            <textarea required value={redirectUris} onChange={e => setRedirectUris(e.target.value)} placeholder="http://localhost:3000/callback, https://helpdesk.company.com/oauth" style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Client Secret (Optional — blank for public PKCE)</label>
            <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="••••••••••••" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>App Logo URL (Optional)</label>
            <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://company.com/logo.png" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input type="checkbox" id="firstParty" checked={firstParty} onChange={e => setFirstParty(e.target.checked)} style={{ cursor: 'pointer' }} />
            <label htmlFor="firstParty" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>First-party application (Bypasses user consent screen)</label>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving || !name.trim() || !clientId.trim() || !redirectUris.trim()} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (saving || !name.trim() || !clientId.trim() || !redirectUris.trim()) ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Creating…' : 'Register application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const PROVIDER_TYPES = ['GOOGLE', 'MICROSOFT', 'SAML', 'OIDC'];

function AddProviderModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('GOOGLE');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/v1/oneid/sso-providers', {
        method: 'POST',
        body: JSON.stringify({ provider_type: type, name, config: { client_id: clientId, client_secret: clientSecret, metadata_url: metadataUrl } }),
      });
      onAdded();
      onClose();
    } finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 460, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Add identity provider</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 18 }}>Configuration only — connecting this provider to real sign-in is a follow-on step.</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Provider type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger aria-label="Provider type" style={inputStyle}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={labelStyle}>Display name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Company Google Workspace" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Client ID</label>
            <input value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Client secret</label>
            <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Metadata URL (SAML/OIDC)</label>
            <input value={metadataUrl} onChange={e => setMetadataUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Saving…' : 'Add provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const OneIdSSO: React.FC = () => {
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [clients, setClients] = useState<OauthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [activeTab, setActiveTab] = useState<'registry' | 'benchmark' | 'flow' | 'feature-map'>('registry');
  const [subTab, setSubTab] = useState<'idps' | 'clients'>('idps');

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/oneid/sso-providers').then(setProviders).catch(() => setProviders([])).finally(() => setLoading(false));
  }, []);

  const reloadClients = useCallback(() => {
    setLoadingClients(true);
    apiFetch('/v1/oneid/oauth-clients').then(setClients).catch(() => setClients([])).finally(() => setLoadingClients(false));
  }, []);

  useEffect(() => {
    reload();
    reloadClients();
  }, [reload, reloadClients]);

  async function toggleEnabled(p: SsoProvider) {
    const enabled = !p.enabled;
    setProviders(prev => prev.map(x => x.id === p.id ? { ...x, enabled } : x));
    try { await apiFetch(`/v1/oneid/sso-providers/${p.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }); }
    catch { reload(); }
  }

  async function remove(id: string) {
    setProviders(prev => prev.filter(p => p.id !== id));
    try { await apiFetch(`/v1/oneid/sso-providers/${id}`, { method: 'DELETE' }); }
    catch { reload(); }
  }

  async function removeClient(id: string) {
    setClients(prev => prev.filter(c => c.id !== id));
    try { await apiFetch(`/v1/oneid/oauth-clients/${id}`, { method: 'DELETE' }); }
    catch { reloadClients(); }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert('Copied Client ID to clipboard!');
  }

  const tabStyle = (tab: typeof activeTab) => ({
    padding: '12px 18px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    color: activeTab === tab ? 'var(--teal)' : 'var(--ink2)',
    borderBottom: activeTab === tab ? '2px solid var(--teal)' : '2px solid transparent',
    fontFamily: 'var(--font)',
    outline: 'none',
    transition: 'all 0.15s ease'
  });

  return (
    <div>
      {showAdd && <AddProviderModal onClose={() => setShowAdd(false)} onAdded={reload} />}
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onAdded={reloadClients} />}

      <PageHeader
        crumbs={['Ondi', 'SSO & Providers']}
        titlePlain="SSO"
        titleEm="architecture"
        subtitle="Identity provider setup, architectural benchmarking against Okta/Entra ID, and OIDC sign-in flow."
        actions={activeTab === 'registry' ? (
          subTab === 'idps' ? (
            <button type="button" onClick={() => setShowAdd(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="plusCircle" size={15} /> Add provider
            </button>
          ) : (
            <button type="button" onClick={() => setShowAddClient(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="plusCircle" size={15} /> Add SSO client
            </button>
          )
        ) : undefined}
      />

      {/* Tabs Header Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={tabStyle('registry')} onClick={() => setActiveTab('registry')}>Identity Providers</button>
        <button style={tabStyle('benchmark')} onClick={() => setActiveTab('benchmark')}>SSO Benchmark</button>
        <button style={tabStyle('flow')} onClick={() => setActiveTab('flow')}>Sign-In Flow</button>
        <button style={tabStyle('feature-map')} onClick={() => setActiveTab('feature-map')}>3-Surface Map</button>
      </div>

      {/* ── Tab 1: Provider Registry ────────────────────────────────────── */}
      {activeTab === 'registry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Sub-tabs selection bar */}
          <div style={{ display: 'flex', gap: 8, margin: '0 4px', borderBottom: '1px solid var(--border-soft)', paddingBottom: 10 }}>
            <button
              type="button"
              onClick={() => setSubTab('idps')}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font)',
                background: subTab === 'idps' ? 'var(--teal-l, #ecfeff)' : 'transparent',
                color: subTab === 'idps' ? 'var(--teal)' : 'var(--ink2)',
                transition: 'all 0.15s ease'
              }}
            >
              📥 Inbound Identity Providers
            </button>
            <button
              type="button"
              onClick={() => setSubTab('clients')}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font)',
                background: subTab === 'clients' ? 'var(--teal-l, #ecfeff)' : 'transparent',
                color: subTab === 'clients' ? 'var(--teal)' : 'var(--ink2)',
                transition: 'all 0.15s ease'
              }}
            >
              📤 Outbound SSO Clients
            </button>
          </div>

          {subTab === 'idps' ? (
            <>
              <div style={{ background: 'var(--gold-l)', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: '#854d0e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon name="alertTriangle" size={15} style={{ flexShrink: 0 }} />
                <span>This registry stores provider configuration. Redirecting authorization flows (Google OAuth redirection, SAML assertion signing) executes against Ondi Auth Server routes. Enforcing a configuration here enables OIDC callback handlers.</span>
              </div>

              <SectionCard padded={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                      {['Name', 'Type', 'Enabled', 'Added', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && providers.map(p => (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{p.name}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{p.provider_type}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <button type="button" onClick={() => toggleEnabled(p)}
                            style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '4px 12px', border: 'none', cursor: 'pointer', background: p.enabled ? '#ecfdf5' : '#f1f5f9', color: p.enabled ? '#065f46' : '#64748b', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                            {p.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button type="button" title="Remove" onClick={() => remove(p.id)}
                            style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '6px 8px', cursor: 'pointer', color: 'var(--red)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                            <Icon name="trash" size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && providers.length === 0 && (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No identity providers configured yet.</div>
                )}
              </SectionCard>
            </>
          ) : (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, color: 'var(--ink2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon name="shield" size={15} style={{ flexShrink: 0, color: 'var(--teal)', marginTop: 1 }} />
                <span>Configure external client applications integrating with Ondi for single sign-on. Registered clients can initiate OAuth2/OIDC flows using PKCE or client secret signatures. First-party apps skip the user consent prompt.</span>
              </div>

              <SectionCard padded={false}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                      {['Application', 'Client ID', 'Type', 'Auth Type', 'Callback URLs', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!loadingClients && clients.map(c => {
                      const callbackList = Array.isArray(c.redirect_uris) ? c.redirect_uris : [];
                      return (
                        <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {c.logo_url ? (
                                <img src={c.logo_url} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'contain' }} />
                              ) : (
                                <Icon name="globe" size={15} style={{ color: 'var(--ink3)' }} />
                              )}
                              {c.name}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <code style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-soft)' }}>{c.client_id}</code>
                              <button type="button" title="Copy Client ID" onClick={() => copyToClipboard(c.client_id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex' }}>
                                <Icon name="copy" size={13} />
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c.first_party ? '#ecfdf5' : '#f1f5f9', color: c.first_party ? '#065f46' : '#64748b' }}>
                              {c.first_party ? 'First Party' : 'Third Party'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c.client_secret_hash ? '#eff6ff' : '#fef2f2', color: c.client_secret_hash ? '#1d4ed8' : '#b91c1c' }}>
                              {c.client_secret_hash ? 'Confidential' : 'Public (PKCE)'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink2)' }} title={callbackList.join(', ')}>
                            {callbackList.join(', ') || 'None'}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <button type="button" title="Remove Client" onClick={() => removeClient(c.id)}
                              style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '6px 8px', cursor: 'pointer', color: 'var(--red)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                              <Icon name="trash" size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!loadingClients && clients.length === 0 && (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No client applications configured yet.</div>
                )}
              </SectionCard>
            </>
          )}
        </div>
      )}

      {/* ── Tab 2: SSO Architecture Benchmark ────────────────────────────── */}
      {activeTab === 'benchmark' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Pitch card */}
          <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 12, padding: 18, fontSize: 13, color: 'var(--ink2)' }}>
            Ondi runs Google's pattern — it's Hudumika's own Identity Provider (IdP) for Hudumika's own product suite (Gmail, Workspace style) — but layers in the org-level role governance machinery Okta charges separately for, and adds identity assurance neither of them offers natively.
          </div>

          <SectionCard title="Ondi vs. Industry Leaders Identity Matrix" padded={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Capability Dimension</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 800, color: 'var(--teal)' }}>Ondi (Hudumika ID)</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#7a4a1f' }}>Okta Cloud</th>
                    <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#475569' }}>Entra ID (Azure)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Protocol Standards', 'OAuth2/OIDC (PKCE) + SAML 2.0 signed assertions', 'OAuth2/OIDC + SAML 2.0', 'OAuth2/OIDC + SAML 2.0'],
                    ['SSO Destinations', 'Hudumika suite (ClearOS, ComplyOS, Bliss, Petti)', 'Third-party apps Switchboard (Slack, Salesforce)', 'Microsoft Graph ecosystem + custom apps'],
                    ['Identity Assurance (KYC)', 'Real KYC: biometric liveness & document OCR (L2)', 'None — relies entirely on employer AD directories', 'None — AD domain identity only'],
                    ['Continuous Trust score', 'Yes — persistent score (300–850) carried in tokens', 'Login risk checks only (session-scoped)', 'Identity Protection risk signals only'],
                    ['Multi-Tenant model', 'Native org membership resolution per session', 'One directory tenant per Okta instance', 'Complex multi-tenant directory settings'],
                    ['Integrations Catalog', 'Registry-level connectors (Registry only, no OAuth store)', '7,000+ connectors in Okta Integration Network', 'Microsoft Azure AD Marketplace connectors'],
                    ['Audit Log Security', 'Hash-chained audit log with verify-chain cryptography', 'Standard append-only activity table', 'Standard Azure Event Hub audit streams'],
                    ['Pricing Model', 'Owned — $0 marginal infrastructure cost', 'Per-user monthly subscription ($6 - $17/mo)', 'Per-user license ($6 - $9/mo for Premium)'],
                  ].map(([dim, ondi, okta, entra], idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--ink)' }}>{dim}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: ondi.includes('Yes') || ondi.includes('Real') || ondi.includes('PKCE') || ondi.includes('Owned') ? 'var(--teal)' : 'var(--ink2)', fontWeight: ondi.includes('Yes') || ondi.includes('Real') || ondi.includes('PKCE') || ondi.includes('Owned') ? '700' : '400' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ondi.includes('Yes') || ondi.includes('Real') || ondi.includes('PKCE') || ondi.includes('Owned') ? 'var(--teal)' : '#64748b' }} />
                          {ondi}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>{okta}</td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>{entra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab 3: Sign-In Flow ─────────────────────────────────────────── */}
      {activeTab === 'flow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Flow steps diagram */}
          <SectionCard title="Ondi OAuth2/OIDC Auth Code Grant w/ PKCE Flow">
            <div style={{ padding: 6 }}>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, marginBottom: 16 }}>
                {[
                  { step: '1', title: 'Browser Hit', desc: 'App redirects client' },
                  { step: '2', title: '/authorize', desc: 'Ondi login + consent' },
                  { step: '3', title: 'Auth Callback', desc: 'Code returned via PKCE' },
                  { step: '4', title: '/oauth/token', desc: 'Signed token exchange' },
                  { step: '5', title: 'JWKS Verify', desc: 'RS256 crypt verify' },
                ].map((s, idx) => (
                  <div key={idx} style={{ flex: 1, minWidth: 140, background: 'var(--bg)', borderRadius: 10, padding: 12, border: '1px solid var(--border)', position: 'relative' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 4 }}>Step 0{s.step}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{s.desc}</div>
                    {idx < 4 && (
                      <span style={{ position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)', zIndex: 1, color: 'var(--ink3)', fontSize: 14 }}>→</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Continuous Policy check PDP</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.4 }}>
                    On every sensitive endpoint call, products query Ondi's Policy Decision Point (<code style={{ fontSize: 11 }}>POST /authz/check</code>). This verifies active device safety and minimum trust score, returning ALLOW, DENY, or STEP_UP.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Federated Session Identity</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.4 }}>
                    Ondi maintains unified <code style={{ fontSize: 11 }}>ondiUserId</code> mappings. An active session maps to an <code style={{ fontSize: 11 }}>ondiOrgId</code> representing a verified BRELA business registry profile.
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab 4: 3-Surface Feature Map ────────────────────────────────── */}
      {activeTab === 'feature-map' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {/* Lane 1: Personal */}
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderTop: '3px solid var(--teal)', borderRadius: 12, padding: 18, boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} />
              Personal Surface
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>For One Person</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', borderBottom: '1px solid var(--border-soft)', paddingBottom: 10 }}>One unified ID maps account details across products.</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
              <li>🔒 WebAuthn / Passkey registrations</li>
              <li>🛡️ KYC Level Assurance (L2 Verified)</li>
              <li>🚀 Real-time credit events scoring</li>
              <li>🔑 Client-Side RSA-OAEP E2EE Vault</li>
              <li>📱 QR Cross-device pairing session</li>
            </ul>
          </div>

          {/* Lane 2: Enterprise */}
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderTop: '3px solid #7a4a1f', borderRadius: 12, padding: 18, boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#7a4a1f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7a4a1f' }} />
              Enterprise Surface
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>For Running an Org</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', borderBottom: '1px solid var(--border-soft)', paddingBottom: 10 }}>Workforce administration dashboard controls and roles.</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
              <li>🏢 BRELA Tanzanian registry verification</li>
              <li>👥 Group static mappings & Role assignments</li>
              <li>🔄 Joiner/mover/leaver automation scripts</li>
              <li>📋 PDPA processing activities logs</li>
              <li>📆 Access reviews campaign scheduler</li>
            </ul>
          </div>

          {/* Lane 3: Mobile */}
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderTop: '3px solid #475569', borderRadius: 12, padding: 18, boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#475569' }} />
              Mobile Surface
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>In Your Pocket</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', borderBottom: '1px solid var(--border-soft)', paddingBottom: 10 }}>Native Flutter apps (Ondi Wallet and Ondi Auth).</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
              <li>🤳 On-device KYC document OCR scanner</li>
              <li>🧠 MobileFaceNet local liveness computation</li>
              <li>🔔 Push-based authentication approvals</li>
              <li>🎟️ Digital front-desk QR visitor sign-in</li>
              <li>📱 TOTP codes generator utility</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default OneIdSSO;
