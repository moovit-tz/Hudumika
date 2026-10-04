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
import { LAUNCHER_APPS } from '../../components/LauncherApps.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { ALL_FEATURE_KEYS } from '@hudumika/types';
import {
  Badge, CoAv, PLAN_CFG, SUB_CFG,
  type Company, type Subscription, type Package, type Addon, type Domain,
  type SubStatus,
  COMPANIES, SUBSCRIPTIONS,
  mapAddonFromApi, fmtCurrency, fmtDate, coByID,
  Spark, PageHdr,
  DataTable, useSortState, sortedRows, TR, TD, ActBtn, StatCard,
} from './shared.js';
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SUBSCRIPTIONS VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
          placeholder="Search by companyâ€¦"
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportSubscriptions}><Icon name="download" size={12} style={{ marginRight:5 }}/>Export</button>
          <button type="button" className="btn btn-sm" style={{ color:'var(--ink3)' }} onClick={()=>setSelected(new Set())}>Clear</button>
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
              <TD><Badge cfg={PLAN_CFG[sub.plan]} /></TD>
              <TD><span style={{ fontSize:12, textTransform:'capitalize', color:'var(--ink2)' }}>{sub.billing}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(sub.start)}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(sub.end)}</span></TD>
              <TD right><span style={{ fontWeight:700, fontFamily:'var(--font)' }}>{sub.amount===0?'Free':fmtCurrency(sub.amount)}</span></TD>
              <TD><Badge cfg={SUB_CFG[sub.status]} /></TD>
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PACKAGES VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
// Same id â†’ display-name map every app launcher tile and sidebar already
// reads (LauncherApps.tsx) â€” reused here instead of a second, hand-guessed
// label set that would drift from it.
const APP_NAME_BY_ID: Record<string, string> = Object.fromEntries(LAUNCHER_APPS.map(a => [a.id, a.name]));
function humanize(s: string): string {
  return s.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
/** A dotted key ('tracking.cargo-loading') is a sub-feature of its prefix
 *  ('tracking') â€” ALL_FEATURE_KEYS already lists each parent immediately
 *  before its children, so rendering in array order and indenting whichever
 *  rows have a parent groups them correctly with no tree-building needed. */
function featureLabel(key: string): { parent: string | null; label: string } {
  const dot = key.indexOf('.');
  if (dot === -1) return { parent: null, label: APP_NAME_BY_ID[key] || humanize(key) };
  const parentKey = key.slice(0, dot);
  return { parent: APP_NAME_BY_ID[parentKey] || humanize(parentKey), label: humanize(key.slice(dot + 1)) };
}

/** Real, wired editor for which entitlement feature keys a package grants â€” PATCHes
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
          {saved ? 'Saved' : saving ? 'Savingâ€¦' : 'Save Gates'}
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
                      <span style={{ color:'var(--ink3)' }}>â€“</span> {label}
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

/** Real, wired editor for per-app monthly item quotas on a package â€” PATCHes
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
          {saved ? 'Saved' : saving ? 'Savingâ€¦' : 'Save Quotas'}
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
                      <span style={{ color:'var(--ink3)' }}>â€“</span> {label}
                      <span style={{ fontSize:10.5, color:'var(--ink3)' }}>({parent})</span>
                    </span>
                  ) : (
                    <span style={{ fontWeight:600 }}>{label}</span>
                  )}
                </TD>
                <TD right>
                  <Input
                    type="number" min={0} placeholder="âˆž"
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

export function PackagesView() {
  // null = still loading. Was seeded with the hardcoded PACKAGES sample
  // array and only overwritten `if (mapped.length)` â€” so every load of this
  // page first drew 4 fabricated cards with numbers that don't match any
  // real package (they haven't for a while: the real "scale" plan was
  // deactivated and its price changed to 299, and the real starter/growth/
  // enterprise prices are 3/10/50, not 6/18/0), then a moment later swapped
  // to whatever the real, *active* packages actually are (3 of them, not
  // 4 â€” "scale" is real but inactive, so /v1/packages correctly omits it).
  // That swap â€” a visibly different card count and different prices on
  // every single page load â€” is exactly what "packages keep changing"
  // describes. Loading state now, real data only, once. Now fetches
  // /v1/packages/all (every package, active or not) rather than the public
  // /v1/packages, since this console is where a dormant tier â€” the free
  // plan, legacy 'scale' â€” gets reactivated, not just where live ones get edited.
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [packagesError, setPackagesError] = useState(false);
  const [billing, setBilling] = useState<'monthly'|'annual'>('monthly');
  const [editing, setEditing] = useState<Package|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPkg, setNewPkg] = useState({ name:'', monthly:0, annual:0, maxUsers:10, pricePerSeat:0 });
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [addonsError, setAddonsError] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon|null>(null);

  // Load the canonical catalog from the API â€” shows a real error state on failure, no fabricated fallback.
  // Edit/Create/Deactivate below are wired to real endpoints (packages.routes.ts POST/PATCH/DELETE,
  // SuperAdmin-gated). The Feature Gates checklist in the edit modal is a separate, already-wired
  // endpoint (/v1/superadmin/packages/:code/features) â€” see FeatureGatesEditor below.
  function mapFromApi(pkg: { id:string; code:string; name:string; monthly_price:number; annual_price:number; max_users:number; price_per_seat:number|null; extra_seat_price:number|null; extra_seat_threshold:number|null; monthly_item_limit:number|null; storage_limit_bytes:number|null; monthly_ai_credits:number; byok_ai_allowed:boolean; features:string[]; color:string; popular:boolean; is_active:boolean }): Package {
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
      active: 0,
      // A package with no color set (onsite-standalone, agency-managed) used
      // to fall through to `${pkg.color}18` â†’ "null18" and an unset Icon
      // color, which is exactly how one plan card ended up a different,
      // unintended colour from the other three. Same real brand accent every
      // other package already uses, not a fresh arbitrary pick.
      color: pkg.color || 'var(--teal)',
      popular: pkg.popular,
      features: pkg.features,
      isActive: pkg.is_active,
    };
  }

  // /all (not the public / ) â€” SuperAdmin needs to see and reactivate
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

  useEffect(() => { reload(); reloadAddons(); }, []);

  return (
    <div>
      <PageHdr title="Subscription Packages" sub="Manage subscription plans and pricing"
        action={
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow:'hidden' }}>
              {(['monthly','annual'] as const).map(b=>(
                <button key={b} onClick={()=>setBilling(b)} style={{ padding:'var(--ds-btn-py-sm) 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:billing===b?'hsl(var(--primary))':'var(--white)', color:billing===b?'hsl(var(--primary-foreground))':'var(--ink3)', textTransform:'capitalize', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>{b}</button>
              ))}
            </div>
            <button onClick={()=>setShowAdd(true)} className="btn btn-primary btn-sm" style={{gap:6}}><Icon name="plus" size={13}/>New Package</button>
          </div>
        }
      />

      {packages === null && !packagesError && (
        <div style={{ padding:'32px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>Loading packagesâ€¦</div>
      )}
      {packagesError && (
        <div style={{ padding:'32px 0', textAlign:'center', color:'var(--red)', fontSize:13 }}>
          Couldn't load packages. <button onClick={reload} className="btn btn-secondary btn-sm" style={{ marginLeft:8 }}>Retry</button>
        </div>
      )}
      {packages !== null && packages.length === 0 && (
        <div style={{ padding:'32px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>No active packages configured yet.</div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:20 }}>
        {packages?.map(pkg=>(
          <div key={pkg.id} className="card" style={{ padding:'28px 26px', position:'relative', border:`2px solid ${pkg.popular&&pkg.isActive?pkg.color:'var(--border)'}`, opacity: pkg.isActive ? 1 : 0.6 }}>
            {pkg.popular && pkg.isActive && (
              <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:pkg.color, color:'#fff', fontSize:10, fontWeight:800, padding:'4px 14px', borderRadius:'var(--badge-radius)', whiteSpace:'nowrap', letterSpacing:'0.06em' }}>MOST POPULAR</div>
            )}
            {!pkg.isActive && (
              <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:'var(--ink3)', color:'#fff', fontSize:10, fontWeight:800, padding:'4px 14px', borderRadius:'var(--badge-radius)', whiteSpace:'nowrap', letterSpacing:'0.06em' }}>INACTIVE â€” hidden from signups</div>
            )}

            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius: 'var(--r)', background:`${pkg.color}18` }}>
                <Icon name="package" size={18} color={pkg.color} />
              </span>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--ink)' }}>{pkg.name}</div>
                <div style={{ fontSize:11, color:'var(--ink3)' }}>{pkg.maxUsers===0?'Unlimited':pkg.maxUsers} users max</div>
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                <span style={{ fontSize:32, fontWeight:900, color:pkg.color, letterSpacing:'-0.03em' }}>${billing==='monthly'?pkg.monthly:pkg.annual}</span>
                <span style={{ fontSize:13, color:'var(--ink3)' }}>/{billing==='monthly'?'mo':'yr'}</span>
              </div>
              {billing==='annual' && (
                <div style={{ fontSize:11, color:'var(--green)', fontWeight:600, marginTop:2 }}>Save ${(pkg.monthly*12-pkg.annual).toFixed(0)}/yr vs monthly</div>
              )}
              {pkg.pricePerSeat != null && (
                <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:6 }}>
                  Billed at <strong style={{ color:'var(--ink2)' }}>${pkg.pricePerSeat}/seat/mo</strong> â€” the real per-tenant charge
                  {pkg.extraSeatThreshold != null && pkg.extraSeatPrice != null && (
                    <> (${pkg.extraSeatPrice}/seat past seat {pkg.extraSeatThreshold})</>
                  )}
                </div>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {pkg.features.map(f=>(
                <div key={f} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <Icon name="check" size={14} color={pkg.color} style={{ flexShrink:0, marginTop:1 }} />
                  <span style={{ fontSize:12.5, color:'var(--ink2)' }}>{f}</span>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:16, borderTop:'1px solid var(--border)' }}>
              <span style={{ fontSize:12, color:'var(--ink3)' }}><strong style={{ color:'var(--ink)' }}>{pkg.active}</strong> active {pkg.active===1?'company':'companies'}</span>
              <button onClick={()=>setEditing(pkg)} className="btn btn-secondary btn-sm" style={{ gap:5 }}>
                <Icon name="edit" size={12} />Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Get more with add-ons â€” purchasable independent of which of the
          three base packages a tenant is on (376_package_addons.sql),
          the same idea as Google Workspace selling AI access or extra
          storage next to its own plan tiers rather than as a competing
          tier. Onsite lives here now instead of being a fourth package â€”
          it's for a narrow slice of tenants (agencies, web hosts/cloud
          infra teams, IT providers), not a general-audience tier.
          Used to render nothing at all â€” no header, no message â€” whenever
          `addons` was empty, which is indistinguishable on screen from
          "still loading" or "the fetch failed": always show the header now,
          and say which of those three states this actually is. */}
      <div style={{ marginTop:36 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)', marginBottom:4 }}>Get more with add-ons</div>
        <div style={{ fontSize:12.5, color:'var(--ink3)', marginBottom:16 }}>Purchasable on top of any package above â€” not a separate tier.</div>
        {addons === null && !addonsError && (
          <div style={{ padding:'16px 0', color:'var(--ink3)', fontSize:13 }}>Loading add-onsâ€¦</div>
        )}
        {addonsError && (
          <div style={{ padding:'16px 0', color:'var(--red)', fontSize:13 }}>
            Couldn't load add-ons. <button onClick={reloadAddons} className="btn btn-secondary btn-sm" style={{ marginLeft:8 }}>Retry</button>
          </div>
        )}
        {addons !== null && addons.length === 0 && !addonsError && (
          <div style={{ padding:'16px 0', color:'var(--ink3)', fontSize:13 }}>No add-ons configured yet.</div>
        )}
        {addons !== null && addons.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:14 }}>
            {addons.map(addon => (
              <div key={addon.id} className="card" style={{ padding:'18px 20px', display:'flex', gap:14, alignItems:'flex-start' }}>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius: 'var(--r)', background:`${addon.color}18`, flexShrink:0 }}>
                  <Icon name="globe" size={16} color={addon.color} />
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10 }}>
                    <span style={{ fontSize:14, fontWeight:800, color:'var(--ink)' }}>{addon.name}</span>
                    <span style={{ fontSize:15, fontWeight:800, color:addon.color, whiteSpace:'nowrap' }}>
                      ${billing==='monthly'?addon.monthly:addon.annual}<span style={{ fontSize:11, fontWeight:600, color:'var(--ink3)' }}>/{billing==='monthly'?'mo':'yr'}</span>
                    </span>
                  </div>
                  <p style={{ fontSize:12, color:'var(--ink2)', margin:'4px 0 10px', lineHeight:1.5 }}>{addon.description}</p>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                    <span style={{ fontSize:11.5, color:'var(--ink3)' }}><strong style={{ color:'var(--ink)' }}>{addon.activeCompanies}</strong> active {addon.activeCompanies===1?'company':'companies'}</span>
                    <button onClick={()=>setEditingAddon(addon)} className="btn btn-secondary btn-sm" style={{ gap:5 }}>
                      <Icon name="edit" size={12} />Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add-on edit modal â€” pricing/description only; an add-on has no
          user/storage tiers of its own to configure. */}
      <Dialog open={!!editingAddon} onOpenChange={o => { if (!o) setEditingAddon(null); }}>
        <DialogContent className="sm:max-w-md">
          {editingAddon && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Add-on â€” {editingAddon.name}</DialogTitle>
              </DialogHeader>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Monthly Price ($)</label>
                  <Input type="number" value={editingAddon.monthly} onChange={e=>setEditingAddon(p=>p?({...p,monthly:Number(e.target.value)}):p)} />
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Annual Price ($)</label>
                  <Input type="number" value={editingAddon.annual} onChange={e=>setEditingAddon(p=>p?({...p,annual:Number(e.target.value)}):p)} />
                </div>
              </div>
              <div style={{ marginTop:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Description â€” who this is for</label>
                <textarea
                  value={editingAddon.description}
                  onChange={e=>setEditingAddon(p=>p?({...p,description:e.target.value}):p)}
                  rows={3}
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius: 'var(--r)', fontSize:13, fontFamily:'var(--font)', color:'var(--ink)', resize:'vertical', boxSizing:'border-box' }}
                />
              </div>

              <DialogFooter className="sm:justify-between">
                <Button
                  type="button" variant="destructive" size="sm"
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
                <div style={{ display:'flex', gap:8 }}>
                  <Button type="button" variant="outline" size="sm" onClick={()=>setEditingAddon(null)}>Cancel</Button>
                  <Button
                    type="button" size="sm"
                    onClick={async () => {
                      try {
                        const updated = await apiFetch(`/v1/addons/${editingAddon.code}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            monthlyPrice: editingAddon.monthly, annualPrice: editingAddon.annual,
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

      {/* Edit modal â€” one scrollable dialog body (not two nested mini-scroll
          boxes), sticky title + footer, so Save/Deactivate are always
          reachable regardless of how tall the feature/quota tables get. */}
      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Package â€” {editing.name}</DialogTitle>
              </DialogHeader>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[
                  { label:'Monthly Price ($)',  key:'monthly', hint:undefined },
                  { label:'Annual Price ($)',   key:'annual',  hint:undefined },
                  { label:'Max Users', key:'maxUsers', hint:'0 = unlimited' },
                  { label:'Monthly item limit, all apps', key:'monthlyItemLimit', hint:'0 = unlimited' },
                  { label:'Storage limit, GB', key:'storageLimitGb', hint:'0 = unlimited' },
                  { label:'AI credits / month (platform-billed)', key:'monthlyAiCredits', hint:'0 = no platform AI on this tier' },
                ].map(f=>(
                  <div key={f.key}>
                    <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>
                      {f.label}{f.hint && <span style={{ fontWeight:400, color:'var(--ink3)' }}> ({f.hint})</span>}
                    </label>
                    <Input type="number" value={(editing as any)[f.key] ?? 0} onChange={e=>setEditing(p=>p?({...p,[f.key]:Number(e.target.value)}):p)} />
                  </div>
                ))}
              </div>

              {/* The real per-tenant charge (billing.routes.ts's computePlanAmount)
                  reads price_per_seat, not the flat monthly/annual figures above â€”
                  those were never editable anywhere in this console before now,
                  which is exactly why Subscription.tsx's own per-seat pricing has
                  had to be hand-migrated through SQL up to this point. */}
              <div style={{ marginTop:16, padding:'14px 16px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--bg)' }}>
                <FeatureToggleRow
                  icon={<Icon name="users" size={18} strokeWidth={1.75} />}
                  title="Per-seat pricing"
                  description={editing.pricePerSeat != null ? 'Billed per active user, every month.' : 'Off â€” flat/custom pricing (e.g. "Talk to Sales" tiers).'}
                  checked={editing.pricePerSeat != null}
                  onCheckedChange={(checked: boolean) => setEditing(p => p ? ({
                    ...p,
                    pricePerSeat: checked ? (p.pricePerSeat ?? 0) : null,
                    extraSeatPrice: checked ? p.extraSeatPrice : null,
                    extraSeatThreshold: checked ? p.extraSeatThreshold : null,
                  }) : p)}
                />
                {editing.pricePerSeat != null && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginTop:14 }}>
                    <div>
                      <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Price per seat ($/mo)</label>
                      <Input type="number" min={0} value={editing.pricePerSeat} onChange={e=>setEditing(p=>p?({...p,pricePerSeat:Number(e.target.value)}):p)} />
                    </div>
                    <div>
                      <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>
                        Discount past seat # <span style={{ fontWeight:400, color:'var(--ink3)' }}>(blank = none)</span>
                      </label>
                      <Input type="number" min={1} placeholder="e.g. 5" value={editing.extraSeatThreshold ?? ''} onChange={e=>setEditing(p=>p?({...p,extraSeatThreshold:e.target.value===''?null:Number(e.target.value)}):p)} />
                    </div>
                    <div>
                      <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Discounted seat price ($/mo)</label>
                      <Input type="number" min={0} placeholder="e.g. 4" value={editing.extraSeatPrice ?? ''} onChange={e=>setEditing(p=>p?({...p,extraSeatPrice:e.target.value===''?null:Number(e.target.value)}):p)} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop:12, padding:'2px 16px', border:'1px solid var(--border)', borderRadius: 'var(--r)'}}>
                <FeatureToggleRow
                  icon={<Icon name="eye" size={18} strokeWidth={1.75} />}
                  title="Active â€” visible to signups"
                  description={editing.isActive ? 'Live: tenants can pick this plan today.' : 'Dormant: hidden from signup/pricing, but any tenant already on it keeps working.'}
                  checked={editing.isActive}
                  onCheckedChange={(checked: boolean) => setEditing(p => p ? ({ ...p, isActive: checked }) : p)}
                />
              </div>

              <div style={{ marginTop:12, padding:'2px 16px', border:'1px solid var(--border)', borderRadius: 'var(--r)'}}>
                <FeatureToggleRow
                  icon={<Icon name="sparkle" size={18} strokeWidth={1.75} />}
                  title="Bring your own AI key (BYOK)"
                  description={editing.byokAiAllowed
                    ? 'On â€” a tenant on this tier can enter their own provider key in Settings, which always wins over the platform default and is billed to them directly, not against the AI-credits allowance above.'
                    : 'Off â€” a tenant on this tier can only use the platform-billed AI key (see AI credits/month above); any key they type in Settings is ignored.'}
                  checked={editing.byokAiAllowed}
                  onCheckedChange={(checked: boolean) => setEditing(p => p ? ({ ...p, byokAiAllowed: checked }) : p)}
                />
              </div>

              <FeatureGatesEditor packageCode={editing.code} />
              <AppQuotasEditor packageCode={editing.code} />

              <DialogFooter>
                <div style={{ display:'flex', gap:8 }}>
                  <Button type="button" variant="outline" size="sm" onClick={()=>setEditing(null)}>Cancel</Button>
                  <Button
                    type="button" size="sm"
                    onClick={async () => {
                      // Deactivating goes through the same PATCH as every other
                      // field now (the "Active" toggle above) instead of a
                      // separate destructive action â€” one save, one confirm,
                      // and reactivating (flip it back on, Save) works the same way.
                      if (!editing.isActive && packages?.find(pk => pk.id === editing.id)?.isActive) {
                        if (!(await showConfirm(`Deactivate the ${editing.name} package? It will stop appearing to new signups â€” any tenant already on it keeps working.`, { variant: 'warning', confirmLabel: 'Deactivate' }))) return;
                      }
                      try {
                        const updated = await apiFetch(`/v1/packages/${editing.code}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            monthly_price: editing.monthly, annual_price: editing.annual, max_users: editing.maxUsers,
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
                        setPackages(p => (p ?? []).map(pk => pk.id === editing.id ? mapFromApi(updated) : pk));
                        setEditing(null);
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

      {/* Add modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Package</DialogTitle>
          </DialogHeader>
          {[
            { label:'Package Name *', key:'name',     type:'text' },
            { label:'Monthly Price ($)', key:'monthly', type:'number' },
            { label:'Annual Price ($)',  key:'annual',  type:'number' },
            { label:'Max Users',         key:'maxUsers',type:'number' },
            { label:'Price per seat ($/mo, optional â€” 0 = flat/custom pricing)', key:'pricePerSeat', type:'number' },
          ].map(f=>(
            <div key={f.key}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>{f.label}</label>
              <Input type={f.type} value={(newPkg as any)[f.key]} onChange={e=>setNewPkg(p=>({...p,[f.key]:f.type==='number'?Number(e.target.value):e.target.value}))} placeholder={f.key==='name'?'Enterprise Plus':undefined} />
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={()=>setShowAdd(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!newPkg.name.trim()} onClick={async ()=>{
              if (!newPkg.name.trim()) return;
              const code = newPkg.name.trim().toLowerCase().replace(/\s+/g,'-');
              try {
                await apiFetch('/v1/packages', {
                  method: 'POST',
                  body: JSON.stringify({
                    code, name: newPkg.name.trim(),
                    monthly_price: newPkg.monthly, annual_price: newPkg.annual, max_users: newPkg.maxUsers,
                    price_per_seat: newPkg.pricePerSeat > 0 ? newPkg.pricePerSeat : null,
                    features: ['Custom features'], color: 'var(--teal)', popular: false, sort_order: 99,
                  }),
                });
                reload();
                setNewPkg({name:'',monthly:0,annual:0,maxUsers:10,pricePerSeat:0});
                setShowAdd(false);
              } catch (err: any) {
                showAlert(`Failed to create package: ${err?.message ?? 'Unknown error'}`);
              }
            }}>Create Package</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DOMAINS VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/**
 * Custom domains, from platform_domains.
 *
 * Every state shown here is the outcome of a probe the API actually ran: the
 * TXT record was resolved, or a TLS handshake returned a certificate valid for
 * the host. A domain nobody has checked says so rather than appearing verified
 * or broken, and the SSL column shows the real expiry date off the certificate
 * rather than a boolean somebody set.
 */

