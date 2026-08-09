import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteApplication } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteApplications() {
  const [apps, setApps] = useState<OnsiteApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState('nodejs');
  const [repoUrl, setRepoUrl] = useState('');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [startCommand, setStartCommand] = useState('npm start');
  const [submitting, setSubmitting] = useState(false);

  const fetchApps = () => {
    setLoading(true);
    apiFetch('/v1/onsite/applications')
      .then(setApps)
      .catch((err: any) => setError(err.message ?? 'Failed to load applications'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/applications', {
        method: 'POST',
        body: JSON.stringify({
          name,
          runtime,
          repo_url: repoUrl || undefined,
          build_command: buildCommand || undefined,
          start_command: startCommand || undefined,
        }),
      });
      setShowAddModal(false);
      setName('');
      setRepoUrl('');
      fetchApps();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create application', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeploy = async (appId: string) => {
    try {
      const d = await apiFetch(`/v1/onsite/applications/${appId}/deploy`, { method: 'POST', body: JSON.stringify({}) });
      /**
       * What the CI provider accepted, not what we hope it does.
       *
       * The old message was "Deployment triggered!" and the old endpoint made
       * that true by writing 'succeeded' to the row 1.5 seconds later without
       * building anything. The deployment is now handed to a real provider and
       * is still running when this returns, so the message says so and points
       * at the provider's own build page.
       */
      showAlert(
        `Build ${d?.ci_pipeline_id ? `${d.ci_pipeline_id} ` : ''}is running on ${d?.ci_provider ?? 'the CI provider'}. `
        + 'This page updates when it reports back.',
        { title: 'Deployment started', variant: 'info' },
      );
      fetchApps();
    } catch (err: any) {
      showAlert(err.message || 'Deployment trigger failed', { variant: 'error' });
    }
  };

  const handleDelete = async (appId: string, appName: string) => {
    if (!(await showConfirm(`Are you sure you want to delete application "${appName}"?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/applications/${appId}`, { method: 'DELETE' });
      fetchApps();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete application', { variant: 'error' });
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Applications']}
        titlePlain="Hosted"
        titleEm="applications"
        subtitle="Deploy Node.js, Python, PHP, static sites, and containerized microservices."
        actions={<><button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Icon name="plus" size={16} /> Deploy New App
                  </button></>}
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading applications…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : apps.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="terminal" size={48} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>No applications deployed yet</h3>
          <p style={{ color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
            Connect a Git repository or upload code to build and deploy your application.
          </p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Create Application
          </button>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Application Name</th>
                  <th>Runtime</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Last Deployed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        <Link to={`/onsite/applications/${app.id}`} style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                          {app.name}
                        </Link>
                      </div>
                      {app.repo_url && (
                        <div className="onsite-mono" style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                          {app.repo_url}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="onsite-badge" style={{ background: 'var(--teal-l)', color: 'var(--teal)', fontWeight: 600 }}>
                        {app.runtime}
                      </span>
                    </td>
                    <td className="onsite-mono">{app.current_version || <span style={{ color: 'var(--ink-muted)' }}>Never deployed</span>}</td>
                    <td>
                      <span className={`onsite-badge ${app.status}`}>
                        {app.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>
                      {app.last_deployed_at ? new Date(app.last_deployed_at).toLocaleString() : 'Never'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleDeploy(app.id)}>
                          <Icon name="play" size={14} /> Deploy
                        </button>
                        <Link to={`/onsite/applications/${app.id}`} className="btn btn-sm btn-ghost">
                          <Icon name="settings" size={14} /> Details
                        </Link>
                        <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDelete(app.id, app.name)}>
                          <Icon name="trash2" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add App Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '520px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Deploy Application</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateApp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Application Name *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="my-api-service"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Runtime *</label>
                  <select className="onsite-select" value={runtime} onChange={(e) => setRuntime(e.target.value)}>
                    <option value="nodejs">Node.js</option>
                    <option value="python">Python</option>
                    <option value="php">PHP</option>
                    <option value="static">Static HTML / React</option>
                    <option value="container">Docker Container</option>
                  </select>
                </div>
                <div className="onsite-form-group">
                  <label>Git Repository URL</label>
                  <input
                    type="text"
                    className="onsite-input"
                    placeholder="https://github.com/org/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Build Command</label>
                  <input
                    type="text"
                    className="onsite-input"
                    value={buildCommand}
                    onChange={(e) => setBuildCommand(e.target.value)}
                  />
                </div>
                <div className="onsite-form-group">
                  <label>Start Command</label>
                  <input
                    type="text"
                    className="onsite-input"
                    value={startCommand}
                    onChange={(e) => setStartCommand(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create & Deploy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
