import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteServer } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

// onsite_servers.status's real check constraint (209_onsite_core.sql) is
// unknown/running/stopped/error/provisioning/deleted — not every value has
// its own badge colour in Onsite.css, so map onto the closest one that does
// rather than rendering an uncoloured badge for 'stopped'/'provisioning'.
const STATUS_META: Record<string, { badge: string; label: string }> = {
  unknown:      { badge: 'unknown',  label: 'Not checked yet' },
  running:      { badge: 'running',  label: 'Running' },
  stopped:      { badge: 'error',    label: 'Not responding' },
  error:        { badge: 'error',    label: 'Error' },
  provisioning: { badge: 'pending',  label: 'Provisioning' },
  deleted:      { badge: 'unknown',  label: 'Deleted' },
};

export function OnsiteServers() {
  const [servers, setServers] = useState<OnsiteServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [provider, setProvider] = useState('hetzner');
  const [region, setRegion] = useState('nbg1');
  const [submitting, setSubmitting] = useState(false);

  const fetchServers = () => {
    setLoading(true);
    apiFetch('/v1/onsite/servers')
      .then(setServers)
      .catch((err: any) => setError(err.message ?? 'Failed to load servers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/servers', {
        method: 'POST',
        body: JSON.stringify({ name, ip_address: ipAddress || undefined, provider, region }),
      });
      setShowAddModal(false);
      setName('');
      setIpAddress('');
      fetchServers();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add server', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, serverName: string) => {
    if (!(await showConfirm(`Are you sure you want to delete server "${serverName}"?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/servers/${id}`, { method: 'DELETE' });
      fetchServers();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete server', { variant: 'error' });
    }
  };

  const handleCheckNow = async (id: string) => {
    setChecking(id);
    try {
      await apiFetch(`/v1/onsite/servers/${id}/check`, { method: 'POST' });
      fetchServers();
    } catch (err: any) {
      showAlert(err.message || 'Could not check this server.', { variant: 'error' });
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Servers']}
        titlePlain="Compute"
        titleEm="servers"
        subtitle="Track reachability for your Virtual Private Servers (VPS), bare metal, and cloud instances."
        actions={<><button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Icon name="plus" size={16} /> Add Server
                  </button></>}
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading server list…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : servers.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="monitor" size={48} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>No servers connected</h3>
          <p style={{ color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
            Add your cloud VPS or bare metal server to track whether it's reachable. Live CPU/RAM/disk usage needs an agent installed on the box, which isn't available yet.
          </p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Add Compute Instance
          </button>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Server Name</th>
                  <th>IP Address</th>
                  <th>Specs</th>
                  <th>Provider / Region</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{s.os || 'Linux'}</div>
                    </td>
                    <td className="onsite-mono">{s.ip_address || '—'}</td>
                    <td>
                      {s.cpu_count || 2} vCPU | {Math.round((s.ram_mb || 4096) / 1024)}GB RAM | {s.disk_gb || 80}GB SSD
                    </td>
                    <td>
                      <span className="onsite-mono" style={{ textTransform: 'capitalize' }}>
                        {s.provider} ({s.region})
                      </span>
                    </td>
                    <td>
                      <span className={`onsite-badge ${(STATUS_META[s.status] ?? STATUS_META.unknown).badge}`}>
                        {(STATUS_META[s.status] ?? STATUS_META.unknown).label}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>
                        {s.last_checked_at ? `Checked ${new Date(s.last_checked_at).toLocaleString()}` : 'Never checked'}
                      </div>
                    </td>
                    <td>
                      {s.ip_address && (
                        <button
                          className="btn btn-sm btn-ghost"
                          disabled={checking === s.id}
                          onClick={() => handleCheckNow(s.id)}
                          title="Check reachability now"
                        >
                          <Icon name="refresh" size={14} className={checking === s.id ? 'onsite-spin' : ''} />
                        </button>
                      )}
                      <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDelete(s.id, s.name)}>
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

      {/* Add Server Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Connect Server</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddServer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Server Hostname / Label *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="prod-web-node-01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="onsite-form-group">
                <label>IP Address</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="203.0.113.10"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Provider</label>
                  <select className="onsite-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                    <option value="hetzner">Hetzner</option>
                    <option value="digitalocean">DigitalOcean</option>
                    <option value="aws">AWS EC2</option>
                    <option value="gcp">Google Cloud</option>
                    <option value="manual">Other / Bare Metal</option>
                  </select>
                </div>
                <div className="onsite-form-group">
                  <label>Region</label>
                  <input
                    type="text"
                    className="onsite-input"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Connecting…' : 'Add Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
