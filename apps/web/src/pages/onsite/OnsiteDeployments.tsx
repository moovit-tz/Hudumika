import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDeployment } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteDeployments() {
  const [deployments, setDeployments] = useState<OnsiteDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/onsite/deployments')
      .then(setDeployments)
      .catch((err: any) => setError(err.message ?? 'Failed to load deployments'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>Deployment History</h1>
          <p>Real-time audit log of all build executions, branch deployments, and rollbacks.</p>
        </div>
      </div>

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading deployment logs…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : deployments.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="gitBranch" size={48} style={{ color: 'var(--ink-muted)', margin: '0 auto 1rem auto' }} />
          <h3>No deployment history recorded yet</h3>
          <p style={{ color: 'var(--ink-muted)' }}>
            Trigger your first deployment from the Applications section.
          </p>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Deployment ID</th>
                  <th>Branch / Tag</th>
                  <th>Commit Message</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Queued Time</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id}>
                    <td className="onsite-mono" style={{ fontWeight: 600 }}>
                      {d.id.substring(0, 8)}
                    </td>
                    <td>
                      <div className="onsite-mono">{d.branch || 'main'}</div>
                    </td>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.commit_message || 'Manual build trigger'}
                    </td>
                    <td>
                      <span className="onsite-badge" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--ink)' }}>
                        {d.trigger}
                      </span>
                    </td>
                    <td>
                      <span className={`onsite-badge ${d.status}`}>
                        {d.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>
                      {new Date(d.queued_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
