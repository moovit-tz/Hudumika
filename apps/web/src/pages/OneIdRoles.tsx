import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

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
interface OneIdUser { id: string; name: string; email: string }

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
};
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABEL);

export const OneIdRoles: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const canReviewRequests = isAdmin || !!user?.org_permissions?.includes('access_requests.review');

  const [roles, setRoles] = useState<OrgRole[] | null>(null);
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [queue, setQueue] = useState<AccessRequestRow[] | null>(null);
  const [staff, setStaff] = useState<OneIdUser[]>([]);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [requestRoleId, setRequestRoleId] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [breakGlass, setBreakGlass] = useState(false);
  const [breakGlassHours, setBreakGlassHours] = useState('4');

  // Just-in-Time-lite grants: per-role choice of how long a newly-added
  // member's grant should last, kept keyed by role so switching one card's
  // dropdown doesn't affect any other.
  const [pendingExpiry, setPendingExpiry] = useState<Record<string, string>>({});

  const reload = useCallback(() => {
    apiFetch('/v1/oneid/org/roles/available').then(setAvailableRoles).catch(() => setAvailableRoles([]));
    apiFetch('/v1/oneid/org/access-requests/mine').then(setMyRequests).catch(() => setMyRequests([]));
    if (canReviewRequests) {
      apiFetch('/v1/oneid/org/access-requests').then(setQueue).catch(() => setQueue([]));
    }
    if (isAdmin) {
      apiFetch('/v1/oneid/org/roles').then(setRoles).catch(() => setRoles([]));
      apiFetch('/v1/oneid/users').then(setStaff).catch(() => setStaff([]));
    }
  }, [isAdmin, canReviewRequests]);
  
  useEffect(() => { reload(); }, [reload]);

  async function createRole() {
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/v1/oneid/org/roles', {
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
    try { await apiFetch(`/v1/oneid/org/roles/${id}`, { method: 'DELETE' }); reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function addMember(roleId: string, userId: string) {
    if (!userId) return;
    const expiresInHours = pendingExpiry[roleId] ? Number(pendingExpiry[roleId]) : undefined;
    try {
      await apiFetch(`/v1/oneid/org/roles/${roleId}/members`, {
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
    try { await apiFetch(`/v1/oneid/org/roles/${roleId}/members/${userId}`, { method: 'DELETE' }); reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function submitAccessRequest() {
    if (!requestRoleId) return;
    setRequesting(true);
    try {
      await apiFetch('/v1/oneid/org/access-requests', {
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
      const res = await apiFetch(`/v1/oneid/org/access-requests/${id}/${approve ? 'approve' : 'deny'}`, { method: 'POST' });
      if (approve && res && res.finalized === false) {
        showAlert(`Your approval was recorded (${res.approvals} of ${res.required}). Waiting for another admin before this takes effect.`, { variant: 'success', title: 'Partial approval' });
      }
      reload();
    } catch (err: any) { showAlert(err.message); }
  }

  function handleTogglePermission(perm: string) {
    setNewRolePerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  }

  const selectStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm, 6px)',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    outline: 'none',
    boxSizing: 'border-box' as const
  };

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm, 6px)',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    fontFamily: 'var(--font)',
    outline: 'none',
    boxSizing: 'border-box' as const
  };

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Roles & Access']}
        titlePlain="Roles &"
        titleEm="access"
        subtitle="Custom roles layered on top of everyone's account role, and requests to hold one."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24, alignItems: 'start' }}>
        
        {/* Card 1: Request Access (Self-Service) */}
        <SectionCard title="Request access">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
              <select value={requestRoleId} onChange={e => setRequestRoleId(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 150 }}>
                <option value="">Choose a role…</option>
                {availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button type="button" onClick={submitAccessRequest} disabled={!requestRoleId || requesting}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (!requestRoleId || requesting) ? 0.6 : 1, minHeight: 'var(--ctl-h)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {requesting ? 'Sending…' : 'Request'}
              </button>
            </div>
            <input value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why do you need this? (optional)" style={inputStyle} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
              <Checkbox checked={breakGlass} onCheckedChange={() => setBreakGlass(v => !v)} />
              Break-glass (emergency) — needs two admins to approve, and auto-expires
            </label>
            {breakGlass && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink3)' }}>
                Expires after
                <select value={breakGlassHours} onChange={e => setBreakGlassHours(e.target.value)} style={{ ...selectStyle, padding: '6px 10px', fontSize: 12 }}>
                  <option value="1">1 hour</option>
                  <option value="4">4 hours</option>
                  <option value="12">12 hours</option>
                  <option value="24">24 hours</option>
                </select>
              </div>
            )}

            {myRequests.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>My Requests</div>
                {myRequests.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: 'var(--bg)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.role_name}</span>
                    {r.break_glass && (
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#fef2f2', color: '#b91c1c' }} title="Break-glass request">
                        BREAK-GLASS {r.status === 'pending' ? `· ${r.approvals_count}/${r.required_approvals}` : ''}
                      </span>
                    )}
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: r.status === 'approved' ? '#ecfdf5' : r.status === 'denied' ? '#fef2f2' : '#fffbeb',
                      color: r.status === 'approved' ? '#047857' : r.status === 'denied' ? '#b91c1c' : '#b45309',
                    }}>{r.status}</span>
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
            <form onSubmit={e => { e.preventDefault(); createRole(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <input required value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Role name, e.g. Compliance Officer" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="Short description" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Assign Permissions</div>
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                    <Checkbox checked={newRolePerms.includes(p)} onCheckedChange={() => handleTogglePermission(p)} />
                    {PERMISSION_LABEL[p]}
                  </label>
                ))}
              </div>
              <button type="submit" disabled={!newRoleName.trim() || creating}
                style={{ width: '100%', padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (!newRoleName.trim() || creating) ? 0.6 : 1, minHeight: 'var(--ctl-h)' }}>
                {creating ? 'Creating…' : 'Create Role'}
              </button>
            </form>
          </SectionCard>
        )}
      </div>

      {/* Card 3: Pending Approval Queue */}
      {canReviewRequests && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard padded={false} title={`Pending Approval Requests${queue ? ` (${queue.length})` : ''}`}>
            {queue?.length === 0 && <div style={{ padding: '32px 20px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No pending approval requests.</div>}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {queue?.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none' }}>
                  <PersonAvatar userId={r.user_id} name={r.user_name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <b>{r.user_name}</b> requests the <b>{r.role_name}</b> role
                      {r.break_glass && (
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#fef2f2', color: '#b91c1c' }} title={`Needs ${r.required_approvals} distinct admin approvals; expires ${r.expires_in_hours}h after the second`}>
                          BREAK-GLASS · {r.approvals_count}/{r.required_approvals} approved
                        </span>
                      )}
                    </div>
                    {r.reason && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>"{r.reason}"</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => decide(r.id, false)}
                      style={{ fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '6px 12px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}>
                      Deny
                    </button>
                    <button type="button" onClick={() => decide(r.id, true)} disabled={r.my_decision === 'approve'}
                      title={r.my_decision === 'approve' ? 'You already approved this' : undefined}
                      style={{ fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '6px 12px', border: 'none', background: '#ecfdf5', color: '#047857', cursor: r.my_decision === 'approve' ? 'default' : 'pointer', opacity: r.my_decision === 'approve' ? 0.5 : 1 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', paddingLeft: 4 }}>Role Catalog & Members</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {roles.map(r => (
              <div key={r.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--elev-sm)' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{r.name}</div>
                    {r.description && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{r.description}</div>}
                  </div>
                  <button type="button" onClick={() => deleteRole(r.id, r.name)} title="Delete Role"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>

                {/* Permissions badge list */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.permissions.map(p => (
                    <span key={p} style={{ fontSize: 10.5, fontWeight: 700, background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: 4 }} title={PERMISSION_LABEL[p]}>
                      {p}
                    </span>
                  ))}
                  {r.permissions.length === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>No explicit permissions.</span>
                  )}
                </div>

                {/* Members list */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Members ({r.members.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                    {r.members.map(m => {
                      const expiry = expiryLabel(m.expires_at);
                      return (
                        <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                          <PersonAvatar userId={m.user_id} name={m.user_name} size={22} />
                          <span style={{ fontWeight: 600, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.user_name}>{m.user_name}</span>
                          {expiry && (
                            <span title={new Date(m.expires_at!).toLocaleString()} style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                              background: expiry === 'Expired' ? '#fef2f2' : '#fffbeb',
                              color: expiry === 'Expired' ? '#b91c1c' : '#b45309',
                            }}>{expiry}</span>
                          )}
                          <button type="button" onClick={() => removeMember(r.id, m.user_id)} title="Remove Member"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                            <Icon name="x" size={12} />
                          </button>
                        </div>
                      );
                    })}
                    {r.members.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No users assigned.</div>
                    )}
                  </div>
                </div>

                {/* Add member select box */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10, marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <select value={pendingExpiry[r.id] ?? ''} onChange={e => setPendingExpiry(prev => ({ ...prev, [r.id]: e.target.value }))}
                    style={{ ...selectStyle, width: '100%', padding: '6px 10px', fontSize: 12 }}>
                    <option value="">Expires: Never</option>
                    <option value="24">Expires in 24 hours</option>
                    <option value="168">Expires in 7 days</option>
                    <option value="720">Expires in 30 days</option>
                  </select>
                  <select defaultValue="" onChange={e => { addMember(r.id, e.target.value); e.target.value = ''; }} style={{ ...selectStyle, width: '100%', padding: '6px 10px', fontSize: 12 }}>
                    <option value="">Add user to this role…</option>
                    {staff.filter(s => !r.members.some(m => m.user_id === s.id)).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                    ))}
                  </select>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default OneIdRoles;
