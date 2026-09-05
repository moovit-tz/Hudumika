import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PersonAvatar, CompanyAvatar } from '../components/PersonAvatar.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import './SuperAdmin.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Combobox } from '../components/ui/combobox.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { FeatureToggleRow } from '../components/ui/list-item-row.js';
import { SectionCard } from '../components/SectionCard.js';
import { Switch } from '../components/ui/switch.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { LAUNCHER_APPS } from '../components/LauncherApps.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { PaginationBar } from '../components/PaginationBar.js';

/* ══════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════ */
type PlanId = 'starter' | 'growth' | 'scale' | 'enterprise';
type CoStatus = 'active' | 'inactive' | 'trial' | 'suspended';
type SubStatus = 'active' | 'expired' | 'trial' | 'cancelled';
type DomainStatus = 'active' | 'pending' | 'failed';
type TxStatus = 'completed' | 'pending' | 'failed' | 'refunded';
type PayMethod = 'card' | 'bank' | 'mpesa' | 'paypal';

interface Company { id:string; name:string; email:string; phone:string; plan:PlanId; users:number; status:CoStatus; domain:string; created:string; owner:string; country:string; color:string; logoUrl?:string; founderPersonalEmailDomain?:string|null; }
interface Subscription { id:string; companyId:string; plan:PlanId; start:string; end:string; amount:number; billing:'monthly'|'annual'; status:SubStatus; }
interface Package { id:string; code:string; name:string; monthly:number; annual:number; maxUsers:number; pricePerSeat:number|null; extraSeatPrice:number|null; extraSeatThreshold:number|null; monthlyItemLimit:number|null; storageLimitGb:number|null; features:string[]; active:number; color:string; popular?:boolean; isActive:boolean; }
/** Purchasable independent of which base Package a tenant is on
 *  (376_package_addons.sql) — Onsite's real home now, not a fourth
 *  competing base package. */
interface Addon { id:string; code:string; name:string; description:string; featureKey:string; monthly:number; annual:number; color:string; activeCompanies:number; }
/** Module-level so both PackagesView (catalog management) and CompaniesView
 *  (per-tenant grant/revoke) can shape the same GET /v1/addons response. */
function mapAddonFromApi(a: { id:string; code:string; name:string; description:string; featureKey:string; monthlyPrice:number; annualPrice:number; color:string|null; activeCompanies?:number }): Addon {
  return {
    id: a.id, code: a.code, name: a.name, description: a.description, featureKey: a.featureKey,
    monthly: a.monthlyPrice, annual: a.annualPrice, color: a.color || '#e8461a',
    activeCompanies: a.activeCompanies ?? 0,
  };
}
interface Domain { id:string; domain:string; companyId:string; status:DomainStatus; ssl:boolean; created:string; }
interface Transaction { id:string; txRef:string; companyId:string; plan:PlanId; amount:number; date:string; method:PayMethod; status:TxStatus; }

/* ══════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════ */
// Which plan a company is on isn't a status (unlike active/trial/suspended
// below) — it doesn't need its own hue per tier. One neutral treatment for
// every plan badge reads as "just information," not a rainbow of unrelated
// categories.
const PLAN_CFG: Record<PlanId,{label:string;color:string;bg:string}> = {
  starter:    { label:'HuduStarter',    color:'var(--ink2)', bg:'var(--bg)'  },
  growth:     { label:'HuduPlus',       color:'var(--ink2)', bg:'var(--bg)'  },
  scale:      { label:'Legacy Scale',   color:'var(--ink2)', bg:'var(--bg)'  },
  enterprise: { label:'Hudu Advanced',   color:'var(--ink2)', bg:'var(--bg)'  },
};
const CO_CFG: Record<CoStatus,{label:string;color:string;bg:string}> = {
  active:    { label:'Active',    color:'var(--green)', bg:'var(--green-l)' },
  inactive:  { label:'Inactive',  color:'var(--ink3)', bg:'var(--bg)' },
  trial:     { label:'Trial',     color:'var(--gold)', bg:'var(--gold-l)' },
  suspended: { label:'Suspended', color:'var(--red)', bg:'var(--red-l)' },
};
const SUB_CFG: Record<SubStatus,{label:string;color:string;bg:string}> = {
  active:    { label:'Active',    color:'var(--green)', bg:'var(--green-l)' },
  expired:   { label:'Expired',   color:'var(--red)', bg:'var(--red-l)' },
  trial:     { label:'Trial',     color:'var(--gold)', bg:'var(--gold-l)' },
  cancelled: { label:'Cancelled', color:'var(--ink3)', bg:'var(--bg)' },
};
const DOM_CFG: Record<DomainStatus,{label:string;color:string;bg:string}> = {
  active:  { label:'Verified',   color:'var(--green)', bg:'var(--green-l)' },
  pending: { label:'Unverified', color:'var(--gold)', bg:'var(--gold-l)' },
  failed:  { label:'Failed',     color:'var(--red)', bg:'var(--red-l)' },
};
const TX_CFG: Record<TxStatus,{label:string;color:string;bg:string}> = {
  completed: { label:'Completed', color:'var(--green)', bg:'var(--green-l)' },
  pending:   { label:'Pending',   color:'var(--gold)', bg:'var(--gold-l)' },
  failed:    { label:'Failed',    color:'var(--red)', bg:'var(--red-l)' },
  refunded:  { label:'Refunded',  color:'var(--blue)', bg:'var(--blue-l)' },
};
const METHOD_LABELS: Record<PayMethod,string> = { card:'Credit Card', bank:'Bank Transfer', mpesa:'M-Pesa', paypal:'PayPal' };

/* ══════════════════════════════════════════════════
   SAMPLE DATA
══════════════════════════════════════════════════ */
const COMPANIES: Company[] = [
  { id:'C1', name:'Summit Traders Ltd',     email:'admin@summit.co.tz',    phone:'+255 712 345 678', plan:'enterprise',   users:48, status:'active',    domain:'summit.clearos.app',    created:'2024-01-15', owner:'Amina Hassan',     country:'Tanzania', color:'#0d7a6b' },
  { id:'C2', name:'Serengeti Foods Co.',    email:'info@serengeti.co.tz',  phone:'+255 754 987 321', plan:'growth',     users:18, status:'active',    domain:'serengeti.clearos.app', created:'2024-02-08', owner:'John Mwangi',      country:'Tanzania', color:'#3b82f6' },
  { id:'C3', name:'Karibu Imports',         email:'ops@karibu.co.tz',      phone:'+255 767 111 222', plan:'starter',    users:5,  status:'trial',     domain:'karibu.clearos.app',    created:'2025-01-20', owner:'Grace Osei',       country:'Kenya',    color:'#a855f7' },
  { id:'C4', name:'East Africa Logistics',  email:'admin@eal.co.tz',       phone:'+255 788 456 789', plan:'enterprise', users:62, status:'active',    domain:'eal.clearos.app',       created:'2023-11-01', owner:'Peter Kimani',     country:'Tanzania', color:'var(--red)' },
  { id:'C5', name:'Kilimanjaro Mining Ltd', email:'info@kilimining.co.tz', phone:'+255 745 333 444', plan:'scale',      users:23, status:'active',    domain:'kilimining.clearos.app',created:'2024-04-12', owner:'Fatuma Ally',      country:'Tanzania', color:'var(--gold)' },
  { id:'C6', name:'Dar Port Agency',        email:'ops@darport.co.tz',     phone:'+255 712 999 888', plan:'starter',    users:8,  status:'inactive',  domain:'darport.clearos.app',   created:'2024-06-30', owner:'David Odhiambo',   country:'Tanzania', color:'#6366f1' },
  { id:'C7', name:'TZ Freight Solutions',   email:'admin@tzfreight.co.tz', phone:'+255 767 777 666', plan:'growth',     users:15, status:'active',    domain:'tzfreight.clearos.app', created:'2024-08-15', owner:'Amina Hassan',     country:'Tanzania', color:'#22c55e' },
  { id:'C8', name:'Coastal Clearers Ltd',   email:'info@coastal.co.tz',    phone:'+255 754 555 444', plan:'enterprise',   users:37, status:'suspended', domain:'coastal.clearos.app',   created:'2023-09-22', owner:'Beatrice Njoroge', country:'Kenya',    color:'#0891b2' },
];

const SUBSCRIPTIONS: Subscription[] = [
  { id:'S1', companyId:'C1', plan:'enterprise', start:'2024-01-15', end:'2025-01-15', amount:9990, billing:'annual',  status:'active'    },
  { id:'S2', companyId:'C2', plan:'growth',     start:'2024-02-08', end:'2025-02-08', amount:99,   billing:'monthly', status:'active'    },
  { id:'S3', companyId:'C3', plan:'starter',    start:'2025-01-20', end:'2025-02-20', amount:0,    billing:'monthly', status:'trial'     },
  { id:'S4', companyId:'C4', plan:'enterprise', start:'2023-11-01', end:'2024-11-01', amount:9990, billing:'annual',  status:'active'    },
  { id:'S5', companyId:'C5', plan:'scale',      start:'2024-04-12', end:'2025-04-12', amount:2990, billing:'annual',  status:'active'    },
  { id:'S6', companyId:'C6', plan:'starter',    start:'2024-06-30', end:'2025-06-30', amount:29,   billing:'monthly', status:'cancelled' },
  { id:'S7', companyId:'C7', plan:'growth',     start:'2024-08-15', end:'2025-08-15', amount:99,   billing:'monthly', status:'active'    },
  { id:'S8', companyId:'C8', plan:'enterprise', start:'2023-09-22', end:'2024-09-22', amount:9990, billing:'annual',  status:'cancelled' },
];

// The DOMAINS sample array lived here: ten fabricated hostnames, six of them
// claiming a valid SSL certificate. DomainsView reads platform_domains now,
// where every flag is the outcome of a real DNS or TLS probe.



// The icon shape (building/user/$/gear) already says which category an
// entry belongs to — a different hue per category on top of that was pure
// decoration, not information. One neutral treatment throughout.
const ACT_CFG: Record<ActivityType,{color:string;bg:string;icon:string}> = {
  company: { color:'var(--ink2)', bg:'var(--bg)', icon:'building'   },
  user:    { color:'var(--ink2)', bg:'var(--bg)', icon:'user'        },
  billing: { color:'var(--ink2)', bg:'var(--bg)', icon:'dollarSign'  },
  system:  { color:'var(--ink2)', bg:'var(--bg)', icon:'settings'    },
};

// The MOCK_ACTIVITY sample array lived here: twelve invented superadmin
// actions — refunds, password resets and SSL renewals that never happened,
// against companies that do not exist. ActivityView reads
// platform_activity_log now, which the superadmin routes write as they act.

/* ══════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════ */
function fmtCurrency(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
// A per-company hashed rainbow (8 unrelated hues keyed off the first letter
// of the name) used to color every avatar in this app — nothing to do with
// the company itself, just decoration. One consistent brand-accent tone
// reads as a considered product, not a random-color-per-row template.
function avColor(_n: string) { return 'var(--teal)'; }
function coByID(id: string) { return COMPANIES.find(c=>c.id===id)!; }

/* ── Status badge ── */
function Badge({ cfg }: { cfg:{label:string;color:string;bg:string} }) {
  return <span style={{ fontSize:11, fontWeight:700, color:cfg.color, background:cfg.bg, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap' }}>{cfg.label}</span>;
}

/* ── Company avatar ── */
// One consistent brand-tint treatment for every company, using the derived
// tint token (--teal-l) rather than a per-company hue — matches the "never
// hand-roll color-mix()/string-concat a tint" rule elsewhere in this
// codebase (appending an alpha suffix onto a var() string, e.g.
// `${color}22`, produces invalid CSS the moment color is a CSS variable
// rather than a raw hex literal, which is exactly what silently broke the
// tint here before).
function CoAv({ co, size=34 }: { co:Company|undefined; size?:number }) {
  return <CompanyAvatar name={co?.name ?? '?'} logoUrl={co?.logoUrl} size={size} shape="square" />;
}

/* ── Sparkline ── */
function Spark({ data, color='var(--teal)', width=100, height=28 }: { data:number[]; color?:string; width?:number; height?:number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), rng = max-min||1;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*width},${height - ((v-min)/rng)*height*0.82 - height*0.09}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow:'visible', display:'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Bar chart ── */
function BarChart({ data, color='var(--teal)', height=72 }: { data:{label:string;value:number}[]; color?:string; height?:number }) {
  const max = Math.max(...data.map(d=>d.value)) || 1;
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:height+18 }}>
      {data.map(d => (
        <div key={d.label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
          <div style={{ width:'100%', height, display:'flex', alignItems:'flex-end' }}>
            <div style={{ width:'100%', background:color, borderRadius:'3px 3px 0 0', height:`${(d.value/max)*100}%`, minHeight:3, opacity:0.85 }} />
          </div>
          <span style={{ fontSize:9, color:'var(--ink3)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Donut chart ── */
function DonutChart({ segments, size=110 }: { segments:{pct:number;color:string;label:string}[]; size?:number }) {
  const r = 36, c = 2*Math.PI*r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      {segments.map((seg, i) => {
        const dash = (seg.pct/100)*c;
        const el = <circle key={i} cx={50} cy={50} r={r} fill="none" stroke={seg.color} strokeWidth={16} strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={c/4-offset} />;
        offset += dash;
        return el;
      })}
      <circle cx={50} cy={50} r={28} fill="var(--white)" />
    </svg>
  );
}

/* ── KPI Card ── */
/**
 * `change` and `spark` are both optional, and both are omitted rather than
 * faked. Every one of these cards used to hard-code its own "vs last month"
 * delta — 19.01%, -12%, 6%, -8% — numbers nothing computed, sitting beside
 * real totals on the screen where platform decisions get made. A card with no
 * comparable prior period now simply shows the number.
 */
function KPICard({ title, value, change, icon, color, spark, hint, emptyHint }: {
  title:string; value:string; change?:number|null; icon:IconName; color:string; spark?:number[];
  /** Always shown — real context about the number, e.g. what the estimate is. */
  hint?:string;
  /** Shown only when there is no trend to draw, explaining the absence. */
  emptyHint?:string;
}) {
  const pos = (change ?? 0) >= 0;
  // A flat series is a straight line pretending to be a trend.
  const showSpark = !!spark && spark.length > 1 && new Set(spark).size > 1;
  const sub = hint ?? (showSpark ? undefined : emptyHint);
  return (
    <div className="card" style={{ padding:'20px 22px', flex:1 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>{title}</div>
          <div style={{ fontSize:26, fontWeight:800, color:'var(--ink)', letterSpacing:'-0.02em', lineHeight:1 }}>{value}</div>
          {change != null ? (
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:pos?'var(--green)':'var(--red)', display:'flex', alignItems:'center', gap:2 }}>
                <Icon name={pos?'arrowUp':'arrowDown'} size={11} color={pos?'var(--green)':'var(--red)'} />
                {Math.abs(change)}%
              </span>
              <span style={{ fontSize:11, color:'var(--ink3)' }}>vs last month</span>
            </div>
          ) : sub ? (
            <div style={{ fontSize:11, color:'var(--ink3)', marginTop:8 }}>{sub}</div>
          ) : null}
        </div>
        <div style={{ width:46, height:46, borderRadius: 9, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon name={icon} size={21} color={color} />
        </div>
      </div>
      {showSpark && <Spark data={spark!} color={color} />}
    </div>
  );
}

/* ── Page header ── */
/**
 * The platform console's page title.
 *
 * This was a private 20px <h1> — one of two copies that had grown alongside
 * the real PageHeader, which is why the SuperAdmin screens did not look like
 * the rest of the platform. It now delegates, so every view in this file
 * picks up the house style (plain face + Cormorant Garamond italic final
 * word in the app's colour) without touching a single call site.
 *
 * The final word becomes the emphasised one and is lowercased to match the
 * house style — "Purchase Transactions" reads as "Purchase transactions".
 * A one-word title has no plain part to pair with, so those call sites pass
 * a two-word title instead of relying on the split.
 */
function PageHdr({ title, sub, action }: { title:string; sub:string; action?:React.ReactNode }) {
  const words = title.trim().split(/\s+/);
  const em = words.pop() ?? title;
  return (
    <PageHeader
      crumbs={['Admin', title]}
      titlePlain={words.join(' ')}
      titleEm={em.toLowerCase()}
      subtitle={sub}
      actions={action}
    />
  );
}

/* ── Table wrapper ── */
function DataTable({ headers, children }: { headers:string[]; children:React.ReactNode }) {
  return (
    <div className="rtbl-wrap">
      <table className="rtbl">
        <thead>
          <tr style={{ background:'var(--bg)' }}>
            {headers.map(h=>(
              <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ── Table row hover ── */
function TR({ children, onClick }: { children:React.ReactNode; onClick?:()=>void }) {
  const [hov, setHov] = useState(false);
  return (
    <tr onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={onClick} style={{ background:hov?'var(--bg)':'transparent', transition:'background .1s', cursor:onClick?'pointer':undefined }}>
      {children}
    </tr>
  );
}

/* ── TD ── */
function TD({ children, right, nowrap }: { children:React.ReactNode; right?:boolean; nowrap?:boolean }) {
  return (
    <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--ink)', textAlign:right?'right':undefined, whiteSpace:nowrap?'nowrap':undefined }}>
      {children}
    </td>
  );
}

/* ── Action menu button ── */
function ActBtn({ icon, color, title, onClick }: { icon:IconName; color?:string; title:string; onClick:()=>void }) {
  const [hov, setHov] = useState(false);
  return (
    <button title={title} onClick={e=>{e.stopPropagation();onClick();}} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:hov?(color?`${color}18`:'var(--bg)'):'none', border:'none', borderRadius:'var(--r)', padding:5, cursor:'pointer', color:color||'var(--ink3)', display:'inline-flex', alignItems:'center', transition:'background .1s' }}>
      <Icon name={icon} size={14} color={color||'var(--ink3)'} />
    </button>
  );
}

/* ── Stat summary card ── */
function StatCard({ label, value }: { label:string; value:number|string; color?:string }) {
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 12, padding:'16px 20px', flex:1, boxShadow: 'var(--elev-sm, 0 1px 3px rgba(0, 0, 0, 0.03))' }}>
      <div style={{ fontSize:24, fontWeight:800, color:'var(--ink)' }}>{value}</div>
      <div style={{ fontSize:12.5, fontWeight:500, color:'var(--ink3)', marginTop:4 }}>{label}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DASHBOARD VIEW
══════════════════════════════════════════════════ */

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
    // fetched — the subtitle below says "(mock — API offline)" for that case.
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
    setShowEdit(true);
    apiFetch(`/v1/superadmin/tenants/${co.id}/apps`).then((r: any) => setEditEnabledApps(r.enabledApps || {})).catch(() => {});
    apiFetch(`/v1/superadmin/tenants/${co.id}/addons`).then((r: any) => setEditAddonGrants(r.addonGrants || {})).catch(() => {});
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
  // and permanently, irreversibly deleting a live tenant's entire dataset —
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
        sub={apiLoaded ? `${displayed.length} registered ${apiError ? '(mock — API offline)' : 'companies'}` : 'Loading…'}
        action={
          <div className="sa-toolbar-actions">
            {apiError && <span className="sa-toolbar-offline">API offline — showing mock data</span>}
            <button type="button" title="Refresh companies" onClick={load} className="btn btn-secondary btn-sm sa-btn-gap-sm"><Icon name="refresh" size={12}/>Refresh</button>
            <button type="button" title="Add company" onClick={()=>setShowAdd(true)} className="btn btn-primary btn-sm sa-btn-gap-md"><Icon name="plus" size={13}/>Add Company</button>
          </div>
        }
      />

      <div className="sa-toolbar">
        <div className="sa-toolbar-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search companies" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search companies…" className="input-field" />
        </div>
        <SingleSelectFilter
          label="Status" allLabel="All Status"
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          value={statusFilter === 'all' ? null : statusFilter} onChange={v => setStatusFilter((v ?? 'all') as any)}
        />
        <SingleSelectFilter
          label="Plan" allLabel="All Plans"
          options={(Object.keys(PLAN_CFG) as PlanId[]).map(k => ({ value: k, label: PLAN_CFG[k].label }))}
          value={planFilter === 'all' ? null : planFilter} onChange={v => setPlanFilter((v ?? 'all') as PlanId | 'all')}
        />
      </div>

      {!apiLoaded && (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)', fontSize:13 }}>Loading tenants…</div>
      )}

      {apiLoaded && (
        <DataTable headers={['Company','Contact','Plan','Users','Status','Domain','Created','Actions']}>
          {filtered.map(co=>(
            <TR key={co.id}>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <CoAv co={co} />
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontWeight:600 }}>{co.name}</span>
                      {co.founderPersonalEmailDomain && (
                        <span
                          title={`Signed up with a personal email (${co.founderPersonalEmailDomain}), not a verified work domain`}
                          style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:'2px 7px', color:'var(--gold)', background:'var(--gold-l)', whiteSpace:'nowrap' }}>
                          Personal email
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{co.id.length > 10 ? co.id.slice(0,8)+'…' : co.id}</div>
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
              <TD><span className="rtbl-truncate" style={{ fontSize:12, color:'var(--ink3)', fontFamily:'var(--mono)' }} title={co.domain}>{co.domain}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(co.created)}</span></TD>
              <TD>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button
                    type="button"
                    title={`Login as ${co.name}`}
                    disabled={!!impersonating}
                    onClick={() => handleImpersonate(co)}
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'var(--ds-btn-py-xs) 10px', borderRadius:'var(--r)', border:'1px solid var(--teal)', background:'var(--teal-l)', color:'var(--teal)', fontSize:11, fontWeight:700, cursor: impersonating ? 'not-allowed' : 'pointer', fontFamily:'var(--font)', opacity: impersonating===co.id ? 0.6 : 1, whiteSpace:'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    <Icon name="eye" size={11} color="var(--teal)" />
                    {impersonating === co.id ? 'Switching…' : 'Login As'}
                  </button>
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
            <tr><td colSpan={8} style={{ textAlign:'center', padding:'40px 0', color:'var(--ink3)', fontSize:13 }}>
              {!apiError && tenants.length === 0 ? 'No companies registered yet.' : 'No companies match your filters'}
            </td></tr>
          )}
        </DataTable>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          <div className="card" style={{ width:480, padding:28, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>Add Company</span>
              <button type="button" title="Close" onClick={()=>setShowAdd(false)} className="dp-close"><Icon name="close" size={16} /></button>
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
              <button type="button" title="Cancel" onClick={()=>setShowAdd(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="button" title="Add company" onClick={addCompany} className="btn btn-primary btn-sm" disabled={!form.name.trim()||!form.email.trim()}>Add Company</button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="modal-overlay" onClick={()=>setShowEdit(false)}>
          <div className="card" style={{ width:480, padding:28, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>Edit Company</span>
              <button type="button" title="Close" onClick={()=>setShowEdit(false)} className="dp-close"><Icon name="close" size={16} /></button>
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
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, padding:12, background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)' }}>
                {TENANT_APPS.map(app => {
                  const enabled = editEnabledApps[app.id] !== false;
                  return (
                    <label key={app.id} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, color:'var(--ink)', cursor:'pointer', padding:'3px 0' }}>
                      <input type="checkbox" checked={enabled}
                        onChange={e => setEditEnabledApps(p => ({ ...p, [app.id]: e.target.checked }))} />
                      {app.name}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Add-ons (376_package_addons.sql) — granted independent of the
                plan above, e.g. Onsite for an agency/web-host/IT-provider
                tenant. Mirrors the Enabled Apps grid exactly. */}
            {addonsCatalog.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:8 }}>Add-ons</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, padding:12, background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)' }}>
                  {addonsCatalog.map(addon => {
                    const granted = editAddonGrants[addon.code] === true;
                    return (
                      <label key={addon.code} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, color:'var(--ink)', cursor:'pointer', padding:'3px 0' }}>
                        <input type="checkbox" checked={granted}
                          onChange={e => setEditAddonGrants(p => ({ ...p, [addon.code]: e.target.checked }))} />
                        {addon.name} <span style={{ color:'var(--ink3)' }}>(${addon.monthly}/mo)</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:22 }}>
              <button type="button" title="Cancel" onClick={()=>setShowEdit(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="button" title="Save changes" onClick={saveEditCompany} className="btn btn-primary btn-sm" disabled={!editForm.name.trim()}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {customersCo && (
        <div className="modal-overlay" onClick={()=>setCustomersCo(null)}>
          <div className="card" style={{ width:640, padding:28, maxHeight:'85vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, gap:10 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>{customersCo.name} — Customers</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button type="button" title="Retag customer/shipment Cloud folders created before entity linking existed" disabled={resyncingCloud}
                  onClick={handleResyncCloudLinks} className="btn btn-secondary btn-sm">
                  {resyncingCloud ? 'Resyncing…' : 'Resync Cloud Links'}
                </button>
                <button type="button" title="Close" onClick={()=>setCustomersCo(null)} className="dp-close"><Icon name="close" size={16} /></button>
              </div>
            </div>
            {loadingCustomers ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--ink3)', fontSize:13 }}>Loading customers…</div>
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
                      <div style={{ fontSize:12 }}>{cust.email || '—'}</div>
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
                        {impersonatingCustomerId === cust.id ? 'Switching…' : 'Login As Customer'}
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

/* ══════════════════════════════════════════════════
   SUBSCRIPTIONS VIEW
══════════════════════════════════════════════════ */
export function SubscriptionsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubStatus|'all'>('all');

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

  return (
    <div>
      <PageHdr title="Company Subscriptions" sub="All company subscription plans and billing status" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Subscriptions" value={counts.total}   color="var(--teal)"  />
        <StatCard label="Active"               value={counts.active}  color="var(--green)"      />
        <StatCard label="Trial"                value={counts.trial}   color="var(--gold)"      />
        <StatCard label="Expired / Cancelled"  value={counts.expired} color="var(--red)"      />
      </div>

      <div className="sa-toolbar">
        <div className="sa-toolbar-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search by company" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by company…" className="input-field" />
        </div>
        <SingleSelectFilter
          label="Status" allLabel="All Status"
          options={(Object.keys(SUB_CFG) as SubStatus[]).map(k => ({ value: k, label: SUB_CFG[k].label }))}
          value={statusFilter === 'all' ? null : statusFilter} onChange={v => setStatusFilter((v ?? 'all') as SubStatus | 'all')}
        />
      </div>

      <DataTable headers={['Company','Plan','Billing','Start Date','End Date','Amount','Status','Actions']}>
        {filtered.map(sub=>{
          const co = coByID(sub.companyId);
          return (
            <TR key={sub.id}>
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
              <TD right><span style={{ fontWeight:700, fontFamily:'var(--mono)' }}>{sub.amount===0?'Free':fmtCurrency(sub.amount)}</span></TD>
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
      </DataTable>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PACKAGES VIEW
══════════════════════════════════════════════════ */
const ALL_FEATURE_KEYS = [
  'ai', 'clearos', 'cloud', 'complyos', 'contacts', 'email', 'finops', 'ondi', 'nexushr', 'tracking',
  'tracking.cargo-loading', 'tracking.warehouse', 'tracking.analytics', 'tracking.reports',
  'demurrage', 'cargotracker', 'petti', 'notes', 'sign', 'sms',
];

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
        <div style={{ fontSize:12, color:'var(--ink3)', padding:'10px 0' }}>Loading…</div>
      ) : (
        <DataTable headers={['Feature', 'Enabled']}>
          {ALL_FEATURE_KEYS.map(key => {
            const { parent, label } = featureLabel(key);
            return (
              <TR key={key} onClick={() => toggleKey(key)}>
                <TD>
                  {parent ? (
                    <span style={{ display:'inline-flex', alignItems:'baseline', gap:6, paddingLeft:18, fontSize:12.5, color:'var(--ink2)' }}>
                      <span style={{ color:'var(--ink4)' }}>–</span> {label}
                      <span style={{ fontSize:10.5, color:'var(--ink4)' }}>({parent})</span>
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
        <div style={{ fontSize:12, color:'var(--ink3)', padding:'10px 0' }}>Loading…</div>
      ) : (
        <DataTable headers={['App', 'Monthly limit']}>
          {ALL_FEATURE_KEYS.map(key => {
            const { parent, label } = featureLabel(key);
            return (
              <TR key={key}>
                <TD>
                  {parent ? (
                    <span style={{ display:'inline-flex', alignItems:'baseline', gap:6, paddingLeft:18, fontSize:12.5, color:'var(--ink2)' }}>
                      <span style={{ color:'var(--ink4)' }}>–</span> {label}
                      <span style={{ fontSize:10.5, color:'var(--ink4)' }}>({parent})</span>
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
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [packagesError, setPackagesError] = useState(false);
  const [billing, setBilling] = useState<'monthly'|'annual'>('monthly');
  const [editing, setEditing] = useState<Package|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPkg, setNewPkg] = useState({ name:'', monthly:0, annual:0, maxUsers:10, pricePerSeat:0 });
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [addonsError, setAddonsError] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon|null>(null);

  // Load the canonical catalog from the API — shows a real error state on failure, no fabricated fallback.
  // Edit/Create/Deactivate below are wired to real endpoints (packages.routes.ts POST/PATCH/DELETE,
  // SuperAdmin-gated). The Feature Gates checklist in the edit modal is a separate, already-wired
  // endpoint (/v1/superadmin/packages/:code/features) — see FeatureGatesEditor below.
  function mapFromApi(pkg: { id:string; code:string; name:string; monthly_price:number; annual_price:number; max_users:number; price_per_seat:number|null; extra_seat_price:number|null; extra_seat_threshold:number|null; monthly_item_limit:number|null; storage_limit_bytes:number|null; features:string[]; color:string; popular:boolean; is_active:boolean }): Package {
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
      active: 0,
      // A package with no color set (onsite-standalone, agency-managed) used
      // to fall through to `${pkg.color}18` → "null18" and an unset Icon
      // color, which is exactly how one plan card ended up a different,
      // unintended colour from the other three. Same real brand accent every
      // other package already uses, not a fresh arbitrary pick.
      color: pkg.color || '#e8461a',
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

  useEffect(() => { reload(); reloadAddons(); }, []);

  return (
    <div>
      <PageHdr title="Subscription Packages" sub="Manage subscription plans and pricing"
        action={
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
              {(['monthly','annual'] as const).map(b=>(
                <button key={b} onClick={()=>setBilling(b)} style={{ padding:'var(--ds-btn-py-sm) 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:billing===b?'var(--teal)':'var(--white)', color:billing===b?'#fff':'var(--ink3)', textTransform:'capitalize', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>{b}</button>
              ))}
            </div>
            <button onClick={()=>setShowAdd(true)} className="btn btn-primary btn-sm" style={{gap:6}}><Icon name="plus" size={13}/>New Package</button>
          </div>
        }
      />

      {packages === null && !packagesError && (
        <div style={{ padding:'32px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>Loading packages…</div>
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
              <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:pkg.color, color:'#fff', fontSize:10, fontWeight:800, padding:'4px 14px', borderRadius:20, whiteSpace:'nowrap', letterSpacing:'0.06em' }}>MOST POPULAR</div>
            )}
            {!pkg.isActive && (
              <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:'var(--ink3)', color:'#fff', fontSize:10, fontWeight:800, padding:'4px 14px', borderRadius:20, whiteSpace:'nowrap', letterSpacing:'0.06em' }}>INACTIVE — hidden from signups</div>
            )}

            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius: 9, background:`${pkg.color}18` }}>
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
                  Billed at <strong style={{ color:'var(--ink2)' }}>${pkg.pricePerSeat}/seat/mo</strong> — the real per-tenant charge
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

      {/* Get more with add-ons — purchasable independent of which of the
          three base packages a tenant is on (376_package_addons.sql),
          the same idea as Google Workspace selling AI access or extra
          storage next to its own plan tiers rather than as a competing
          tier. Onsite lives here now instead of being a fourth package —
          it's for a narrow slice of tenants (agencies, web hosts/cloud
          infra teams, IT providers), not a general-audience tier.
          Used to render nothing at all — no header, no message — whenever
          `addons` was empty, which is indistinguishable on screen from
          "still loading" or "the fetch failed": always show the header now,
          and say which of those three states this actually is. */}
      <div style={{ marginTop:36 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)', marginBottom:4 }}>Get more with add-ons</div>
        <div style={{ fontSize:12.5, color:'var(--ink3)', marginBottom:16 }}>Purchasable on top of any package above — not a separate tier.</div>
        {addons === null && !addonsError && (
          <div style={{ padding:'16px 0', color:'var(--ink3)', fontSize:13 }}>Loading add-ons…</div>
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
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:9, background:`${addon.color}18`, flexShrink:0 }}>
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

      {/* Add-on edit modal — pricing/description only; an add-on has no
          user/storage tiers of its own to configure. */}
      <Dialog open={!!editingAddon} onOpenChange={o => { if (!o) setEditingAddon(null); }}>
        <DialogContent className="sm:max-w-md">
          {editingAddon && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Add-on — {editingAddon.name}</DialogTitle>
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
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>Description — who this is for</label>
                <textarea
                  value={editingAddon.description}
                  onChange={e=>setEditingAddon(p=>p?({...p,description:e.target.value}):p)}
                  rows={3}
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'var(--font)', color:'var(--ink)', resize:'vertical', boxSizing:'border-box' }}
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

      {/* Edit modal — one scrollable dialog body (not two nested mini-scroll
          boxes), sticky title + footer, so Save/Deactivate are always
          reachable regardless of how tall the feature/quota tables get. */}
      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Package — {editing.name}</DialogTitle>
              </DialogHeader>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[
                  { label:'Monthly Price ($)',  key:'monthly', hint:undefined },
                  { label:'Annual Price ($)',   key:'annual',  hint:undefined },
                  { label:'Max Users', key:'maxUsers', hint:'0 = unlimited' },
                  { label:'Monthly item limit, all apps', key:'monthlyItemLimit', hint:'0 = unlimited' },
                  { label:'Storage limit, GB', key:'storageLimitGb', hint:'0 = unlimited' },
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
                  reads price_per_seat, not the flat monthly/annual figures above —
                  those were never editable anywhere in this console before now,
                  which is exactly why Subscription.tsx's own per-seat pricing has
                  had to be hand-migrated through SQL up to this point. */}
              <div style={{ marginTop:16, padding:'14px 16px', border:'1px solid var(--border)', borderRadius:9, background:'var(--bg)' }}>
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

              <div style={{ marginTop:12, padding:'2px 16px', border:'1px solid var(--border)', borderRadius:9 }}>
                <FeatureToggleRow
                  icon={<Icon name="eye" size={18} strokeWidth={1.75} />}
                  title="Active — visible to signups"
                  description={editing.isActive ? 'Live: tenants can pick this plan today.' : 'Dormant: hidden from signup/pricing, but any tenant already on it keeps working.'}
                  checked={editing.isActive}
                  onCheckedChange={(checked: boolean) => setEditing(p => p ? ({ ...p, isActive: checked }) : p)}
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
                      // separate destructive action — one save, one confirm,
                      // and reactivating (flip it back on, Save) works the same way.
                      if (!editing.isActive && packages?.find(pk => pk.id === editing.id)?.isActive) {
                        if (!(await showConfirm(`Deactivate the ${editing.name} package? It will stop appearing to new signups — any tenant already on it keeps working.`, { variant: 'warning', confirmLabel: 'Deactivate' }))) return;
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
            { label:'Price per seat ($/mo, optional — 0 = flat/custom pricing)', key:'pricePerSeat', type:'number' },
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
export function DomainsView() {
  const [domains, setDomains] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DomainStatus|'all'>('all');
  const [adding, setAdding] = useState(false);
  const [newHost, setNewHost] = useState('');
  const [newTenant, setNewTenant] = useState('');

  const load = React.useCallback(async () => {
    setLoadError('');
    try {
      const [d, t] = await Promise.all([
        apiFetch('/v1/superadmin/domains'),
        apiFetch('/v1/superadmin/tenants'),
      ]);
      setDomains(d?.data ?? []);
      setTenants(Array.isArray(t) ? t : (t?.data ?? []));
    } catch (e: any) { setLoadError(e?.message ?? 'Could not load domains.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(key: string, fn: () => Promise<any>) {
    setBusy(key); setLoadError('');
    try { await fn(); await load(); }
    catch (e: any) { setLoadError(e?.message ?? 'That did not work.'); }
    finally { setBusy(''); }
  }

  const filtered = useMemo(()=>
    domains.filter(d=>{
      if (statusFilter!=='all' && d.status!==statusFilter) return false;
      if (search && !d.domain.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  [domains, search, statusFilter]);

  const stats = useMemo(()=>({
    total:    domains.length,
    verified: domains.filter(d=>d.status==='active').length,
    ssl:      domains.filter(d=>d.ssl_ok).length,
    unchecked:domains.filter(d=>d.never_checked).length,
  }),[domains]);

  if (loading) return <div style={{ padding:30, color:'var(--ink3)' }}>Loading domains…</div>;

  return (
    <div>
      <PageHdr title="Custom Domains" sub="Custom domains across all companies, and what the last DNS and TLS check actually found" />

      {loadError && (
        <div style={{ padding:'10px 13px', borderRadius:10, background:'var(--red-l)', color:'var(--red)', fontSize:12.5, marginBottom:14 }}>{loadError}</div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Domains"  value={stats.total}     color="var(--teal)"   />
        <StatCard label="Verified"       value={stats.verified}  color="var(--green)"  />
        {/* Counts certificates actually seen, not domains someone ticked. */}
        <StatCard label="Serving TLS"    value={stats.ssl}       color="var(--green)" />
        <StatCard label="Never checked"  value={stats.unchecked} color="var(--gold)"   />
      </div>

      <div className="sa-toolbar">
        <div className="sa-toolbar-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search domains" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search domains…" className="input-field" />
        </div>
        <SingleSelectFilter
          label="Status" allLabel="All Status"
          options={(Object.keys(DOM_CFG) as DomainStatus[]).map(k => ({ value: k, label: DOM_CFG[k].label }))}
          value={statusFilter === 'all' ? null : statusFilter} onChange={v => setStatusFilter((v ?? 'all') as DomainStatus | 'all')}
        />
        <button type="button" className="btn btn-primary" style={{ marginLeft:'auto' }} onClick={()=>setAdding(a=>!a)}>
          {adding ? 'Cancel' : '+ Add domain'}
        </button>
      </div>

      {adding && (
        <div className="card" style={{ padding:16, marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:'1 1 240px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:'var(--ink3)', marginBottom:4 }}>Hostname</div>
            <input className="input-field" value={newHost} onChange={e=>setNewHost(e.target.value)} placeholder="clearance.example.com" />
          </div>
          <div style={{ flex:'1 1 200px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:'var(--ink3)', marginBottom:4 }}>Company</div>
            <Combobox
              options={tenants.map((t:any) => ({ value: t.id, label: t.name }))}
              value={newTenant}
              onChange={setNewTenant}
              placeholder="Choose a company…"
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={!newHost.trim() || !newTenant || !!busy}
            onClick={()=>act('add', async () => {
              await apiFetch('/v1/superadmin/domains', { method:'POST', body: JSON.stringify({ tenant_id:newTenant, domain:newHost.trim() }) });
              setNewHost(''); setAdding(false);
            })}>
            {busy==='add' ? 'Adding…' : 'Add domain'}
          </button>
          <div style={{ flexBasis:'100%', fontSize:11.5, color:'var(--ink3)' }}>
            Added unverified. The company publishes the TXT token it is given, then Check confirms it — nothing is marked verified before that.
          </div>
        </div>
      )}

      {domains.length === 0 ? (
        <div className="card" style={{ padding:40, textAlign:'center' }}>
          <Icon name="globe" size={22} color="var(--ink3)" />
          <div style={{ fontSize:13.5, color:'var(--ink2)', marginTop:10 }}>No custom domains registered.</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:4 }}>Companies reach the platform on its default hostname until one is added here.</div>
        </div>
      ) : (
      <DataTable headers={['Domain','Company','TLS certificate','Status','Last checked','Actions']}>
        {filtered.map(d=>(
          <TR key={d.id}>
            <TD>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:6, background:'var(--bg)' }}>
                  <Icon name="globe" size={14} color="var(--teal)" />
                </span>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>{d.domain}</div>
                  {!d.dns_ok && (
                    <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:'var(--ink3)' }}>TXT {d.verification_token}</div>
                  )}
                </div>
              </div>
            </TD>
            <TD><span style={{ fontSize:13 }}>{d.tenant_name ?? 'company no longer on file'}</span></TD>
            <TD>
              {/* Only a handshake that returned a trusted certificate says
                  anything here, and it says when that certificate expires. */}
              {d.ssl_ok
                ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--green)', background:'var(--green-l)', padding:'3px 8px', borderRadius:20 }}>
                    <Icon name="lock" size={10} color="var(--green)" />
                    expires {d.ssl_expires_at ? fmtDate(d.ssl_expires_at) : 'unknown'}
                  </span>
                : d.never_checked
                  ? <span style={{ fontSize:11.5, color:'var(--ink3)' }}>not checked yet</span>
                  : <span style={{ fontSize:11, fontWeight:700, color:'var(--red)', background:'var(--red-l)', padding:'3px 8px', borderRadius:20 }}>no certificate</span>}
            </TD>
            <TD>
              <Badge cfg={DOM_CFG[d.status as DomainStatus]} />
              {d.last_error && (
                <div style={{ fontSize:10.5, color:'var(--ink3)', marginTop:3, maxWidth:260 }}>{d.last_error}</div>
              )}
            </TD>
            <TD nowrap>
              <span style={{ fontSize:12, color:'var(--ink3)' }}>
                {d.last_checked_at ? fmtDate(d.last_checked_at) : 'never'}
              </span>
            </TD>
            <TD>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button type="button" className="btn" style={{ fontSize:11, padding:'var(--ds-btn-py-xs) 9px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                  disabled={busy==='chk'+d.id}
                  onClick={()=>act('chk'+d.id, ()=>apiFetch(`/v1/superadmin/domains/${d.id}/check`, { method:'POST', body:'{}' }))}>
                  {busy==='chk'+d.id ? 'Checking…' : 'Check'}
                </button>
                <ActBtn icon="trash" color="var(--red)" title="Remove"
                  onClick={()=>act('del'+d.id, ()=>apiFetch(`/v1/superadmin/domains/${d.id}`, { method:'DELETE' }))} />
              </div>
            </TD>
          </TR>
        ))}
      </DataTable>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TRANSACTIONS VIEW
══════════════════════════════════════════════════ */
export function TransactionsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TxStatus|'all'>('all');

  // Real platform_transactions. This screen previously rendered the hardcoded
  // TRANSACTIONS sample array — eleven 2025 payments for companies that do not
  // exist, $43,346 of revenue that was never collected.
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/superadmin/transactions?limit=500')
      .then((r: any) => { if (alive) { setRows(r?.data ?? []); setTotals(r?.totals ?? null); } })
      .catch((e: any) => { if (alive) setLoadError(e?.message ?? 'Could not load transactions.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(()=>
    rows.filter(t=>{
      if (statusFilter!=='all' && t.status!==statusFilter) return false;
      const q = search.trim().toLowerCase();
      if (q && !(t.companyName ?? '').toLowerCase().includes(q)
            && !(t.txRef ?? '').toLowerCase().includes(q)
            && !(t.payerName ?? '').toLowerCase().includes(q)) return false;
      return true;
    }),
  [rows, search, statusFilter]);

  function exportCsv() {
    const head = ['Ref','Company','Package','Amount','Currency','Date','Method','Status','Payer'];
    const body = filtered.map(t => [t.txRef, t.companyName ?? '', t.packageCode ?? '', t.amount, t.currency,
      new Date(t.created).toISOString().slice(0,10), t.method ?? '', t.status, t.payerName ?? '']);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head, ...body].map(r => r.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `platform-transactions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHdr title="Purchase Transactions" sub="All billing transactions across the platform"
        action={<button className="btn btn-secondary btn-sm" style={{gap:6}} onClick={exportCsv} disabled={filtered.length===0}><Icon name="download" size={13}/>Export CSV</button>}
      />

      {loadError && <div style={{ color:'var(--red)', fontSize:13, marginBottom:14 }}>{loadError}</div>}

      {/* Counts are over the whole table, not the filtered page. */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Revenue Collected" value={fmtCurrency(totals?.completed ?? 0)} color="var(--teal)"  />
        <StatCard label="Completed"         value={totals?.completedCount ?? 0}         color="var(--green)" />
        <StatCard label="Pending"           value={totals?.pendingCount ?? 0}           color="var(--gold)"  />
        <StatCard label="Failed"            value={totals?.failedCount ?? 0}            color="var(--red)"   />
      </div>

      <div className="sa-toolbar">
        <div className="sa-toolbar-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search company or ref" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search company or Ref…" className="input-field" />
        </div>
        <SingleSelectFilter
          label="Status" allLabel="All Status"
          options={(Object.keys(TX_CFG) as TxStatus[]).map(k => ({ value: k, label: TX_CFG[k].label }))}
          value={statusFilter === 'all' ? null : statusFilter} onChange={v => setStatusFilter((v ?? 'all') as TxStatus | 'all')}
        />
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--ink3)', fontSize:13 }}>Loading transactions…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding:'34px 22px', textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:650, color:'var(--ink)' }}>
            {rows.length === 0 ? 'No platform payments recorded yet.' : 'No transactions match these filters.'}
          </div>
          <div style={{ fontSize:12.5, color:'var(--ink3)', marginTop:5 }}>
            {rows.length === 0 ? 'Payments appear here as tenants subscribe.' : 'Try clearing the search or status filter.'}
          </div>
        </div>
      ) : (
      <DataTable headers={['Ref','Company','Package','Amount','Date','Method','Status']}>
        {filtered.map(tx=>(
          <TR key={tx.id}>
            <TD><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--ink3)' }}>{tx.txRef}</span></TD>
            <TD>
              <span style={{ fontWeight:600, fontSize:13 }}>{tx.companyName || 'Deleted company'}</span>
              {tx.payerName && <span style={{ display:'block', fontSize:11, color:'var(--ink3)' }}>{tx.payerName}</span>}
            </TD>
            {/* The package actually paid for, from the transaction — not the
                tenant's current plan, which can differ from what this payment bought. */}
            <TD><span style={{ fontSize:12, color:'var(--ink2)' }}>{tx.packageCode ?? '—'}{tx.billingCycle ? ` · ${tx.billingCycle}` : ''}</span></TD>
            <TD right><span style={{ fontWeight:700, fontFamily:'var(--mono)' }}>{tx.currency} {Number(tx.amount).toLocaleString()}</span></TD>
            <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(tx.created)}</span></TD>
            <TD><span style={{ fontSize:12, color:'var(--ink2)' }}>{METHOD_LABELS[tx.method as PayMethod] ?? tx.method ?? '—'}</span></TD>
            <TD><Badge cfg={TX_CFG[tx.status as TxStatus] ?? TX_CFG.completed} /></TD>
          </TR>
        ))}
      </DataTable>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   FINANCE VIEW
══════════════════════════════════════════════════ */

/**
 * Two different things live on this page and they used to be conflated:
 *
 *  - what the platform has actually been paid (platform_transactions), and
 *  - what it would bill in a month if every active tenant paid list price
 *    (a run-rate estimate).
 *
 * Neither used to be shown. MRR, ARR, "Total Revenue Collected: $21,046",
 * "Active Paid Subscribers: 5", the 12-month MRR trend and the whole per-plan
 * breakdown were all hardcoded literals with invented +8.2%/-4.1% deltas.
 */
export function FinanceView() {
  const [tx, setTx] = useState<{ data: any[]; totals: any; monthly: any[] } | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch('/v1/superadmin/transactions?limit=1000'),
      apiFetch('/v1/superadmin/dashboard-stats'),
    ])
      .then(([t, s]: any[]) => { if (alive) { setTx(t); setStats(s); } })
      .catch((e: any) => { if (alive) setError(e?.message ?? 'Could not load finance data.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Money received, by the package each payment actually bought.
  const byPackage = useMemo(() => {
    const m = new Map<string, { code: string; total: number; count: number }>();
    for (const t of tx?.data ?? []) {
      if (t.status !== 'completed') continue;
      const code = t.packageCode ?? 'unknown';
      const cur = m.get(code) ?? { code, total: 0, count: 0 };
      cur.total += Number(t.amount); cur.count += 1;
      m.set(code, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [tx]);

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading finance data…</div>;
  if (error)   return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--red)' }}>{error}</div>;

  const collected = tx?.totals?.completed ?? 0;
  const paidCount = tx?.totals?.completedCount ?? 0;
  const runRate   = stats?.kpis?.totalEarnings ?? 0;
  // m.month is "YYYY-MM"; label it "Jul" rather than "07".
  const trend = (tx?.monthly ?? []).map((m: any) => ({
    label: new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' }),
    value: m.total,
  }));
  const noHistory = (stats?.monthsWithData ?? 0) < 2 ? 'not enough history yet' : undefined;
  const collectedTotal = byPackage.reduce((s, p) => s + p.total, 0);

  return (
    <div>
      <PageHdr title="Platform Finance" sub="Platform billing — what has been received, and what active plans would bill" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Revenue Collected"      value={fmtCurrency(collected)} icon="dollarSign" color="var(--teal)"
                 spark={trend.map((d: any) => d.value)} emptyHint={noHistory} />
        <KPICard title="Payments Received"      value={String(paidCount)}      icon="receipt"    color="var(--teal)"
                 hint={`${tx?.totals?.allCount ?? 0} transactions in total`} />
        {/* Named an estimate on the card, because it is one: list price for
            every active tenant, whether or not they have ever paid. */}
        <KPICard title="Run Rate (list price)"  value={fmtCurrency(runRate)}   icon="trendingUp" color="var(--teal)"
                 hint="estimate — active tenants at list price" />
        <KPICard title="Paying Companies"       value={String(new Set((tx?.data ?? []).filter((t: any) => t.status === 'completed').map((t: any) => t.companyId)).size)}
                 icon="building" color="var(--teal)" hint={`of ${stats?.kpis?.activeCompanies ?? 0} active`} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
        <div className="card" style={{ padding:'22px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Revenue Received</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:20 }}>
            Completed payments by month{trend.length ? '' : ' — nothing recorded yet'}
          </div>
          {trend.length > 0
            ? <BarChart data={trend} color="var(--teal)" height={100} />
            : <div style={{ fontSize:12.5, color:'var(--ink3)', padding:'22px 0' }}>No payments have been recorded.</div>}
        </div>

        <div className="card" style={{ padding:'22px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Revenue by Package</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:16 }}>What each package has actually brought in</div>
          {byPackage.length === 0 ? (
            <div style={{ fontSize:12.5, color:'var(--ink3)' }}>No completed payments yet.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {byPackage.map(p => {
                const pct = collectedTotal > 0 ? Math.round((p.total / collectedTotal) * 100) : 0;
                const cfg = PLAN_CFG[p.code as PlanId];
                return (
                  <div key={p.code}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {cfg ? <Badge cfg={cfg} /> : <span style={{ fontSize:12, fontWeight:700, color:'var(--ink2)', textTransform:'capitalize' }}>{p.code}</span>}
                        <span style={{ fontSize:12, color:'var(--ink3)' }}>{p.count} payment{p.count===1?'':'s'}</span>
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{fmtCurrency(p.total)}</span>
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:cfg?.color ?? 'var(--teal)', borderRadius:99 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12, marginTop:4, borderTop:'1px solid var(--border)', fontWeight:800 }}>
                <span style={{ fontSize:13, color:'var(--ink)' }}>Total received</span>
                <span style={{ fontSize:14, color:'var(--teal)', fontFamily:'var(--mono)' }}>{fmtCurrency(collectedTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   ACTIVITY VIEW
══════════════════════════════════════════════════ */
/**
 * The platform audit trail, from platform_activity_log.
 *
 * Rows are written by the superadmin routes as they act, so this is a record
 * of what was done rather than a description of what such a screen might show.
 * Actor and target names are the snapshots taken at the time — a company that
 * has since been deleted is still named, which is exactly when an audit trail
 * earns its keep.
 */
export function ActivityView() {
  const [typeFilter, setTypeFilter] = useState<ActivityType|'all'>('all');
  const [coFilter, setCoFilter] = useState<string>('all');
  const [rows, setRows] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => {
    let alive = true;
    Promise.all([apiFetch('/v1/superadmin/activity?limit=300'), apiFetch('/v1/superadmin/tenants')])
      .then(([a, t]: any[]) => {
        if (!alive) return;
        setRows(a?.data ?? []);
        setTenants(Array.isArray(t) ? t : (t?.data ?? []));
      })
      .catch((e: any) => { if (alive) setLoadError(e?.message ?? 'Could not load the activity log.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() =>
    rows.filter(a => {
      if (typeFilter !== 'all' && a.category !== typeFilter) return false;
      if (coFilter !== 'all' && a.tenant_id !== coFilter) return false;
      return true;
    }),
  [rows, typeFilter, coFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  const TYPE_LABELS: Record<ActivityType, string> = {
    company: 'Company', user: 'User', billing: 'Billing', system: 'System',
  };

  return (
    <div>
      <PageHdr title="Activity Log" sub="Every superadmin action on the platform, recorded as it happened" />

      {loadError && (
        <div style={{ padding:'10px 13px', borderRadius:10, background:'var(--red-l)', color:'var(--red)', fontSize:12.5, marginBottom:14 }}>{loadError}</div>
      )}

      <div className="sa-toolbar">
        <SingleSelectFilter
          label="Type" allLabel="All Types"
          options={(Object.keys(TYPE_LABELS) as ActivityType[]).map(k => ({ value: k, label: TYPE_LABELS[k] }))}
          value={typeFilter === 'all' ? null : typeFilter}
          onChange={v => { setTypeFilter((v ?? 'all') as ActivityType | 'all'); setPage(1); }}
        />
        <SingleSelectFilter
          label="Company" allLabel="All Companies"
          options={tenants.map((c:any) => ({ value: c.id, label: c.name }))}
          value={coFilter === 'all' ? null : coFilter}
          onChange={v => { setCoFilter(v ?? 'all'); setPage(1); }}
        />
      </div>

      <div className="card" style={{ padding:'8px 0' }}>
        {paged.map((a, i) => {
          const cfg = ACT_CFG[a.category as ActivityType] ?? ACT_CFG.system;
          return (
            <div key={a.id} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 22px', borderBottom: i < paged.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width:34, height:34, borderRadius: 9, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                <Icon name={cfg.icon as any} size={16} color={cfg.color} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <PersonAvatar userId={a.actor_user_id ?? undefined} name={a.actor_name} size={18} />
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{a.actor_name}</span>
                  <span style={{ fontSize:13, color:'var(--ink2)' }}>{a.action}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:600, color:cfg.color, background:cfg.bg, padding:'2px 8px', borderRadius: 9 }}>{TYPE_LABELS[a.category as ActivityType] ?? a.category}</span>
                  {a.target_name && <span style={{ fontSize:12, color:'var(--ink3)' }}>{a.target_name}</span>}
                  {/* The company as it is named now, when it still exists.
                      The snapshot above survives its deletion either way. */}
                  {a.tenant_name && (
                    <span style={{ fontSize:11, color:'var(--ink3)' }}>· {a.tenant_name}</span>
                  )}
                  {a.tenant_id === null && a.target_type === 'tenant' && (
                    <span style={{ fontSize:11, color:'var(--ink3)', fontStyle:'italic' }}>· company since deleted</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize:11, color:'var(--ink3)', whiteSpace:'nowrap', flexShrink:0, marginTop:2 }}>{relTime(a.created_at)}</div>
            </div>
          );
        })}
        {loading && (
          <div style={{ padding:'48px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>Loading activity…</div>
        )}
        {!loading && rows.length === 0 && (
          <div style={{ padding:'48px 22px', textAlign:'center' }}>
            <div style={{ fontSize:13.5, color:'var(--ink2)' }}>Nothing has been recorded yet.</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginTop:5 }}>
              Superadmin actions — creating a company, changing a plan, putting an app into maintenance — appear here as they happen.
            </div>
          </div>
        )}
        {!loading && rows.length > 0 && filtered.length === 0 && (
          <div style={{ padding:'48px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>No activity matching filters</div>
        )}
        {!loading && filtered.length > 0 && (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={size => { setPageSize(size); setPage(1); }}
            pageSizeOptions={[10, 15, 25, 50, 100]}
            itemLabel="activity log"
          />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   SETTINGS VIEW
══════════════════════════════════════════════════ */
const SETTINGS_SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'security', label: 'Security & Sessions', icon: 'lock' },
  { id: 'smtp',      label: 'Email / SMTP',        icon: 'mail' },
  { id: 'ocr',       label: 'OCR',                 icon: 'zap' },
  { id: 'ondiSso',   label: 'Ondi SSO',             icon: 'key' },
  { id: 'api',       label: 'API & Webhooks',       icon: 'terminal' },
  { id: 'modules-pointer', label: 'Modules & Plan Features', icon: 'package' },
  { id: 'cron',      label: 'Cron Jobs',            icon: 'clock' },
  { id: 'server',    label: 'System & Server Info', icon: 'monitor' },
];

export function SettingsView() {
  const [saved, setSaved] = useState<string|null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [smtp, setSmtp] = useState({ host:'smtp.mailgun.org', port:'587', user:'no-reply@clearos.io', pass:'', from:'Hudumika Platform <no-reply@clearos.io>', tls:true });
  const [security, setSecurity] = useState({ minPasswordLength:'8', sessionTimeoutHours:'8', maxLoginAttempts:'5', lockoutMinutes:'15', twoFaPolicy:'optional' as 'off'|'optional'|'required', ipAllowlist:'' });
  const [api, setApi] = useState({ rateLimit:'120', corsOrigins:'*', webhookSecret:'whs_live_••••••••••••••••', keyRotationDays:'90' });
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [ocr, setOcr] = useState({ geminiApiKey:'' });
  const [ondiSso, setOndiSso] = useState<{ enabled: boolean; googleClientId?: string; microsoftClientId?: string }>({ enabled: false });
  const [loading, setLoading] = useState(true);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);
  const [testingOcr, setTestingOcr] = useState(false);
  const [ocrTested, setOcrTested] = useState(false);
  const [jobs, setJobs] = useState<{ connected: boolean; jobs: { name: string; schedule: string; fallbackOnly?: boolean }[] }>({ connected: false, jobs: [] });
  const [serverInfo, setServerInfo] = useState<Record<string, string | number> | null>(null);

  // 8 sections in one long scroll with no way to jump to one — tabbed instead,
  // same ?section= deep-link convention DesignSystemView already established
  // (Navigate to="/admin/design-system?section=identity" etc. in
  // SuperAdminShell.tsx) so a bookmark/link to one settings section works the
  // same way a link to one design-system section already does.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = SETTINGS_SECTIONS.some(s => s.id === searchParams.get('section'))
    ? searchParams.get('section')!
    : SETTINGS_SECTIONS[0].id;
  const [activeTab, setActiveTabState] = useState(initialTab);
  const setActiveTab = (id: string) => {
    setActiveTabState(id);
    setSearchParams(prev => { prev.set('section', id); return prev; }, { replace: true });
  };

  useEffect(() => {
    apiFetch('/v1/superadmin/settings')
      .then(res => {
        const s = res.settings || {};
        if (s.maintenance !== undefined) setMaintenance(s.maintenance);
        if (s.smtp) setSmtp(prev => ({ ...prev, ...s.smtp }));
        if (s.security) setSecurity(prev => ({ ...prev, ...s.security }));
        if (s.api) setApi(prev => ({ ...prev, ...s.api }));
        if (s.ocr) setOcr(prev => ({ ...prev, ...s.ocr }));
        if (s.ondiSso) setOndiSso(prev => ({ ...prev, ...s.ondiSso }));
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
    apiFetch('/v1/superadmin/jobs').then(setJobs).catch(() => {});
    apiFetch('/v1/superadmin/server-info').then(setServerInfo).catch(() => {});
  }, []);

  async function save(section: string) {
    const payload = {
      maintenance,
      smtp,
      security,
      api,
      ocr,
      ondiSso
    };

    try {
      await apiFetch('/v1/superadmin/settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } catch (err: any) {
      showAlert(`Failed to save settings: ${err?.message ?? 'Unknown error'}`);
    }
  }

  // Used to just re-save whatever was already sitting in the field — clicking
  // "Regenerate" changed nothing at all. Generates a real random secret
  // client-side (crypto.getRandomValues, not Math.random) and saves it
  // immediately, same shape as an API key's own secret generation.
  async function regenerateWebhookSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const nextApi = { ...api, webhookSecret: `whs_live_${hex}` };
    setApi(nextApi);
    setShowWebhookSecret(true);
    try {
      await apiFetch('/v1/superadmin/settings', {
        method: 'POST',
        body: JSON.stringify({ maintenance, smtp, security, api: nextApi, ocr, ondiSso }),
      });
      setSaved('api-regen');
      setTimeout(() => setSaved(null), 2000);
    } catch (err: any) {
      showAlert(`Failed to save the new secret: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function toggleMaintenance() {
    const next = !maintenance;
    setMaintenance(next);
    try {
      await apiFetch('/v1/superadmin/settings', {
        method: 'POST',
        body: JSON.stringify({
          maintenance: next,
          smtp,
          security,
          api
        })
      });
    } catch (err: any) {
      setMaintenance(maintenance); // revert
      showAlert(`Failed to toggle maintenance mode: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function testSmtp() {
    setTestingSmtp(true);
    try {
      await apiFetch('/v1/superadmin/smtp-test', {
        method: 'POST',
        body: JSON.stringify(smtp)
      });
      setSmtpTested(true);
      setTimeout(() => setSmtpTested(false), 2000);
    } catch (err: any) {
      showAlert(`SMTP Test Failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setTestingSmtp(false);
    }
  }

  async function testOcr() {
    if (!ocr.geminiApiKey) {
      showAlert('Enter a Gemini API key first.');
      return;
    }
    setTestingOcr(true);
    try {
      await apiFetch('/v1/superadmin/ocr-test', {
        method: 'POST',
        body: JSON.stringify({ geminiApiKey: ocr.geminiApiKey })
      });
      setOcrTested(true);
      setTimeout(() => setOcrTested(false), 2000);
    } catch (err: any) {
      showAlert(`Gemini Test Failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setTestingOcr(false);
    }
  }

  const SectionCard = ({ title, sub, children, section, readOnly }: { title:string; sub:string; children:React.ReactNode; section:string; readOnly?:boolean }) => (
    <div className="card" style={{ padding:'24px 26px', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)' }}>{title}</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:3 }}>{sub}</div>
        </div>
        {!readOnly && (
          <button type="button" title={`Save ${title}`} onClick={() => save(section)} className="btn btn-primary btn-sm" style={{ gap:6 }}>
            {saved === section ? <><Icon name="check" size={12} />Saved</> : <><Icon name="save" size={12} />Save</>}
          </button>
        )}
      </div>
      {children}
    </div>
  );

  const Field = ({ label, hint, children, half }: { label:string; hint?:string; children:React.ReactNode; half?:boolean }) => (
    <div style={{ gridColumn: half ? 'span 1' : undefined, marginBottom: 0 }}>
      <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--ink3)', marginTop:3 }}>{hint}</div>}
    </div>
  );

  const SAToggle = ({ value, onChange, label }: { value:boolean; onChange:(v:boolean)=>void; label:string }) => (
    <button type="button" title={`Toggle ${label}`} onClick={() => onChange(!value)}
      style={{ width:38, height:22, borderRadius:99, border:'none', cursor:'pointer', background:value?'var(--teal)':'var(--border)', position:'relative', transition:'background .2s', flexShrink:0 }}>
      <span style={{ position:'absolute', top:3, left:value?18:3, width:16, height:16, borderRadius:99, background:'#fff', transition:'left .2s', display:'block', boxShadow: 'var(--elev-sm)' }} />
    </button>
  );

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading configurations…</div>;

  return (
    <div style={{ width:'100%' }}>
      <PageHdr title="Platform Settings" sub="Platform-wide configuration applied across all tenants" />

      {/* ── Maintenance Mode ── */}
      <div className="card" style={{ padding:'20px 26px', marginBottom:20, borderLeft:`4px solid ${maintenance ? 'var(--red)' : 'var(--border)'}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:24 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)' }}>Maintenance Mode</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginTop:3 }}>
              {maintenance
                ? 'Platform is in maintenance mode — all tenants see a maintenance page. API endpoints return 503.'
                : 'Platform is live and fully accessible to all tenants.'}
            </div>
          </div>
          <button type="button" title="Toggle maintenance mode" onClick={toggleMaintenance}
            style={{ padding:'var(--ds-btn-py) 20px', borderRadius:'var(--r)', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, flexShrink:0,
              background: maintenance ? 'var(--red)' : 'var(--teal)', color:'#fff', fontFamily:'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {maintenance ? 'Disable Maintenance' : 'Enable Maintenance'}
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {SETTINGS_SECTIONS.map(s => (
            <TabsTrigger key={s.id} value={s.id}>
              <Icon name={s.icon} size={13} />
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="security">
      {/* ── Security & Sessions ── */}
      <SectionCard title="Security & Sessions" sub="Password policy, session management, and access controls" section="security">
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--teal)', background:'var(--teal-l)', border:'1px solid var(--teal)', borderRadius:8, padding:'8px 12px', marginBottom:16 }}>
          <Icon name="shield" size={13} />
          Enforced platform-wide on every login and request. SUPER_ADMIN accounts are exempt from the IP allowlist so a misconfiguration here can never lock the console itself out.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="Minimum Password Length" hint="Characters required for all user passwords">
            <input title="Min password length" type="number" min={6} max={32} value={security.minPasswordLength}
              onChange={e => setSecurity(p=>({...p,minPasswordLength:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Session Timeout" hint="Hours before an idle session is automatically signed out">
            <input title="Session timeout hours" type="number" min={1} max={168} value={security.sessionTimeoutHours}
              onChange={e => setSecurity(p=>({...p,sessionTimeoutHours:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Max Login Attempts" hint="Failed attempts before account lockout is triggered">
            <input title="Max login attempts" type="number" min={3} max={20} value={security.maxLoginAttempts}
              onChange={e => setSecurity(p=>({...p,maxLoginAttempts:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Lockout Duration (minutes)" hint="How long an account stays locked after max attempts">
            <input title="Lockout duration" type="number" min={5} max={1440} value={security.lockoutMinutes}
              onChange={e => setSecurity(p=>({...p,lockoutMinutes:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Two-Factor Authentication Policy" hint="Applies to all tenant admin and staff accounts">
            <Select value={security.twoFaPolicy} onValueChange={v => setSecurity(p=>({...p,twoFaPolicy:v as any}))}>
              <SelectTrigger className="input-field" style={{ width:'100%' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off — not offered</SelectItem>
                <SelectItem value="optional">Optional — users can enable it</SelectItem>
                <SelectItem value="required">Required — all users must enable it</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="IP Allowlist" hint="Comma-separated CIDRs. Leave blank to allow all IPs.">
            <input title="IP allowlist" placeholder="e.g. 196.0.0.0/8, 10.0.0.1" value={security.ipAllowlist}
              onChange={e => setSecurity(p=>({...p,ipAllowlist:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="smtp">
      {/* ── Email / SMTP ── */}
      <SectionCard title="Email / SMTP" sub="Outgoing email server configuration for notifications, alerts, and billing" section="smtp">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="SMTP Host">
            <input title="SMTP Host" placeholder="smtp.mailgun.org" value={smtp.host}
              onChange={e => setSmtp(p=>({...p,host:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Port">
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <input title="SMTP Port" placeholder="587" value={smtp.port}
                onChange={e => setSmtp(p=>({...p,port:e.target.value}))} className="input-field" style={{ flex:1 }} />
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink2)', whiteSpace:'nowrap', cursor:'pointer' }}>
                <SAToggle value={smtp.tls} onChange={v => setSmtp(p=>({...p,tls:v}))} label="TLS" />
                TLS
              </label>
            </div>
          </Field>
          <Field label="Username">
            <input title="SMTP Username" placeholder="no-reply@clearos.io" value={smtp.user}
              onChange={e => setSmtp(p=>({...p,user:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Password">
            <input title="SMTP Password" type="password" placeholder="••••••••" value={smtp.pass}
              onChange={e => setSmtp(p=>({...p,pass:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="From Address" hint="Displayed as the sender name in all platform emails">
            <input title="From address" placeholder="Hudumika <no-reply@clearos.io>" value={smtp.from}
              onChange={e => setSmtp(p=>({...p,from:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={testSmtp} disabled={testingSmtp} style={{ gap:6 }}>
              {testingSmtp ? 'Testing...' : smtpTested ? <><Icon name="check" size={12}/>Connection OK</> : <><Icon name="mail" size={12}/>Send Test Email</>}
            </button>
          </div>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="ocr">
      {/* ── OCR / Document Scanning ── */}
      <SectionCard title="OCR / Document Scanning" sub="Google Gemini API key used to extract structured data from scanned BLs, invoices, and TANSAD documents in ClearOS" section="ocr">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="Gemini API Key" hint="From aistudio.google.com/apikey. Leave blank to keep OCR running on simulated demo data.">
            <input title="Gemini API Key" type="password" placeholder="AIza••••••••••••••••" value={ocr.geminiApiKey}
              onChange={e => setOcr(p=>({...p,geminiApiKey:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={testOcr} disabled={testingOcr} style={{ gap:6 }}>
              {testingOcr ? 'Testing...' : ocrTested ? <><Icon name="check" size={12}/>Connection OK</> : <><Icon name="zap" size={12}/>Test Connection</>}
            </button>
          </div>
        </div>
        <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>
          {ocr.geminiApiKey ? <span style={{ color:'var(--teal)' }}>● Live — scans use Gemini vision extraction</span> : <span>○ Simulated — no key configured, scans return demo data</span>}
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="ondiSso">
      {/* ── Ondi SSO (M7 dark-launch flag) ── */}
      <SectionCard title="Ondi SSO" sub="Default sign-in experience for every tenant — phone/authenticator/passkey/Google first, or password first" section="ondiSso">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:24 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Make Ondi the default sign-in page</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginTop:3 }}>
              {ondiSso.enabled
                ? 'On — visitors land on Ondi (phone code / authenticator / passkey / Google) first. Password sign-in stays fully reachable via the link on that page.'
                : 'Off — visitors land on the password sign-in page first, same as today. Ondi is reachable via its own link, but is not the default.'}
            </div>
          </div>
          <SAToggle value={ondiSso.enabled} onChange={v => setOndiSso(p => ({ ...p, enabled: v }))} label="Ondi SSO default" />
        </div>

        {/* Social sign-in is platform-wide, not per-tenant: the sign-in page
            runs before anyone has identified themselves, so there is no
            tenant whose credentials could be looked up. A Client ID is not a
            secret — the browser sends it to Google on every sign-in — and
            this flow uses no client secret at all. */}
        <div style={{ borderTop:'1px solid var(--border)', marginTop:18, paddingTop:18 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:3 }}>Social sign-in</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:14 }}>
            Paste a Client ID to switch Google or Microsoft sign-in on for every tenant. Leave blank to hide that button.
            Add this app's URL as an authorized JavaScript origin in the provider's console, or the button renders but fails on click.
            The Client ID/Secret under a workspace's Settings ▸ Integrations ▸ Google is a different setting — it drives Contacts sync, not sign-in.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
            <Field label="Google Client ID" hint="From console.cloud.google.com — ends in .apps.googleusercontent.com">
              <input title="Google Client ID" placeholder="1234567890-abc123.apps.googleusercontent.com" value={ondiSso.googleClientId ?? ''}
                onChange={e => setOndiSso(p => ({ ...p, googleClientId: e.target.value }))} className="input-field" style={{ width:'100%' }} />
            </Field>
            <Field label="Microsoft Client ID" hint="The Application (client) ID from your Azure AD app registration.">
              <input title="Microsoft Client ID" placeholder="00000000-0000-0000-0000-000000000000" value={ondiSso.microsoftClientId ?? ''}
                onChange={e => setOndiSso(p => ({ ...p, microsoftClientId: e.target.value }))} className="input-field" style={{ width:'100%' }} />
            </Field>
          </div>
          <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>
            {ondiSso.googleClientId?.trim()
              ? <span style={{ color:'var(--teal)' }}>● Google sign-in is live on the sign-in page</span>
              : <span>○ Google sign-in hidden — no Client ID configured</span>}
          </div>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="api">
      {/* ── API & Webhooks ── */}
      <SectionCard title="API & Webhooks" sub="Rate limiting, CORS, and webhook security for platform APIs" section="api">
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--gold)', background:'var(--gold-l)', border:'1px solid var(--gold)', borderRadius:8, padding:'8px 12px', marginBottom:16 }}>
          <Icon name="alertTriangle" size={13} />
          Rate limit and CORS origins are enforced platform-wide. Key rotation and the webhook secret below are saved but not yet acted on anywhere.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="API Rate Limit" hint="Maximum requests per minute for a normal app session (partner API keys keep their own fixed 300/min)">
            <input title="Rate limit" type="number" min={10} max={10000} value={api.rateLimit}
              onChange={e => setApi(p=>({...p,rateLimit:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="API Key Rotation" hint="Days before API keys are flagged for rotation">
            <input title="Key rotation days" type="number" min={30} max={365} value={api.keyRotationDays}
              onChange={e => setApi(p=>({...p,keyRotationDays:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="CORS Allowed Origins" hint="Comma-separated extra origins, layered on top of the server's own configured origin — this can only add access, never remove the app's own.">
            <input title="CORS origins" placeholder="https://app.yourcompany.com" value={api.corsOrigins}
              onChange={e => setApi(p=>({...p,corsOrigins:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Webhook Signing Secret" hint="Not yet used to sign anything — saved for a future outbound webhook feature">
            <div style={{ display:'flex', gap:8 }}>
              <input title="Webhook secret" type={showWebhookSecret ? 'text' : 'password'} value={api.webhookSecret}
                onChange={e => setApi(p=>({...p,webhookSecret:e.target.value}))} className="input-field" style={{ flex:1 }} />
              <button type="button" title="Toggle visibility" className="btn btn-outline btn-sm"
                onClick={() => setShowWebhookSecret(s => !s)} style={{ flexShrink:0 }}>
                <Icon name={showWebhookSecret ? 'eyeOff' : 'eye'} size={14} />
              </button>
              <button type="button" title="Regenerate secret" className="btn btn-outline btn-sm" onClick={() => regenerateWebhookSecret()} style={{ flexShrink:0, gap:5 }}>
                <Icon name="refresh" size={13} />{saved==='api-regen'?'Done':'Regen'}
              </button>
            </div>
          </Field>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="modules-pointer">
      {/* ── Modules & Plan Features ── */}
      {/* This used to be two separate panels (Feature Flags, Storage Quotas)
          whose toggles/fields saved to a settings key nothing ever read —
          real writes, but a dead end. App Status and Packages already own
          this for real (app_status/package_features/package_app_quotas,
          actually enforced), so this card points there instead of running a
          second, disconnected copy of the same controls. */}
      <SectionCard title="Modules & Plan Features" sub="Per-app availability and per-plan feature/storage grants" section="modules-pointer" readOnly>
        <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.6, marginBottom:16 }}>
          Enabling or disabling an app platform-wide (or per tenant), and what each subscription plan includes — feature grants, storage limits, monthly item caps — are configured on their own real, enforced pages rather than duplicated here.
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <Link to="/admin/app-status" className="btn btn-outline btn-sm" style={{ gap:6 }}>
            <Icon name="shield" size={13} /> Open App Status
          </Link>
          <Link to="/admin/packages" className="btn btn-outline btn-sm" style={{ gap:6 }}>
            <Icon name="package" size={13} /> Open Packages
          </Link>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="cron">
      {/* ── Cron Jobs ── */}
      <SectionCard title="Cron Jobs" sub="Every background job actually registered by this server — name and schedule, read live" section="cron" readOnly>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: jobs.connected ? 'var(--green)' : 'var(--gold)', background: jobs.connected ? 'var(--green-l)' : 'var(--gold-l)', border: `1px solid ${jobs.connected ? 'var(--green)' : 'var(--gold)'}`, borderRadius:8, padding:'8px 12px', marginBottom:16 }}>
          <Icon name={jobs.connected ? 'checkCircle' : 'alertTriangle'} size={13} />
          {jobs.connected ? 'BullMQ (Redis) connected — schedules below are persistent and distributed.' : 'Redis unavailable — running on an in-process interval fallback (no persisted run history).'}
        </div>
        <div className="rtbl-wrap">
          <table className="rtbl">
            <thead>
              <tr className="sa-cron-hdr-row">
                <th className="sa-cron-th">Job</th>
                <th className="sa-cron-th">Schedule</th>
                <th className="sa-cron-th--center">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.jobs.map((j, i) => {
                const runs = !j.fallbackOnly || !jobs.connected;
                return (
                  <tr key={i} className="sa-cron-row">
                    <td className="sa-cron-td">{j.name}</td>
                    <td className="sa-cron-td--sched">{j.schedule}</td>
                    <td className="sa-cron-td--status">
                      <span className={`sa-cron-badge sa-cron-badge--${runs ? 'active' : 'inactive'}`} title={j.fallbackOnly ? 'Only scheduled by the interval fallback — no BullMQ repeat registration exists for this job yet.' : undefined}>
                        {runs ? 'scheduled' : 'not scheduled'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {jobs.jobs.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
        </TabsContent>

        <TabsContent value="server">
      {/* ── System & Server Info ── */}
      <SectionCard title="System & Server Info" sub="Read-only platform infrastructure and runtime details, read live from the running process" section="server" readOnly>
        <div className="sa-server-grid">
          {serverInfo ? ([
            ['Node.js Runtime', String(serverInfo.nodeVersion)],
            ['Environment', String(serverInfo.environment)],
            ['Database', String(serverInfo.database)],
            ['Job Scheduling', String(serverInfo.jobScheduling)],
            ['Platform', String(serverInfo.platform)],
            ['CPU', `${serverInfo.cpuCount} × ${serverInfo.cpuModel}`],
            ['System Memory', `${serverInfo.freeMemoryMb} MB free / ${serverInfo.totalMemoryMb} MB`],
            ['Process Heap', `${serverInfo.heapUsedMb} MB used / ${serverInfo.heapTotalMb} MB`],
            ['Server Timezone', String(serverInfo.timezone)],
            ['App Uptime', String(serverInfo.appUptime)],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <div className="sa-server-label">{label}</div>
              <div className="sa-server-value sa-server-value--mono">{value}</div>
            </div>
          )) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
          )}
        </div>
      </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   APP STATUS VIEW — per-app maintenance kill switch
══════════════════════════════════════════════════ */
const APP_LABELS: Record<string, string> = {
  ai: 'AI', clearos: 'ClearOS', cloud: 'Cloud', complyos: 'ComplyOS',
  contacts: 'Contacts', email: 'Email', finops: 'FinOps', ondi: 'Ondi',
  nexushr: 'NexusHR', tracking: 'Tracking', demurrage: 'Demurrage', cargotracker: 'CargoTracker',
  petti: 'Petti', notes: 'Notes', sign: 'eSign', sms: 'SMS',
};

const APP_ICONS: Record<string, IconName> = {
  ai: 'sparkle', clearos: 'ship', cloud: 'folder', complyos: 'shield',
  contacts: 'contact', email: 'mail', finops: 'dollarSign', ondi: 'key',
  nexushr: 'users', tracking: 'truck', demurrage: 'timer', cargotracker: 'container',
  petti: 'wallet', notes: 'fileText', sign: 'stamp', sms: 'messageSquare',
};

interface AppStatusRow { app_id: string; status: 'active' | 'maintenance'; message: string | null; updated_at: string; }

type AppStatusSort = 'name' | 'status' | 'updated';

export function AppStatusView() {
  const [rows, setRows] = useState<AppStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<AppStatusSort>('name');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('hudumika_appstatus_view_mode') as 'list' | 'grid') || 'list');

  const handleViewChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('hudumika_appstatus_view_mode', mode);
  };

  useEffect(() => {
    apiFetch('/v1/superadmin/app-status')
      .then(res => setRows(res.appStatus || []))
      .finally(() => setLoading(false));
  }, []);

  const visibleRows = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => (APP_LABELS[r.app_id] ?? r.app_id).toLowerCase().includes(q) || r.app_id.toLowerCase().includes(q));
    }
    if (statusFilter) list = list.filter(r => r.status === statusFilter);
    const sorted = [...list];
    if (sortBy === 'name') {
      sorted.sort((a, b) => (APP_LABELS[a.app_id] ?? a.app_id).localeCompare(APP_LABELS[b.app_id] ?? b.app_id));
    } else if (sortBy === 'status') {
      sorted.sort((a, b) => (a.status === b.status ? 0 : a.status === 'maintenance' ? -1 : 1));
    } else {
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return sorted;
  }, [rows, search, statusFilter, sortBy]);

  async function toggle(row: AppStatusRow) {
    const nextStatus = row.status === 'active' ? 'maintenance' : 'active';
    setSavingId(row.app_id);
    try {
      const res = await apiFetch(`/v1/superadmin/app-status/${row.app_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, message: drafts[row.app_id] ?? row.message ?? undefined }),
      });
      setRows(prev => prev.map(r => r.app_id === row.app_id ? res.appStatus : r));
    } catch (err: any) {
      showAlert(`Failed to update ${APP_LABELS[row.app_id] ?? row.app_id}: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading app status…</div>;

  const liveCount = rows.filter(r => r.status === 'active').length;
  const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'name',    label: 'Name A–Z' },
    { value: 'status',  label: 'Maintenance first' },
    { value: 'updated', label: 'Recently updated' },
  ];

  return (
    <div>
      <PageHdr
        title="App Status"
        sub="Per-app maintenance switch — take a single app down for a deploy without affecting the rest of the platform"
        action={
          <Badge cfg={liveCount === rows.length
            ? { label: `${liveCount} of ${rows.length} apps live`, color:'var(--green)', bg:'var(--green-l)' }
            : { label: `${liveCount} of ${rows.length} apps live`, color:'var(--gold)', bg:'var(--gold-l)' }} />
        }
      />

      {/* Toolbar: search + status filter + sort + view toggle */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:18 }}>
        <div style={{ position:'relative', flex:'1 1 240px', minWidth:200 }}>
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }} />
          <input
            className="input-field"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search apps…"
            style={{ width:'100%', boxSizing:'border-box', paddingLeft:34 }}
          />
        </div>
        <SingleSelectFilter
          label="Status"
          icon={<Icon name="filter" size={13} />}
          options={[{ value:'active', label:'Live' }, { value:'maintenance', label:'Maintenance' }]}
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="All statuses"
        />
        <Select value={sortBy} onValueChange={v => setSortBy(v as AppStatusSort)}>
          <SelectTrigger style={{ minWidth:170 }}>
            <Icon name="sliders" size={13} color="var(--ink3)" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', flexShrink:0 }}>
          <button
            type="button"
            title="List view"
            onClick={() => handleViewChange('list')}
            style={{ padding:'0 14px', height:'var(--ctl-h-sm)', boxSizing:'border-box', display:'inline-flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, background: viewMode === 'list' ? 'var(--bg)' : 'transparent', border:'none', cursor:'pointer', lineHeight:1.25 }}
          >
            <Icon name="list" size={14} />
          </button>
          <button
            type="button"
            title="Grid view"
            onClick={() => handleViewChange('grid')}
            style={{ padding:'0 14px', height:'var(--ctl-h-sm)', boxSizing:'border-box', display:'inline-flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, background: viewMode === 'grid' ? 'var(--bg)' : 'transparent', border:'none', cursor:'pointer', lineHeight:1.25 }}
          >
            <Icon name="grid" size={14} />
          </button>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>No apps match your search.</div>
      ) : viewMode === 'list' ? (
        <SectionCard padded={false}>
          {visibleRows.map(row => {
            const inMaintenance = row.status === 'maintenance';
            const label = APP_LABELS[row.app_id] ?? row.app_id;
            const busy = savingId === row.app_id;
            return (
              <div key={row.app_id} style={{ padding: '0 18px', opacity: busy ? 0.6 : 1 }}>
                <FeatureToggleRow
                  icon={<Icon name={APP_ICONS[row.app_id] ?? 'layers'} size={18} />}
                  title={label}
                  description={inMaintenance ? 'All tenants are blocked from this app.' : 'Accessible per each tenant’s plan.'}
                  checked={!inMaintenance}
                  onCheckedChange={() => toggle(row)}
                  disabled={busy}
                  action={inMaintenance && (
                    <input
                      title="Maintenance message shown to tenants"
                      placeholder="Optional message shown to tenants while in maintenance…"
                      value={drafts[row.app_id] ?? row.message ?? ''}
                      onChange={e => setDrafts(prev => ({ ...prev, [row.app_id]: e.target.value }))}
                      className="input-field"
                      style={{ width:'100%', maxWidth: 420, boxSizing:'border-box', fontSize:12 }}
                    />
                  )}
                />
              </div>
            );
          })}
        </SectionCard>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
          {visibleRows.map(row => {
            const inMaintenance = row.status === 'maintenance';
            const label = APP_LABELS[row.app_id] ?? row.app_id;
            const busy = savingId === row.app_id;
            const muted = busy || inMaintenance;
            return (
              <div
                key={row.app_id}
                style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:16, display:'flex', flexDirection:'column', gap:10, opacity: busy ? 0.6 : 1 }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                    <FeaturedIcon variant={muted ? 'gray' : 'brand'} shape="circle" size="md">
                      <Icon name={APP_ICONS[row.app_id] ?? 'layers'} size={18} />
                    </FeaturedIcon>
                    <div style={{ fontSize:14, fontWeight:700, color: muted ? 'var(--ink3)' : 'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:11, fontWeight:600, color: inMaintenance ? 'var(--ink3)' : 'var(--teal)' }}>{inMaintenance ? 'Off' : 'On'}</span>
                    <Switch size="lg" showCheckIcon checked={!inMaintenance} disabled={busy} title={`Toggle ${label}`} onCheckedChange={() => toggle(row)} />
                  </div>
                </div>
                <div style={{ fontSize:12, color:'var(--ink3)', opacity: muted ? 0.7 : 1 }}>
                  {inMaintenance ? 'All tenants are blocked from this app.' : 'Accessible per each tenant’s plan.'}
                </div>
                {inMaintenance && (
                  <input
                    title="Maintenance message shown to tenants"
                    placeholder="Optional message shown to tenants while in maintenance…"
                    value={drafts[row.app_id] ?? row.message ?? ''}
                    onChange={e => setDrafts(prev => ({ ...prev, [row.app_id]: e.target.value }))}
                    className="input-field"
                    style={{ width:'100%', boxSizing:'border-box', fontSize:12 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DEVICES — cross-tenant Device Management oversight
   (379_attendance_devices.sql). Read-only: "monitor,
   troubleshoot, audit", same stance this console already
   takes toward tenant attendance/leave data — never a
   write action on another tenant's device from here.
══════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════ */
type ActivityType = 'company'|'user'|'billing'|'system';

interface ActivityLog { id:string; actor:string; action:string; target:string; companyId?:string; time:string; type:ActivityType; }

// View components are exported individually above and composed in SuperAdminShell
