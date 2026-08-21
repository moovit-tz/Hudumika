import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { openInAppBrowser } from '../../lib/in-app-browser.js';
import { showAlert } from '../../lib/alert.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import type { OnsiteWebsite, OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

const WEBSITE_TYPES: { value: string; label: string }[] = [
  { value: 'cms', label: 'CMS (e.g. WordPress)' },
  { value: 'static', label: 'Static site' },
  { value: 'php', label: 'PHP application' },
  { value: 'nodejs', label: 'Node.js application' },
  { value: 'python', label: 'Python application' },
  { value: 'container', label: 'Container' },
  { value: 'custom', label: 'Custom' },
];

// onsite_websites.status's real check constraint (209_onsite_core.sql) is
// inactive/active/deploying/failed/suspended — collapsing every non-active
// value into a single "Misconfigured" red banner (as this page used to)
// told a tenant their DNS was broken while a site was simply still
// deploying, or one they'd deliberately suspended.
const STATUS_META: Record<string, { badge: string; label: string }> = {
  active:     { badge: 'active',   label: 'Active' },
  deploying:  { badge: 'deploying', label: 'Deploying' },
  failed:     { badge: 'failed',   label: 'Failed' },
  suspended:  { badge: 'failed',   label: 'Suspended' },
  inactive:   { badge: 'inactive', label: 'Inactive' },
};

export function OnsiteWebsites() {
  const navigate = useNavigate();
  const [websites, setWebsites] = useState<OnsiteWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'owned' | 'shared'>('owned');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchWebsites = (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    // Real data only — this used to substitute five hardcoded fake websites
    // (real tenant domain names, faked as "active" with fabricated health
    // codes) whenever a tenant genuinely had none yet, which is a normal,
    // correctly-functioning empty state, not something to paper over.
    apiFetch('/v1/onsite/websites')
      .then((res: any) => setWebsites(Array.isArray(res) ? res : []))
      .catch(() => setWebsites([]))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    fetchWebsites();
  }, []);

  const filteredWebsites = useMemo(() => {
    return websites.filter(w =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.hosting_provider && w.hosting_provider.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [websites, searchQuery]);

  // Group by hosting plan
  const planGroups: Record<string, OnsiteWebsite[]> = useMemo(() => {
    return filteredWebsites.reduce((acc, site) => {
      const planName = site.hosting_provider || 'Premium';
      if (!acc[planName]) acc[planName] = [];
      acc[planName].push(site);
      return acc;
    }, {} as Record<string, OnsiteWebsite[]>);
  }, [filteredWebsites]);

  // Calculate Metrics
  const metrics = useMemo(() => {
    const total = websites.length;
    const active = websites.filter(w => w.status === 'active').length;
    // 'misconfigured' is likewise not a real status value — only 'failed'
    // and 'suspended' genuinely mean a site needs attention.
    const attention = websites.filter(w => w.status === 'failed' || w.status === 'suspended').length;
    // 'wordpress' is not a valid onsite_websites.type — the real check
    // constraint (209_onsite_core.sql) only allows 'cms' for a WordPress-
    // style site, so matching 'wordpress' meant this count (and the WP
    // Admin shortcut below) could never be true for any real row.
    const wpCount = websites.filter(w => w.type === 'cms').length;
    return { total, active, attention, wpCount };
  }, [websites]);

  return (
    <div className="onsite-page">
      {/* Header */}
      <div className="onsite-header">
        <div>
          <div className="onsite-bc" style={{ marginBottom: '0.4rem' }}>
            <Link to="/onsite" className="onsite-bc-link">Onsite Infrastructure</Link>
            <span>/</span>
            <span>Websites</span>
          </div>
          <div className="onsite-header-title">
            <h1>Websites</h1>
            <p>Manage hosted websites, WordPress installations, and PHP web applications.</p>
          </div>
        </div>

        <div className="onsite-header-actions">
          <button className="onsite-btn-purple" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} />
            <span>Add Website</span>
          </button>
          <button className="onsite-btn-outline" onClick={() => navigate('/workspace/billing')}>
            <Icon name="layoutDashboard" size={15} />
            <span>Get Plan</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="onsite-domains-stats">
        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon purple">
            <Icon name="layoutDashboard" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <span className="onsite-domain-stat-val">{metrics.total}</span>
            <span className="onsite-domain-stat-lbl">Total Websites</span>
            <span className="onsite-domain-stat-sub">Across all plans</span>
          </div>
        </div>

        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon green">
            <Icon name="checkCircle" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className="onsite-domain-stat-val">{metrics.active}</span>
              <span className="onsite-status-dot active" title="Active" />
            </div>
            <span className="onsite-domain-stat-lbl">Active &amp; Online</span>
            <span className="onsite-domain-stat-sub">SSL &amp; HTTP healthy</span>
          </div>
        </div>

        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon red">
            <Icon name="alertCircle" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className="onsite-domain-stat-val">{metrics.attention}</span>
              {metrics.attention > 0 && <span className="onsite-status-dot failed" title="Action required" />}
            </div>
            <span className="onsite-domain-stat-lbl">Needs Attention</span>
            <span className="onsite-domain-stat-sub">DNS or configuration issue</span>
          </div>
        </div>

        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon blue">
            <Icon name="terminal" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <span className="onsite-domain-stat-val">{metrics.wpCount}</span>
            <span className="onsite-domain-stat-lbl">CMS Sites</span>
            <span className="onsite-domain-stat-sub">Managed CMS instances</span>
          </div>
        </div>
      </div>

      {/* Row 1: Tabs + Refresh Button in a Single Horizontal Row */}
      <div className="onsite-tabs-row">
        <div className="onsite-tabs">
          <button
            className={activeTab === 'owned' ? 'onsite-tab active' : 'onsite-tab'}
            onClick={() => setActiveTab('owned')}
          >
            Owned Websites ({filteredWebsites.length})
          </button>
          <button
            className={activeTab === 'shared' ? 'onsite-tab active' : 'onsite-tab'}
            onClick={() => setActiveTab('shared')}
          >
            Shared with Workspace
          </button>
        </div>

        <button
          className="onsite-btn-outline onsite-refresh-btn"
          onClick={() => fetchWebsites(true)}
          disabled={refreshing}
        >
          <Icon name="refresh" size={14} className={refreshing ? 'onsite-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Status'}</span>
        </button>
      </div>

      {/* Row 2: Search & Filter Toolbar in a Single Horizontal Row */}
      <div className="onsite-domains-toolbar">
        <div className="onsite-domains-search-box">
          <Icon name="search" size={18} style={{ color: 'var(--ink3)' }} />
          <input
            type="text"
            className="onsite-domains-search-input"
            placeholder="Search by domain, CMS, or hosting plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink3)' }}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="onsite-domains-filter-group">
          <button className="onsite-btn-outline" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }} title="Filter tags">
            <Icon name="tag" size={14} />
            <span>Tags</span>
          </button>
          <button className="onsite-btn-outline" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }} title="Starred sites">
            <Icon name="star" size={14} />
            <span>Starred</span>
          </button>
        </div>
      </div>

      {/* Grouped Plan Cards */}
      {loading ? (
        <div className="onsite-card" style={{ padding: '2rem' }}>
          <div className="onsite-skeleton-line" style={{ width: '40%', marginBottom: '1rem' }} />
          <div className="onsite-skeleton-line" style={{ width: '100%', marginBottom: '0.5rem' }} />
          <div className="onsite-skeleton-line" style={{ width: '80%' }} />
        </div>
      ) : activeTab === 'shared' ? (
        <div className="onsite-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Icon name="users" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.75rem' }} />
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)', fontWeight: 700 }}>No shared websites</h3>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', color: 'var(--ink2)' }}>
            Websites shared or delegated across agency clients will appear here.
          </p>
        </div>
      ) : Object.keys(planGroups).length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', margin: '0 auto 1rem auto' }}>
            <Icon name="layoutDashboard" size={28} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--ink)', fontWeight: 700 }}>No websites found</h3>
          <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: '0.4rem 0 1.25rem 0' }}>
            {searchQuery ? 'No websites match your search query.' : 'Add your first website to start hosting files, WordPress, or web applications.'}
          </p>
          <button className="onsite-btn-purple" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={14} />
            <span>Add Website</span>
          </button>
        </div>
      ) : (
        Object.entries(planGroups).map(([planName, sites]) => (
          <div key={planName} className="onsite-plan-group">
            <div className="onsite-plan-header">
              <div>
                <div className="onsite-plan-title">{planName} Hosting Plan</div>
                <div className="onsite-plan-expiry">
                  {sites.length} site{sites.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="onsite-plan-header-actions">
                <button className="onsite-btn-outline" onClick={() => navigate('/onsite/domains/transfers')}>
                  <Icon name="download" size={14} />
                  <span>Migrate Website</span>
                </button>
                <button className="onsite-btn-purple" onClick={() => setShowAddModal(true)}>
                  <Icon name="plus" size={14} />
                  <span>Add Website</span>
                </button>
              </div>
            </div>

            {/* List of sites under this plan */}
            <div>
              {sites.map((site) => (
                <div key={site.id} className="onsite-website-row">
                  <div className="onsite-site-info">
                    <div className="onsite-site-icon" style={{ background: site.type === 'cms' ? 'var(--blue-l)' : 'var(--purple-l)', color: site.type === 'cms' ? 'var(--blue)' : 'var(--purple)' }}>
                      {site.type === 'cms' ? 'W' : '</>'}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <a href={site.url || '#'} target="_blank" rel="noopener noreferrer" className="onsite-site-domain">
                          {site.name} <Icon name="externalLink" size={14} style={{ color: 'var(--ink3)' }} />
                        </a>
                        <span className={`onsite-badge ${(STATUS_META[site.status] ?? STATUS_META.inactive).badge}`} style={{ fontSize: '0.72rem' }}>
                          {(STATUS_META[site.status] ?? STATUS_META.inactive).label}
                        </span>
                      </div>

                      {site.status === 'failed' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', background: 'var(--red-l)', color: 'var(--red)', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                          <Icon name="alertCircle" size={12} /> Domain is not working. Check DNS guide
                          <Icon name="refresh" size={12} style={{ cursor: 'pointer', marginLeft: '0.25rem' }} onClick={() => fetchWebsites(true)} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="onsite-site-actions">
                    {site.type === 'cms' && (
                      <button
                        className="onsite-btn-outline"
                        onClick={() => window.open((site.url || 'https://' + site.name) + '/wp-admin', '_blank', 'noopener,noreferrer')}
                      >
                        <span>WP Admin ↗</span>
                      </button>
                    )}
                    <button className="onsite-btn-purple" onClick={() => navigate('/onsite/websites/' + site.id)}>
                      <span>Dashboard</span>
                    </button>
                    <button
                      className="onsite-btn-outline"
                      disabled={!site.domain_id}
                      title={site.domain_id ? undefined : 'No domain linked to this website yet'}
                      onClick={() => site.domain_id && navigate('/onsite/domains/' + site.domain_id + '/dns')}
                    >
                      <span>DNS</span>
                    </button>
                    <button className="onsite-btn-outline onsite-btn-icon-sm" title="More options">
                      <Icon name="moreVertical" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showAddModal && (
        <AddWebsiteModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            fetchWebsites();
          }}
        />
      )}
    </div>
  );
}

function AddWebsiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('cms');
  const [domainId, setDomainId] = useState('');
  const [url, setUrl] = useState('');
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch('/v1/onsite/domains')
      .then((res: any) => setDomains(Array.isArray(res) ? res : []))
      .catch(() => setDomains([]));
  }, []);

  const domainOptions = domains.map(d => ({ value: d.id, label: d.domain }));
  const canSubmit = name.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/websites', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type,
          domain_id: domainId || undefined,
          url: url.trim() || undefined,
        }),
      });
      showAlert(`${name.trim()} was added.`, { variant: 'success' });
      onCreated();
    } catch (err: any) {
      showAlert(err.message || 'Could not add this website.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
        <div className="onsite-card-header">
          <h3 className="onsite-card-title">Add website</h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="onsite-form-group">
            <label>Name *</label>
            <input
              type="text"
              className="onsite-input"
              placeholder="My Store Front"
              value={name}
              maxLength={200}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div className="onsite-form-group">
            <label>Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full text-sm rounded-lg border-border bg-white shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEBSITE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="onsite-form-group">
            <label>Domain</label>
            <Combobox
              options={domainOptions}
              value={domainId}
              onChange={(val) => {
                setDomainId(val);
                const picked = domains.find(d => d.id === val);
                if (picked && !url.trim()) setUrl(`https://${picked.domain}`);
              }}
              placeholder={domains.length ? 'Select a domain (optional)' : 'No domains yet — add one under Domains first'}
              emptyText="No domains found"
              disabled={domains.length === 0}
            />
          </div>
          <div className="onsite-form-group">
            <label>URL</label>
            <input
              type="text"
              className="onsite-input"
              placeholder="https://example.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {submitting ? 'Adding…' : 'Add website'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
