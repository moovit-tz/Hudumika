import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteDomainDetail() {
  const { id } = useParams<{ id: string }>();
  const [domain, setDomain] = useState<OnsiteDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/onsite/domains/${id}`)
      .then(setDomain)
      .catch((err: any) => setError(err.message ?? 'Domain not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="onsite-page">
        <p style={{ color: 'var(--ink-muted)' }}>Loading domain details…</p>
      </div>
    );
  }

  if (error || !domain) {
    return (
      <div className="onsite-page">
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>{error || 'Domain not found'}</p>
          <Link to="/onsite/domains" className="btn btn-secondary" style={{ marginTop: '1rem', width: 'fit-content' }}>
            ← Back to Domains
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/onsite/domains" className="btn btn-sm btn-ghost">
              <Icon name="arrowLeft" size={16} />
            </Link>
            <h1>{domain.domain}</h1>
            <span className={`onsite-badge ${domain.status}`}>{domain.status}</span>
          </div>
          <p>Managed domain settings, nameservers, DNS zone configuration, and SSL.</p>
        </div>
        <div className="onsite-header-actions">
          <Link to={`/onsite/domains/${domain.id}/dns`} className="btn btn-primary">
            <Icon name="sliders" size={16} /> Manage DNS Records
          </Link>
        </div>
      </div>

      <div className="onsite-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="onsite-card">
            <h3 className="onsite-card-title">Domain Overview</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registrar</label>
                <div style={{ fontWeight: 600 }}>{domain.registrar || 'Self-managed'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto Renew</label>
                <div style={{ fontWeight: 600 }}>{domain.auto_renew ? 'Enabled' : 'Disabled'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DNS Health</label>
                <div><span className={`onsite-badge ${domain.dns_status}`}>{domain.dns_status}</span></div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SSL Certificate</label>
                <div><span className={`onsite-badge ${domain.ssl_status}`}>{domain.ssl_status}</span></div>
              </div>
            </div>
          </div>

          <div className="onsite-card">
            <h3 className="onsite-card-title">Delegated Nameservers</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)' }}>
              To route DNS through Hudumika Onsite, set your domain's nameservers at your registrar to:
            </p>
            <div className="onsite-table-wrapper" style={{ marginTop: '0.5rem' }}>
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Nameserver</th>
                    <th>IPv4 Address</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="onsite-mono">ns1.hudumika.com</td>
                    <td className="onsite-mono">185.212.128.1</td>
                  </tr>
                  <tr>
                    <td className="onsite-mono">ns2.hudumika.com</td>
                    <td className="onsite-mono">185.212.128.2</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="onsite-card">
            <h3 className="onsite-card-title">Quick Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Link to={`/onsite/domains/${domain.id}/dns`} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                <Icon name="sliders" size={16} /> Edit DNS Records
              </Link>
              <Link to="/onsite/ssl" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                <Icon name="shield" size={16} /> Request SSL Certificate
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
