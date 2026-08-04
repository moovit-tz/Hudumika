import React, { useState, useEffect } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { getCompany } from '../data/companyStore.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../components/ui/popover.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

// -- Types ---------------------------------------------------------------------

interface SysCustomer {
  id: string; name: string; email?: string; phone?: string;
  phone_wa?: string; company?: string; city?: string; country?: string;
  contact_person?: string; tin_number?: string; vat_number?: string;
  freight_terms?: string;
}

interface SysLead {
  id: string; contact_name: string; company: string;
  contact_email?: string; contact_phone?: string;
  stage: string; value: number; location?: string;
}

interface ServiceItem {
  id: string; name: string; category: string;
  unit_price: number; tax_rate: number; description: string; unit?: string;
}

interface QuoteLine {
  id: string; line_number: number; description: string; category: string;
  quantity: number; unit_price: number; tax_rate: number; line_total: number;
}

interface QuoteActivity {
  id: string; action: string; actor?: string; note?: string; created_at: string;
}

interface Quote {
  id: string; quote_number: string; title: string;
  customer_id?: string; customer_name: string;
  customer_email?: string; customer_phone?: string; customer_company?: string;
  shipment_type: string; origin_port: string; destination_port: string;
  subtotal: number; tax_amount: number; total_amount: number; currency: string;
  status: StatusKey; valid_until: string | null;
  notes?: string; terms?: string; rejection_reason?: string;
  assigned_to?: string; created_at: string; updated_at?: string;
  lines?: QuoteLine[]; activities?: QuoteActivity[];
}

interface LineForm {
  _key: string; description: string; category: string;
  quantity: number; unit_price: number; tax_rate: number;
}

interface QuoteFormData {
  title: string; customer_id: string; customer_name: string;
  customer_email: string; customer_phone: string; customer_company: string;
  customer_tin: string;
  shipment_type: string; origin_port: string; destination_port: string;
  currency: string; valid_until: string; notes: string; terms: string;
  lines: LineForm[];
}

type StatusKey = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'EXPIRED';
type StatusFilter = 'ALL' | StatusKey;
type View = 'list' | 'detail' | 'create' | 'edit';
type ContactTab = 'customers' | 'leads';

// -- Freight Services Catalog --------------------------------------------------

const FREIGHT_SERVICES: ServiceItem[] = [
  // Sea Freight
  { id:'sf-fcl20', name:'Sea Freight � 20ft FCL',     category:'FREIGHT',   unit_price:1200, tax_rate:0, unit:'container', description:'Full container load sea freight � 20ft standard container' },
  { id:'sf-fcl40', name:'Sea Freight � 40ft FCL',     category:'FREIGHT',   unit_price:1800, tax_rate:0, unit:'container', description:'Full container load sea freight � 40ft standard container' },
  { id:'sf-fcl40h',name:'Sea Freight � 40ft HC',      category:'FREIGHT',   unit_price:2000, tax_rate:0, unit:'container', description:'Full container load sea freight � 40ft high cube container' },
  { id:'sf-lcl',   name:'Sea Freight � LCL',          category:'FREIGHT',   unit_price:85,   tax_rate:0, unit:'CBM',       description:'Less than container load sea freight (per CBM)' },
  // Air Freight
  { id:'af-kg',    name:'Air Freight',                 category:'FREIGHT',   unit_price:4.5,  tax_rate:0, unit:'kg',        description:'Air freight charge per kilogram (chargeable weight)' },
  { id:'af-min',   name:'Air Freight � Minimum',      category:'FREIGHT',   unit_price:350,  tax_rate:0, unit:'shipment',  description:'Air freight minimum charge per shipment' },
  // Road
  { id:'rd-local', name:'Road Transport � Local',     category:'TRANSPORT', unit_price:450,  tax_rate:18, unit:'trip',      description:'Local inland transport and delivery' },
  { id:'rd-upcnt', name:'Road Transport � Upcountry', category:'TRANSPORT', unit_price:850,  tax_rate:18, unit:'trip',      description:'Upcountry delivery to inland destination' },
  // Clearance & Documentation
  { id:'cl-basic', name:'Customs Clearance',          category:'CLEARANCE', unit_price:350,  tax_rate:18, unit:'shipment',  description:'Customs clearance and entry lodgement' },
  { id:'cl-docs',  name:'Documentation Fee',          category:'CLEARANCE', unit_price:75,   tax_rate:18, unit:'set',       description:'Preparation of shipping documentation and certificates' },
  { id:'cl-bil',   name:'Bill of Lading Fee',         category:'CLEARANCE', unit_price:60,   tax_rate:18, unit:'set',       description:'Bill of lading processing and handling' },
  { id:'cl-psi',   name:'Pre-Shipment Inspection',    category:'CLEARANCE', unit_price:200,  tax_rate:18, unit:'shipment',  description:'Pre-shipment inspection (PVoC/CoC)' },
  { id:'cl-phy',   name:'Phytosanitary Certificate',  category:'CLEARANCE', unit_price:80,   tax_rate:18, unit:'certificate',description:'Phytosanitary / health certificate processing' },
  // Port Handling
  { id:'ph-thn',   name:'Port Handling � THC',        category:'HANDLING',  unit_price:250,  tax_rate:0, unit:'container', description:'Terminal handling charges at port of loading/discharge' },
  { id:'ph-scan',  name:'Scanning / X-Ray Fee',       category:'HANDLING',  unit_price:50,   tax_rate:0, unit:'container', description:'Port scanner / X-ray inspection fee' },
  { id:'ph-wgh',   name:'Weighbridge Fee',            category:'HANDLING',  unit_price:30,   tax_rate:18, unit:'truck',     description:'Weighbridge measurement certificate' },
  { id:'ph-fum',   name:'Fumigation',                 category:'HANDLING',  unit_price:150,  tax_rate:18, unit:'container', description:'Fumigation treatment and certificate' },
  // Duty & Tax
  { id:'dt-imp',   name:'Import Duty',                category:'DUTY',      unit_price:0,    tax_rate:0, unit:'%',         description:'Customs import duty (percentage of CIF value)' },
  { id:'dt-vat',   name:'VAT on Import',              category:'DUTY',      unit_price:0,    tax_rate:0, unit:'%',         description:'Value added tax on imported goods' },
  { id:'dt-exc',   name:'Excise Duty',                category:'DUTY',      unit_price:0,    tax_rate:0, unit:'%',         description:'Excise duty applicable on specific commodities' },
  // Insurance
  { id:'ins-cgo',  name:'Cargo Insurance',            category:'INSURANCE', unit_price:0,    tax_rate:18, unit:'%',        description:'Marine cargo insurance (% of insured value)' },
  // Other
  { id:'ot-stor',  name:'Storage / Demurrage',        category:'OTHER',     unit_price:25,   tax_rate:18, unit:'day',       description:'Container or cargo storage per day' },
  { id:'ot-cng',   name:'Port Congestion Surcharge',  category:'OTHER',     unit_price:150,  tax_rate:0, unit:'container', description:'Port congestion surcharge (where applicable)' },
  { id:'ot-imo',   name:'IMO / Dangerous Goods Fee',  category:'OTHER',     unit_price:120,  tax_rate:18, unit:'shipment',  description:'Handling surcharge for IMO/DG classified cargo' },
];

const SERVICE_GROUPS: { label: string; items: ServiceItem[] }[] = [
  { label: 'Sea & Air Freight',        items: FREIGHT_SERVICES.filter(s => s.category === 'FREIGHT')   },
  { label: 'Transport / Delivery',     items: FREIGHT_SERVICES.filter(s => s.category === 'TRANSPORT') },
  { label: 'Clearance & Docs',         items: FREIGHT_SERVICES.filter(s => s.category === 'CLEARANCE') },
  { label: 'Port Handling',            items: FREIGHT_SERVICES.filter(s => s.category === 'HANDLING')  },
  { label: 'Duty & Taxes',             items: FREIGHT_SERVICES.filter(s => s.category === 'DUTY')      },
  { label: 'Insurance',                items: FREIGHT_SERVICES.filter(s => s.category === 'INSURANCE') },
  { label: 'Other Charges',            items: FREIGHT_SERVICES.filter(s => s.category === 'OTHER')     },
];

// -- Constants -----------------------------------------------------------------

const STATUS_CFG: Record<StatusKey, { bg: string; color: string; label: string }> = {
  DRAFT:     { bg: 'rgba(100,116,139,0.1)', color: '#64748b',        label: 'Draft'     },
  PENDING:   { bg: 'rgba(245,158,11,0.12)', color: 'var(--gold)',    label: 'Pending'   },
  APPROVED:  { bg: 'rgba(16,185,129,0.12)', color: 'var(--green)',   label: 'Approved'  },
  REJECTED:  { bg: 'rgba(239,68,68,0.1)',   color: 'var(--red)',     label: 'Rejected'  },
  CONVERTED: { bg: 'rgba(59,130,246,0.12)', color: 'var(--blue)',    label: 'Converted' },
  EXPIRED:   { bg: 'rgba(107,114,128,0.1)', color: '#6b7280',        label: 'Expired'   },
};

const CATEGORIES = ['FREIGHT','CLEARANCE','HANDLING','TRANSPORT','DUTY','INSURANCE','OTHER'];
const CAT_LABEL: Record<string,string> = {
  FREIGHT:'Freight', CLEARANCE:'Clearance / Documentation',
  HANDLING:'Handling & Port', TRANSPORT:'Transport / Delivery',
  DUTY:'Duty & Taxes', INSURANCE:'Insurance', OTHER:'Other',
};

const CURRENCIES = ['USD','TZS','EUR','GBP','KES','ZAR','AED','CNY'];
const SHIP_TYPES = ['SEA_FCL','SEA_LCL','AIR','ROAD','RAIL','MULTIMODAL'];
const SHIP_TYPE_LABEL: Record<string,string> = {
  SEA_FCL:'Sea Freight (FCL)', SEA_LCL:'Sea Freight (LCL)',
  AIR:'Air Freight', ROAD:'Road', RAIL:'Rail', MULTIMODAL:'Multimodal',
};

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key:'ALL', label:'All' }, { key:'DRAFT', label:'Draft' },
  { key:'PENDING', label:'Pending' }, { key:'APPROVED', label:'Approved' },
  { key:'REJECTED', label:'Rejected' }, { key:'CONVERTED', label:'Converted' },
];

const DEFAULT_TERMS = `1. This quotation is valid for the period stated above.\n2. Prices are subject to change based on prevailing market rates at time of shipment.\n3. Payment terms: 50% advance deposit, balance payable before cargo release.\n4. Transit times are estimates only and may vary due to vessel schedules, port conditions, or force majeure.\n5. Additional port surcharges, demurrage, or storage charges incurred beyond quoted scope are payable by the client.\n6. All charges are exclusive of applicable government taxes and levies unless stated.\n7. This quotation does not include customs duties unless explicitly listed above.`;

// -- Helpers -------------------------------------------------------------------

function fmt(amount: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style:'currency', currency, minimumFractionDigits:0, maximumFractionDigits:0 }).format(amount||0);
  } catch { return `${currency} ${(amount||0).toLocaleString()}`; }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '�';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '�';
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return '�';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '�';
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
    + ' � ' + dt.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:true }).toLowerCase();
}

function calcTotals(lines: LineForm[]) {
  const subtotal = lines.reduce((s,l)=>s+l.quantity*l.unit_price,0);
  const tax      = lines.reduce((s,l)=>s+l.quantity*l.unit_price*(l.tax_rate/100),0);
  return { subtotal, tax, total:subtotal+tax };
}

function newLine(): LineForm {
  return { _key:Math.random().toString(36).slice(2), description:'', category:'FREIGHT', quantity:1, unit_price:0, tax_rate:0 };
}

const ACOLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30'];
function acolor(name: string) { return ACOLORS[((name ?? '?').charCodeAt(0))%ACOLORS.length]; }
function initials(name: string) { return name.split(' ').slice(0,2).map(w=>w[0]??'').join('').toUpperCase(); }

// -- Shared UI -----------------------------------------------------------------

function Av({ name, size=36 }: { name:string; size?:number }) {
  return (
    <div style={{ background:acolor(name), width:size, height:size, borderRadius:'50%', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, flexShrink:0, fontSize:size*0.36, letterSpacing:'-0.02em' }}>
      {initials(name)}
    </div>
  );
}

function StatusBadge({ status }: { status:StatusKey }) {
  const c = STATUS_CFG[status]??STATUS_CFG.DRAFT;
  return <span style={{ padding:'3px 10px', borderRadius: 9, fontSize:11, fontWeight:700, background:c.bg, color:c.color, whiteSpace:'nowrap' }}>{c.label}</span>;
}

function SHdr({ title, action }: { title:string; action?:React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 20px', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:13.5, fontWeight:700, color:'var(--ink)' }}>{title}</span>
      {action}
    </div>
  );
}

// -- Modals --------------------------------------------------------------------

function RejectModal({ onConfirm, onCancel }: { onConfirm:(r:string)=>void; onCancel:()=>void }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--white)', borderRadius: 9, padding:28, width:440, boxShadow:'0 24px 64px rgba(0,0,0,0.22)' }}>
        <div style={{ fontSize:16, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>Reject Quotation</div>
        <div style={{ fontSize:13, color:'var(--ink2)', marginBottom:16 }}>Provide a reason. This will be logged on the quote record.</div>
        <textarea title="Rejection reason" placeholder="Enter rejection reason�" value={reason} onChange={e=>setReason(e.target.value)} rows={4}
          style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius: 9, fontSize:13, resize:'vertical', boxSizing:'border-box' as const, fontFamily:'inherit', outline:'none' }} />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
          <button type="button" title="Cancel" onClick={onCancel} style={{ padding:'8px 18px', border:'1px solid var(--border)', borderRadius: 9, background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)' }}>Cancel</button>
          <button type="button" title="Confirm rejection" onClick={()=>reason.trim()&&onConfirm(reason.trim())}
            style={{ padding:'8px 18px', border:'none', borderRadius: 9, background:reason.trim()?'var(--red)':'var(--border)', color:'#fff', cursor:reason.trim()?'pointer':'not-allowed', fontWeight:600, fontSize:13 }}>
            Reject Quote
          </button>
        </div>
      </div>
    </div>
  );
}

function SendModal({ quote, onSend, onCancel }: { quote:Quote; onSend:(email:string,msg:string)=>void; onCancel:()=>void }) {
  const [email, setEmail] = useState(quote.customer_email??'');
  const [msg, setMsg] = useState(`Dear ${quote.customer_name},\n\nPlease find attached our quotation ${quote.quote_number} for your review. We look forward to your confirmation.\n\nBest regards,\n${getCompany().name}`);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--white)', borderRadius: 9, padding:28, width:480, boxShadow:'0 24px 64px rgba(0,0,0,0.22)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>Send Quotation to Customer</div>
          <button type="button" title="Close" onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)' }}><Icon name="x" size={18}/></button>
        </div>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:4 }}>Recipient Email</label>
        <input type="email" title="Recipient email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com"
          style={{ width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius: 9, fontSize:13, marginBottom:14, boxSizing:'border-box' as const, outline:'none' }}/>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:4 }}>Message</label>
        <textarea title="Email message" value={msg} onChange={e=>setMsg(e.target.value)} rows={6}
          style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius: 9, fontSize:13, resize:'vertical', boxSizing:'border-box' as const, fontFamily:'inherit', marginBottom:16, outline:'none' }}/>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" title="Cancel" onClick={onCancel} style={{ padding:'8px 18px', border:'1px solid var(--border)', borderRadius: 9, background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)' }}>Cancel</button>
          <button type="button" title="Send quotation" onClick={()=>email.trim()&&onSend(email.trim(),msg)}
            style={{ padding:'8px 18px', border:'none', borderRadius: 9, background:'var(--teal)', color:'#fff', cursor:email.trim()?'pointer':'not-allowed', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
            <Icon name="send" size={13}/> Send Quote
          </button>
        </div>
      </div>
    </div>
  );
}

// -- PDF Print -----------------------------------------------------------------

function printQuote(q: Quote) {
  const co = getCompany();
  const lines = q.lines??[];
  const logoHtml = co.logoUrl
    ? `<img src="${co.logoUrl}" style="height:48px;max-width:160px;object-fit:contain" alt="${co.name}"/>`
    : `<div style="font-size:22px;font-weight:800;color:#0d1a35">${co.name}</div>`;

  const rowsHtml = lines.map((l,i)=>`
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:8px 10px;color:#94a3b8;font-size:12px">${i+1}</td>
      <td style="padding:8px 10px">
        <div style="font-weight:600;font-size:13px">${l.description}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">${CAT_LABEL[l.category]??l.category}</div>
      </td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.quantity}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmt(l.unit_price,q.currency)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#94a3b8">${l.tax_rate}%</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700">${fmt(l.line_total,q.currency)}</td>
    </tr>`).join('');

  const win = window.open('','_blank','width=920,height=750');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${q.quote_number} � ${q.title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,-apple-system,Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff;padding:48px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid #0d7a6b}
    .co-sub{font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.5}
    .qnum{font-size:26px;font-weight:800;color:#0d7a6b;font-family:monospace;letter-spacing:-0.5px}
    .qtitle{font-size:14px;color:#64748b;margin-top:4px}
    .status{display:inline-block;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;margin-top:8px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px}
    .box{background:#f8fafc;border-radius:10px;padding:18px;border:1px solid #e2e8f0}
    .box-lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
    .box-val{font-size:14px;font-weight:700;color:#1e293b;margin-bottom:6px}
    .box-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;color:#475569}
    .box-row span:last-child{font-weight:600;color:#1e293b}
    .route{display:flex;align-items:center;gap:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px;margin-bottom:32px}
    .route-port{flex:1} .route-lbl{font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .route-val{font-size:15px;font-weight:800;color:#064e3b}
    .route-arrow{font-size:20px;color:#059669;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;background:#f8fafc;border-bottom:2px solid #e2e8f0;letter-spacing:.04em}
    th.r{text-align:right}
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:32px}
    .totals{width:260px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
    .trow{display:flex;justify-content:space-between;padding:9px 14px;font-size:13px;border-bottom:1px solid #e2e8f0}
    .trow:last-child{border:none;background:#ecfdf5;font-weight:800;font-size:15px;color:#059669}
    .trow span:last-child{font-weight:600}
    .section{margin-bottom:24px}
    .section h4{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
    .section p{font-size:12px;color:#475569;line-height:1.75;white-space:pre-line}
    .footer{border-top:2px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between;align-items:center;margin-top:32px}
    .footer-co{font-size:11px;color:#94a3b8}
    .sig-box{border-top:1px solid #cbd5e1;width:200px;padding-top:8px;font-size:11px;color:#94a3b8;text-align:center}
    @media print{body{padding:24px}@page{margin:1cm}}
  </style></head><body>
  <div class="hdr">
    <div>${logoHtml}<div class="co-sub">${co.tagline||''}<br>${co.address?co.address+', ':''} ${co.city||''}<br>${co.phone||''} � ${co.email||''}</div></div>
    <div style="text-align:right">
      <div class="qnum">${q.quote_number}</div>
      <div class="qtitle">${q.title}</div>
      <div class="status" style="background:${STATUS_CFG[q.status]?.bg??'#f1f5f9'};color:${STATUS_CFG[q.status]?.color??'#64748b'}">${STATUS_CFG[q.status]?.label??q.status}</div>
    </div>
  </div>
  <div class="grid2">
    <div class="box">
      <div class="box-lbl">Bill To</div>
      <div class="box-val">${q.customer_name}</div>
      ${q.customer_company?`<div style="font-size:12px;color:#64748b;margin-bottom:8px">${q.customer_company}</div>`:''}
      ${q.customer_email?`<div class="box-row"><span>Email</span><span>${q.customer_email}</span></div>`:''}
      ${q.customer_phone?`<div class="box-row"><span>Phone</span><span>${q.customer_phone}</span></div>`:''}
    </div>
    <div class="box">
      <div class="box-lbl">Quote Details</div>
      <div class="box-row"><span>Date Issued</span><span>${fmtDate(q.created_at)}</span></div>
      <div class="box-row"><span>Valid Until</span><span>${fmtDate(q.valid_until)}</span></div>
      <div class="box-row"><span>Currency</span><span>${q.currency}</span></div>
      <div class="box-row"><span>Shipment Type</span><span>${SHIP_TYPE_LABEL[q.shipment_type]??q.shipment_type}</span></div>
    </div>
  </div>
  ${(q.origin_port||q.destination_port)?`<div class="route">
    <div class="route-port"><div class="route-lbl">Origin</div><div class="route-val">${q.origin_port||'�'}</div></div>
    <div class="route-arrow">?</div>
    <div class="route-port"><div class="route-lbl">Destination</div><div class="route-val">${q.destination_port||'�'}</div></div>
  </div>`:''}
  <table>
    <thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals-wrap"><div class="totals">
    <div class="trow"><span>Subtotal</span><span>${fmt(q.subtotal,q.currency)}</span></div>
    <div class="trow"><span style="color:#94a3b8">Tax</span><span style="color:#94a3b8">${fmt(q.tax_amount,q.currency)}</span></div>
    <div class="trow"><span>Total</span><span>${fmt(q.total_amount,q.currency)}</span></div>
  </div></div>
  ${q.notes?`<div class="section"><h4>Notes</h4><p>${q.notes}</p></div>`:''}
  ${q.terms?`<div class="section"><h4>Terms &amp; Conditions</h4><p>${q.terms}</p></div>`:''}
  <div class="footer">
    <div class="footer-co"><strong>${co.name}</strong><br>${co.website||''} � ${co.email||''}</div>
    <div class="sig-box">Authorised Signature</div>
  </div>
  <script>window.onload=()=>{window.print()}</script></body></html>`);
  win.document.close();
}

// -- Contact Selector (Customers + Leads) --------------------------------------

interface ContactOption {
  id: string; label: string; sub: string; type: 'customer' | 'lead';
  email?: string; phone?: string; company?: string; tin?: string;
}

function ContactSelector({ customers, leads, value, onChange }: {
  customers: SysCustomer[]; leads: SysLead[];
  value: string; onChange: (c: ContactOption) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ContactTab>('customers');

  const custOptions: ContactOption[] = customers.map(c=>({
    id:c.id, label:c.name, sub:c.email??c.city??'', type:'customer',
    email:c.email, phone:c.phone_wa??c.phone, company:c.company, tin:c.tin_number,
  }));
  const leadOptions: ContactOption[] = leads.map(l=>({
    id:'lead-'+l.id, label:l.contact_name, sub:l.company, type:'lead',
    email:l.contact_email, phone:l.contact_phone, company:l.company,
  }));

  const pool = tab==='customers' ? custOptions : leadOptions;
  const filtered = pool.filter(c=>!q||c.label.toLowerCase().includes(q.toLowerCase())||c.sub.toLowerCase().includes(q.toLowerCase())).slice(0,10);
  const allOptions = [...custOptions, ...leadOptions];
  const selected = allOptions.find(c=>c.id===value);

  const tabS = (active:boolean): React.CSSProperties => ({
    flex:1, padding:'7px', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:12,
    background:active?'var(--white)':'transparent', color:active?'var(--ink)':'var(--ink3)',
    boxShadow:active?'0 1px 4px rgba(0,0,0,0.08)':'none',
  });

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverAnchor asChild>
        <div onClick={()=>setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', border:'1px solid var(--border)', borderRadius: 9, cursor:'pointer', background:'var(--white)', minHeight:40 }}>
          {selected
            ? <><Av name={selected.label} size={22}/><div><span style={{ fontSize:13, fontWeight:600 }}>{selected.label}</span>{selected.company&&<span style={{ fontSize:11, color:'var(--ink3)', marginLeft:6 }}>{selected.company}</span>}</div><span style={{ marginLeft:4, fontSize:10, background: selected.type==='lead'?'var(--gold-l)':'var(--teal-l)', color:selected.type==='lead'?'var(--gold)':'var(--teal)', borderRadius:4, padding:'2px 6px', fontWeight:700 }}>{selected.type==='lead'?'LEAD':'CLIENT'}</span></>
            : <span style={{ fontSize:13, color:'var(--ink3)' }}>Select customer or lead�</span>
          }
          <Icon name="chevronDown" size={14} style={{ marginLeft:'auto', color:'var(--ink3)' } as React.CSSProperties}/>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0 flex flex-col max-h-[320px]"
        onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
        <div style={{ padding:'10px 10px 8px' }}>
          <input type="text" title="Search contacts" placeholder="Search�" value={q} onChange={e=>setQ(e.target.value)} autoFocus
            style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, outline:'none', boxSizing:'border-box' as const, marginBottom:8 }}/>
          <div style={{ display:'flex', gap:4, background:'var(--bg)', borderRadius: 9, padding:3 }}>
            <button type="button" title="Show customers" onClick={()=>setTab('customers')} style={tabS(tab==='customers')}>Customers ({custOptions.length})</button>
            <button type="button" title="Show leads" onClick={()=>setTab('leads')} style={tabS(tab==='leads')}>Leads ({leadOptions.length})</button>
          </div>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          {filtered.length===0
            ? <div style={{ padding:'20px', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>No {tab} found</div>
            : filtered.map(c=>(
                <div key={c.id} onClick={()=>{onChange(c);setOpen(false);setQ('');}}
                  className="hover:bg-accent"
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer' }}>
                  <Av name={c.label} size={30}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{c.label}</div>
                    <div style={{ fontSize:11, color:'var(--ink3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.sub}</div>
                  </div>
                  <span style={{ fontSize:10, background:c.type==='lead'?'var(--gold-l)':'var(--teal-l)', color:c.type==='lead'?'var(--gold)':'var(--teal)', borderRadius:4, padding:'2px 6px', fontWeight:700, flexShrink:0 }}>{c.type==='lead'?'LEAD':'CLIENT'}</span>
                </div>
              ))
          }
        </div>
      </PopoverContent>
    </Popover>
  );
}

// -- Service Catalog Picker ----------------------------------------------------

function ServicePicker({ onSelect }: {
  onSelect: (s: ServiceItem) => void;
}) {
  const [q, setQ] = useState('');

  const allItems = FREIGHT_SERVICES.filter(s=>!q||s.name.toLowerCase().includes(q.toLowerCase())||s.category.toLowerCase().includes(q.toLowerCase()));
  const groups = q
    ? [{ label:'Search Results', items:allItems }]
    : SERVICE_GROUPS;

  return (
    <div style={{ width:480, display:'flex', flexDirection:'column', maxHeight:400 }}>
      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
        <input type="text" title="Search services" placeholder="Search freight services�" value={q} onChange={e=>setQ(e.target.value)} autoFocus
          style={{ width:'100%', padding:'8px 12px', border:'1px solid var(--border)', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' as const }}/>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'8px 0' }}>
        {groups.map(g=>{
          const items = g.items.filter(s=>!q||s.name.toLowerCase().includes(q.toLowerCase()));
          if(!items.length) return null;
          return (
            <div key={g.label}>
              <div style={{ padding:'6px 14px 4px', fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{g.label}</div>
              {items.map(s=>(
                <div key={s.id} onClick={()=>onSelect(s)}
                  className="hover:bg-accent"
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', cursor:'pointer' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize:11, color:'var(--ink3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.description}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>{s.unit_price>0?`$${s.unit_price}`:'�'}</div>
                    <div style={{ fontSize:10, color:'var(--ink3)' }}>per {s.unit??'unit'}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Line Items Editor ---------------------------------------------------------

function LineItemsEditor({ lines, currency, onChange }: {
  lines: LineForm[]; currency: string; onChange: (lines: LineForm[]) => void;
}) {
  const { fmt } = useCurrency();
  const [pickerKey, setPickerKey] = useState<string|null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  function update(key:string, field:keyof LineForm, val:string|number) {
    onChange(lines.map(l=>l._key===key?{...l,[field]:val}:l));
  }
  function remove(key:string){ onChange(lines.filter(l=>l._key!==key)); }
  function addBlank(){ onChange([...lines,newLine()]); }
  function addService(s:ServiceItem){
    onChange([...lines,{ _key:Math.random().toString(36).slice(2), description:s.name, category:s.category, quantity:1, unit_price:s.unit_price, tax_rate:s.tax_rate }]);
    setShowCatalog(false);
  }
  function insertService(s:ServiceItem, key:string){
    onChange(lines.map(l=>l._key===key?{...l, description:s.name, category:s.category, unit_price:s.unit_price, tax_rate:s.tax_rate}:l));
    setPickerKey(null);
  }

  const {subtotal,tax,total} = calcTotals(lines);
  const inpS: React.CSSProperties = { padding:'7px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12.5, width:'100%', outline:'none', background:'var(--white)', boxSizing:'border-box' as const };

  return (
    <div style={{ position:'relative' }}>
      <div className="rtbl-wrap" style={{ overflowX:'auto' }}>
        <table className="rtbl" style={{ borderCollapse:'collapse', fontSize:12.5 }}>
          <thead>
            <tr style={{ background:'var(--bg)' }}>
              {['Description / Service','Category','Qty','Unit Price','Tax %','Line Total',''].map(h=>(
                <th key={h} style={{ padding:'8px 10px', textAlign:['Qty','Unit Price','Tax %','Line Total'].includes(h)?'right':'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(l=>{
              const tot = l.quantity*l.unit_price*(1+l.tax_rate/100);
              return (
                <tr key={l._key} style={{ borderBottom:'1px solid var(--border)', verticalAlign:'middle' }}>
                  <td style={{ padding:'6px 8px', minWidth:240, position:'relative' }}>
                    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <input type="text" title="Description" placeholder="Describe the service or charge�" value={l.description}
                        onChange={e=>update(l._key,'description',e.target.value)} style={{ ...inpS, flex:1 }}/>
                      <Popover open={pickerKey===l._key} onOpenChange={o=>setPickerKey(o?l._key:null)}>
                        <PopoverTrigger asChild>
                          <button type="button" title="Pick from catalog"
                            style={{ padding:'7px 8px', border:'1px solid var(--border)', borderRadius:6, background:'var(--bg)', cursor:'pointer', display:'flex', alignItems:'center', color:'var(--ink2)', flexShrink:0 }}>
                            <Icon name="search" size={12}/>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="p-0">
                          <ServicePicker onSelect={s=>insertService(s,l._key)}/>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </td>
                  <td style={{ padding:'6px 8px', minWidth:150 }}>
                    <Select value={l.category} onValueChange={v=>update(l._key,'category',v)}>
                      <SelectTrigger className="min-w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c=><SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td style={{ padding:'6px 8px', width:72 }}>
                    <input type="number" title="Quantity" value={l.quantity} min={0} step={0.01}
                      onChange={e=>update(l._key,'quantity',parseFloat(e.target.value)||0)} style={{ ...inpS, textAlign:'right' }}/>
                  </td>
                  <td style={{ padding:'6px 8px', width:120 }}>
                    <input type="number" title="Unit price" value={l.unit_price} min={0} step={0.01}
                      onChange={e=>update(l._key,'unit_price',parseFloat(e.target.value)||0)} style={{ ...inpS, textAlign:'right' }}/>
                  </td>
                  <td style={{ padding:'6px 8px', width:80 }}>
                    <input type="number" title="Tax rate %" value={l.tax_rate} min={0} max={100} step={0.5}
                      onChange={e=>update(l._key,'tax_rate',parseFloat(e.target.value)||0)} style={{ ...inpS, textAlign:'right' }}/>
                  </td>
                  <td style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, whiteSpace:'nowrap', minWidth:110 }}>{fmt(tot,currency)}</td>
                  <td style={{ padding:'6px 4px', width:32 }}>
                    <button type="button" title="Remove line" onClick={()=>remove(l._key)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:4, display:'flex', borderRadius:4 }}>
                      <Icon name="trash" size={13}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'12px 8px 4px', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', gap:8, position:'relative' }}>
          <button type="button" title="Add blank line item" onClick={addBlank}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', border:'1px dashed var(--teal)', borderRadius: 9, background:'var(--teal-l)', color:'var(--teal)', cursor:'pointer', fontWeight:600, fontSize:12.5 }}>
            <Icon name="plus" size={13}/> Add Line
          </button>
          <Popover open={showCatalog} onOpenChange={setShowCatalog}>
            <PopoverTrigger asChild>
              <button type="button" title="Add from service catalog"
                style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', border:'1px solid var(--border)', borderRadius: 9, background:'var(--white)', color:'var(--ink2)', cursor:'pointer', fontWeight:600, fontSize:12.5 }}>
                <Icon name="clipboard" size={13}/> From Catalog
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0">
              <ServicePicker onSelect={addService}/>
            </PopoverContent>
          </Popover>
        </div>
        <div style={{ textAlign:'right', minWidth:210 }}>
          {[['Subtotal',fmt(subtotal,currency),false],['Tax',fmt(tax,currency),true]].map(([l,v,dim])=>(
            <div key={l as string} style={{ display:'flex', justifyContent:'space-between', gap:32, fontSize:12.5, marginBottom:5 }}>
              <span style={{ color:dim?'var(--ink3)':'var(--ink2)' }}>{l as string}</span>
              <span style={{ fontWeight:600, color:dim?'var(--ink3)':'var(--ink)' }}>{v as string}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', gap:32, fontSize:15, fontWeight:800, color:'var(--teal)', paddingTop:7, borderTop:'2px solid var(--border)', marginTop:5 }}>
            <span>Total</span><span>{fmt(total,currency)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- QuoteFormView -------------------------------------------------------------

function QuoteFormView({ mode, initial, customers, leads, onSave, onCancel, isMobile = false }: {
  mode:'create'|'edit'; initial?:Quote; customers:SysCustomer[]; leads:SysLead[];
  onSave:(data:QuoteFormData,asDraft:boolean)=>Promise<void>; onCancel:()=>void; isMobile?:boolean;
}) {
  const { fmt } = useCurrency();
  const [saving, setSaving] = useState(false);
  const co = getCompany();

  const [f, setF] = useState<QuoteFormData>(()=>({
    title:            initial?.title            ?? '',
    customer_id:      initial?.customer_id      ?? '',
    customer_name:    initial?.customer_name    ?? '',
    customer_email:   initial?.customer_email   ?? '',
    customer_phone:   initial?.customer_phone   ?? '',
    customer_company: initial?.customer_company ?? '',
    customer_tin:     '',
    shipment_type:    initial?.shipment_type    ?? 'SEA_FCL',
    origin_port:      initial?.origin_port      ?? '',
    destination_port: initial?.destination_port ?? '',
    currency:         initial?.currency         ?? 'USD',
    valid_until:      initial?.valid_until       ? initial.valid_until.slice(0,10) : '',
    notes:            initial?.notes            ?? '',
    terms:            initial?.terms            ?? DEFAULT_TERMS,
    lines: initial?.lines?.map(l=>({ _key:l.id, description:l.description, category:l.category, quantity:l.quantity, unit_price:l.unit_price, tax_rate:l.tax_rate }))??[],
  }));

  function set<K extends keyof QuoteFormData>(k:K, v:QuoteFormData[K]){ setF(p=>({...p,[k]:v})); }

  function onContact(c: ContactOption){
    setF(p=>({ ...p, customer_id:c.id, customer_name:c.label, customer_email:c.email??'', customer_phone:c.phone??'', customer_company:c.company??'', customer_tin:c.tin??'' }));
  }

  async function submit(asDraft:boolean){
    if(!f.title.trim()){ showAlert('Please enter a quotation title.'); return; }
    if(!f.customer_name.trim()){ showAlert('Please select a customer or lead.'); return; }
    if(f.lines.length===0){ showAlert('Add at least one line item.'); return; }
    setSaving(true);
    try{ await onSave(f,asDraft); } finally{ setSaving(false); }
  }

  const card: React.CSSProperties = { background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, marginBottom:20, overflow:'hidden' };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:5 };
  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius: 9, fontSize:13, outline:'none', background:'var(--white)', boxSizing:'border-box' as const, color:'var(--ink)' };
  const {subtotal,tax,total} = calcTotals(f.lines);

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 32px', flex:1, overflowY:'auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, flexWrap:'wrap' }}>
        <button type="button" title="Back" onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink2)', display:'flex', padding:4 }}>
          <Icon name="arrowLeft" size={18}/>
        </button>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'var(--ink)', margin:0 }}>{mode==='create'?'New Quotation':`Edit ${initial?.quote_number}`}</h1>
          <div style={{ fontSize:13, color:'var(--ink3)', marginTop:2 }}>Fill in the details below to build the proposal</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button type="button" title="Save as draft" onClick={()=>submit(true)} disabled={saving}
            style={{ padding:'9px 18px', border:'1px solid var(--border)', borderRadius: 9, background:'var(--white)', color:'var(--ink)', cursor:'pointer', fontWeight:600, fontSize:13 }}>
            {saving?'Saving�':'Save as Draft'}
          </button>
          <button type="button" title="Save and submit for approval" onClick={()=>submit(false)} disabled={saving}
            style={{ padding:'9px 18px', border:'none', borderRadius: 9, background:'var(--teal)', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
            <Icon name="send" size={13}/> Save &amp; Submit
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap:20, alignItems:'start' }}>
        {/* Left */}
        <div>
          {/* Contact */}
          <div style={card}>
            <SHdr title="Contact / Customer"/>
            <div style={{ padding:20, display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:16 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Select Customer or Lead *</label>
                <ContactSelector customers={customers} leads={leads} value={f.customer_id} onChange={onContact}/>
              </div>
              <div>
                <label style={lbl}>Contact Name *</label>
                <input type="text" title="Customer name" value={f.customer_name} onChange={e=>set('customer_name',e.target.value)} placeholder="Full name" style={inp}/>
              </div>
              <div>
                <label style={lbl}>Company</label>
                <input type="text" title="Company" value={f.customer_company} onChange={e=>set('customer_company',e.target.value)} placeholder="Company name" style={inp}/>
              </div>
              <div>
                <label style={lbl}>Email Address</label>
                <input type="email" title="Email" value={f.customer_email} onChange={e=>set('customer_email',e.target.value)} placeholder="email@company.com" style={inp}/>
              </div>
              <div>
                <label style={lbl}>Phone / WhatsApp</label>
                <input type="text" title="Phone" value={f.customer_phone} onChange={e=>set('customer_phone',e.target.value)} placeholder="+255 xxx xxx xxx" style={inp}/>
              </div>
              <div>
                <label style={lbl}>TIN / VAT Number</label>
                <input type="text" title="TIN" value={f.customer_tin} onChange={e=>set('customer_tin',e.target.value)} placeholder="Tax identification number" style={inp}/>
              </div>
            </div>
          </div>

          {/* Shipment & Quote Info */}
          <div style={card}>
            <SHdr title="Shipment &amp; Quote Details"/>
            <div style={{ padding:20, display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:16 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Quotation Subject / Title *</label>
                <input type="text" title="Title" placeholder="e.g. Sea Freight � Dar es Salaam to Hamburg � 1x20ft FCL" value={f.title}
                  onChange={e=>set('title',e.target.value)} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Shipment Mode</label>
                <Select value={f.shipment_type} onValueChange={v=>set('shipment_type',v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHIP_TYPES.map(t=><SelectItem key={t} value={t}>{SHIP_TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <Select value={f.currency} onValueChange={v=>set('currency',v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={lbl}>Origin Port / City</label>
                <input type="text" title="Origin" placeholder="e.g. Dar es Salaam" value={f.origin_port} onChange={e=>set('origin_port',e.target.value)} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Destination Port / City</label>
                <input type="text" title="Destination" placeholder="e.g. Hamburg" value={f.destination_port} onChange={e=>set('destination_port',e.target.value)} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Valid Until</label>
                <DatePicker date={parseDateOnly(f.valid_until)} onChange={d=>set('valid_until', toDateOnlyString(d))} />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={card}>
            <SHdr title="Charges &amp; Services" action={<span style={{ fontSize:12, color:'var(--ink3)' }}>Click search icon on any row or "From Catalog" to pick services</span>}/>
            <div style={{ padding:'0 0 16px' }}>
              <LineItemsEditor lines={f.lines} currency={f.currency} onChange={lines=>set('lines',lines)}/>
            </div>
          </div>

          {/* Notes & Terms */}
          <div style={card}>
            <SHdr title="Notes &amp; Terms"/>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={lbl}>Client-Facing Notes</label>
                <textarea title="Notes" placeholder="Any important notes for the client�" value={f.notes} onChange={e=>set('notes',e.target.value)} rows={3}
                  style={{ ...inp, resize:'vertical', fontFamily:'inherit' }}/>
              </div>
              <div>
                <label style={lbl}>Terms &amp; Conditions</label>
                <textarea title="Terms and conditions" value={f.terms} onChange={e=>set('terms',e.target.value)} rows={7}
                  style={{ ...inp, resize:'vertical', fontFamily:'inherit', fontSize:12, lineHeight:1.7 }}/>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ position:'sticky', top:24, display:'flex', flexDirection:'column', gap:16 }}>
          {/* Branding preview */}
          <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
            <SHdr title="Company Branding"/>
            <div style={{ padding:16, display:'flex', alignItems:'center', gap:12 }}>
              {co.logoUrl
                ? <img src={co.logoUrl} alt={co.name} style={{ height:36, maxWidth:100, objectFit:'contain' }}/>
                : <div style={{ width:40, height:36, background:'var(--teal)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:11 }}>LOGO</div>
              }
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>{co.name}</div>
                <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>{co.tagline}</div>
              </div>
            </div>
            <div style={{ padding:'0 16px 14px' }}>
              <div style={{ fontSize:11, color:'var(--ink3)' }}>Logo &amp; details pulled from <strong>General Settings</strong></div>
            </div>
          </div>

          {/* Totals */}
          <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
            <SHdr title="Totals"/>
            <div style={{ padding:16 }}>
              {[['Subtotal',fmt(subtotal,f.currency),false],['Tax',fmt(tax,f.currency),true]].map(([l,v,dim])=>(
                <div key={l as string} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:7 }}>
                  <span style={{ color:dim?'var(--ink3)':'var(--ink2)' }}>{l as string}</span>
                  <span style={{ fontWeight:600 }}>{v as string}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:17, fontWeight:800, color:'var(--teal)', paddingTop:10, borderTop:'2px solid var(--border)', marginTop:6 }}>
                <span>Grand Total</span><span>{fmt(total,f.currency)}</span>
              </div>
              <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:8, textAlign:'right' }}>{f.lines.length} line item{f.lines.length!==1?'s':''} � {f.currency}</div>
            </div>
          </div>

          {/* Contact preview */}
          {f.customer_name && (
            <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
              <SHdr title="Bill To"/>
              <div style={{ padding:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <Av name={f.customer_name} size={36}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{f.customer_name}</div>
                    {f.customer_company&&<div style={{ fontSize:11.5, color:'var(--ink3)' }}>{f.customer_company}</div>}
                  </div>
                </div>
                {f.customer_email&&<div style={{ fontSize:12, color:'var(--ink2)', marginBottom:4, display:'flex', alignItems:'center', gap:5 }}><Icon name="mail" size={11} color="var(--ink3)"/>{f.customer_email}</div>}
                {f.customer_phone&&<div style={{ fontSize:12, color:'var(--ink2)', display:'flex', alignItems:'center', gap:5 }}><Icon name="phone" size={11} color="var(--ink3)"/>{f.customer_phone}</div>}
                {f.customer_tin&&<div style={{ fontSize:11, color:'var(--ink3)', marginTop:6 }}>TIN: {f.customer_tin}</div>}
              </div>
            </div>
          )}

          {/* Quick catalog */}
          <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
            <SHdr title="Quick Add Services"/>
            <div style={{ padding:'8px 0', maxHeight:220, overflowY:'auto' }}>
              {FREIGHT_SERVICES.slice(0,10).map(s=>(
                <div key={s.id}
                  onClick={()=>setF(p=>({...p,lines:[...p.lines,{_key:Math.random().toString(36).slice(2),description:s.name,category:s.category,quantity:1,unit_price:s.unit_price,tax_rate:s.tax_rate}]}))}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 16px', cursor:'pointer', fontSize:12.5 }}
                  onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='')}>
                  <span style={{ color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{s.name}</span>
                  <span style={{ color:'var(--teal)', fontWeight:700, marginLeft:8, flexShrink:0 }}>{s.unit_price>0?`$${s.unit_price}`:'+' }</span>
                </div>
              ))}
              <div style={{ padding:'6px 16px', borderTop:'1px solid var(--border)', marginTop:4 }}>
                <div style={{ fontSize:11, color:'var(--ink3)' }}>{FREIGHT_SERVICES.length} services in catalog � use "From Catalog" for full list</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- QuoteDetailView -----------------------------------------------------------

function QuoteDetailView({ quote, onBack, onEdit, onStatusChange, onConvert, onSend, onDelete, onDuplicate, isMobile = false }: {
  quote:Quote; onBack:()=>void; onEdit:()=>void;
  onStatusChange:(status:string,reason?:string)=>Promise<void>;
  onConvert:()=>Promise<void>; onSend:(email:string,msg:string)=>Promise<void>;
  onDelete:()=>Promise<void>; onDuplicate:()=>Promise<void>; isMobile?:boolean;
}) {
  const { fmt } = useCurrency();
  const [showReject, setShowReject] = useState(false);
  const [showSend,   setShowSend]   = useState(false);
  const [busy, setBusy]             = useState<string|null>(null);

  async function act(key:string, fn:()=>Promise<void>){
    setBusy(key); try{ await fn(); } finally{ setBusy(null); }
  }

  const lines = quote.lines??[];
  const activities = quote.activities??[];
  const card: React.CSSProperties = { background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, marginBottom:20, overflow:'hidden' };

  return (
    <>
      {showReject&&<RejectModal onConfirm={r=>{setShowReject(false);act('reject',()=>onStatusChange('REJECTED',r));}} onCancel={()=>setShowReject(false)}/>}
      {showSend&&<SendModal quote={quote} onSend={(e,m)=>{setShowSend(false);act('send',()=>onSend(e,m));}} onCancel={()=>setShowSend(false)}/>}

      <div style={{ padding: isMobile ? '16px' : '24px 32px', flex:1, overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
          <button type="button" title="Back" onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--teal)', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:4, padding:0 }}>
            <Icon name="arrowLeft" size={14}/> Quotations
          </button>
          <span style={{ color:'var(--ink3)', fontSize:13 }}>/</span>
          <span style={{ fontSize:13, color:'var(--ink2)', fontFamily:'monospace' }}>{quote.quote_number}</span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap:20, alignItems:'start' }}>
          <div>
            {/* Quote Header */}
            <div style={card}>
              <div style={{ padding:24 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                  <div>
                    <div style={{ fontFamily:'monospace', fontSize:13, color:'var(--teal)', fontWeight:700, marginBottom:4 }}>{quote.quote_number}</div>
                    <h2 style={{ fontSize:21, fontWeight:800, color:'var(--ink)', margin:'0 0 6px' }}>{quote.title}</h2>
                    <div style={{ fontSize:13, color:'var(--ink2)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <Av name={quote.customer_name} size={20}/>
                      <strong>{quote.customer_name}</strong>
                      {quote.customer_company&&<span style={{ color:'var(--ink3)' }}>� {quote.customer_company}</span>}
                      <span style={{ color:'var(--ink3)' }}>�</span>
                      <span>{SHIP_TYPE_LABEL[quote.shipment_type]??quote.shipment_type}</span>
                    </div>
                  </div>
                  <StatusBadge status={quote.status}/>
                </div>
                {(quote.origin_port||quote.destination_port)&&(
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap:16, background:'var(--bg)', borderRadius: 9, padding:16 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Origin</div>
                      <div style={{ fontSize:15, fontWeight:700 }}>{quote.origin_port||'�'}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center' }}><Icon name="arrowRight" size={20} color="var(--ink3)"/></div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Destination</div>
                      <div style={{ fontSize:15, fontWeight:700 }}>{quote.destination_port||'�'}</div>
                    </div>
                  </div>
                )}
                {quote.rejection_reason&&(
                  <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius: 9, fontSize:13, color:'var(--red)' }}>
                    <strong>Rejection reason: </strong>{quote.rejection_reason}
                  </div>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div style={card}>
              <SHdr title="Charges &amp; Services"/>
              {lines.length===0
                ? <div style={{ padding:32, textAlign:'center', color:'var(--ink3)', fontSize:13 }}>No line items</div>
                : <><div className="rtbl-wrap" style={{ overflowX:'auto' }}>
                    <table className="rtbl" style={{ borderCollapse:'collapse', fontSize:13 }}>
                      <thead><tr style={{ background:'var(--bg)' }}>
                        {['#','Description','Category','Qty','Unit Price','Tax','Total'].map(h=>(
                          <th key={h} style={{ padding:'9px 14px', textAlign:['Qty','Unit Price','Tax','Total'].includes(h)?'right':'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {lines.map((l,i)=>(
                          <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'10px 14px', color:'var(--ink3)', width:36 }}>{i+1}</td>
                            <td style={{ padding:'10px 14px', fontWeight:600 }}>{l.description}</td>
                            <td style={{ padding:'10px 14px' }}>
                              <span style={{ padding:'2px 8px', background:'var(--bg)', borderRadius:4, fontSize:11, fontWeight:600, color:'var(--ink2)' }}>{CAT_LABEL[l.category]??l.category}</span>
                            </td>
                            <td style={{ padding:'10px 14px', textAlign:'right' }}>{l.quantity}</td>
                            <td style={{ padding:'10px 14px', textAlign:'right' }}>{fmt(l.unit_price,quote.currency)}</td>
                            <td style={{ padding:'10px 14px', textAlign:'right', color:'var(--ink3)' }}>{l.tax_rate}%</td>
                            <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700 }}>{fmt(l.line_total,quote.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:'var(--bg)' }}><td colSpan={5}/><td style={{ padding:'9px 14px', fontWeight:600, fontSize:12, color:'var(--ink2)' }}>Subtotal</td><td style={{ padding:'9px 14px', textAlign:'right', fontWeight:700 }}>{fmt(quote.subtotal,quote.currency)}</td></tr>
                        <tr style={{ background:'var(--bg)' }}><td colSpan={5}/><td style={{ padding:'5px 14px', fontWeight:600, fontSize:12, color:'var(--ink3)' }}>Tax</td><td style={{ padding:'5px 14px', textAlign:'right', color:'var(--ink3)' }}>{fmt(quote.tax_amount,quote.currency)}</td></tr>
                        <tr style={{ background:'var(--teal-l)' }}><td colSpan={5}/><td style={{ padding:'11px 14px', fontWeight:800, fontSize:13, color:'var(--teal)' }}>Grand Total</td><td style={{ padding:'11px 14px', textAlign:'right', fontWeight:800, fontSize:16, color:'var(--teal)' }}>{fmt(quote.total_amount,quote.currency)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              }
            </div>

            {(quote.notes||quote.terms)&&(
              <div style={card}>
                <SHdr title="Notes &amp; Terms"/>
                <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
                  {quote.notes&&<div><div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Notes</div><div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.7, whiteSpace:'pre-line' }}>{quote.notes}</div></div>}
                  {quote.terms&&<div><div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Terms &amp; Conditions</div><div style={{ fontSize:12.5, color:'var(--ink2)', lineHeight:1.75, whiteSpace:'pre-line' }}>{quote.terms}</div></div>}
                </div>
              </div>
            )}

            <div style={card}>
              <SHdr title="Activity"/>
              <div style={{ padding:'8px 20px 16px' }}>
                {activities.length===0
                  ? <div style={{ fontSize:13, color:'var(--ink3)', padding:'12px 0' }}>No activity recorded.</div>
                  : activities.map((a,i)=>(
                      <div key={a.id} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:i<activities.length-1?'1px solid var(--border)':'none' }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--teal-l)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Icon name="activity" size={12} color="var(--teal)"/></div>
                        <div>
                          <div style={{ fontSize:13, color:'var(--ink)', fontWeight:500 }}>{a.action}{a.actor&&<span style={{ color:'var(--ink3)' }}> by {a.actor}</span>}</div>
                          {a.note&&<div style={{ fontSize:12, color:'var(--ink2)', marginTop:2 }}>{a.note}</div>}
                          <div style={{ fontSize:11, color:'var(--ink3)', marginTop:3 }}>{fmtDateTime(a.created_at)}</div>
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ position:'sticky', top:24, display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
              <SHdr title="Actions"/>
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { title:'Print / PDF',     icon:'printer' as const, color:'var(--ink2)',  fn:()=>Promise.resolve(printQuote(quote)) },
                  { title:'Send to Customer',icon:'mail'    as const, color:'var(--blue)',  fn:()=>Promise.resolve(setShowSend(true)) },
                ].map(a=>(
                  <button key={a.title} type="button" title={a.title} onClick={()=>a.fn()}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', border:'1px solid var(--border)', borderRadius: 9, background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:a.color }}>
                    <Icon name={a.icon} size={14}/> {a.title}
                  </button>
                ))}
                {['DRAFT','PENDING'].includes(quote.status)&&(
                  <button type="button" title="Edit" onClick={onEdit}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', border:'1px solid var(--border)', borderRadius: 9, background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink)' }}>
                    <Icon name="edit" size={14}/> Edit Quotation
                  </button>
                )}
                <button type="button" title="Duplicate" onClick={()=>act('dup',onDuplicate)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', border:'1px solid var(--border)', borderRadius: 9, background:'var(--bg)', cursor:'pointer', fontWeight:600, fontSize:13, color:'var(--ink2)' }}>
                  <Icon name="copy" size={14}/> {busy==='dup'?'Duplicating�':'Duplicate'}
                </button>

                <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4, display:'flex', flexDirection:'column', gap:8 }}>
                  {quote.status==='DRAFT'&&<button type="button" title="Submit" onClick={()=>act('submit',()=>onStatusChange('PENDING'))} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:10, border:'none', borderRadius: 9, background:'var(--gold)', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13 }}><Icon name="send" size={14}/>{busy==='submit'?'Submitting�':'Submit for Approval'}</button>}
                  {quote.status==='PENDING'&&<><button type="button" title="Approve" onClick={()=>act('approve',()=>onStatusChange('APPROVED'))} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:10, border:'none', borderRadius: 9, background:'var(--green)', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13 }}><Icon name="checkCircle" size={14}/>{busy==='approve'?'Approving�':'Approve'}</button>
                  <button type="button" title="Reject" onClick={()=>setShowReject(true)} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:10, border:'1px solid rgba(239,68,68,0.25)', borderRadius: 9, background:'rgba(239,68,68,0.06)', color:'var(--red)', cursor:'pointer', fontWeight:700, fontSize:13 }}><Icon name="xCircle" size={14}/>Reject</button></>}
                  {quote.status==='APPROVED'&&<button type="button" title="Convert to Shipment" onClick={()=>act('convert',onConvert)} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:10, border:'none', borderRadius: 9, background:'var(--navy)', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13 }}><Icon name="ship" size={14}/>{busy==='convert'?'Converting�':'Convert to Shipment'}</button>}
                </div>

                <button type="button" title="Delete" onClick={()=>act('delete',onDelete)} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:9, border:'1px solid rgba(239,68,68,0.2)', borderRadius: 9, background:'none', color:'var(--red)', cursor:'pointer', fontWeight:600, fontSize:12, marginTop:4 }}>
                  <Icon name="trash" size={13}/> {busy==='delete'?'Deleting�':'Delete Quotation'}
                </button>
              </div>
            </div>

            <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
              <SHdr title="Details"/>
              <div style={{ padding:16 }}>
                {[['Quote #',quote.quote_number],['Currency',quote.currency],['Mode',SHIP_TYPE_LABEL[quote.shipment_type]??quote.shipment_type],['Valid Until',fmtDate(quote.valid_until)],['Created',fmtDate(quote.created_at)],['Updated',fmtDate(quote.updated_at)]].map(([l,v])=>(
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:8 }}>
                    <span style={{ color:'var(--ink3)' }}>{l}</span>
                    <span style={{ fontWeight:600, color:'var(--ink)', textAlign:'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
              <SHdr title="Bill To"/>
              <div style={{ padding:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <Av name={quote.customer_name} size={38}/>
                  <div><div style={{ fontWeight:700, fontSize:13 }}>{quote.customer_name}</div>{quote.customer_company&&<div style={{ fontSize:11.5, color:'var(--ink3)' }}>{quote.customer_company}</div>}</div>
                </div>
                {quote.customer_email&&<a href={`mailto:${quote.customer_email}`} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:'var(--blue)', textDecoration:'none', marginBottom:6 }}><Icon name="mail" size={12} color="var(--blue)"/>{quote.customer_email}</a>}
                {quote.customer_phone&&<div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:'var(--ink2)' }}><Icon name="phone" size={12}/>{quote.customer_phone}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// -- Quotations (main) ---------------------------------------------------------

export const Quotations: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const [view,      setView]      = useState<View>('list');
  const [quotes,    setQuotes]    = useState<Quote[]>([]);
  const [selected,  setSelected]  = useState<Quote|null>(null);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<StatusFilter>('ALL');
  const [search,    setSearch]    = useState('');
  const [customers, setCustomers] = useState<SysCustomer[]>([]);
  const [leads,     setLeads]     = useState<SysLead[]>([]);

  const fetchQuotes = async (f=filter) => {
    setLoading(true);
    try {
      const qs = f!=='ALL' ? `?status=${f}` : '';
      const data = await apiFetch(`/v1/quotations${qs}`);
      setQuotes(Array.isArray(data)?data:(data.data??[]));
    } catch { setQuotes([]); } finally { setLoading(false); }
  };

  const fetchDetail = async (id:string) => {
    try { const data = await apiFetch(`/v1/quotations/${id}`); setSelected(data); setView('detail'); }
    catch(e:any){ showAlert(e.message); }
  };

  useEffect(()=>{
    fetchQuotes();
    apiFetch('/v1/customers').then(d=>setCustomers(Array.isArray(d)?d:(d.data??[]))).catch(()=>{});
    apiFetch('/v1/leads').then(d=>setLeads(Array.isArray(d)?d:(d.data??[]))).catch(()=>{});
  },[]);
  useEffect(()=>{ fetchQuotes(filter); },[filter]);
  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.section === 'quotations') setView('create');
    }
    window.addEventListener('fin:new-doc', handler);
    return () => window.removeEventListener('fin:new-doc', handler);
  }, []);

  async function handleStatusChange(id:string,status:string,reason?:string){
    await apiFetch(`/v1/quotations/${id}/status`,{method:'PATCH',body:JSON.stringify({status,reason})});
    await fetchQuotes(); if(selected?.id===id) await fetchDetail(id);
  }
  async function handleConvert(id:string){
    if(!(await showConfirm('Convert to Shipment Case? This cannot be undone.', { variant: 'warning', confirmLabel: 'Convert' }))) return;
    const r = await apiFetch(`/v1/quotations/${id}/convert`,{method:'POST'});
    showAlert(`Shipment ${r.shipment?.ref_number??''} created!`);
    await fetchQuotes(); if(selected?.id===id) await fetchDetail(id);
  }
  async function handleSend(id:string,email:string,msg:string){
    try{ await apiFetch(`/v1/quotations/${id}/send`,{method:'POST',body:JSON.stringify({email,message:msg})}); showAlert('Quotation sent!'); }
    catch{ showAlert('Could not send via API � please email manually to: '+email); }
  }
  async function handleDelete(id:string){
    if(!(await showConfirm('Delete this quotation? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/quotations/${id}`,{method:'DELETE'});
    setView('list'); setSelected(null); await fetchQuotes();
  }
  async function handleDuplicate(id:string){
    try{ const r=await apiFetch(`/v1/quotations/${id}/duplicate`,{method:'POST'}); await fetchQuotes(); if(r?.id) await fetchDetail(r.id); else showAlert('Quotation duplicated.'); }
    catch{ showAlert('Duplicate not supported by API yet.'); }
  }
  async function handleSave(id:string|null, data:QuoteFormData, asDraft:boolean){
    const body = {
      title:data.title, customer_id:data.customer_id||undefined, customer_name:data.customer_name,
      customer_email:data.customer_email, customer_phone:data.customer_phone, customer_company:data.customer_company,
      shipment_type:data.shipment_type, origin_port:data.origin_port, destination_port:data.destination_port,
      currency:data.currency, valid_until:data.valid_until||null, notes:data.notes, terms:data.terms,
      status:asDraft?'DRAFT':'PENDING',
      lines:data.lines.map((l,i)=>({ line_number:i+1, description:l.description, category:l.category, quantity:l.quantity, unit_price:l.unit_price, tax_rate:l.tax_rate })),
    };
    if(id){
      const res=await apiFetch(`/v1/quotations/${id}`,{method:'PATCH',body:JSON.stringify(body)});
      await fetchQuotes(); setSelected(res); setView('detail');
    } else {
      const res=await apiFetch('/v1/quotations',{method:'POST',body:JSON.stringify(body)});
      await fetchQuotes(); if(res?.id) await fetchDetail(res.id); else setView('list');
    }
  }

  const displayed = quotes.filter(q=>{
    if(!search.trim()) return true;
    const s=search.toLowerCase();
    return q.quote_number.toLowerCase().includes(s)||q.title.toLowerCase().includes(s)||q.customer_name.toLowerCase().includes(s)||(q.origin_port??'').toLowerCase().includes(s)||(q.destination_port??'').toLowerCase().includes(s);
  });

  function exportCsv() {
    const rows = [
      ['Quote No.', 'Title', 'Customer', 'Email', 'Status', 'Origin', 'Destination', 'Currency', 'Total Amount', 'Valid Until'],
      ...quotes.map(q => [q.quote_number, q.title, q.customer_name, q.customer_email ?? '', q.status, q.origin_port ?? '', q.destination_port ?? '', q.currency ?? '', q.total_amount ?? 0, q.valid_until ?? '']),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if(view==='create') return <QuoteFormView mode="create" customers={customers} leads={leads} onSave={(d,draft)=>handleSave(null,d,draft)} onCancel={()=>setView('list')} isMobile={isMobile}/>;
  if(view==='edit'&&selected) return <QuoteFormView mode="edit" initial={selected} customers={customers} leads={leads} onSave={(d,draft)=>handleSave(selected.id,d,draft)} onCancel={()=>setView('detail')} isMobile={isMobile}/>;
  if(view==='detail'&&selected) return <QuoteDetailView quote={selected} onBack={()=>{setView('list');setSelected(null);}} onEdit={()=>setView('edit')} onStatusChange={(s,r)=>handleStatusChange(selected.id,s,r)} onConvert={()=>handleConvert(selected.id)} onSend={(e,m)=>handleSend(selected.id,e,m)} onDelete={()=>handleDelete(selected.id)} onDuplicate={()=>handleDuplicate(selected.id)} isMobile={isMobile}/>;

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader
        crumbs={['Finance', 'Quotations']}
        titlePlain="Sales"
        titleEm="quotations"
        subtitle="Create, manage and convert freight quotations into shipment cases."
      />

      <MetricsRow cards={[
        { title:'Total Quotes', value:String(quotes.length), trend:6.4, sub1Label:'DRAFT', sub1Value:String(quotes.filter(q=>q.status==='DRAFT').length), sub2Label:'PENDING', sub2Value:String(quotes.filter(q=>q.status==='PENDING').length), bars:spark(1,15,'up'), barColor:'var(--blue-l)', barHighlight:'var(--blue)' },
        { title:'Converted', value:String(quotes.filter(q=>q.status==='CONVERTED').length), trend:14.2, sub1Label:'WIN RATE', sub1Value:quotes.length?`${Math.round(quotes.filter(q=>q.status==='CONVERTED').length/quotes.length*100)}%`:'0%', sub2Label:'APPROVED', sub2Value:String(quotes.filter(q=>q.status==='APPROVED').length), bars:spark(2,15,'up'), barColor:'var(--green-l)', barHighlight:'var(--green)' },
        { title:'Pipeline Value', value:`$${(quotes.filter(q=>!['REJECTED','EXPIRED'].includes(q.status)).reduce((s,q)=>s+(q.total_amount||0),0)/1000).toFixed(1)}k`, trend:3.1, sub1Label:'AVG QUOTE', sub1Value:quotes.length?`$${(quotes.reduce((s,q)=>s+(q.total_amount||0),0)/quotes.length/1000).toFixed(1)}k`:'$0', sub2Label:'PENDING $', sub2Value:`$${(quotes.filter(q=>q.status==='PENDING').reduce((s,q)=>s+(q.total_amount||0),0)/1000).toFixed(1)}k`, bars:spark(3,15,'flat'), barColor:'var(--gold-l)', barHighlight:'var(--gold)' },
      ]}/>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12 }}>
        <div style={{ display:'flex', gap:4 }}>
          {STATUS_TABS.map(t=>(
            <button key={t.key} type="button" title={`Filter: ${t.label}`} onClick={()=>setFilter(t.key)}
              style={{ padding:'6px 14px', fontSize:12, fontWeight:600, border:'none', borderRadius:20, cursor:'pointer', transition:'all 0.12s', background:filter===t.key?'var(--navy)':'var(--bg)', color:filter===t.key?'#fff':'var(--ink2)' }}>
              {t.label}
              {t.key!=='ALL'&&quotes.filter(q=>q.status===t.key).length>0&&(
                <span style={{ marginLeft:5, background:filter===t.key?'rgba(255,255,255,0.25)':'var(--border)', borderRadius: 9, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{quotes.filter(q=>q.status===t.key).length}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ position:'relative', minWidth:220 }}>
            <Icon name="search" size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink3)' } as React.CSSProperties}/>
            <input type="text" title="Search" placeholder="Search quotes, customers�" value={search} onChange={e=>setSearch(e.target.value)}
              style={{ width:'100%', paddingLeft:32, paddingRight:12, paddingTop:8, paddingBottom:8, border:'1px solid var(--border)', borderRadius: 9, fontSize:13, outline:'none', background:'var(--white)', boxSizing:'border-box' as const }}/>
          </div>
          <button type="button" onClick={exportCsv} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9, border:'1px solid var(--border)', background:'var(--white)', color:'var(--ink2)', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', whiteSpace:'nowrap' }}>
            <Icon name="download" size={13}/> Export CSV
          </button>
          <button type="button" onClick={()=>setView('create')} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:9, border:'none', background:'var(--teal)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font)', whiteSpace:'nowrap' }}>
            <Icon name="plus" size={13}/> New Quotation
          </button>
        </div>
      </div>

      <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', overflow:'hidden' }}>
        {loading
          ? <div style={{ padding:'60px 20px', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>Loading quotations�</div>
          : displayed.length===0
            ? <div style={{ padding:'60px 20px', textAlign:'center' }}>
                <div style={{ marginBottom:12 }}><Icon name="fileText" size={48} color="var(--border)"/></div>
                <div style={{ fontSize:15, fontWeight:600, color:'var(--ink)', marginBottom:6 }}>No quotations found</div>
                <div style={{ fontSize:13, color:'var(--ink3)', marginBottom:20 }}>{search?'Try a different search term.':'Get started by creating your first quotation.'}</div>
                {!search&&<button type="button" title="Create quotation" onClick={()=>setView('create')} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 20px', border:'none', borderRadius: 9, background:'var(--teal)', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:13 }}><Icon name="plus" size={13}/>New Quotation</button>}
              </div>
            : <div className="rtbl-wrap" style={{ overflowX:'auto' }}>
                <table className="rtbl" style={{ borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr style={{ background:'var(--bg)' }}>
                    {['Quote #','Title','Customer','Route','Total','Status','Valid Until','Created',''].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {displayed.map(q=>(
                      <tr key={q.id} onClick={()=>fetchDetail(q.id)} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                        <td style={{ padding:'11px 14px', fontWeight:700, fontFamily:'monospace', color:'var(--teal)', whiteSpace:'nowrap' }}>{q.quote_number}</td>
                        <td style={{ padding:'11px 14px', fontWeight:600, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.title}</td>
                        <td style={{ padding:'11px 14px' }}><div style={{ display:'flex', alignItems:'center', gap:7 }}><Av name={q.customer_name} size={24}/>{q.customer_name}</div></td>
                        <td style={{ padding:'11px 14px', fontSize:12, color:'var(--ink2)', whiteSpace:'nowrap' }}>{q.origin_port||'�'} ? {q.destination_port||'�'}</td>
                        <td style={{ padding:'11px 14px', fontWeight:700, whiteSpace:'nowrap' }}>{fmt(q.total_amount,q.currency)}</td>
                        <td style={{ padding:'11px 14px' }}><StatusBadge status={q.status}/></td>
                        <td style={{ padding:'11px 14px', fontSize:12, color:'var(--ink3)', whiteSpace:'nowrap' }}>{fmtDate(q.valid_until)}</td>
                        <td style={{ padding:'11px 14px', fontSize:12, color:'var(--ink3)', whiteSpace:'nowrap' }}>{fmtDate(q.created_at)}</td>
                        <td style={{ padding:'11px 10px' }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:'flex', gap:2 }}>
                            {[{ title:'View',icon:'eye' as const,fn:()=>fetchDetail(q.id) },{ title:'Print',icon:'printer' as const,fn:()=>printQuote(q) },...(['DRAFT','PENDING'].includes(q.status)?[{ title:'Edit',icon:'edit' as const,fn:async()=>{await fetchDetail(q.id);setView('edit');} }]:[])].map(a=>(
                              <button key={a.title} type="button" title={a.title} onClick={a.fn}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:5, borderRadius:5, display:'flex' }}
                                onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                                <Icon name={a.icon} size={14}/>
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        }
      </div>
    </div>
  );
};
