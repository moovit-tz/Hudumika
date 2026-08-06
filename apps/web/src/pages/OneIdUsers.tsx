import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

interface OneIdUser {
  id: string; name: string; email: string; phone: string | null;
  role: string; active: boolean; created_at: string; last_login_at: string | null;
}
interface Invitation {
  id: string; email: string; role: string; status: string;
  expires_at: string; created_at: string; invited_by_name: string | null;
}

const ROLES = ['ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER'];

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('JUNIOR');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/oneid/invitations', { method: 'POST', body: JSON.stringify({ email, role }) });
      onInvited();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 420, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 20 }}>Invite a user</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Select role" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const OneIdUsers: React.FC = () => {
  const { user: me } = useAuth();
  const canManage = me?.role === 'ADMIN' || me?.role === 'TENANT_ADMIN' || me?.role === 'SUPER_ADMIN';
  const [users, setUsers] = useState<OneIdUser[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/oneid/users').catch(() => []),
      canManage ? apiFetch('/v1/oneid/invitations').catch(() => []) : Promise.resolve([]),
    ]).then(([u, i]) => { setUsers(u); setInvites(i); }).finally(() => setLoading(false));
  }, [canManage]);

  useEffect(() => { reload(); }, [reload]);

  async function changeRole(id: string, role: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
    try { await apiFetch(`/v1/oneid/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); }
    catch { reload(); }
  }

  async function toggleActive(u: OneIdUser) {
    const active = !u.active;
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active } : x));
    try { await apiFetch(`/v1/oneid/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }); }
    catch { reload(); }
  }

  return (
    <div style={{ padding: 24 }}>
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Users</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>Directory, roles, and invitations for this tenant</div>
        </div>
        {canManage && (
          <button type="button" onClick={() => setShowInvite(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="userPlus" size={15} /> Invite user
          </button>
        )}
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', marginBottom: canManage && invites.length > 0 ? 24 : 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Name', 'Email', 'Role', 'Status', 'Last login', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.03 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && users.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{u.name}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{u.email}</td>
                <td style={{ padding: '10px 14px' }}>
                  {canManage ? (
                    <Select value={u.role} onValueChange={v => changeRole(u.id, v)}>
                      <SelectTrigger aria-label="Change role" style={{ width: 'auto', height: 'auto', padding: '4px 8px', fontSize: 12 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[u.role, ...ROLES.filter(r => r !== u.role)].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{u.role}</span>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: u.active ? '#ecfdf5' : '#fee2e2', color: u.active ? '#065f46' : '#991b1b' }}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{fmt(u.last_login_at)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  {canManage && (
                    <button type="button" title={u.active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(u)}
                      style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', fontSize: 11, fontFamily: 'var(--font)', cursor: 'pointer', color: 'var(--ink2)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No users found.</div>
        )}
      </div>

      {canManage && invites.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Pending invitations</div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Email', 'Role', 'Status', 'Invited by', 'Expires'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map(i => (
                  <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--ink)' }}>{i.email}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{i.role}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{i.status}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{i.invited_by_name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{fmt(i.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
