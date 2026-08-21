import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteApplication, OnsiteSecretPublic } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<OnsiteApplication | null>(null);
  const [secrets, setSecrets] = useState<OnsiteSecretPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Secret Form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);

  // Environment form
  const [showAddEnv, setShowAddEnv] = useState(false);
  const [envName, setEnvName] = useState('');
  const [envBranch, setEnvBranch] = useState('');
  const [savingEnv, setSavingEnv] = useState(false);

  const fetchAppData = () => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/onsite/applications/${id}`)
      .then((res: any) => {
        setApp(res);
        if (res.environments && res.environments.length > 0) {
          fetchSecrets(res.environments[0].id);
        }
      })
      .catch((err: any) => setError(err.message ?? 'Failed to load application'))
      .finally(() => setLoading(false));
  };

  const fetchSecrets = (envId: string) => {
    apiFetch(`/v1/onsite/environments/${envId}/secrets`)
      .then(setSecrets)
      .catch(() => setSecrets([]));
  };

  useEffect(() => {
    fetchAppData();
  }, [id]);

  const handleAddSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app || !app.environments || app.environments.length === 0 || !newKey || !newValue) return;
    const envId = app.environments[0].id;
    setSavingSecret(true);
    try {
      await apiFetch(`/v1/onsite/environments/${envId}/secrets`, {
        method: 'POST',
        body: JSON.stringify({ key: newKey, value: newValue }),
      });
      setNewKey('');
      setNewValue('');
      fetchSecrets(envId);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save secret', { variant: 'error' });
    } finally {
      setSavingSecret(false);
    }
  };

  const handleDeleteSecret = async (secretId: string) => {
    if (!(await showConfirm('Are you sure you want to remove this secret variable?', { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/secrets/${secretId}`, { method: 'DELETE' });
      if (app && app.environments && app.environments.length > 0) {
        fetchSecrets(app.environments[0].id);
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete secret', { variant: 'error' });
    }
  };

  const handleAddEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !envName.trim()) return;
    setSavingEnv(true);
    try {
      await apiFetch(`/v1/onsite/applications/${id}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name: envName.trim(), branch: envBranch.trim() || undefined }),
      });
      setShowAddEnv(false);
      setEnvName('');
      setEnvBranch('');
      fetchAppData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add environment', { variant: 'error' });
    } finally {
      setSavingEnv(false);
    }
  };

  if (loading) {
    return (
      <div className="onsite-page">
        <p style={{ color: 'var(--ink-muted)' }}>Loading application details…</p>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="onsite-page">
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>{error || 'Application not found'}</p>
          <Link to="/onsite/applications" className="btn btn-secondary" style={{ marginTop: '1rem', width: 'fit-content' }}>
            ← Back to Applications
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Applications', app.name]}
        titlePlain="Application"
        titleEm="detail"
        subtitle={<>Runtime: {app.runtime} | Port: {app.port || 3000}</>}
        actions={<><button className="btn btn-primary" onClick={() => fetchAppData()}>
                    <Icon name="refresh" size={16} /> Refresh
                  </button></>}
      />

      <div className="onsite-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="onsite-card">
            <h3 className="onsite-card-title">Configuration</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Build Command</label>
                <div className="onsite-mono">{app.build_command || 'None'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Start Command</label>
                <div className="onsite-mono">{app.start_command || 'None'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Repository URL</label>
                <div className="onsite-mono">{app.repo_url || 'Not connected'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Current Version</label>
                <div className="onsite-mono">{app.current_version || <span style={{ color: 'var(--ink-muted)' }}>Never deployed</span>}</div>
              </div>
            </div>
          </div>

          {/* Environment Variables / Secrets */}
          <div className="onsite-card">
            <h3 className="onsite-card-title">Environment Variables & Secrets</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
              Values are encrypted at rest with AES-256-GCM. Secret values are never sent in cleartext API responses.
            </p>

            <form onSubmit={handleAddSecret} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <input
                type="text"
                className="onsite-input"
                placeholder="VARIABLE_NAME"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                style={{ flex: 1 }}
                required
              />
              <input
                type="password"
                className="onsite-input"
                placeholder="Secret value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                style={{ flex: 2 }}
                required
              />
              <button type="submit" className="btn btn-secondary" disabled={savingSecret}>
                {savingSecret ? 'Saving…' : 'Add Variable'}
              </button>
            </form>

            <div className="onsite-table-wrapper" style={{ marginTop: '1rem' }}>
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {secrets.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ color: 'var(--ink-muted)', textAlign: 'center' }}>
                        No environment variables set yet.
                      </td>
                    </tr>
                  ) : (
                    secrets.map((s) => (
                      <tr key={s.id}>
                        <td className="onsite-mono" style={{ fontWeight: 600 }}>{s.key}</td>
                        <td className="onsite-mono" style={{ color: 'var(--ink-muted)' }}>{s.value_masked}</td>
                        <td>
                          <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDeleteSecret(s.id)}>
                            <Icon name="trash2" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="onsite-card">
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Environments</h3>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowAddEnv(true)}>
                <Icon name="plus" size={14} /> Add environment
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {app.environments?.map((env) => (
                <div key={env.id} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg-subtle, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{env.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Branch: {env.branch || 'main'}</div>
                  </div>
                  <span className={`onsite-badge ${env.status}`}>{env.status}</span>
                </div>
              ))}
            </div>

            {showAddEnv && (
              <form onSubmit={handleAddEnvironment} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div className="onsite-form-group">
                  <label>Environment name *</label>
                  <input type="text" className="onsite-input" placeholder="staging" value={envName} onChange={(e) => setEnvName(e.target.value)} required />
                </div>
                <div className="onsite-form-group">
                  <label>Branch</label>
                  <input type="text" className="onsite-input" placeholder="develop" value={envBranch} onChange={(e) => setEnvBranch(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowAddEnv(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary" disabled={savingEnv}>{savingEnv ? 'Adding…' : 'Add'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
