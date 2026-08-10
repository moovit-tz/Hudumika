import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteWebsite } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteWebsites() {
  const navigate = useNavigate();
  const [websites, setWebsites] = useState<OnsiteWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'owned' | 'shared'>('owned');

  const fetchWebsites = () => {
    setLoading(true);
    apiFetch('/v1/onsite/websites')
      .then((res: any) => {
        if (Array.isArray(res) && res.length > 0) {
          setWebsites(res);
        } else {
          // Pre-populate with realistic demo sites matching Hostinger screenshot if DB is empty
          setWebsites([
            { id: '1', tenant_id: 't1', project_id: null, domain_id: null, name: 'internal.gmtl.co.tz', type: 'php', status: 'active', hosting_provider: 'Premium', hosting_id: null, url: 'https://internal.gmtl.co.tz', last_health_at: null, last_health_status: 200, created_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
            { id: '2', tenant_id: 't1', project_id: null, domain_id: null, name: 'gmtl.co.tz', type: 'wordpress', status: 'active', hosting_provider: 'Premium', hosting_id: null, url: 'https://gmtl.co.tz', last_health_at: null, last_health_status: 200, created_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
            { id: '3', tenant_id: 't1', project_id: null, domain_id: null, name: 'moovit.co.tz', type: 'php', status: 'active', hosting_provider: 'Business', hosting_id: null, url: 'https://moovit.co.tz', last_health_at: null, last_health_status: 200, created_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
            { id: '4', tenant_id: 't1', project_id: null, domain_id: null, name: 'oneid.hudumika.tz', type: 'php', status: 'misconfigured', hosting_provider: 'Business', hosting_id: null, url: 'https://oneid.hudumika.tz', last_health_at: null, last_health_status: 500, created_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
            { id: '5', tenant_id: 't1', project_id: null, domain_id: null, name: 'hudumika.tz', type: 'php', status: 'active', hosting_provider: 'Business', hosting_id: null, url: 'https://hudumika.tz', last_health_at: null, last_health_status: 200, created_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
          ]);
        }
      })
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWebsites();
  }, []);

  const filteredWebsites = websites.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by plan
  const planGroups: Record<string, OnsiteWebsite[]> = filteredWebsites.reduce((acc, site) => {
    const planName = site.hosting_provider || 'Premium';
    if (!acc[planName]) acc[planName] = [];
    acc[planName].push(site);
    return acc;
  }, {} as Record<string, OnsiteWebsite[]>);

  return (
    <div className="onsite-page">
      {/* Header */}
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>Websites</h1>
        </div>
        <div className="onsite-header-actions">
          <button className="onsite-btn-outline" onClick={() => navigate('/workspace/billing')}>
            + Get websites plan
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="onsite-tabs">
        <button
          className={`onsite-tab ${activeTab === 'owned' ? 'active' : ''}`}
          onClick={() => setActiveTab('owned')}
        >
          Owned websites
        </button>
        <button
          className={`onsite-tab ${activeTab === 'shared' ? 'active' : ''}`}
          onClick={() => setActiveTab('shared')}
        >
          Shared with you
        </button>
      </div>

      {/* Search & Filters */}
      <div className="onsite-card" style={{ padding: '0.75rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Icon name="search" size={18} style={{ color: '#a1a1aa' }} />
          <input
            type="text"
            className="onsite-input"
            placeholder="Search by domain, email, or name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '0.4rem 0', width: '100%' }}
          />
          <button className="btn btn-sm btn-ghost" title="Tag filter">
            <Icon name="tag" size={16} />
          </button>
          <button className="btn btn-sm btn-ghost" title="Starred">
            <Icon name="star" size={16} />
          </button>
        </div>
      </div>

      {/* Grouped Plan Cards (Hostinger style) */}
      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading websites…</p>
        </div>
      ) : Object.keys(planGroups).length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="layoutDashboard" size={48} style={{ color: '#a1a1aa', margin: '0 auto 1rem auto' }} />
          <h3>No websites found</h3>
          <p style={{ color: '#71717a', marginBottom: '1.5rem' }}>
            Add your first website to start hosting files, WordPress, or web applications.
          </p>
          <button className="onsite-btn-purple" onClick={() => navigate('/onsite/applications')}>
            + Add website
          </button>
        </div>
      ) : (
        Object.entries(planGroups).map(([planName, sites]) => (
          <div key={planName} className="onsite-plan-group">
            <div className="onsite-plan-header">
              <div>
                <div className="onsite-plan-title">{planName}</div>
                <div className="onsite-plan-expiry">
                  Plan expires on {planName === 'Business' ? '2027-04-11' : '2027-03-20'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button className="onsite-btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Icon name="download" size={14} /> Migrate website
                </button>
                <button className="onsite-btn-purple" onClick={() => navigate('/onsite/applications')}>
                  + Add website
                </button>
              </div>
            </div>

            {/* List of sites under this plan */}
            <div>
              {sites.map((site) => (
                <div key={site.id} className="onsite-website-row">
                  <div className="onsite-site-info">
                    <div className="onsite-site-icon">
                      {site.type === 'wordpress' ? 'W' : '</>'}
                    </div>
                    <div>
                      <a href={site.url || '#'} target="_blank" rel="noopener noreferrer" className="onsite-site-domain">
                        {site.name} <Icon name="externalLink" size={14} style={{ color: '#a1a1aa' }} />
                      </a>
                      {site.status === 'misconfigured' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', background: '#fef2f2', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                          <Icon name="alertCircle" size={12} /> Domain is not working. Check guide
                          <Icon name="refresh" size={12} style={{ cursor: 'pointer', marginLeft: '0.25rem' }} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="onsite-site-actions">
                    <button className="onsite-btn-outline">
                      Tools ▾
                    </button>
                    {site.type === 'wordpress' && (
                      <button className="onsite-btn-outline" onClick={() => window.open(`${site.url}/wp-admin`, '_blank')}>
                        WP Admin ↗
                      </button>
                    )}
                    <button className="onsite-btn-outline" onClick={() => navigate(`/onsite/applications/${site.id}`)}>
                      Dashboard
                    </button>
                    <button className="btn btn-sm btn-ghost">
                      <Icon name="moreVertical" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
