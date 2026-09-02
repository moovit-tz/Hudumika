// ─── OneIdSSO.tsx — Perfected Ondi SSO, Benchmark, Flow & Feature Map ──
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, BASE_URL } from '../lib/api.js';
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
  // SAML — a distinct field set from the OAuth-shaped ones above: this is
  // real assertion handling now (ondi-saml.routes.ts), not config-only, so
  // it needs the IdP's actual entity ID / SSO redirect URL / signing
  // certificate rather than an OAuth client id/secret that means nothing
  // for this protocol.
  const [idpEntityId, setIdpEntityId] = useState('');
  const [idpSsoUrl, setIdpSsoUrl] = useState('');
  const [idpCertificate, setIdpCertificate] = useState('');
  const [saving, setSaving] = useState(false);

  const isSaml = type === 'SAML';
  const canSubmit = name.trim() && (!isSaml || (idpEntityId.trim() && idpSsoUrl.trim() && idpCertificate.trim()));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const config = isSaml
        ? { idpEntityId: idpEntityId.trim(), idpSsoUrl: idpSsoUrl.trim(), idpCertificate: idpCertificate.trim() }
        : { client_id: clientId, client_secret: clientSecret, metadata_url: metadataUrl };
      await apiFetch('/v1/oneid/sso-providers', {
        method: 'POST',
        body: JSON.stringify({ provider_type: type, name, config }),
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
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 18 }}>
          {isSaml
            ? 'Real assertion handling — once saved and enabled, staff can sign in through this IdP.'
            : 'Configuration only — connecting this provider to real sign-in is a follow-on step.'}
        </div>
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
            <input required value={name} onChange={e => setName(e.target.value)} placeholder={isSaml ? 'e.g. Company Okta' : 'e.g. Company Google Workspace'} style={inputStyle} />
          </div>
          {isSaml ? (
            <>
              <div>
                <label style={labelStyle}>IdP Entity ID</label>
                <input required value={idpEntityId} onChange={e => setIdpEntityId(e.target.value)} placeholder="https://your-idp.example.com/entity" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>IdP SSO URL</label>
                <input required value={idpSsoUrl} onChange={e => setIdpSsoUrl(e.target.value)} placeholder="https://your-idp.example.com/sso" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>IdP signing certificate (X.509, PEM)</label>
                <textarea required value={idpCertificate} onChange={e => setIdpCertificate(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----…" style={{ ...inputStyle, height: 90, resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 11.5 }} />
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, color: 'var(--ink3)' }}>
                Your SP metadata and ACS URL appear on this provider's row after you save it — hand those to your IdP admin to finish the other side of the trust.
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Client ID</label>
                <input value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Client secret</label>
                <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Metadata URL (OIDC)</label>
                <input value={metadataUrl} onChange={e => setMetadataUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving || !canSubmit} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (saving || !canSubmit) ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Saving…' : 'Add provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** The SP-side URLs a tenant's IT admin needs to finish wiring their IdP —
 *  computed from the same :providerId ondi-saml.routes.ts itself keys off,
 *  not stored anywhere (there's nothing to get out of sync). */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <code style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 11.5, background: 'var(--bg)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', overflow: 'auto', whiteSpace: 'nowrap' }}>{value}</code>
        <button type="button" title="Copy" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '6px 8px', cursor: 'pointer', color: copied ? 'var(--teal)' : 'var(--ink3)', flexShrink: 0, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box' }}>
          <Icon name={copied ? 'check' : 'copy'} size={13} />
        </button>
      </div>
    </div>
  );
}

function SamlDetailsModal({ provider, onClose }: { provider: SsoProvider; onClose: () => void }) {
  const metadataUrl = `${BASE_URL}/v1/ondi/auth/saml/${provider.id}/metadata`;
  const acsUrl = `${BASE_URL}/v1/ondi/auth/saml/${provider.id}/acs`;
  const loginUrl = `${BASE_URL}/v1/ondi/auth/saml/${provider.id}/login`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 520, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{provider.name} — SP details</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 18 }}>Hand these to whoever manages your IdP (Okta, Entra ID, …) to finish the trust in both directions.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CopyRow label="SP Entity ID / Metadata URL" value={metadataUrl} />
          <CopyRow label="ACS (Assertion Consumer Service) URL" value={acsUrl} />
          <CopyRow label="SP-initiated login URL" value={loginUrl} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Close</button>
        </div>
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
  const [viewSamlProvider, setViewSamlProvider] = useState<SsoProvider | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [activeTab, setActiveTab] = useState<'registry' | 'flow'>('registry');
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
      {viewSamlProvider && <SamlDetailsModal provider={viewSamlProvider} onClose={() => setViewSamlProvider(null)} />}

      <PageHeader
        crumbs={['Ondi', 'SSO & Providers']}
        titlePlain="SSO"
        titleEm="architecture"
        subtitle="Identity provider registry and OIDC sign-in flow."
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
        <button style={tabStyle('flow')} onClick={() => setActiveTab('flow')}>Sign-In Flow</button>
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
                <span>Google, Microsoft and SAML providers here connect to real sign-in against Ondi Auth Server routes once enabled. A generic OIDC provider is still config-only — that federation still needs building.</span>
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
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {p.provider_type === 'SAML' && (
                              <button type="button" title="View SP metadata & ACS URL" onClick={() => setViewSamlProvider(p)}
                                style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '6px 8px', cursor: 'pointer', color: 'var(--teal)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                                <Icon name="link" size={13} />
                              </button>
                            )}
                            <button type="button" title="Remove" onClick={() => remove(p.id)}
                              style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '6px 8px', cursor: 'pointer', color: 'var(--red)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
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

      {/* ── Tab 2: Sign-In Flow ─────────────────────────────────────────── */}
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
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Session Identity</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.4 }}>
                    Every issued token carries <code style={{ fontSize: 11 }}>sub</code> (the signed-in user) and <code style={{ fontSize: 11 }}>tenant_id</code> (their workspace) — the same claims a session cookie and an OAuth client's access token both resolve to. A workspace's own registration can be verified separately under Business Verification (KYB).
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

    </div>
  );
};

export default OneIdSSO;
