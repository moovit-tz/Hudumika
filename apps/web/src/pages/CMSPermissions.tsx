import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Banner } from '../components/ui/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import type { CmsRoleCapability, CmsCapabilityArea } from '@hudumika/types';

const ROLES: { role: string; label: string }[] = [
  { role: 'MANAGER', label: 'Manager' },
  { role: 'FINANCE', label: 'Finance' },
  { role: 'SALES', label: 'Sales' },
  { role: 'SENIOR', label: 'Senior' },
  { role: 'JUNIOR', label: 'Junior' },
];
// §74 — TENANT_ADMIN is a live, still-issued legacy alias for ADMIN, never
// auto-normalized anywhere in this codebase (matches the exact same list
// the backend's own cms.routes.ts / cms-content.routes.ts check).
const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'];

const AREAS: { area: CmsCapabilityArea; label: string }[] = [
  { area: 'pages', label: 'Pages' },
  { area: 'posts', label: 'Posts' },
  { area: 'comments', label: 'Comments' },
  { area: 'media', label: 'Media' },
  { area: 'content', label: 'Content models' },
  { area: 'settings', label: 'Navigation & settings' },
];

type Action = 'can_view' | 'can_manage' | 'can_publish';

/**
 * §74 of the CMS master brief — today access is binary: the 'onesite'
 * entitlement plus any non-CUSTOMER role gets full access to everything.
 * This is the configurable layer on top, additive rather than a rewrite:
 * a cell with no explicit row still means "unrestricted" server-side, so
 * every box here starts checked and nothing narrows until an admin
 * actually unchecks one. ADMIN itself is never shown — it always bypasses
 * this matrix entirely, the same way SUPER_ADMIN bypasses platform-wide
 * checks elsewhere.
 */
export function CMSPermissions() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CmsRoleCapability[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    apiFetch('/v1/cms/capabilities').then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);

  function cell(role: string, area: CmsCapabilityArea): CmsRoleCapability | undefined {
    return rows?.find(r => r.role === role && r.area === area);
  }

  async function toggle(role: string, area: CmsCapabilityArea, action: Action, checked: boolean) {
    const key = `${role}:${area}:${action}`;
    setSaving(key);
    // Optimistic — a dense matrix feels broken if every click waits on a round-trip.
    setRows(prev => (prev ?? []).map(r => (r.role === role && r.area === area) ? { ...r, [action]: checked } : r));
    try {
      await apiFetch(`/v1/cms/capabilities/${role}/${area}`, { method: 'PATCH', body: JSON.stringify({ [action]: checked }) });
    } catch (e: any) {
      showAlert(`Failed to update permission: ${e.message}`);
      load(); // revert to server truth
    } finally {
      setSaving(null);
    }
  }

  if (user && !CMS_ADMIN_ROLES.includes(user.role)) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <PageHeader crumbs={['CMS', 'Permissions']} titlePlain="CMS" titleEm="permissions" subtitle="Only an administrator can manage these." />
        <div style={{ padding: 24 }}>
          <Banner variant="info">Only an administrator can view or change CMS permissions.</Banner>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Permissions']}
        titlePlain="CMS"
        titleEm="permissions"
        subtitle="What each role can do in this tenant's CMS. Unchecked here means restricted — every box starts checked, matching what every role already had before this existed. Administrators always have full access and aren't shown."
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
        {rows === null ? <SectionLoading /> : (
          <div className="card" style={{ padding: 0 }}>
            <div className="rtbl-wrap">
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 780 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</th>
                    {AREAS.map(a => (
                      <th key={a.area} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{a.label}</th>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th />
                    {AREAS.map(a => (
                      <th key={a.area} style={{ padding: '2px 12px 8px', fontWeight: 500 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, fontSize: 10, color: 'var(--ink3)' }}>
                          <span title="View">View</span><span title="Create / edit / delete">Manage</span><span title="Publish">Publish</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROLES.map((r, i) => (
                    <tr key={r.role} style={{ borderBottom: i < ROLES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--ink)' }}>{r.label}</td>
                      {AREAS.map(a => {
                        const cap = cell(r.role, a.area);
                        return (
                          <td key={a.area} style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                              {(['can_view', 'can_manage', 'can_publish'] as Action[]).map(action => (
                                <Checkbox
                                  key={action}
                                  checked={cap?.[action] ?? true}
                                  disabled={saving === `${r.role}:${a.area}:${action}`}
                                  onCheckedChange={c => toggle(r.role, a.area, action, c === true)}
                                />
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
