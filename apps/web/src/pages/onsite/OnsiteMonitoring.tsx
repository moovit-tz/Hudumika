import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteHealthCheck } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteMonitoring() {
  const [checks, setChecks] = useState<OnsiteHealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [expectedStatus, setExpectedStatus] = useState('200');
  const [submitting, setSubmitting] = useState(false);

  const fetchChecks = () => {
    setLoading(true);
    apiFetch('/v1/onsite/health-checks')
      .then(setChecks)
      .catch((err: any) => setError(err.message ?? 'Failed to load health checks'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchChecks();
  }, []);

  const handleAddCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/health-checks', {
        method: 'POST',
        body: JSON.stringify({ name, url, method, expected_status: parseInt(expectedStatus, 10) || 200 }),
      });
      setShowAddModal(false);
      setName('');
      setUrl('');
      fetchChecks();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add health check', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await showConfirm(`Are you sure you want to delete monitor "${name}"?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/health-checks/${id}`, { method: 'DELETE' });
      fetchChecks();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete check', { variant: 'error' });
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Monitoring']}
        titlePlain="Uptime"
        titleEm="monitors"
        subtitle="Automated HTTP/S synthetic probes monitoring availability and latency."
        actions={<><button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Icon name="plus" size={16} /> Add Monitor
                  </button></>}
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading monitors…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : checks.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="activity" size={48} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>No synthetic probes created yet</h3>
          <p style={{ color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
            Add your site or API endpoint URL to track 30-day uptime SLAs.
          </p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Create Uptime Monitor
          </button>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Monitor Name</th>
                  <th>Target URL</th>
                  <th>Method</th>
                  <th>30-Day Uptime</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="onsite-mono" style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.url}
                    </td>
                    <td>
                      <span className="onsite-badge" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--ink)' }}>
                        {c.method}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#059669' }}>
                      {c.uptime_30d != null ? `${c.uptime_30d}%` : 'Not measured yet'}
                    </td>
                    <td>
                      <span className={`onsite-badge ${c.status}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDelete(c.id, c.name)}>
                        <Icon name="trash2" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Check Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Add Uptime Monitor</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddCheck} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Monitor Name *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="Production Web App"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="onsite-form-group">
                <label>Target URL *</label>
                <input
                  type="url"
                  className="onsite-input"
                  placeholder="https://my-app.com/health"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>HTTP Method</label>
                  <select className="onsite-select" value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="GET">GET</option>
                    <option value="HEAD">HEAD</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
                <div className="onsite-form-group">
                  <label>Expected HTTP Status</label>
                  <input
                    type="number"
                    className="onsite-input"
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Add Monitor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
