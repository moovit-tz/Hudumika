import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Tip } from '../components/ui/tooltip.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { SlidersHorizontal, X } from 'lucide-react';

interface OndiUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  invited_by_name: string | null;
}

interface JoinRequest {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  deny_reason: string | null;
}

const ROLES = ['ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'CUSTOMER'];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: 'Complete administrative authority, tenant settings & master role delegation.',
  ADMIN: 'Platform configuration, seated user management, and workspace administration.',
  MANAGER: 'Operations lead, workflow approvals, and department management.',
  FINANCE: 'Invoicing, tax codes, payments, and financial landed-cost reconciliation.',
  SALES: 'CRM deals, leads, quotes, quota targets, and pipeline tracking.',
  SENIOR: 'Advanced operational workflows, compliance processing, and task management.',
  JUNIOR: 'Standard operational execution, assigned tasks, and document entry.',
  CUSTOMER: 'External portal viewer with read-only visibility into tracking and invoices.',
};

function assignableRoles(canGrantSuperAdmin: boolean): string[] {
  return canGrantSuperAdmin ? [...ROLES, 'SUPER_ADMIN'] : ROLES;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getRolePillClass(role: string): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'ondi-role-pill super-admin';
    case 'ADMIN': return 'ondi-role-pill admin';
    case 'MANAGER': return 'ondi-role-pill manager';
    case 'FINANCE': return 'ondi-role-pill finance';
    case 'SALES': return 'ondi-role-pill sales';
    case 'SENIOR': return 'ondi-role-pill senior';
    case 'JUNIOR': return 'ondi-role-pill junior';
    case 'CUSTOMER': return 'ondi-role-pill customer';
    default: return 'ondi-role-pill';
  }
}

function InviteModal({
  open,
  onOpenChange,
  onInvited,
  canGrantSuperAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
  canGrantSuperAdmin: boolean;
}) {
  const [mode, setMode] = useState<'invite' | 'direct'>('invite');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('JUNIOR');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setEmail(''); setName(''); setPassword(''); setRole('JUNIOR'); setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (mode === 'invite') {
        await apiFetch('/v1/ondi/invitations', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), role }),
        });
      } else {
        await apiFetch('/v1/ondi/users/direct', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), name: name.trim(), role, password }),
        });
      }
      onInvited();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || (mode === 'invite' ? 'Failed to send invite' : 'Failed to add user'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent size="md" className="p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <FeaturedIcon variant="brand" size="md">
              <Icon name="userPlus" size={20} />
            </FeaturedIcon>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Add a New Team Member
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {mode === 'invite'
                  ? 'An invitation link will be sent to their email to join your workspace.'
                  : 'Creates the account immediately — share the password with them yourself.'}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-4 flex w-full gap-2" role="group" aria-label="Add method">
            <Button
              type="button"
              variant={mode === 'invite' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={mode === 'invite'}
              className="flex-1"
              onClick={() => setMode('invite')}
            >
              <Icon name="mail" size={14} />
              Send Invite
            </Button>
            <Button
              type="button"
              variant={mode === 'direct' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={mode === 'direct'}
              className="flex-1"
              onClick={() => setMode('direct')}
            >
              <Icon name="userPlus" size={14} />
              Add Directly
            </Button>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Email Address <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="text-sm"
              autoFocus
            />
          </div>

          {mode === 'direct' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground/85 block">
                Full Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
                className="text-sm"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Assigned Role <span className="text-red-500">*</span>
            </label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles(canGrantSuperAdmin).map(r => (
                  <SelectItem key={r} value={r}>
                    <div className="flex items-center gap-2">
                      <span className={getRolePillClass(r)}>{r}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]">
                        {ROLE_DESCRIPTIONS[r] || ''}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {ROLE_DESCRIPTIONS[role] || 'Assigned workspace permissions for this user.'}
            </p>
          </div>

          {mode === 'direct' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground/85 block">
                Password <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Set a password to share with them"
                className="text-sm"
              />
            </div>
          )}

          {error && (
            <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
              <Icon name="alertCircle" size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !email.trim() || (mode === 'direct' && (!name.trim() || !password))}>
              {saving ? (
                <>
                  <Icon name="refresh" size={14} className="animate-spin mr-1.5" />
                  {mode === 'invite' ? 'Sending…' : 'Adding…'}
                </>
              ) : mode === 'invite' ? (
                <>
                  <Icon name="send" size={14} className="mr-1.5" />
                  Send Invitation
                </>
              ) : (
                <>
                  <Icon name="userPlus" size={14} className="mr-1.5" />
                  Add User
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const OndiUsers: React.FC = () => {
  const { user: me } = useAuth();
  const canManage = me?.role === 'ADMIN' || me?.role === 'TENANT_ADMIN' || me?.role === 'SUPER_ADMIN';
  const canGrantSuperAdmin = me?.role === 'SUPER_ADMIN';

  const [users, setUsers] = useState<OndiUser[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'users' | 'invites' | 'join-requests'>(
    initialTab === 'invites' || initialTab === 'join-requests' ? initialTab : 'users'
  );

  // Sync tab with URL
  const handleTabChange = (tab: 'users' | 'invites' | 'join-requests') => {
    setActiveTab(tab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'users') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    });
  };

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [filterPermission, setFilterPermission] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterRole, setFilterRole] = useState('All');

  // Compact rows / row density state
  const [compactRows, setCompactRows] = useState(true);

  // Pagination state for users table
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(25);

  // Checkbox selection state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  // Email copy confirmation state
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);

  useEffect(() => {
    setUserPage(1);
  }, [search, filterPermission, filterStatus, filterRole]);

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
    try {
      await apiFetch(`/v1/ondi/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    } catch {
      reload();
    }
  }

  async function toggleActive(u: OndiUser) {
    const active = !u.active;
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active } : x));
    try {
      await apiFetch(`/v1/ondi/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
    } catch {
      reload();
    }
  }

  async function handleBulkStatus(active: boolean) {
    const ids = Array.from(selectedUsers);
    if (ids.length === 0) return;
    setUsers(prev => prev.map(u => ids.includes(u.id) ? { ...u, active } : u));
    try {
      await Promise.all(
        ids.map(id => apiFetch(`/v1/ondi/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }))
      );
    } catch {
      reload();
    }
  }

  async function revokeInvite(id: string) {
    setInvites(prev => prev.map(i => i.id === id ? { ...i, status: 'REVOKED' } : i));
    try {
      await apiFetch(`/v1/ondi/invitations/${id}`, { method: 'DELETE' });
    } catch {
      reload();
    }
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
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
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
  }, [users, search, filterPermission, filterStatus, filterRole]);

  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  const hasActiveFilters = search.trim() !== '' || filterPermission !== 'All' || filterStatus !== 'All' || filterRole !== 'All';

  function resetFilters() {
    setSearch('');
    setFilterPermission('All');
    setFilterStatus('All');
    setFilterRole('All');
  }

  function toggleSelectUser(id: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedUsers.size === paginatedUsers.length && paginatedUsers.length > 0) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(paginatedUsers.map(u => u.id)));
    }
  }

  function exportCSV() {
    const listToExport = selectedUsers.size > 0
      ? filteredUsers.filter(u => selectedUsers.has(u.id))
      : filteredUsers;

    const headers = ['Name', 'Email', 'Status', 'Role', 'Created At'];
    const rows = listToExport.map(u => [u.name, u.email, u.active ? 'Seated' : 'Suspended', u.role, fmt(u.created_at)]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `users_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function copyEmail(id: string, email: string) {
    navigator.clipboard.writeText(email);
    setCopiedEmailId(id);
    setTimeout(() => {
      setCopiedEmailId(prev => (prev === id ? null : prev));
    }, 2000);
  }

  const activeCount = users.filter(u => u.active).length;
  const pendingInvitesCount = invites.filter(i => i.status === 'PENDING').length;

  return (
    <div className="ondi-page-container ondi-users-page">
      <InviteModal
        open={showInvite}
        onOpenChange={setShowInvite}
        onInvited={reload}
        canGrantSuperAdmin={canGrantSuperAdmin}
      />

      <PageHeader
        crumbs={['Ondi', 'Users']}
        titlePlain="User "
        titleEm="directory."
        subtitle="Manage seated members, assigned administrative roles, and pending tenant invitations."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              disabled={loading}
              className="h-9 px-3 gap-1.5"
              title="Refresh directory"
            >
              <Icon name="refresh" size={14} className={loading ? 'animate-spin text-teal-600' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canManage && (
              <Button
                type="button"
                onClick={() => setShowInvite(true)}
                className="h-9 gap-1.5 shadow-sm"
              >
                <Icon name="userPlus" size={15} />
                <span>Invite User</span>
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Stats Bar */}
      <div className="ondi-kpi-grid">
        {/* Total Users */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            handleTabChange('users');
            resetFilters();
          }}
          onKeyDown={e => { if (e.key === 'Enter') { handleTabChange('users'); resetFilters(); } }}
          className={`ondi-kpi-card ${activeTab === 'users' && !hasActiveFilters ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Users</span>
            <div className="ondi-kpi-icon-box purple">
              <Icon name="users" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{users.length}</span>
            <span className="ondi-kpi-sub">accounts registered</span>
          </div>
        </div>

        {/* Active Seated */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            handleTabChange('users');
            setFilterStatus('Seated');
          }}
          onKeyDown={e => { if (e.key === 'Enter') { handleTabChange('users'); setFilterStatus('Seated'); } }}
          className={`ondi-kpi-card ${activeTab === 'users' && filterStatus === 'Seated' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Active Seated</span>
            <div className="ondi-kpi-icon-box green">
              <Icon name="checkCircle" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--green)' }}>{activeCount}</span>
            <span className="ondi-kpi-sub">seated seats</span>
          </div>
        </div>

        {/* Pending Invites */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleTabChange('invites')}
          onKeyDown={e => { if (e.key === 'Enter') handleTabChange('invites'); }}
          className={`ondi-kpi-card ${activeTab === 'invites' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Pending Invites</span>
            <div className="ondi-kpi-icon-box gold">
              <Icon name="mail" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--gold)' }}>{pendingInvitesCount}</span>
            <span className="ondi-kpi-sub">awaiting sign-up</span>
          </div>
        </div>

        {/* Join Requests */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => { if (canManage) handleTabChange('join-requests'); }}
          onKeyDown={e => { if (e.key === 'Enter' && canManage) handleTabChange('join-requests'); }}
          className={`ondi-kpi-card ${activeTab === 'join-requests' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Join Requests</span>
            <div className="ondi-kpi-icon-box blue">
              <Icon name="userCheck" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--blue)' }}>{joinRequests.length}</span>
            <span className="ondi-kpi-sub">auto-domain requests</span>
          </div>
        </div>
      </div>

      {/* Segmented Tabstrip */}
      <div className="ondi-nav-tabstrip" role="tablist" aria-label="People administration">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          className={`ondi-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => handleTabChange('users')}
        >
          <Icon name="users" size={14} />
          <span>Users</span>
          <span className="ondi-tab-badge">{users.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'invites'}
          className={`ondi-tab-btn ${activeTab === 'invites' ? 'active' : ''}`}
          onClick={() => handleTabChange('invites')}
        >
          <Icon name="mail" size={14} />
          <span>Invites</span>
          {invites.length > 0 && <span className="ondi-tab-badge">{invites.length}</span>}
        </button>

        {canManage && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'join-requests'}
            className={`ondi-tab-btn ${activeTab === 'join-requests' ? 'active' : ''}`}
            onClick={() => handleTabChange('join-requests')}
          >
            <Icon name="userCheck" size={14} />
            <span>Join Requests</span>
            {joinRequests.length > 0 && <span className="ondi-tab-badge">{joinRequests.length}</span>}
          </button>
        )}
      </div>

      {/* ── Tab 1: Users Table ───────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <SectionCard padded={false} className="overflow-hidden border border-border shadow-sm">
          {/* Header & Filter Toolbar */}
          <div className="ondi-toolbar">
            <div className="ondi-search-input">
              <Icon name="search" size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or email…"
                aria-label="Search users"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                  aria-label="Clear search"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5 items-center">
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
                options={assignableRoles(canGrantSuperAdmin).map(r => ({ value: r, label: r }))}
              />

              <Tip label={compactRows ? "Currently in compressed rows view (compact). Click for standard." : "Switch to compressed rows view."}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCompactRows(v => !v)}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <Icon name="list" size={13} />
                  <span>{compactRows ? 'Dense Rows' : 'Standard Rows'}</span>
                </Button>
              </Tip>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportCSV}
                className="h-8 gap-1.5 text-xs font-bold"
              >
                <Icon name="download" size={13} />
                <span>{selectedUsers.size > 0 ? `Export (${selectedUsers.size})` : 'Export CSV'}</span>
              </Button>
            </div>
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 600 }}>Active filters:</span>
              {search.trim() && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink)',
                  }}
                >
                  Search: <strong>&ldquo;{search}&rdquo;</strong>
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {filterPermission !== 'All' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink)',
                  }}
                >
                  Permissions: <strong>{filterPermission}</strong>
                  <button
                    type="button"
                    onClick={() => setFilterPermission('All')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                    title="Clear permissions filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {filterStatus !== 'All' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink)',
                  }}
                >
                  Status: <strong style={{ color: filterStatus === 'Seated' ? 'var(--green)' : 'var(--gold)' }}>{filterStatus}</strong>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('All')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                    title="Clear status filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {filterRole !== 'All' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink)',
                  }}
                >
                  Role: <strong>{filterRole}</strong>
                  <button
                    type="button"
                    onClick={() => setFilterRole('All')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                    title="Clear role filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'hsl(var(--primary))',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
                className="hover:underline"
              >
                Reset all
              </button>
            </div>
          )}

          {/* Bulk Selection Banner */}
          {selectedUsers.size > 0 && (
            <div className="px-5 py-2.5 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-800 dark:text-teal-200">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-extrabold">
                  {selectedUsers.size}
                </span>
                <span>{selectedUsers.size === 1 ? '1 user selected' : `${selectedUsers.size} users selected`}</span>
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-semibold bg-white dark:bg-slate-900 shadow-xs"
                      onClick={() => handleBulkStatus(true)}
                    >
                      <Icon name="checkCircle" size={12} className="mr-1 text-green-600" />
                      Set Seated
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-semibold bg-white dark:bg-slate-900 shadow-xs"
                      onClick={() => handleBulkStatus(false)}
                    >
                      <Icon name="shield" size={12} className="mr-1 text-amber-600" />
                      Suspend
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs font-semibold bg-white dark:bg-slate-900 shadow-xs"
                  onClick={exportCSV}
                >
                  <Icon name="download" size={12} className="mr-1" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedUsers(new Set())}
                >
                  Deselect all
                </Button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="ondi-table" data-compact={compactRows ? 'true' : undefined}>
              <thead>
                <tr>
                  <th style={{ width: compactRows ? 36 : 44, textAlign: 'center' }}>
                    <Checkbox
                      className="mx-auto"
                      checked={paginatedUsers.length > 0 && selectedUsers.size === paginatedUsers.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all users"
                    />
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
                {!loading && paginatedUsers.map(u => {
                  const isSelected = selectedUsers.has(u.id);
                  const isCurrentUser = u.id === me?.id;

                  return (
                    <tr key={u.id} className={isSelected ? 'selected' : ''}>
                      <td style={{ textAlign: 'center' }}>
                        <Checkbox
                          className="mx-auto"
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectUser(u.id)}
                          aria-label={`Select ${u.name}`}
                        />
                      </td>

                      {/* User Cell */}
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="relative shrink-0">
                            <PersonAvatar
                              userId={u.id}
                              name={u.name}
                              size={compactRows ? 26 : 34}
                              style={{ border: '1px solid var(--border)' }}
                            />
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-slate-900"
                              style={{ background: u.active ? 'var(--green)' : 'var(--ink3)' }}
                              title={u.active ? 'Seated member' : 'Suspended member'}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className={`font-bold text-foreground flex items-center gap-1.5 ${compactRows ? 'text-xs' : 'text-sm'}`}>
                              <span className="truncate">{u.name}</span>
                              {isCurrentUser && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                                  You
                                </span>
                              )}
                            </div>
                            {(!compactRows || u.phone) && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {u.phone || 'No phone set'}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email Cell */}
                      <td>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className={`font-mono ${compactRows ? 'text-[11.5px]' : 'text-xs'}`}>{u.email}</span>
                          <button
                            type="button"
                            onClick={() => copyEmail(u.id, u.email)}
                            className="ondi-copy-btn"
                            title={copiedEmailId === u.id ? 'Copied!' : 'Copy email address'}
                          >
                            <Icon
                              name={copiedEmailId === u.id ? 'check' : 'copy'}
                              size={12}
                              style={copiedEmailId === u.id ? { color: 'var(--green)' } : undefined}
                            />
                          </button>
                        </div>
                      </td>

                      {/* Status Cell */}
                      <td>
                        <span className={`ondi-status-pill ${u.active ? 'success' : 'warning'}`}>
                          <span className="ondi-status-dot" />
                          {u.active ? 'Seated' : 'Suspended'}
                        </span>
                      </td>

                      {/* Role Cell */}
                      <td>
                        <span className={getRolePillClass(u.role)}>
                          {u.role}
                        </span>
                      </td>

                      {/* Created Cell */}
                      <td className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(u.created_at)}
                      </td>

                      {/* Actions Dropdown */}
                      <td style={{ textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="ondi-icon-action"
                              style={{
                                background: 'none',
                                border: '1px solid transparent',
                                cursor: 'pointer',
                                color: 'var(--ink3)',
                                padding: compactRows ? '3px 6px' : '6px 8px',
                                borderRadius: 'var(--r-sm)',
                              }}
                              aria-label="User actions"
                            >
                              <Icon name="moreVertical" size={compactRows ? 14 : 16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              Member Actions
                            </DropdownMenuLabel>

                            {canManage && (
                              <DropdownMenuItem
                                onClick={() => toggleActive(u)}
                                className="cursor-pointer gap-2"
                              >
                                <Icon name="shield" size={14} className={u.active ? 'text-amber-600' : 'text-green-600'} />
                                <span>{u.active ? 'Suspend User' : 'Activate User'}</span>
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem
                              onClick={() => copyEmail(u.id, u.email)}
                              className="cursor-pointer gap-2"
                            >
                              <Icon name="copy" size={14} />
                              <span>Copy Email</span>
                            </DropdownMenuItem>

                            {canManage && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                  Assign Role
                                </DropdownMenuLabel>
                                {assignableRoles(canGrantSuperAdmin).map(r => (
                                  <DropdownMenuItem
                                    key={r}
                                    onClick={() => changeRole(u.id, r)}
                                    disabled={u.role === r}
                                    className="cursor-pointer flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className={getRolePillClass(r)}>{r}</span>
                                    </div>
                                    {u.role === r && <Icon name="check" size={14} className="text-teal-600" />}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredUsers.length > userPageSize && (
              <PaginationBar
                page={userPage}
                pageSize={userPageSize}
                total={filteredUsers.length}
                onPageChange={setUserPage}
                onPageSizeChange={p => { setUserPageSize(p); setUserPage(1); }}
                itemLabel="members"
                bordered
              />
            )}

            {/* Empty State */}
            {!loading && filteredUsers.length === 0 && (
              <div className="py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-3">
                  <Icon name="search" size={20} />
                </div>
                <div className="text-sm font-bold text-foreground">No members found</div>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  {hasActiveFilters
                    ? 'No registered users match your search or filter criteria.'
                    : 'Your workspace has no registered users yet.'}
                </p>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                    className="mt-4 text-xs font-semibold"
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tab 2: Invites Table ─────────────────────────────────────────────── */}
      {activeTab === 'invites' && (
        <SectionCard padded={false} className="overflow-hidden border border-border shadow-sm">
          <div className="p-4 px-5 border-b border-border flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-foreground">
                Pending Invitations ({invites.length})
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Invitations delivered via email awaiting candidate sign-up.
              </div>
            </div>
            {canManage && (
              <Button
                type="button"
                size="sm"
                onClick={() => setShowInvite(true)}
                className="h-8 gap-1.5 text-xs font-bold"
              >
                <Icon name="userPlus" size={14} />
                <span>Invite Member</span>
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="ondi-table" data-compact={compactRows ? 'true' : undefined}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Assigned Role</th>
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
                      <td>
                        <div className="flex items-center gap-2 font-bold text-foreground">
                          <Icon name="mail" size={15} className="text-muted-foreground" />
                          <span>{i.email}</span>
                        </div>
                      </td>
                      <td>
                        <span className={getRolePillClass(i.role)}>
                          {i.role}
                        </span>
                      </td>
                      <td>
                        <span className={`ondi-status-pill ${statusClass}`}>
                          <span className="ondi-status-dot" />
                          {i.status}
                        </span>
                      </td>
                      <td className="text-xs text-muted-foreground">{i.invited_by_name || '—'}</td>
                      <td className="text-xs text-muted-foreground">{fmt(i.expires_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {i.status === 'PENDING' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => resendInvite(i.id)}
                              className="h-7 px-2.5 text-xs font-semibold"
                            >
                              <Icon name="send" size={12} className="mr-1" />
                              {resent === i.id ? 'Sent ✓' : 'Resend'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeInvite(i.id)}
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Revoke invitation"
                            >
                              <Icon name="x" size={14} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {invites.length === 0 && (
              <div className="py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-3">
                  <Icon name="mail" size={20} />
                </div>
                <div className="text-sm font-bold text-foreground">No pending invitations</div>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  All invited members have already joined or no invitations have been issued.
                </p>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowInvite(true)}
                    className="mt-4 text-xs font-bold gap-1.5"
                  >
                    <Icon name="userPlus" size={14} />
                    <span>Send Invitation</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tab 3: Join Requests ─────────────────────────────────────────────── */}
      {activeTab === 'join-requests' && canManage && (
        <SectionCard padded={false} className="overflow-hidden border border-border shadow-sm">
          <div className="p-4 px-5 border-b border-border">
            <div className="text-sm font-bold text-foreground">
              Auto-Domain Join Requests ({joinRequests.length})
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              People who registered with an email on this workspace&apos;s corporate domain requesting account access.
            </div>
            {joinActionErr && (
              <div className="mt-2.5 p-2.5 text-xs rounded bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
                <Icon name="alertCircle" size={14} />
                <span>{joinActionErr}</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="ondi-table" data-compact={compactRows ? 'true' : undefined}>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Corporate Email</th>
                  <th>Requested Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {joinRequests.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-2.5 font-bold text-foreground">
                        <PersonAvatar name={r.name} size={30} style={{ border: '1px solid var(--border)' }} />
                        <span>{r.name}</span>
                      </div>
                    </td>
                    <td className="text-xs text-muted-foreground font-mono">{r.email}</td>
                    <td className="text-xs text-muted-foreground">{fmt(r.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" className="h-7 text-xs font-bold gap-1">
                              <span>Approve as…</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              Choose Role
                            </DropdownMenuLabel>
                            {assignableRoles(canGrantSuperAdmin).map(role => (
                              <DropdownMenuItem
                                key={role}
                                onClick={() => approveJoinRequest(r.id, role)}
                                className="cursor-pointer"
                              >
                                <span className={getRolePillClass(role)}>{role}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => denyJoinRequest(r.id)}
                          className="h-7 text-xs font-bold text-destructive hover:text-destructive hover:bg-destructive/10 border-border"
                        >
                          Deny
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {joinRequests.length === 0 && (
              <div className="py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-3">
                  <Icon name="userCheck" size={20} />
                </div>
                <div className="text-sm font-bold text-foreground">No pending join requests</div>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  There are no unreviewed auto-domain registration requests at this time.
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default OndiUsers;
