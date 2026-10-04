import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.js';
import { CheckboxRow } from '../../components/ui/list-item-row.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import type { EmpStatus, Employee } from '../../data/staffData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { MetricsRow, type MetricCardProps } from '../../components/MetricCard.js';
import { PersonLink } from '../../components/PersonLink.js';
import { Combobox } from '../../components/ui/combobox.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { showPrompt } from '../../lib/prompt.js';
import { Avatar, Badge, PageHeader, Card, TH, TD, Wrap, PrimaryBtn, ActionBtn } from './shared.js';
/* -- Sub-pages -- */

export function EmployeesPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [search,    setSearch]    = useState('');
  const [deptF,     setDeptF]     = useState('');
  const [statusF,   setStatusF]   = useState('');
  const [viewMode,  setViewMode]  = useState<'list' | 'grid'>('list');
  const [showOnboard, setShowOnboard] = useState(false);
  // Start empty and fill from /v1/hr/staff — never seed with the sample fixture,
  // which would flash fabricated names before (or instead of) the real roster.
  const [employees, setEmployees] = useState<Employee[]>([]);

  const loadEmployees = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/staff');
      setEmployees((Array.isArray(data) ? data : []).map((u: any): Employee => ({
        id: u.id, name: u.name, email: u.email, phone: u.phone || '',
        // Em dash, not 'Operations'/'Officer'. Those defaults gave every
        // unassigned person a department this tenant has never created and a
        // job title nobody gave them — indistinguishable, in the table, from
        // someone genuinely assigned to Operations.
        dept: u.dept || '—', designation: u.designation || '—',
        role: u.role, status: (u.status || 'ACTIVE') as EmpStatus,
        hireDate: u.hireDate || (u.created_at ? String(u.created_at).split('T')[0] : ''),
        // Dropped here previously, which is the last of the three places this
        // picture went missing: the query did not select it, the component
        // could not render it, and this mapper discarded it.
        avatarUrl: u.avatar_url ?? null,
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const depts = [...new Set(employees.map(e => e.dept).filter(d => d && d !== '—'))];
  // Real figures for the metrics row — no hardcoded "2 new / 4 roles / 1 pending".
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const hiredThisMonth = employees.filter(e => (e.hireDate || '').startsWith(thisMonth)).length;
  const roleCount = new Set(employees.map(e => e.role).filter(Boolean)).size;
  const onLeaveCount = employees.filter(e => e.status === 'ON_LEAVE').length;
  const inactiveCount = employees.filter(e => e.status === 'INACTIVE').length;
  const rows  = employees.filter(e =>
    (!search   || e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase())) &&
    (!deptF    || e.dept   === deptF) &&
    (!statusF  || e.status === statusF)
  );

  const STATUS_CHIPS = [
    { key: '',         label: 'All Members',  count: employees.length },
    { key: 'ACTIVE',   label: 'Active',        count: employees.filter(e => e.status === 'ACTIVE').length },
    { key: 'ON_LEAVE', label: 'On Leave',      count: employees.filter(e => e.status === 'ON_LEAVE').length },
    { key: 'INACTIVE', label: 'Inactive',      count: employees.filter(e => e.status === 'INACTIVE').length },
  ];

  const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
    Manager:      { bg: 'var(--purple-l)', color: 'var(--purple)' },
    Officer:      { bg: 'var(--teal-l)', color: 'var(--teal)' },
    Finance:      { bg: 'var(--green-l)', color: 'var(--green)' },
    'Tenant Admin': { bg: 'var(--purple-l)', color: 'var(--purple)' },
  };
  function roleColor(role: string) { return ROLE_COLORS[role] || { bg: 'var(--bg)', color: 'var(--ink3)' }; }
  function statusBar(s: EmpStatus) { return s === 'ACTIVE' ? 'var(--green)' : s === 'ON_LEAVE' ? 'var(--gold)' : 'var(--ink3)'; }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader icon="users" title="Manage Staff" sub={`${employees.filter(e => e.status === 'ACTIVE').length} active — ${employees.length} total`} backTo="/nexushr">
        <PrimaryBtn label="Invite User" icon="userPlus" onClick={() => setShowOnboard(true)} />
      </PageHeader>

      <MetricsRow cards={[
        { title: 'Total Staff',    value: String(employees.length),   sub1Label: 'ACTIVE',      sub1Value: String(employees.filter(e => e.status === 'ACTIVE').length), sub2Label: 'ON LEAVE',    sub2Value: String(onLeaveCount),   barHighlight: 'var(--blue)'  },
        { title: 'New This Month', value: String(hiredThisMonth),     sub1Label: 'DEPARTMENTS', sub1Value: String(depts.length),                                       sub2Label: 'ROLES',       sub2Value: String(roleCount),      barHighlight: 'var(--green)' },
        { title: 'Inactive',       value: String(inactiveCount),      sub1Label: 'ON LEAVE',    sub1Value: String(onLeaveCount),                                       sub2Label: 'DEPARTMENTS', sub2Value: String(depts.length),   barHighlight: 'var(--red)'   },
      ]} />

      {/* -- Toolbar -- */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Status chips */}
        <Tabs value={statusF} onValueChange={v => setStatusF(v as typeof statusF)} variant="segmented">
          <TabsList>
            {STATUS_CHIPS.map(chip => (
              <TabsTrigger key={chip.key} value={chip.key}>
                {chip.label}
                <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 'var(--r)', background: statusF === chip.key ? 'var(--teal-l)' : 'var(--border)', color: statusF === chip.key ? 'var(--teal)' : 'var(--ink3)' }}>{chip.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative', width: 260 }}>
          <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email—"
            style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' as const }} />
        </div>

        {/* Dept filter */}
        <Select value={deptF || '__all__'} onValueChange={v => setDeptF(v === '__all__' ? '' : v)}>
          <SelectTrigger style={{ width: 'auto', padding: '7px 10px', height: 'auto' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Departments</SelectItem>
            {depts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
          {(['list', 'grid'] as const).map(mode => (
            <button key={mode} type="button" title={mode === 'list' ? 'List view' : 'Card grid view'} onClick={() => setViewMode(mode)}
              style={{ padding: 'var(--ds-btn-py) 11px', border: 'none', cursor: 'pointer', background: viewMode === mode ? 'hsl(var(--primary))' : 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name={mode === 'list' ? 'list' : 'grid'} size={15} color={viewMode === mode ? 'hsl(var(--primary-foreground))' : 'var(--ink3)'} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
        Showing {rows.length} of {employees.length} members
      </div>

      {/* -- Grid View -- */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16, marginBottom: 16 }}>
          {rows.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--ink3)', fontSize: 14 }}>No staff match current filters.</div>}
          {rows.map(e => {
            const rCol = roleColor(e.role);
            return (
              <Link key={e.id} to={'/nexushr/staff/' + e.id} style={{ display: 'block', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ height: 3, background: statusBar(e.status) }} />
                <div style={{ padding: '18px 16px 12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    <Avatar name={e.name} size={60} userId={e.id} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginBottom: 2 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, marginBottom: 8 }}>{e.designation}</div>
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink3)', fontWeight: 600 }}>{e.dept}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 'var(--r-sm)', background: rCol.bg, color: rCol.color, fontWeight: 700 }}>{e.role}</span>
                    <Badge status={e.status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Icon name="mail" size={10} color="var(--ink3)" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{e.email}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Icon name="phone" size={10} color="var(--ink3)" />
                      {e.phone}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* -- List / Table View -- */
        <Wrap>
          <thead>
            <tr><TH>Employee</TH><TH>Department</TH><TH>Designation</TH><TH>Role</TH><TH>Hired</TH><TH>Status</TH></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No staff match current filters.</td></tr>}
            {rows.map(e => {
              const rCol = roleColor(e.role);
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => navigate('/nexushr/staff/' + e.id)}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = '')}>
                  <TD>
                    <Link to={'/nexushr/staff/' + e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                      <Avatar name={e.name} size={34} userId={e.id} />
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13 }}>{e.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{e.email}</div>
                      </div>
                    </Link>
                  </TD>
                  <TD muted>{e.dept}</TD>
                  <TD>{e.designation}</TD>
                  <TD><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-sm)', background: rCol.bg, color: rCol.color, fontWeight: 700 }}>{e.role}</span></TD>
                  <TD muted>{new Date(e.hireDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</TD>
                  <TD><Badge status={e.status} /></TD>
                </tr>
              );
            })}
          </tbody>
        </Wrap>
      )}

      {/* -- Invite / Onboard Modal -- */}
      <Dialog open={showOnboard} onOpenChange={o => { if (!o) setShowOnboard(false); }}>
        <DialogContent hideClose className="w-115 max-w-[90%] max-h-[90vh] overflow-y-auto gap-0" style={{ padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <DialogTitle style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Invite New Staff</DialogTitle>
              <button type="button" title="Close" onClick={() => setShowOnboard(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Icon name="x" size={20} color="var(--ink3)" /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 24px' }}>Sends an email invite. They'll set their own name and password when they accept.</p>

            <form onSubmit={async e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const email = fd.get('email') as string;
              const role = fd.get('role') as string;
              if (!email || !role) return;
              try {
                await apiFetch('/v1/hr/invitations', { method: 'POST', body: JSON.stringify({ email, role }) });
                setShowOnboard(false);
              } catch (error: any) { showAlert(error?.message || 'Could not send the invitation.', { variant: 'error' }); }
            }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Work Email</label>
                <input name="email" type="email" required placeholder="john@company.com" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxSizing: 'border-box' as const, fontFamily: 'var(--font)' }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>System Role</label>
                <Select name="role" required defaultValue="OFFICER">
                  <SelectTrigger style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OFFICER">Officer</SelectItem>
                    <SelectItem value="SENIOR">Senior Officer</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="FINANCE">Finance</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="TENANT_ADMIN">Tenant Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <Button type="button" variant="outline" onClick={() => setShowOnboard(false)}>Cancel</Button>
                <Button type="submit">Send Invite</Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --- Roles & Permissions (full implementation) ------------- */

const ROLE_META: Record<string, { color: string; bg: string; desc: string; label: string }> = {
  ADMIN:       { color:'var(--purple)', bg:'var(--purple-l)', label:'Admin',          desc:'Full access to all modules except super-admin settings' },
  MANAGER:     { color:'var(--blue)', bg:'var(--blue-l)', label:'Manager',        desc:'Manage teams, approve workflows, view all reports'      },
  FINANCE:     { color:'var(--green)', bg:'var(--green-l)', label:'Finance',        desc:'Finance module: invoices, payments, payroll, reports'   },
  SALES:       { color:'var(--gold)', bg:'var(--gold-l)', label:'Sales',          desc:'Sales pipeline, CRM, leads and customer management'     },
  SENIOR:      { color:'var(--blue)', bg:'var(--blue-l)', label:'Senior Officer', desc:'Senior ops: all shipments, clearance, docs'             },
  JUNIOR:      { color:'var(--ink3)', bg:'var(--bg)', label:'Junior Officer', desc:'Entry-level: assigned clearance tasks, limited access'  },
  OFFICER:     { color:'var(--ink3)', bg:'var(--bg)', label:'Officer',        desc:'Core operations: shipments, clearing, invoicing'        },
  TENANT_ADMIN:{ color:'var(--purple)', bg:'var(--purple-l)', label:'Tenant Admin',  desc:'Full tenant access including billing and settings'      },
};

const RESOURCE_LABELS: Record<string, string> = {
  shipments:'Shipments', clearance:'Customs & Clearance', finance:'Finance & Billing',
  hr:'HR & People', sales:'Sales', crm:'CRM & Customers',
  documents:'Documents', reports:'Reports & Analytics', settings:'System Settings',
};
const RESOURCES = Object.keys(RESOURCE_LABELS);
const ACTIONS   = ['view','create','edit','delete','approve','export'];
const ACTION_COLORS: Record<string,string> = {
  view:'var(--teal)', create:'var(--green)', edit:'var(--gold)',
  delete:'var(--red)', approve:'var(--purple)', export:'#0ea5e9',
};

interface PermRow { id?: string; role: string; resource: string; action: string; allowed: boolean }

export function RolesPage() {
  const navigate = useNavigate();
  const [perms,     setPerms]     = useState<PermRow[]>([]);
  const [userCounts,setUserCounts]= useState<Record<string,number>>({});
  const [selected,  setSelected]  = useState<string | null>(null); // selected role key
  const [saving,    setSaving]    = useState(false);
  const [dirty,     setDirty]     = useState(false);
  // Roles and Permission Matrix used to be two separate pages showing the
  // same /v1/permissions grid — one drill-into-a-role at a time, one every
  // role at once. Same data, same toggle/save, so they're one page with a
  // view switch now rather than two menu entries a tenant had to guess between.
  const [view,       setView]     = useState<'byRole' | 'matrix'>('byRole');
  const [filter,     setFilter]   = useState('');

  const load = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([
        apiFetch('/v1/permissions'),
        apiFetch('/v1/permissions/users-by-role'),
      ]);
      if (Array.isArray(p)) setPerms(p);
      if (Array.isArray(u)) {
        const m: Record<string,number> = {};
        u.forEach((r: any) => { m[r.role] = Number(r.count); });
        setUserCounts(m);
      }
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function isAllowed(role: string, resource: string, action: string) {
    return perms.find(p => p.role === role && p.resource === resource && p.action === action)?.allowed ?? false;
  }

  function toggle(role: string, resource: string, action: string) {
    setPerms(prev => {
      const exists = prev.find(p => p.role === role && p.resource === resource && p.action === action);
      if (exists) return prev.map(p => p.role === role && p.resource === resource && p.action === action ? { ...p, allowed: !p.allowed } : p);
      return [...prev, { role, resource, action, allowed: true }];
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/permissions', { method: 'PATCH', body: JSON.stringify({ permissions: perms }) });
      setDirty(false);
    } catch (err: any) {
      // PATCH /v1/permissions has always 410'd — this grid was never wired
      // to any real enforcement (see permissions.routes.ts's own comment).
      // Toggling a checkbox here used to look like it worked (no error, the
      // switch just stayed on screen) while nothing was ever actually
      // saved, which is worse than telling the person plainly.
      showAlert(err?.message || 'This permission grid is not connected to enforcement — use Ondi ▸ Roles & Access to manage real role permissions.', {
        title: 'Not saved', variant: 'warning',
      });
    }
    finally { setSaving(false); }
  }

  const roles = Object.entries(ROLE_META);
  const selMeta = selected ? ROLE_META[selected] : null;
  const displayRoles = Object.entries(ROLE_META).filter(([k]) => !['TENANT_ADMIN'].includes(k));
  const filteredRes  = RESOURCES.filter(r => !filter || RESOURCE_LABELS[r].toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader icon="shield" title="Roles & Permissions" sub="Manage access control for each role across all modules" backTo="/nexushr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tabs value={view} onValueChange={v => setView(v as typeof view)} variant="segmented">
            <TabsList>
              <TabsTrigger value="byRole">By role</TabsTrigger>
              <TabsTrigger value="matrix">Full matrix</TabsTrigger>
            </TabsList>
          </Tabs>
          {dirty && (
            <button type="button" onClick={save} disabled={saving}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 16px', borderRadius:'var(--r)', border:'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight:700, fontSize:13, fontFamily:'var(--font)', cursor:'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="save" size={14} color="hsl(var(--primary-foreground))" />{saving ? 'Saving—' : 'Save Changes'}
            </button>
          )}
        </div>
      </PageHeader>

      <div style={{ margin:'0 0 16px' }}>
        <Banner variant="warning">This grid is not connected to any enforcement — toggling a switch here has no effect. Manage real role permissions from <Link to="/ondi/roles" style={{ color:'var(--gold)', fontWeight:700, textDecoration:'underline' }}>Ondi ▸ Roles &amp; Access</Link>.</Banner>
      </div>

      {view === 'matrix' ? (
        <>
          {/* Filter */}
          <div style={{ marginBottom:16, maxWidth:340 }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter modules—"
              style={{ width:'100%', padding:'8px 12px', border:'1px solid var(--border)', borderRadius: 'var(--r)', fontSize:13, fontFamily:'var(--font)', color:'var(--ink)', background:'var(--white)', boxSizing:'border-box' as const }} />
          </div>

          <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', overflow:'hidden', marginBottom:24 }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--bg)' }}>
                    <th style={{ padding:'12px 16px', textAlign:'left', fontWeight:700, color:'var(--ink3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', position:'sticky', left:0, background:'var(--bg)', minWidth:160 }}>
                      Module / Action
                    </th>
                    {displayRoles.map(([key, meta]) => (
                      <th key={key} colSpan={ACTIONS.length}
                        style={{ padding:'10px 8px', textAlign:'center', borderBottom:'1px solid var(--border)', borderLeft:'2px solid var(--border)', background:meta.bg }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:meta.color }} />
                          <span style={{ fontSize:11, fontWeight:800, color:meta.color }}>{meta.label}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr style={{ background:'var(--white)' }}>
                    <th style={{ padding:'6px 16px', borderBottom:'1px solid var(--border)', position:'sticky', left:0, background:'var(--white)' }} />
                    {displayRoles.map(([key, meta]) =>
                      ACTIONS.map(a => (
                        <th key={`${key}-${a}`} style={{ padding:'5px 4px', textAlign:'center', borderBottom:'1px solid var(--border)', borderLeft: a === 'view' ? '2px solid var(--border)' : undefined }}>
                          <span style={{ fontSize:9, fontWeight:700, color:ACTION_COLORS[a], textTransform:'uppercase' }}>{a.slice(0,3)}</span>
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRes.map((res, ri) => (
                    <tr key={res} style={{ borderBottom:'1px solid var(--border)', background: ri % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                      <td style={{ padding:'10px 16px', fontWeight:600, color:'var(--ink)', fontSize:13, position:'sticky', left:0, background: ri % 2 === 0 ? 'var(--white)' : 'var(--bg)', whiteSpace:'nowrap' }}>
                        {RESOURCE_LABELS[res]}
                      </td>
                      {displayRoles.map(([key, meta]) =>
                        ACTIONS.map(a => {
                          const on = isAllowed(key, res, a);
                          return (
                            <td key={`${key}-${a}`} style={{ padding:'6px 4px', textAlign:'center', borderLeft: a === 'view' ? '2px solid var(--border)' : undefined }}>
                              <button type="button" onClick={() => toggle(key, res, a)}
                                style={{ width:20, height:20, borderRadius:'var(--r-sm)', border:`2px solid ${on ? meta.color : 'var(--border)'}`,
                                  background: on ? meta.color : 'transparent', cursor:'pointer',
                                  display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all 0.1s' }}>
                                {on && <Icon name="check" size={10} color="#fff" />}
                              </button>
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom: 24 }}>
            {ACTIONS.map(a => (
              <div key={a} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:12, height:12, borderRadius: 'var(--r-sm)', background:ACTION_COLORS[a] }} />
                <span style={{ fontSize:12, color:'var(--ink2)', fontWeight:600 }}>{a.charAt(0).toUpperCase() + a.slice(1)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
      <>
      {/* Role cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16, marginBottom:28 }}>
        {roles.map(([key, meta]) => {
          const allowed = perms.filter(p => p.role === key && p.allowed).length;
          const total   = RESOURCES.length * ACTIONS.length;
          const pct     = total > 0 ? Math.round((allowed / total) * 100) : 0;
          const isActive = selected === key;
          return (
            <div key={key} onClick={() => setSelected(isActive ? null : key)}
              role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(isActive ? null : key); } }}
              style={{ background:'var(--white)', borderRadius: 'var(--r)', border:`2px solid ${isActive ? meta.color : 'var(--border)'}`,
                padding:20, cursor:'pointer', transition:'all 0.15s',
                boxShadow: isActive ? '0 4px 20px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ width:44, height:44, borderRadius: 'var(--r)', background:meta.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name="shield" size={22} color={meta.color} strokeWidth={1.8} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:14, color:'var(--ink)' }}>{meta.label}</div>
                  <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>
                    {userCounts[key] ?? 0} {(userCounts[key] ?? 0) === 1 ? 'user' : 'users'}
                  </div>
                </div>
                {isActive && <Icon name="check" size={16} color={meta.color} />}
              </div>
              <p style={{ fontSize:12, color:'var(--ink3)', margin:'0 0 12px', lineHeight:1.5 }}>{meta.desc}</p>
              <div style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:11, color:'var(--ink3)' }}>Access level</span>
                  <span style={{ fontSize:11, fontWeight:700, color:meta.color }}>{pct}%</span>
                </div>
                <div style={{ height:5, borderRadius: 'var(--r-sm)', background:'var(--border)' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:meta.color, borderRadius: 'var(--r-sm)', transition:'width 0.5s' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {RESOURCES.slice(0,4).map(r => {
                  const hasView = isAllowed(key, r, 'view');
                  return (
                    <span key={r} style={{ fontSize:10, padding:'2px 7px', borderRadius: 'var(--r-sm)', fontWeight:600,
                      background: hasView ? meta.bg : 'var(--bg)',
                      color: hasView ? meta.color : 'var(--ink3)' }}>
                      {RESOURCE_LABELS[r]}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Permission matrix for selected role */}
      {selected && selMeta && (
        <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:`1px solid var(--border)`, overflow:'hidden', marginBottom:24 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12,
            background: selMeta.bg }}>
            <div style={{ width:34, height:34, borderRadius: 'var(--r)', background:selMeta.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon name="shield" size={17} color={selMeta.color} />
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--ink)' }}>{selMeta.label} — Permission Matrix</div>
              <div style={{ fontSize:11.5, color:'var(--ink3)' }}>Click checkboxes to grant or revoke access. Save when done.</div>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:700, color:'var(--ink3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', width:180 }}>Module</th>
                  {ACTIONS.map(a => (
                    <th key={a} style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:ACTION_COLORS[a], fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)' }}>
                      {a}
                    </th>
                  ))}
                  <th style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:'var(--ink3)', fontSize:11, borderBottom:'1px solid var(--border)' }}>All</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((res, ri) => {
                  const allOn = ACTIONS.every(a => isAllowed(selected, res, a));
                  return (
                    <tr key={res} style={{ borderBottom:'1px solid var(--border)', background: ri % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                      <td style={{ padding:'10px 16px', fontWeight:600, color:'var(--ink)', fontSize:13 }}>
                        {RESOURCE_LABELS[res]}
                      </td>
                      {ACTIONS.map(a => {
                        const on = isAllowed(selected, res, a);
                        return (
                          <td key={a} style={{ padding:'8px 12px', textAlign:'center' }}>
                            <button type="button" onClick={() => toggle(selected, res, a)}
                              style={{ width:22, height:22, borderRadius:'var(--r-sm)', border:`2px solid ${on ? selMeta.color : 'var(--border)'}`,
                                background: on ? selMeta.color : 'transparent', cursor:'pointer',
                                display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all 0.12s' }}>
                              {on && <Icon name="check" size={11} color="#fff" />}
                            </button>
                          </td>
                        );
                      })}
                      <td style={{ padding:'8px 12px', textAlign:'center' }}>
                        <button type="button" onClick={() => ACTIONS.forEach(a => {
                          const on = isAllowed(selected, res, a);
                          if (on !== !allOn) toggle(selected, res, a);
                        })}
                          style={{ fontSize:11, fontWeight:700, padding:'var(--ds-btn-py-xs) 8px', borderRadius:'var(--r)', border:'none', cursor:'pointer',
                            background: allOn ? selMeta.bg : 'var(--bg)', color: allOn ? selMeta.color : 'var(--ink3)', fontFamily:'var(--font)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                          {allOn ? 'Revoke all' : 'Grant all'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users table */}
      <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', overflow:'hidden' }}>
        <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Staff by Role</span>
          <Link to="/nexushr/employees"
            style={{ fontSize:11, fontWeight:600, color:'var(--teal)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font)', textDecoration:'none' }}>
            Manage Staff ?
          </Link>
        </div>
        <div style={{ padding:'8px 0' }}>
          {roles.map(([key, meta]) => {
            const count = userCounts[key] ?? 0;
            if (count === 0) return null;
            const pct = Math.round((count / Math.max(1, Object.values(userCounts).reduce((a,b) => a+b, 0))) * 100);
            return (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:14, padding:'9px 18px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:32, height:32, borderRadius: 'var(--r)', background:meta.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name="shield" size={15} color={meta.color} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:3 }}>{meta.label}</div>
                  <div style={{ height:4, borderRadius: 'var(--r-sm)', background:'var(--border)' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:meta.color, borderRadius: 'var(--r-sm)'}} />
                  </div>
                </div>
                <span style={{ fontSize:13, fontWeight:800, color:meta.color, minWidth:24, textAlign:'right' }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}

      {/* eSign stamp access — a separate role allow-list (tenant_settings,
          not this page's own resource×action grid above: 'stamp' has no
          natural fit among shipments/clearance/finance/hr/sales/crm/
          documents/reports/settings, and extending that shared grid for one
          feature's own gate was judged riskier than it's worth). Lives here
          because this is where a tenant actually looks for "who can do X",
          not buried in a settings page unrelated to permissions. */}
      <StampAccessCard />
      <StampRequestsCard />
    </div>
  );
}

const STAMP_ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'];

function StampAccessCard() {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/v1/sign/stamps/access').then(r => setRoles(r.stampRoles)).catch(() => setRoles(STAMP_ROLE_OPTIONS));
  }, []);

  async function toggle(role: string, on: boolean) {
    if (!roles) return;
    const next = on ? [...roles, role] : roles.filter(r => r !== role);
    if (!next.length) return; // at least one role must keep access
    setRoles(next);
    setSaving(true);
    try { await apiFetch('/v1/sign/stamps/access', { method: 'PUT', body: JSON.stringify({ stamp_roles: next }) }); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', padding:20, marginTop:24 }}>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Who can apply the eSign stamp</div>
      <div style={{ fontSize:12.5, color:'var(--ink3)', marginBottom:14 }}>
        Only these roles can apply the company stamp directly (Hudumika eSign, and any other app using the shared stamp API). Anyone else sees a "Request stamping" option instead, which tags a real person below to approve it.
      </div>
      {roles === null ? (
        <SectionLoading />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {STAMP_ROLE_OPTIONS.map(role => (
            <CheckboxRow key={role} title={role.replace('_', ' ')} checked={roles.includes(role)}
              onCheckedChange={c => toggle(role, c)} disabled={saving} />
          ))}
        </div>
      )}
    </div>
  );
}

function StampRequestsCard() {
  const [requests, setRequests] = useState<Array<{ id: string; note: string | null; target_ref: string | null; status: string; created_at: string }> | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch('/v1/sign/stamp-requests?box=incoming').then(setRequests).catch(() => setRequests([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: 'approved' | 'declined') {
    setDeciding(id);
    try {
      await apiFetch(`/v1/sign/stamp-requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      load();
    } finally {
      setDeciding(null);
    }
  }

  const pending = (requests ?? []).filter(r => r.status === 'pending');

  return (
    <div style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', padding:20, marginTop:16 }}>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Stamp requests</div>
      <div style={{ fontSize:12.5, color:'var(--ink3)', marginBottom:14 }}>People without direct stamp access who have tagged you as their approver.</div>
      {requests === null ? (
        <SectionLoading />
      ) : pending.length === 0 ? (
        <div style={{ color:'var(--ink3)', fontSize:13 }}>No pending requests.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {pending.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', border:'1px solid var(--border)', borderRadius: 'var(--r)'}}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, color:'var(--ink)' }}>{r.note || r.target_ref || 'Stamp requested'}</div>
                <div style={{ fontSize:11.5, color:'var(--ink3)' }}>{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <Button variant="outline" size="xs" disabled={deciding === r.id} onClick={() => decide(r.id, 'declined')}
                style={{ borderColor:'var(--red)', color:'var(--red)' }}>Decline</Button>
              <Button variant="default" size="xs" disabled={deciding === r.id} onClick={() => decide(r.id, 'approved')}>Approve</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type DeleteReqRow = { id: string; user_name: string; user_email: string; requested_by_name: string; reason: string | null; status: string; created_at: string };

export function DeleteRequestsPage() {
  const [reqs, setReqs] = useState<DeleteReqRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { setReqs(await apiFetch('/v1/hr/delete-requests')); } catch (error: any) { showAlert(error?.message || 'Could not load deletion requests.', { variant: 'error' }); }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch (error: any) { showAlert(error?.message || 'Could not load staff.'); }
  }, []);
  useEffect(() => { load(); loadStaff(); }, [load, loadStaff]);

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    try { await apiFetch(`/v1/hr/delete-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); } catch (error: any) { showAlert(error?.message || 'Could not update the deletion request.', { variant: 'error' }); }
  }

  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="userMinus" title="Delete Requests" sub="User account deletion requests pending review" backTo="/nexushr">
        <PrimaryBtn label="New Request" icon="plus" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const userId = fd.get('user_id') as string;
            const reason = fd.get('reason') as string;
            if (!userId) return;
            try {
              await apiFetch('/v1/hr/delete-requests', { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) });
              setShowNew(false); load();
            } catch (error: any) { showAlert(error?.message || 'Could not submit the deletion request.', { variant: 'error' }); }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Staff Member</label>
              <Select name="user_id" required>
                <SelectTrigger style={{ width: 220 }}><SelectValue placeholder="-- Select --" /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Reason</label>
              <input name="reason" placeholder="e.g. Resigned from company" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <PrimaryBtn label="Submit Request" type="submit" />
          </form>
        </Card>
      )}

      <Wrap>
        <thead><tr><TH>User</TH><TH>Email</TH><TH>Requested By</TH><TH>Reason</TH><TH>Status</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {reqs.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>No delete requests.</td></tr>}
          {reqs.map(r => (
            <tr key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD bold>{r.user_name}</TD>
              <TD muted>{r.user_email}</TD>
              <TD muted>{r.requested_by_name}</TD>
              <TD muted>{r.reason || '-'}</TD>
              <TD><Badge status={r.status} /></TD>
              <TD right>{r.status==='PENDING' && <><ActionBtn label="Approve" color="var(--green)" onClick={() => decide(r.id, 'APPROVED')} /><ActionBtn label="Reject" color="var(--red)" onClick={() => decide(r.id, 'REJECTED')} /></>}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type DeptRow = { id?: string; name: string; head: string; head_user_id?: string | null; employees: number; status: string };

function DeptForm({ staff, initial, onCancel, onSubmit }: {
  staff: Employee[]; initial?: DeptRow; onCancel: () => void; onSubmit: (v: { name: string; head_user_id: string; status: string }) => void;
}) {
  return (
    <Card>
      <form onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const headId = fd.get('head_user_id') as string;
        onSubmit({ name: fd.get('name') as string, head_user_id: headId === '__none__' ? '' : headId, status: fd.get('status') as string });
      }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Department Name</label>
          <input name="name" required defaultValue={initial?.name} placeholder="e.g. Operations" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Head</label>
          <Select name="head_user_id" defaultValue={initial?.head_user_id || '__none__'}>
            <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- None --</SelectItem>
              {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Status</label>
          <Select name="status" defaultValue={initial?.status || 'ACTIVE'}>
            <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PrimaryBtn label={initial ? 'Save' : 'Create'} type="submit" />
        <ActionBtn label="Cancel" onClick={onCancel} />
      </form>
    </Card>
  );
}

export function DepartmentsPage() {
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<DeptRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/departments');
      const data = Array.isArray(res) ? res : [];
      setDepts(data.map((d: any) => ({
        id: d.id, name: d.name, head: d.head_name || '-', head_user_id: d.head_user_id,
        employees: d.employee_count || 0, status: d.status || 'ACTIVE',
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch { /* keep empty */ }
  }, []);
  useEffect(() => { load(); loadStaff(); }, [load, loadStaff]);

  async function create(v: { name: string; head_user_id: string; status: string }) {
    try {
      await apiFetch('/v1/hr/departments', { method: 'POST', body: JSON.stringify({ name: v.name, head_user_id: v.head_user_id || null, status: v.status }) });
      setShowNew(false); load();
    } catch (error: any) { showAlert(error?.message || 'Could not create department.'); }
  }
  async function save(id: string, v: { name: string; head_user_id: string; status: string }) {
    try {
      await apiFetch(`/v1/hr/departments/${id}`, { method: 'PATCH', body: JSON.stringify({ name: v.name, head_user_id: v.head_user_id || null, status: v.status }) });
      setEditing(null); load();
    } catch (error: any) { showAlert(error?.message || 'Could not update department.'); }
  }
  async function remove(d: DeptRow) {
    if (!(await showConfirm(`Delete the "${d.name}" department?`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await apiFetch(`/v1/hr/departments/${d.id}`, { method: 'DELETE' }); load(); }
    catch (error: any) { showAlert(error?.message || 'Could not delete the department.'); }
  }

  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="building" title="Company Departments" sub="Organisational departments and their leads" backTo="/nexushr">
        <PrimaryBtn label="Add Department" icon="plus" onClick={() => { setEditing(null); setShowNew(v => !v); }} />
      </PageHeader>

      {showNew && <DeptForm staff={staff} onCancel={() => setShowNew(false)} onSubmit={create} />}
      {editing && <DeptForm staff={staff} initial={editing} onCancel={() => setEditing(null)} onSubmit={v => save(editing.id!, v)} />}

      <Wrap>
        <thead><tr><TH>Department</TH><TH>Head</TH><TH right>Employees</TH><TH>Status</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {depts.map(d => (
            <tr key={d.id ?? d.name} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD bold>{d.name}</TD>
              <TD>{d.head === '-' ? <span style={{ color:'var(--ink3)' }}>—</span> : <div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={d.head} size={24} />{d.head}</div>}</TD>
              <TD right bold>{d.employees}</TD>
              <TD><Badge status={d.status} /></TD>
              <TD right>{d.id && <><ActionBtn label="Edit" onClick={() => { setShowNew(false); setEditing(d); }} /><ActionBtn label="Delete" color="var(--red)" onClick={() => remove(d)} /></>}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type TeamRow = { id: string; name: string; lead_user_id: string | null; lead_name: string | null; members: { user_id: string; user_name: string }[] };

export function TeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTeams(await apiFetch('/v1/hr/teams')); } catch (error: any) { showAlert(error?.message || 'Could not load teams.'); }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch (error: any) { showAlert(error?.message || 'Could not load staff.'); }
  }, []);
  useEffect(() => { load(); loadStaff(); }, [load, loadStaff]);

  async function addMember(teamId: string, userId: string) {
    if (!userId) return;
    try { await apiFetch(`/v1/hr/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }); setAddingTo(null); load(); } catch (error: any) { showAlert(error?.message || 'Could not add team member.'); }
  }
  async function removeMember(teamId: string, userId: string) {
    try { await apiFetch(`/v1/hr/teams/${teamId}/members/${userId}`, { method: 'DELETE' }); load(); } catch (error: any) { showAlert(error?.message || 'Could not remove team member.'); }
  }
  async function renameTeam(t: TeamRow) {
    const name = await showPrompt('Team name', { title: 'Rename team', defaultValue: t.name, confirmLabel: 'Rename', required: true });
    if (name === null || !name.trim() || name.trim() === t.name) return;
    try { await apiFetch(`/v1/hr/teams/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }); load(); }
    catch (error: any) { showAlert(error?.message || 'Could not rename the team.'); }
  }
  async function deleteTeam(t: TeamRow) {
    if (!(await showConfirm(`Delete the "${t.name}" team? Its ${t.members.length} member${t.members.length !== 1 ? 's' : ''} stay on staff; only the grouping is removed.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try { await apiFetch(`/v1/hr/teams/${t.id}`, { method: 'DELETE' }); load(); }
    catch (error: any) { showAlert(error?.message || 'Could not delete the team.'); }
  }

  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="users" title="Working Teams" sub="Cross-functional working groups and project teams" backTo="/nexushr">
        <PrimaryBtn label="Create Team" icon="plus" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = fd.get('name') as string;
            const leadIdRaw = fd.get('lead_user_id') as string;
            const leadId = leadIdRaw === '__none__' ? '' : leadIdRaw;
            if (!name) return;
            try {
              await apiFetch('/v1/hr/teams', { method: 'POST', body: JSON.stringify({ name, lead_user_id: leadId || null }) });
              setShowNew(false); load();
            } catch (error: any) { showAlert(error?.message || 'Could not create the team.', { variant: 'error' }); }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Team Name</label>
              <input name="name" required placeholder="e.g. Finance Team" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Team Lead</label>
              <Select name="lead_user_id" defaultValue="__none__">
                <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <PrimaryBtn label="Create" type="submit" />
          </form>
        </Card>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
        {teams.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 32, color: 'var(--ink3)' }}>No teams yet.</div>}
        {teams.map(t => (
          <div key={t.id} style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', padding:18 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)', marginBottom:4 }}>{t.name}</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:12 }}>Lead: {t.lead_name || '—'} — {t.members.length} member{t.members.length!==1?'s':''}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
              {t.members.map(m => (
                <div key={m.user_id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <PersonLink userId={m.user_id} name={m.user_name} size={22} style={{ flex:1 }} />
                  <button type="button" title="Remove" onClick={() => removeMember(t.id, m.user_id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)' }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
            {addingTo === t.id ? (
              <Combobox
                options={staff.filter(s => !t.members.some(m => m.user_id === s.id)).map(s => ({ value: s.id, label: s.name }))}
                value="" onChange={v => v && addMember(t.id, v)}
                placeholder="-- Select staff to add --"
              />
            ) : (
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                <ActionBtn label="Add Member" onClick={() => setAddingTo(t.id)} />
                <ActionBtn label="Rename" onClick={() => renameTeam(t)} />
                <ActionBtn label="Delete" color="var(--red)" onClick={() => deleteTeam(t)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type ActivityRow = { id: string; user_name: string | null; action: string; module: string; created_at: string };

export function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  // A swallowed failure here rendered "No activity recorded yet", which is a
  // different claim from "we could not load it" — and for three years this
  // module returned 403 to SUPER_ADMIN while showing exactly that empty state.
  const [err, setErr] = useState('');
  useEffect(() => { apiFetch('/v1/hr/activity-log').then(setLogs).catch((e: any) => setErr(e?.message ?? 'Could not load activity.')); }, []);

  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="activity" title="User Activity Logs" sub="Recent actions taken through the HR module" backTo="/nexushr" />
      <Wrap>
        <thead><tr><TH>User</TH><TH>Action</TH><TH>Module</TH><TH>Time</TH></tr></thead>
        <tbody>
          {logs.length === 0 && <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: err ? 'var(--red)' : 'var(--ink3)' }}>{err || 'No activity recorded yet.'}</td></tr>}
          {logs.map(l => (
            <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={l.user_name || '?'} size={24} />{l.user_name || 'Unknown'}</div></TD>
              <TD>{l.action}</TD>
              <TD><span style={{ fontSize:11, padding:'2px 8px', borderRadius: 'var(--r-sm)', background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink2)' }}>{l.module}</span></TD>
              <TD muted>{new Date(l.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}