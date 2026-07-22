import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

interface SsoProvider {
  id: string; provider_type: string; name: string; enabled: boolean;
  config: Record<string, any>; created_at: string;
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
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 460, maxWidth: '92vw', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
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
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}>
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
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/oneid/sso-providers').then(setProviders).catch(() => setProviders([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

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

  return (
    <div style={{ padding: 24 }}>
      {showAdd && <AddProviderModal onClose={() => setShowAdd(false)} onAdded={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>SSO &amp; Providers</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>Identity provider configuration for this tenant</div>
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Icon name="plusCircle" size={15} /> Add provider
        </button>
      </div>

      <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: '#854d0e', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Icon name="alertTriangle" size={15} />
        <span>This registry stores provider configuration only. Actually signing users in via a connected provider (SAML assertion validation, OAuth redirect handling) is not implemented yet — enabling a provider here does not change how anyone logs in today.</span>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
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
                    style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 12px', border: 'none', cursor: 'pointer', background: p.enabled ? '#ecfdf5' : '#f1f5f9', color: p.enabled ? '#065f46' : '#64748b' }}>
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button type="button" title="Remove" onClick={() => remove(p.id)}
                    style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#dc2626' }}>
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
      </div>
    </div>
  );
};
