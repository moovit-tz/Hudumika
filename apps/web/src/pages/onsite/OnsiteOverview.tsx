import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDashboard } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteOverview() {
  const [data, setData] = useState<OnsiteDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/onsite/overview')
      .then(setData)
      .catch((err: any) => setError(err.message ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="onsite-page">
        <div className="app-loading-bar-fill" />
        <p style={{ color: 'var(--ink-muted)' }}>Loading infrastructure overview…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="onsite-page">
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error || 'Failed to load data'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="onsite-page">
      {/* Header */}
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>Infrastructure Control Plane</h1>
          <p>Manage domains, DNS, SSL certificates, websites, applications, and cloud compute.</p>
        </div>
        <div className="onsite-header-actions">
          <Link to="/onsite/domains" className="btn btn-secondary">
            <Icon name="globe" size={16} /> Manage Domains
          </Link>
          <Link to="/onsite/applications" className="btn btn-primary">
            <Icon name="plus" size={16} /> Deploy Application
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="onsite-stats-grid">
        <div className="onsite-stat-card">
          <div className="onsite-stat-icon">
            <Icon name="folder" size={22} />
          </div>
          <div className="onsite-stat-body">
            <span className="onsite-stat-value">{data.projects}</span>
            <span className="onsite-stat-label">Projects</span>
          </div>
        </div>

        <div className="onsite-stat-card">
          <div className="onsite-stat-icon">
            <Icon name="globe" size={22} />
          </div>
          <div className="onsite-stat-body">
            <span className="onsite-stat-value">{data.domains}</span>
            <span className="onsite-stat-label">Managed Domains</span>
            {data.domains_expiring_soon > 0 && (
              <span className="onsite-stat-badge warning">
                <Icon name="alertTriangle" size={12} /> {data.domains_expiring_soon} expiring soon
              </span>
            )}
          </div>
        </div>

        <div className="onsite-stat-card">
          <div className="onsite-stat-icon">
            <Icon name="shield" size={22} />
          </div>
          <div className="onsite-stat-body">
            <span className="onsite-stat-value">{data.domains}</span>
            <span className="onsite-stat-label">SSL Certificates</span>
            {data.ssl_expiring_soon > 0 && (
              <span className="onsite-stat-badge warning">
                <Icon name="alertTriangle" size={12} /> {data.ssl_expiring_soon} expiring soon
              </span>
            )}
          </div>
        </div>

        <div className="onsite-stat-card">
          <div className="onsite-stat-icon">
            <Icon name="terminal" size={22} />
          </div>
          <div className="onsite-stat-body">
            <span className="onsite-stat-value">{data.applications}</span>
            <span className="onsite-stat-label">Applications</span>
          </div>
        </div>

        <div className="onsite-stat-card">
          <div className="onsite-stat-icon">
            <Icon name="monitor" size={22} />
          </div>
          <div className="onsite-stat-body">
            <span className="onsite-stat-value">{data.servers}</span>
            <span className="onsite-stat-label">Compute Servers</span>
          </div>
        </div>

        <div className="onsite-stat-card">
          <div className="onsite-stat-icon">
            <Icon name="activity" size={22} />
          </div>
          <div className="onsite-stat-body">
            <span className="onsite-stat-value">{data.health_checks}</span>
            <span className="onsite-stat-label">Uptime Monitors</span>
          </div>
        </div>
      </div>

      {/* Alerts section if any */}
      {data.alerts.length > 0 && (
        <div className="onsite-card">
          <div className="onsite-card-header">
            <h3 className="onsite-card-title" style={{ color: '#d97706' }}>
              <Icon name="alertTriangle" size={18} /> Attention Required ({data.alerts.length})
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.alerts.map((alert) => (
              <div key={alert.id} className={`onsite-alert-item ${alert.severity}`}>
                <Icon name="alertCircle" size={18} />
                <div className="onsite-alert-content">
                  <h4>{alert.message}</h4>
                  <p>Resource: {alert.resource_name} ({alert.resource_type})</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Recent Deployments + Quick Action Links */}
      <div className="onsite-grid-2">
        <div className="onsite-card">
          <div className="onsite-card-header">
            <h3 className="onsite-card-title">
              <Icon name="gitBranch" size={18} /> Recent Deployments
            </h3>
            <Link to="/onsite/deployments" className="btn btn-sm btn-ghost">
              View All
            </Link>
          </div>

          {data.recent_deployments.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>
              No deployments recorded yet. Create an application to get started.
            </p>
          ) : (
            <div className="onsite-table-wrapper">
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Version / Branch</th>
                    <th>Commit Message</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_deployments.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.version || 'v1.0.0'}</div>
                        <div className="onsite-mono" style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                          {d.branch || 'main'}
                        </div>
                      </td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.commit_message || 'Manual trigger'}
                      </td>
                      <td>
                        <span className={`onsite-badge ${d.status}`}>
                          {d.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>
                        {new Date(d.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Sidebar: Shortcuts & Integrations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="onsite-card">
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">
                <Icon name="layers" size={18} /> Infrastructure Services
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Link to="/onsite/domains" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>
                <Icon name="globe" size={16} /> Domains & DNS Management
              </Link>
              <Link to="/onsite/ssl" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>
                <Icon name="shield" size={16} /> SSL Certificate Provisioning
              </Link>
              <Link to="/onsite/applications" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>
                <Icon name="terminal" size={16} /> Applications & Deployments
              </Link>
              <Link to="/onsite/servers" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>
                <Icon name="monitor" size={16} /> Compute Servers & VPS
              </Link>
              <Link to="/onsite/monitoring" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>
                <Icon name="activity" size={16} /> Uptime & Health Monitors
              </Link>
              <Link to="/onsite/settings" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>
                <Icon name="link" size={16} /> Provider Connections (GitHub / CI)
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
