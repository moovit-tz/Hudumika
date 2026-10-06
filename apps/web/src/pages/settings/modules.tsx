import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { IconName } from '../../components/Icon.js';
import { getCompany, setCompany } from '../../data/companyStore.js';
import { apiFetch } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { MetricsRow } from '../../components/MetricCard.js';
import type { MetricCardProps } from '../../components/MetricCard.js';
import { refreshTenantLocale } from '../../lib/tenantLocale.js';
import { pushTenantBranding, useBranding } from '../../hooks/useBranding.js';
import { useLocale } from '../../hooks/useLocale.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Combobox } from '../../components/ui/combobox.js';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { Badge } from '../../components/ui/badge.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeatureToggleRow } from '../../components/ui/list-item-row.js';
import { SectionCard } from '../../components/SectionCard.js';
import { EntityPicker } from '../../components/EntityPicker.js';
import { Button } from '../../components/ui/button.js';
import { Switch } from '../../components/ui/switch.js';
import { LauncherAppSvg, LAUNCHER_APPS } from '../../components/LauncherApps.js';
import { SignaturePad } from '../../components/SignaturePad.js';
import { showAlert } from '../../lib/alert.js';
import { UpgradeNotice } from '../../components/UpgradeNotice.js';
import { showConfirm } from '../../lib/confirm.js';
import { useEntitlements, resetEntitlementsCache } from '../../hooks/useEntitlements.js';
import { useAuth } from '../../hooks/useAuth.js';
import { APP_META } from '../Utilities.js';
import { AI_PROVIDERS } from '../../lib/aiProviders.js';
import { SettingsCtx, Toggle, Field, ToggleRow, Card, SaveRow, useFields, useSettingsFields } from './shared.js';

// -- section: Modules & Extensions -------------------------------------------
export interface ModuleCatalogEntry {
  name: string;
  desc: string;
  category: string;
  color: string;
}

export const MODULE_CATALOG: Record<string, ModuleCatalogEntry> = {
  clearos:      { name: 'ClearOS',       desc: 'Customs clearance platform, declarations & TANCIS integration.', category: 'Logistics & Trade', color: '#ea580c' },
  tracking:     { name: 'HuduFreight',   desc: 'Fleet, vehicle and driver tracking — live GPS positions & trips.', category: 'Logistics & Trade', color: '#0891b2' },
  cargotracker: { name: 'CargoTracker',  desc: 'AWB & Bill of Lading shipment tracking across sea & air carriers.', category: 'Logistics & Trade', color: '#4f46e5' },
  seal:         { name: 'SEAL',          desc: 'Bonded warehousing ledger, customs examination & storage clock.', category: 'Logistics & Trade', color: '#0f766e' },
  inventory:    { name: 'Inventory',     desc: 'Stock control, multi-warehouse counts, batches & reorder alerts.', category: 'Logistics & Trade', color: '#0f766e' },
  demurrage:    { name: 'Demurrage',     desc: 'Container dwell time and demurrage cost tracking.',               category: 'Logistics & Trade', color: '#f59e0b' },
  finops:       { name: 'FinOps',        desc: 'Financial accounts, TRA EFDMS integration, bills & ledgers.',     category: 'Finance & Accounts', color: '#0284c7' },
  petti:        { name: 'Petti',         desc: 'Tenant petty-cash wallets — deposit, request, approve & disburse.', category: 'Finance & Accounts', color: '#16a34a' },
  complyos:     { name: 'ComplyOS',      desc: 'Compliance tracking, BRELA business search, permits & audits.',   category: 'Compliance & Legal', color: 'var(--green)' },
  sign:         { name: 'eSign',         desc: 'Secure electronic document signatures, approvals & audit logs.',  category: 'Compliance & Legal', color: '#2563eb' },
  nexushr:      { name: 'NexusHR',       desc: 'People operations, payroll, attendance & shift rosters.',         category: 'People & HR', color: '#0d9488' },
  contacts:     { name: 'Contacts',      desc: 'Shared customer, vendor and partner contact directory.',          category: 'People & HR', color: '#1a73e8' },
  crm:          { name: 'CRM',           desc: 'Customer relationships, sales pipeline & lead tracking.',         category: 'Communication & CRM', color: 'var(--green)' },
  bliss:        { name: 'Bliss',         desc: 'Omnichannel customer helpdesk, ticketing & SLA reminders.',       category: 'Communication & CRM', color: '#7c3aed' },
  email:        { name: 'Email',         desc: 'Unified team inbox, webmail & shared email workspace.',           category: 'Communication & CRM', color: '#0078d4' },
  sms:          { name: 'SMS',           desc: 'Bulk and transactional SMS messaging campaigns & gateways.',      category: 'Communication & CRM', color: 'var(--red)' },
  ai:           { name: 'AI',            desc: 'Document extraction, assisted analysis, and workflow automation.', category: 'AI & Automation', color: '#6d28d9' },
  studio:       { name: 'Studio',        desc: 'Visual workflow builder and cross-app automations.',              category: 'AI & Automation', color: '#4361ee' },
  hudubi:       { name: 'HuduBI',        desc: 'Business reports, dashboards, board KPIs, and forecasts.',         category: 'Analytics', color: '#18181b' },
  cloud:        { name: 'Cloud',         desc: 'Enterprise cloud drive, file manager & secure storage.',          category: 'Productivity & Cloud', color: '#0369a1' },
  calendar:     { name: 'Calendar',      desc: 'Shared scheduling, video meetings & team calendars.',             category: 'Productivity & Cloud', color: '#db2777' },
  tasks:        { name: 'Tasks',         desc: 'Team task tracking, assignments & to-dos across apps.',           category: 'Productivity & Cloud', color: '#0f766e' },
  // Standalone Projects app (migration 313) — real feature key
  // (ALL_FEATURE_KEYS in packages/types) with real package_features grants,
  // but never had a catalog entry here, so it was invisible in Modules &
  // Extensions even though it's fully shipped and plan-gated like every
  // other app. See entitlements.ts's own comment on the same key.
  projects:     { name: 'Projects',      desc: 'Enterprise project management — milestones, Gantt, contracts & timesheets.', category: 'Productivity & Cloud', color: '#a21caf' },
  notes:        { name: 'Notes',         desc: 'Shared team notes, checklists, documents & sketches.',            category: 'Productivity & Cloud', color: '#fbbc04' },
  store:        { name: 'Store',         desc: 'B2B procurement, equipment marketplace & catalog.',              category: 'Productivity & Cloud', color: '#8b5cf6' },
  onsite:       { name: 'Onsite',        desc: 'Domains, DNS, hosting, deployments & cloud infra.',               category: 'Infrastructure & Admin', color: '#0f172a' },
  onesite:      { name: 'CMS',           desc: 'Content management, landing page & company intranet.',            category: 'Infrastructure & Admin', color: '#06b6d4' },
  ondi:         { name: 'Ondi',          desc: 'Single sign-on, identity verification & biometric security.',     category: 'Infrastructure & Admin', color: '#4253d1' },
  workspace:    { name: 'Workspace Admin', desc: 'Organization settings, branding & platform configuration.',      category: 'Infrastructure & Admin', color: '#64748b' },
};

export const MODULE_CATEGORIES = [
  'All',
  'Logistics & Trade',
  'Finance & Accounts',
  'Compliance & Legal',
  'People & HR',
  'Communication & CRM',
  'AI & Automation',
  'Productivity & Cloud',
  'Infrastructure & Admin',
] as const;

export const ModulesSection: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();
  const canManageModules = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user.role);
  const entitlements = useEntitlements();
  // Platform-wide "Beta" label (migration 395) — a SuperAdmin sets this once
  // on app_status and every tenant's GET /v1/entitlements reports the same
  // list, replacing what used to be a hardcoded status field on
  // MODULE_CATALOG that no admin could actually change.
  const betaApps = useMemo(() => new Set(entitlements?.betaApps ?? []), [entitlements]);
  const [overrides, setOverrides] = useState<Record<string, boolean> | null>(null);
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);
  const [savingBulk, setSavingBulk] = useState(false);
  const [licenseAppId, setLicenseAppId] = useState<string | null>(null);
  const [licenseData, setLicenseData] = useState<{ restricted?: Record<string, boolean>; grants?: Array<{ app_id: string; user_id: string; user_name: string; user_email: string }> } | null>(null);

  // Search, filter & layout preferences
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'enabled' | 'disabled' | 'restricted'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('hudumika_settings_modules_view') as 'grid' | 'list') || 'grid';
  });

  const handleViewChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('hudumika_settings_modules_view', mode);
  };

  const refreshLicenses = useCallback(() => {
    apiFetch('/v1/settings/app-licenses')
      .then((lic: any) => setLicenseData(lic || {}))
      .catch(() => setLicenseData({ restricted: {}, grants: [] }));
  }, []);

  useEffect(() => {
    apiFetch('/v1/settings')
      .then(res => setOverrides(res.settings?.['enabled-apps'] || {}))
      .catch(() => setOverrides({}));
    refreshLicenses();
  }, [refreshLicenses]);

  const moduleKeys = entitlements
    ? Object.keys(entitlements.features).filter(k => k in APP_META || k in MODULE_CATALOG)
    : [];

  async function toggleModule(key: string, nextOn: boolean) {
    const nextOverrides = { ...(overrides ?? {}), [key]: nextOn };
    const prevOverrides = overrides;
    setOverrides(nextOverrides);
    setModuleSaving(key);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': nextOverrides }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(prevOverrides);
      showAlert(err.message || 'That module could not be changed.', {
        title: /plan/i.test(err.message || '') ? 'Not in your plan' : 'Could not update module',
        variant: /plan/i.test(err.message || '') ? 'warning' : 'error',
      });
    } finally {
      setModuleSaving(null);
    }
  }

  async function enableAllModules() {
    if (!entitlements) return;
    const nextOverrides: Record<string, boolean> = {};
    moduleKeys.forEach(k => { nextOverrides[k] = true; });
    const prevOverrides = overrides;
    setOverrides(nextOverrides);
    setSavingBulk(true);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': nextOverrides }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(prevOverrides);
      showAlert(err.message || 'Failed to update modules.', { variant: 'error' });
    } finally {
      setSavingBulk(false);
    }
  }

  async function resetModulesToDefault() {
    const confirmed = await showConfirm(
      'This will reset all module switches to match your subscription package entitlements.',
      {
        title: 'Reset Module Overrides?',
        confirmLabel: 'Reset Defaults',
      }
    );
    if (!confirmed) return;
    const prevOverrides = overrides;
    setOverrides({});
    setSavingBulk(true);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'enabled-apps': {} }) });
      resetEntitlementsCache();
    } catch (err: any) {
      setOverrides(prevOverrides);
      showAlert(err.message || 'Failed to reset module settings.', { variant: 'error' });
    } finally {
      setSavingBulk(false);
    }
  }

  // Filtered keys
  const filteredKeys = useMemo(() => {
    return moduleKeys.filter(key => {
      const meta = MODULE_CATALOG[key] || APP_META[key] || { name: key, desc: '', category: 'Other', color: '#64748b' };
      const name = meta.name.toLowerCase();
      const desc = (meta.desc || '').toLowerCase();
      const cat = (meta.category || '').toLowerCase();
      const q = searchQuery.trim().toLowerCase();

      const matchesSearch = !q || name.includes(q) || desc.includes(q) || cat.includes(q) || key.includes(q);
      if (!matchesSearch) return false;

      if (selectedCategory !== 'All' && meta.category !== selectedCategory) return false;

      const isOn = overrides ? (overrides[key] ?? entitlements?.features[key] ?? true) : (entitlements?.features[key] ?? true);
      const isRestricted = !!licenseData?.restricted?.[key];

      if (selectedStatus === 'enabled' && !isOn) return false;
      if (selectedStatus === 'disabled' && isOn) return false;
      if (selectedStatus === 'restricted' && (!isOn || !isRestricted)) return false;

      return true;
    });
  }, [moduleKeys, overrides, entitlements, licenseData, searchQuery, selectedCategory, selectedStatus]);

  // Statistics
  const totalCount = moduleKeys.length;
  const enabledCount = moduleKeys.filter(k => (overrides ? (overrides[k] ?? entitlements?.features[k] ?? true) : (entitlements?.features[k] ?? true))).length;
  const restrictedCount = moduleKeys.filter(k => !!licenseData?.restricted?.[k]).length;

  // Statistics cards matching ClearOS design system
  const statCards: MetricCardProps[] = [
    {
      title: 'TOTAL APPLICATIONS',
      value: totalCount > 0 ? String(totalCount) : '—',
      sub1Label: 'IN PLATFORM',
      sub1Value: `${totalCount} Available`,
      sub2Label: 'SUITE STATUS',
      sub2Value: 'Enterprise Ready',
      barHighlight: 'var(--teal)',
      icon: 'grid',
    },
    {
      title: 'ACTIVE MODULES',
      value: String(enabledCount),
      sub1Label: 'WORKSPACE STATUS',
      sub1Value: 'Live & Operational',
      sub2Label: 'COVERAGE',
      sub2Value: totalCount > 0 ? `${Math.round((enabledCount / totalCount) * 100)}% Active` : '100%',
      barHighlight: 'var(--green)',
      icon: 'checkCircle',
    },
    {
      title: 'SEAT RESTRICTIONS',
      value: String(restrictedCount),
      sub1Label: 'PER-SEAT ACCESS',
      sub1Value: restrictedCount > 0 ? `${restrictedCount} Restricted` : 'Open Access',
      sub2Label: 'POLICY',
      sub2Value: restrictedCount > 0 ? 'Managed by Seat' : 'All Workspace Members',
      barHighlight: 'var(--gold)',
      icon: 'lock',
    },
  ];

  return (
    <div className="s-mods-root">
      {/* ── Overview Metrics Row ── */}
      <MetricsRow cards={statCards} />

      {/* ── Single Responsive Row Toolbar ── */}
      <div className="s-mods-toolbar">
        {/* Search Input */}
        <div className="s-mods-search-wrap">
          <div className="s-mods-search-icon">
            <Icon name="search" size={15} />
          </div>
          <input
            type="text"
            placeholder="Search modules by name, category, or features…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="s-mods-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="s-mods-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        {/* Category Filter Chips (Scrollable inline segment) */}
        <div className="s-mods-cats-scroll">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList style={{ display: 'inline-flex', flexWrap: 'nowrap' }}>
              {MODULE_CATEGORIES.map(cat => {
                const count = cat === 'All'
                  ? moduleKeys.length
                  : moduleKeys.filter(k => (MODULE_CATALOG[k]?.category || 'Other') === cat).length;
                if (count === 0 && cat !== 'All') return null;
                const isActive = selectedCategory === cat;
                return (
                  <TabsTrigger key={cat} value={cat} style={{ whiteSpace: 'nowrap' }}>
                    {cat}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--badge-radius)', lineHeight: 1.5, background: isActive ? 'var(--teal-l)' : 'var(--bg)', color: isActive ? 'var(--teal)' : 'var(--ink3)', marginLeft: 4 }}>{count}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {/* Right Action Controls */}
        <div className="s-mods-toolbar-actions">
          {/* Status Dropdown */}
          <Select value={selectedStatus} onValueChange={v => setSelectedStatus(v as any)}>
            <SelectTrigger className="s-mods-status-trigger" style={{ height: 36 }}>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="enabled">Enabled Only</SelectItem>
              <SelectItem value="disabled">Disabled Only</SelectItem>
              <SelectItem value="restricted">Restricted Access</SelectItem>
            </SelectContent>
          </Select>

          {/* View Mode Toggle */}
          <Tabs value={viewMode} onValueChange={v => handleViewChange(v as typeof viewMode)} variant="segmented">
            <TabsList>
              <TabsTrigger value="grid" title="Card Grid View">
                <Icon name="grid" size={15} />
              </TabsTrigger>
              <TabsTrigger value="list" title="Table List View">
                <Icon name="list" size={15} />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Bulk Actions (Admin only) */}
          {canManageModules && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={enableAllModules}
                disabled={savingBulk}
                style={{ height: 36, whiteSpace: 'nowrap' }}
              >
                <Icon name="check" size={13} style={{ marginRight: 4 }} />
                Enable All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetModulesToDefault}
                disabled={savingBulk}
                style={{ height: 36, color: 'var(--ink3)', whiteSpace: 'nowrap' }}
              >
                Reset Defaults
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Main Content Area: Grid or List ── */}
      {!entitlements || overrides === null ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink3)' }}>
          <Icon name="refresh" size={24} className="animate-spin" />
          <div style={{ fontSize: 13, marginTop: 10, fontWeight: 500 }}>Loading workspace modules & entitlements…</div>
        </div>
      ) : filteredKeys.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px dashed var(--border)' }}>
          <Icon name="search" size={32} color="var(--ink3)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No matching modules found</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
            Try adjusting your search query, status filter, or category selection.
          </div>
          {(searchQuery || selectedCategory !== 'All' || selectedStatus !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              style={{ marginTop: 14 }}
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedStatus('all');
              }}
            >
              Clear all filters
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ── */
        <div className="s-mods-grid">
          {filteredKeys.map(key => {
            const catalog = MODULE_CATALOG[key];
            const meta = catalog || APP_META[key] || { name: key, desc: '', category: 'Other', color: '#0d9488' };
            const on = overrides[key] ?? entitlements.features[key] ?? true;
            const maintenance = entitlements.appStatus[key] === 'maintenance';
            const isRestricted = !!licenseData?.restricted?.[key];
            const grantCount = licenseData?.grants?.filter(g => g.app_id === key).length ?? 0;
            const appColor = branding.getAppColor(key, catalog?.color || '#0d9488');
            const logoUrl = branding.getAppLogo(key);
            const isSaving = moduleSaving === key;

            return (
              <div key={key} className={`s-mod-card ${!on ? 's-mod-card--disabled' : ''}`}>
                <div>
                  <div className="s-mod-card-top">
                    <div className="s-mod-card-ident">
                      <div className="s-mod-icon-box" style={{ background: `${appColor}15`, border: `1px solid ${appColor}30` }}>
                        <LauncherAppSvg id={key} color={appColor} logoUrl={logoUrl} size={36} />
                      </div>
                      <div className="s-mod-card-meta">
                        <div className="s-mod-title-row">
                          <span className="s-mod-title">{branding.getAppName(key, meta.name)}</span>
                          {betaApps.has(key) && <span className="s-mod-badge-beta">Beta</span>}
                        </div>
                        <div className="s-mod-category">{meta.category}</div>
                      </div>
                    </div>

                    {/* Master Switch */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isSaving && <Icon name="refresh" size={14} className="animate-spin" color="var(--teal)" />}
                      <Switch
                        checked={on}
                        disabled={!canManageModules || maintenance || isSaving}
                        onCheckedChange={v => toggleModule(key, v)}
                      />
                    </div>
                  </div>

                  <p className="s-mod-card-desc">
                    {maintenance ? 'Application currently undergoing scheduled maintenance.' : (branding.getAppSlogan(key, meta.desc) || meta.desc)}
                  </p>
                </div>

                <div className="s-mod-card-footer">
                  {on ? (
                    <button
                      type="button"
                      className={`s-mod-access-tag ${isRestricted ? 's-mod-access-tag--locked' : 's-mod-access-tag--open'}`}
                      onClick={() => canManageModules && setLicenseAppId(key)}
                      disabled={!canManageModules}
                    >
                      <Icon name={isRestricted ? 'lock' : 'globe'} size={12} />
                      {isRestricted ? `Restricted (${grantCount} ${grantCount === 1 ? 'user' : 'users'})` : 'Open to Everyone'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 500 }}>
                      Disabled in workspace
                    </span>
                  )}

                  {canManageModules && on && (
                    <button
                      type="button"
                      className="s-mod-access-btn"
                      onClick={() => setLicenseAppId(key)}
                    >
                      <Icon name="users" size={13} />
                      Manage Access
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Table List View ── */
        <div className="s-mods-table-wrap">
          <table className="s-mods-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Application</th>
                <th style={{ width: '18%' }}>Category</th>
                <th style={{ width: '30%' }}>Description</th>
                <th style={{ width: '16%' }}>Access Permission</th>
                <th style={{ width: '8%', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map(key => {
                const catalog = MODULE_CATALOG[key];
                const meta = catalog || APP_META[key] || { name: key, desc: '', category: 'Other', color: '#0d9488' };
                const on = overrides[key] ?? entitlements.features[key] ?? true;
                const maintenance = entitlements.appStatus[key] === 'maintenance';
                const isRestricted = !!licenseData?.restricted?.[key];
                const grantCount = licenseData?.grants?.filter(g => g.app_id === key).length ?? 0;
                const appColor = branding.getAppColor(key, catalog?.color || '#0d9488');
                const logoUrl = branding.getAppLogo(key);
                const isSaving = moduleSaving === key;

                return (
                  <tr key={key} style={{ opacity: on ? 1 : 0.65 }}>
                    <td>
                      <div className="s-mods-table-app">
                        <div className="s-mods-table-icon" style={{ background: `${appColor}15`, border: `1px solid ${appColor}30` }}>
                          <LauncherAppSvg id={key} color={appColor} logoUrl={logoUrl} size={28} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="s-mods-table-name">{branding.getAppName(key, meta.name)}</span>
                            {betaApps.has(key) && <span className="s-mod-badge-beta">Beta</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="s-mods-table-cat">{meta.category}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.4 }}>
                        {maintenance ? 'Under maintenance' : (branding.getAppSlogan(key, meta.desc) || meta.desc)}
                      </div>
                    </td>
                    <td>
                      {on ? (
                        <button
                          type="button"
                          className={`s-mod-access-tag ${isRestricted ? 's-mod-access-tag--locked' : 's-mod-access-tag--open'}`}
                          onClick={() => canManageModules && setLicenseAppId(key)}
                          disabled={!canManageModules}
                        >
                          <Icon name={isRestricted ? 'lock' : 'globe'} size={12} />
                          {isRestricted ? `Restricted (${grantCount})` : 'Open to All'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Disabled</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isSaving && <Icon name="refresh" size={13} className="animate-spin" color="var(--teal)" />}
                        <Switch
                          checked={on}
                          disabled={!canManageModules || maintenance || isSaving}
                          onCheckedChange={v => toggleModule(key, v)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Executive "Who Has Access" License Modal ── */}
      {licenseAppId && (
        <AppLicensePanel
          appId={licenseAppId}
          appName={MODULE_CATALOG[licenseAppId]?.name ?? APP_META[licenseAppId]?.name ?? licenseAppId}
          appColor={branding.getAppColor(licenseAppId, MODULE_CATALOG[licenseAppId]?.color ?? '#0d9488')}
          onClose={() => setLicenseAppId(null)}
          onUpdated={refreshLicenses}
        />
      )}
    </div>
  );
};

/**
 * Redesigned Executive App License Panel Modal
 */
export function AppLicensePanel({
  appId,
  appName,
  appColor = 'var(--teal)',
  onClose,
  onUpdated,
}: {
  appId: string;
  appName: string;
  appColor?: string;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [restricted, setRestricted] = useState(false);
  const [grants, setGrants] = useState<{ user_id: string; user_name: string; user_email: string }[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUserId, setAddUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchGrantQuery, setSearchGrantQuery] = useState('');
  const branding = useBranding();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/settings/app-licenses'),
      apiFetch('/v1/hr/staff').catch(() => []),
    ]).then(([lic, s]) => {
      setRestricted(!!lic.restricted?.[appId]);
      setGrants((lic.grants ?? []).filter((g: any) => g.app_id === appId).map((g: any) => ({ user_id: g.user_id, user_name: g.user_name, user_email: g.user_email })));
      setStaff(Array.isArray(s) ? s : (s?.data ?? []));
    }).finally(() => setLoading(false));
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function toggleRestricted(next: boolean) {
    setSaving(true);
    try {
      await apiFetch(`/v1/settings/app-licenses/${appId}`, { method: 'PATCH', body: JSON.stringify({ restricted: next }) });
      setRestricted(next);
      onUpdated?.();
    } catch (err: any) {
      showAlert(err.message || 'Could not update license restriction.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function addPerson() {
    if (!addUserId) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/settings/app-licenses/${appId}/grant`, { method: 'POST', body: JSON.stringify({ user_id: addUserId }) });
      setAddUserId('');
      load();
      onUpdated?.();
    } catch (err: any) {
      showAlert(err.message || 'Could not grant access.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function removePerson(userId: string) {
    setSaving(true);
    try {
      await apiFetch(`/v1/settings/app-licenses/${appId}/grant/${userId}`, { method: 'DELETE' });
      load();
      onUpdated?.();
    } catch (err: any) {
      showAlert(err.message || 'Could not remove access.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const unlicensedStaff = staff.filter(s => !grants.some(g => g.user_id === s.id));
  const filteredGrants = grants.filter(g => {
    if (!searchGrantQuery.trim()) return true;
    const q = searchGrantQuery.toLowerCase();
    return g.user_name.toLowerCase().includes(q) || g.user_email.toLowerCase().includes(q);
  });

  return (
    <div className="s-lic-backdrop" onClick={onClose}>
      <div className="s-lic-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="s-lic-header">
          <div className="s-lic-hdr-left">
            <div className="s-lic-hdr-icon">
              <LauncherAppSvg id={appId} color={appColor} logoUrl={branding.getAppLogo(appId)} size={38} />
            </div>
            <div>
              <h3 className="s-lic-hdr-title">{appName} · Access Control</h3>
              <p className="s-lic-hdr-desc">Manage workspace permissions and per-seat license assignments</p>
            </div>
          </div>
          <Tip label="Close (Esc)">
            <button type="button" className="s-lic-close-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" size={18} />
            </button>
          </Tip>
        </div>

        {/* Modal Body */}
        <div className="s-lic-body">
          {loading ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ink3)' }}>
              <Icon name="refresh" size={20} className="animate-spin" />
              <div style={{ fontSize: 13, marginTop: 8 }}>Loading access privileges…</div>
            </div>
          ) : (
            <>
              {/* Access Mode Card */}
              <div className="s-lic-restrict-card">
                <div className="s-lic-restrict-info">
                  <h4 className="s-lic-restrict-title">
                    {restricted ? 'Restricted Access (Per-seat License)' : 'Open to All Members (Default)'}
                  </h4>
                  <p className="s-lic-restrict-desc">
                    {restricted
                      ? 'Only explicitly granted team members below can view, launch, and use this module.'
                      : 'Every active member in this workspace can access this module without restrictions.'}
                  </p>
                </div>
                <Switch
                  checked={restricted}
                  disabled={saving}
                  onCheckedChange={toggleRestricted}
                />
              </div>

              {restricted && (
                <>
                  {/* Add Member Row */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                      Grant Access to Team Member
                    </div>
                    <div className="s-lic-add-wrap">
                      <Combobox
                        triggerClassName="flex-1"
                        value={addUserId}
                        onChange={setAddUserId}
                        placeholder={unlicensedStaff.length === 0 ? 'All staff members granted' : 'Select a team member…'}
                        searchPlaceholder="Search staff by name or email…"
                        emptyText="No matching staff."
                        disabled={unlicensedStaff.length === 0}
                        options={unlicensedStaff.map(s => ({ value: s.id, label: s.name, sublabel: s.email }))}
                      />
                      <Button
                        size="sm"
                        onClick={addPerson}
                        disabled={!addUserId || saving}
                      >
                        <Icon name="plus" size={14} style={{ marginRight: 4 }} />
                        Grant Access
                      </Button>
                    </div>
                  </div>

                  {/* Granted Members List */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Granted Members ({grants.length})
                      </div>
                      {grants.length > 3 && (
                        <input
                          type="text"
                          placeholder="Filter members…"
                          value={searchGrantQuery}
                          onChange={e => setSearchGrantQuery(e.target.value)}
                          style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', width: 140 }}
                        />
                      )}
                    </div>

                    {grants.length === 0 ? (
                      <div className="s-lic-empty-state">
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🔒</div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>No members granted access yet</div>
                        <div style={{ fontSize: 11.5, marginTop: 2 }}>With restricted access active and no members added, this app will remain hidden for everyone. Select a member above to grant access.</div>
                      </div>
                    ) : (
                      <div className="s-lic-grant-list">
                        {filteredGrants.map(g => {
                          return (
                            <div key={g.user_id} className="s-lic-grant-row">
                              <div className="s-lic-user-meta">
                                <PersonAvatar userId={g.user_id} name={g.user_name} size={32} />
                                <div>
                                  <div className="s-lic-user-name">{g.user_name}</div>
                                  <div className="s-lic-user-email">{g.user_email}</div>
                                </div>
                              </div>
                                <button
                                  type="button"
                                  className="s-lic-remove-btn"
                                  onClick={() => removePerson(g.user_id)}
                                  disabled={saving}
                                  title="Revoke access"
                                >
                                  Revoke
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="s-lic-footer">
          <span className="s-lic-footer-hint">
            {restricted ? `${grants.length} members with licensed access` : 'Shared workspace module'}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
