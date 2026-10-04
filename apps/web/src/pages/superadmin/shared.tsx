import React, { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { CompanyAvatar } from '../../components/PersonAvatar.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Tip } from '../../components/ui/tooltip.js';
import { PageHeader } from '../../components/PageHeader.js';
import '../SuperAdmin.css';

/* ════════════════════════════════════════════════════════════
   TYPES
════════════════════════════════════════════════════════════ */
export type PlanId = 'starter' | 'growth' | 'scale' | 'enterprise';
export type CoStatus = 'active' | 'inactive' | 'trial' | 'suspended';
export type SubStatus = 'active' | 'expired' | 'trial' | 'cancelled';
export type DomainStatus = 'active' | 'pending' | 'failed';
export type TxStatus = 'completed' | 'pending' | 'failed' | 'refunded';
export type PayMethod = 'card' | 'bank' | 'mpesa' | 'paypal';
export type ActivityType = 'company'|'user'|'billing'|'system';

export interface Company { id:string; name:string; email:string; phone:string; plan:PlanId; users:number; status:CoStatus; domain:string; created:string; owner:string; country:string; color:string; logoUrl?:string; founderPersonalEmailDomain?:string|null; }
export interface Subscription { id:string; companyId:string; plan:PlanId; start:string; end:string; amount:number; billing:'monthly'|'annual'; status:SubStatus; }
export interface Package { id:string; code:string; name:string; monthly:number; annual:number; maxUsers:number; pricePerSeat:number|null; extraSeatPrice:number|null; extraSeatThreshold:number|null; monthlyItemLimit:number|null; storageLimitGb:number|null; monthlyAiCredits:number; byokAiAllowed:boolean; features:string[]; active:number; color:string; popular?:boolean; isActive:boolean; }
/** Purchasable independent of which base Package a tenant is on
 *  (376_package_addons.sql) – Onsite's real home now, not a fourth
 *  competing base package. */
export interface Addon { id:string; code:string; name:string; description:string; featureKey:string; monthly:number; annual:number; color:string; activeCompanies:number; }
/** Module-level so both PackagesView (catalog management) and CompaniesView
 *  (per-tenant grant/revoke) can shape the same GET /v1/addons response. */
export function mapAddonFromApi(a: { id:string; code:string; name:string; description:string; featureKey:string; monthlyPrice:number; annualPrice:number; color:string|null; activeCompanies?:number }): Addon {
  return {
    id: a.id, code: a.code, name: a.name, description: a.description, featureKey: a.featureKey,
    monthly: a.monthlyPrice, annual: a.annualPrice, color: a.color || 'var(--teal)',
    activeCompanies: a.activeCompanies ?? 0,
  };
}
export interface Domain { id:string; domain:string; companyId:string; status:DomainStatus; ssl:boolean; created:string; }
export interface Transaction { id:string; txRef:string; companyId:string; plan:PlanId; amount:number; date:string; method:PayMethod; status:TxStatus; }
export interface ActivityLog { id:string; actor:string; action:string; target:string; companyId?:string; time:string; type:ActivityType; }

/* ════════════════════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════════════════════ */
export const PLAN_CFG: Record<PlanId,{label:string;color:string;bg:string}> = {
  starter:    { label:'HuduStarter',    color:'var(--ink2)', bg:'var(--bg)'  },
  growth:     { label:'HuduPlus',       color:'var(--ink2)', bg:'var(--bg)'  },
  scale:      { label:'Legacy Scale',   color:'var(--ink2)', bg:'var(--bg)'  },
  enterprise: { label:'Hudu Advanced',   color:'var(--ink2)', bg:'var(--bg)'  },
};
export const CO_CFG: Record<CoStatus,{label:string;color:string;bg:string}> = {
  active:    { label:'Active',    color:'var(--green)', bg:'var(--green-l)' },
  inactive:  { label:'Inactive',  color:'var(--ink3)', bg:'var(--bg)' },
  trial:     { label:'Trial',     color:'var(--gold)', bg:'var(--gold-l)' },
  suspended: { label:'Suspended', color:'var(--red)', bg:'var(--red-l)' },
};
export const SUB_CFG: Record<SubStatus,{label:string;color:string;bg:string}> = {
  active:    { label:'Active',    color:'var(--green)', bg:'var(--green-l)' },
  expired:   { label:'Expired',   color:'var(--red)', bg:'var(--red-l)' },
  trial:     { label:'Trial',     color:'var(--gold)', bg:'var(--gold-l)' },
  cancelled: { label:'Cancelled', color:'var(--ink3)', bg:'var(--bg)' },
};
export const DOM_CFG: Record<DomainStatus,{label:string;color:string;bg:string}> = {
  active:  { label:'Verified',   color:'var(--green)', bg:'var(--green-l)' },
  pending: { label:'Unverified', color:'var(--gold)', bg:'var(--gold-l)' },
  failed:  { label:'Failed',     color:'var(--red)', bg:'var(--red-l)' },
};
export const TX_CFG: Record<TxStatus,{label:string;color:string;bg:string}> = {
  completed: { label:'Completed', color:'var(--green)', bg:'var(--green-l)' },
  pending:   { label:'Pending',   color:'var(--gold)', bg:'var(--gold-l)' },
  failed:    { label:'Failed',    color:'var(--red)', bg:'var(--red-l)' },
  refunded:  { label:'Refunded',  color:'var(--blue)', bg:'var(--blue-l)' },
};
export const METHOD_LABELS: Record<PayMethod,string> = { card:'Credit Card', bank:'Bank Transfer', mpesa:'M-Pesa', paypal:'PayPal' };

/* ════════════════════════════════════════════════════════════
   SAMPLE DATA
════════════════════════════════════════════════════════════ */
export const COMPANIES: Company[] = [
  { id:'C1', name:'Summit Traders Ltd',     email:'admin@summit.co.tz',    phone:'+255 712 345 678', plan:'enterprise',   users:48, status:'active',    domain:'summit.clearos.app',    created:'2024-01-15', owner:'Amina Hassan',     country:'Tanzania', color:'#0d7a6b' },
  { id:'C2', name:'Serengeti Foods Co.',    email:'info@serengeti.co.tz',  phone:'+255 754 987 321', plan:'growth',     users:18, status:'active',    domain:'serengeti.clearos.app', created:'2024-02-08', owner:'John Mwangi',      country:'Tanzania', color:'#3b82f6' },
  { id:'C3', name:'Karibu Imports',         email:'ops@karibu.co.tz',      phone:'+255 767 111 222', plan:'starter',    users:5,  status:'trial',     domain:'karibu.clearos.app',    created:'2025-01-20', owner:'Grace Osei',       country:'Kenya',    color:'#a855f7' },
  { id:'C4', name:'East Africa Logistics',  email:'admin@eal.co.tz',       phone:'+255 788 456 789', plan:'enterprise', users:62, status:'active',    domain:'eal.clearos.app',       created:'2023-11-01', owner:'Peter Kimani',     country:'Tanzania', color:'var(--red)' },
  { id:'C5', name:'Kilimanjaro Mining Ltd', email:'info@kilimining.co.tz', phone:'+255 745 333 444', plan:'scale',      users:23, status:'active',    domain:'kilimining.clearos.app',created:'2024-04-12', owner:'Fatuma Ally',      country:'Tanzania', color:'var(--gold)' },
  { id:'C6', name:'Dar Port Agency',        email:'ops@darport.co.tz',     phone:'+255 712 999 888', plan:'starter',    users:8,  status:'inactive',  domain:'darport.clearos.app',   created:'2024-06-30', owner:'David Odhiambo',   country:'Tanzania', color:'#6366f1' },
  { id:'C7', name:'TZ Freight Solutions',   email:'admin@tzfreight.co.tz', phone:'+255 767 777 666', plan:'growth',     users:15, status:'active',    domain:'tzfreight.clearos.app', created:'2024-08-15', owner:'Amina Hassan',     country:'Tanzania', color:'#22c55e' },
  { id:'C8', name:'Coastal Clearers Ltd',   email:'info@coastal.co.tz',    phone:'+255 754 555 444', plan:'enterprise',   users:37, status:'suspended', domain:'coastal.clearos.app',   created:'2023-09-22', owner:'Beatrice Njoroge', country:'Kenya',    color:'#0891b2' },
];

export const SUBSCRIPTIONS: Subscription[] = [
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
// entry belongs to – a different hue per category on top of that was pure
// decoration, not information. One neutral treatment throughout.
export const ACT_CFG: Record<ActivityType,{color:string;bg:string;icon:string}> = {
  company: { color:'var(--ink2)', bg:'var(--bg)', icon:'building'   },
  user:    { color:'var(--ink2)', bg:'var(--bg)', icon:'user'        },
  billing: { color:'var(--ink2)', bg:'var(--bg)', icon:'dollarSign'  },
  system:  { color:'var(--ink2)', bg:'var(--bg)', icon:'settings'    },
};

// The MOCK_ACTIVITY sample array lived here: twelve invented superadmin
// actions – refunds, password resets and SSL renewals that never happened,
// against companies that do not exist. ActivityView reads
// platform_activity_log now, which the superadmin routes write as they act.

/* ════════════════════════════════════════════════════════════
   SHARED HELPERS
════════════════════════════════════════════════════════════ */
export function fmtCurrency(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
export function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
export function avColor(_n: string) { return 'var(--teal)'; }
export function coByID(id: string) { return COMPANIES.find(c=>c.id===id)!; }

/* ── Status badge ── */
export function Badge({ cfg }: { cfg:{label:string;color:string;bg:string} }) {
  return <span style={{ fontSize:11, fontWeight:700, color:cfg.color, background:cfg.bg, padding:'3px 9px', borderRadius:'var(--badge-radius)', whiteSpace:'nowrap' }}>{cfg.label}</span>;
}

/* ── Company avatar ── */
export function CoAv({ co, size=34 }: { co:Company|undefined; size?:number }) {
  return <CompanyAvatar name={co?.name ?? '?'} logoUrl={co?.logoUrl} size={size} shape="square" />;
}

/* ── Sparkline ── */
export function Spark({ data, color='var(--teal)', width=100, height=28 }: { data:number[]; color?:string; width?:number; height?:number }) {
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
export function BarChart({ data, color='var(--teal)', height=72 }: { data:{label:string;value:number}[]; color?:string; height?:number }) {
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
export function DonutChart({ segments, size=110 }: { segments:{pct:number;color:string;label:string}[]; size?:number }) {
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
 * delta – 19.01%, -12%, 6%, -8% – numbers nothing computed, sitting beside
 * real totals on the screen where platform decisions get made. A card with no
 * comparable prior period now simply shows the number.
 */
export function KPICard({ title, value, change, icon, color, spark, hint, emptyHint }: {
  title:string; value:string; change?:number|null; icon:IconName; color:string; spark?:number[];
  /** Always shown – real context about the number, e.g. what the estimate is. */
  hint?:string;
  /** Shown only when there is no trend to draw, explaining the absence. */
  emptyHint?:string;
}) {
  const pos = (change ?? 0) >= 0;
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
        <div style={{ width:46, height:46, borderRadius: 'var(--r)', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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
 * This was a private 20px <h1> – one of two copies that had grown alongside
 * the real PageHeader, which is why the SuperAdmin screens did not look like
 * the rest of the platform. It now delegates, so every view in this file
 * picks up the house style (plain face + Cormorant Garamond italic final
 * word in the app's colour) without touching a single call site.
 *
 * The final word becomes the emphasised one and is lowercased to match the
 * house style – "Purchase Transactions" reads as "Purchase transactions".
 * A one-word title has no plain part to pair with, so those call sites pass
 * a two-word title instead of relying on the split.
 */
export function PageHdr({ title, sub, action }: { title:string; sub:string; action?:React.ReactNode }) {
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
export function DataTable({ headers, children, selectAll, selectAllIndeterminate, onSelectAll, sortBy, sortDir, onSort }: {
  headers: string[];
  children: React.ReactNode;
  selectAll?: boolean;
  selectAllIndeterminate?: boolean;
  onSelectAll?: () => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (col: string) => void;
}) {
  return (
    <div className="rtbl-wrap">
      <table className="rtbl">
        <thead>
          <tr style={{ background:'var(--bg)' }}>
            {onSelectAll !== undefined && (
              <th style={{ padding:'10px 14px', width:40, borderBottom:'1px solid var(--border)' }}>
                <Checkbox
                  checked={selectAllIndeterminate ? 'indeterminate' : !!selectAll}
                  onCheckedChange={onSelectAll}
                  aria-label="Select all"
                />
              </th>
            )}
            {headers.map(h => {
              const active = onSort && sortBy === h;
              return (
                <th key={h}
                  onClick={() => onSort?.(h)}
                  style={{
                    padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700,
                    color: active ? 'hsl(var(--primary))' : 'var(--ink3)',
                    textTransform:'uppercase', letterSpacing:'0.05em',
                    borderBottom:'1px solid var(--border)', whiteSpace:'nowrap',
                    cursor: onSort ? 'pointer' : undefined,
                    userSelect: 'none',
                    transition: 'color .12s',
                  }}
                >
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    {h}
                    {onSort && (
                      <span style={{ fontSize:9, lineHeight:1, color: active ? 'hsl(var(--primary))' : 'var(--ink3)', opacity: active ? 1 : 0.4 }}>
                        {active && sortDir === 'desc' ? '▼' : '▲'}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function useSortState() {
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  const handleSort = (col: string) => {
    setSortBy(prev => { if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; } setSortDir('asc'); return col; });
  };
  return { sortBy, sortDir, handleSort } as const;
}

export function sortedRows<T>(rows: T[], sortBy: string, sortDir: 'asc'|'desc', accessor: (col: string, row: T) => any): T[] {
  if (!sortBy) return rows;
  return [...rows].sort((a, b) => {
    const va = accessor(sortBy, a), vb = accessor(sortBy, b);
    if (va == null) return 1; if (vb == null) return -1;
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'desc' ? -cmp : cmp;
  });
}

/* ── Table row hover ── */
export function TR({ children, onClick, selected, onSelect }: { children:React.ReactNode; onClick?:()=>void; selected?:boolean; onSelect?:()=>void }) {
  const [hov, setHov] = useState(false);
  return (
    <tr onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={onClick}
      style={{ background: selected ? 'color-mix(in srgb, var(--teal) 6%, var(--white))' : hov?'var(--bg)':'transparent', transition:'background .1s', cursor:onClick?'pointer':undefined }}>
      {onSelect !== undefined && (
        <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', width:40 }} onClick={e=>e.stopPropagation()}>
          <Checkbox checked={!!selected} onCheckedChange={onSelect} aria-label="Select row" />
        </td>
      )}
      {children}
    </tr>
  );
}

/* ── TD ── */
export function TD({ children, right, nowrap }: { children:React.ReactNode; right?:boolean; nowrap?:boolean }) {
  return (
    <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--ink)', textAlign:right?'right':undefined, whiteSpace:nowrap?'nowrap':undefined }}>
      {children}
    </td>
  );
}

/* ── Action menu button ── */
export function ActBtn({ icon, color, title, onClick }: { icon:IconName; color?:string; title:string; onClick:()=>void }) {
  return (
    <Tip label={title}>
      <button onClick={e=>{e.stopPropagation();onClick();}}
        style={{ background:'none', border:'none', borderRadius:'var(--r)', padding:5, cursor:'pointer', color:color||'var(--ink3)', display:'inline-flex', alignItems:'center', transition:'background .1s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = color ? `color-mix(in srgb, ${color} 12%, var(--hover-bg))` : 'var(--hover-bg)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
        <Icon name={icon} size={14} color={color||'var(--ink3)'} />
      </button>
    </Tip>
  );
}

/* ── Stat summary card ── */
export function StatCard({ label, value }: { label:string; value:number|string; color?:string }) {
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 'var(--r)', padding:'16px 20px', flex:1, boxShadow: 'var(--elev-sm, 0 1px 3px rgba(0, 0, 0, 0.03))' }}>
      <div style={{ fontSize:24, fontWeight:800, color:'var(--ink)' }}>{value}</div>
      <div style={{ fontSize:12.5, fontWeight:500, color:'var(--ink3)', marginTop:4 }}>{label}</div>
    </div>
  );
}
