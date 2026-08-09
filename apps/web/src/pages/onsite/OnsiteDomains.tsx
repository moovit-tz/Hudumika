import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteDomains() {
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [registrar, setRegistrar] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDomains = () => {
    setLoading(true);
    apiFetch('/v1/onsite/domains')
      .then(setDomains)
      .catch((err: any) => setError(err.message ?? 'Failed to load domains'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/domains', {
        method: 'POST',
        body: JSON.stringify({ domain: newDomain, registrar }),
      });
      setShowAddModal(false);
      setNewDomain('');
      setRegistrar('');
      fetchDomains();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add domain', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDomain = async (id: string, domainName: string) => {
    if (!(await showConfirm(`Are you sure you want to remove domain "${domainName}"?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/domains/${id}`, { method: 'DELETE' });
      fetchDomains();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete domain', { variant: 'error' });
    }
  };

  const handleProbeDomain = async (id: string) => {
    try {
      await apiFetch(`/v1/onsite/domains/${id}/probe`, { method: 'POST' });
      fetchDomains();
    } catch (err: any) {
      showAlert(err.message || 'DNS probe failed', { variant: 'error' });
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Domains']}
        titlePlain="Managed"
        titleEm="domains"
        subtitle="Register, delegate nameservers, and monitor DNS & SSL health across all your domains."
        actions={<><button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Icon name="plus" size={16} /> Add Domain
                  </button></>}
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading domains…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : domains.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="globe" size={48} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>No domains connected yet</h3>
          <p style={{ color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
            Add your domain name to manage DNS zones, records, and automatic Let's Encrypt SSL certificates.
          </p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Add Your First Domain
          </button>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Domain Name</th>
                  <th>Registrar</th>
                  <th>DNS Status</th>
                  <th>SSL Certificate</th>
                  <th>Auto Renew</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        <Link to={`/onsite/domains/${d.id}`} style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                          {d.domain}
                        </Link>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                        Added {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td style={{ color: 'var(--ink-muted)' }}>
                      {d.registrar || 'Self-managed / Custom'}
                    </td>
                    <td>
                      <span className={`onsite-badge ${d.dns_status}`}>
                        {d.dns_status === 'active' ? '✓ DNS Verified' : d.dns_status}
                      </span>
                    </td>
                    <td>
                      <span className={`onsite-badge ${d.ssl_status}`}>
                        {d.ssl_status === 'active' ? '✓ Active SSL' : d.ssl_status}
                      </span>
                    </td>
                    <td>
                      {d.auto_renew ? (
                        <span style={{ color: '#059669', fontSize: '0.8125rem', fontWeight: 600 }}>Enabled</span>
                      ) : (
                        <span style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>Disabled</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link to={`/onsite/domains/${d.id}/dns`} className="btn btn-sm btn-ghost">
                          <Icon name="sliders" size={14} /> DNS Zone
                        </Link>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleProbeDomain(d.id)} title="Probe DNS">
                          <Icon name="refresh" size={14} />
                        </button>
                        <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDeleteDomain(d.id, d.domain)}>
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

      {/* Add Domain Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Add Managed Domain</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddDomain} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Domain Name *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  required
                />
              </div>
              <div className="onsite-form-group">
                <label>Registrar (Optional)</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="e.g. Cloudflare, Namecheap, GoDaddy"
                  value={registrar}
                  onChange={(e) => setRegistrar(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add Domain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
