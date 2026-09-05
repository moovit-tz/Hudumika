import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useEntitlements } from '../hooks/useEntitlements.js';

interface OrgRole {
  id: string; name: string; description: string | null; permissions: string[];
  members: { role_id: string; user_id: string; user_name: string; user_email: string; expires_at: string | null }[];
}
interface AccessRequestRow {
  id: string; user_id: string; reason: string | null; created_at: string;
  role_id: string; role_name: string; user_name: string; user_email: string;
  break_glass: boolean; required_approvals: number; expires_in_hours: number | null;
  approvals_count: number; my_decision: 'approve' | 'deny' | null;
}
interface MyRequest {
  id: string; status: string; reason: string | null; created_at: string; reviewed_at: string | null; role_name: string;
  break_glass: boolean; required_approvals: number; approvals_count: number;
}
interface OndiUser { id: string; name: string; email: string }

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
const PERMISSION_LABEL: Record<string, string> = {
  'kyc.review': 'Review identity verification (KYC)',
  'access_requests.review': 'Approve or deny role requests',
  'api_keys.manage': 'Manage API keys',
  'org_chart.manage': 'Edit the org chart',
  'sso_providers.manage': 'Manage SSO provider config',
  'access_reviews.manage': 'Run and decide access-review campaigns',
  'org_trust.view': 'View org-wide trust score breakdown',
  'automation.manage': 'Configure joiner/leaver automation',
  'compliance.review': 'View the compliance posture dashboard',
  'policies.manage': 'Configure org security policies',
  'assets.manage': 'View company assets (NexusHR)',
  'integrations.manage': 'Manage third-party app event access',
  'visitors.manage': 'Log and manage front-desk visitors',
  'groups.manage': 'Create and manage org groups',
};
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABEL);

export const OndiRoles: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const canReviewRequests = isAdmin || !!user?.org_permissions?.includes('access_requests.review');

  const [roles, setRoles] = useState<OrgRole[] | null>(null);
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [queue, setQueue] = useState<AccessRequestRow[] | null>(null);
  const [staff, setStaff] = useState<OndiUser[]>([]);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [requestRoleId, setRequestRoleId] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [breakGlass, setBreakGlass] = useState(false);
  const [breakGlassHours, setBreakGlassHours] = useState('4');

  const [pendingExpiry, setPendingExpiry] = useState<Record<string, string>>({});

  const entitlements = useEntitlements();
  const governanceEntitled = entitlements ? entitlements.features['ondi.governance'] !== false : true;

  const reload = useCallback(() => {
    apiFetch('/v1/ondi/org/roles/available').then(setAvailableRoles).catch(() => setAvailableRoles([]));
    apiFetch('/v1/ondi/org/access-requests/mine').then(setMyRequests).catch(() => setMyRequests([]));
    if (canReviewRequests) {
      apiFetch('/v1/ondi/org/access-requests').then(setQueue).catch(() => setQueue([]));
    }
    if (isAdmin) {
      apiFetch('/v1/ondi/org/roles').then(setRoles).catch(() => setRoles([]));
      apiFetch('/v1/ondi/users').then(setStaff).catch(() => setStaff([]));
    }
  }, [isAdmin, canReviewRequests]);

  useEffect(() => { reload(); }, [reload]);

  async function createRole() {
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/v1/ondi/org/roles', {
        method: 'POST',
        body: JSON.stringify({ name: newRoleName.trim(), description: newRoleDesc.trim() || undefined, permissions: newRolePerms }),
      });
      setNewRoleName(''); setNewRoleDesc(''); setNewRolePerms([]);
      reload();
    } catch (err: any) {
      showAlert(err.message);
    } finally { setCreating(false); }
  }

  async function deleteRole(id: string, name: string) {
    if (!(await showConfirm(`Delete the "${name}" role? Anyone who holds it loses its permissions.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await apiFetch(`/v1/ondi/org/roles/${id}`, { method: 'DELETE' }); reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function addMember(roleId: string, userId: string) {
    if (!userId) return;
    const expiresInHours = pendingExpiry[roleId] ? Number(pendingExpiry[roleId]) : undefined;
    try {
      await apiFetch(`/v1/ondi/org/roles/${roleId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, ...(expiresInHours ? { expires_in_hours: expiresInHours } : {}) }),
      });
      reload();
    } catch (err: any) { showAlert(err.message); }
  }

  function expiryLabel(expiresAt: string | null): string | null {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const hours = Math.round(ms / 3600_000);
    if (hours < 48) return `Expires in ${hours}h`;
    return `Expires in ${Math.round(hours / 24)}d`;
  }

  async function removeMember(roleId: string, userId: string) {
    try { await apiFetch(`/v1/ondi/org/roles/${roleId}/members/${userId}`, { method: 'DELETE' }); reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function submitAccessRequest() {
    if (!requestRoleId) return;
    setRequesting(true);
    try {
      await apiFetch('/v1/ondi/org/access-requests', {
        method: 'POST',
        body: JSON.stringify({
          role_id: requestRoleId, reason: requestReason.trim() || undefined,
          ...(breakGlass ? { break_glass: true, expires_in_hours: Number(breakGlassHours) || 4 } : {}),
        }),
      });
      setRequestRoleId(''); setRequestReason(''); setBreakGlass(false); setBreakGlassHours('4');
      showAlert(
        breakGlass ? 'Break-glass request sent — needs two admins to approve before it takes effect.' : 'Request sent to a workspace admin.',
        { variant: 'success', title: 'Requested' },
      );
      reload();
    } catch (err: any) {
      showAlert(err.message);
    } finally { setRequesting(false); }
  }

  async function decide(id: string, approve: boolean) {
    try {
      const res = await apiFetch(`/v1/ondi/org/access-requests/${id}/${approve ? 'approve' : 'deny'}`, { method: 'POST' });
      if (approve && res && res.finalized === false) {
        showAlert(`Your approval was recorded (${res.approvals} of ${res.required}). Waiting for another admin before this takes effect.`, { variant: 'success', title: 'Partial approval' });
      }
      reload();
    } catch (err: any) { showAlert(err.message); }
  }

  function handleTogglePermission(perm: string) {
    setNewRolePerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm, 6px)',
    padding: '9px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    fontFamily: 'var(--font)',
    outline: 'none',
    boxSizing: 'border-box' as const
  };

  const totalGrants = roles ? roles.reduce((acc, r) => acc + r.members.length, 0) : 0;
  const breakGlassCount = queue ? queue.filter(r => r.break_glass).length : 0;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Roles & Access']}
        titlePlain="Roles &"
        titleEm="access"
        subtitle="Custom roles layered on top of account privileges, self-service access requests, and break-glass grants."
      />

      {/* KPI Stats Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Custom Roles</span>
            <div className="ondi-kpi-icon-box"><Icon name="userCheck" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{roles ? roles.length : availableRoles.length}</span>
            <span className="ondi-kpi-sub">roles defined</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Pending Requests</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fffbeb', color: '#b45309' }}><Icon name="clock" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#b45309' }}>{queue ? queue.length : 0}</span>
            <span className="ondi-kpi-sub">awaiting approval</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Break-Glass</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fef2f2', color: '#b91c1c' }}><Icon name="alertTriangle" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#b91c1c' }}>{breakGlassCount}</span>
            <span className="ondi-kpi-sub">emergency requests</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Active Grants</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}><Icon name="users" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#047857' }}>{totalGrants}</span>
            <span className="ondi-kpi-sub">role assignments</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
        
        {/* Card 1: Request Access (Self-Service) */}
        <SectionCard title="Request access">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
              <Select value={requestRoleId || '__none__'} onValueChange={v => setRequestRoleId(v === '__none__' ? '' : v)}>
                <SelectTrigger style={{ flex: 1, minWidth: 150 }}><SelectValue placeholder="Choose a role…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Choose a role…</SelectItem>
                  {availableRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <button type="button" onClick={submitAccessRequest} disabled={!requestRoleId || requesting}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: (!requestRoleId || requesting) ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
                {requesting ? 'Sending…' : 'Request'}
              </button>
            </div>
            <input value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why do you need this access? (optional)" style={inputStyle} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ink2)', cursor: 'pointer', background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
              <Checkbox checked={breakGlass} onCheckedChange={() => setBreakGlass(v => !v)} />
              <span><strong>Break-glass (emergency)</strong> — requires 2 admin approvals &amp; auto-expires</span>
            </label>
            {breakGlass && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink3)', paddingLeft: 4 }}>
                Expires after:
                <Select value={breakGlassHours} onValueChange={setBreakGlassHours}>
                  <SelectTrigger style={{ height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="4">4 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {myRequests.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>My Recent Requests</div>
                {myRequests.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: 'var(--bg)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.role_name}</span>
                    {r.break_glass && (
                      <span className="ondi-status-pill error" style={{ fontSize: 10 }}>
                        BREAK-GLASS {r.status === 'pending' ? `· ${r.approvals_count}/${r.required_approvals}` : ''}
                      </span>
                    )}
                    <span className={`ondi-status-pill ${r.status === 'approved' ? 'success' : r.status === 'denied' ? 'error' : 'warning'}`}>
                      {r.status}
                    </span>
                    <span style={{ color: 'var(--ink3)', marginLeft: 'auto', fontSize: 11 }}>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Card 2: Create Custom Role (Admin-only) */}
        {isAdmin && (
          <SectionCard title="Create New Role">
            <form onSubmit={e => { e.preventDefault(); createRole(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <input required value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Role name, e.g. Compliance Officer" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="Short description" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assign Permissions</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 6 }}>
                  {ALL_PERMISSIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                      <Checkbox checked={newRolePerms.includes(p)} onCheckedChange={() => handleTogglePermission(p)} />
                      {PERMISSION_LABEL[p]}
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={!newRoleName.trim() || creating}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'var(--ink)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: (!newRoleName.trim() || creating) ? 0.6 : 1 }}>
                {creating ? 'Creating…' : 'Create Role'}
              </button>
            </form>
          </SectionCard>
        )}
      </div>

      {/* Card 3: Pending Approval Queue */}
      {canReviewRequests && (
        <div style={{ marginTop: 24 }}>
          <SectionCard padded={false} title={`Pending Approval Queue${queue ? ` (${queue.length})` : ''}`}>
            {queue?.length === 0 && <div style={{ padding: '36px 20px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No pending approval requests.</div>}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {queue?.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none' }}>
                  <PersonAvatar userId={r.user_id} name={r.user_name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontWeight: 700 }}>{r.user_name}</strong> requests the <span className="ondi-perm-chip">{r.role_name}</span> role
                      {r.break_glass && (
                        <span className="ondi-status-pill error">
                          BREAK-GLASS · {r.approvals_count}/{r.required_approvals} approved
                        </span>
                      )}
                    </div>
                    {r.reason && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>"{r.reason}"</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => decide(r.id, false)}
                      style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '6px 14px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}>
                      Deny
                    </button>
                    <button type="button" onClick={() => decide(r.id, true)} disabled={r.my_decision === 'approve'}
                      style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '6px 14px', border: 'none', background: '#ecfdf5', color: '#047857', cursor: r.my_decision === 'approve' ? 'default' : 'pointer', opacity: r.my_decision === 'approve' ? 0.5 : 1 }}>
                      {r.my_decision === 'approve' ? 'Approved' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Card 4: Catalog of Defined Roles */}
      {isAdmin && roles && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', paddingLeft: 4 }}>Role Catalog &amp; Active Members</div>
          
          <div className="ondi-card-grid">
            {roles.map(r => (
              <div key={r.id} className="ondi-entity-card">
                <div className="ondi-entity-header">
                  <div>
                    <div className="ondi-entity-title">{r.name}</div>
                    {r.description && <div className="ondi-entity-sub">{r.description}</div>}
                  </div>
                  <button type="button" onClick={() => deleteRole(r.id, r.name)} title="Delete Role"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>

                {/* Permissions badge list */}
                <div className="ondi-chip-group">
                  {r.permissions.map(p => (
                    <span key={p} className="ondi-perm-chip" title={PERMISSION_LABEL[p]}>
                      {p}
                    </span>
                  ))}
                  {r.permissions.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>No explicit permissions assigned.</span>
                  )}
                </div>

                {/* Members list */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Members ({r.members.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                    {r.members.map(m => {
                      const expiry = expiryLabel(m.expires_at);
                      return (
                        <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                          <PersonAvatar userId={m.user_id} name={m.user_name} size={24} />
                          <span style={{ fontWeight: 600, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.user_name}>{m.user_name}</span>
                          {expiry && (
                            <span className={`ondi-status-pill ${expiry === 'Expired' ? 'error' : 'warning'}`} style={{ fontSize: 10, padding: '2px 6px' }}>{expiry}</span>
                          )}
                          <button type="button" onClick={() => removeMember(r.id, m.user_id)} title="Remove Member"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                            <Icon name="x" size={13} />
                          </button>
                        </div>
                      );
                    })}
                    {r.members.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No users assigned to this role.</div>
                    )}
                  </div>
                </div>

                {/* Add member select box */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12, marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Select value={pendingExpiry[r.id] || '__never__'} onValueChange={v => setPendingExpiry(prev => ({ ...prev, [r.id]: v === '__never__' ? '' : v }))}>
                    <SelectTrigger style={{ width: '100%', height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__never__">Grant Duration: Permanent</SelectItem>
                      <SelectItem value="24" disabled={!governanceEntitled}>Expires in 24 hours{!governanceEntitled ? ' (add-on required)' : ''}</SelectItem>
                      <SelectItem value="168" disabled={!governanceEntitled}>Expires in 7 days{!governanceEntitled ? ' (add-on required)' : ''}</SelectItem>
                      <SelectItem value="720" disabled={!governanceEntitled}>Expires in 30 days{!governanceEntitled ? ' (add-on required)' : ''}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Combobox
                    value=""
                    onChange={v => addMember(r.id, v)}
                    placeholder="Assign member to role…"
                    searchPlaceholder="Search staff…"
                    emptyText="No staff found"
                    options={staff.filter(s => !r.members.some(m => m.user_id === s.id)).map((s): ComboboxOption => ({ value: s.id, label: `${s.name} (${s.email})` }))}
                  />
                </div>

              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OndiRoles;
