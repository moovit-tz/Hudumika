import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteApplication } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
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

  const handleClone = async (appId: string, appName: string) => {
    if (!(await showConfirm(`Clone "${appName}"? The new application copies its configuration only — secrets and deployed data are not copied.`, { confirmLabel: 'Clone' }))) return;
    try {
      const clone = await apiFetch(`/v1/onsite/applications/${appId}/clone`, { method: 'POST', body: JSON.stringify({}) });
      showAlert(`Created "${clone.name}". Add secrets and a domain, then deploy it separately.`, { variant: 'success' });
      fetchApps();
    } catch (err: any) {
      showAlert(err.message || 'Failed to clone application', { variant: 'error' });
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Applications']}
        titlePlain="Hosted"
        titleEm="applications"
        subtitle="Deploy Node.js, Python, PHP, static sites, and containerized microservices."
        actions={
          <Button onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Deploy New App
          </Button>
        }
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink3)' }}>Loading applications…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--red)' }}>Error: {error}</p>
        </div>
      ) : apps.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="terminal" size={48} style={{ color: 'var(--ink3)', margin: '0 auto 1rem auto' }} />
          <h3>No applications deployed yet</h3>
          <p style={{ color: 'var(--ink3)', marginBottom: '1.5rem' }}>
            Connect a Git repository or upload code to build and deploy your application.
          </p>
          <Button onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Create Application
          </Button>
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
                        <div className="onsite-mono" style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>
                          {app.repo_url}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge variant="brand">
                        {app.runtime}
                      </Badge>
                    </td>
                    <td className="onsite-mono">{app.current_version || <span style={{ color: 'var(--ink3)' }}>Never deployed</span>}</td>
                    <td>
                      <Badge variant={app.status === 'active' ? 'success' : app.status === 'deploying' ? 'info' : app.status === 'failed' ? 'error' : 'gray'}>
                        {app.status}
                      </Badge>
                    </td>
                    <td style={{ color: 'var(--ink3)', fontSize: '0.8125rem' }}>
                      {app.last_deployed_at ? new Date(app.last_deployed_at).toLocaleString() : 'Never'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Button variant="outline" size="sm" onClick={() => handleDeploy(app.id)}>
                          <Icon name="play" size={14} /> Deploy
                        </Button>
                        <Link to={`/onsite/applications/${app.id}`}>
                          <Button variant="outline" size="sm">
                            <Icon name="settings" size={14} /> Details
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => handleClone(app.id, app.name)} title="Clone">
                          <Icon name="copy" size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(app.id, app.name)} title="Delete">
                          <Icon name="trash2" size={14} />
                        </Button>
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
      <Dialog open={showAddModal} onOpenChange={(o) => { if (!o) setShowAddModal(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Deploy Application</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateApp}>
            <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Runtime *</label>
                  <Select value={runtime} onValueChange={setRuntime}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nodejs">Node.js</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="php">PHP</SelectItem>
                      <SelectItem value="static">Static HTML / React</SelectItem>
                      <SelectItem value="container">Docker Container</SelectItem>
                    </SelectContent>
                  </Select>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
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
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <ButtonSpinner />}
                {submitting ? 'Creating…' : 'Create & Deploy'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
