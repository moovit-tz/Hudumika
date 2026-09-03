import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';

interface OndiUser {
  id: string; name: string; email: string; phone: string | null;
  role: string; active: boolean; created_at: string; last_login_at: string | null;
}
interface Invitation {
  id: string; email: string; role: string; status: string;
  expires_at: string; created_at: string; invited_by_name: string | null;
}
interface JoinRequest {
  id: string; name: string; email: string; status: string;
  created_at: string; reviewed_at: string | null; deny_reason: string | null;
}

const ROLES = ['ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER'];

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
      await apiFetch('/v1/ondi/invitations', { method: 'POST', body: JSON.stringify({ email, role }) });
      onInvited();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 420, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 20 }}>Invite a user</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const OndiUsers: React.FC = () => {
  const { user: me } = useAuth();
  const canManage = me?.role === 'ADMIN' || me?.role === 'TENANT_ADMIN' || me?.role === 'SUPER_ADMIN';
  const [users, setUsers] = useState<OndiUser[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Tabs: 'users', 'invites', 'join-requests' — the NexusHR "Invitations"
  // nav item links straight to ?tab=invites now that its own page is gone,
  // and the auto-join-by-domain email (onboarding.service.ts's
  // createJoinRequest) links to ?tab=join-requests, so the initial tab has
  // to be readable from the URL, not just clicked into. (A "Google
  // Workspace" and a "Settings" tab used to live here too — both were pure
  // fabricated UI with no backend at all, e.g. a hardcoded "120 Users" and
  // toggle switches with no onChange handler — removed rather than kept as
  // decoration; see M5 of the Ondi house-style plan.)
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'users' | 'invites' | 'join-requests'>(
    initialTab === 'invites' || initialTab === 'join-requests' ? initialTab : 'users'
  );

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [filterPermission, setFilterPermission] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterRole, setFilterRole] = useState('All');

  // Checkbox selection state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/ondi/users').catch(() => []),
      canManage ? apiFetch('/v1/ondi/invitations').catch(() => []) : Promise.resolve([]),
      canManage ? apiFetch('/v1/ondi/org/join-requests').catch(() => []) : Promise.resolve([]),
    ]).then(([u, i, j]) => {
      setUsers(u);
      setInvites(i);
      setJoinRequests(j);
    }).finally(() => setLoading(false));
  }, [canManage]);

  useEffect(() => { reload(); }, [reload]);

  async function changeRole(id: string, role: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
    try { await apiFetch(`/v1/ondi/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); }
    catch { reload(); }
  }

  async function toggleActive(u: OndiUser) {
    const active = !u.active;
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active } : x));
    try { await apiFetch(`/v1/ondi/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }); }
    catch { reload(); }
  }

  async function revokeInvite(id: string) {
    setInvites(prev => prev.map(i => i.id === id ? { ...i, status: 'REVOKED' } : i));
    try { await apiFetch(`/v1/ondi/invitations/${id}`, { method: 'DELETE' }); }
    catch { reload(); }
  }

  const [resent, setResent] = useState<string | null>(null);
  async function resendInvite(id: string) {
    try {
      await apiFetch(`/v1/ondi/invitations/${id}/resend`, { method: 'POST' });
      setResent(id);
      setTimeout(() => setResent(prev => (prev === id ? null : prev)), 2000);
    } catch { /* ignore */ }
  }

  const [joinActionErr, setJoinActionErr] = useState<string | null>(null);
  async function approveJoinRequest(id: string, role: string) {
    setJoinActionErr(null);
    setJoinRequests(prev => prev.filter(r => r.id !== id));
    try {
      await apiFetch(`/v1/ondi/org/join-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ role }) });
      reload();
    } catch (err: any) {
      setJoinActionErr(err.message || 'Failed to approve request');
      reload();
    }
  }
  async function denyJoinRequest(id: string) {
    setJoinActionErr(null);
    setJoinRequests(prev => prev.filter(r => r.id !== id));
    try {
      await apiFetch(`/v1/ondi/org/join-requests/${id}/deny`, { method: 'POST', body: JSON.stringify({}) });
    } catch (err: any) {
      setJoinActionErr(err.message || 'Failed to deny request');
      reload();
    }
  }

  // Filter computation
  const filteredUsers = users.filter(u => {
    // 1. Search
    const q = search.toLowerCase();
    const matchesSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    if (!matchesSearch) return false;

    // 2. Permissions filter (Mock permissions categories)
    if (filterPermission !== 'All') {
      if (filterPermission === 'Admin' && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN') return false;
      if (filterPermission === 'Member' && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')) return false;
    }

    // 3. Status filter
    if (filterStatus !== 'All') {
      const status = u.active ? 'Seated' : 'Suspended';
      if (status !== filterStatus) return false;
    }

    // 4. Role filter
    if (filterRole !== 'All') {
      if (u.role !== filterRole) return false;
    }

    return true;
  });

  // Checkbox handlers
  function toggleSelectUser(id: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  }

  // CSV Exporter
  function exportCSV() {
    const headers = ['Name', 'Email', 'Status', 'Role', 'Updated'];
    const rows = filteredUsers.map(u => [
      u.name,
      u.email,
      u.active ? 'Seated' : 'Suspended',
      u.role,
      fmt(u.created_at),
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `users_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const tabStyle = (tab: typeof activeTab) => ({
    padding: '12px 18px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    color: activeTab === tab ? 'var(--teal)' : 'var(--ink2)',
    borderBottom: activeTab === tab ? '2px solid var(--teal)' : '2px solid transparent',
    fontFamily: 'var(--font)',
    outline: 'none',
    transition: 'all 0.15s ease'
  });

  return (
    <div>
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={reload} />}

      <PageHeader
        crumbs={['Ondi', 'Users']}
        titlePlain="User"
        titleEm="directory"
        subtitle="Every user in this tenant, their role, and pending invitations."
        actions={canManage ? (
          <button type="button" onClick={() => setShowInvite(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="userPlus" size={15} /> Invite user
          </button>
        ) : undefined}
      />

      {/* Tabs Header Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={tabStyle('users')} onClick={() => setActiveTab('users')}>Users</button>
        <button style={tabStyle('invites')} onClick={() => setActiveTab('invites')}>Invites {invites.length > 0 ? `(${invites.length})` : ''}</button>
        {canManage && (
          <button style={tabStyle('join-requests')} onClick={() => setActiveTab('join-requests')}>
            Join requests {joinRequests.length > 0 ? `(${joinRequests.length})` : ''}
          </button>
        )}
      </div>

      {/* ── Tab 1: Users ───────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <SectionCard padded={false}>
          {/* Header / Export Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              Users <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>({filteredUsers.length})</span>
            </div>
            <button type="button" onClick={exportCSV}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
              <Icon name="download" size={14} /> Export CSV
            </button>
          </div>

          {/* Filter Row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border-soft)', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users"
                style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--r-sm, 6px)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
            </div>

            <SingleSelectFilter
              label="Permissions"
              value={filterPermission === 'All' ? null : filterPermission}
              onChange={v => setFilterPermission(v ?? 'All')}
              options={[
                { value: 'Admin', label: 'Admins' },
                { value: 'Member', label: 'Members' },
              ]}
            />

            <SingleSelectFilter
              label="Status"
              value={filterStatus === 'All' ? null : filterStatus}
              onChange={v => setFilterStatus(v ?? 'All')}
              options={[
                { value: 'Seated', label: 'Seated (Active)' },
                { value: 'Suspended', label: 'Suspended (Inactive)' },
              ]}
            />

            <SingleSelectFilter
              label="Role"
              value={filterRole === 'All' ? null : filterRole}
              onChange={v => setFilterRole(v ?? 'All')}
              options={ROLES.map(r => ({ value: r, label: r }))}
            />
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px', width: 40 }}>
                    <input type="checkbox" checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer', verticalAlign: 'middle' }} />
                  </th>
                  {['Name ↑', 'Email', 'Status', 'Roles', 'Updated', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.03 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && filteredUsers.map(u => {
                  const isSelected = selectedUsers.has(u.id);
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid var(--border)', background: isSelected ? 'rgba(var(--teal-rgb), 0.04)' : 'transparent', transition: 'background 0.15s ease' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectUser(u.id)} style={{ cursor: 'pointer', verticalAlign: 'middle' }} />
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PersonAvatar userId={u.id} name={u.name} size={30} style={{ border: '1px solid var(--border-soft)' }} />
                          {u.name}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{u.email}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '4px 10px',
                          background: u.active ? '#ecfdf5' : '#fff7ed',
                          color: u.active ? '#065f46' : '#c2410c'
                        }}>
                          {u.active ? 'Seated' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{u.role}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{fmt(u.created_at)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                              <Icon name="moreVertical" size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toggleActive(u)}>
                              <Icon name="shield" size={14} /> {u.active ? 'Suspend User' : 'Activate User'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {ROLES.map(r => (
                              <DropdownMenuItem key={r} onClick={() => changeRole(u.id, r)} disabled={u.role === r}>
                                Set role to {r}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && filteredUsers.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No users found matching current filters.</div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tab 2: Invites ─────────────────────────────────────────────── */}
      {activeTab === 'invites' && (
        <SectionCard padded={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              Pending invitations <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>({invites.length})</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Email', 'Role', 'Status', 'Invited by', 'Expires', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map(i => {
                  const statusColor = i.status === 'REVOKED' ? '#ef4444' : i.status === 'ACCEPTED' ? '#10b981' : '#f59e0b';
                  return (
                    <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>{i.email}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{i.role}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px', background: `${statusColor}15`, color: statusColor }}>
                          {i.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{i.invited_by_name || '—'}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{fmt(i.expires_at)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {i.status === 'PENDING' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                                <Icon name="moreVertical" size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => resendInvite(i.id)}>
                                <Icon name="send" size={14} /> {resent === i.id ? 'Sent ✓' : 'Resend Invite'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => revokeInvite(i.id)}>
                                <Icon name="x" size={14} style={{ color: 'var(--red)' }} /> Revoke Invite
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {invites.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No pending invitations.</div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tab 3: Join requests (auto-join-by-domain) ───────────────────── */}
      {activeTab === 'join-requests' && canManage && (
        <SectionCard padded={false}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              Join requests <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>({joinRequests.length})</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
              People who signed up with an email on this workspace's domain and asked to join instead of creating a new workspace.
            </div>
            {joinActionErr && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{joinActionErr}</div>}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Name', 'Email', 'Requested', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {joinRequests.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PersonAvatar name={r.name} size={30} style={{ border: '1px solid var(--border-soft)' }} />
                        {r.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{r.email}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{fmt(r.created_at)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button"
                              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                              Approve as…
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {ROLES.map(role => (
                              <DropdownMenuItem key={role} onClick={() => approveJoinRequest(r.id, role)}>
                                Approve as {role}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button type="button" onClick={() => denyJoinRequest(r.id)}
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: 'var(--r-sm)', padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {joinRequests.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No pending join requests.</div>
            )}
          </div>
        </SectionCard>
      )}

    </div>
  );
};

export default OndiUsers;
