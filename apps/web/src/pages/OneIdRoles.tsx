import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface OrgRole {
  id: string; name: string; description: string | null; permissions: string[];
  members: { role_id: string; user_id: string; user_name: string; user_email: string }[];
}
interface AccessRequestRow {
  id: string; user_id: string; reason: string | null; created_at: string;
  role_id: string; role_name: string; user_name: string; user_email: string;
}
interface MyRequest {
  id: string; status: string; reason: string | null; created_at: string; reviewed_at: string | null; role_name: string;
}
interface OneIdUser { id: string; name: string; email: string }

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
const PERMISSION_LABEL: Record<string, string> = { 'kyc.review': 'Review identity verification (KYC)' };

/** Custom roles/groups layered on top of the platform's own coarse
 *  users.role (Ondi M5) — additive, not a replacement; every existing
 *  requireRole() gate elsewhere keeps working unchanged. Only
 *  'kyc.review' actually unlocks anything today (the KYC Review queue),
 *  matching how few of these permissions have real teeth so far. */
export const OneIdRoles: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const [roles, setRoles] = useState<OrgRole[] | null>(null);
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [queue, setQueue] = useState<AccessRequestRow[] | null>(null);
  const [staff, setStaff] = useState<OneIdUser[]>([]);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerm, setNewRolePerm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [requestRoleId, setRequestRoleId] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);

  const reload = useCallback(() => {
    apiFetch('/v1/oneid/org/roles/available').then(setAvailableRoles).catch(() => setAvailableRoles([]));
    apiFetch('/v1/oneid/org/access-requests/mine').then(setMyRequests).catch(() => setMyRequests([]));
    if (isAdmin) {
      apiFetch('/v1/oneid/org/roles').then(setRoles).catch(() => setRoles([]));
      apiFetch('/v1/oneid/org/access-requests').then(setQueue).catch(() => setQueue([]));
      apiFetch('/v1/oneid/users').then(setStaff).catch(() => setStaff([]));
    }
  }, [isAdmin]);
  useEffect(() => { reload(); }, [reload]);

  async function createRole() {
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/v1/oneid/org/roles', {
        method: 'POST',
        body: JSON.stringify({ name: newRoleName.trim(), description: newRoleDesc.trim() || undefined, permissions: newRolePerm ? ['kyc.review'] : [] }),
      });
      setNewRoleName(''); setNewRoleDesc(''); setNewRolePerm(false);
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
    try { await apiFetch(`/v1/oneid/org/roles/${roleId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }); reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function removeMember(roleId: string, userId: string) {
    try { await apiFetch(`/v1/oneid/org/roles/${roleId}/members/${userId}`, { method: 'DELETE' }); reload(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function submitAccessRequest() {
    if (!requestRoleId) return;
    setRequesting(true);
    try {
      await apiFetch('/v1/oneid/org/access-requests', { method: 'POST', body: JSON.stringify({ role_id: requestRoleId, reason: requestReason.trim() || undefined }) });
      setRequestRoleId(''); setRequestReason('');
      showAlert('Request sent to a workspace admin.', { variant: 'success', title: 'Requested' });
      reload();
    } catch (err: any) {
      showAlert(err.message);
    } finally { setRequesting(false); }
  }

  async function decide(id: string, approve: boolean) {
    try {
      await apiFetch(`/v1/oneid/org/access-requests/${id}/${approve ? 'approve' : 'deny'}`, { method: 'POST' });
      reload();
    } catch (err: any) { showAlert(err.message); }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        crumbs={['Ondi', 'Roles & Access']}
        titlePlain="Roles &"
        titleEm="access"
        subtitle="Custom roles layered on top of everyone's account role, and requests to hold one."
      />

      {/* Self-service: request a role */}
      <div style={{ marginBottom: 20 }}>
        <SectionCard title="Request access">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: myRequests.length ? 16 : 0 }}>
            <select value={requestRoleId} onChange={e => setRequestRoleId(e.target.value)} className="input-field" style={{ fontSize: 13, padding: '8px 12px', minWidth: 200 }}>
              <option value="">Choose a role…</option>
              {availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why do you need this? (optional)" className="input-field" style={{ fontSize: 13, padding: '8px 12px', flex: 1, minWidth: 220 }} />
            <button type="button" onClick={submitAccessRequest} disabled={!requestRoleId || requesting}
              style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (!requestRoleId || requesting) ? 0.6 : 1, minHeight: 'var(--ctl-h)' }}>
              {requesting ? 'Sending…' : 'Request'}
            </button>
          </div>
          {myRequests.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.role_name}</span>
              <span style={{
                padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700,
                background: r.status === 'approved' ? 'var(--green-l)' : r.status === 'denied' ? '#fef2f2' : '#fffbeb',
                color: r.status === 'approved' ? '#059669' : r.status === 'denied' ? '#dc2626' : '#d97706',
              }}>{r.status}</span>
              <span style={{ color: 'var(--ink3)', marginLeft: 'auto' }}>{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </SectionCard>
      </div>

      {!isAdmin && (
        <SectionCard title="Roles">
          <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--ink3)' }}>
            Only workspace admins can create roles or review requests.
          </div>
        </SectionCard>
      )}

      {isAdmin && (
        <>
          {/* Pending access requests */}
          <div style={{ marginBottom: 20 }}>
            <SectionCard padded={false} title={`Pending requests${queue ? ` (${queue.length})` : ''}`}>
              {queue?.length === 0 && <div style={{ padding: '20px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No pending requests.</div>}
              {queue?.map((r, i, arr) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <PersonAvatar userId={r.user_id} name={r.user_name} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}><b>{r.user_name}</b> wants <b>{r.role_name}</b></div>
                    {r.reason && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{r.reason}</div>}
                  </div>
                  <button type="button" onClick={() => decide(r.id, true)} style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: 'none', cursor: 'pointer', background: 'var(--green-l)', color: '#059669' }}>Approve</button>
                  <button type="button" onClick={() => decide(r.id, false)} style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: 'var(--ds-btn-py-xs) 10px', border: 'none', cursor: 'pointer', background: '#fef2f2', color: '#dc2626' }}>Deny</button>
                </div>
              ))}
            </SectionCard>
          </div>

          {/* Create role */}
          <div style={{ marginBottom: 20 }}>
            <SectionCard title="New role">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Role name, e.g. KYC Reviewer" className="input-field" style={{ fontSize: 13, padding: '8px 12px', minWidth: 200 }} />
                <input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="Description (optional)" className="input-field" style={{ fontSize: 13, padding: '8px 12px', flex: 1, minWidth: 220 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={newRolePerm} onChange={e => setNewRolePerm(e.target.checked)} />
                  Can review KYC
                </label>
                <button type="button" onClick={createRole} disabled={!newRoleName.trim() || creating}
                  style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (!newRoleName.trim() || creating) ? 0.6 : 1, minHeight: 'var(--ctl-h)' }}>
                  {creating ? 'Creating…' : 'Create role'}
                </button>
              </div>
            </SectionCard>
          </div>

          {/* Roles list */}
          <SectionCard padded={false} title="Roles">
            {roles?.length === 0 && <div style={{ padding: '20px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No custom roles yet.</div>}
            {roles?.map((role, i, arr) => (
              <div key={role.id} style={{ padding: '16px 20px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{role.name}</span>
                  {role.permissions.map(p => (
                    <span key={p} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--teal-l, #ecfeff)', color: 'var(--teal)' }}>{PERMISSION_LABEL[p] || p}</span>
                  ))}
                  <button type="button" onClick={() => deleteRole(role.id, role.name)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                    <Icon name="trash2" size={15} />
                  </button>
                </div>
                {role.description && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 10 }}>{role.description}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {role.members.map(m => (
                    <span key={m.user_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--bg)', borderRadius: 20, padding: '3px 6px 3px 3px' }}>
                      <PersonAvatar userId={m.user_id} name={m.user_name} size={20} />
                      {m.user_name}
                      <button type="button" onClick={() => removeMember(role.id, m.user_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex' }}>
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  ))}
                  <select value="" onChange={e => addMember(role.id, e.target.value)} className="input-field" style={{ fontSize: 12, padding: '4px 8px' }}>
                    <option value="">+ Add member…</option>
                    {staff.filter(u => !role.members.some(m => m.user_id === u.id)).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      )}
    </div>
  );
};

export default OneIdRoles;
