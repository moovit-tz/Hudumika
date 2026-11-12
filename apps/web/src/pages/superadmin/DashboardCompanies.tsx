import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { useAuth } from '../../hooks/useAuth.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SlidersHorizontal, X } from 'lucide-react';
import { Switch } from '../../components/ui/switch.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from '../../components/ui/dialog.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Badge as UiBadge } from '../../components/ui/badge.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { type FinanceCapabilitySummary, type FinanceConfiguration } from '@hudumika/types';
import {
  Badge, CoAv, PLAN_CFG, CO_CFG, TX_CFG,
  type Company, type Subscription, type Package, type Addon, type Domain, type Transaction,
  type PlanId, type CoStatus, type TxStatus,
  COMPANIES, SUBSCRIPTIONS,
  mapAddonFromApi, fmtCurrency, fmtDate, avColor, coByID,
  Spark, BarChart, DonutChart, KPICard, PageHdr,
  DataTable, useSortState, sortedRows, TR, TD, ActBtn,
} from './shared.js';
export function DashboardView() {
  const isMobile = useIsMobile();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/v1/superadmin/dashboard-stats')
      .then(res => {
        setStats(res);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading dashboard statistics…</div>;
  if (error || !stats) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Error loading dashboard stats. Check server connection.</div>;

  const { kpis, planDist, spark, monthlyRev, transactions, platformInsights } = stats;
  // Below two months of history a sparkline is a straight line, so the cards
  // show the number and say why there is no trend beside it.
  const noHistory = (stats.monthsWithData ?? 0) < 2 ? 'not enough history yet' : undefined;

  return (
    <div>
      <PageHdr title="Super Admin Dashboard" sub="Platform overview — all companies, revenue and activity at a glance" />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Total Companies"    value={String(kpis.totalCompanies)}       icon="building"   color="var(--teal)"   spark={spark.companies}   emptyHint={noHistory} />
        <KPICard title="Active Companies"   value={String(kpis.activeCompanies)}      icon="check"      color="var(--teal)"  spark={spark.active}      emptyHint={noHistory} />
        <KPICard title="Total Subscribers"  value={`${kpis.totalSubscribers} users`}  icon="users"      color="var(--teal)" spark={spark.subscribers} emptyHint={noHistory} />
        {/* Money received, not a list-price run-rate — the run-rate estimate is
            the smaller figure and was previously the one shown as "earnings". */}
        <KPICard title="Revenue Collected"  value={fmtCurrency(kpis.collectedRevenue ?? 0)} icon="dollarSign" color="var(--teal)" spark={spark.earnings}
                 hint={`${fmtCurrency(kpis.totalEarnings)} list-price run rate`} />
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 280px', gap:16, marginBottom:24 }}>
        {/* Monthly revenue bar */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Monthly Revenue</div>
              <div style={{ fontSize:11, color:'var(--ink3)' }}>Payments received, last 6 months</div>
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--teal)', letterSpacing:'-0.02em' }}>{fmtCurrency(kpis.collectedRevenue ?? 0)}</div>
          </div>
          <BarChart data={monthlyRev} color="var(--teal)" />
        </div>

        {/* Company growth */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Company Growth</div>
              <div style={{ fontSize:11, color:'var(--ink3)' }}>Registrations per month</div>
            </div>
            {/* The "+6% MoM" badge that used to sit here was a literal. There is
                no month-on-month figure to show until there are two months. */}
            <span style={{ fontSize:12, fontWeight:700, color:'var(--ink2)' }}>
              {(stats.companyGrowth ?? []).reduce((s: number, m: any) => s + m.value, 0)} in 6 months
            </span>
          </div>
          <BarChart data={stats.companyGrowth ?? []} color="var(--teal)" />
        </div>

        {/* Plans donut */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Plan Distribution</div>
          <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:16 }}>Active subscriptions</div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <DonutChart segments={planDist} />
            <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:6 }}>
              {planDist.map((p: any)=>(
                <div key={p.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:99, background:p.color, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:'var(--ink2)' }}>{p.label}</span>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:16 }}>
        {/* Recent transactions */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:14 }}>Recent Transactions</div>
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {transactions.length === 0 && (
              <div style={{ fontSize:12, color:'var(--ink3)', padding:'14px 0' }}>No payments recorded yet.</div>
            )}
            {/* companyName comes from the join on tenants. This used to call
                coByID(), which searches the mock COMPANIES array — a real
                tenant id never matched, so every row read "Unknown Company". */}
            {transactions.map((tx: any)=>{
              const txcfg = TX_CFG[tx.status as TxStatus] || TX_CFG.completed;
              return (
                <div key={tx.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{tx.companyName || 'Deleted company'}</div>
                    <div style={{ fontSize:11, color:'var(--ink3)' }}>{tx.txRef}{tx.payerName ? ` · ${tx.payerName}` : ''}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{fmtCurrency(tx.amount)}</div>
                    <Badge cfg={txcfg} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* "Upcoming Renewals" used to live here, built by claiming every tenant
            renews in exactly 30 days. `tenants` has no expiry or renewal column
            and there is no subscriptions table, so there is nothing to show —
            the panel is gone rather than filled with a date nobody committed to.
            Rollup cards for the two domain "Insights" layers relocated out of
            this shell (Decompose SuperAdmin M1/M3) take the slot instead — a
            real number, linking straight to where the detail now lives. */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:14 }}>Platform Insights</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <Link to="/lens" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:'var(--r)', border:'1px solid var(--border)', textDecoration:'none', color:'inherit' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Icon name="alertCircle" size={16} color={platformInsights.lens.critical > 0 ? 'var(--red)' : 'var(--ink3)'} />
                <div>
                  <div style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>Lens — open engineering items</div>
                  <div style={{ fontSize:11, color:'var(--ink3)' }}>
                    {platformInsights.lens.critical > 0 ? `${platformInsights.lens.critical} critical · ` : ''}across every part of the platform
                  </div>
                </div>
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--ink)' }}>{platformInsights.lens.openTotal}</div>
            </Link>
            <Link to="/nexushr/platform-devices" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:'var(--r)', border:'1px solid var(--border)', textDecoration:'none', color:'inherit' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Icon name="fingerprint" size={16} color={platformInsights.devices.error > 0 ? 'var(--red)' : 'var(--ink3)'} />
                <div>
                  <div style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>Attendance devices — all tenants</div>
                  <div style={{ fontSize:11, color:'var(--ink3)' }}>
                    {platformInsights.devices.online} online · {platformInsights.devices.offline} offline
                    {platformInsights.devices.error > 0 ? ` · ${platformInsights.devices.error} error` : ''}
                  </div>
                </div>
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--ink)' }}>{platformInsights.devices.total}</div>
            </Link>
            <div style={{ fontSize:11, color:'var(--ink3)', textAlign:'center' }}>
              Filterable, exportable detail for devices is in <Link to="/hudubi/reports" style={{ color:'var(--teal)', fontWeight:600 }}>HuduBI Reports</Link> — "Attendance devices by status".
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   COMPANIES VIEW
══════════════════════════════════════════════════ */
interface ApiTenant { id:string; name:string; slug:string; plan:string; active:boolean; created_at:string; logo_url?:string; primary_color?:string; users?:number; founder_personal_email_domain?:string|null; }
interface CoForm { name:string; email:string; phone:string; plan:PlanId; owner:string; country:string; }
const CO_FORM_DEFAULT: CoForm = { name:'', email:'', phone:'', plan:'starter', owner:'', country:'Tanzania' };

// Each row already has a real checkbox + name — a different dot colour per
// app added nothing but visual noise, since the checkbox state (not colour)
// is what carries the actual information here.
const TENANT_APPS: { id: string; name: string }[] = [
  { id: 'clearos',   name: 'ClearOS' },
  { id: 'finops',    name: 'FinOps' },
  { id: 'nexushr',     name: 'NexusHR' },
  { id: 'bliss',     name: 'Bliss' },
  { id: 'complyos',  name: 'ComplyOS' },
  { id: 'crm',       name: 'CRM' },
  { id: 'cloud',     name: 'Cloud' },
  { id: 'email',     name: 'Email' },
  { id: 'contacts',  name: 'Contacts' },
  { id: 'ai',        name: 'AI' },
  { id: 'store',     name: 'Store' },
  { id: 'ondi',      name: 'Ondi' },
  { id: 'tracking',  name: 'Tracking' },
  { id: 'workspace', name: 'Admin' },
  { id: 'demurrage',     name: 'Demurrage' },
  { id: 'cargotracker',  name: 'CargoTracker' },
  { id: 'petti',         name: 'Petti' },
  { id: 'notes',         name: 'Notes' },
  { id: 'sign',          name: 'eSign' },
  { id: 'sms',           name: 'SMS' },
];

interface TenantCustomer {
  id: string; name: string; email: string | null; phone: string | null; phone_wa: string | null;
  account_status: string; active: boolean; created_at: string;
}

interface TenantFinanceOverview {
  capabilitySummary: FinanceCapabilitySummary;
  configuration: FinanceConfiguration;
}

export function CompaniesView() {
  const isMobile = useIsMobile();
  const { impersonate, impersonateCustomer } = useAuth();
  const [impersonating, setImpersonating] = useState<string|null>(null);
  const [tenants, setTenants]     = useState<ApiTenant[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [apiError, setApiError]   = useState(false);
  const [search, setSearch]       = useState('');
  const [planFilter, setPlanFilter] = useState<PlanId|'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'inactive'>('all');
  const [compactRows, setCompactRows] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<CoForm>(CO_FORM_DEFAULT);
  const [editForm, setEditForm] = useState<CoForm>(CO_FORM_DEFAULT);
  const [selectedCoId, setSelectedCoId] = useState<string|null>(null);
  const [editEnabledApps, setEditEnabledApps] = useState<Record<string, boolean>>({});
  const [addonsCatalog, setAddonsCatalog] = useState<Addon[]>([]);
  const [editAddonGrants, setEditAddonGrants] = useState<Record<string, boolean>>({});
  const [editFinance, setEditFinance] = useState<TenantFinanceOverview | null>(null);
  const [editFinanceLoading, setEditFinanceLoading] = useState(false);

  useEffect(() => {
    apiFetch('/v1/addons').then(res => setAddonsCatalog((res.data as any[]).map(mapAddonFromApi))).catch(() => {});
  }, []);

  const [deleteTarget, setDeleteTarget] = useState<Company|null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [customersCo, setCustomersCo] = useState<Company|null>(null);
  const [tenantCustomers, setTenantCustomers] = useState<TenantCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [impersonatingCustomerId, setImpersonatingCustomerId] = useState<string|null>(null);
  const [resyncingCloud, setResyncingCloud] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [coPage, setCoPage] = useState(1);
  const [coPageSize, setCoPageSize] = useState(25);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/superadmin/tenants');
      const list: ApiTenant[] = Array.isArray(res) ? res : (res.data ?? []);
      setTenants(list);
      setApiLoaded(true);
      setApiError(false);
    } catch {
      setApiError(true);
      setApiLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = useMemo(() => {
    if (apiError) return COMPANIES;
    return tenants.map(t => {
      const mock = COMPANIES.find(c => c.name === t.name) ?? null;
      return {
        id:      t.id,
        name:    t.name,
        email:   mock?.email  ?? `admin@${t.slug}.co`,
        phone:   mock?.phone  ?? '',
        plan:    (PLAN_CFG[t.plan as PlanId] ? t.plan : 'starter') as PlanId,
        users:   t.users ?? mock?.users ?? 1,
        status:  (t.active ? 'active' : 'inactive') as CoStatus,
        domain:  mock?.domain ?? `${t.slug}.clearos.app`,
        created: t.created_at?.slice(0,10) ?? new Date().toISOString().slice(0,10),
        owner:   mock?.owner  ?? 'Admin',
        country: mock?.country ?? 'Tanzania',
        color:   t.primary_color ?? avColor(t.name),
        logoUrl: t.logo_url,
        founderPersonalEmailDomain: t.founder_personal_email_domain ?? null,
      } satisfies Company;
    });
  }, [tenants, apiError]);

  const filtered = useMemo(() =>
    displayed.filter(c => {
      if (planFilter   !== 'all' && c.plan   !== planFilter)   return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  [displayed, search, planFilter, statusFilter]);

  // Reset selection and page when filters change
  useEffect(() => { setSelected(new Set()); setCoPage(1); }, [search, planFilter, statusFilter]);

  const { sortBy: coSortBy, sortDir: coSortDir, handleSort: coHandleSort } = useSortState();
  const coAccessor = (col: string, c: Company) => ({
    'Company': c.name, 'Contact': c.email, 'Plan': c.plan,
    'Users': c.users, 'Status': c.status, 'Domain': c.domain, 'Created': c.created,
  }[col]);

  const paginated = useMemo(() => {
    const sorted = sortedRows(filtered, coSortBy, coSortDir, coAccessor);
    return sorted.slice((coPage - 1) * coPageSize, coPage * coPageSize);
  }, [filtered, coPage, coPageSize, coSortBy, coSortDir]);

  function exportCompanies() {
    const rows = selected.size > 0 ? filtered.filter(c => selected.has(c.id)) : filtered;
    const header = ['Name','Email','Phone','Plan','Users','Status','Domain','Country','Created'];
    const lines = [header.join(','), ...rows.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.phone}"`,
      c.plan,
      c.users,
      c.status,
      `"${c.domain}"`,
      `"${c.country}"`,
      c.created,
    ].join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `companies-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImpersonate(co: Company) {
    setImpersonating(co.id);
    try {
      await impersonate(co.id);
    } catch (err: any) {
      setImpersonating(null);
      showAlert(`Login As failed: ${err?.message ?? 'No active admin found for this company.'}`);
    }
  }

  async function openCustomers(co: Company) {
    setCustomersCo(co);
    setLoadingCustomers(true);
    try {
      const res = await apiFetch(`/v1/superadmin/tenants/${co.id}/customers`);
      setTenantCustomers(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setTenantCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }

  async function handleImpersonateCustomer(customer: TenantCustomer) {
    setImpersonatingCustomerId(customer.id);
    try {
      await impersonateCustomer(customer.id);
    } catch (err: any) {
      setImpersonatingCustomerId(null);
      showAlert(`Login As Customer failed: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function handleResyncCloudLinks() {
    if (!customersCo || resyncingCloud) return;
    setResyncingCloud(true);
    try {
      const res = await apiFetch(`/v1/superadmin/tenants/${customersCo.id}/resync-cloud-links`, { method: 'POST' });
      showAlert(`Retagged ${res.customersTagged} customer folder(s) and ${res.shipmentsTagged} shipment folder(s).`, { title: 'Cloud links resynced', variant: 'success' });
    } catch (err: any) {
      showAlert(`Resync failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setResyncingCloud(false);
    }
  }

  async function addCompany() {
    if (!form.name.trim() || !form.email.trim()) return;
    try {
      await apiFetch('/v1/superadmin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          slug: form.name.split(' ')[0].toLowerCase(),
          plan: form.plan,
          active: true
        })
      });
      await load();
      setForm(CO_FORM_DEFAULT);
      setShowAdd(false);
    } catch (err: any) {
      showAlert(`Failed to add company: ${err?.message ?? 'Unknown error'}`);
    }
  }

  function openEdit(co: Company) {
    setSelectedCoId(co.id);
    setEditForm({
      name: co.name,
      email: co.email,
      phone: co.phone,
      plan: co.plan,
      owner: co.owner,
      country: co.country
    });
    setEditEnabledApps({});
    setEditAddonGrants({});
    setEditFinance(null);
    setEditFinanceLoading(true);
    setShowEdit(true);
    apiFetch(`/v1/superadmin/tenants/${co.id}/apps`).then((r: any) => setEditEnabledApps(r.enabledApps || {})).catch(() => {});
    apiFetch(`/v1/superadmin/tenants/${co.id}/addons`).then((r: any) => setEditAddonGrants(r.addonGrants || {})).catch(() => {});
    apiFetch(`/v1/superadmin/tenants/${co.id}/finance`)
      .then((r: TenantFinanceOverview) => setEditFinance(r))
      .catch(() => setEditFinance(null))
      .finally(() => setEditFinanceLoading(false));
  }

  async function saveEditCompany() {
    if (!selectedCoId) return;
    try {
      await apiFetch(`/v1/superadmin/tenants/${selectedCoId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          plan: editForm.plan
        })
      });
      await apiFetch(`/v1/superadmin/tenants/${selectedCoId}/apps`, {
        method: 'PATCH',
        body: JSON.stringify({ enabledApps: editEnabledApps }),
      });
      await apiFetch(`/v1/superadmin/tenants/${selectedCoId}/addons`, {
        method: 'PATCH',
        body: JSON.stringify({ addonGrants: editAddonGrants }),
      });
      await load();
      setShowEdit(false);
      setSelectedCoId(null);
    } catch (err: any) {
      showAlert(`Failed to update company: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function toggleSuspend(co: Company) {
    const suspending = co.status === 'active';
    const verb = suspending ? 'suspend' : 'reactivate';
    const warning = suspending
      ? `Suspend ${co.name}? Every user at this company will be signed out of any active session and unable to sign back in until you reactivate it.`
      : `Reactivate ${co.name}? Their staff will be able to sign in again immediately.`;
    if (!(await showConfirm(warning, { confirmLabel: suspending ? 'Suspend' : 'Reactivate' }))) return;
    try {
      await apiFetch(`/v1/superadmin/tenants/${co.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !suspending }),
      });
      await load();
    } catch (err: any) {
      showAlert(`Failed to ${verb} company: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function confirmDeleteCompany() {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.name || deleting) return;
    setDeleting(true);
    try {
      await apiFetch(`/v1/superadmin/tenants/${deleteTarget.id}`, { method: 'DELETE' });
      await load();
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (err: any) {
      showAlert(`Failed to delete company: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  }

  const totalTenants = displayed.length;
  const activeTenants = displayed.filter(c => c.status === 'active').length;
  const inactiveTenants = displayed.filter(c => c.status === 'inactive').length;
  const totalUsersCount = displayed.reduce((acc, c) => acc + (c.users || 1), 0);

  return (
    <div>
      <PageHdr
        title="All Companies"
        sub={apiLoaded ? `${displayed.length} registered ${apiError ? '(mock — API offline)' : 'companies'}` : 'Loading…'}
        action={
          <div className="sa-toolbar-actions">
            {apiError && <span className="sa-toolbar-offline">API offline — showing mock data</span>}
            <button type="button" onClick={load} className="btn btn-secondary btn-sm sa-btn-gap-sm" data-ui-native-button=""><Icon name="refresh" size={12}/>Refresh</button>
            <button type="button" onClick={()=>setShowAdd(true)} className="btn btn-primary btn-sm sa-btn-gap-md" data-ui-native-button=""><Icon name="plus" size={13}/>Add Company</button>
          </div>
        }
      />

      {/* Top Executive KPI Deck */}
      <div className="ondi-kpi-grid" style={{ marginBottom: 16 }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setStatusFilter('all'); setPlanFilter('all'); }}
          onKeyDown={e => { if (e.key === 'Enter') { setStatusFilter('all'); setPlanFilter('all'); } }}
          className={`ondi-kpi-card ${statusFilter === 'all' && planFilter === 'all' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Companies</span>
            <div className="ondi-kpi-icon-box purple">
              <Icon name="building" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{totalTenants}</span>
            <span className="ondi-kpi-sub">{apiError ? 'mock tenants' : 'registered tenants'}</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('active')}
          onKeyDown={e => { if (e.key === 'Enter') setStatusFilter('active'); }}
          className={`ondi-kpi-card ${statusFilter === 'active' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Active Tenants</span>
            <div className="ondi-kpi-icon-box green">
              <Icon name="checkCircle" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--green)' }}>{activeTenants}</span>
            <span className="ondi-kpi-sub">live & operational</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('inactive')}
          onKeyDown={e => { if (e.key === 'Enter') setStatusFilter('inactive'); }}
          className={`ondi-kpi-card ${statusFilter === 'inactive' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Inactive / Suspended</span>
            <div className="ondi-kpi-icon-box gold">
              <Icon name="lock" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--gold)' }}>{inactiveTenants}</span>
            <span className="ondi-kpi-sub">access paused</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          className="ondi-kpi-card"
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Seated Users</span>
            <div className="ondi-kpi-icon-box blue">
              <Icon name="users" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--blue)' }}>{totalUsersCount}</span>
            <span className="ondi-kpi-sub">across all tenants</span>
          </div>
        </div>
      </div>

      {/* Filter and Density Toolbar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <SearchToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search companies by name or email…"
              quickFilter={{
                value: statusFilter === 'all' ? null : statusFilter,
                onChange: v => setStatusFilter((v ?? 'all') as any),
                allLabel: "All Status",
                options: [
                  {
                    value: 'active',
                    label: 'Active',
                    icon: <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green, #10b981)', display: 'inline-block' }} />
                  },
                  {
                    value: 'inactive',
                    label: 'Inactive',
                    icon: <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink3, #94a3b8)', display: 'inline-block' }} />
                  },
                ]
              }}
              activeFilterCount={(statusFilter !== 'all' ? 1 : 0) + (planFilter !== 'all' ? 1 : 0)}
              filterContent={(close) => {
                const count = (statusFilter !== 'all' ? 1 : 0) + (planFilter !== 'all' ? 1 : 0);
                const hasActive = count > 0 || Boolean(search.trim());
                return (
                  <div style={{ padding: 16, fontFamily: 'var(--font)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                        <SlidersHorizontal size={14} style={{ color: 'hsl(var(--primary))' }} />
                        <span>Filters</span>
                        {count > 0 && (
                          <span className="stb-green-badge">
                            <span className="stb-green-dot" />
                            <span>{count}</span>
                          </span>
                        )}
                      </div>
                      {hasActive && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch('');
                            setStatusFilter('all');
                            setPlanFilter('all');
                          }}
                          style={{
                            fontSize: "var(--text-base)",
                            fontWeight: 600,
                            color: 'hsl(var(--primary))',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: "var(--action-py) var(--space-md)",
                          }}
                          className="hover:underline"
                          data-ui-native-button=""
                        >
                          Reset all
                        </button>
                      )}
                    </div>

                    {/* Status section */}
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                        Company Status
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[
                          { value: 'all', label: 'All Status' },
                          { value: 'active', label: 'Active', dot: 'var(--green, #10b981)' },
                          { value: 'inactive', label: 'Inactive', dot: 'var(--ink3, #94a3b8)' },
                        ].map(opt => {
                          const isSelected = statusFilter === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setStatusFilter(opt.value as any)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: "var(--action-py) var(--space-md)",
                                borderRadius: "var(--r-sm)",
                                fontSize: "var(--text-base)",
                                fontWeight: isSelected ? 600 : 500,
                                border: isSelected ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                                background: isSelected ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                                color: isSelected ? 'hsl(var(--primary))' : 'var(--ink2)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              data-ui-native-button=""
                            >
                              {opt.dot && (
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: opt.dot }} />
                              )}
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Plan section */}
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                        Subscription Plan
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setPlanFilter('all')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: "var(--action-py) var(--space-md)",
                            borderRadius: "var(--r-sm)",
                            fontSize: "var(--text-base)",
                            fontWeight: planFilter === 'all' ? 600 : 500,
                            border: planFilter === 'all' ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                            background: planFilter === 'all' ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                            color: planFilter === 'all' ? 'hsl(var(--primary))' : 'var(--ink2)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          data-ui-native-button=""
                        >
                          All Plans
                        </button>
                        {(Object.keys(PLAN_CFG) as PlanId[]).map(k => {
                          const isSelected = planFilter === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setPlanFilter(k)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: "var(--action-py) var(--space-md)",
                                borderRadius: "var(--r-sm)",
                                fontSize: "var(--text-base)",
                                fontWeight: isSelected ? 600 : 500,
                                border: isSelected ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                                background: isSelected ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                                color: isSelected ? 'hsl(var(--primary))' : 'var(--ink2)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              data-ui-native-button=""
                            >
                              {PLAN_CFG[k].label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                        Showing <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> of {displayed.length}
                      </span>
                      <button
                        type="button"
                        onClick={close}
                        className="btn btn-primary btn-sm"
                        style={{ padding: "var(--action-py) var(--space-md)", fontSize: "var(--text-base)" }}
                        data-ui-native-button=""
                      >
                        Done
                      </button>
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {/* Density toggle and Export toolbar action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              onClick={exportCompanies}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Icon name="download" size={13} />
              <span>{selected.size > 0 ? `Export (${selected.size})` : 'Export CSV'}</span>
            </Button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {((statusFilter !== 'all' ? 1 : 0) + (planFilter !== 'all' ? 1 : 0) > 0 || Boolean(search.trim())) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingLeft: 2 }}>
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
                  background: 'var(--bg)',
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
                  data-ui-native-button=""
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {statusFilter !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                  textTransform: 'capitalize',
                }}
              >
                Status: <strong>{statusFilter}</strong>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                  title="Remove status filter"
                  data-ui-native-button=""
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {planFilter !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              >
                Plan: <strong>{PLAN_CFG[planFilter]?.label ?? planFilter}</strong>
                <button
                  type="button"
                  onClick={() => setPlanFilter('all')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                  title="Remove plan filter"
                  data-ui-native-button=""
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setPlanFilter('all');
              }}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'hsl(var(--primary))',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
              className="hover:underline"
              data-ui-native-button=""
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {!apiLoaded && (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)', fontSize:13 }}>Loading tenants…</div>
      )}

      {apiLoaded && selected.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'0 14px', minHeight:'34px', marginBottom:8, background:'color-mix(in srgb, var(--teal) 8%, var(--white))', border:'1px solid color-mix(in srgb, var(--teal) 25%, transparent)', borderRadius:'var(--r)', fontSize:12.5, boxShadow:'0 1px 2px 0 rgba(0,0,0,0.03)' }}>
          <span style={{ fontWeight:600, color:'var(--teal)' }}>{selected.size} {selected.size === 1 ? 'company' : 'companies'} selected</span>
          <div style={{ flex:1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCompanies} data-ui-native-button="" style={{ minHeight: 26, padding: '2px 8px', fontSize: 11 }}><Icon name="download" size={11} style={{ marginRight:4 }}/>Export Selected</button>
          <button type="button" className="btn btn-sm" style={{ color:'var(--ink3)', minHeight: 26, padding: '2px 6px', fontSize: 11 }} onClick={()=>setSelected(new Set())} data-ui-native-button="">Clear</button>
        </div>
      )}

      {apiLoaded && (
        <DataTable
          compact={compactRows}
          headers={['Company','Contact','Plan','Users','Status','Domain','Created','Actions']}
          selectAll={selected.size === paginated.length && paginated.length > 0}
          selectAllIndeterminate={selected.size > 0 && selected.size < paginated.length}
          onSelectAll={() => {
            if (selected.size === paginated.length) {
              setSelected(new Set());
            } else {
              setSelected(new Set(paginated.map(c => c.id)));
            }
          }}
          sortBy={coSortBy} sortDir={coSortDir} onSort={coHandleSort}
        >
          {paginated.map(co=>(
            <TR key={co.id} selected={selected.has(co.id)} onSelect={() => setSelected(prev => {
              const next = new Set(prev);
              if (next.has(co.id)) next.delete(co.id); else next.add(co.id);
              return next;
            })}>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap: compactRows ? 7 : 10 }}>
                  <CoAv co={co} size={compactRows ? 24 : 34} />
                  <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                    <div style={{ display:'flex', alignItems:'center', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: compactRows ? 12 : 13, color: 'var(--ink)' }}>{co.name}</span>
                      {co.founderPersonalEmailDomain && (
                        <Tip label={`Signed up with personal email (${co.founderPersonalEmailDomain})`} side="top">
                          <span style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 'var(--badge-radius)', padding: '1px 5px', color: 'var(--gold)', background: 'var(--gold-l)', whiteSpace: 'nowrap' }}>
                            Personal
                          </span>
                        </Tip>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>
                      {co.id.length > 8 ? co.id.slice(0, 8) + '…' : co.id}
                    </div>
                  </div>
                </div>
              </TD>
              <TD>
                <div className="rtbl-truncate" style={{ fontSize: compactRows ? 11.5 : 12, maxWidth: 160, color: 'var(--ink)' }} title={co.email}>{co.email}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{co.phone || co.owner}</div>
              </TD>
              <TD><Badge cfg={PLAN_CFG[co.plan]} /></TD>
              <TD><span style={{ fontWeight: 600, fontSize: compactRows ? 12 : 13 }}>{co.users}</span></TD>
              <TD><Badge cfg={CO_CFG[co.status]} /></TD>
              <TD><span className="rtbl-truncate" style={{ fontSize: compactRows ? 11.5 : 12, color: 'var(--ink3)', fontFamily: 'var(--font)' }} title={co.domain}>{co.domain}</span></TD>
              <TD nowrap><span style={{ fontSize: compactRows ? 11.5 : 12, color: 'var(--ink3)' }}>{fmtDate(co.created)}</span></TD>
              <TD>
                <div style={{ display: 'flex', gap: compactRows ? 3 : 6, alignItems: 'center' }}>
                  <Tip label={`Sign in as ${co.name}`} side="top">
                    <button
                      type="button"
                      disabled={!!impersonating}
                      onClick={() => handleImpersonate(co)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: compactRows ? '2px 7px' : 'var(--ds-btn-py-xs) 10px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--teal)',
                        background: 'var(--teal-l)',
                        color: 'var(--teal)',
                        fontSize: compactRows ? 11 : "var(--text-xs)",
                        fontWeight: 700,
                        cursor: impersonating ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font)',
                        opacity: impersonating === co.id ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                        minHeight: compactRows ? 24 : 'var(--ctl-h-xs)',
                        boxSizing: 'border-box',
                        lineHeight: 1.2
                      }}
                      data-ui-native-button=""
                    >
                      <Icon name="eye" size={compactRows ? 10 : 11} color="var(--teal)" />
                      {impersonating === co.id ? 'Switching…' : 'Login As'}
                    </button>
                  </Tip>
                  <ActBtn icon="users" title="View customers" size={compactRows ? 12 : 14} onClick={() => openCustomers(co)} />
                  <ActBtn icon="edit" color="var(--teal)" title="Edit company" size={compactRows ? 12 : 14} onClick={() => openEdit(co)} />
                  {co.status === 'active'
                    ? <ActBtn icon="lock" color="var(--gold)" title="Suspend company" size={compactRows ? 12 : 14} onClick={() => toggleSuspend(co)} />
                    : <ActBtn icon="unlock" color="var(--green)" title="Reactivate company" size={compactRows ? 12 : 14} onClick={() => toggleSuspend(co)} />}
                  <ActBtn icon="trash" color="var(--red)" title="Delete company" size={compactRows ? 12 : 14} onClick={() => { setDeleteTarget(co); setDeleteConfirmText(''); }} />
                </div>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={9} style={{ textAlign:'center', padding:'40px 0', color:'var(--ink3)', fontSize:13 }}>
              {!apiError && tenants.length === 0 ? 'No companies registered yet.' : 'No companies match your filters'}
            </td></tr>
          )}
        </DataTable>
      )}

      {apiLoaded && filtered.length > 0 && (
        <PaginationBar
          page={coPage}
          pageSize={coPageSize}
          total={filtered.length}
          onPageChange={setCoPage}
          onPageSizeChange={p => { setCoPageSize(p); setCoPage(1); }}
          itemLabel="companies"
          bordered
        />
      )}

      {/* Add Company Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200 dark:border-teal-800">
                <Icon name="plus" size={18} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">Add Company</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Register a new tenant company workspace on the platform.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground/85 block">Company Name *</label>
              <Input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Summit Traders Ltd"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground/85 block">Owner Name</label>
              <Input
                value={form.owner}
                onChange={e => setForm(p => ({ ...p, owner: e.target.value }))}
                placeholder="Amina Hassan"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground/85 block">Work Email *</label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@company.co.tz"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/85 block">Phone</label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+255 712 000 000"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/85 block">Country</label>
                <Input
                  value={form.country}
                  onChange={e => setForm(p => ({ ...p, country: e.target.value }))}
                  placeholder="Tanzania"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground/85 block">Subscription Tier</label>
              <Select value={form.plan} onValueChange={v => setForm(p => ({ ...p, plan: v as PlanId }))}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLAN_CFG) as PlanId[]).map(k => (
                    <SelectItem key={k} value={k}>{PLAN_CFG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border bg-muted/20 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={addCompany}
              disabled={!form.name.trim() || !form.email.trim()}
            >
              Add Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200 dark:border-teal-800">
                <Icon name="edit" size={18} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">Edit Company</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Update subscription tier, enabled applications, and add-on grants.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/85 block">Company Name</label>
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/85 block">Subscription Tier</label>
                <Select value={editForm.plan} onValueChange={v => setEditForm(p => ({ ...p, plan: v as PlanId }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLAN_CFG) as PlanId[]).map(k => (
                      <SelectItem key={k} value={k}>{PLAN_CFG[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-foreground/85 block">Enabled Workspace Applications</label>
              <div className="grid grid-cols-2 gap-2 p-3 bg-muted/40 rounded-lg border border-border">
                {TENANT_APPS.map(app => {
                  const enabled = editEnabledApps[app.id] !== false;
                  return (
                    <label key={app.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer py-0.5">
                      <Checkbox
                        checked={enabled}
                        onCheckedChange={c => setEditEnabledApps(p => ({ ...p, [app.id]: c === true }))}
                      />
                      <span>{app.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {addonsCatalog.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-foreground/85 block">Platform Add-ons</label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-muted/40 rounded-lg border border-border">
                  {addonsCatalog.map(addon => {
                    const granted = editAddonGrants[addon.code] === true;
                    return (
                      <label key={addon.code} className="flex items-center gap-2 text-xs text-foreground cursor-pointer py-0.5">
                        <Checkbox
                          checked={granted}
                          onCheckedChange={c => setEditAddonGrants(p => ({ ...p, [addon.code]: c === true }))}
                        />
                        <span>{addon.name} <span className="text-muted-foreground font-mono">(${addon.monthly}/mo)</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-foreground/85 block">Finance Module Access</label>
              <div className="p-3 bg-muted/40 rounded-lg border border-border">
                {editFinanceLoading ? (
                  <SectionLoading label="Loading Finance access" />
                ) : editFinance ? (() => {
                  const summary = editFinance.capabilitySummary;
                  const enabled = summary.capabilities.filter(item => item.enabled).length;
                  const available = summary.capabilities.filter(item => item.state === 'available').length;
                  const locked = summary.capabilities.filter(item => item.state === 'not_entitled').length;
                  const quota = summary.usage.limit == null
                    ? `${summary.usage.used.toLocaleString()} actions · Unlimited`
                    : `${summary.usage.used.toLocaleString()} / ${summary.usage.limit.toLocaleString()} actions`;
                  return (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <UiBadge variant={summary.edition === 'advanced' ? 'brand' : 'gray'}>
                          {summary.edition === 'advanced' ? 'Finance Advanced' : 'Finance Basic'}
                        </UiBadge>
                        <span className="text-[11px] text-muted-foreground">{quota} / {summary.usage.period}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          ['Enabled', enabled, 'var(--green)'],
                          ['Available', available, 'var(--gold)'],
                          ['Plan locked', locked, 'var(--ink3)'],
                        ].map(([label, value, color]) => (
                          <div key={String(label)} className="bg-card border border-border rounded-md p-2 text-center">
                            <div className="text-sm font-bold" style={{ color: String(color) }}>{value}</div>
                            <div className="text-[10px] text-muted-foreground">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })() : (
                  <span className="text-xs text-muted-foreground">Finance access details unavailable.</span>
                )}
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="p-4 border-t border-border bg-muted/20 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveEditCompany}
              disabled={!editForm.name.trim()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customers List Dialog */}
      <Dialog open={!!customersCo} onOpenChange={o => { if (!o) setCustomersCo(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border bg-card flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {customersCo?.name} — Customers
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Client accounts registered in this company&apos;s workspace.
              </DialogDescription>
            </div>
            <Tip label="Retag customer and shipment Cloud folders created before entity linking existed" side="top">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resyncingCloud}
                onClick={handleResyncCloudLinks}
                className="h-8 text-xs font-semibold"
              >
                {resyncingCloud ? 'Resyncing…' : 'Resync Cloud Links'}
              </Button>
            </Tip>
          </DialogHeader>

          <DialogBody className="p-4 max-h-[70vh] overflow-y-auto">
            {loadingCustomers ? (
              <div className="text-center py-8 text-xs text-muted-foreground">Loading customers…</div>
            ) : tenantCustomers.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">This company has no customers yet.</div>
            ) : (
              <DataTable compact={true} headers={['Customer','Contact','Status','Actions']}>
                {tenantCustomers.map(cust => (
                  <TR key={cust.id}>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        <PersonAvatar userId={cust.id} kind="customers" name={cust.name} size={22} />
                        <span className="font-semibold text-xs">{cust.name}</span>
                      </span>
                    </TD>
                    <TD>
                      <div className="text-xs">{cust.email || '—'}</div>
                      <div className="text-[11px] text-muted-foreground">{cust.phone || cust.phone_wa || ''}</div>
                    </TD>
                    <TD>
                      <Badge cfg={cust.active ? { label: cust.account_status || 'Active', color:'var(--green)', bg:'var(--green-l)' } : { label:'Inactive', color:'var(--ink3)', bg:'var(--bg)' }} />
                    </TD>
                    <TD right>
                      <button
                        type="button"
                        title={`Login as ${cust.name}`}
                        disabled={!!impersonatingCustomerId}
                        onClick={() => handleImpersonateCustomer(cust)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--teal)',
                          background: 'var(--teal-l)',
                          color: 'var(--teal)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: impersonatingCustomerId ? 'not-allowed' : 'pointer',
                          fontFamily: 'var(--font)',
                          opacity: impersonatingCustomerId === cust.id ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                          minHeight: 24,
                          boxSizing: 'border-box',
                          lineHeight: 1.2
                        }}
                        data-ui-native-button=""
                      >
                        <Icon name="eye" size={10} color="var(--teal)" />
                        {impersonatingCustomerId === cust.id ? 'Switching…' : 'Login As Customer'}
                      </button>
                    </TD>
                  </TR>
                ))}
              </DataTable>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(''); } }}>
        <DialogContent className="sm:max-w-md">
          {deleteTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Delete {deleteTarget.name}?</DialogTitle>
              </DialogHeader>
              <div style={{ display:'flex', flexDirection:'column', gap:12, padding:'4px 0' }}>
                <p style={{ fontSize:13, color:'var(--ink2)', margin:0 }}>
                  This permanently deletes every shipment, invoice, document and user account belonging to <strong>{deleteTarget.name}</strong>. This cannot be undone — there is no backup or recovery.
                </p>
                <p style={{ fontSize:13, color:'var(--ink2)', margin:0 }}>
                  Type <strong>{deleteTarget.name}</strong> to confirm.
                </p>
                <Input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTarget.name}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={deleteConfirmText !== deleteTarget.name || deleting}
                  onClick={confirmDeleteCompany}
                >
                  {deleting ? 'Deleting…' : 'Delete permanently'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

