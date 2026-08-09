import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteProviderConnection } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteSettings() {
  const [connections, setConnections] = useState<OnsiteProviderConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [provider, setProvider] = useState('github');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchConnections = () => {
    setLoading(true);
    apiFetch('/v1/onsite/provider-connections')
      .then(setConnections)
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/provider-connections', {
        method: 'POST',
        body: JSON.stringify({ provider, name, token }),
      });
      setShowAddModal(false);
      setName('');
      setToken('');
      fetchConnections();
    } catch (err: any) {
      showAlert(err.message || 'Failed to connect provider', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Settings']}
        titlePlain="Provider"
        titleEm="connections"
        subtitle="Connect your GitHub org, CircleCI account, and Cloudflare tokens for continuous deployment."
        actions={<><button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Icon name="plus" size={16} /> Connect Provider
                  </button></>}
      />

      <div className="onsite-grid-2">
        <div className="onsite-card">
          <h3 className="onsite-card-title">Connected Providers</h3>
          {loading ? (
            <p style={{ color: 'var(--ink-muted)' }}>Loading provider connections…</p>
          ) : connections.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', padding: '1rem 0' }}>
              No external providers connected yet. Connect GitHub or CircleCI to enable automated repository deployments.
            </p>
          ) : (
            <div className="onsite-table-wrapper">
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Account Label</th>
                    <th>Status</th>
                    <th>Connected</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{c.provider}</td>
                      <td>{c.name}</td>
                      <td>
                        <span className={`onsite-badge ${c.status}`}>{c.status}</span>
                      </td>
                      <td style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="onsite-card">
          <h3 className="onsite-card-title">Supported Integrations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon name="gitBranch" size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>GitHub</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Repository triggers & webhooks</div>
                </div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => { setProvider('github'); setShowAddModal(true); }}>Connect</button>
            </div>

            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon name="circle" size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>CircleCI</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>CI/CD pipelines & build notifications</div>
                </div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => { setProvider('circleci'); setShowAddModal(true); }}>Connect</button>
            </div>
          </div>
        </div>
      </div>

      {/* Connect Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Connect Infrastructure Provider</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Provider Platform</label>
                <select className="onsite-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="github">GitHub</option>
                  <option value="circleci">CircleCI</option>
                  <option value="cloudflare">Cloudflare</option>
                  <option value="digitalocean">DigitalOcean</option>
                </select>
              </div>
              <div className="onsite-form-group">
                <label>Connection Name / Label *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="e.g. Primary GitHub Organization"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="onsite-form-group">
                <label>Personal Access Token / API Key</label>
                <input
                  type="password"
                  className="onsite-input"
                  placeholder="ghp_xxxxxxxxxxxx or API token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Connecting…' : 'Save Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
