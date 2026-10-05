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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog.js';
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

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading dashboard statisticsâ€¦</div>;
  if (error || !stats) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Error loading dashboard stats. Check server connection.</div>;

  const { kpis, planDist, spark, monthlyRev, transactions, platformInsights } = stats;
  // Below two months of history a sparkline is a straight line, so the cards
  // show the number and say why there is no trend beside it.
  const noHistory = (stats.monthsWithData ?? 0) < 2 ? 'not enough history yet' : undefined;

  return (
    <div>
      <PageHdr title="Super Admin Dashboard" sub="Platform overview â€” all companies, revenue and activity at a glance" />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Total Companies"    value={String(kpis.totalCompanies)}       icon="building"   color="var(--teal)"   spark={spark.companies}   emptyHint={noHistory} />
        <KPICard title="Active Companies"   value={String(kpis.activeCompanies)}      icon="check"      color="var(--teal)"  spark={spark.active}      emptyHint={noHistory} />
        <KPICard title="Total Subscribers"  value={`${kpis.totalSubscribers} users`}  icon="users"      color="var(--teal)" spark={spark.subscribers} emptyHint={noHistory} />
        {/* Money received, not a list-price run-rate â€” the run-rate estimate is
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
                coByID(), which searches the mock COMPANIES array â€” a real
                tenant id never matched, so every row read "Unknown Company". */}
            {transactions.map((tx: any)=>{
              const txcfg = TX_CFG[tx.status as TxStatus] || TX_CFG.completed;
              return (
                <div key={tx.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{tx.companyName || 'Deleted company'}</div>
                    <div style={{ fontSize:11, color:'var(--ink3)' }}>{tx.txRef}{tx.payerName ? ` Â· ${tx.payerName}` : ''}</div>
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
            and there is no subscriptions table, so there is nothing to show â€”
            the panel is gone rather than filled with a date nobody committed to.
            Rollup cards for the two domain "Insights" layers relocated out of
            this shell (Decompose SuperAdmin M1/M3) take the slot instead â€” a
            real number, linking straight to where the detail now lives. */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:14 }}>Platform Insights</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <Link to="/lens" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:'var(--r)', border:'1px solid var(--border)', textDecoration:'none', color:'inherit' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Icon name="alertCircle" size={16} color={platformInsights.lens.critical > 0 ? 'var(--red)' : 'var(--ink3)'} />
                <div>
                  <div style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>Lens â€” open engineering items</div>
                  <div style={{ fontSize:11, color:'var(--ink3)' }}>
                    {platformInsights.lens.critical > 0 ? `${platformInsights.lens.critical} critical Â· ` : ''}across every part of the platform
                  </div>
                </div>
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--ink)' }}>{platformInsights.lens.openTotal}</div>
            </Link>
            <Link to="/nexushr/platform-devices" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:'var(--r)', border:'1px solid var(--border)', textDecoration:'none', color:'inherit' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Icon name="fingerprint" size={16} color={platformInsights.devices.error > 0 ? 'var(--red)' : 'var(--ink3)'} />
                <div>
                  <div style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>Attendance devices â€” all tenants</div>
                  <div style={{ fontSize:11, color:'var(--ink3)' }}>
                    {platformInsights.devices.online} online Â· {platformInsights.devices.offline} offline
                    {platformInsights.devices.error > 0 ? ` Â· ${platformInsights.devices.error} error` : ''}
                  </div>
                </div>
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--ink)' }}>{platformInsights.devices.total}</div>
            </Link>
            <div style={{ fontSize:11, color:'var(--ink3)', textAlign:'center' }}>
              Filterable, exportable detail for devices is in <Link to="/hudubi/reports" style={{ color:'var(--teal)', fontWeight:600 }}>HuduBI Reports</Link> â€” "Attendance devices by status".
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   COMPANIES VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
interface ApiTenant { id:string; name:string; slug:string; plan:string; active:boolean; created_at:string; logo_url?:string; primary_color?:string; users?:number; founder_personal_email_domain?:string|null; }
interface CoForm { name:string; email:string; phone:string; plan:PlanId; owner:string; country:string; }
const CO_FORM_DEFAULT: CoForm = { name:'', email:'', phone:'', plan:'starter', owner:'', country:'Tanzania' };

// Each row already has a real checkbox + name â€” a different dot colour per
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
    // The mock COMPANIES fixture (including a fabricated "suspended" tenant)
    // is only an honest stand-in when the real list genuinely couldn't be
    // fetched â€” the subtitle below says "(mock â€” API offline)" for that case.
    // It used to also cover a real, successful, genuinely-empty result (a
    // fresh platform with zero tenants), silently presenting fake companies
    // as real ones with no disclosure at all. A truly empty tenant list now
    // renders as an empty table instead.
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

  // A generic yes/no dialog was the only thing standing between a misclick
  // and permanently, irreversibly deleting a live tenant's entire dataset â€”
  // every shipment, invoice, user account and document, cascade-deleted with
  // no soft-delete or recovery path. This is the single most destructive
  // action in the whole SuperAdmin console, so it gets the one confirmation
  // pattern that actually stops a misclick: retyping the company's exact
  // name, the same shape GitHub/AWS use for their own irreversible deletes.
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

  return (
    <div>
      <PageHdr
        title="All Companies"
        sub={apiLoaded ? `${displayed.length} registered ${apiError ? '(mock â€” API offline)' : 'companies'}` : 'Loadingâ€¦'}
        action={
          <div className="sa-toolbar-actions">
            {apiError && <span className="sa-toolbar-offline">API offline â€” showing mock data</span>}
            <button type="button" onClick={load} className="btn btn-secondary btn-sm sa-btn-gap-sm"><Icon name="refresh" size={12}/>Refresh</button>
            <button type="button" onClick={()=>setShowAdd(true)} className="btn btn-primary btn-sm sa-btn-gap-md"><Icon name="plus" size={13}/>Add Company</button>
          </div>
        }
      />

      {/* Unified Dreams Core style filter bar */}
      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search companiesâ€¦"
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
                {/* Popover Header */}
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
                        fontSize: 12,
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
                            padding: '5px 11px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: isSelected ? 600 : 500,
                            border: isSelected ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                            background: isSelected ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                            color: isSelected ? 'hsl(var(--primary))' : 'var(--ink2)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
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
                        padding: '5px 11px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: planFilter === 'all' ? 600 : 500,
                        border: planFilter === 'all' ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                        background: planFilter === 'all' ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                        color: planFilter === 'all' ? 'hsl(var(--primary))' : 'var(--ink2)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
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
                            padding: '5px 11px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: isSelected ? 600 : 500,
                            border: isSelected ? '1px solid hsl(var(--primary))' : '1px solid var(--border)',
                            background: isSelected ? 'hsl(var(--primary) / 0.1)' : 'var(--bg)',
                            color: isSelected ? 'hsl(var(--primary))' : 'var(--ink2)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {PLAN_CFG[k].label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer summary & action */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    Showing <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> of {displayed.length}
                  </span>
                  <button
                    type="button"
                    onClick={close}
                    className="btn btn-primary btn-sm"
                    style={{ padding: '4px 12px', fontSize: 12 }}
                  >
                    Done
                  </button>
                </div>
              </div>
            );
          }}
        />

        {/* Active Filter Chips strip */}
        {((statusFilter !== 'all' ? 1 : 0) + (planFilter !== 'all' ? 1 : 0) > 0 || Boolean(search.trim())) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingLeft: 2 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 600 }}>Active filters:</span>
            {search.trim() && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 11.5,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              >
                Search: <strong>"{search}"</strong>
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
            {statusFilter !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 11.5,
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
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 11.5,
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
                padding: '2px 4px',
              }}
              className="hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {!apiLoaded && (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)', fontSize:13 }}>Loading tenantsâ€¦</div>
      )}

      {apiLoaded && selected.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'0 14px', minHeight:'var(--ctl-h)', marginBottom:8, background:'color-mix(in srgb, var(--teal) 8%, var(--white))', border:'1px solid color-mix(in srgb, var(--teal) 25%, transparent)', borderRadius:'var(--r)', fontSize:13, boxShadow:'0 1px 2px 0 rgba(0,0,0,0.03)' }}>
          <span style={{ fontWeight:600, color:'var(--teal)' }}>{selected.size} {selected.size === 1 ? 'company' : 'companies'} selected</span>
          <div style={{ flex:1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCompanies}><Icon name="download" size={12} style={{ marginRight:5 }}/>Export</button>
          <button type="button" className="btn btn-sm" style={{ color:'var(--ink3)' }} onClick={()=>setSelected(new Set())}>Clear</button>
        </div>
      )}

      {apiLoaded && (
        <DataTable
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
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <CoAv co={co} />
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontWeight:600 }}>{co.name}</span>
                      {co.founderPersonalEmailDomain && (
                        <Tip label={`Signed up with a personal email (${co.founderPersonalEmailDomain}), not a verified work domain`} side="top">
                          <span style={{ fontSize:10, fontWeight:700, borderRadius:'var(--badge-radius)', padding:'2px 7px', color:'var(--gold)', background:'var(--gold-l)', whiteSpace:'nowrap', cursor:'default' }}>
                            Personal email
                          </span>
                        </Tip>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'var(--ink3)', fontFamily:'var(--font)' }}>{co.id.length > 10 ? co.id.slice(0,8)+'â€¦' : co.id}</div>
                  </div>
                </div>
              </TD>
              <TD>
                <div className="rtbl-truncate" style={{ fontSize:12, maxWidth:160 }} title={co.email}>{co.email}</div>
                <div style={{ fontSize:11, color:'var(--ink3)' }}>{co.phone || co.owner}</div>
              </TD>
              <TD><Badge cfg={PLAN_CFG[co.plan]} /></TD>
              <TD><span style={{ fontWeight:600 }}>{co.users}</span></TD>
              <TD><Badge cfg={CO_CFG[co.status]} /></TD>
              <TD><span className="rtbl-truncate" style={{ fontSize:12, color:'var(--ink3)', fontFamily:'var(--font)' }} title={co.domain}>{co.domain}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(co.created)}</span></TD>
              <TD>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <Tip label={`Sign in as ${co.name} â€” you'll see the platform exactly as their admin does`} side="top">
                    <button
                      type="button"
                      disabled={!!impersonating}
                      onClick={() => handleImpersonate(co)}
                      style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'var(--ds-btn-py-xs) 10px', borderRadius:'var(--r)', border:'1px solid var(--teal)', background:'var(--teal-l)', color:'var(--teal)', fontSize:11, fontWeight:700, cursor: impersonating ? 'not-allowed' : 'pointer', fontFamily:'var(--font)', opacity: impersonating===co.id ? 0.6 : 1, whiteSpace:'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="eye" size={11} color="var(--teal)" />
                      {impersonating === co.id ? 'Switchingâ€¦' : 'Login As'}
                    </button>
                  </Tip>
                  <ActBtn icon="users" title="View customers" onClick={()=>openCustomers(co)} />
                  <ActBtn icon="edit" color="var(--teal)" title="Edit company" onClick={()=>openEdit(co)} />
                  {co.status === 'active'
                    ? <ActBtn icon="lock" color="var(--gold)" title="Suspend company" onClick={()=>toggleSuspend(co)} />
                    : <ActBtn icon="unlock" color="var(--green)" title="Reactivate company" onClick={()=>toggleSuspend(co)} />}
                  <ActBtn icon="trash" color="var(--red)" title="Delete company" onClick={()=>{setDeleteTarget(co); setDeleteConfirmText('');}} />
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

      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          <div className="card" style={{ width:480, padding:28, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>Add Company</span>
              <Tip label="Close"><button type="button" aria-label="Close" onClick={()=>setShowAdd(false)} className="dp-close"><Icon name="close" size={16} /></button></Tip>
            </div>
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:14 }}>
              {([
                { label:'Company Name *', key:'name',    placeholder:'Summit Traders Ltd' },
                { label:'Owner Name',     key:'owner',   placeholder:'Amina Hassan' },
                { label:'Email *',        key:'email',   placeholder:'admin@company.co.tz' },
                { label:'Phone',          key:'phone',   placeholder:'+255 712 000 000' },
                { label:'Country',        key:'country', placeholder:'Tanzania' },
              ] as const).map(f=>(
                <div key={f.key} style={{ gridColumn: f.key==='email'?'span 2':undefined }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>{f.label}</label>
                  <input title={f.label} value={form[f.key as keyof CoForm]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} className="input-field" style={{ width:'100%' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Plan</label>
                <Select value={form.plan} onValueChange={v=>setForm(p=>({...p,plan:v as PlanId}))}>
                  <SelectTrigger className="input-field" style={{ width:'100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLAN_CFG) as PlanId[]).map(k=><SelectItem key={k} value={k}>{PLAN_CFG[k].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:22 }}>
              <button type="button" onClick={()=>setShowAdd(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="button" onClick={addCompany} className="btn btn-primary btn-sm" disabled={!form.name.trim()||!form.email.trim()}>Add Company</button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="modal-overlay" onClick={()=>setShowEdit(false)}>
          <div className="card" style={{ width:480, padding:28, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>Edit Company</span>
              <Tip label="Close"><button type="button" aria-label="Close" onClick={()=>setShowEdit(false)} className="dp-close"><Icon name="close" size={16} /></button></Tip>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Company Name</label>
                <input title="Company Name" value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} className="input-field" style={{ width:'100%' }} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Plan</label>
                <Select value={editForm.plan} onValueChange={v=>setEditForm(p=>({...p,plan:v as PlanId}))}>
                  <SelectTrigger className="input-field" style={{ width:'100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLAN_CFG) as PlanId[]).map(k=><SelectItem key={k} value={k}>{PLAN_CFG[k].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:8 }}>Enabled Apps</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, padding:12, background:'var(--bg)', borderRadius: 'var(--r)', border:'1px solid var(--border)' }}>
                {TENANT_APPS.map(app => {
                  const enabled = editEnabledApps[app.id] !== false;
                  return (
                    <label key={app.id} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, color:'var(--ink)', cursor:'pointer', padding:'3px 0' }}>
                      <Checkbox checked={enabled}
                        onCheckedChange={c => setEditEnabledApps(p => ({ ...p, [app.id]: c === true }))} />
                      {app.name}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Add-ons (376_package_addons.sql) â€” granted independent of the
                plan above, e.g. Onsite for an agency/web-host/IT-provider
                tenant. Mirrors the Enabled Apps grid exactly. */}
            {addonsCatalog.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:8 }}>Add-ons</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, padding:12, background:'var(--bg)', borderRadius: 'var(--r)', border:'1px solid var(--border)' }}>
                  {addonsCatalog.map(addon => {
                    const granted = editAddonGrants[addon.code] === true;
                    return (
                      <label key={addon.code} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, color:'var(--ink)', cursor:'pointer', padding:'3px 0' }}>
                        <Checkbox checked={granted}
                          onCheckedChange={c => setEditAddonGrants(p => ({ ...p, [addon.code]: c === true }))} />
                        {addon.name} <span style={{ color:'var(--ink3)' }}>(${addon.monthly}/mo)</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:8 }}>Finance access</label>
              <div style={{ padding:12, background:'var(--bg)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                {editFinanceLoading ? (
                  <SectionLoading label="Loading Finance access" />
                ) : editFinance ? (() => {
                  const summary = editFinance.capabilitySummary;
                  const enabled = summary.capabilities.filter(item => item.enabled).length;
                  const available = summary.capabilities.filter(item => item.state === 'available').length;
                  const locked = summary.capabilities.filter(item => item.state === 'not_entitled').length;
                  const quota = summary.usage.limit == null
                    ? `${summary.usage.used.toLocaleString()} actions Â· Unlimited`
                    : `${summary.usage.used.toLocaleString()} / ${summary.usage.limit.toLocaleString()} actions`;
                  return (
                    <div style={{ display:'grid', gap:10 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                        <UiBadge variant={summary.edition === 'advanced' ? 'brand' : 'gray'}>{summary.edition === 'advanced' ? 'Finance Advanced' : 'Finance Basic'}</UiBadge>
                        <span style={{ fontSize:11.5, color:'var(--ink3)' }}>{quota} / {summary.usage.period}</span>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
                        {[
                          ['Enabled', enabled, 'var(--green)'],
                          ['Available', available, 'var(--gold)'],
                          ['Plan locked', locked, 'var(--ink3)'],
                        ].map(([label, value, color]) => (
                          <div key={String(label)} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'8px 9px' }}>
                            <div style={{ fontSize:15, fontWeight:700, color:String(color) }}>{value}</div>
                            <div style={{ fontSize:10.5, color:'var(--ink3)' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize:11.5, color:'var(--ink2)', lineHeight:1.5 }}>
                        {editFinance.configuration.industries.length
                          ? `Industries: ${editFinance.configuration.industries.join(', ')}`
                          : 'No industry profile selected'}
                        {' Â· '}{editFinance.configuration.businessLines.length} business line{editFinance.configuration.businessLines.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  );
                })() : (
                  <span style={{ fontSize:12, color:'var(--ink3)' }}>Finance access could not be loaded.</span>
                )}
              </div>
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:22 }}>
              <button type="button" onClick={()=>setShowEdit(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="button" onClick={saveEditCompany} className="btn btn-primary btn-sm" disabled={!editForm.name.trim()}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {customersCo && (
        <div className="modal-overlay" onClick={()=>setCustomersCo(null)}>
          <div className="card" style={{ width:640, padding:28, maxHeight:'85vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, gap:10 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>{customersCo.name} â€” Customers</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Tip label="Retag customer and shipment Cloud folders created before entity linking existed" side="top">
                  <button type="button" disabled={resyncingCloud}
                    onClick={handleResyncCloudLinks} className="btn btn-secondary btn-sm">
                    {resyncingCloud ? 'Resyncingâ€¦' : 'Resync Cloud Links'}
                  </button>
                </Tip>
                <Tip label="Close"><button type="button" aria-label="Close" onClick={()=>setCustomersCo(null)} className="dp-close"><Icon name="close" size={16} /></button></Tip>
              </div>
            </div>
            {loadingCustomers ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--ink3)', fontSize:13 }}>Loading customersâ€¦</div>
            ) : tenantCustomers.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--ink3)', fontSize:13 }}>This company has no customers yet.</div>
            ) : (
              <DataTable headers={['Customer','Contact','Status','Actions']}>
                {tenantCustomers.map(cust => (
                  <TR key={cust.id}>
                    <TD>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar userId={cust.id} kind="customers" name={cust.name} size={24} />
                        <span style={{ fontWeight:600 }}>{cust.name}</span>
                      </span>
                    </TD>
                    <TD>
                      <div style={{ fontSize:12 }}>{cust.email || 'â€”'}</div>
                      <div style={{ fontSize:11, color:'var(--ink3)' }}>{cust.phone || cust.phone_wa || ''}</div>
                    </TD>
                    <TD><Badge cfg={cust.active ? { label: cust.account_status || 'Active', color:'var(--green)', bg:'var(--green-l)' } : { label:'Inactive', color:'var(--ink3)', bg:'var(--bg)' }} /></TD>
                    <TD right>
                      <button
                        type="button"
                        title={`Login as ${cust.name}`}
                        disabled={!!impersonatingCustomerId}
                        onClick={() => handleImpersonateCustomer(cust)}
                        style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'var(--ds-btn-py-xs) 10px', borderRadius:'var(--r)', border:'1px solid var(--teal)', background:'var(--teal-l)', color:'var(--teal)', fontSize:11, fontWeight:700, cursor: impersonatingCustomerId ? 'not-allowed' : 'pointer', fontFamily:'var(--font)', opacity: impersonatingCustomerId===cust.id ? 0.6 : 1, whiteSpace:'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                        <Icon name="eye" size={11} color="var(--teal)" />
                        {impersonatingCustomerId === cust.id ? 'Switchingâ€¦' : 'Login As Customer'}
                      </button>
                    </TD>
                  </TR>
                ))}
              </DataTable>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(''); } }}>
        <DialogContent className="sm:max-w-md">
          {deleteTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Delete {deleteTarget.name}?</DialogTitle>
              </DialogHeader>
              <div style={{ display:'flex', flexDirection:'column', gap:12, padding:'4px 0' }}>
                <p style={{ fontSize:13, color:'var(--ink2)', margin:0 }}>
                  This permanently deletes every shipment, invoice, document and user account belonging to <strong>{deleteTarget.name}</strong>. This cannot be undone â€” there is no backup or recovery.
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
                  {deleting ? 'Deletingâ€¦' : 'Delete permanently'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

