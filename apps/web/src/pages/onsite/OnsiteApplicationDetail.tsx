import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteApplication, OnsiteSecretPublic } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import './Onsite.css';

export function OnsiteApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<OnsiteApplication | null>(null);
  const [secrets, setSecrets] = useState<OnsiteSecretPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<Array<{ id: string; name: string; provider: string; external_id: string | null }>>([]);
  const [connectionId, setConnectionId] = useState('none');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [savingConnection, setSavingConnection] = useState(false);

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
    setError(null);
    apiFetch(`/v1/onsite/applications/${id}`)
      .then((res: any) => {
        setApp(res);
        setConnectionId(res.provider_connection_id ?? 'none');
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

  const loadConnections = () => {
    apiFetch('/v1/onsite/provider-connections').then(rows => {
      setConnections(rows.filter((row: any) => row.status === 'active' && ['circleci', 'github', 'cloudflare', 'digitalocean'].includes(row.provider)));
      setConnectionError(null);
    }).catch(err => setConnectionError(err.message));
  };

  useEffect(() => {
    fetchAppData();
    loadConnections();
  }, [id]);

  const saveConnection = async () => {
    setSavingConnection(true);
    try {
      const updated = await apiFetch(`/v1/onsite/applications/${id}/deployment-connection`, {
        method: 'PATCH', body: JSON.stringify({ provider_connection_id: connectionId === 'none' ? null : connectionId }),
      });
      setApp(previous => previous ? { ...previous, ...updated } : updated);
      showAlert('Deployment connection saved.', { variant: 'success' });
    } catch (err: any) { showAlert(err.message, { variant: 'error' }); }
    finally { setSavingConnection(false); }
  };

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
        <p style={{ color: 'var(--ink3)' }}>Loading application details…</p>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="onsite-page">
        <div className="onsite-card">
          <p style={{ color: 'var(--red)' }}>{error || 'Application not found'}</p>
          <Link to="/onsite/applications" style={{ marginTop: '1rem', display: 'inline-block' }}>
            <Button variant="outline">← Back to Applications</Button>
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
        actions={
          <Button onClick={() => fetchAppData()}>
            <Icon name="refresh" size={16} /> Refresh
          </Button>
        }
      />

      <div className="onsite-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="onsite-card">
            <h3 className="onsite-card-title">Configuration</h3>
            <div className="mb-4 flex min-w-0 flex-col gap-3">
              <label htmlFor="deployment-connection">Deployment connection</label>
              <Select value={connectionId} onValueChange={setConnectionId} disabled={savingConnection || Boolean(connectionError)}>
                <SelectTrigger id="deployment-connection" className="w-full min-w-0"><SelectValue placeholder="Choose a connection" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No connection — deployment disabled</SelectItem>
                  {connections.map(connection => <SelectItem key={connection.id} value={connection.id}>{connection.name} · {connection.provider} · {connection.external_id ?? 'Project reference missing'}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">Uses the project configured on this connection. Connect a separate provider project in Onsite settings for each deployment target.</p>
              {connectionError && <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-sm text-destructive">{connectionError}</p><Button variant="outline" onClick={loadConnections}>Retry connections</Button></div>}
              {app.provider_connection_id && !connections.some(connection => connection.id === app.provider_connection_id) && <p role="status">The saved connection is unavailable. Select an active connection before deploying.</p>}
              <Button onClick={saveConnection} disabled={savingConnection || Boolean(connectionError)} className="self-start">{savingConnection ? 'Saving…' : 'Save connection'}</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Build Command</label>
                <div className="onsite-mono">{app.build_command || 'None'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Start Command</label>
                <div className="onsite-mono">{app.start_command || 'None'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Repository URL</label>
                <div className="onsite-mono">{app.repo_url || 'Not connected'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Current Version</label>
                <div className="onsite-mono">{app.current_version || <span style={{ color: 'var(--ink3)' }}>Never deployed</span>}</div>
              </div>
            </div>
          </div>

          {/* Environment Variables / Secrets */}
          <div className="onsite-card">
            <h3 className="onsite-card-title">Environment Variables & Secrets</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink3)' }}>
              Values are encrypted at rest with AES-256-GCM. Secret values are never sent in cleartext API responses.
            </p>

            <form onSubmit={handleAddSecret} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="onsite-input"
                placeholder="VARIABLE_NAME"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                style={{ flex: 1, minWidth: '160px' }}
                required
              />
              <input
                type="password"
                className="onsite-input"
                placeholder="Secret value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                style={{ flex: 2, minWidth: '200px' }}
                required
              />
              <Button type="submit" variant="outline" disabled={savingSecret}>
                {savingSecret && <ButtonSpinner />}
                {savingSecret ? 'Saving…' : 'Add Variable'}
              </Button>
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
                      <td colSpan={3} style={{ color: 'var(--ink3)', textAlign: 'center' }}>
                        No environment variables set yet.
                      </td>
                    </tr>
                  ) : (
                    secrets.map((s) => (
                      <tr key={s.id}>
                        <td className="onsite-mono" style={{ fontWeight: 600 }}>{s.key}</td>
                        <td className="onsite-mono" style={{ color: 'var(--ink3)' }}>{s.value_masked}</td>
                        <td>
                          <Button variant="ghost" size="sm" style={{ color: 'var(--red)' }} onClick={() => handleDeleteSecret(s.id)} title="Delete">
                            <Icon name="trash2" size={14} />
                          </Button>
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
              <Button variant="outline" size="sm" onClick={() => setShowAddEnv(true)}>
                <Icon name="plus" size={14} /> Add environment
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {app.environments?.map((env) => (
                <div key={env.id} style={{ padding: '0.75rem', borderRadius: 'var(--r, 8px)', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{env.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>Branch: {env.branch || 'main'}</div>
                  </div>
                    <Badge variant={env.status === 'active' ? 'success' : env.status === 'deploying' ? 'info' : env.status === 'failed' ? 'error' : 'gray'}>
                      {env.status}
                    </Badge>
                </div>
              ))}
            </div>

            {showAddEnv && (
              <form onSubmit={handleAddEnvironment} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div className="onsite-form-group">
                  <label>Environment name *</label>
                  <input type="text" className="onsite-input" placeholder="staging" value={envName} onChange={(e) => setEnvName(e.target.value)} required />
                </div>
                <div className="onsite-form-group">
                  <label>Branch</label>
                  <input type="text" className="onsite-input" placeholder="develop" value={envBranch} onChange={(e) => setEnvBranch(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddEnv(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={savingEnv}>
                    {savingEnv && <ButtonSpinner />}
                    {savingEnv ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
