import React, { useState, useMemo } from 'react';
import type { FieldPolicyResource, FieldGroup, UserRole, FieldPolicyMatrix } from '@hudumika/types';
import {
  FIELD_POLICY_RESOURCES,
  FIELD_GROUPS,
  FIELD_GROUP_LABELS,
  RESOURCE_FIELD_MAP,
} from '@hudumika/types';
import { useFieldPolicyAdmin } from '../../hooks/useFieldPolicy.js';
import { Card, SaveRow } from './shared.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Icon } from '../../components/Icon.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import '../OndiPages.css';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TENANT_ADMIN: 'Admin',
  MANAGER: 'Manager',
  FINANCE: 'Finance',
  SALES: 'Sales',
  SENIOR: 'Senior',
  JUNIOR: 'Junior',
  CUSTOMER: 'Customer',
};

const RESOURCE_LABELS: Record<FieldPolicyResource, string> = {
  customers: 'Customers',
  contacts: 'Contacts',
  leads: 'Leads & Pipeline',
  suppliers: 'Suppliers & Vendors',
  employees: 'Employees & Payroll',
  invoices: 'Customer Invoices',
  bills: 'Vendor Bills',
  shipments: 'Shipments & Waybills',
};

const RESOURCE_DESCRIPTIONS: Record<FieldPolicyResource, string> = {
  customers: 'Client profiles, commercial credit limits, VAT/TIN credentials, and margin rates.',
  contacts: 'Contact directory, direct phone numbers, personal email, and stakeholder profiles.',
  leads: 'Sales pipeline, deal scoring, budget parameters, and competitor insights.',
  suppliers: 'Vendor credentials, banking accounts, settlement schedules, and payables.',
  employees: 'Staff directory, payroll, salaries, national IDs, and disciplinary files.',
  invoices: 'Accounts receivable billing, discounts, margin spreads, and tax line schedules.',
  bills: 'Accounts payable liabilities, vendor settlement terms, and withholding tax.',
  shipments: 'Logistics cargo manifests, freight declared values, container records, and fees.',
};

const RESOURCE_ICONS: Record<FieldPolicyResource, string> = {
  customers: 'users',
  contacts: 'userPlus',
  leads: 'target',
  suppliers: 'truck',
  employees: 'briefcase',
  invoices: 'fileText',
  bills: 'receipt',
  shipments: 'package',
};

const GROUP_DESCRIPTIONS: Record<FieldGroup, string> = {
  contact: 'Direct phone numbers, messaging handles, addresses, and emails.',
  financial: 'Credit terms, tax numbers, bank accounts, margins, and currency rates.',
  sensitive: 'Internal notes, margin targets, personal PII, and private commentary.',
  operational: 'Standard names, codes, dates, system IDs, and status flags.',
};

const CONFIGURABLE_ROLES: UserRole[] = ['MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER'];
const LOCKED_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN'];

type FilterTab = 'all' | 'customized' | 'default' | 'unsaved';

export const DataAccessSection: React.FC = () => {
  const { matrix, loading, saving, error, save, resetToDefault } = useFieldPolicyAdmin();
  const [edits, setEdits] = useState<Map<string, UserRole[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<FieldPolicyResource>>(new Set(['customers']));
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [compactRows, setCompactRows] = useState(true);

  const dirty = edits.size > 0;

  function toggleExpand(res: FieldPolicyResource) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(res)) next.delete(res);
      else next.add(res);
      return next;
    });
  }

  function expandAll() {
    if (!matrix) return;
    setExpanded(new Set(matrix.map(m => m.resource)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function toggleRole(resource: FieldPolicyResource, group: FieldGroup, role: UserRole) {
    const key = `${resource}:${group}`;
    const current = edits.get(key)
      ?? matrix?.find(m => m.resource === resource)?.groups.find(g => g.group === group)?.allowed_roles
      ?? [];
    const next = current.includes(role)
      ? current.filter(r => r !== role)
      : [...current, role];
    if (!next.includes('SUPER_ADMIN')) next.push('SUPER_ADMIN');
    if (!next.includes('ADMIN')) next.push('ADMIN');
    setEdits(prev => new Map(prev).set(key, next));
  }

  function grantAll(resource: FieldPolicyResource, group: FieldGroup) {
    const key = `${resource}:${group}`;
    const allRoles: UserRole[] = [...LOCKED_ROLES, ...CONFIGURABLE_ROLES];
    setEdits(prev => new Map(prev).set(key, allRoles));
  }

  function revokeAll(resource: FieldPolicyResource, group: FieldGroup) {
    const key = `${resource}:${group}`;
    setEdits(prev => new Map(prev).set(key, [...LOCKED_ROLES]));
  }

  function isChecked(resource: FieldPolicyResource, group: FieldGroup, role: UserRole): boolean {
    const key = `${resource}:${group}`;
    const roles = edits.get(key)
      ?? matrix?.find(m => m.resource === resource)?.groups.find(g => g.group === group)?.allowed_roles
      ?? [];
    return roles.includes(role);
  }

  function isDefault(resource: FieldPolicyResource, group: FieldGroup): boolean {
    const key = `${resource}:${group}`;
    if (edits.has(key)) return false;
    return matrix?.find(m => m.resource === resource)?.groups.find(g => g.group === group)?.is_default ?? true;
  }

  async function handleSave() {
    const policies = Array.from(edits.entries()).map(([key, allowed_roles]) => {
      const [resource, field_group] = key.split(':');
      return { resource, field_group, allowed_roles: allowed_roles as string[] };
    });
    if (policies.length === 0) return;
    await save(policies);
    setEdits(new Map());
    showAlert('Data access policies saved successfully.', { variant: 'success' });
  }

  function handleDiscard() {
    setEdits(new Map());
    showAlert('Unsaved changes discarded.', { variant: 'info' });
  }

  async function handleReset(resource: FieldPolicyResource, group: FieldGroup) {
    const ok = await showConfirm(
      `Restore the default baseline role access for ${RESOURCE_LABELS[resource]} — ${FIELD_GROUP_LABELS[group]}?`,
      { title: 'Reset to default policy?' }
    );
    if (!ok) return;
    const key = `${resource}:${group}`;
    setEdits(prev => {
      const n = new Map(prev);
      n.delete(key);
      return n;
    });
    await resetToDefault(resource, group);
    showAlert('Policy restored to system default.', { variant: 'success' });
  }

  // Summary Metrics
  const summary = useMemo(() => {
    if (!matrix) {
      return { totalEntities: 8, totalGroups: 0, customizedCount: 0, defaultCount: 0, unsavedCount: 0 };
    }
    let totalGroups = 0;
    let customizedCount = 0;

    for (const res of matrix) {
      for (const grp of res.groups) {
        totalGroups++;
        if (!isDefault(res.resource, grp.group)) {
          customizedCount++;
        }
      }
    }

    return {
      totalEntities: matrix.length,
      totalGroups,
      customizedCount,
      defaultCount: Math.max(0, totalGroups - customizedCount),
      unsavedCount: edits.size,
    };
  }, [matrix, edits]);

  // Filtered resources
  const filteredMatrix = useMemo(() => {
    if (!matrix) return [];

    return matrix.filter(res => {
      const resEdits = Array.from(edits.keys()).filter(k => k.startsWith(res.resource + ':'));
      const hasUnsaved = resEdits.length > 0;
      const isResCustomized = res.groups.some(g => !isDefault(res.resource, g.group));

      if (activeFilter === 'customized' && !isResCustomized && !hasUnsaved) return false;
      if (activeFilter === 'default' && isResCustomized) return false;
      if (activeFilter === 'unsaved' && !hasUnsaved) return false;

      const q = search.trim().toLowerCase();
      if (q) {
        const matchesLabel = RESOURCE_LABELS[res.resource]?.toLowerCase().includes(q);
        const matchesDesc = RESOURCE_DESCRIPTIONS[res.resource]?.toLowerCase().includes(q);
        const matchesGroup = res.groups.some(g => g.label.toLowerCase().includes(q));

        const allFields = Object.values(RESOURCE_FIELD_MAP[res.resource] ?? {}).flat();
        const matchesField = allFields.some(f => f.toLowerCase().includes(q));

        if (!matchesLabel && !matchesDesc && !matchesGroup && !matchesField) return false;
      }

      return true;
    });
  }, [matrix, edits, activeFilter, search]);

  if (loading) return <SectionLoading />;

  return (
    <div className="data-access-settings" data-compact={compactRows ? 'true' : undefined}>
      {/* Top Executive KPI Deck */}
      <div className="ondi-kpi-grid">
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setActiveFilter('all'); setSearch(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { setActiveFilter('all'); setSearch(''); } }}
          className={`ondi-kpi-card ${activeFilter === 'all' && !search ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Protected Entities</span>
            <div className="ondi-kpi-icon-box purple">
              <Icon name="shield" size={17} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{summary.totalEntities}</span>
            <span className="ondi-kpi-sub">core business data models</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveFilter(activeFilter === 'customized' ? 'all' : 'customized')}
          onKeyDown={e => { if (e.key === 'Enter') setActiveFilter(activeFilter === 'customized' ? 'all' : 'customized'); }}
          className={`ondi-kpi-card ${activeFilter === 'customized' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Customized Policies</span>
            <div className="ondi-kpi-icon-box amber">
              <Icon name="sliders" size={17} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--amber)' }}>
              {summary.customizedCount}
            </span>
            <span className="ondi-kpi-sub">overridden security groups</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveFilter(activeFilter === 'default' ? 'all' : 'default')}
          onKeyDown={e => { if (e.key === 'Enter') setActiveFilter(activeFilter === 'default' ? 'all' : 'default'); }}
          className={`ondi-kpi-card ${activeFilter === 'default' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Default Baselines</span>
            <div className="ondi-kpi-icon-box green">
              <Icon name="checkCircle" size={17} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--green)' }}>
              {summary.defaultCount}
            </span>
            <span className="ondi-kpi-sub">standard baseline groups</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Configurable Roles</span>
            <div className="ondi-kpi-icon-box blue">
              <Icon name="users" size={17} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">
              {CONFIGURABLE_ROLES.length}
            </span>
            <span className="ondi-kpi-sub">+ 2 locked admin roles</span>
          </div>
        </div>
      </div>

      {/* Main Workspace Card */}
      <Card
        title="Field-level data access policies"
        desc="Control which roles can inspect contact, financial and sensitive attributes across your workspace. Super Admin and Admin always retain full visibility."
      >
        <div className="da-card-content">
        {error && (
          <div className="finance-capabilities-alert erp-info" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Toolbar: Search, Filter Tabs & Bulk Actions */}
        <div className="da-toolbar">
          <div className="da-toolbar-left">
            <div className="da-search-wrap">
              <Icon name="search" size={14} className="da-search-icon" />
              <input
                type="text"
                placeholder="Search entities or fields (e.g. Customers, salary, phone)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="da-search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="da-search-clear"
                  title="Clear search"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>

            <div className="da-toolbar-filters">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`da-filter-btn ${activeFilter === 'all' ? 'is-active' : ''}`}
              >
                All
                <span className="da-filter-badge">{matrix?.length ?? 0}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('customized')}
                className={`da-filter-btn ${activeFilter === 'customized' ? 'is-active' : ''}`}
              >
                Customized
                <span className="da-filter-badge">{summary.customizedCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('default')}
                className={`da-filter-btn ${activeFilter === 'default' ? 'is-active' : ''}`}
              >
                Default
                <span className="da-filter-badge">{summary.defaultCount}</span>
              </button>
              {dirty && (
                <button
                  type="button"
                  onClick={() => setActiveFilter('unsaved')}
                  className={`da-filter-btn ${activeFilter === 'unsaved' ? 'is-active' : ''}`}
                  style={{ color: 'var(--amber)' }}
                >
                  Unsaved
                  <span className="da-filter-badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--amber)' }}>
                    {summary.unsavedCount}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="da-toolbar-actions">
            {/* Dense Rows Toggle */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCompactRows(v => !v)}
              className="h-8 gap-1.5 text-xs font-semibold"
              title={compactRows ? 'Switch to Standard Rows' : 'Switch to Compressed Dense Rows'}
            >
              <Icon name="list" size={13} />
              <span>{compactRows ? 'Dense Rows' : 'Standard Rows'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={expanded.size === (matrix?.length ?? 0) ? collapseAll : expandAll}
              className="h-8 gap-1.5 text-xs"
            >
              <Icon
                name={expanded.size === (matrix?.length ?? 0) ? 'chevronUp' : 'chevronDown'}
                size={13}
              />
              <span>{expanded.size === (matrix?.length ?? 0) ? 'Collapse All' : 'Expand All'}</span>
            </Button>
          </div>
        </div>

        {/* Resources List */}
        <div className="da-resource-list" style={{ marginTop: 10 }}>
          {filteredMatrix.length === 0 ? (
            <div className="da-empty-state">
              <FeaturedIcon variant="gray" size="md">
                <Icon name="search" size={18} />
              </FeaturedIcon>
              <span className="da-empty-title">No matching entities found</span>
              <p className="da-empty-sub">
                No data models matched &ldquo;{search}&rdquo; with filter &ldquo;{activeFilter}&rdquo;.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(''); setActiveFilter('all'); }}
                style={{ marginTop: 10 }}
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            filteredMatrix.map(res => {
              const isExpanded = expanded.has(res.resource);
              const unsavedCount = Array.from(edits.keys()).filter(k => k.startsWith(res.resource + ':')).length;
              const isCustom = res.groups.some(g => !g.is_default && !edits.has(`${res.resource}:${g.group}`));
              const totalFields = Object.values(RESOURCE_FIELD_MAP[res.resource] ?? {}).flat().length;

              return (
                <div
                  key={res.resource}
                  className={`da-resource-card ${unsavedCount > 0 ? 'has-unsaved' : ''} ${isExpanded ? 'is-expanded' : ''}`}
                >
                  {/* Compressed Resource Header */}
                  <button
                    type="button"
                    className="da-resource-header"
                    onClick={() => toggleExpand(res.resource)}
                    data-ui-native-button=""
                  >
                    <FeaturedIcon variant="brand" size="sm" shape="square">
                      <Icon name={RESOURCE_ICONS[res.resource] as any} size={15} />
                    </FeaturedIcon>

                    <div className="da-resource-info">
                      <div className="da-resource-title-row">
                        <span className="da-resource-label">{RESOURCE_LABELS[res.resource]}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                          • {res.groups.length} groups, {totalFields} fields
                        </span>
                      </div>
                      <span className="da-resource-desc">{RESOURCE_DESCRIPTIONS[res.resource]}</span>
                    </div>

                    <div className="da-resource-badges">
                      {unsavedCount > 0 ? (
                        <Badge variant="warning">
                          {unsavedCount} Unsaved
                        </Badge>
                      ) : isCustom ? (
                        <Badge variant="brand">Customized</Badge>
                      ) : (
                        <Badge variant="gray">Default</Badge>
                      )}
                    </div>

                    <Icon
                      name="chevronDown"
                      size={16}
                      className="da-chevron"
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </button>

                  {/* Compressed Permission Matrix Table */}
                  {isExpanded && (
                    <div className="da-matrix-table-wrap">
                      <table className="da-matrix-table">
                        <thead>
                          <tr>
                            <th style={{ width: '19%' }}>Field Group</th>
                            <th style={{ width: '21%' }}>Protected Fields</th>
                            <th className="th-center" title="Super Admin (Enforced Access)" style={{ width: '6.5%' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                <Icon name="lock" size={10} /> S.Admin
                              </span>
                            </th>
                            <th className="th-center" title="Admin (Enforced Access)" style={{ width: '6.5%' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                <Icon name="lock" size={10} /> Admin
                              </span>
                            </th>
                            <th className="th-center" style={{ width: '6.5%' }}>Manager</th>
                            <th className="th-center" style={{ width: '6.5%' }}>Finance</th>
                            <th className="th-center" style={{ width: '6.5%' }}>Sales</th>
                            <th className="th-center" style={{ width: '6.5%' }}>Senior</th>
                            <th className="th-center" style={{ width: '6.5%' }}>Junior</th>
                            <th className="th-center" style={{ width: '6.5%' }}>Customer</th>
                            <th className="th-right" style={{ width: '15%' }}>Group Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {res.groups.map(grp => {
                            const fields = RESOURCE_FIELD_MAP[res.resource]?.[grp.group] ?? [];
                            if (fields.length === 0 && grp.group === 'contact') return null;

                            const dflt = isDefault(res.resource, grp.group);
                            const hasGroupEdits = edits.has(`${res.resource}:${grp.group}`);

                            return (
                              <tr key={grp.group}>
                                {/* Field Group Label & Status */}
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{grp.label}</span>
                                    {hasGroupEdits ? (
                                      <Badge variant="warning">Unsaved</Badge>
                                    ) : !dflt ? (
                                      <Badge variant="brand">Custom</Badge>
                                    ) : (
                                      <Badge variant="gray">Default</Badge>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                                    {GROUP_DESCRIPTIONS[grp.group]}
                                  </div>
                                </td>

                                {/* Protected Fields Preview */}
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                    <span className="da-field-count-pill">
                                      {fields.length} {fields.length === 1 ? 'field' : 'fields'}
                                    </span>
                                    {fields.slice(0, 3).map(f => (
                                      <span key={f} className="da-field-pill">
                                        {f}
                                      </span>
                                    ))}
                                    {fields.length > 3 && (
                                      <span
                                        className="da-field-pill"
                                        title={fields.slice(3).join(', ')}
                                        style={{ cursor: 'help', color: 'var(--teal)' }}
                                      >
                                        +{fields.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Super Admin (Locked) */}
                                <td className="td-center is-allowed">
                                  <div className="da-matrix-cell-role is-locked" title="Super Admin has enforced access">
                                    <Checkbox checked disabled />
                                  </div>
                                </td>

                                {/* Admin (Locked) */}
                                <td className="td-center is-allowed">
                                  <div className="da-matrix-cell-role is-locked" title="Admin has enforced access">
                                    <Checkbox checked disabled />
                                  </div>
                                </td>

                                {/* Configurable Roles */}
                                {CONFIGURABLE_ROLES.map(role => {
                                  const allowed = isChecked(res.resource, grp.group, role);
                                  return (
                                    <td
                                      key={role}
                                      className={`td-center ${allowed ? 'is-allowed' : ''}`}
                                      onClick={() => toggleRole(res.resource, grp.group, role)}
                                      style={{ cursor: 'pointer' }}
                                      title={`${ROLE_LABELS[role]}: ${allowed ? 'Allowed' : 'Restricted'}`}
                                    >
                                      <div className="da-matrix-cell-role">
                                        <Checkbox
                                          checked={allowed}
                                          onCheckedChange={() => toggleRole(res.resource, grp.group, role)}
                                        />
                                      </div>
                                    </td>
                                  );
                                })}

                                {/* Quick Group Actions */}
                                <td className="td-right">
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                    <button
                                      type="button"
                                      className="da-group-action-btn"
                                      onClick={() => grantAll(res.resource, grp.group)}
                                      title="Grant to all roles"
                                    >
                                      Grant
                                    </button>
                                    <button
                                      type="button"
                                      className="da-group-action-btn"
                                      onClick={() => revokeAll(res.resource, grp.group)}
                                      title="Revoke from all roles"
                                    >
                                      Revoke
                                    </button>
                                    {(!dflt || hasGroupEdits) && (
                                      <button
                                        type="button"
                                        className="da-reset-btn"
                                        onClick={() => handleReset(res.resource, grp.group)}
                                        title="Restore system default"
                                      >
                                        <Icon name="refresh" size={10} />
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* In-Flow Save Row */}
        {dirty && (
          <div style={{ marginTop: 14 }}>
            <SaveRow saving={saving} onSave={handleSave} />
          </div>
        )}
        </div>
      </Card>

      {/* Floating Bottom Save Bar */}
      {dirty && (
        <div className="da-sticky-bar">
          <div className="da-sticky-info">
            <span className="da-sticky-dot" />
            <div>
              <span className="da-sticky-title">
                {edits.size} unsaved policy {edits.size === 1 ? 'change' : 'changes'} pending
              </span>
              <span className="da-sticky-sub" style={{ display: 'block' }}>
                Updates will apply to all tenant users upon saving.
              </span>
            </div>
          </div>

          <div className="da-sticky-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving Policies...' : 'Save Policies'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
