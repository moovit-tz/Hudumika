import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import './SuperAdmin.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Switch } from '../components/ui/switch.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

/* ══════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════ */
type PlanId = 'starter' | 'growth' | 'scale' | 'enterprise';
type CoStatus = 'active' | 'inactive' | 'trial' | 'suspended';
type SubStatus = 'active' | 'expired' | 'trial' | 'cancelled';
type DomainStatus = 'active' | 'pending' | 'expired';
type TxStatus = 'completed' | 'pending' | 'failed' | 'refunded';
type PayMethod = 'card' | 'bank' | 'mpesa' | 'paypal';

interface Company { id:string; name:string; email:string; phone:string; plan:PlanId; users:number; status:CoStatus; domain:string; created:string; owner:string; country:string; color:string; }
interface Subscription { id:string; companyId:string; plan:PlanId; start:string; end:string; amount:number; billing:'monthly'|'annual'; status:SubStatus; }
interface Package { id:string; code:string; name:string; monthly:number; annual:number; maxUsers:number; features:string[]; active:number; color:string; popular?:boolean; }
interface Domain { id:string; domain:string; companyId:string; status:DomainStatus; ssl:boolean; created:string; }
interface Transaction { id:string; txRef:string; companyId:string; plan:PlanId; amount:number; date:string; method:PayMethod; status:TxStatus; }

/* ══════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════ */
const PLAN_CFG: Record<PlanId,{label:string;color:string;bg:string}> = {
  starter:    { label:'Starter',    color:'var(--blue)', bg:'var(--blue-l)'  },
  growth:     { label:'Growth',     color:'var(--purple)', bg:'var(--purple-l)'  },
  scale:      { label:'Scale',      color:'var(--blue)', bg:'var(--blue-l)'  },
  enterprise: { label:'Enterprise', color:'var(--teal)', bg:'var(--teal-l)'  },
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
  active:  { label:'Active',  color:'var(--green)', bg:'var(--green-l)' },
  pending: { label:'Pending', color:'var(--gold)', bg:'var(--gold-l)' },
  expired: { label:'Expired', color:'var(--red)', bg:'var(--red-l)' },
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
  { id:'C4', name:'East Africa Logistics',  email:'admin@eal.co.tz',       phone:'+255 788 456 789', plan:'enterprise', users:62, status:'active',    domain:'eal.clearos.app',       created:'2023-11-01', owner:'Peter Kimani',     country:'Tanzania', color:'#ef4444' },
  { id:'C5', name:'Kilimanjaro Mining Ltd', email:'info@kilimining.co.tz', phone:'+255 745 333 444', plan:'scale',      users:23, status:'active',    domain:'kilimining.clearos.app',created:'2024-04-12', owner:'Fatuma Ally',      country:'Tanzania', color:'#f59e0b' },
  { id:'C6', name:'Dar Port Agency',        email:'ops@darport.co.tz',     phone:'+255 712 999 888', plan:'starter',    users:8,  status:'inactive',  domain:'darport.clearos.app',   created:'2024-06-30', owner:'David Odhiambo',   country:'Tanzania', color:'#6366f1' },
  { id:'C7', name:'TZ Freight Solutions',   email:'admin@tzfreight.co.tz', phone:'+255 767 777 666', plan:'growth',     users:15, status:'active',    domain:'tzfreight.clearos.app', created:'2024-08-15', owner:'Amina Hassan',     country:'Tanzania', color:'#22c55e' },
  { id:'C8', name:'Coastal Clearers Ltd',   email:'info@coastal.co.tz',    phone:'+255 754 555 444', plan:'enterprise',   users:37, status:'suspended', domain:'coastal.clearos.app',   created:'2023-09-22', owner:'Beatrice Njoroge', country:'Kenya',    color:'#0891b2' },
];

const PACKAGES: Package[] = [
  { id:'P1', code:'starter',  name:'Starter',  monthly:29,  annual:290,  maxUsers:5,  active:0, color:'#0891b2',
    features:['0-5 employees — East African startups & entrepreneurs','Up to 5 users','10 GB storage','50 shipments / month','Basic shipment tracking','TANCIS integration','Email support','Local mobile money (M-Pesa, Tigo Pesa, Airtel Money)'] },
  { id:'P2', code:'growth',   name:'Growth',   monthly:99,  annual:990,  maxUsers:20, active:0, color:'#0d7a6b', popular:true,
    features:['6-20 employees — growing logistics & trading teams','Up to 20 users','50 GB storage','250 shipments / month','Advanced tracking & alerts','Finance module (invoices, bills)','CRM & Leads','WhatsApp Bot','Priority 24h support'] },
  { id:'P3', code:'scale',    name:'Scale',    monthly:299, annual:2990, maxUsers:99, active:0, color:'#2563eb',
    features:['21-99 employees — established multi-branch operators','Up to 99 users','250 GB storage','1,000 shipments / month','Full API access','HR / People module','TANESW integration','Demurrage tracking','Custom reports','Multi-branch support'] },
  { id:'P4', code:'enterprise', name:'Enterprise', monthly:0, annual:0, maxUsers:0,  active:0, color:'#6e40c9',
    features:['100+ employees — large enterprises & financial institutions','Unlimited users','Unlimited storage','Unlimited shipments','Dedicated account manager','24/7 phone & WhatsApp support','Custom integrations (core banking APIs)','White-label option','99.99% SLA guarantee','On-premise / private cloud option'] },
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
  { id:'T1',  txRef:'TXN-2025-0142', companyId:'C1', plan:'enterprise', amount:9990, date:'2025-02-14', method:'bank',   status:'completed' },
  { id:'T2',  txRef:'TXN-2025-0141', companyId:'C2', plan:'growth',     amount:99,   date:'2025-02-13', method:'card',   status:'completed' },
  { id:'T3',  txRef:'TXN-2025-0140', companyId:'C5', plan:'scale',      amount:2990, date:'2025-02-12', method:'bank',   status:'completed' },
  { id:'T4',  txRef:'TXN-2025-0139', companyId:'C7', plan:'growth',     amount:99,   date:'2025-02-12', method:'card',   status:'completed' },
  { id:'T5',  txRef:'TXN-2025-0138', companyId:'C4', plan:'enterprise', amount:9990, date:'2025-02-10', method:'bank',   status:'completed' },
  { id:'T6',  txRef:'TXN-2025-0137', companyId:'C3', plan:'starter',    amount:29,   date:'2025-02-08', method:'mpesa',  status:'pending'   },
  { id:'T7',  txRef:'TXN-2025-0136', companyId:'C6', plan:'starter',    amount:29,   date:'2025-02-05', method:'mpesa',  status:'failed'    },
  { id:'T8',  txRef:'TXN-2025-0135', companyId:'C8', plan:'enterprise', amount:9990, date:'2025-01-30', method:'bank',   status:'refunded'  },
  { id:'T9',  txRef:'TXN-2025-0134', companyId:'C1', plan:'enterprise', amount:9990, date:'2025-01-15', method:'bank',   status:'completed' },
  { id:'T10', txRef:'TXN-2025-0133', companyId:'C2', plan:'growth',     amount:99,   date:'2025-01-13', method:'card',   status:'completed' },
  { id:'T11', txRef:'TXN-2025-0132', companyId:'C7', plan:'growth',     amount:99,   date:'2025-01-12', method:'card',   status:'completed' },
  { id:'T12', txRef:'TXN-2025-0131', companyId:'C4', plan:'enterprise', amount:9990, date:'2024-12-01', method:'bank',   status:'completed' },
];


const ACT_CFG: Record<ActivityType,{color:string;bg:string;icon:string}> = {
  company: { color:'var(--blue)', bg:'var(--blue-l)', icon:'building'   },
  user:    { color:'var(--purple)', bg:'var(--purple-l)', icon:'user'        },
  billing: { color:'var(--teal)', bg:'var(--teal-l)', icon:'dollarSign'  },
  system:  { color:'var(--gold)', bg:'var(--gold-l)', icon:'settings'    },
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
const AV_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30','#0e7490'];
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
            <span style={{ fontSize:12, fontWeight:700, color:pos?'var(--green)':'var(--red)', display:'flex', alignItems:'center', gap:2 }}>
              <Icon name={pos?'arrowUp':'arrowDown'} size={11} color={pos?'var(--green)':'var(--red)'} />
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
    <div className="sa-page-hdr" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginTop: 20, marginBottom:24, gap:16, flexWrap:'wrap' }}>
      <div style={{ minWidth:0 }}>
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
  { label:'Starter',      pct:25, color:'var(--blue)' },
  { label:'Professional', pct:37, color:'var(--purple)' },
  { label:'Enterprise',   pct:38, color:'var(--teal)' },
];
const EXPIRING = SUBSCRIPTIONS.filter(s=>s.status==='active').slice(0,4);

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

  const { kpis, planDist, spark, monthlyRev, transactions, renewals } = stats;

  return (
    <div>
      <PageHdr title="Super Admin Dashboard" sub="Platform overview — all companies, revenue and activity at a glance" />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Total Companies"    value={String(kpis.totalCompanies)}    change={19.01} icon="building"    color="var(--blue)" spark={spark.companies}   />
        <KPICard title="Active Companies"   value={String(kpis.activeCompanies)}   change={-12}   icon="check"       color="var(--green)" spark={spark.active}      />
        <KPICard title="Total Subscribers"  value={`${kpis.totalSubscribers} users`}  change={6}     icon="users"       color="var(--purple)" spark={spark.subscribers} />
        <KPICard title="Total Earnings"     value={fmtCurrency(kpis.totalEarnings)}    change={-8}    icon="dollarSign"  color="var(--teal)" spark={spark.earnings}    />
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 280px', gap:16, marginBottom:24 }}>
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
            <span style={{ fontSize:12, fontWeight:700, color:'var(--green)', background:'var(--green-l)', padding:'3px 8px', borderRadius:20 }}>+6% MoM</span>
          </div>
          <BarChart data={[{label:'Sep',value:1},{label:'Oct',value:1},{label:'Nov',value:2},{label:'Dec',value:1},{label:'Jan',value:2},{label:'Feb',value:1}]} color="var(--blue)" />
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
  { id: 'clearos',   name: 'ClearOS',  color: 'var(--gold)' },
  { id: 'finops',    name: 'FinOps',   color: 'var(--blue)' },
  { id: 'onepi',     name: 'NexusHR',  color: 'var(--teal)' },
  { id: 'bliss',     name: 'Bliss',    color: 'var(--purple)' },
  { id: 'complyos',  name: 'ComplyOS', color: 'var(--green)' },
  { id: 'crm',       name: 'CRM',      color: 'var(--green)' },
  { id: 'cloud',     name: 'Cloud',    color: 'var(--blue)' },
  { id: 'email',     name: 'Email',    color: 'var(--blue)' },
  { id: 'contacts',  name: 'Contacts', color: 'var(--blue)' },
  { id: 'ai',        name: 'AI',       color: 'var(--purple)' },
  { id: 'store',     name: 'Store',    color: 'var(--purple)' },
  { id: 'oneid',     name: 'Ondi',     color: 'var(--blue)' },
  { id: 'tracking',  name: 'Tracking', color: 'var(--blue)' },
  { id: 'workspace', name: 'Admin',    color: 'var(--ink3)' },
  { id: 'demurrage',     name: 'Demurrage',    color: 'var(--red)' },
  { id: 'cargotracker',  name: 'CargoTracker', color: 'var(--purple)' },
];

export function CompaniesView() {
  const isMobile = useIsMobile();
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
      showAlert(`Login As failed: ${err?.message ?? 'No active admin found for this company.'}`);
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
      showAlert(`Failed to update company: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function deleteCompany(id: string) {
    if (!(await showConfirm('Are you sure you want to delete this company?', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/superadmin/tenants/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      showAlert(`Failed to delete company: ${err?.message ?? 'Unknown error'}`);
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
                  <ActBtn icon="trash" color="var(--red)" title="Delete company" onClick={()=>deleteCompany(co.id)} />
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
  'ai', 'clearos', 'cloud', 'complyos', 'contacts', 'email', 'finops', 'oneid', 'onepi', 'tracking',
  'tracking.cargo-loading', 'tracking.warehouse', 'tracking.analytics', 'tracking.reports',
  'demurrage', 'cargotracker',
];

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
    <div style={{ marginBottom:16, paddingTop:14, borderTop:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)' }}>Feature Gates ({packageCode})</label>
        <button type="button" onClick={save} disabled={loading || saving} className="btn btn-secondary btn-sm" style={{ fontSize:11 }}>
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save Gates'}
        </button>
      </div>
      {loading ? (
        <div style={{ fontSize:12, color:'var(--ink3)' }}>Loading…</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6, maxHeight:180, overflowY:'auto' }}>
          {ALL_FEATURE_KEYS.map(key => (
            <label key={key} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink2)', cursor:'pointer' }}>
              <input type="checkbox" checked={features.includes(key)} onChange={() => toggleKey(key)} />
              {key}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function PackagesView() {
  const [packages, setPackages] = useState(PACKAGES);
  const [billing, setBilling] = useState<'monthly'|'annual'>('monthly');
  const [editing, setEditing] = useState<Package|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPkg, setNewPkg] = useState({ name:'', monthly:0, annual:0, maxUsers:10 });

  // Load the canonical catalog from the API — falls back to PACKAGES defaults on failure.
  // Edit/Create/Deactivate below are wired to real endpoints (packages.routes.ts POST/PATCH/DELETE,
  // SuperAdmin-gated). The Feature Gates checklist in the edit modal is a separate, already-wired
  // endpoint (/v1/superadmin/packages/:code/features) — see FeatureGatesEditor below.
  function mapFromApi(pkg: { id:string; code:string; name:string; monthly_price:number; annual_price:number; max_users:number; features:string[]; color:string; popular:boolean }): Package {
    return {
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      monthly: pkg.monthly_price,
      annual: pkg.annual_price,
      maxUsers: pkg.max_users,
      active: 0,
      color: pkg.color,
      popular: pkg.popular,
      features: pkg.features,
    };
  }

  function reload() {
    apiFetch('/v1/packages').then(res => {
      const mapped: Package[] = (res.data as any[]).map(mapFromApi);
      if (mapped.length) setPackages(mapped);
    }).catch(() => { /* keep current/fallback list */ });
  }

  useEffect(() => { reload(); }, []);

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

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:20 }}>
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
                <div style={{ fontSize:11, color:'var(--green)', fontWeight:600, marginTop:2 }}>Save ${(pkg.monthly*12-pkg.annual).toFixed(0)}/yr vs monthly</div>
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
          <div className="card" style={{ width:460, padding:28 }} onClick={e=>e.stopPropagation()}>
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
            <FeatureGatesEditor packageCode={editing.code} />
            <div style={{ display:'flex', gap:10, justifyContent:'space-between', marginTop:4 }}>
              <button
                onClick={async () => {
                  if (!(await showConfirm(`Deactivate the ${editing.name} package? It will stop appearing to new signups.`, { variant: 'warning', confirmLabel: 'Deactivate' }))) return;
                  try {
                    await apiFetch(`/v1/packages/${editing.code}`, { method: 'DELETE' });
                    setPackages(p => p.filter(pk => pk.id !== editing.id));
                    setEditing(null);
                  } catch (err: any) {
                    showAlert(`Failed to deactivate: ${err?.message ?? 'Unknown error'}`);
                  }
                }}
                className="btn btn-sm"
                style={{ color: 'var(--red)', border: '1px solid var(--border)', background: 'var(--white)' }}
              >
                Deactivate
              </button>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setEditing(null)} className="btn btn-secondary btn-sm">Cancel</button>
                <button
                  onClick={async () => {
                    try {
                      const updated = await apiFetch(`/v1/packages/${editing.code}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ monthly_price: editing.monthly, annual_price: editing.annual, max_users: editing.maxUsers }),
                      });
                      setPackages(p => p.map(pk => pk.id === editing.id ? mapFromApi(updated) : pk));
                      setEditing(null);
                    } catch (err: any) {
                      showAlert(`Failed to save: ${err?.message ?? 'Unknown error'}`);
                    }
                  }}
                  className="btn btn-primary btn-sm"
                >
                  Save Changes
                </button>
              </div>
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
              <button onClick={async ()=>{
                if (!newPkg.name.trim()) return;
                const code = newPkg.name.trim().toLowerCase().replace(/\s+/g,'-');
                try {
                  await apiFetch('/v1/packages', {
                    method: 'POST',
                    body: JSON.stringify({
                      code, name: newPkg.name.trim(),
                      monthly_price: newPkg.monthly, annual_price: newPkg.annual, max_users: newPkg.maxUsers,
                      features: ['Custom features'], color: 'var(--purple)', popular: false, sort_order: 99,
                    }),
                  });
                  reload();
                  setNewPkg({name:'',monthly:0,annual:0,maxUsers:10});
                  setShowAdd(false);
                } catch (err: any) {
                  showAlert(`Failed to create package: ${err?.message ?? 'Unknown error'}`);
                }
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
        <StatCard label="Active"         value={stats.active}  color="var(--green)"      />
        <StatCard label="SSL Secured"    value={stats.ssl}     color="var(--purple)"      />
        <StatCard label="Pending"        value={stats.pending} color="var(--gold)"      />
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
                  ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--green)', background:'var(--green-l)', padding:'3px 8px', borderRadius:20 }}><Icon name="lock" size={10} color="var(--green)" />SSL Active</span>
                  : <span style={{ fontSize:11, fontWeight:700, color:'var(--red)', background:'var(--red-l)', padding:'3px 8px', borderRadius:20 }}>No SSL</span>
                }
              </TD>
              <TD><Badge cfg={DOM_CFG[d.status]} /></TD>
              <TD nowrap><span style={{ fontSize:12, color:'var(--ink3)' }}>{fmtDate(d.created)}</span></TD>
              <TD>
                <div style={{ display:'flex', gap:2 }}>
                  <ActBtn icon="eye"   title="View"   onClick={()=>{}} />
                  <ActBtn icon="edit"  title="Edit"   onClick={()=>{}} />
                  <ActBtn icon="trash" color="var(--red)" title="Delete" onClick={()=>setDomains(p=>p.filter(x=>x.id!==d.id))} />
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
        <StatCard label="Completed"          value={stats.completed}          color="var(--green)"      />
        <StatCard label="Pending"            value={stats.pending}            color="var(--gold)"      />
        <StatCard label="Failed"             value={stats.failed}             color="var(--red)"      />
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
  { plan:'starter',      companies:2, mrr:58,     arr:696    },
  { plan:'growth',       companies:2, mrr:198,    arr:2376   },
  { plan:'scale',        companies:1, mrr:299,    arr:3588   },
  { plan:'enterprise',   companies:3, mrr:2997,   arr:35964  },
];

export function FinanceView() {
  const totalMRR = PLAN_REV.reduce((s,p)=>s+p.mrr, 0);
  const totalARR = PLAN_REV.reduce((s,p)=>s+p.arr, 0);
  return (
    <div>
      <PageHdr title="Finance" sub="Revenue metrics, MRR/ARR and subscription earnings" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Monthly Recurring Revenue" value={fmtCurrency(totalMRR)} change={8.2}   icon="trendingUp"  color="var(--teal)"  spark={MRR_DATA.map(d=>d.value)} />
        <KPICard title="Annual Recurring Revenue"  value={fmtCurrency(totalARR)} change={8.2}   icon="barChart"    color="var(--purple)"     spark={MRR_DATA.map(d=>d.value*12)} />
        <KPICard title="Total Revenue Collected"   value="$21,046"               change={-4.1}  icon="dollarSign"  color="var(--gold)"     spark={MONTHLY_REV.map(d=>d.value)} />
        <KPICard title="Active Paid Subscribers"   value="5"                     change={0}     icon="users"       color="var(--red)"     spark={[3,3,4,4,4,5,5,5,5,5,5,5]} />
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
        <SingleSelectFilter
          label="Type" allLabel="All Types"
          options={(Object.keys(TYPE_LABELS) as ActivityType[]).map(k => ({ value: k, label: TYPE_LABELS[k] }))}
          value={typeFilter === 'all' ? null : typeFilter} onChange={v => setTypeFilter((v ?? 'all') as ActivityType | 'all')}
        />
        <SingleSelectFilter
          label="Company" allLabel="All Companies"
          options={COMPANIES.map(c => ({ value: c.id, label: c.name }))}
          value={coFilter === 'all' ? null : coFilter} onChange={v => setCoFilter(v ?? 'all')}
        />
      </div>

      <div className="card" style={{ padding:'8px 0' }}>
        {filtered.map((a, i) => {
          const cfg = ACT_CFG[a.type];
          const co = a.companyId ? coByID(a.companyId) : null;
          return (
            <div key={a.id} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 22px', borderBottom: i < filtered.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width:34, height:34, borderRadius: 9, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                <Icon name={cfg.icon as any} size={16} color={cfg.color} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{a.actor}</span>
                  <span style={{ fontSize:13, color:'var(--ink2)' }}>{a.action}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:600, color:cfg.color, background:cfg.bg, padding:'2px 8px', borderRadius: 9 }}>{TYPE_LABELS[a.type]}</span>
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
  const [storage, setStorage] = useState({ starter:'10', growth:'50', scale:'250', enterprise:'Unlimited', perUserGB:'2' });
  const [features, setFeatures] = useState({ crm:true, hrm:true, finance:true, api:true, whitelabel:false, customDomain:true, aiCopilot:true, twoFactor:false });
  const [security, setSecurity] = useState({ minPasswordLength:'8', sessionTimeoutHours:'8', maxLoginAttempts:'5', lockoutMinutes:'15', twoFaPolicy:'optional' as 'off'|'optional'|'required', ipAllowlist:'' });
  const [api, setApi] = useState({ rateLimit:'120', corsOrigins:'*', webhookSecret:'whs_live_••••••••••••••••', keyRotationDays:'90' });
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [ocr, setOcr] = useState({ geminiApiKey:'' });
  const [loading, setLoading] = useState(true);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);
  const [testingOcr, setTestingOcr] = useState(false);
  const [ocrTested, setOcrTested] = useState(false);

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
        if (s.ocr) setOcr(prev => ({ ...prev, ...s.ocr }));
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
      api,
      ocr
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
      <span style={{ position:'absolute', top:3, left:value?18:3, width:16, height:16, borderRadius:99, background:'#fff', transition:'left .2s', display:'block', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
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
            style={{ padding:'8px 20px', borderRadius:9, border:'none', cursor:'pointer', fontWeight:700, fontSize:13, flexShrink:0,
              background: maintenance ? 'var(--red)' : 'var(--teal)', color:'#fff', fontFamily:'var(--font)' }}>
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
          {(['starter','growth','scale','enterprise'] as const).map(plan => (
            <Field key={plan} label={`${PLAN_CFG[plan].label} (GB)`}>
              <input title={`${PLAN_CFG[plan].label} quota`} type={plan === 'enterprise' ? 'text' : 'number'} min={1} value={(storage as any)[plan]}
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
   APP STATUS VIEW — per-app maintenance kill switch
══════════════════════════════════════════════════ */
const APP_LABELS: Record<string, string> = {
  ai: 'AI', clearos: 'ClearOS', cloud: 'Cloud', complyos: 'ComplyOS',
  contacts: 'Contacts', email: 'Email', finops: 'FinOps', oneid: 'Ondi',
  onepi: 'NexusHR', tracking: 'Tracking', demurrage: 'Demurrage', cargotracker: 'CargoTracker',
};

const APP_ICONS: Record<string, IconName> = {
  ai: 'sparkle', clearos: 'ship', cloud: 'folder', complyos: 'shield',
  contacts: 'contact', email: 'mail', finops: 'dollarSign', oneid: 'key',
  onepi: 'users', tracking: 'truck', demurrage: 'timer', cargotracker: 'container',
};

interface AppStatusRow { app_id: string; status: 'active' | 'maintenance'; message: string | null; updated_at: string; }

type AppStatusSort = 'name' | 'status' | 'updated';

export function AppStatusView() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<AppStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<AppStatusSort>('name');

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

      {/* Toolbar: search + status filter + sort */}
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
      </div>

      {visibleRows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--ink3)' }}>No apps match your search.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap:14 }}>
          {visibleRows.map(row => {
            const inMaintenance = row.status === 'maintenance';
            const label = APP_LABELS[row.app_id] ?? row.app_id;
            const busy = savingId === row.app_id;
            return (
              <div
                key={row.app_id}
                className="card list-row-accent"
                data-variant={inMaintenance ? 'error' : 'success'}
                style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:10 }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                    <FeaturedIcon variant={inMaintenance ? 'error' : 'success'} size="md">
                      <Icon name={APP_ICONS[row.app_id] ?? 'layers'} size={18} />
                    </FeaturedIcon>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
                      <Badge cfg={inMaintenance
                        ? { label:'Maintenance', color:'var(--red)', bg:'var(--red-l)' }
                        : { label:'Live', color:'var(--green)', bg:'var(--green-l)' }} />
                    </div>
                  </div>
                  <Switch
                    checked={!inMaintenance}
                    disabled={busy}
                    title={`Toggle ${label}`}
                    onCheckedChange={() => toggle(row)}
                    style={{ flexShrink:0, opacity: busy ? 0.6 : 1 }}
                  />
                </div>
                <div style={{ fontSize:12, color:'var(--ink3)' }}>
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
   MAIN COMPONENT
══════════════════════════════════════════════════ */
type ActivityType = 'company'|'user'|'billing'|'system';

interface ActivityLog { id:string; actor:string; action:string; target:string; companyId?:string; time:string; type:ActivityType; }

// View components are exported individually above and composed in SuperAdminShell
