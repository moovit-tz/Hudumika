import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import type { OnsiteAgencyProfile } from '@hudumika/types';
import './Onsite.css';

const STATUS_BADGE: Record<string, string> = { pending: 'pending', approved: 'active', rejected: 'failed' };

export function OnsiteAgencyDirectoryAdmin() {
  const [profiles, setProfiles] = useState<OnsiteAgencyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch('/v1/onsite/agency/directory/admin')
      .then((res: any) => setProfiles(Array.isArray(res) ? res : []))
      .catch((err: any) => showAlert(err.message ?? 'Could not load directory submissions.', { variant: 'error' }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setActing(id);
    try {
      await apiFetch(`/v1/onsite/agency/directory/admin/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message ?? 'Could not update this listing.', { variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  const pending = profiles.filter(p => p.status === 'pending');
  const other = profiles.filter(p => p.status !== 'pending');

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Agency', 'Directory admin']}
        titlePlain="Directory"
        titleEm="moderation"
        subtitle="Every agency's public directory listing — approve or reject before it (re)appears in the public directory."
      />

      {loading ? (
        <div className="onsite-card"><p style={{ color: 'var(--ink2)' }}>Loading…</p></div>
      ) : profiles.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="briefcase" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.75rem' }} />
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)' }}>No submissions yet</h3>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', color: 'var(--ink2)' }}>
            Listings tenants submit from Onsite → Agency → Directory listing will show up here for review.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="onsite-card" style={{ marginBottom: '1rem' }}>
              <div className="onsite-card-header">
                <h3 className="onsite-card-title">Awaiting review ({pending.length})</h3>
              </div>
              <div className="onsite-table-wrapper">
                <table className="onsite-table">
                  <thead>
                    <tr>
                      <th>Agency</th>
                      <th>Headline</th>
                      <th>Tier</th>
                      <th>Region</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.tenant_name}</td>
                        <td>{p.headline}</td>
                        <td style={{ textTransform: 'capitalize' }}>{p.pricing_tier}</td>
                        <td>{p.region || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                            <button className="btn btn-sm btn-primary" disabled={acting === p.id} onClick={() => decide(p.id, 'approved')}>
                              Approve
                            </button>
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} disabled={acting === p.id} onClick={() => decide(p.id, 'rejected')}>
                              Reject
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

          {other.length > 0 && (
            <div className="onsite-card">
              <div className="onsite-card-header">
                <h3 className="onsite-card-title">All listings</h3>
              </div>
              <div className="onsite-table-wrapper">
                <table className="onsite-table">
                  <thead>
                    <tr>
                      <th>Agency</th>
                      <th>Headline</th>
                      <th>Status</th>
                      <th>Views</th>
                      <th>Inquiries</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {other.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.tenant_name}</td>
                        <td>{p.headline}</td>
                        <td><span className={`onsite-badge ${STATUS_BADGE[p.status]}`}>{p.status}</span></td>
                        <td>{p.profile_views}</td>
                        <td>{p.inquiries_count}</td>
                        <td style={{ textAlign: 'right' }}>
                          {p.status === 'rejected' && (
                            <button className="btn btn-sm btn-primary" disabled={acting === p.id} onClick={() => decide(p.id, 'approved')}>
                              Approve
                            </button>
                          )}
                          {p.status === 'approved' && (
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} disabled={acting === p.id} onClick={() => decide(p.id, 'rejected')}>
                              Unpublish
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
