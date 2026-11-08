import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { FeatureToggleRow } from '../../components/ui/list-item-row.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { Card } from '../../components/ui/card.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { conversionIsLive, convertAmount, formatAmount, refreshFxRates } from '../../lib/currency.js';
import { LAUNCHER_APPS } from '../../components/LauncherApps.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { ALL_FEATURE_KEYS, SIGNUP_BASE_PLAN_CODES } from '@hudumika/types';
import {
  Badge as LegacyBadge, CoAv, PLAN_CFG, SUB_CFG,
  type Company, type Subscription, type Package, type Addon, type Domain,
  type SubStatus,
  COMPANIES, SUBSCRIPTIONS,
  mapAddonFromApi, fmtCurrency, fmtDate, coByID,
  Spark, PageHdr,
  DataTable, useSortState, sortedRows, TR, TD, ActBtn, StatCard,
} from './shared.js';
/* ══════════════════════════════════════════════════
   SUBSCRIPTIONS VIEW
══════════════════════════════════════════════════ */
export function SubscriptionsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubStatus|'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(25);

  const counts = useMemo(()=>({
    total:    SUBSCRIPTIONS.length,
    active:   SUBSCRIPTIONS.filter(s=>s.status==='active').length,
    trial:    SUBSCRIPTIONS.filter(s=>s.status==='trial').length,
    expired:  SUBSCRIPTIONS.filter(s=>s.status==='expired'||s.status==='cancelled').length,
  }),[]);

  const filtered = useMemo(()=>
    SUBSCRIPTIONS.filter(s=>{
      if (statusFilter!=='all' && s.status!==statusFilter) return false;
      const co = coByID(s.companyId);
      if (search && !co.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  [search, statusFilter]);

  useEffect(() => { setSelected(new Set()); setSubPage(1); }, [search, statusFilter]);

  const { sortBy: subSortBy, sortDir: subSortDir, handleSort: subHandleSort } = useSortState();
  const subAccessor = (col: string, s: typeof filtered[0]) => {
    const co = coByID(s.companyId);
    return ({ 'Company': co.name, 'Plan': s.plan, 'Billing': s.billing,
      'Start Date': s.start, 'End Date': s.end, 'Amount': Number(s.amount), 'Status': s.status })[col];
  };
  const subPaginated = useMemo(() => {
    const sorted = sortedRows(filtered, subSortBy, subSortDir, subAccessor);
    return sorted.slice((subPage - 1) * subPageSize, subPage * subPageSize);
  }, [filtered, subPage, subPageSize, subSortBy, subSortDir]);

  function exportSubscriptions() {
    const rows = selected.size > 0 ? filtered.filter(s => selected.has(s.id)) : filtered;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Company','Plan','Billing','Start Date','End Date','Amount','Status'];
    const csv = [header.join(','), ...rows.map(s => {
      const co = coByID(s.companyId);
      return [co.name, s.plan, s.billing, s.start, s.end, s.amount, s.status].map(esc).join(',');
    })].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `subscriptions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHdr title="Company Subscriptions" sub="All company subscription plans and billing status" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Subscriptions" value={counts.total}   color="var(--teal)"  />
        <StatCard label="Active"               value={counts.active}  color="var(--green)"      />
        <StatCard label="Trial"                value={counts.trial}   color="var(--gold)"      />
        <StatCard label="Expired / Cancelled"  value={counts.expired} color="var(--red)"      />
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          search={search}
          onSearch={v => { setSearch(v); setSubPage(1); }}
          placeholder="Search by company…"
          quickFilter={{
            value: statusFilter === 'all' ? null : statusFilter,
            onChange: v => setStatusFilter((v ?? 'all') as SubStatus | 'all'),
            allLabel: 'All Status',
            columns: 2,
            options: (Object.keys(SUB_CFG) as SubStatus[]).map(k => ({
              value: k,
              label: SUB_CFG[k].label,
              icon: <span style={{ width:7, height:7, borderRadius:'50%', background: SUB_CFG[k].color, display:'inline-block' }} />,
            })),
          }}
          activeFilterCount={statusFilter !== 'all' ? 1 : 0}
        />
      </div>

      {selected.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'0 14px', minHeight:'var(--ctl-h)', marginBottom:8, background:'color-mix(in srgb, var(--teal) 8%, var(--white))', border:'1px solid color-mix(in srgb, var(--teal) 25%, transparent)', borderRadius:'var(--r)', fontSize:13, boxShadow:'0 1px 2px 0 rgba(0,0,0,0.03)' }}>
          <span style={{ fontWeight:600, color:'var(--teal)' }}>{selected.size} {selected.size === 1 ? 'subscription' : 'subscriptions'} selected</span>
          <div style={{ flex:1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportSubscriptions} data-ui-native-button=""><Icon name="download" size={12} style={{ marginRight:5 }}/>Export</button>
          <button type="button" className="btn btn-sm" style={{ color:'var(--ink3)' }} onClick={()=>setSelected(new Set())} data-ui-native-button="">Clear</button>
        </div>
      )}

      <DataTable
        headers={['Company','Plan','Billing','Start Date','End Date','Amount','Status','Actions']}
        selectAll={selected.size === subPaginated.length && subPaginated.length > 0}
        selectAllIndeterminate={selected.size > 0 && selected.size < subPaginated.length}
        onSelectAll={() => {
          if (selected.size === subPaginated.length) setSelected(new Set());
          else setSelected(new Set(subPaginated.map(s => s.id)));
        }}
        sortBy={subSortBy} sortDir={subSortDir} onSort={subHandleSort}
      >
        {subPaginated.map(sub=>{
          const co = coByID(sub.companyId);
          return (
            <TR key={sub.id} selected={selected.has(sub.id)} onSelect={() => setSelected(prev => {
              const next = new Set(prev); if (next.has(sub.id)) next.delete(sub.id); else next.add(sub.id); return next;
            })}>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <CoAv co={co} size={30} />
                  <span style={{ fontWeight:600, fontSize:13 }}>{co.name}</span>
                </div>
              </TD>
              <TD><LegacyBadge cfg={PLAN_CFG[sub.plan]} /></TD>
              <TD><span style={{ fontSize:12, textTransform:'capitalize', color:'var(--ink2)' }}>{sub.billing}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(sub.start)}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(sub.end)}</span></TD>
              <TD right><span style={{ fontWeight:700, fontFamily:'var(--font)' }}>{sub.amount===0?'Free':fmtCurrency(sub.amount)}</span></TD>
              <TD><LegacyBadge cfg={SUB_CFG[sub.status]} /></TD>
              <TD>
                <div style={{ display:'flex', gap:2 }}>
                  <ActBtn icon="edit"  title="Edit"   onClick={()=>{}} />
                  <ActBtn icon="mail"  title="Email"  onClick={()=>{}} />
                </div>
              </TD>
            </TR>
          );
        })}
        {filtered.length === 0 && (
          <tr><td colSpan={9} style={{ textAlign:'center', padding:'40px 0', color:'var(--ink3)', fontSize:13 }}>No subscriptions match your filters.</td></tr>
        )}
      </DataTable>

      {filtered.length > 0 && (
        <PaginationBar
          page={subPage} pageSize={subPageSize} total={filtered.length}
          onPageChange={setSubPage}
          onPageSizeChange={p => { setSubPageSize(p); setSubPage(1); }}
          itemLabel="subscriptions" bordered
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PACKAGES VIEW
══════════════════════════════════════════════════ */
// Same id → display-name map every app launcher tile and sidebar already
// reads (LauncherApps.tsx) — reused here instead of a second, hand-guessed
// label set that would drift from it.
const APP_NAME_BY_ID: Record<string, string> = Object.fromEntries(LAUNCHER_APPS.map(a => [a.id, a.name]));
function humanize(s: string): string {
  return s.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
/** A dotted key ('tracking.cargo-loading') is a sub-feature of its prefix
 *  ('tracking') — ALL_FEATURE_KEYS already lists each parent immediately
 *  before its children, so rendering in array order and indenting whichever
 *  rows have a parent groups them correctly with no tree-building needed. */
function featureLabel(key: string): { parent: string | null; label: string } {
  const dot = key.indexOf('.');
  if (dot === -1) return { parent: null, label: APP_NAME_BY_ID[key] || humanize(key) };
  const parentKey = key.slice(0, dot);
  return { parent: APP_NAME_BY_ID[parentKey] || humanize(parentKey), label: humanize(key.slice(dot + 1)) };
}

/** Real, wired editor for which entitlement feature keys a package grants — PATCHes
 *  /v1/superadmin/packages/:code/features (backed by the package_features table), distinct
 *  from the still-local-only price/maxUsers/display-features fields in the parent modal. */
function FeatureGatesEditor({ packageCode }: { packageCode: string }) {
  const [features, setFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/v1/superadmin/packages/${packageCode}/features`)
      .then(res => { if (alive) setFeatures(res.features || []); })
      .catch(() => { if (alive) setFeatures([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [packageCode]);

  function toggleKey(key: string) {
    setFeatures(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/v1/superadmin/packages/${packageCode}/features`, {
        method: 'PATCH',
        body: JSON.stringify({ features }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err: any) {
      showAlert(`Failed to save feature gates: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Feature Gates</div>
        <Button type="button" size="sm" variant="secondary" onClick={save} disabled={loading || saving}>
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save Gates'}
        </Button>
      </div>
      {loading ? (
        <SectionLoading />
      ) : (
        <DataTable headers={['Feature', 'Enabled']}>
          {ALL_FEATURE_KEYS.map(key => {
            const { parent, label } = featureLabel(key);
            return (
              <TR key={key} onClick={() => toggleKey(key)}>
                <TD>
                  {parent ? (
                    <span style={{ display:'inline-flex', alignItems:'baseline', gap:6, paddingLeft:18, fontSize:12.5, color:'var(--ink2)' }}>
                      <span style={{ color:'var(--ink3)' }}>–</span> {label}
                      <span style={{ fontSize:10.5, color:'var(--ink3)' }}>({parent})</span>
                    </span>
                  ) : (
                    <span style={{ fontWeight:600 }}>{label}</span>
                  )}
                </TD>
                <TD right>
                  <Checkbox checked={features.includes(key)} onCheckedChange={() => toggleKey(key)} onClick={e => e.stopPropagation()} />
                </TD>
              </TR>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}

/** Real, wired editor for per-app monthly item quotas on a package — PATCHes
 *  /v1/superadmin/packages/:code/quotas (backed by package_app_quotas,
 *  migration 280). Layered on top of the blanket "Monthly item limit"
 *  field in the parent modal: both apply, whichever a tenant hits first
 *  blocks the request (see apps/api/src/lib/usage.ts checkAppUsageLimit).
 *  Blank/empty = unlimited for that app under this tier, same convention
 *  FeatureGatesEditor's absent-row-means-off already uses. */
function AppQuotasEditor({ packageCode }: { packageCode: string }) {
  const [quotas, setQuotas] = useState<Record<string, number | ''>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/v1/superadmin/packages/${packageCode}/quotas`)
      .then(res => { if (alive) setQuotas(res.quotas || {}); })
      .catch(() => { if (alive) setQuotas({}); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [packageCode]);

  function setLimit(key: string, value: string) {
    setQuotas(prev => {
      const next = { ...prev };
      if (value.trim() === '') delete next[key];
      else next[key] = Math.max(0, Number(value));
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const [k, v] of Object.entries(quotas)) if (v !== '') payload[k] = v as number;
      await apiFetch(`/v1/superadmin/packages/${packageCode}/quotas`, {
        method: 'PATCH',
        body: JSON.stringify({ quotas: payload }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err: any) {
      showAlert(`Failed to save app quotas: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Per-app monthly quotas</div>
        <Button type="button" size="sm" variant="secondary" onClick={save} disabled={loading || saving}>
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save Quotas'}
        </Button>
      </div>
      {loading ? (
        <SectionLoading />
      ) : (
        <DataTable headers={['App', 'Monthly limit']}>
          {ALL_FEATURE_KEYS.map(key => {
            const { parent, label } = featureLabel(key);
            return (
              <TR key={key}>
                <TD>
                  {parent ? (
                    <span style={{ display:'inline-flex', alignItems:'baseline', gap:6, paddingLeft:18, fontSize:12.5, color:'var(--ink2)' }}>
                      <span style={{ color:'var(--ink3)' }}>–</span> {label}
                      <span style={{ fontSize:10.5, color:'var(--ink3)' }}>({parent})</span>
                    </span>
                  ) : (
                    <span style={{ fontWeight:600 }}>{label}</span>
                  )}
                </TD>
                <TD right>
                  <Input
                    type="number" min={0} placeholder="∞"
                    value={quotas[key] ?? ''}
                    onChange={e => setLimit(key, e.target.value)}
                    style={{ width:90, textAlign:'right', display:'inline-flex' }}
                  />
                </TD>
              </TR>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}

type CatalogPackage = Package & {
  currency: string;
  flatMonthly: number | null;
  flatAnnual: number | null;
  subscriptionCount: number;
  standaloneOffer: boolean;
  industryOffer: boolean;
};

const PACKAGE_FILTERS = [
  { key: 'plans', label: 'Base plans' },
  { key: 'addons', label: 'Add-ons' },
  { key: 'industry', label: 'Industry packages' },
  { key: 'other', label: 'Other catalogue records' },
] as const;
function catalogGroup(pkg: CatalogPackage) {
  if (SIGNUP_BASE_PLAN_CODES.includes(pkg.code)) return 'plans';
  if (pkg.standaloneOffer) return 'addons';
  if (pkg.industryOffer) return 'industry';
  return 'other';
}

export function PackagesView() {
  // null = still loading. Was seeded with the hardcoded PACKAGES sample
  // array and only overwritten `if (mapped.length)` — so every load of this
  // page first drew 4 fabricated cards with numbers that don't match any
  // real package (they haven't for a while: the real "scale" plan was
  // deactivated and its price changed to 299, and the real starter/growth/
  // enterprise prices are 3/10/50, not 6/18/0), then a moment later swapped
  // to whatever the real, *active* packages actually are (3 of them, not
  // 4 — "scale" is real but inactive, so /v1/packages correctly omits it).
  // That swap — a visibly different card count and different prices on
  // every single page load — is exactly what "packages keep changing"
  // describes. Loading state now, real data only, once. Now fetches
  // /v1/packages/all (every package, active or not) rather than the public
  // /v1/packages, since this console is where a dormant tier — the free
  // plan, legacy 'scale' — gets reactivated, not just where live ones get edited.
  const [packages, setPackages] = useState<CatalogPackage[] | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<(typeof PACKAGE_FILTERS)[number]['key']>('plans');
  const [displayCurrency, setDisplayCurrency] = useState('TZS');
  const [selectedTenant, setSelectedTenant] = useState('catalogue');
  const [tenants, setTenants] = useState<{ id: string; name: string; slug: string; plan: string }[]>([]);
  const [tenantError, setTenantError] = useState(false);
  const [, setFxReady] = useState(false);
  const [packagesError, setPackagesError] = useState(false);
  const [billing, setBilling] = useState<'monthly'|'annual'>('monthly');
  const [editing, setEditing] = useState<CatalogPackage|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPkg, setNewPkg] = useState({ name:'', monthly:0, annual:0, maxUsers:10, pricePerSeat:0, currency:'TZS' });
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [addonsError, setAddonsError] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon|null>(null);

  // Load the canonical catalog from the API — shows a real error state on failure, no fabricated fallback.
  // Edit/Create/Deactivate below are wired to real endpoints (packages.routes.ts POST/PATCH/DELETE,
  // SuperAdmin-gated). The Feature Gates checklist in the edit modal is a separate, already-wired
  // endpoint (/v1/superadmin/packages/:code/features) — see FeatureGatesEditor below.
  function mapFromApi(pkg: import('@hudumika/types').Package & { tenant_count: number; subscription_count: number; standalone_offer: boolean; industry_offer: boolean }): CatalogPackage {
    return {
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      monthly: pkg.monthly_price,
      annual: pkg.annual_price,
      maxUsers: pkg.max_users,
      pricePerSeat: pkg.price_per_seat,
      extraSeatPrice: pkg.extra_seat_price,
      extraSeatThreshold: pkg.extra_seat_threshold,
      monthlyItemLimit: pkg.monthly_item_limit,
      storageLimitGb: pkg.storage_limit_bytes != null ? Math.round(pkg.storage_limit_bytes / 1073741824) : null,
      monthlyAiCredits: pkg.monthly_ai_credits ?? 0,
      byokAiAllowed: pkg.byok_ai_allowed ?? false,
      active: pkg.tenant_count,
      currency: pkg.currency ?? 'USD',
      flatMonthly: pkg.price_flat_monthly ?? null,
      flatAnnual: pkg.price_flat_annual ?? null,
      subscriptionCount: pkg.subscription_count,
      standaloneOffer: pkg.standalone_offer,
      industryOffer: pkg.industry_offer,
      // A package with no color set (onsite-standalone, agency-managed) used
      // to fall through to `${pkg.color}18` → "null18" and an unset Icon
      // color, which is exactly how one plan card ended up a different,
      // unintended colour from the other three. Same real brand accent every
      // other package already uses, not a fresh arbitrary pick.
      color: pkg.color || 'var(--teal)',
      popular: pkg.popular,
      features: pkg.features,
      isActive: pkg.is_active,
    };
  }

  // /all (not the public / ) — SuperAdmin needs to see and reactivate
  // dormant packages (the free tier, legacy 'scale', etc.), not just the
  // ones already live to signups.
  function reload() {
    setPackagesError(false);
    apiFetch('/v1/packages/all').then(res => {
      setPackages((res.data as any[]).map(mapFromApi));
    }).catch(() => setPackagesError(true));
  }

  function reloadAddons() {
    setAddonsError(false);
    apiFetch('/v1/addons').then(res => {
      setAddons((res.data as any[]).map(mapAddonFromApi));
    }).catch(() => setAddonsError(true));
  }

  useEffect(() => {
    reload();
    reloadAddons();
    void refreshFxRates().then(() => setFxReady(true));
    apiFetch<typeof tenants>('/v1/superadmin/tenants')
      .then(rows => setTenants(rows.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setTenantError(true));
  }, []);
  const tenantPlan = tenants.find(tenant => tenant.id === selectedTenant)?.plan;
  const tenantCurrency = packages?.find(pkg => pkg.code === tenantPlan)?.currency;
  const currency = tenantCurrency ?? displayCurrency;
  const visiblePackages = packages?.filter(pkg => catalogGroup(pkg) === catalogFilter);
  function packageMoney(amount: number, source: string) {
    if (amount === 0 || source === currency) return formatAmount(amount, currency);
    return conversionIsLive(source, currency)
      ? `≈ ${formatAmount(convertAmount(amount, source, currency), currency)}`
      : 'FX unavailable';
  }
  function packagePrice(pkg: CatalogPackage, cycle: 'monthly' | 'annual') {
    if (pkg.flatMonthly !== null || pkg.flatAnnual !== null) {
      return cycle === 'monthly' ? pkg.flatMonthly ?? 0 : pkg.flatAnnual ?? (pkg.flatMonthly ?? 0) * 12;
    }
    return cycle === 'monthly' ? pkg.monthly : pkg.annual;
  }

  const stats = useMemo(() => {
    const total = packages?.filter(p => catalogGroup(p) === 'plans').length ?? 0;
    const active = packages?.filter(p => catalogGroup(p) === 'plans' && p.isActive).length ?? 0;
    const tenantCount = packages?.reduce((acc, p) => acc + (p.active || 0), 0) ?? 0;
    const addonCount = (addons?.length ?? 0) + (packages?.filter(p => catalogGroup(p) === 'addons').length ?? 0);
    return { total, active, tenantCount, addonCount };
  }, [packages, addons]);

  return (
    <div className="space-y-6">
      <PageHdr
        title="Subscription Packages"
        sub="Configure pricing tiers, seat allowances, app quotas, and modular add-ons"
        action={
          <div className="flex flex-wrap items-center gap-2.5 max-sm:w-full max-sm:justify-between">
            <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  billing === 'monthly'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-ui-native-button=""
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling('annual')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  billing === 'annual'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-ui-native-button=""
              >
                Annual
              </button>
            </div>
            {catalogFilter === 'other' && <Button onClick={() => setShowAdd(true)} size="sm" className="gap-1.5 min-h-[var(--ctl-h-sm)]">
              <Icon name="plus" size={14} />
              New catalogue record
            </Button>}
          </div>
        }
      />
      {/* ── Pricing Context & Currency Simulator Toolbar ── */}
      <Card className="p-3.5 sm:p-4 border border-border bg-card/75 rounded-xl shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <FeaturedIcon variant="brand" size="sm">
                <Icon name="sliders" size={13} />
              </FeaturedIcon>
              <span>Pricing Simulator</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger className="w-56 sm:w-64 h-8 text-xs font-medium" aria-label="Tenant currency preview">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="catalogue">Standard Catalogue Rates</SelectItem>
                  {tenants.map(tenant => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
                {(['TZS', 'USD'] as const).map(curr => (
                  <button
                    key={curr}
                    type="button"
                    disabled={!!tenantCurrency}
                    onClick={() => setDisplayCurrency(curr)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      currency === curr
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground disabled:opacity-50'
                    }`}
                    data-ui-native-button=""
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[11.5px] text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>
              {tenantCurrency
                ? `Locked to tenant plan currency (${tenantCurrency})`
                : `Active currency: ${currency} · Converted amounts use live FX rates`}
            </span>
          </div>
        </div>
        {tenantError && <p role="alert" className="text-xs text-destructive mt-2">Could not load tenants for currency preview.</p>}
        {selectedTenant !== 'catalogue' && packages && !tenantCurrency && (
          <p className="text-xs text-muted-foreground mt-2">No plan currency found for selected workspace. Choose a display currency above.</p>
        )}
      </Card>

      {/* ── Top Executive Posture KPI Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="p-4 flex items-center justify-between border border-border shadow-xs bg-card hover:border-foreground/20 transition-colors">
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-foreground">{packages ? stats.total : '—'}</div>
            <div className="text-xs font-medium text-muted-foreground mt-0.5">Base Plan Tiers</div>
          </div>
          <FeaturedIcon variant="brand" size="md">
            <Icon name="package" size={18} />
          </FeaturedIcon>
        </Card>

        <Card className="p-4 flex items-center justify-between border border-border shadow-xs bg-card hover:border-foreground/20 transition-colors">
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">{packages ? stats.active : '—'}</div>
            <div className="text-xs font-medium text-muted-foreground mt-0.5">Live Signup Tiers</div>
          </div>
          <FeaturedIcon variant="success" size="md">
            <Icon name="checkCircle" size={18} />
          </FeaturedIcon>
        </Card>

        <Card className="p-4 flex items-center justify-between border border-border shadow-xs bg-card hover:border-foreground/20 transition-colors">
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-foreground">{packages ? stats.tenantCount : '—'}</div>
            <div className="text-xs font-medium text-muted-foreground mt-0.5">Active Tenant Plans</div>
          </div>
          <FeaturedIcon variant="info" size="md">
            <Icon name="users" size={18} />
          </FeaturedIcon>
        </Card>

        <Card className="p-4 flex items-center justify-between border border-border shadow-xs bg-card hover:border-foreground/20 transition-colors">
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-foreground">{addons ? stats.addonCount : '—'}</div>
            <div className="text-xs font-medium text-muted-foreground mt-0.5">Modular Add-ons</div>
          </div>
          <FeaturedIcon variant="warning" size="md">
            <Icon name="layers" size={18} />
          </FeaturedIcon>
        </Card>
      </div>

      {packages === null && !packagesError && (
        <div className="py-12 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
          <SectionLoading />
          <span>Loading subscription catalog…</span>
        </div>
      )}

      {packagesError && (
        <div className="py-12 text-center text-destructive text-xs">
          Couldn't load subscription packages.
          <Button variant="outline" size="sm" onClick={reload} className="ml-2">
            Retry
          </Button>
        </div>
      )}

      {/* ── Category Filter Navigation ── */}
      {packages && !packagesError && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" role="group" aria-label="Package categories">
          {PACKAGE_FILTERS.map(({ key, label }) => {
            const count = packages.filter(pkg => catalogGroup(pkg) === key).length + (key === 'addons' ? addons?.length ?? 0 : 0);
            const isSelected = catalogFilter === key;
            const iconName = key === 'plans' ? 'package' : key === 'addons' ? 'layers' : key === 'industry' ? 'briefcase' : 'list';
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                aria-pressed={isSelected}
                onClick={() => setCatalogFilter(key)}
                className="shrink-0 gap-2 h-8 text-xs font-medium transition-all"
              >
                <Icon name={iconName} size={13} className={isSelected ? 'text-primary-foreground' : 'text-muted-foreground'} />
                <span>{label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {count}
                </span>
              </Button>
            );
          })}
        </div>
      )}

      {visiblePackages?.length === 0 && !packagesError && catalogFilter !== 'addons' && (
        <div className="py-12 text-center text-muted-foreground text-xs">
          No packages recorded in this category.
        </div>
      )}

      {/* ── Tier Cards Grid ── */}
      {catalogFilter === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePackages?.map(pkg => {
            const monthly = packagePrice(pkg, 'monthly');
            const annual = packagePrice(pkg, 'annual');
            const accentColor = pkg.color || 'var(--teal)';
            return (
              <Card
                key={pkg.id}
                className={`relative flex flex-col justify-between transition-all duration-200 hover:shadow-lg border border-border rounded-xl bg-card text-card-foreground overflow-hidden ${
                  pkg.popular && pkg.isActive
                    ? 'ring-2 ring-[var(--teal)]/40 shadow-sm'
                    : ''
                } ${!pkg.isActive ? 'opacity-75' : ''}`}
              >
                {/* Visual Top Accent Strip */}
                <div
                  className="h-1 w-full shrink-0"
                  style={{
                    background: pkg.popular && pkg.isActive ? 'var(--teal)' : accentColor,
                  }}
                />

                <div className="p-5 sm:p-6 pb-0">
                  {/* Header: Identity & Status Badges */}
                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-3">
                      <FeaturedIcon variant={pkg.popular && pkg.isActive ? 'brand' : 'gray'} size="md">
                        <Icon name="package" size={18} />
                      </FeaturedIcon>
                      <div>
                        <h4 className="text-lg font-extrabold text-foreground tracking-tight">{pkg.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] font-mono font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                            {pkg.code}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {pkg.popular && pkg.isActive && (
                        <Badge variant="brand" className="text-[10px] uppercase font-bold tracking-wider">
                          Most Popular
                        </Badge>
                      )}
                      {!pkg.isActive && (
                        <Badge variant="gray" className="text-[10px] uppercase font-bold tracking-wider">
                          {pkg.standaloneOffer ? 'Standalone' : 'Inactive'}
                        </Badge>
                      )}
                      {pkg.industryOffer && (
                        <Badge variant="info" className="text-[10px] uppercase font-bold tracking-wider">
                          Industry
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Price Section */}
                  <div className="my-4 pt-3 border-t border-border/60">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-[var(--font)]">
                        {packageMoney(billing === 'monthly' ? monthly : annual, pkg.currency)}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">/{billing === 'monthly' ? 'mo' : 'yr'}</span>
                    </div>

                    {billing === 'annual' && annual > 0 && monthly * 12 > annual && (
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <Icon name="trendingUp" size={11} />
                        Save {packageMoney(monthly * 12 - annual, pkg.currency)}/yr vs monthly
                      </div>
                    )}

                    {pkg.flatMonthly === null && pkg.flatAnnual === null && pkg.pricePerSeat != null && (
                      <div className="text-xs text-muted-foreground mt-2 font-medium">
                        Per-seat billing: <strong className="text-foreground">{packageMoney(pkg.pricePerSeat, pkg.currency)}/seat/mo</strong>
                        {pkg.extraSeatThreshold != null && pkg.extraSeatPrice != null && (
                          <span className="text-[11px]"> ({packageMoney(pkg.extraSeatPrice, pkg.currency)}/seat past {pkg.extraSeatThreshold})</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Creative 2x2 Resource & Quota Specification Grid */}
                  <div className="grid grid-cols-2 gap-2 my-4 p-3 bg-muted/30 rounded-lg border border-border/60">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                        <Icon name="users" size={11} /> User Cap
                      </span>
                      <span className="text-xs font-bold text-foreground mt-0.5">
                        {pkg.maxUsers === 0 ? 'Unlimited' : `${pkg.maxUsers} Users`}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                        <Icon name="archive" size={11} /> Cloud Storage
                      </span>
                      <span className="text-xs font-bold text-foreground mt-0.5">
                        {pkg.storageLimitGb ? `${pkg.storageLimitGb} GB` : 'Unlimited'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                        <Icon name="layers" size={11} /> Items / Month
                      </span>
                      <span className="text-xs font-bold text-foreground mt-0.5">
                        {pkg.monthlyItemLimit ? `${pkg.monthlyItemLimit.toLocaleString()}` : 'Unlimited'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                        <Icon name="zap" size={11} /> Platform AI
                      </span>
                      <span className="text-xs font-bold text-foreground mt-0.5">
                        {pkg.monthlyAiCredits > 0 ? `${pkg.monthlyAiCredits.toLocaleString()} Credits` : 'None'}
                      </span>
                    </div>
                  </div>

                  {pkg.byokAiAllowed && (
                    <div className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--teal)] bg-[var(--teal-l)] px-2.5 py-1 rounded-md">
                      <Icon name="key" size={12} />
                      Custom AI Provider Keys Allowed (BYOK)
                    </div>
                  )}

                  {/* Features List */}
                  <div className="space-y-2 mb-6">
                    <div className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground mb-2">Included Capabilities</div>
                    {pkg.features.map(f => (
                      <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Icon name="check" size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug text-foreground/85">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Footer with Live Workspace Adoption */}
                <div className="p-5 sm:p-6 pt-3.5 border-t border-border bg-muted/10 mt-auto">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${pkg.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      <strong className="text-foreground">{pkg.active}</strong> active workspace{pkg.active === 1 ? '' : 's'}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {pkg.subscriptionCount} subscription{pkg.subscriptionCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(pkg)}
                    className="w-full gap-1.5 h-8.5 text-xs font-semibold"
                  >
                    <Icon name="sliders" size={12} />
                    Configure Tier & Quotas
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {catalogFilter !== 'plans' && !!visiblePackages?.length && (
        <Card className="border border-border rounded-xl overflow-hidden shadow-xs">
          <DataTable headers={[
            catalogFilter === 'addons' ? 'Standalone product' : 'Catalogue record',
            'Status',
            'Price rate',
            'Tenant Adoption',
            'Actions',
          ]}>
            {visiblePackages.map(pkg => (
              <TR key={pkg.id}>
                <TD>
                  <div className="font-bold text-foreground text-sm">{pkg.name}</div>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">{pkg.code}</div>
                </TD>
                <TD>
                  {pkg.standaloneOffer ? (
                    <Badge variant="info">Standalone</Badge>
                  ) : pkg.isActive ? (
                    <Badge variant="success">Active for signup</Badge>
                  ) : (
                    <Badge variant="gray">Inactive</Badge>
                  )}
                </TD>
                <TD>
                  <span className="font-bold text-foreground">
                    {packageMoney(packagePrice(pkg, billing), pkg.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground"> / {billing === 'monthly' ? 'mo' : 'yr'}</span>
                </TD>
                <TD>
                  <span className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{pkg.active}</strong> tenants · {pkg.subscriptionCount} subscriptions
                  </span>
                </TD>
                <TD>
                  <Button variant="outline" size="sm" onClick={() => setEditing(pkg)} className="gap-1 h-7 text-xs">
                    <Icon name="edit" size={11} /> Edit
                  </Button>
                </TD>
              </TR>
            ))}
          </DataTable>
        </Card>
      )}

      {/* ── Add-ons Section ── */}
      {catalogFilter === 'addons' && (
        <div className="mt-8">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Modular extensions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Optional platform capabilities purchasable on top of any active base plan.</p>
            </div>
            {addons && (
              <Badge variant="gray">{addons.length} Extension{addons.length === 1 ? '' : 's'}</Badge>
            )}
          </div>

          {addons === null && !addonsError && (
            <div className="py-8 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
              <SectionLoading />
              <span>Loading modular add-ons…</span>
            </div>
          )}

          {addonsError && (
            <div className="py-8 text-center text-destructive text-xs">
              Couldn't load add-ons. <Button variant="outline" size="sm" onClick={reloadAddons} className="ml-2">Retry</Button>
            </div>
          )}

          {addons !== null && addons.length === 0 && !addonsError && (
            <div className="py-8 text-center text-muted-foreground text-xs">No add-ons configured yet.</div>
          )}

          {addons !== null && addons.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {addons.map(addon => (
                <Card
                  key={addon.id}
                  className="p-5 flex flex-col justify-between transition-all hover:shadow-md border border-border bg-card text-card-foreground rounded-xl"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <FeaturedIcon variant="brand" size="sm">
                          <Icon name="layers" size={15} />
                        </FeaturedIcon>
                        <span className="text-sm font-bold text-foreground">{addon.name}</span>
                      </div>
                      <span className="text-sm font-extrabold text-foreground shrink-0 font-[var(--font)]">
                        {packageMoney(billing === 'monthly' ? addon.monthly : addon.annual, 'USD')}
                        <span className="text-[11px] font-normal text-muted-foreground">/{billing === 'monthly' ? 'mo' : 'yr'}</span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground my-2.5 leading-relaxed">{addon.description}</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border mt-3">
                    <span className="text-xs text-muted-foreground">
                      <strong className="text-foreground font-semibold">{addon.activeCompanies}</strong> active {addon.activeCompanies === 1 ? 'company' : 'companies'}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setEditingAddon(addon)} className="gap-1.5 h-7 text-xs font-medium">
                      <Icon name="edit" size={11} />
                      Edit
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add-on Edit Modal ── */}
      <Dialog open={!!editingAddon} onOpenChange={o => { if (!o) setEditingAddon(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-md p-5 sm:p-6">
          {editingAddon && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Add-on — {editingAddon.name}</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-4">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">Monthly price (USD)</label>
                  <Input type="number" value={editingAddon.monthly} onChange={e => setEditingAddon(p => p ? ({ ...p, monthly: Number(e.target.value) }) : p)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">Annual price (USD)</label>
                  <Input type="number" value={editingAddon.annual} onChange={e => setEditingAddon(p => p ? ({ ...p, annual: Number(e.target.value) }) : p)} />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-foreground block mb-1.5">Description — target audience</label>
                <textarea data-ui-field="textarea"
                  value={editingAddon.description}
                  onChange={e => setEditingAddon(p => p ? ({ ...p, description: e.target.value }) : p)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground font-[var(--font)]"
                />
              </div>

              <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!(await showConfirm(`Deactivate the ${editingAddon.name} add-on? It will stop appearing to new signups.`, { variant: 'warning', confirmLabel: 'Deactivate' }))) return;
                    try {
                      await apiFetch(`/v1/addons/${editingAddon.code}`, { method: 'DELETE' });
                      setAddons(a => (a ?? []).filter(x => x.id !== editingAddon.id));
                      setEditingAddon(null);
                    } catch (err: any) {
                      showAlert(`Failed to deactivate: ${err?.message ?? 'Unknown error'}`);
                    }
                  }}
                >
                  Deactivate
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingAddon(null)}>Cancel</Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      try {
                        const updated = await apiFetch(`/v1/addons/${editingAddon.code}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            monthlyPrice: editingAddon.monthly,
                            annualPrice: editingAddon.annual,
                            description: editingAddon.description,
                          }),
                        });
                        setAddons(a => (a ?? []).map(x => x.id === editingAddon.id ? mapAddonFromApi({ ...updated, activeCompanies: editingAddon.activeCompanies }) : x));
                        setEditingAddon(null);
                      } catch (err: any) {
                        showAlert(`Failed to save: ${err?.message ?? 'Unknown error'}`);
                      }
                    }}
                  >
                    Save Changes
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Package Edit Modal ── */}
      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[88vh] overflow-y-auto p-5 sm:p-6">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Package — {editing.name}</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-4">
                {[
                  { label: `Monthly price (${editing.currency})`, key: editing.flatMonthly !== null || editing.flatAnnual !== null ? 'flatMonthly' : 'monthly', hint: undefined },
                  { label: `Annual price (${editing.currency})`, key: editing.flatMonthly !== null || editing.flatAnnual !== null ? 'flatAnnual' : 'annual', hint: undefined },
                  { label: 'Max Users', key: 'maxUsers', hint: '0 = unlimited' },
                  { label: 'Monthly item limit, all apps', key: 'monthlyItemLimit', hint: '0 = unlimited' },
                  { label: 'Storage limit, GB', key: 'storageLimitGb', hint: '0 = unlimited' },
                  { label: 'AI credits / month', key: 'monthlyAiCredits', hint: '0 = no platform AI' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">
                      {f.label}{f.hint && <span className="font-normal text-muted-foreground"> ({f.hint})</span>}
                    </label>
                    <Input
                      type="number"
                      value={(editing as any)[f.key] ?? (f.key === 'flatAnnual' ? (editing.flatMonthly ?? 0) * 12 : 0)}
                      onChange={e => setEditing(p => p ? ({ ...p, [f.key]: Number(e.target.value) }) : p)}
                    />
                  </div>
                ))}
              </div>

              {/* Per-seat pricing toggle */}
              <div className="my-3.5 p-3.5 sm:p-4 border border-border rounded-xl bg-muted/20">
                <FeatureToggleRow
                  icon={<Icon name="users" size={18} strokeWidth={1.75} />}
                  title="Per-seat pricing"
                  description={editing.pricePerSeat != null ? 'Billed per active user, every month.' : 'Off — flat/custom pricing (e.g. "Talk to Sales" tiers).'}
                  checked={editing.pricePerSeat != null}
                  onCheckedChange={(checked: boolean) => setEditing(p => p ? ({
                    ...p,
                    pricePerSeat: checked ? (p.pricePerSeat ?? 0) : null,
                    extraSeatPrice: checked ? p.extraSeatPrice : null,
                    extraSeatThreshold: checked ? p.extraSeatThreshold : null,
                  }) : p)}
                />
                {editing.pricePerSeat != null && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3.5 pt-3.5 border-t border-border/60">
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">Price per seat ({editing.currency}/mo)</label>
                      <Input
                        type="number"
                        min={0}
                        value={editing.pricePerSeat}
                        onChange={e => setEditing(p => p ? ({ ...p, pricePerSeat: Number(e.target.value) }) : p)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">
                        Discount past seat # <span className="font-normal text-muted-foreground">(opt)</span>
                      </label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 5"
                        value={editing.extraSeatThreshold ?? ''}
                        onChange={e => setEditing(p => p ? ({ ...p, extraSeatThreshold: e.target.value === '' ? null : Number(e.target.value) }) : p)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1">Discounted seat price ({editing.currency}/mo)</label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 4"
                        value={editing.extraSeatPrice ?? ''}
                        onChange={e => setEditing(p => p ? ({ ...p, extraSeatPrice: e.target.value === '' ? null : Number(e.target.value) }) : p)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-3.5 p-3.5 sm:p-4 border border-border rounded-xl bg-muted/20">
                <FeatureToggleRow
                  icon={<Icon name="eye" size={18} strokeWidth={1.75} />}
                  title="Active — visible to signups"
                  description={editing.isActive ? 'Live: tenants can pick this plan today.' : 'Dormant: hidden from signup/pricing, but any tenant already on it keeps working.'}
                  checked={editing.isActive}
                  onCheckedChange={(checked: boolean) => setEditing(p => p ? ({ ...p, isActive: checked }) : p)}
                />
              </div>

              <div className="mb-4 p-3.5 sm:p-4 border border-border rounded-xl bg-muted/20">
                <FeatureToggleRow
                  icon={<Icon name="sparkle" size={18} strokeWidth={1.75} />}
                  title="Bring your own AI key (BYOK)"
                  description={editing.byokAiAllowed
                    ? 'On — a tenant on this tier can enter their own provider key in Settings, which is billed directly to them.'
                    : 'Off — a tenant on this tier can only use the platform-billed AI key allowance.'}
                  checked={editing.byokAiAllowed}
                  onCheckedChange={(checked: boolean) => setEditing(p => p ? ({ ...p, byokAiAllowed: checked }) : p)}
                />
              </div>

              <FeatureGatesEditor packageCode={editing.code} />
              <AppQuotasEditor packageCode={editing.code} />

              <DialogFooter className="mt-4 flex-col-reverse sm:flex-row gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    if (!editing.isActive && packages?.find(pk => pk.id === editing.id)?.isActive) {
                      if (!(await showConfirm(`Deactivate the ${editing.name} package? It will stop appearing to new signups — any tenant already on it keeps working.`, { variant: 'warning', confirmLabel: 'Deactivate' }))) return;
                    }
                    try {
                      await apiFetch(`/v1/packages/${editing.code}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          monthly_price: editing.monthly,
                          annual_price: editing.annual,
                          price_flat_monthly: editing.flatMonthly,
                          price_flat_annual: editing.flatAnnual,
                          max_users: editing.maxUsers,
                          price_per_seat: editing.pricePerSeat,
                          extra_seat_price: editing.extraSeatPrice,
                          extra_seat_threshold: editing.extraSeatThreshold,
                          monthly_item_limit: editing.monthlyItemLimit ? editing.monthlyItemLimit : null,
                          storage_limit_bytes: editing.storageLimitGb ? editing.storageLimitGb * 1073741824 : null,
                          monthly_ai_credits: editing.monthlyAiCredits ?? 0,
                          byok_ai_allowed: editing.byokAiAllowed ?? false,
                          is_active: editing.isActive,
                        }),
                      });
                      reload();
                      setEditing(null);
                    } catch (err: any) {
                      showAlert(`Failed to save: ${err?.message ?? 'Unknown error'}`);
                    }
                  }}
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── New Package Modal ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="w-[95vw] sm:max-w-md p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>New catalogue record</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 my-4">
            <Select value={newPkg.currency} onValueChange={currency => setNewPkg(pkg => ({ ...pkg, currency }))}>
              <SelectTrigger aria-label="New package currency"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="TZS">TZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
            </Select>
            {[
              { label: 'Package Name *', key: 'name', type: 'text' },
              { label: `Monthly price (${newPkg.currency})`, key: 'monthly', type: 'number' },
              { label: `Annual price (${newPkg.currency})`, key: 'annual', type: 'number' },
              { label: 'Max Users',         key: 'maxUsers', type: 'number' },
              { label: `Price per seat (${newPkg.currency}/mo, optional)`, key: 'pricePerSeat', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-semibold text-foreground block mb-1.5">{f.label}</label>
                <Input
                  type={f.type}
                  value={(newPkg as any)[f.key]}
                  onChange={e => setNewPkg(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  placeholder={f.key === 'name' ? 'Enterprise Plus' : undefined}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              type="button"
              size="sm"
              disabled={!newPkg.name.trim()}
              onClick={async () => {
                if (!newPkg.name.trim()) return;
                const code = newPkg.name.trim().toLowerCase().replace(/\s+/g, '-');
                try {
                  await apiFetch('/v1/packages', {
                    method: 'POST',
                    body: JSON.stringify({
                      code,
                      name: newPkg.name.trim(),
                      currency: newPkg.currency,
                      monthly_price: newPkg.monthly,
                      annual_price: newPkg.annual,
                      max_users: newPkg.maxUsers,
                      price_per_seat: newPkg.pricePerSeat > 0 ? newPkg.pricePerSeat : null,
                      features: ['Custom features'],
                      color: 'var(--teal)',
                      popular: false,
                      sort_order: 99,
                    }),
                  });
                  reload();
                  setNewPkg({ name: '', monthly: 0, annual: 0, maxUsers: 10, pricePerSeat: 0, currency: 'TZS' });
                  setShowAdd(false);
                } catch (err: any) {
                  showAlert(`Failed to create package: ${err?.message ?? 'Unknown error'}`);
                }
              }}
            >
              Create Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DOMAINS VIEW
══════════════════════════════════════════════════ */
/**
 * Custom domains, from platform_domains.
 *
 * Every state shown here is the outcome of a probe the API actually ran: the
 * TXT record was resolved, or a TLS handshake returned a certificate valid for
 * the host. A domain nobody has checked says so rather than appearing verified
 * or broken, and the SSL column shows the real expiry date off the certificate
 * rather than a boolean somebody set.
 */

