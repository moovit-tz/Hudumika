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

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' as const };

  return (
    <div className="ondi-modal-backdrop" onClick={onClose}>
      <div className="ondi-modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Invite a New Team Member</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>An invitation link will be sent to their email.</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Email Address</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Assigned Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
              {saving ? 'Sending…' : 'Send Invitation'}
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
    const q = search.toLowerCase();
    const matchesSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    if (!matchesSearch) return false;

    if (filterPermission !== 'All') {
      if (filterPermission === 'Admin' && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN') return false;
      if (filterPermission === 'Member' && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')) return false;
    }

    if (filterStatus !== 'All') {
      const status = u.active ? 'Seated' : 'Suspended';
      if (status !== filterStatus) return false;
    }

    if (filterRole !== 'All') {
      if (u.role !== filterRole) return false;
    }

    return true;
  });

  function toggleSelectUser(id: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  function exportCSV() {
    const headers = ['Name', 'Email', 'Status', 'Role', 'Created At'];
    const rows = filteredUsers.map(u => [u.name, u.email, u.active ? 'Seated' : 'Suspended', u.role, fmt(u.created_at)]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `users_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const activeCount = users.filter(u => u.active).length;
  const pendingInvitesCount = invites.filter(i => i.status === 'PENDING').length;

  return (
    <div className="ondi-page-container">
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={reload} />}

      <PageHeader
        crumbs={['Ondi', 'Users']}
        titlePlain="User"
        titleEm="directory"
        subtitle="Manage seated members, assigned administrative roles, and pending tenant invitations."
        actions={canManage ? (
          <button type="button" onClick={() => setShowInvite(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)' }}>
            <Icon name="userPlus" size={15} /> Invite User
          </button>
        ) : undefined}
      />

      {/* KPI Stats Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Users</span>
            <div className="ondi-kpi-icon-box"><Icon name="users" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{users.length}</span>
            <span className="ondi-kpi-sub">accounts registered</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Active Seated</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}><Icon name="checkCircle" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#047857' }}>{activeCount}</span>
            <span className="ondi-kpi-sub">seated seats</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Pending Invites</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fffbeb', color: '#b45309' }}><Icon name="mail" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#b45309' }}>{pendingInvitesCount}</span>
            <span className="ondi-kpi-sub">awaiting sign-up</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Join Requests</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#eff6ff', color: '#1d4ed8' }}><Icon name="userCheck" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#1d4ed8' }}>{joinRequests.length}</span>
            <span className="ondi-kpi-sub">auto-domain requests</span>
          </div>
        </div>
      </div>

      {/* Tabs Header Bar */}
      <div className="ondi-nav-tabstrip">
        <button className={`ondi-tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <Icon name="users" size={14} /> Users <span className="ondi-tab-badge">{users.length}</span>
        </button>
        <button className={`ondi-tab-btn ${activeTab === 'invites' ? 'active' : ''}`} onClick={() => setActiveTab('invites')}>
          <Icon name="mail" size={14} /> Invites {invites.length > 0 && <span className="ondi-tab-badge">{invites.length}</span>}
        </button>
        {canManage && (
          <button className={`ondi-tab-btn ${activeTab === 'join-requests' ? 'active' : ''}`} onClick={() => setActiveTab('join-requests')}>
            <Icon name="userCheck" size={14} /> Join Requests {joinRequests.length > 0 && <span className="ondi-tab-badge">{joinRequests.length}</span>}
          </button>
        )}
      </div>

      {/* ── Tab 1: Users Table ───────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <SectionCard padded={false}>
          {/* Header & Filter Toolbar */}
          <div className="ondi-toolbar">
            <div className="ondi-search-input">
              <Icon name="search" size={14} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
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
                  { value: 'Suspended', label: 'Suspended' },
                ]}
              />

              <SingleSelectFilter
                label="Role"
                value={filterRole === 'All' ? null : filterRole}
                onChange={v => setFilterRole(v ?? 'All')}
                options={ROLES.map(r => ({ value: r, label: r }))}
              />

              <button type="button" onClick={exportCSV}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>
                <Icon name="download" size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="ondi-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && filteredUsers.map(u => {
                  const isSelected = selectedUsers.has(u.id);
                  return (
                    <tr key={u.id} className={isSelected ? 'selected' : ''}>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectUser(u.id)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PersonAvatar userId={u.id} name={u.name} size={32} style={{ border: '1px solid var(--border-soft)' }} />
                          {u.name}
                        </div>
                      </td>
                      <td style={{ color: 'var(--ink2)' }}>{u.email}</td>
                      <td>
                        <span className={`ondi-status-pill ${u.active ? 'success' : 'warning'}`}>
                          <span className="ondi-status-dot" />
                          {u.active ? 'Seated' : 'Suspended'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11.5, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border-soft)', padding: '3px 8px', borderRadius: 6, color: 'var(--ink)' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmt(u.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6, borderRadius: 6 }}>
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
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No users found matching current filters.</div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tab 2: Invites Table ─────────────────────────────────────────────── */}
      {activeTab === 'invites' && (
        <SectionCard padded={false}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
            Pending Invitations ({invites.length})
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="ondi-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Invited By</th>
                  <th>Expires</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(i => {
                  const statusClass = i.status === 'REVOKED' ? 'error' : i.status === 'ACCEPTED' ? 'success' : 'warning';
                  return (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{i.email}</td>
                      <td><span style={{ fontSize: 11.5, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border-soft)', padding: '3px 8px', borderRadius: 6 }}>{i.role}</span></td>
                      <td>
                        <span className={`ondi-status-pill ${statusClass}`}>
                          <span className="ondi-status-dot" />
                          {i.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink3)' }}>{i.invited_by_name || '—'}</td>
                      <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmt(i.expires_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {i.status === 'PENDING' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}>
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
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No pending invitations.</div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tab 3: Join Requests ─────────────────────────────────────────────── */}
      {activeTab === 'join-requests' && canManage && (
        <SectionCard padded={false}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Auto-Domain Join Requests ({joinRequests.length})</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
              People who registered with an email on this workspace's domain requesting account access.
            </div>
            {joinActionErr && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{joinActionErr}</div>}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="ondi-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Requested</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {joinRequests.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PersonAvatar name={r.name} size={30} style={{ border: '1px solid var(--border-soft)' }} />
                        {r.name}
                      </div>
                    </td>
                    <td style={{ color: 'var(--ink2)' }}>{r.email}</td>
                    <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{fmt(r.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
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
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {joinRequests.length === 0 && (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No pending join requests.</div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default OndiUsers;
