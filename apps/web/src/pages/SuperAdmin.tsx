import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import './SuperAdmin.css';

/* ══════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════ */
type PlanId = 'starter' | 'professional' | 'enterprise';
type CoStatus = 'active' | 'inactive' | 'trial' | 'suspended';
type SubStatus = 'active' | 'expired' | 'trial' | 'cancelled';
type DomainStatus = 'active' | 'pending' | 'expired';
type TxStatus = 'completed' | 'pending' | 'failed' | 'refunded';
type PayMethod = 'card' | 'bank' | 'mpesa' | 'paypal';

interface Company { id:string; name:string; email:string; phone:string; plan:PlanId; users:number; status:CoStatus; domain:string; created:string; owner:string; country:string; color:string; }
interface Subscription { id:string; companyId:string; plan:PlanId; start:string; end:string; amount:number; billing:'monthly'|'annual'; status:SubStatus; }
interface Package { id:string; name:string; monthly:number; annual:number; maxUsers:number; features:string[]; active:number; color:string; popular?:boolean; }
interface Domain { id:string; domain:string; companyId:string; status:DomainStatus; ssl:boolean; created:string; }
interface Transaction { id:string; txRef:string; companyId:string; plan:PlanId; amount:number; date:string; method:PayMethod; status:TxStatus; }

/* ══════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════ */
const PLAN_CFG: Record<PlanId,{label:string;color:string;bg:string}> = {
  starter:      { label:'Starter',      color:'#0891b2', bg:'#ecfeff'  },
  professional: { label:'Professional', color:'#7c3aed', bg:'#ede9fe'  },
  enterprise:   { label:'Enterprise',   color:'#0d7a6b', bg:'#ccfbf1'  },
};
const CO_CFG: Record<CoStatus,{label:string;color:string;bg:string}> = {
  active:    { label:'Active',    color:'#16a34a', bg:'#dcfce7' },
  inactive:  { label:'Inactive',  color:'#6b7280', bg:'#f3f4f6' },
  trial:     { label:'Trial',     color:'#d97706', bg:'#fef3c7' },
  suspended: { label:'Suspended', color:'#ef4444', bg:'#fef2f2' },
};
const SUB_CFG: Record<SubStatus,{label:string;color:string;bg:string}> = {
  active:    { label:'Active',    color:'#16a34a', bg:'#dcfce7' },
  expired:   { label:'Expired',   color:'#ef4444', bg:'#fef2f2' },
  trial:     { label:'Trial',     color:'#d97706', bg:'#fef3c7' },
  cancelled: { label:'Cancelled', color:'#6b7280', bg:'#f3f4f6' },
};
const DOM_CFG: Record<DomainStatus,{label:string;color:string;bg:string}> = {
  active:  { label:'Active',  color:'#16a34a', bg:'#dcfce7' },
  pending: { label:'Pending', color:'#d97706', bg:'#fef3c7' },
  expired: { label:'Expired', color:'#ef4444', bg:'#fef2f2' },
};
const TX_CFG: Record<TxStatus,{label:string;color:string;bg:string}> = {
  completed: { label:'Completed', color:'#16a34a', bg:'#dcfce7' },
  pending:   { label:'Pending',   color:'#d97706', bg:'#fef3c7' },
  failed:    { label:'Failed',    color:'#ef4444', bg:'#fef2f2' },
  refunded:  { label:'Refunded',  color:'#0891b2', bg:'#ecfeff' },
};
const METHOD_LABELS: Record<PayMethod,string> = { card:'Credit Card', bank:'Bank Transfer', mpesa:'M-Pesa', paypal:'PayPal' };

/* ══════════════════════════════════════════════════
   SAMPLE DATA
══════════════════════════════════════════════════ */
const COMPANIES: Company[] = [
  { id:'C1', name:'Summit Traders Ltd',     email:'admin@summit.co.tz',    phone:'+255 712 345 678', plan:'enterprise',   users:48, status:'active',    domain:'summit.clearos.app',    created:'2024-01-15', owner:'Amina Hassan',     country:'Tanzania', color:'#0d7a6b' },
  { id:'C2', name:'Serengeti Foods Co.',    email:'info@serengeti.co.tz',  phone:'+255 754 987 321', plan:'professional', users:18, status:'active',    domain:'serengeti.clearos.app', created:'2024-02-08', owner:'John Mwangi',      country:'Tanzania', color:'#3b82f6' },
  { id:'C3', name:'Karibu Imports',         email:'ops@karibu.co.tz',      phone:'+255 767 111 222', plan:'starter',      users:5,  status:'trial',     domain:'karibu.clearos.app',    created:'2025-01-20', owner:'Grace Osei',       country:'Kenya',    color:'#a855f7' },
  { id:'C4', name:'East Africa Logistics',  email:'admin@eal.co.tz',       phone:'+255 788 456 789', plan:'enterprise',   users:62, status:'active',    domain:'eal.clearos.app',       created:'2023-11-01', owner:'Peter Kimani',     country:'Tanzania', color:'#ef4444' },
  { id:'C5', name:'Kilimanjaro Mining Ltd', email:'info@kilimining.co.tz', phone:'+255 745 333 444', plan:'professional', users:23, status:'active',    domain:'kilimining.clearos.app',created:'2024-04-12', owner:'Fatuma Ally',      country:'Tanzania', color:'#f59e0b' },
  { id:'C6', name:'Dar Port Agency',        email:'ops@darport.co.tz',     phone:'+255 712 999 888', plan:'starter',      users:8,  status:'inactive',  domain:'darport.clearos.app',   created:'2024-06-30', owner:'David Odhiambo',   country:'Tanzania', color:'#6366f1' },
  { id:'C7', name:'TZ Freight Solutions',   email:'admin@tzfreight.co.tz', phone:'+255 767 777 666', plan:'professional', users:15, status:'active',    domain:'tzfreight.clearos.app', created:'2024-08-15', owner:'Amina Hassan',     country:'Tanzania', color:'#22c55e' },
  { id:'C8', name:'Coastal Clearers Ltd',   email:'info@coastal.co.tz',    phone:'+255 754 555 444', plan:'enterprise',   users:37, status:'suspended', domain:'coastal.clearos.app',   created:'2023-09-22', owner:'Beatrice Njoroge', country:'Kenya',    color:'#0891b2' },
];

const PACKAGES: Package[] = [
  { id:'P1', name:'Starter',      monthly:49,  annual:490,  maxUsers:10, active:2, color:'#0891b2',
    features:['Up to 10 users','5 GB storage','Basic shipment tracking','Email support','API access (limited)','Monthly reports'] },
  { id:'P2', name:'Professional', monthly:149, annual:1490, maxUsers:50, active:3, color:'#7c3aed', popular:true,
    features:['Up to 50 users','50 GB storage','Advanced tracking & alerts','Priority support 24h','Full API access','Custom reports','Finance module','CRM & Leads'] },
  { id:'P3', name:'Enterprise',   monthly:399, annual:3990, maxUsers:0,  active:3, color:'#0d7a6b',
    features:['Unlimited users','500 GB storage','Dedicated account manager','24/7 phone support','Custom integrations','White-label option','SLA guarantee','On-premise option'] },
];

const SUBSCRIPTIONS: Subscription[] = [
  { id:'S1', companyId:'C1', plan:'enterprise',   start:'2024-01-15', end:'2025-01-15', amount:3990, billing:'annual',  status:'active'    },
  { id:'S2', companyId:'C2', plan:'professional', start:'2024-02-08', end:'2025-02-08', amount:149,  billing:'monthly', status:'active'    },
  { id:'S3', companyId:'C3', plan:'starter',      start:'2025-01-20', end:'2025-02-20', amount:0,    billing:'monthly', status:'trial'     },
  { id:'S4', companyId:'C4', plan:'enterprise',   start:'2023-11-01', end:'2024-11-01', amount:3990, billing:'annual',  status:'active'    },
  { id:'S5', companyId:'C5', plan:'professional', start:'2024-04-12', end:'2025-04-12', amount:1490, billing:'annual',  status:'active'    },
  { id:'S6', companyId:'C6', plan:'starter',      start:'2024-06-30', end:'2025-06-30', amount:49,   billing:'monthly', status:'cancelled' },
  { id:'S7', companyId:'C7', plan:'professional', start:'2024-08-15', end:'2025-08-15', amount:149,  billing:'monthly', status:'active'    },
  { id:'S8', companyId:'C8', plan:'enterprise',   start:'2023-09-22', end:'2024-09-22', amount:3990, billing:'annual',  status:'cancelled' },
];

const DOMAINS: Domain[] = [
  { id:'D1',  domain:'summit.clearos.app',       companyId:'C1', status:'active',  ssl:true,  created:'2024-01-15' },
  { id:'D2',  domain:'serengeti.clearos.app',    companyId:'C2', status:'active',  ssl:true,  created:'2024-02-08' },
  { id:'D3',  domain:'karibu.clearos.app',       companyId:'C3', status:'pending', ssl:false, created:'2025-01-20' },
  { id:'D4',  domain:'eal.clearos.app',          companyId:'C4', status:'active',  ssl:true,  created:'2023-11-01' },
  { id:'D5',  domain:'kilimining.clearos.app',   companyId:'C5', status:'active',  ssl:true,  created:'2024-04-12' },
  { id:'D6',  domain:'darport.clearos.app',      companyId:'C6', status:'expired', ssl:false, created:'2024-06-30' },
  { id:'D7',  domain:'tzfreight.clearos.app',    companyId:'C7', status:'active',  ssl:true,  created:'2024-08-15' },
  { id:'D8',  domain:'coastal.clearos.app',      companyId:'C8', status:'expired', ssl:false, created:'2023-09-22' },
  { id:'D9',  domain:'clearance.summittz.com',   companyId:'C1', status:'active',  ssl:true,  created:'2024-03-10' },
  { id:'D10', domain:'app.eastafricalog.co.tz',  companyId:'C4', status:'active',  ssl:true,  created:'2024-01-05' },
];

const TRANSACTIONS: Transaction[] = [
  { id:'T1',  txRef:'TXN-2025-0142', companyId:'C1', plan:'enterprise',   amount:3990, date:'2025-02-14', method:'bank',   status:'completed' },
  { id:'T2',  txRef:'TXN-2025-0141', companyId:'C2', plan:'professional', amount:149,  date:'2025-02-13', method:'card',   status:'completed' },
  { id:'T3',  txRef:'TXN-2025-0140', companyId:'C5', plan:'professional', amount:1490, date:'2025-02-12', method:'bank',   status:'completed' },
  { id:'T4',  txRef:'TXN-2025-0139', companyId:'C7', plan:'professional', amount:149,  date:'2025-02-12', method:'card',   status:'completed' },
  { id:'T5',  txRef:'TXN-2025-0138', companyId:'C4', plan:'enterprise',   amount:3990, date:'2025-02-10', method:'bank',   status:'completed' },
  { id:'T6',  txRef:'TXN-2025-0137', companyId:'C3', plan:'starter',      amount:49,   date:'2025-02-08', method:'mpesa',  status:'pending'   },
  { id:'T7',  txRef:'TXN-2025-0136', companyId:'C6', plan:'starter',      amount:49,   date:'2025-02-05', method:'mpesa',  status:'failed'    },
  { id:'T8',  txRef:'TXN-2025-0135', companyId:'C8', plan:'enterprise',   amount:3990, date:'2025-01-30', method:'bank',   status:'refunded'  },
  { id:'T9',  txRef:'TXN-2025-0134', companyId:'C1', plan:'enterprise',   amount:3990, date:'2025-01-15', method:'bank',   status:'completed' },
  { id:'T10', txRef:'TXN-2025-0133', companyId:'C2', plan:'professional', amount:149,  date:'2025-01-13', method:'card',   status:'completed' },
  { id:'T11', txRef:'TXN-2025-0132', companyId:'C7', plan:'professional', amount:149,  date:'2025-01-12', method:'card',   status:'completed' },
  { id:'T12', txRef:'TXN-2025-0131', companyId:'C4', plan:'enterprise',   amount:3990, date:'2024-12-01', method:'bank',   status:'completed' },
];


const ACT_CFG: Record<ActivityType,{color:string;icon:string}> = {
  company: { color:'#3b82f6', icon:'building'   },
  user:    { color:'#7c3aed', icon:'user'        },
  billing: { color:'#0d7a6b', icon:'dollarSign'  },
  system:  { color:'#d97706', icon:'settings'    },
};

const MOCK_ACTIVITY: ActivityLog[] = [
  { id:'A1',  actor:'Super Admin', action:'Suspended company account',         target:'Coastal Clearers Ltd',   companyId:'C8', time:'2026-06-14T11:45:00', type:'company' },
  { id:'A2',  actor:'Super Admin', action:'Upgraded plan to Enterprise',        target:'East Africa Logistics',  companyId:'C4', time:'2026-06-14T10:20:00', type:'billing' },
  { id:'A3',  actor:'Super Admin', action:'Suspended user account',             target:'Brian Otieno (C4)',      companyId:'C4', time:'2026-06-13T16:00:00', type:'user'    },
  { id:'A4',  actor:'Super Admin', action:'Reset password for user',            target:'Grace Osei (C3)',        companyId:'C3', time:'2026-06-13T14:35:00', type:'user'    },
  { id:'A5',  actor:'Super Admin', action:'Issued refund',                      target:'TXN-2025-0135 ($3,990)', companyId:'C8', time:'2026-06-13T11:10:00', type:'billing' },
  { id:'A6',  actor:'Super Admin', action:'Added new company',                  target:'TZ Freight Solutions',   companyId:'C7', time:'2026-06-12T09:00:00', type:'company' },
  { id:'A7',  actor:'Super Admin', action:'Renewed SSL certificate',            target:'summit.clearos.app',     companyId:'C1', time:'2026-06-11T15:30:00', type:'system'  },
  { id:'A8',  actor:'Super Admin', action:'Enabled maintenance mode',           target:'Platform-wide',                          time:'2026-06-10T08:00:00', type:'system'  },
  { id:'A9',  actor:'Super Admin', action:'Created new package — Enterprise+',  target:'Packages',                               time:'2026-06-09T13:20:00', type:'billing' },
  { id:'A10', actor:'Super Admin', action:'Deactivated user account',           target:'Peter Njoroge (C2)',     companyId:'C2', time:'2026-06-08T10:50:00', type:'user'    },
  { id:'A11', actor:'Super Admin', action:'Registered custom domain',           target:'clearance.summittz.com', companyId:'C1', time:'2026-06-07T14:00:00', type:'system'  },
  { id:'A12', actor:'Super Admin', action:'Downgraded plan to Starter',         target:'Dar Port Agency',        companyId:'C6', time:'2026-06-06T11:15:00', type:'billing' },
];

/* ══════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════ */
function fmtCurrency(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
const AV_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#1a7f37','#9a6700','#cf222e','#d05c30','#0e7490'];
function avColor(n: string) { return AV_COLORS[n.charCodeAt(0) % AV_COLORS.length]; }
function coByID(id: string) { return COMPANIES.find(c=>c.id===id)!; }

/* ── Status badge ── */
function Badge({ cfg }: { cfg:{label:string;color:string;bg:string} }) {
  return <span style={{ fontSize:11, fontWeight:700, color:cfg.color, background:cfg.bg, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap' }}>{cfg.label}</span>;
}

/* ── Company avatar ── */
function CoAv({ co, size=34 }: { co:Company|undefined; size?:number }) {
  const color = co?.color ?? '#64748b';
  const initials = co ? co.name.split(' ').slice(0,2).map(w=>w[0]).join('') : '?';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, borderRadius: 9, background:`${color}22`, color, fontSize:size*0.35, fontWeight:800, flexShrink:0, letterSpacing:'-0.03em' }}>
      {initials}
    </span>
  );
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
function KPICard({ title, value, change, icon, color, spark }: { title:string; value:string; change:number; icon:IconName; color:string; spark:number[] }) {
  const pos = change >= 0;
  return (
    <div className="card" style={{ padding:'20px 22px', flex:1 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>{title}</div>
          <div style={{ fontSize:26, fontWeight:800, color:'var(--ink)', letterSpacing:'-0.02em', lineHeight:1 }}>{value}</div>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:pos?'#16a34a':'#ef4444', display:'flex', alignItems:'center', gap:2 }}>
              <Icon name={pos?'arrowUp':'arrowDown'} size={11} color={pos?'#16a34a':'#ef4444'} />
              {Math.abs(change)}%
            </span>
            <span style={{ fontSize:11, color:'var(--ink3)' }}>vs last month</span>
          </div>
        </div>
        <div style={{ width:46, height:46, borderRadius: 9, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon name={icon} size={21} color={color} />
        </div>
      </div>
      <Spark data={spark} color={color} />
    </div>
  );
}

/* ── Page header ── */
function PageHdr({ title, sub, action }: { title:string; sub:string; action?:React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, gap:16 }}>
      <div>
        <h1 style={{ fontSize:20, fontWeight:800, color:'var(--ink)', margin:0, letterSpacing:'-0.02em' }}>{title}</h1>
        <p style={{ fontSize:13, color:'var(--ink3)', margin:'4px 0 0' }}>{sub}</p>
      </div>
      {action}
    </div>
  );
}

/* ── Table wrapper ── */
function DataTable({ headers, children }: { headers:string[]; children:React.ReactNode }) {
  return (
    <div className="rtbl-wrap" style={{ overflowX:'auto' }}>
      <table className="rtbl" style={{ borderCollapse:'collapse', background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)' }}>
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
      style={{ background:hov?(color?`${color}18`:'var(--bg)'):'none', border:'none', borderRadius:6, padding:5, cursor:'pointer', color:color||'var(--ink3)', display:'inline-flex', alignItems:'center', transition:'background .1s' }}>
      <Icon name={icon} size={14} color={color||'var(--ink3)'} />
    </button>
  );
}

/* ── Stat summary card ── */
function StatCard({ label, value, color }: { label:string; value:number|string; color:string }) {
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, padding:'14px 18px', flex:1, borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:22, fontWeight:800, color:'var(--ink)' }}>{value}</div>
      <div style={{ fontSize:12, color:'var(--ink3)', marginTop:4 }}>{label}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DASHBOARD VIEW
══════════════════════════════════════════════════ */
const SPARK = {
  companies:   [42,45,48,52,55,53,58,61,64,68,65,70],
  active:      [38,40,42,44,40,38,41,43,45,44,42,40],
  subscribers: [120,125,130,128,135,140,138,145,150,148,155,160],
  earnings:    [12000,13500,11800,14200,13000,12500,11000,13800,14500,12800,11500,13200],
};
const MONTHLY_REV = [
  {label:'Mar',value:9800},{label:'Apr',value:11200},{label:'May',value:10400},
  {label:'Jun',value:13100},{label:'Jul',value:12600},{label:'Aug',value:14200},
  {label:'Sep',value:11800},{label:'Oct',value:15600},{label:'Nov',value:14900},
  {label:'Dec',value:17200},{label:'Jan',value:16400},{label:'Feb',value:18046},
];
const PLAN_DIST = [
  { label:'Starter',      pct:25, color:'#0891b2' },
  { label:'Professional', pct:37, color:'#7c3aed' },
  { label:'Enterprise',   pct:38, color:'#0d7a6b' },
];
const EXPIRING = SUBSCRIPTIONS.filter(s=>s.status==='active').slice(0,4);

export function DashboardView() {
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

  const { kpis, planDist, spark, monthlyRev, transactions, renewals } = stats;

  return (
    <div>
      <PageHdr title="Super Admin Dashboard" sub="Platform overview — all companies, revenue and activity at a glance" />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Total Companies"    value={String(kpis.totalCompanies)}    change={19.01} icon="building"    color="#3b82f6" spark={spark.companies}   />
        <KPICard title="Active Companies"   value={String(kpis.activeCompanies)}   change={-12}   icon="check"       color="#16a34a" spark={spark.active}      />
        <KPICard title="Total Subscribers"  value={`${kpis.totalSubscribers} users`}  change={6}     icon="users"       color="#7c3aed" spark={spark.subscribers} />
        <KPICard title="Total Earnings"     value={fmtCurrency(kpis.totalEarnings)}    change={-8}    icon="dollarSign"  color="#0d7a6b" spark={spark.earnings}    />
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 280px', gap:16, marginBottom:24 }}>
        {/* Monthly revenue bar */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Monthly Revenue</div>
              <div style={{ fontSize:11, color:'var(--ink3)' }}>Last 12 months</div>
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--teal)', letterSpacing:'-0.02em' }}>{fmtCurrency(kpis.totalEarnings)}</div>
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
            <span style={{ fontSize:12, fontWeight:700, color:'#16a34a', background:'#dcfce7', padding:'3px 8px', borderRadius:20 }}>+6% MoM</span>
          </div>
          <BarChart data={[{label:'Sep',value:1},{label:'Oct',value:1},{label:'Nov',value:2},{label:'Dec',value:1},{label:'Jan',value:2},{label:'Feb',value:1}]} color="#3b82f6" />
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
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Recent transactions */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:14 }}>Recent Transactions</div>
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {transactions.map((tx: any)=>{
              const co = coByID(tx.companyId);
              const txcfg = TX_CFG[tx.status as TxStatus] || TX_CFG.completed;
              return (
                <div key={tx.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                  <CoAv co={co} size={30} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{co?.name || 'Unknown Company'}</div>
                    <div style={{ fontSize:11, color:'var(--ink3)' }}>{tx.txRef}</div>
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

        {/* Plan expirations */}
        <div className="card" style={{ padding:'20px 22px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:14 }}>Upcoming Renewals</div>
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {renewals.map((sub: any)=>{
              const co = coByID(sub.companyId);
              const planCfg = PLAN_CFG[sub.plan as PlanId] || PLAN_CFG.starter;
              return (
                <div key={sub.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                  <CoAv co={co} size={30} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{co?.name || 'Unknown Company'}</div>
                    <div style={{ fontSize:11, color:'var(--ink3)' }}>Expires {fmtDate(sub.end)}</div>
                  </div>
                  <Badge cfg={planCfg} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   COMPANIES VIEW
══════════════════════════════════════════════════ */
interface ApiTenant { id:string; name:string; slug:string; plan:string; active:boolean; created_at:string; logo_url?:string; primary_color?:string; users?:number; }
interface CoForm { name:string; email:string; phone:string; plan:PlanId; owner:string; country:string; }
const CO_FORM_DEFAULT: CoForm = { name:'', email:'', phone:'', plan:'starter', owner:'', country:'Tanzania' };

const TENANT_APPS: { id: string; name: string; color: string }[] = [
  { id: 'clearos',   name: 'ClearOS',  color: '#ea580c' },
  { id: 'finops',    name: 'FinOps',   color: '#0284c7' },
  { id: 'onepi',     name: 'NexusHR',  color: '#0d9488' },
  { id: 'bliss',     name: 'Bliss',    color: '#7c3aed' },
  { id: 'complyos',  name: 'ComplyOS', color: '#059669' },
  { id: 'crm',       name: 'CRM',      color: '#16a34a' },
  { id: 'cloud',     name: 'Cloud',    color: '#0369a1' },
  { id: 'email',     name: 'Email',    color: '#0078d4' },
  { id: 'contacts',  name: 'Contacts', color: '#1a73e8' },
  { id: 'ai',        name: 'AI',       color: '#6d28d9' },
  { id: 'store',     name: 'Store',    color: '#8b5cf6' },
  { id: 'workspace', name: 'Admin',    color: '#64748b' },
];

export function CompaniesView() {
  const { impersonate } = useAuth();
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
    if (apiError || tenants.length === 0) return COMPANIES;
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
        color:   t.primary_color ?? mock?.color ?? avColor(t.name),
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
      alert(`Login As failed: ${err?.message ?? 'No active admin found for this company.'}`);
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
      alert(`Failed to add company: ${err?.message ?? 'Unknown error'}`);
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
    setShowEdit(true);
    apiFetch(`/v1/superadmin/tenants/${co.id}/apps`).then((r: any) => setEditEnabledApps(r.enabledApps || {})).catch(() => {});
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
      await load();
      setShowEdit(false);
      setSelectedCoId(null);
    } catch (err: any) {
      alert(`Failed to update company: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function deleteCompany(id: string) {
    if (!confirm('Are you sure you want to delete this company?')) return;
    try {
      await apiFetch(`/v1/superadmin/tenants/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      alert(`Failed to delete company: ${err?.message ?? 'Unknown error'}`);
    }
  }

  return (
    <div>
      <PageHdr
        title="Companies"
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
        <select title="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)} className="input-field sa-toolbar-select">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select title="Filter by plan" value={planFilter} onChange={e=>setPlanFilter(e.target.value as PlanId|'all')} className="input-field sa-toolbar-select">
          <option value="all">All Plans</option>
          {(Object.keys(PLAN_CFG) as PlanId[]).map(k=><option key={k} value={k}>{PLAN_CFG[k].label}</option>)}
        </select>
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
                    <div style={{ fontWeight:600 }}>{co.name}</div>
                    <div style={{ fontSize:11, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{co.id.length > 10 ? co.id.slice(0,8)+'…' : co.id}</div>
                  </div>
                </div>
              </TD>
              <TD>
                <div style={{ fontSize:12 }}>{co.email}</div>
                <div style={{ fontSize:11, color:'var(--ink3)' }}>{co.phone || co.owner}</div>
              </TD>
              <TD><Badge cfg={PLAN_CFG[co.plan]} /></TD>
              <TD><span style={{ fontWeight:600 }}>{co.users}</span></TD>
              <TD><Badge cfg={CO_CFG[co.status]} /></TD>
              <TD><span style={{ fontSize:12, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{co.domain}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(co.created)}</span></TD>
              <TD>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button
                    type="button"
                    title={`Login as ${co.name}`}
                    disabled={!!impersonating}
                    onClick={() => handleImpersonate(co)}
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:6, border:'1px solid var(--teal)', background:'var(--teal-l)', color:'var(--teal)', fontSize:11, fontWeight:700, cursor: impersonating ? 'not-allowed' : 'pointer', fontFamily:'var(--font)', opacity: impersonating===co.id ? 0.6 : 1, whiteSpace:'nowrap' }}>
                    <Icon name="eye" size={11} color="var(--teal)" />
                    {impersonating === co.id ? 'Switching…' : 'Login As'}
                  </button>
                  <ActBtn icon="edit" color="var(--teal)" title="Edit company" onClick={()=>openEdit(co)} />
                  <ActBtn icon="trash" color="#ef4444" title="Delete company" onClick={()=>deleteCompany(co.id)} />
                </div>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign:'center', padding:'40px 0', color:'var(--ink3)', fontSize:13 }}>No companies match your filters</td></tr>
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
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
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
                <select title="Plan" value={form.plan} onChange={e=>setForm(p=>({...p,plan:e.target.value as PlanId}))} className="input-field" style={{ width:'100%' }}>
                  {(Object.keys(PLAN_CFG) as PlanId[]).map(k=><option key={k} value={k}>{PLAN_CFG[k].label}</option>)}
                </select>
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
                <select title="Plan" value={editForm.plan} onChange={e=>setEditForm(p=>({...p,plan:e.target.value as PlanId}))} className="input-field" style={{ width:'100%' }}>
                  {(Object.keys(PLAN_CFG) as PlanId[]).map(k=><option key={k} value={k}>{PLAN_CFG[k].label}</option>)}
                </select>
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
                      <span style={{ width:7, height:7, borderRadius:'50%', background: app.color, flexShrink:0 }} />
                      {app.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:22 }}>
              <button type="button" title="Cancel" onClick={()=>setShowEdit(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="button" title="Save changes" onClick={saveEditCompany} className="btn btn-primary btn-sm" disabled={!editForm.name.trim()}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
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
      <PageHdr title="Subscriptions" sub="All company subscription plans and billing status" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Subscriptions" value={counts.total}   color="var(--teal)"  />
        <StatCard label="Active"               value={counts.active}  color="#16a34a"      />
        <StatCard label="Trial"                value={counts.trial}   color="#d97706"      />
        <StatCard label="Expired / Cancelled"  value={counts.expired} color="#ef4444"      />
      </div>

      <div className="sa-toolbar">
        <div className="sa-toolbar-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search by company" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by company…" className="input-field" />
        </div>
        <select title="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as SubStatus|'all')} className="input-field sa-toolbar-select">
          <option value="all">All Status</option>
          {(Object.keys(SUB_CFG) as SubStatus[]).map(k=><option key={k} value={k}>{SUB_CFG[k].label}</option>)}
        </select>
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
export function PackagesView() {
  const [packages, setPackages] = useState(PACKAGES);
  const [billing, setBilling] = useState<'monthly'|'annual'>('monthly');
  const [editing, setEditing] = useState<Package|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPkg, setNewPkg] = useState({ name:'', monthly:0, annual:0, maxUsers:10 });

  // Load the canonical catalog from the API — falls back to PACKAGES defaults on failure.
  // Edits here are local-only (no PATCH endpoint yet); this just replaces the old hardcoded seed.
  useEffect(() => {
    apiFetch('/v1/packages').then(res => {
      const mapped: Package[] = (res.data as Array<{ id:string; code:string; name:string; monthly_price:number; annual_price:number; max_users:number; features:string[]; color:string; popular:boolean }>).map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        monthly: pkg.monthly_price,
        annual: pkg.annual_price,
        maxUsers: pkg.max_users,
        active: PACKAGES.find(p => p.name === pkg.name)?.active ?? 0,
        color: pkg.color,
        popular: pkg.popular,
        features: pkg.features,
      }));
      if (mapped.length) setPackages(mapped);
    }).catch(() => { /* keep PACKAGES fallback */ });
  }, []);

  return (
    <div>
      <PageHdr title="Packages" sub="Manage subscription plans and pricing"
        action={
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
              {(['monthly','annual'] as const).map(b=>(
                <button key={b} onClick={()=>setBilling(b)} style={{ padding:'6px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:billing===b?'var(--teal)':'var(--white)', color:billing===b?'#fff':'var(--ink3)', textTransform:'capitalize' }}>{b}</button>
              ))}
            </div>
            <button onClick={()=>setShowAdd(true)} className="btn btn-primary btn-sm" style={{gap:6}}><Icon name="plus" size={13}/>New Package</button>
          </div>
        }
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
        {packages.map(pkg=>(
          <div key={pkg.id} className="card" style={{ padding:'28px 26px', position:'relative', border:`2px solid ${pkg.popular?pkg.color:'var(--border)'}` }}>
            {pkg.popular && (
              <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:pkg.color, color:'#fff', fontSize:10, fontWeight:800, padding:'4px 14px', borderRadius:20, whiteSpace:'nowrap', letterSpacing:'0.06em' }}>MOST POPULAR</div>
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
                <div style={{ fontSize:11, color:'#16a34a', fontWeight:600, marginTop:2 }}>Save ${(pkg.monthly*12-pkg.annual).toFixed(0)}/yr vs monthly</div>
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

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={()=>setEditing(null)}>
          <div className="card" style={{ width:400, padding:28 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>Edit Package — {editing.name}</span>
              <button onClick={()=>setEditing(null)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            {[
              { label:'Monthly Price ($)',  key:'monthly', type:'number' },
              { label:'Annual Price ($)',   key:'annual',  type:'number' },
              { label:'Max Users (0 = unlimited)', key:'maxUsers', type:'number' },
            ].map(f=>(
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={(editing as any)[f.key]} onChange={e=>setEditing(p=>p?({...p,[f.key]:Number(e.target.value)}):p)} className="input-field" style={{ width:'100%' }} />
              </div>
            ))}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
              <button onClick={()=>setEditing(null)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={()=>{ setPackages(p=>p.map(pk=>pk.id===editing.id?editing:pk)); setEditing(null); }} className="btn btn-primary btn-sm">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          <div className="card" style={{ width:400, padding:28 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>New Package</span>
              <button onClick={()=>setShowAdd(false)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            {[
              { label:'Package Name *', key:'name',     type:'text' },
              { label:'Monthly Price ($)', key:'monthly', type:'number' },
              { label:'Annual Price ($)',  key:'annual',  type:'number' },
              { label:'Max Users',         key:'maxUsers',type:'number' },
            ].map(f=>(
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={(newPkg as any)[f.key]} onChange={e=>setNewPkg(p=>({...p,[f.key]:f.type==='number'?Number(e.target.value):e.target.value}))} className="input-field" style={{ width:'100%' }} placeholder={f.key==='name'?'Enterprise Plus':undefined} />
              </div>
            ))}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
              <button onClick={()=>setShowAdd(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={()=>{
                if (!newPkg.name.trim()) return;
                setPackages(p=>[...p,{ id:`P${p.length+1}`, ...newPkg, active:0, color:'#6366f1', features:['Custom features'] }]);
                setNewPkg({name:'',monthly:0,annual:0,maxUsers:10});
                setShowAdd(false);
              }} className="btn btn-primary btn-sm" disabled={!newPkg.name.trim()}>Create Package</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DOMAINS VIEW
══════════════════════════════════════════════════ */
export function DomainsView() {
  const [domains, setDomains] = useState(DOMAINS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DomainStatus|'all'>('all');

  const filtered = useMemo(()=>
    domains.filter(d=>{
      if (statusFilter!=='all' && d.status!==statusFilter) return false;
      if (search && !d.domain.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  [domains, search, statusFilter]);

  const stats = useMemo(()=>({
    total:   domains.length,
    active:  domains.filter(d=>d.status==='active').length,
    ssl:     domains.filter(d=>d.ssl).length,
    pending: domains.filter(d=>d.status==='pending').length,
  }),[domains]);

  return (
    <div>
      <PageHdr title="Domains" sub="Custom domains and SSL certificates across all companies" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Domains"  value={stats.total}   color="var(--teal)"  />
        <StatCard label="Active"         value={stats.active}  color="#16a34a"      />
        <StatCard label="SSL Secured"    value={stats.ssl}     color="#7c3aed"      />
        <StatCard label="Pending"        value={stats.pending} color="#d97706"      />
      </div>

      <div className="sa-toolbar">
        <div className="sa-toolbar-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search domains" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search domains…" className="input-field" />
        </div>
        <select title="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as DomainStatus|'all')} className="input-field sa-toolbar-select">
          <option value="all">All Status</option>
          {(Object.keys(DOM_CFG) as DomainStatus[]).map(k=><option key={k} value={k}>{DOM_CFG[k].label}</option>)}
        </select>
      </div>

      <DataTable headers={['Domain','Company','SSL','Status','Created','Actions']}>
        {filtered.map(d=>{
          const co = coByID(d.companyId);
          return (
            <TR key={d.id}>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:6, background:'var(--bg)' }}>
                    <Icon name="globe" size={14} color="var(--teal)" />
                  </span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>{d.domain}</span>
                </div>
              </TD>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <CoAv co={co} size={26} />
                  <span style={{ fontSize:13 }}>{co.name}</span>
                </div>
              </TD>
              <TD>
                {d.ssl
                  ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'#16a34a', background:'#dcfce7', padding:'3px 8px', borderRadius:20 }}><Icon name="lock" size={10} color="#16a34a" />SSL Active</span>
                  : <span style={{ fontSize:11, fontWeight:700, color:'#ef4444', background:'#fef2f2', padding:'3px 8px', borderRadius:20 }}>No SSL</span>
                }
              </TD>
              <TD><Badge cfg={DOM_CFG[d.status]} /></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(d.created)}</span></TD>
              <TD>
                <div style={{ display:'flex', gap:2 }}>
                  <ActBtn icon="eye"   title="View"   onClick={()=>{}} />
                  <ActBtn icon="edit"  title="Edit"   onClick={()=>{}} />
                  <ActBtn icon="trash" color="#ef4444" title="Delete" onClick={()=>setDomains(p=>p.filter(x=>x.id!==d.id))} />
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
   TRANSACTIONS VIEW
══════════════════════════════════════════════════ */
export function TransactionsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TxStatus|'all'>('all');

  const stats = useMemo(()=>({
    total:     TRANSACTIONS.reduce((s,t)=>t.status==='completed'?s+t.amount:s, 0),
    completed: TRANSACTIONS.filter(t=>t.status==='completed').length,
    pending:   TRANSACTIONS.filter(t=>t.status==='pending').length,
    failed:    TRANSACTIONS.filter(t=>t.status==='failed').length,
  }),[]);

  const filtered = useMemo(()=>
    TRANSACTIONS.filter(t=>{
      if (statusFilter!=='all' && t.status!==statusFilter) return false;
      const co = coByID(t.companyId);
      if (search && !co.name.toLowerCase().includes(search.toLowerCase()) && !t.txRef.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  [search, statusFilter]);

  return (
    <div>
      <PageHdr title="Purchase Transactions" sub="All billing transactions across the platform"
        action={<button className="btn btn-secondary btn-sm" style={{gap:6}}><Icon name="download" size={13}/>Export CSV</button>}
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Revenue"      value={fmtCurrency(stats.total)} color="var(--teal)"  />
        <StatCard label="Completed"          value={stats.completed}          color="#16a34a"      />
        <StatCard label="Pending"            value={stats.pending}            color="#d97706"      />
        <StatCard label="Failed"             value={stats.failed}             color="#ef4444"      />
      </div>

      <div className="sa-toolbar">
        <div className="sa-toolbar-search">
          <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search company or ref" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search company or Ref…" className="input-field" />
        </div>
        <select title="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as TxStatus|'all')} className="input-field sa-toolbar-select">
          <option value="all">All Status</option>
          {(Object.keys(TX_CFG) as TxStatus[]).map(k=><option key={k} value={k}>{TX_CFG[k].label}</option>)}
        </select>
      </div>

      <DataTable headers={['Ref','Company','Plan','Amount','Date','Method','Status','Actions']}>
        {filtered.map(tx=>{
          const co = coByID(tx.companyId);
          return (
            <TR key={tx.id}>
              <TD><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--ink3)' }}>{tx.txRef}</span></TD>
              <TD>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <CoAv co={co} size={28} />
                  <span style={{ fontWeight:600, fontSize:13 }}>{co.name}</span>
                </div>
              </TD>
              <TD><Badge cfg={PLAN_CFG[tx.plan]} /></TD>
              <TD right><span style={{ fontWeight:700, fontFamily:'var(--mono)' }}>{fmtCurrency(tx.amount)}</span></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(tx.date)}</span></TD>
              <TD><span style={{ fontSize:12, color:'var(--ink2)' }}>{METHOD_LABELS[tx.method]}</span></TD>
              <TD><Badge cfg={TX_CFG[tx.status]} /></TD>
              <TD>
                <div style={{ display:'flex', gap:2 }}>
                  <ActBtn icon="eye"      title="View receipt" onClick={()=>{}} />
                  <ActBtn icon="download" title="Download"     onClick={()=>{}} />
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
   FINANCE VIEW
══════════════════════════════════════════════════ */
const MRR_DATA = [
  {label:'Mar',value:820},{label:'Apr',value:968},{label:'May',value:968},
  {label:'Jun',value:1117},{label:'Jul',value:1117},{label:'Aug',value:1266},
  {label:'Sep',value:1117},{label:'Oct',value:1266},{label:'Nov',value:1266},
  {label:'Dec',value:1415},{label:'Jan',value:1266},{label:'Feb',value:1087},
];
const PLAN_REV: { plan:PlanId; companies:number; mrr:number; arr:number }[] = [
  { plan:'starter',      companies:2, mrr:49,     arr:588    },
  { plan:'professional', companies:3, mrr:447,    arr:5364   },
  { plan:'enterprise',   companies:3, mrr:997.50, arr:11970  },
];

export function FinanceView() {
  const totalMRR = PLAN_REV.reduce((s,p)=>s+p.mrr, 0);
  const totalARR = PLAN_REV.reduce((s,p)=>s+p.arr, 0);
  return (
    <div>
      <PageHdr title="Finance" sub="Revenue metrics, MRR/ARR and subscription earnings" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Monthly Recurring Revenue" value={fmtCurrency(totalMRR)} change={8.2}   icon="trendingUp"  color="var(--teal)"  spark={MRR_DATA.map(d=>d.value)} />
        <KPICard title="Annual Recurring Revenue"  value={fmtCurrency(totalARR)} change={8.2}   icon="barChart"    color="#7c3aed"     spark={MRR_DATA.map(d=>d.value*12)} />
        <KPICard title="Total Revenue Collected"   value="$21,046"               change={-4.1}  icon="dollarSign"  color="#f59e0b"     spark={MONTHLY_REV.map(d=>d.value)} />
        <KPICard title="Active Paid Subscribers"   value="5"                     change={0}     icon="users"       color="#ef4444"     spark={[3,3,4,4,4,5,5,5,5,5,5,5]} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
        {/* MRR Trend */}
        <div className="card" style={{ padding:'22px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>MRR Trend</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:20 }}>Monthly recurring revenue — last 12 months</div>
          <BarChart data={MRR_DATA} color="var(--teal)" height={100} />
        </div>

        {/* Revenue by Plan */}
        <div className="card" style={{ padding:'22px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:16 }}>Revenue by Plan</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {PLAN_REV.map(p=>{
              const pct = Math.round((p.mrr/totalMRR)*100);
              const cfg = PLAN_CFG[p.plan];
              return (
                <div key={p.plan}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <Badge cfg={cfg} />
                      <span style={{ fontSize:12, color:'var(--ink3)' }}>{p.companies} co.</span>
                    </div>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{fmtCurrency(p.mrr)}<span style={{ fontSize:11, color:'var(--ink3)', fontWeight:400 }}>/mo</span></span>
                  </div>
                  <div style={{ height:6, background:'var(--border)', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:cfg.color, borderRadius:99 }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop:22, paddingTop:16, borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Annual Breakdown</div>
            {PLAN_REV.map(p=>(
              <div key={p.plan} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, color:'var(--ink2)', textTransform:'capitalize' }}>{p.plan}</span>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)', fontFamily:'var(--mono)' }}>{fmtCurrency(p.arr)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 0', fontWeight:800 }}>
              <span style={{ fontSize:13, color:'var(--ink)' }}>Total ARR</span>
              <span style={{ fontSize:14, color:'var(--teal)', fontFamily:'var(--mono)' }}>{fmtCurrency(totalARR)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   ACTIVITY VIEW
══════════════════════════════════════════════════ */
export function ActivityView() {
  const [typeFilter, setTypeFilter] = useState<ActivityType|'all'>('all');
  const [coFilter, setCoFilter] = useState<string>('all');

  const filtered = useMemo(() =>
    MOCK_ACTIVITY.filter(a => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (coFilter !== 'all' && a.companyId !== coFilter) return false;
      return true;
    }),
  [typeFilter, coFilter]);

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
      <PageHdr title="Activity Log" sub="Audit trail of all superadmin actions on the platform" />

      <div className="sa-toolbar">
        <select title="Filter by type" value={typeFilter} onChange={e => setTypeFilter(e.target.value as ActivityType|'all')} className="input-field sa-toolbar-select">
          <option value="all">All Types</option>
          {(Object.keys(TYPE_LABELS) as ActivityType[]).map(k => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
        </select>
        <select title="Filter by company" value={coFilter} onChange={e => setCoFilter(e.target.value)} className="input-field sa-toolbar-select">
          <option value="all">All Companies</option>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding:'8px 0' }}>
        {filtered.map((a, i) => {
          const cfg = ACT_CFG[a.type];
          const co = a.companyId ? coByID(a.companyId) : null;
          return (
            <div key={a.id} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 22px', borderBottom: i < filtered.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width:34, height:34, borderRadius: 9, background:`${cfg.color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                <Icon name={cfg.icon as any} size={16} color={cfg.color} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{a.actor}</span>
                  <span style={{ fontSize:13, color:'var(--ink2)' }}>{a.action}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:600, color:cfg.color, background:`${cfg.color}14`, padding:'2px 8px', borderRadius: 9 }}>{TYPE_LABELS[a.type]}</span>
                  <span style={{ fontSize:12, color:'var(--ink3)' }}>{a.target}</span>
                  {co && (
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <CoAv co={co} size={16} />
                      <span style={{ fontSize:11, color:'var(--ink3)' }}>{co.name}</span>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize:11, color:'var(--ink3)', whiteSpace:'nowrap', flexShrink:0, marginTop:2 }}>{relTime(a.time)}</div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding:'48px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>No activity matching filters</div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   SETTINGS VIEW
══════════════════════════════════════════════════ */
export function SettingsView() {
  const [saved, setSaved] = useState<string|null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [smtp, setSmtp] = useState({ host:'smtp.mailgun.org', port:'587', user:'no-reply@clearos.io', pass:'', from:'Hudumika Platform <no-reply@clearos.io>', tls:true });
  const [storage, setStorage] = useState({ starter:'5', professional:'50', enterprise:'500', perUserGB:'2' });
  const [features, setFeatures] = useState({ crm:true, hrm:true, finance:true, api:true, whitelabel:false, customDomain:true, aiCopilot:true, twoFactor:false });
  const [security, setSecurity] = useState({ minPasswordLength:'8', sessionTimeoutHours:'8', maxLoginAttempts:'5', lockoutMinutes:'15', twoFaPolicy:'optional' as 'off'|'optional'|'required', ipAllowlist:'' });
  const [api, setApi] = useState({ rateLimit:'120', corsOrigins:'*', webhookSecret:'whs_live_••••••••••••••••', keyRotationDays:'90' });
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);

  useEffect(() => {
    apiFetch('/v1/superadmin/settings')
      .then(res => {
        const s = res.settings || {};
        if (s.maintenance !== undefined) setMaintenance(s.maintenance);
        if (s.smtp) setSmtp(prev => ({ ...prev, ...s.smtp }));
        if (s.storage) setStorage(prev => ({ ...prev, ...s.storage }));
        if (s.features) setFeatures(prev => ({ ...prev, ...s.features }));
        if (s.security) setSecurity(prev => ({ ...prev, ...s.security }));
        if (s.api) setApi(prev => ({ ...prev, ...s.api }));
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  async function save(section: string) {
    const payload = {
      maintenance,
      smtp,
      storage,
      features,
      security,
      api
    };

    try {
      await apiFetch('/v1/superadmin/settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } catch (err: any) {
      alert(`Failed to save settings: ${err?.message ?? 'Unknown error'}`);
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
          storage,
          features,
          security,
          api
        })
      });
    } catch (err: any) {
      setMaintenance(maintenance); // revert
      alert(`Failed to toggle maintenance mode: ${err?.message ?? 'Unknown error'}`);
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
      alert(`SMTP Test Failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setTestingSmtp(false);
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
      <span style={{ position:'absolute', top:3, left:value?18:3, width:16, height:16, borderRadius:99, background:'#fff', transition:'left .2s', display:'block', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  );

  if (loading) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>Loading configurations…</div>;

  return (
    <div style={{ width:'100%' }}>
      <PageHdr title="Platform Settings" sub="Platform-wide configuration applied across all tenants" />

      {/* ── Maintenance Mode ── */}
      <div className="card" style={{ padding:'20px 26px', marginBottom:20, borderLeft:`4px solid ${maintenance ? '#ef4444' : 'var(--border)'}` }}>
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
            style={{ padding:'8px 20px', borderRadius:9, border:'none', cursor:'pointer', fontWeight:700, fontSize:13, flexShrink:0,
              background: maintenance ? '#ef4444' : 'var(--teal)', color:'#fff', fontFamily:'var(--font)' }}>
            {maintenance ? 'Disable Maintenance' : 'Enable Maintenance'}
          </button>
        </div>
      </div>

      {/* ── Security & Sessions ── */}
      <SectionCard title="Security & Sessions" sub="Password policy, session management, and access controls" section="security">
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
            <select title="2FA policy" value={security.twoFaPolicy} onChange={e => setSecurity(p=>({...p,twoFaPolicy:e.target.value as any}))} className="input-field" style={{ width:'100%' }}>
              <option value="off">Off — not offered</option>
              <option value="optional">Optional — users can enable it</option>
              <option value="required">Required — all users must enable it</option>
            </select>
          </Field>
          <Field label="IP Allowlist" hint="Comma-separated CIDRs. Leave blank to allow all IPs.">
            <input title="IP allowlist" placeholder="e.g. 196.0.0.0/8, 10.0.0.1" value={security.ipAllowlist}
              onChange={e => setSecurity(p=>({...p,ipAllowlist:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
        </div>
      </SectionCard>

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

      {/* ── API & Webhooks ── */}
      <SectionCard title="API & Webhooks" sub="Rate limiting, CORS, and webhook security for platform APIs" section="api">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <Field label="API Rate Limit" hint="Maximum requests per minute per API key">
            <input title="Rate limit" type="number" min={10} max={10000} value={api.rateLimit}
              onChange={e => setApi(p=>({...p,rateLimit:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="API Key Rotation" hint="Days before API keys are flagged for rotation">
            <input title="Key rotation days" type="number" min={30} max={365} value={api.keyRotationDays}
              onChange={e => setApi(p=>({...p,keyRotationDays:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="CORS Allowed Origins" hint="Comma-separated origins. Use * to allow all.">
            <input title="CORS origins" placeholder="https://app.yourcompany.com" value={api.corsOrigins}
              onChange={e => setApi(p=>({...p,corsOrigins:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
          <Field label="Webhook Signing Secret" hint="Used to sign outbound webhook payloads">
            <div style={{ display:'flex', gap:8 }}>
              <input title="Webhook secret" type={showWebhookSecret ? 'text' : 'password'} value={api.webhookSecret}
                onChange={e => setApi(p=>({...p,webhookSecret:e.target.value}))} className="input-field" style={{ flex:1 }} />
              <button type="button" title="Toggle visibility" className="btn btn-outline btn-sm"
                onClick={() => setShowWebhookSecret(s => !s)} style={{ flexShrink:0 }}>
                <Icon name={showWebhookSecret ? 'eyeOff' : 'eye'} size={14} />
              </button>
              <button type="button" title="Regenerate secret" className="btn btn-outline btn-sm" onClick={() => save('api-regen')} style={{ flexShrink:0, gap:5 }}>
                <Icon name="refresh" size={13} />{saved==='api-regen'?'Done':'Regen'}
              </button>
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* ── Storage Quotas ── */}
      <SectionCard title="Storage Quotas" sub="Maximum storage allocated per subscription plan and per user" section="storage">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14 }}>
          {(['starter','professional','enterprise'] as const).map(plan => (
            <Field key={plan} label={`${PLAN_CFG[plan].label} (GB)`}>
              <input title={`${PLAN_CFG[plan].label} quota`} type="number" min={1} value={(storage as any)[plan]}
                onChange={e => setStorage(p=>({...p,[plan]:e.target.value}))} className="input-field" style={{ width:'100%' }} />
            </Field>
          ))}
          <Field label="Per-User Add-on (GB)" hint="Extra GB per user seat above the base plan">
            <input title="Per-user storage" type="number" min={0} value={storage.perUserGB}
              onChange={e => setStorage(p=>({...p,perUserGB:e.target.value}))} className="input-field" style={{ width:'100%' }} />
          </Field>
        </div>
      </SectionCard>

      {/* ── Feature Flags ── */}
      <SectionCard title="Feature Flags" sub="Enable or disable platform modules globally across all tenants" section="features">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:10 }}>
          {([
            ['crm','CRM & Leads','Customer relationship and sales pipeline module'],
            ['hrm','HRM Module','Human resources, payroll, and shift management'],
            ['finance','Finance Suite','Accounts, invoicing, and expense tracking'],
            ['api','API Access','Programmatic access via REST API and webhooks'],
            ['whitelabel','White-label Mode','Hide Hudumika branding for reseller tenants'],
            ['customDomain','Custom Domains','Allow tenants to use their own domain name'],
            ['aiCopilot','AI Copilot','Generative AI assistant across all apps'],
            ['twoFactor','2FA Enforcement','Force all accounts to enroll in 2-factor auth'],
          ] as [keyof typeof features, string, string][]).map(([key, label, desc]) => (
            <div key={key} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, padding:'12px 14px', border:'1px solid var(--border)', borderRadius:9 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{label}</div>
                <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:2 }}>{desc}</div>
              </div>
              <SAToggle value={features[key]} onChange={v => setFeatures(p=>({...p,[key]:v}))} label={label} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Cron Jobs ── */}
      <SectionCard title="Cron Jobs" sub="Platform-level scheduled tasks — configure via cron endpoint or process manager" section="cron">
        <div className="sa-cron-url">
          Endpoint: <span className="sa-cron-url-link">{window.location.origin}/api/cron/run?key=CRON_SECRET_KEY</span>
        </div>
        <div className="rtbl-wrap">
          <table className="rtbl">
            <thead>
              <tr className="sa-cron-hdr-row">
                <th className="sa-cron-th">Job</th>
                <th className="sa-cron-th">Schedule</th>
                <th className="sa-cron-th">Last Run</th>
                <th className="sa-cron-th">Duration</th>
                <th className="sa-cron-th--center">Status</th>
              </tr>
            </thead>
            <tbody>
              {([
                { name:'Overdue Invoice Reminders',  schedule:'Daily 09:00',       last:'2026-06-30 09:00', dur:'1.2s',  active:true  },
                { name:'Auto-Renew Subscriptions',   schedule:'Daily 00:00',       last:'2026-06-30 00:00', dur:'0.8s',  active:true  },
                { name:'Sync Exchange Rates',         schedule:'Every 6 hours',     last:'2026-06-30 06:00', dur:'2.1s',  active:true  },
                { name:'Demurrage Alerts',            schedule:'Daily 07:00',       last:'2026-06-30 07:00', dur:'3.4s',  active:true  },
                { name:'SLA Breach Notifications',   schedule:'Every 2 hours',     last:'2026-06-30 08:00', dur:'1.7s',  active:true  },
                { name:'Database Backup',             schedule:'Daily 03:00',       last:'2026-06-30 03:00', dur:'42s',   active:true  },
                { name:'Clear Temp Files',            schedule:'Sundays 02:00',     last:'2026-06-29 02:00', dur:'5.1s',  active:true  },
                { name:'Generate Weekly Reports',     schedule:'Mondays 08:00',     last:'2026-06-23 08:00', dur:'18s',   active:false },
                { name:'Tenant Usage Aggregation',   schedule:'Daily 01:00',       last:'2026-06-30 01:00', dur:'6.3s',  active:true  },
                { name:'Expire Trial Accounts',       schedule:'Daily 23:59',       last:'2026-06-30 23:59', dur:'0.4s',  active:true  },
              ] as const).map((j, i) => (
                <tr key={i} className="sa-cron-row">
                  <td className="sa-cron-td">{j.name}</td>
                  <td className="sa-cron-td--sched">{j.schedule}</td>
                  <td className="sa-cron-td--time">{j.last}</td>
                  <td className="sa-cron-td--time">{j.dur}</td>
                  <td className="sa-cron-td--status">
                    <span className={`sa-cron-badge sa-cron-badge--${j.active ? 'active' : 'inactive'}`}>
                      {j.active ? 'active' : 'paused'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── System & Server Info ── */}
      <SectionCard title="System & Server Info" sub="Read-only platform infrastructure and runtime details" section="server" readOnly>
        <div className="sa-server-grid">
          {([
            ['Application','Hudumika ClearOS v2.1.0'],
            ['Node.js Runtime','v20.18.0 LTS'],
            ['Environment','Production'],
            ['Database','PostgreSQL 16.2'],
            ['Cache Layer','Redis 7.2.4'],
            ['Platform','Linux x64 (Ubuntu 22.04)'],
            ['Storage','262 GB free / 500 GB'],
            ['Memory','768 MB used / 2 GB'],
            ['CPU','4 vCPUs @ 2.4 GHz'],
            ['Active Connections','847'],
            ['Server Timezone','UTC+0'],
            ['Last Deployment','2026-06-10 08:32 UTC'],
            ['Uptime','20d 14h 22m'],
            ['License','Commercial — Active'],
          ] as const).map(([label, value]) => {
            const mono = ['Node.js Runtime','Database','Cache Layer','Memory','CPU','Server Timezone','Last Deployment','Uptime','Active Connections'].includes(label);
            return (
              <div key={label}>
                <div className="sa-server-label">{label}</div>
                <div className={`sa-server-value${mono ? ' sa-server-value--mono' : ''}`}>{value}</div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   BRANDING VIEW
══════════════════════════════════════════════════ */
const APP_META_BRAND: { id: string; name: string; defaultColor: string }[] = [
  { id:'clearos',   name:'ClearOS',        defaultColor:'#ea580c' },
  { id:'finops',    name:'FinOps',          defaultColor:'#0284c7' },
  { id:'complyos',  name:'ComplyOS',        defaultColor:'#059669' },
  { id:'bliss',     name:'Bliss',           defaultColor:'#7c3aed' },
  { id:'onepi',     name:'NexusHR',         defaultColor:'#0d9488' },
  { id:'cloud',     name:'Cloud',           defaultColor:'#0369a1' },
  { id:'ai',        name:'AI',              defaultColor:'#6d28d9' },
  { id:'workspace', name:'Admin',           defaultColor:'#64748b' },
  { id:'email',     name:'Email',           defaultColor:'#0078d4' },
  { id:'crm',       name:'CRM',             defaultColor:'#16a34a' },
  { id:'contacts',  name:'Contacts',        defaultColor:'#1a73e8' },
  { id:'store',     name:'Store',           defaultColor:'#8b5cf6' },
  { id:'admin',     name:'Platform Admin',  defaultColor:'#dc2626' },
];

const BG_OPTIONS = [
  { value:'navy',     label:'Navy',     bg:'#0e1f3d' },
  { value:'teal',     label:'Teal',     bg:'#0d7a6b' },
  { value:'gradient', label:'Gradient', bg:'linear-gradient(135deg,#0e1f3d 0%,#0d7a6b 100%)' },
  { value:'white',    label:'Light',    bg:'#f8fafc' },
] as const;

function BField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="bfield-label">{label}</label>
      {children}
      {hint && <div className="bfield-hint">{hint}</div>}
    </div>
  );
}

function BCard({ title, sub, section, saved, onSave, children }: {
  title: string; sub: string; section: string;
  saved: string|null; onSave: (s: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card bcard">
      <div className="bcard-hdr">
        <div>
          <div className="bcard-title">{title}</div>
          <div className="bcard-sub">{sub}</div>
        </div>
        <button type="button" title={`Save ${title}`} onClick={() => onSave(section)} className="btn btn-primary btn-sm">
          {saved===section ? <><Icon name="check" size={13}/>Saved</> : <><Icon name="save" size={13}/>Save</>}
        </button>
      </div>
      {children}
    </div>
  );
}

function LogoSlot({ variant, preview, onUpload, onClear }: {
  variant: 'light'|'dark';
  preview: string;
  onUpload: (v: 'light'|'dark', e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: (v: 'light'|'dark') => void;
}) {
  return (
    <div className="logo-slot">
      <div className="logo-slot-label">
        {variant === 'light' ? 'Light Mode Logo' : 'Dark Mode Logo'}
      </div>
      <div className={`logo-slot-preview logo-slot-preview--${variant}`}>
        {preview
          ? <img src={preview} alt={`${variant} logo`} className="logo-slot-img" />
          : <span className={`logo-slot-empty--${variant}`}>No logo</span>
        }
      </div>
      <div className="logo-slot-actions">
        <label className="logo-slot-upload-btn">
          <Icon name="upload" size={12}/>{preview ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*,image/svg+xml" className="logo-slot-file-input" onChange={e => onUpload(variant, e)} />
        </label>
        {preview && (
          <button type="button" title="Remove" onClick={() => onClear(variant)} className="logo-slot-remove-btn">
            <Icon name="x" size={12}/>
          </button>
        )}
      </div>
    </div>
  );
}

export function BrandingView() {
  const [saved, setSaved] = useState<string|null>(null);

  const [identity, setIdentity] = useState({
    name:         localStorage.getItem('hudumika_platform_name')     ?? 'Hudumika',
    tagline:      localStorage.getItem('hudumika_platform_tagline')  ?? 'Smart Business, Simplified.',
    supportEmail: localStorage.getItem('hudumika_support_email')     ?? 'support@hudumika.io',
    supportUrl:   localStorage.getItem('hudumika_support_url')       ?? 'https://support.hudumika.io',
    websiteUrl:   localStorage.getItem('hudumika_website_url')       ?? 'https://hudumika.io',
  });

  const [logoLight, setLogoLight] = useState<string>(localStorage.getItem('hudumika_brand_logo_light') ?? '');
  const [logoDark,  setLogoDark]  = useState<string>(localStorage.getItem('hudumika_brand_logo_dark')  ?? '');
  const [favicon,   setFavicon]   = useState<string>(localStorage.getItem('hudumika_brand_favicon')    ?? '');

  const [login, setLogin] = useState({
    headline: localStorage.getItem('hudumika_login_headline') ?? 'Welcome back',
    subtext:  localStorage.getItem('hudumika_login_subtext')  ?? 'Sign in to your Hudumika workspace',
    bgStyle:  (localStorage.getItem('hudumika_login_bg') ?? 'navy') as 'navy'|'teal'|'gradient'|'white',
  });

  const [colors, setColors] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_color_${a.id}`) ?? a.defaultColor]))
  );

  const [appLogos, setAppLogos] = useState<Record<string, string>>(
    Object.fromEntries(APP_META_BRAND.map(a => [a.id, localStorage.getItem(`hudumika_app_logo_${a.id}`) ?? '']))
  );
  const [savedApp, setSavedApp] = useState<string|null>(null);

  const [emailBrand, setEmailBrand] = useState({
    headerText:  localStorage.getItem('hudumika_email_header')  ?? 'Hudumika Platform',
    footerText:  localStorage.getItem('hudumika_email_footer')  ?? '© 2026 Hudumika LLC. All rights reserved.',
    accentColor: localStorage.getItem('hudumika_email_accent')  ?? '#0d7a6b',
  });

  function readFile(file: File): Promise<string> {
    return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
  }

  async function handleLogoFile(which: 'light'|'dark', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await readFile(file);
    const key  = which === 'light' ? 'hudumika_brand_logo_light' : 'hudumika_brand_logo_dark';
    localStorage.setItem(key, data);
    which === 'light' ? setLogoLight(data) : setLogoDark(data);
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
  }

  async function handleFaviconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await readFile(file);
    localStorage.setItem('hudumika_brand_favicon', data);
    setFavicon(data);
  }

  function clearLogo(which: 'light'|'dark') {
    const key = which === 'light' ? 'hudumika_brand_logo_light' : 'hudumika_brand_logo_dark';
    localStorage.removeItem(key);
    which === 'light' ? setLogoLight('') : setLogoDark('');
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
  }

  async function handleAppLogoFile(appId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await readFile(file);
    setAppLogos(p => ({ ...p, [appId]: data }));
  }

  function saveApp(appId: string) {
    localStorage.setItem(`hudumika_app_color_${appId}`, colors[appId]);
    const logo = appLogos[appId];
    if (logo) localStorage.setItem(`hudumika_app_logo_${appId}`, logo);
    else localStorage.removeItem(`hudumika_app_logo_${appId}`);
    window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    setSavedApp(appId);
    setTimeout(() => setSavedApp(null), 2000);
  }

  function save(section: string) {
    if (section === 'identity') {
      localStorage.setItem('hudumika_platform_name',    identity.name);
      localStorage.setItem('hudumika_platform_tagline', identity.tagline);
      localStorage.setItem('hudumika_support_email',    identity.supportEmail);
      localStorage.setItem('hudumika_support_url',      identity.supportUrl);
      localStorage.setItem('hudumika_website_url',      identity.websiteUrl);
      window.dispatchEvent(new CustomEvent('hudumika-brand-updated'));
    }
    if (section === 'login') {
      localStorage.setItem('hudumika_login_headline', login.headline);
      localStorage.setItem('hudumika_login_subtext',  login.subtext);
      localStorage.setItem('hudumika_login_bg',       login.bgStyle);
    }
    if (section === 'colors') {
      APP_META_BRAND.forEach(a => localStorage.setItem(`hudumika_app_color_${a.id}`, colors[a.id]));
    }
    if (section === 'email') {
      localStorage.setItem('hudumika_email_header', emailBrand.headerText);
      localStorage.setItem('hudumika_email_footer', emailBrand.footerText);
      localStorage.setItem('hudumika_email_accent', emailBrand.accentColor);
    }
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  const loginBg = BG_OPTIONS.find(o => o.value === login.bgStyle)?.bg ?? '#0e1f3d';
  const loginDark = login.bgStyle !== 'white';

  return (
    <div style={{ width:'100%' }}>
      <PageHdr title="Platform Branding" sub="Visual identity applied across all tenant interfaces, login pages, and communications" />

      {/* ── Platform Identity ── */}
      <BCard title="Platform Identity" sub="Name, tagline, and support links shown on the workspace home, login page, and error pages" section="identity" saved={saved} onSave={save}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
          <BField label="Platform Name" hint="Appears in the AppHeader and on the login page">
            <input title="Platform name" value={identity.name} onChange={e => setIdentity(p=>({...p,name:e.target.value}))} placeholder="Hudumika" className="input-field" style={{ width:'100%' }} />
          </BField>
          <BField label="Tagline" hint="Short slogan on the workspace home welcome bar">
            <input title="Tagline" value={identity.tagline} onChange={e => setIdentity(p=>({...p,tagline:e.target.value}))} placeholder="Smart Business, Simplified." className="input-field" style={{ width:'100%' }} />
          </BField>
          <BField label="Support Email" hint="Linked on error pages and the footer">
            <input title="Support email" type="email" value={identity.supportEmail} onChange={e => setIdentity(p=>({...p,supportEmail:e.target.value}))} placeholder="support@clearos.io" className="input-field" style={{ width:'100%' }} />
          </BField>
          <BField label="Help / Documentation URL" hint="Help desk or knowledge base link">
            <input title="Support URL" type="url" value={identity.supportUrl} onChange={e => setIdentity(p=>({...p,supportUrl:e.target.value}))} placeholder="https://support.clearos.io" className="input-field" style={{ width:'100%' }} />
          </BField>
          <BField label="Website URL" hint="Linked in email footers and the login page">
            <input title="Website URL" type="url" value={identity.websiteUrl} onChange={e => setIdentity(p=>({...p,websiteUrl:e.target.value}))} placeholder="https://clearos.io" className="input-field" style={{ width:'100%' }} />
          </BField>
        </div>
      </BCard>

      {/* ── Logos & Favicon ── */}
      <BCard title="Logos & Favicon" sub="Upload both logo variants for light/dark mode support. SVG or PNG recommended." section="logos" saved={saved} onSave={save}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16 }}>
          <LogoSlot variant="light" preview={logoLight} onUpload={handleLogoFile} onClear={clearLogo} />
          <LogoSlot variant="dark"  preview={logoDark}  onUpload={handleLogoFile} onClear={clearLogo} />
          {/* Favicon */}
          <div style={{ border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', marginBottom:10 }}>Favicon</div>
            <div style={{ height:72, borderRadius:8, marginBottom:12, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', border:'1px solid var(--border)' }}>
              {favicon
                ? <img src={favicon} alt="favicon" style={{ width:32, height:32, objectFit:'contain', imageRendering:'pixelated' }} />
                : <span style={{ fontSize:11, color:'var(--ink3)' }}>No favicon</span>
              }
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <label style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, height:32, borderRadius:7, border:'1px solid var(--border)', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--ink2)', background:'var(--bg)' }}>
                <Icon name="upload" size={12}/>{favicon ? 'Replace' : 'Upload ICO/PNG'}
                <input type="file" accept="image/x-icon,image/png,image/svg+xml" style={{ display:'none' }} onChange={handleFaviconFile} />
              </label>
              {favicon && (
                <button type="button" title="Remove favicon" onClick={() => { setFavicon(''); localStorage.removeItem('hudumika_brand_favicon'); }} style={{ width:32, height:32, borderRadius:7, border:'1px solid var(--border)', background:'var(--bg)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink3)' }}>
                  <Icon name="x" size={12}/>
                </button>
              )}
            </div>
          </div>
        </div>
      </BCard>

      {/* ── Login Page ── */}
      <BCard title="Login Page" sub="Headline text and background shown to all users on the sign-in screen" section="login" saved={saved} onSave={save}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:20 }}>
          <div style={{ display:'grid', gap:16, alignContent:'start' }}>
            <BField label="Headline" hint="Large text displayed above the sign-in form">
              <input title="Login headline" value={login.headline} onChange={e => setLogin(p=>({...p,headline:e.target.value}))} placeholder="Welcome back" className="input-field" style={{ width:'100%' }} />
            </BField>
            <BField label="Sub-text" hint="Descriptive text below the headline">
              <input title="Login subtext" value={login.subtext} onChange={e => setLogin(p=>({...p,subtext:e.target.value}))} placeholder="Sign in to your workspace" className="input-field" style={{ width:'100%' }} />
            </BField>
            <BField label="Background Style">
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:6 }}>
                {BG_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" title={opt.label} onClick={() => setLogin(p=>({...p,bgStyle:opt.value}))}
                    style={{ height:36, borderRadius:8, border: login.bgStyle===opt.value ? '2.5px solid var(--teal)' : '2px solid var(--border)', cursor:'pointer', background:opt.bg, outline:'none' }} />
                ))}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {BG_OPTIONS.map(opt => (
                  <span key={opt.value} style={{ flex:1, fontSize:10, color: login.bgStyle===opt.value ? 'var(--teal)':'var(--ink3)', textAlign:'center', fontWeight: login.bgStyle===opt.value ? 700:400 }}>{opt.label}</span>
                ))}
              </div>
            </BField>
          </div>
          {/* Live preview */}
          <div style={{ borderRadius:12, overflow:'hidden', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', minHeight:180, background:loginBg }}>
            <div style={{ textAlign:'center', padding:'0 24px' }}>
              <div style={{ width:32, height:32, borderRadius:8, background: loginDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.08)', margin:'0 auto 12px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="shield" size={16} color={loginDark ? '#fff' : 'var(--ink2)'} />
              </div>
              <div style={{ fontSize:15, fontWeight:800, color: loginDark?'#fff':'var(--ink)', marginBottom:6 }}>
                {login.headline || 'Welcome back'}
              </div>
              <div style={{ fontSize:11, color: loginDark?'rgba(255,255,255,0.55)':'var(--ink3)' }}>
                {login.subtext || 'Sign in to your workspace'}
              </div>
            </div>
          </div>
        </div>
      </BCard>

      {/* ── App Branding ── */}
      <div className="card sa-app-brand-card">
        <div className="sa-app-brand-hdr">
          <div className="sa-app-brand-title">App Branding</div>
          <div className="sa-app-brand-sub">Logo and accent color for each app — saved individually</div>
        </div>
        <div className="sa-app-brand-list">
          {APP_META_BRAND.map(app => {
            const logo  = appLogos[app.id];
            const color = colors[app.id];
            return (
              <div key={app.id} className="sa-app-brand-row">

                {/* Preview */}
                <div className={`sa-app-preview${logo ? ' sa-app-preview--logo' : ''}`}
                  style={logo ? undefined : { background: color }}>
                  {logo
                    ? <img src={logo} alt={app.name} />
                    : <span className="sa-app-preview-init">{app.name.slice(0,1)}</span>
                  }
                </div>

                {/* Name + id */}
                <div className="sa-app-info">
                  <div className="sa-app-info-name">{app.name}</div>
                  <div className="sa-app-info-id">{app.id}</div>
                </div>

                {/* Color picker */}
                <div className="sa-app-color-row">
                  <input type="color" title={`${app.name} color`} className="sa-brand-color-input"
                    value={color} onChange={e => setColors(p=>({...p,[app.id]:e.target.value}))} />
                  <button type="button" title="Reset color" className="btn btn-sm sa-brand-reset-app-btn"
                    onClick={() => setColors(p=>({...p,[app.id]:app.defaultColor}))}>↺</button>
                </div>

                {/* Logo upload */}
                <div className="sa-app-logo-row">
                  <label className="sa-app-logo-label">
                    <Icon name="upload" size={12}/>{logo ? 'Replace Logo' : 'Upload Logo'}
                    <input type="file" accept="image/*,image/svg+xml" onChange={e => handleAppLogoFile(app.id, e)} />
                  </label>
                  {logo && (
                    <button type="button" title="Remove logo" className="sa-app-logo-remove"
                      onClick={() => setAppLogos(p=>({...p,[app.id]:''}))}>
                      <Icon name="x" size={12}/>
                    </button>
                  )}
                </div>

                {/* Per-app save */}
                <button type="button" onClick={() => saveApp(app.id)} className="btn btn-primary btn-sm sa-app-save-btn">
                  {savedApp===app.id ? <><Icon name="check" size={12}/>Saved</> : <><Icon name="save" size={12}/>Save</>}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Email Branding ── */}
      <BCard title="Email Branding" sub="Header, footer, and accent color rendered in all platform-generated emails" section="email" saved={saved} onSave={save}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:20 }}>
          <div style={{ display:'grid', gap:16, alignContent:'start' }}>
            <BField label="Email Header Text" hint="Brand name shown at the top of every outgoing email">
              <input title="Email header" value={emailBrand.headerText} onChange={e => setEmailBrand(p=>({...p,headerText:e.target.value}))} placeholder="Hudumika Platform" className="input-field" style={{ width:'100%' }} />
            </BField>
            <BField label="Email Footer Text" hint="Copyright or legal line at the bottom of emails">
              <input title="Email footer" value={emailBrand.footerText} onChange={e => setEmailBrand(p=>({...p,footerText:e.target.value}))} placeholder="© 2026 Hudumika LLC." className="input-field" style={{ width:'100%' }} />
            </BField>
            <BField label="Accent Color" hint="Button and link color in email templates">
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="color" title="Email accent color" className="sa-brand-color-input"
                  value={emailBrand.accentColor} onChange={e => setEmailBrand(p=>({...p,accentColor:e.target.value}))} />
                <span style={{ fontSize:12, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{emailBrand.accentColor}</span>
              </div>
            </BField>
          </div>
          {/* Email preview */}
          <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', fontSize:12, background:'var(--white)' }}>
            <div style={{ padding:'12px 16px', borderBottom:`3px solid ${emailBrand.accentColor}`, background:'var(--bg)', fontWeight:700, color:'var(--ink)', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:emailBrand.accentColor, display:'inline-block', flexShrink:0 }} />
              {emailBrand.headerText || 'Platform'}
            </div>
            <div style={{ padding:'18px 16px' }}>
              <div style={{ width:48, height:7, background:emailBrand.accentColor, borderRadius:3, marginBottom:12 }} />
              <div style={{ width:'75%', height:5, background:'var(--border)', borderRadius:3, marginBottom:7 }} />
              <div style={{ width:'55%', height:5, background:'var(--border)', borderRadius:3, marginBottom:18 }} />
              <div style={{ display:'inline-block', padding:'7px 16px', background:emailBrand.accentColor, color:'#fff', borderRadius:6, fontSize:11, fontWeight:700 }}>
                View in App →
              </div>
            </div>
            <div style={{ padding:'10px 16px', background:'var(--bg)', borderTop:'1px solid var(--border)', color:'var(--ink3)', fontSize:10, lineHeight:1.5 }}>
              {emailBrand.footerText || '© 2026 Hudumika LLC.'}
            </div>
          </div>
        </div>
      </BCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════ */
type ActivityType = 'company'|'user'|'billing'|'system';

interface ActivityLog { id:string; actor:string; action:string; target:string; companyId?:string; time:string; type:ActivityType; }

// View components are exported individually above and composed in SuperAdminShell
