import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { openInAppBrowser } from '../../lib/in-app-browser.js';
import { showAlert } from '../../lib/alert.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { PageHeader } from '../../components/PageHeader.js';
import type { OnsiteWebsite, OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
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
const STATUS_META: Record<string, { variant: 'success' | 'info' | 'error' | 'gray'; label: string }> = {
  active:     { variant: 'success', label: 'Active' },
  deploying:  { variant: 'info',    label: 'Deploying' },
  failed:     { variant: 'error',   label: 'Failed' },
  suspended:  { variant: 'error',   label: 'Suspended' },
  inactive:   { variant: 'gray',    label: 'Inactive' },
};

export function OnsiteWebsites() {
  const navigate = useNavigate();
  const [websites, setWebsites] = useState<OnsiteWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'owned' | 'shared'>('owned');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadError, setLoadError] = useState('');

  const fetchWebsites = (isManual = false) => {
    setLoadError('');
    if (isManual) setRefreshing(true);
    else setLoading(true);

    // Real data only — this used to substitute five hardcoded fake websites
    // (real tenant domain names, faked as "active" with fabricated health
    // codes) whenever a tenant genuinely had none yet, which is a normal,
    // correctly-functioning empty state, not something to paper over.
    apiFetch('/v1/onsite/websites')
      .then((res: any) => setWebsites(Array.isArray(res) ? res : []))
      .catch(error => setLoadError(error.message || 'Unable to load websites'))
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
      const planName = site.hosting_provider || 'Unassigned provider';
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
      <PageHeader
        crumbs={['Onsite', 'Websites']}
        titlePlain="Managed"
        titleEm="websites"
        subtitle="Track website configuration and connected hosting providers. Adding a record does not provision hosting."
        actions={<div className="onsite-header-actions">
                    <Button onClick={() => setShowAddModal(true)}>
                      <Icon name="plus" size={16} />
                      <span>Add Website</span>
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/workspace/billing')}>
                      <Icon name="layoutDashboard" size={15} />
                      <span>Get Plan</span>
                    </Button>
                  </div>}
      />

      {loadError && <Banner variant="error" title="Website inventory unavailable" action={<Button variant="outline" onClick={() => fetchWebsites()}>Retry</Button>}>{loadError}</Banner>}
      {/* Metrics Grid */}
      <div className="onsite-domains-stats">
        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon accent">
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
            <span className="onsite-domain-stat-sub">Recorded active status</span>
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
            <span className="onsite-domain-stat-sub">Failed or suspended records</span>
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

      {/* Tabs + Search + Refresh in a single row */}
      <SearchToolbar
        search={searchQuery}
        onSearch={setSearchQuery}
        placeholder="Search by website, domain, CMS, or hosting plan"
        className="onsite-domains-toolbar"
        quickFilters={[{
          value: activeTab === 'shared' ? 'shared' : null,
          onChange: (v) => setActiveTab(v === 'shared' ? 'shared' : 'owned'),
          allLabel: `Owned Websites (${filteredWebsites.length})`,
          options: [{ value: 'shared', label: 'Shared with Workspace' }],
        }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => fetchWebsites(true)} disabled={refreshing}>
            <Icon name="refresh" size={14} className={refreshing ? 'onsite-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Status'}</span>
          </Button>
        }
      />

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
      ) : loadError && websites.length === 0 ? null : Object.keys(planGroups).length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', margin: '0 auto 1rem auto' }}>
            <Icon name="layoutDashboard" size={28} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--ink)', fontWeight: 700 }}>No websites found</h3>
          <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: '0.4rem 0 1.25rem 0' }}>
            {searchQuery ? 'No websites match your search query.' : 'Add your first website configuration and link an existing hosting provider.'}
          </p>
          <Button onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={14} />
            <span>Add Website</span>
          </Button>
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
                <Button variant="outline" size="sm" onClick={() => navigate('/onsite/domains/transfers')}>
                  <Icon name="download" size={14} />
                  <span>Migrate Website</span>
                </Button>
                <Button size="sm" onClick={() => setShowAddModal(true)}>
                  <Icon name="plus" size={14} />
                  <span>Add Website</span>
                </Button>
              </div>
            </div>

            {/* List of sites under this plan */}
            <div>
              {sites.map((site) => (
                <div key={site.id} className="onsite-website-row">
                  <div className="onsite-site-info">
                    <div className="onsite-site-icon" style={{ background: site.type === 'cms' ? 'var(--blue-l)' : 'var(--teal-l)', color: site.type === 'cms' ? 'var(--blue)' : 'var(--teal)' }}>
                      {site.type === 'cms' ? 'W' : '</>'}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <a href={site.url || '#'} target="_blank" rel="noopener noreferrer" className="onsite-site-domain">
                          {site.name} <Icon name="externalLink" size={14} style={{ color: 'var(--ink3)' }} />
                        </a>
                        <Badge variant={(STATUS_META[site.status] ?? STATUS_META.inactive).variant} style={{ fontSize: '0.72rem' }}>
                          {(STATUS_META[site.status] ?? STATUS_META.inactive).label}
                        </Badge>
                      </div>

                      {site.status === 'failed' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', background: 'var(--red-l)', color: 'var(--red)', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                          <Icon name="alertCircle" size={12} /> Review website status and provider configuration
                          <Icon name="refresh" size={12} style={{ cursor: 'pointer', marginLeft: '0.25rem' }} onClick={() => fetchWebsites(true)} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="onsite-site-actions">
                    {site.type === 'cms' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open((site.url || 'https://' + site.name) + '/wp-admin', '_blank', 'noopener,noreferrer')}
                      >
                        <span>WP Admin ↗</span>
                      </Button>
                    )}
                    <Button size="sm" onClick={() => navigate('/onsite/websites/' + site.id)}>
                      <span>Dashboard</span>
                    </Button>
                    <Tip label={site.domain_id ? 'Open DNS settings' : 'No domain linked to this website yet'}>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!site.domain_id}
                          onClick={() => site.domain_id && navigate('/onsite/domains/' + site.domain_id + '/dns')}
                        >
                          <span>DNS</span>
                        </Button>
                      </span>
                    </Tip>
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add website</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  <SelectTrigger className="w-full text-sm rounded-lg border-border shadow-sm">
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
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? <><ButtonSpinner /> Adding…</> : 'Add website'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
