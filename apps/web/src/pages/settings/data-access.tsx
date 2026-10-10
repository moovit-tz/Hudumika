import React, { useState, useMemo } from 'react';
import type { FieldPolicyResource, FieldGroup, UserRole, FieldPolicyMatrix } from '@hudumika/types';
import { FIELD_POLICY_RESOURCES, FIELD_GROUPS, FIELD_GROUP_LABELS, RESOURCE_FIELD_MAP, INTERNAL_ROLES } from '@hudumika/types';
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

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', TENANT_ADMIN: 'Admin',
  MANAGER: 'Manager', FINANCE: 'Finance', SALES: 'Sales',
  SENIOR: 'Senior', JUNIOR: 'Junior', CUSTOMER: 'Customer',
};

const RESOURCE_LABELS: Record<FieldPolicyResource, string> = {
  customers: 'Customers', contacts: 'Contacts', leads: 'Leads',
  suppliers: 'Suppliers', employees: 'Employees', invoices: 'Invoices',
  bills: 'Bills', shipments: 'Shipments',
};

const RESOURCE_ICONS: Record<FieldPolicyResource, string> = {
  customers: 'users', contacts: 'userPlus', leads: 'target',
  suppliers: 'truck', employees: 'briefcase', invoices: 'fileText',
  bills: 'receipt', shipments: 'package',
};

const CONFIGURABLE_ROLES: UserRole[] = ['MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER'];
const LOCKED_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN'];

export const DataAccessSection: React.FC = () => {
  const { matrix, loading, saving, error, save, resetToDefault } = useFieldPolicyAdmin();
  const [edits, setEdits] = useState<Map<string, UserRole[]>>(new Map());
  const [expandedResource, setExpandedResource] = useState<FieldPolicyResource | null>(null);

  const dirty = edits.size > 0;

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
    showAlert('Data access policies saved.', { variant: 'success' });
  }

  async function handleReset(resource: FieldPolicyResource, group: FieldGroup) {
    const ok = await showConfirm(`This will restore the default role access for ${RESOURCE_LABELS[resource]} — ${FIELD_GROUP_LABELS[group]}.`, { title: 'Reset to default?' });
    if (!ok) return;
    const key = `${resource}:${group}`;
    setEdits(prev => { const n = new Map(prev); n.delete(key); return n; });
    await resetToDefault(resource, group);
    showAlert('Reset to default.', { variant: 'success' });
  }

  if (loading) return <SectionLoading />;

  return (
    <div className="data-access-settings">
      <Card
        title="Field-level data access"
        desc="Control which roles can see contact, financial and sensitive data on each resource. Super Admin and Admin always have full access."
      >
        {error && <div className="finance-capabilities-alert erp-info" role="alert">{error}</div>}

        <div className="da-resource-list">
          {(matrix ?? []).map((res) => {
            const expanded = expandedResource === res.resource;
            return (
              <div key={res.resource} className="da-resource">
                <button
                  type="button"
                  className="da-resource-header"
                  onClick={() => setExpandedResource(expanded ? null : res.resource)}
                  data-ui-native-button=""
                >
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name={RESOURCE_ICONS[res.resource] as any} size={16} />
                  </FeaturedIcon>
                  <span className="da-resource-label">{RESOURCE_LABELS[res.resource]}</span>
                  <div className="da-resource-badges">
                    {res.groups.filter(g => !g.is_default && !edits.has(`${res.resource}:${g.group}`)).map(g => (
                      <Badge key={g.group} variant="brand">{g.label}</Badge>
                    ))}
                    {Array.from(edits.keys()).filter(k => k.startsWith(res.resource + ':')).map(k => (
                      <Badge key={k} variant="warning">Unsaved</Badge>
                    ))}
                  </div>
                  <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} className="da-chevron" />
                </button>

                {expanded && (
                  <div className="da-groups">
                    {res.groups.map((grp) => {
                      const fields = RESOURCE_FIELD_MAP[res.resource]?.[grp.group] ?? [];
                      if (fields.length === 0 && grp.group === 'contact') return null;
                      const dflt = isDefault(res.resource, grp.group);

                      return (
                        <div key={grp.group} className="da-group">
                          <div className="da-group-header">
                            <span className="da-group-label">{grp.label}</span>
                            {!dflt && (
                              <button
                                type="button"
                                className="da-reset-btn"
                                onClick={() => handleReset(res.resource, grp.group)}
                                data-ui-native-button=""
                              >
                                Reset
                              </button>
                            )}
                          </div>

                          <div className="da-fields-preview">
                            {fields.slice(0, 6).map(f => (
                              <Badge key={f} variant="gray">{f.replace(/_/g, ' ')}</Badge>
                            ))}
                            {fields.length > 6 && <Badge variant="gray">+{fields.length - 6} more</Badge>}
                          </div>

                          <div className="da-roles-grid">
                            {LOCKED_ROLES.map(role => (
                              <label key={role} className="da-role-item da-role-locked">
                                <Checkbox checked disabled />
                                <span>{ROLE_LABELS[role] ?? role}</span>
                                <Icon name="lock" size={12} className="da-lock-icon" />
                              </label>
                            ))}
                            {CONFIGURABLE_ROLES.map(role => (
                              <label key={role} className="da-role-item">
                                <Checkbox
                                  checked={isChecked(res.resource, grp.group, role)}
                                  onCheckedChange={() => toggleRole(res.resource, grp.group, role)}
                                />
                                <span>{ROLE_LABELS[role] ?? role}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {dirty && (
          <SaveRow saving={saving} onSave={handleSave} />
        )}
      </Card>
    </div>
  );
};
