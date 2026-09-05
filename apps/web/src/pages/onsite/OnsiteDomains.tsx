import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { Switch } from '../../components/ui/switch.js';
import { PageHeader } from '../../components/PageHeader.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../components/ui/select.js';
import './Onsite.css';

export function OnsiteDomains() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'owned' | 'external' | 'shared'>('owned');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'name' | 'expiration'>('newest');
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Banner state
  const [showPromo, setShowPromo] = useState(true);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [newDomainRegistrar, setNewDomainRegistrar] = useState('Hudumika DNS');
  const [newDomainAutoRenew, setNewDomainAutoRenew] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [domainToDelete, setDomainToDelete] = useState<OnsiteDomain | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast feedback state
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchDomains = (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    apiFetch('/v1/onsite/domains')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setDomains(res);
        }
      })
      .catch(() => setDomains([]))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  // Real domains only — this used to fall back to a hardcoded "demo" domain
  // (fake expired SSL, fake failed DNS) whenever a tenant genuinely had zero
  // domains, which is an entirely normal, correctly-functioning state for a
  // new workspace. Showing it as if real risked telling someone their setup
  // was broken when nothing had gone wrong at all — the real empty state
  // below (filteredDomains.length === 0) already covers this honestly.
  const displayDomains = domains;

  // Calculated Metrics
  const metrics = useMemo(() => {
    const total = displayDomains.length;
    const activeDns = displayDomains.filter(d => d.dns_status === 'active').length;
    const needsAttention = displayDomains.filter(d => d.dns_status === 'failed' || d.status === 'expired' || d.status === 'pending').length;
    const autoRenewCount = displayDomains.filter(d => d.auto_renew).length;
    const protectionRate = displayDomains.length > 0 ? Math.round((autoRenewCount / displayDomains.length) * 100) : 100;

    return { total, activeDns, needsAttention, protectionRate };
  }, [displayDomains]);

  // Filtered & Sorted Owned Domains
  const filteredDomains = useMemo(() => {
    return displayDomains.filter(d => {
      const matchesSearch = d.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (d.registrar && d.registrar.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (!matchesSearch) return false;

      if (statusFilter === 'active') return d.dns_status === 'active' || d.status === 'active';
      if (statusFilter === 'expired') return d.dns_status === 'failed' || d.status === 'expired';
      if (statusFilter === 'pending') return d.status === 'pending';
      if (statusFilter === 'misconfigured') return d.dns_status === 'misconfigured';

      return true;
    }).sort((a, b) => {
      if (sortOrder === 'name') return a.domain.localeCompare(b.domain);
      if (sortOrder === 'expiration') {
        const dateA = a.expires_at ? new Date(a.expires_at).getTime() : 0;
        const dateB = b.expires_at ? new Date(b.expires_at).getTime() : 0;
        return dateA - dateB;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [displayDomains, searchQuery, statusFilter, sortOrder]);

  // Select all handler
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredDomains.map(d => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleCopySelectedNames = () => {
    const names = displayDomains.filter(d => selectedIds.has(d.id)).map(d => d.domain).join('\n');
    navigator.clipboard.writeText(names);
    showToast('Copied domain names to clipboard');
  };

  const handleToggleAutoRenew = async (d: OnsiteDomain) => {
    try {
      await apiFetch('/v1/onsite/domains/' + d.id, {
        method: 'PATCH',
        body: JSON.stringify({ auto_renew: !d.auto_renew }),
      });
      showToast('Auto-renew ' + (!d.auto_renew ? 'enabled' : 'disabled') + ' for ' + d.domain);
      fetchDomains(true);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not update auto-renew.');
    }
  };

  // Add Domain Submit
  const handleCreateDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName.trim()) return;

    setIsSubmitting(true);
    setAddError(null);

    try {
      const res = await apiFetch('/v1/onsite/domains', {
        method: 'POST',
        body: JSON.stringify({
          domain: newDomainName.trim(),
          registrar: newDomainRegistrar,
          auto_renew: newDomainAutoRenew,
        }),
      });

      if (res && res.id) {
        showToast('Domain registered successfully!');
        setIsAddModalOpen(false);
        setNewDomainName('');
        fetchDomains(true);
      }
    } catch (err: any) {
      setAddError(err?.message ?? 'Failed to register domain. Please check input.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Domain Submit
  const handleDeleteDomain = async () => {
    if (!domainToDelete) return;
    setIsDeleting(true);

    try {
      await apiFetch('/v1/onsite/domains/' + domainToDelete.id, { method: 'DELETE' });
      showToast('Domain removed.');
      setDomainToDelete(null);
      fetchDomains(true);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not delete domain.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Days until expiration helper
  const getExpiryDays = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  return (
    <div className="onsite-page">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="onsite-toast">
          <Icon name="checkCircle" size={18} style={{ color: '#10b981' }} />
          <span>{toastMsg}</span>
        </div>
      )}

      <PageHeader
        crumbs={['Onsite', 'Domains']}
        titlePlain="Domain"
        titleEm="portfolio"
        subtitle="Centralized DNS management, TLD registration, and renewal control plane."
        actions={
          <div className="onsite-header-actions">
            <button className="onsite-btn-purple" onClick={() => setIsAddModalOpen(true)}>
              <Icon name="plus" size={16} />
              <span>Add Domain</span>
            </button>
            <button className="onsite-btn-outline" onClick={() => navigate('/onsite/domains/search')}>
              <Icon name="search" size={15} />
              <span>Find TLDs</span>
            </button>
            <button className="onsite-btn-outline" onClick={() => navigate('/onsite/domains/transfers')}>
              <Icon name="download" size={15} />
              <span>Transfer Domain</span>
            </button>
          </div>
        }
      />

      {/* Metrics Grid */}
      <div className="onsite-domains-stats">
        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon purple">
            <Icon name="globe" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <span className="onsite-domain-stat-val">{metrics.total}</span>
            <span className="onsite-domain-stat-lbl">Managed Domains</span>
            <span className="onsite-domain-stat-sub">Across workspace</span>
          </div>
        </div>

        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon green">
            <Icon name="checkCircle" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className="onsite-domain-stat-val">{metrics.activeDns}</span>
              <span className="onsite-status-dot active" title="DNS Operational" />
            </div>
            <span className="onsite-domain-stat-lbl">Active &amp; Healthy</span>
            <span className="onsite-domain-stat-sub">Propagated DNS records</span>
          </div>
        </div>

        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon red">
            <Icon name="alertCircle" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className="onsite-domain-stat-val">{metrics.needsAttention}</span>
              {metrics.needsAttention > 0 && <span className="onsite-status-dot failed" title="Action required" />}
            </div>
            <span className="onsite-domain-stat-lbl">Needs Attention</span>
            <span className="onsite-domain-stat-sub">Expired or misconfigured</span>
          </div>
        </div>

        <div className="onsite-domain-stat-card">
          <div className="onsite-domain-stat-icon blue">
            <Icon name="shield" size={22} />
          </div>
          <div className="onsite-domain-stat-info">
            <span className="onsite-domain-stat-val">{metrics.protectionRate}%</span>
            <span className="onsite-domain-stat-lbl">Auto-Renew Rate</span>
            <span className="onsite-domain-stat-sub">Loss prevention status</span>
          </div>
        </div>
      </div>

      {/* Promo Banner */}
      {showPromo && (
        <div className="onsite-promo-card">
          <button className="onsite-promo-dismiss" onClick={() => setShowPromo(false)} title="Dismiss promo">
            <Icon name="close" size={16} />
          </button>

          <div className="onsite-promo-wrapper">
            <div className="onsite-promo-left">
              <div className="onsite-promo-icon">
                <Icon name="lock" size={20} />
              </div>
              <div>
                <div className="onsite-promo-tag">Protect your internet identity</div>
                <div className="onsite-promo-domain">
                  <span>dccsaccos.online</span>
                  <span className="onsite-promo-link" onClick={() => navigate('/onsite/domains/search')}>
                    &bull; See all TLD options &rarr;
                  </span>
                </div>
              </div>
            </div>

            <div className="onsite-promo-right">
              <div style={{ textAlign: 'right' }}>
                <span className="onsite-promo-save">Save 97%</span>
                <span className="onsite-promo-orig-price">$35.99</span>
                <span className="onsite-promo-price">$0.99</span>
                <span className="onsite-promo-unit">/1st yr</span>
              </div>
              <button className="onsite-btn-purple" onClick={() => navigate('/onsite/domains/search')}>
                Get deal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="onsite-tabs-row">
        <div className="onsite-tabs">
          <button
            className={activeTab === 'owned' ? 'onsite-tab active' : 'onsite-tab'}
            onClick={() => setActiveTab('owned')}
          >
            Owned Domains ({displayDomains.length})
          </button>
          <button
            className={activeTab === 'external' ? 'onsite-tab active' : 'onsite-tab'}
            onClick={() => setActiveTab('external')}
          >
            External &amp; Connected
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
          onClick={() => fetchDomains(true)}
          disabled={refreshing}
        >
          <Icon name="refresh" size={14} className={refreshing ? 'onsite-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Status'}</span>
        </button>
      </div>

      {/* Control Toolbar */}
      <div className="onsite-domains-toolbar">
        <div className="onsite-domains-search-box">
          <Icon name="search" size={18} style={{ color: 'var(--ink3)' }} />
          <input
            type="text"
            className="onsite-domains-search-input"
            placeholder="Search domain name, TLD, registrar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink3)' }}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* RADIX DESIGN SYSTEM SELECT DROPDOWNS */}
        <div className="onsite-domains-filter-group">
          <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
            <SelectTrigger className="flex-1 w-1/2 min-w-0 sm:w-[170px] sm:flex-initial h-[36px] text-xs font-semibold rounded-lg border-border bg-white shadow-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-white shadow-xl">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active &amp; Healthy</SelectItem>
              <SelectItem value="expired">Expired / Action Needed</SelectItem>
              <SelectItem value="pending">Pending Verification</SelectItem>
              <SelectItem value="misconfigured">Misconfigured</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={(val) => setSortOrder(val as any)}>
            <SelectTrigger className="flex-1 w-1/2 min-w-0 sm:w-[185px] sm:flex-initial h-[36px] text-xs font-semibold rounded-lg border-border bg-white shadow-sm">
              <SelectValue placeholder="Sort Order" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-white shadow-xl">
              <SelectItem value="newest">Sort: Newest First</SelectItem>
              <SelectItem value="name">Sort: Domain Name A-Z</SelectItem>
              <SelectItem value="expiration">Sort: Expiration Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="onsite-bulk-bar">
          <span>{selectedIds.size} domain(s) selected</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              className="onsite-btn-outline"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
              onClick={handleCopySelectedNames}
            >
              <Icon name="copy" size={12} />
              <span>Copy Names</span>
            </button>
            <button
              className="onsite-btn-outline"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
              onClick={() => setSelectedIds(new Set())}
            >
              <span>Clear Selection</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: OWNED DOMAINS */}
      {activeTab === 'owned' && (
        <div className="onsite-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-skeleton-line" style={{ width: '40%' }} />
              <div className="onsite-skeleton-line" style={{ width: '100%' }} />
              <div className="onsite-skeleton-line" style={{ width: '100%' }} />
              <div className="onsite-skeleton-line" style={{ width: '80%' }} />
            </div>
          ) : filteredDomains.length === 0 ? (
            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                <Icon name="globe" size={28} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--ink)', fontWeight: 700 }}>No domains found</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--ink2)', maxWidth: '420px' }}>
                {searchQuery || statusFilter !== 'all'
                  ? 'No domains match your current filter criteria. Try resetting filters.'
                  : 'You have not registered or connected any custom domains in this workspace yet.'}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                {searchQuery || statusFilter !== 'all' ? (
                  <button className="onsite-btn-outline" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
                    <span>Reset Filters</span>
                  </button>
                ) : (
                  <button className="onsite-btn-purple" onClick={() => setIsAddModalOpen(true)}>
                    <Icon name="plus" size={14} />
                    <span>Add Your First Domain</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW */}
              <div className="onsite-table-wrapper onsite-domain-desktop-table" style={{ border: 'none' }}>
                <table className="onsite-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', paddingLeft: '1.25rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.size === filteredDomains.length && filteredDomains.length > 0}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th>Domain Name</th>
                      <th>DNS Status</th>
                      <th>Expiration Date</th>
                      <th>Auto-Renewal</th>
                      <th>Registrar</th>
                      <th style={{ textAlign: 'right', paddingRight: '1.25rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDomains.map((d) => {
                      const daysLeft = getExpiryDays(d.expires_at);
                      const isExpired = d.status === 'expired' || (daysLeft !== null && daysLeft <= 0);

                      return (
                        <tr key={d.id}>
                          <td style={{ paddingLeft: '1.25rem' }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(d.id)}
                              onChange={() => handleSelectOne(d.id)}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div className="onsite-domain-avatar">
                                {d.domain.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <Link
                                  to={'/onsite/domains/' + d.id}
                                  style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ink)', textDecoration: 'none' }}
                                >
                                  {d.domain}
                                </Link>
                                <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', marginTop: '0.1rem' }}>
                                  NS: {d.nameservers && d.nameservers.length > 0 ? d.nameservers[0] : 'ns1.hudumika.tz'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span className={d.dns_status === 'active' ? 'onsite-status-dot active' : isExpired ? 'onsite-status-dot failed' : d.status === 'pending' ? 'onsite-status-dot pending' : 'onsite-status-dot failed'} />
                              <span className={d.dns_status === 'active' ? 'onsite-badge active' : isExpired ? 'onsite-badge failed' : d.status === 'pending' ? 'onsite-badge pending' : 'onsite-badge misconfigured'}>
                                {isExpired ? 'Expired' : d.dns_status === 'active' ? 'Active & Healthy' : d.status === 'pending' ? 'Pending' : d.dns_status}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, color: isExpired ? 'var(--red)' : 'var(--ink)' }}>
                                {d.expires_at ? new Date(d.expires_at).toISOString().split('T')[0] : 'No expiry set'}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: isExpired ? 'var(--red)' : 'var(--ink3)' }}>
                                {daysLeft === null ? 'Active' : daysLeft <= 0 ? 'Expired ' + Math.abs(daysLeft) + ' days ago' : 'In ' + daysLeft + ' days'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <label className="onsite-switch-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                              <Switch checked={d.auto_renew} onCheckedChange={() => handleToggleAutoRenew(d)} />
                              <span style={{ fontSize: '0.8125rem', color: 'var(--ink2)', fontWeight: 500 }}>
                                {d.auto_renew ? 'Enabled' : 'Disabled'}
                              </span>
                            </label>
                          </td>
                          <td>
                            <span style={{ background: 'var(--bg)', color: 'var(--ink)', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '0.375rem', border: '1px solid var(--border)' }}>
                              {d.registrar || 'Hudumika DNS'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Link to={'/onsite/domains/' + d.id + '/dns'} className="onsite-btn-outline" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                                <span>Manage DNS</span>
                              </Link>

                              <button
                                className="onsite-btn-outline"
                                style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', color: 'var(--red)' }}
                                title="Remove domain"
                                onClick={() => setDomainToDelete(d)}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD VIEW (< 768px) */}
              <div className="onsite-domain-mobile-cards">
                {filteredDomains.map((d) => {
                  const daysLeft = getExpiryDays(d.expires_at);
                  const isExpired = d.status === 'expired' || (daysLeft !== null && daysLeft <= 0);

                  return (
                    <div className="onsite-domain-mobile-card" key={d.id}>
                      <div className="onsite-domain-mobile-card-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="onsite-domain-avatar">
                            {d.domain.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link
                              to={'/onsite/domains/' + d.id}
                              style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)', textDecoration: 'none' }}
                            >
                              {d.domain}
                            </Link>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ink3)', marginTop: '0.1rem' }}>
                              {d.registrar || 'Hudumika DNS'}
                            </div>
                          </div>
                        </div>

                        <span className={d.dns_status === 'active' ? 'onsite-badge active' : isExpired ? 'onsite-badge failed' : 'onsite-badge pending'}>
                          {isExpired ? 'Expired' : d.dns_status}
                        </span>
                      </div>

                      <div className="onsite-domain-mobile-card-details">
                        <div>
                          <span style={{ color: 'var(--ink3)', fontSize: '0.72rem', display: 'block' }}>Expiration</span>
                          <span style={{ fontWeight: 600, color: isExpired ? 'var(--red)' : 'var(--ink)' }}>
                            {d.expires_at ? new Date(d.expires_at).toISOString().split('T')[0] : 'No expiry set'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--ink3)', fontSize: '0.72rem', display: 'block' }}>Auto-Renewal</span>
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                            {d.auto_renew ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>

                      <div className="onsite-domain-mobile-card-actions">
                        <Link to={'/onsite/domains/' + d.id + '/dns'} className="onsite-btn-outline" style={{ fontSize: '0.8125rem' }}>
                          <span>Manage DNS</span>
                        </Link>
                        <Link to={'/onsite/domains/' + d.id} className="onsite-btn-purple" style={{ fontSize: '0.8125rem' }}>
                          <span>View Details</span>
                        </Link>
                        <button
                          className="onsite-btn-outline onsite-btn-icon-sm"
                          style={{ color: 'var(--red)' }}
                          onClick={() => setDomainToDelete(d)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: EXTERNAL DOMAINS — connecting a domain registered elsewhere
          isn't built yet (this used to show five hardcoded fake domains as
          if they were really connected); said plainly instead, matching
          the Shared tab's own honest empty state just below. */}
      {activeTab === 'external' && (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="externalLink" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.75rem' }} />
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)', fontWeight: 700 }}>No external domains connected</h3>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', color: 'var(--ink2)' }}>
            Connecting a domain you registered with another provider isn't available yet — for now, transfer it in or point its nameservers at Hudumika DNS.
          </p>
        </div>
      )}

      {/* TAB 3: SHARED DOMAINS */}
      {activeTab === 'shared' && (
        <div className="onsite-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Icon name="users" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.75rem' }} />
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)', fontWeight: 700 }}>No shared domains</h3>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', color: 'var(--ink2)' }}>
            Domains delegated or shared across agency clients will appear here.
          </p>
        </div>
      )}

      {/* MODAL: ADD CUSTOM DOMAIN */}
      {isAddModalOpen && (
        <div className="onsite-modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="onsite-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="onsite-modal-header">
              <h3 className="onsite-modal-title">
                <Icon name="globe" size={20} style={{ color: 'var(--purple)' }} />
                <span>Add Custom Domain</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink3)' }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDomain}>
              <div className="onsite-modal-body">
                {addError && <Banner variant="error">{addError}</Banner>}

                <div className="onsite-form-group">
                  <label>Domain Name *</label>
                  <input
                    type="text"
                    className="onsite-input"
                    placeholder="e.g. app.mycompany.com or brand.co.tz"
                    value={newDomainName}
                    onChange={(e) => setNewDomainName(e.target.value)}
                    required
                    autoFocus
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>
                    Enter your fully qualified domain name without http:// or https://
                  </span>
                </div>

                <div className="onsite-form-group">
                  <label>Registrar</label>
                  <Select value={newDomainRegistrar} onValueChange={(val) => setNewDomainRegistrar(val)}>
                    <SelectTrigger className="w-full h-10 rounded-lg border-border bg-white text-sm font-medium shadow-sm">
                      <SelectValue placeholder="Select Registrar" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border bg-white shadow-xl">
                      <SelectItem value="Hudumika DNS">Hudumika Managed DNS</SelectItem>
                      <SelectItem value="Hostinger">Hostinger</SelectItem>
                      <SelectItem value="Cloudflare">Cloudflare</SelectItem>
                      <SelectItem value="GoDaddy">GoDaddy</SelectItem>
                      <SelectItem value="Namecheap">Namecheap</SelectItem>
                      <SelectItem value="tzNIC">tzNIC / Tonic TZ</SelectItem>
                      <SelectItem value="External">Other External Registrar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="onsite-form-group">
                  <label className="onsite-switch-label" style={{ marginTop: '0.4rem' }}>
                    <div
                      className={newDomainAutoRenew ? 'onsite-switch-track on' : 'onsite-switch-track'}
                      onClick={() => setNewDomainAutoRenew(!newDomainAutoRenew)}
                    >
                      <div className="onsite-switch-thumb" />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>Enable Auto-Renewal Protection</span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink3)' }}>
                        Automatically renews domain before expiry date
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="onsite-modal-footer">
                <button
                  type="button"
                  className="onsite-btn-outline"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  className="onsite-btn-purple"
                  disabled={isSubmitting || !newDomainName.trim()}
                >
                  <span>{isSubmitting ? 'Registering...' : 'Add Domain'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE DOMAIN */}
      {domainToDelete && (
        <div className="onsite-modal-overlay" onClick={() => setDomainToDelete(null)}>
          <div className="onsite-modal-box" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="onsite-modal-header">
              <h3 className="onsite-modal-title" style={{ color: 'var(--red)' }}>
                <Icon name="alertCircle" size={20} />
                <span>Remove Domain</span>
              </h3>
              <button
                onClick={() => setDomainToDelete(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink3)' }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="onsite-modal-body">
              <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--ink)', lineHeight: 1.5 }}>
                Are you sure you want to remove <strong>{domainToDelete.domain}</strong> from your workspace?
              </p>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink2)' }}>
                This will delete connected DNS zone configurations and SSL routing associated with this domain.
              </p>
            </div>

            <div className="onsite-modal-footer">
              <button className="onsite-btn-outline" onClick={() => setDomainToDelete(null)}>
                <span>Cancel</span>
              </button>
              <button
                className="onsite-btn-purple"
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={handleDeleteDomain}
                disabled={isDeleting}
              >
                <span>{isDeleting ? 'Removing...' : 'Confirm Remove'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
