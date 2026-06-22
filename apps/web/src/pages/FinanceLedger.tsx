import React, { useState, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { useCompany } from '../data/companyStore.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

/* ─────────────────────────── types ─────────────────────────── */
type AccType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

interface LedgerEntry {
  date: string;
  ref: string;
  description: string;
  debit: number;
  credit: number;
}

interface Account {
  code: string;
  name: string;
  type: AccType;
  openingBalance: number; // positive = debit-normal; negative = credit-normal
  entries: LedgerEntry[];
}

/* ─────────────────────────── config ─────────────────────────── */
const TYPE_CFG: Record<AccType, { label: string; color: string; bg: string; normal: 'Dr' | 'Cr' }> = {
  ASSET:     { label: 'Asset',     color: '#0891b2', bg: '#ecfeff', normal: 'Dr' },
  LIABILITY: { label: 'Liability', color: '#ef4444', bg: '#fef2f2', normal: 'Cr' },
  EQUITY:    { label: 'Equity',    color: '#7c3aed', bg: '#ede9fe', normal: 'Cr' },
  REVENUE:   { label: 'Revenue',   color: '#16a34a', bg: '#dcfce7', normal: 'Cr' },
  EXPENSE:   { label: 'Expense',   color: '#d97706', bg: '#fef3c7', normal: 'Dr' },
};

/* ─────────────────────────── mock data ─────────────────────────── */
const ACCOUNTS: Account[] = [
  /* ── ASSETS ── */
  {
    code: '1100', name: 'Cash & Bank', type: 'ASSET', openingBalance: 98_400_000,
    entries: [
      { date: '2026-06-01', ref: 'RCT-0241', description: 'Receipt – Dangote Industries (INV-0081)',      debit: 18_700_000, credit: 0           },
      { date: '2026-06-03', ref: 'PMT-0118', description: 'Payment – TPA Port Charges (CLR-2026-0005)',   debit: 0,          credit: 1_850_000   },
      { date: '2026-06-05', ref: 'RCT-0242', description: 'Receipt – TPC Ltd Sugar Mill (INV-0079)',      debit: 14_200_000, credit: 0           },
      { date: '2026-06-08', ref: 'PMT-0119', description: 'Salary disbursement – June 2026',              debit: 0,          credit: 12_400_000  },
      { date: '2026-06-10', ref: 'PMT-0120', description: 'MSC Demurrage payment',                        debit: 0,          credit: 840_000     },
      { date: '2026-06-12', ref: 'RCT-0243', description: 'Receipt – Simba Cement Ltd (INV-0082)',        debit: 9_600_000,  credit: 0           },
      { date: '2026-06-14', ref: 'PMT-0121', description: 'Office rent – June 2026',                      debit: 0,          credit: 2_800_000   },
    ],
  },
  {
    code: '1200', name: 'Accounts Receivable', type: 'ASSET', openingBalance: 64_300_000,
    entries: [
      { date: '2026-06-02', ref: 'INV-0083', description: 'Invoice – East African Breweries',             debit: 11_400_000, credit: 0           },
      { date: '2026-06-05', ref: 'RCT-0242', description: 'Receipt from TPC Ltd – settled',               debit: 0,          credit: 14_200_000  },
      { date: '2026-06-07', ref: 'INV-0084', description: 'Invoice – Kariakoo General Traders',           debit: 5_800_000,  credit: 0           },
      { date: '2026-06-01', ref: 'RCT-0241', description: 'Receipt from Dangote – settled',               debit: 0,          credit: 18_700_000  },
      { date: '2026-06-13', ref: 'INV-0085', description: 'Invoice – TAZARA Railway',                     debit: 16_400_000, credit: 0           },
      { date: '2026-06-12', ref: 'RCT-0243', description: 'Receipt from Simba Cement – settled',          debit: 0,          credit: 9_600_000   },
    ],
  },
  {
    code: '1300', name: 'Prepaid Expenses', type: 'ASSET', openingBalance: 6_200_000,
    entries: [
      { date: '2026-06-01', ref: 'JNL-0044', description: 'Prepaid insurance – amortisation June',        debit: 0,          credit: 620_000     },
      { date: '2026-06-01', ref: 'JNL-0045', description: 'Prepaid software licences – amortisation',     debit: 0,          credit: 480_000     },
      { date: '2026-06-10', ref: 'PMT-0122', description: 'Annual vehicle insurance – prepaid',            debit: 3_600_000,  credit: 0           },
    ],
  },
  {
    code: '1500', name: 'Office Equipment (Net)', type: 'ASSET', openingBalance: 24_800_000,
    entries: [
      { date: '2026-06-01', ref: 'JNL-0046', description: 'Depreciation – office equipment June',         debit: 0,          credit: 412_000     },
      { date: '2026-06-09', ref: 'PO-0061',  description: 'New laptop – accounts team',                   debit: 1_850_000,  credit: 0           },
    ],
  },
  {
    code: '1600', name: 'Motor Vehicles (Net)', type: 'ASSET', openingBalance: 68_000_000,
    entries: [
      { date: '2026-06-01', ref: 'JNL-0047', description: 'Depreciation – motor vehicles June',           debit: 0,          credit: 1_133_000   },
      { date: '2026-06-06', ref: 'PMT-0123', description: 'Vehicle repair & maintenance',                  debit: 0,          credit: 1_240_000   },
    ],
  },

  /* ── LIABILITIES ── */
  {
    code: '2100', name: 'Accounts Payable', type: 'LIABILITY', openingBalance: -38_400_000,
    entries: [
      { date: '2026-06-03', ref: 'PMT-0118', description: 'Payment to TPA – port charges settled',        debit: 1_850_000,  credit: 0           },
      { date: '2026-06-05', ref: 'BILL-0041',description: 'Bill received – Maersk Line freight',          debit: 0,          credit: 8_400_000   },
      { date: '2026-06-08', ref: 'BILL-0042',description: 'Bill received – TASAC inspection fees',        debit: 0,          credit: 1_100_000   },
      { date: '2026-06-11', ref: 'PMT-0124', description: 'Payment to CMA CGM – settled',                 debit: 4_200_000,  credit: 0           },
    ],
  },
  {
    code: '2200', name: 'VAT Payable', type: 'LIABILITY', openingBalance: -9_800_000,
    entries: [
      { date: '2026-06-02', ref: 'JNL-0048', description: 'VAT on sales invoices – June batch 1',         debit: 0,          credit: 1_710_000   },
      { date: '2026-06-07', ref: 'JNL-0049', description: 'VAT on sales invoices – June batch 2',         debit: 0,          credit: 870_000     },
      { date: '2026-06-10', ref: 'TRA-0022', description: 'VAT remittance – May 2026',                    debit: 8_600_000,  credit: 0           },
      { date: '2026-06-13', ref: 'JNL-0050', description: 'VAT on sales invoices – June batch 3',         debit: 0,          credit: 2_460_000   },
    ],
  },
  {
    code: '2300', name: 'Withholding Tax Payable', type: 'LIABILITY', openingBalance: -2_400_000,
    entries: [
      { date: '2026-06-08', ref: 'JNL-0051', description: 'WHT deducted from supplier payments',          debit: 0,          credit: 420_000     },
      { date: '2026-06-10', ref: 'TRA-0023', description: 'WHT remittance to TRA – May 2026',             debit: 2_100_000,  credit: 0           },
    ],
  },
  {
    code: '2400', name: 'Advance from Customers', type: 'LIABILITY', openingBalance: -18_000_000,
    entries: [
      { date: '2026-06-04', ref: 'RCT-0244', description: 'Advance received – TAZARA new shipment',       debit: 0,          credit: 6_500_000   },
      { date: '2026-06-13', ref: 'JNL-0052', description: 'Advance applied to INV-0085 (TAZARA)',         debit: 6_500_000,  credit: 0           },
    ],
  },

  /* ── EQUITY ── */
  {
    code: '3100', name: 'Share Capital', type: 'EQUITY', openingBalance: -100_000_000,
    entries: [
      { date: '2026-06-01', ref: 'JNL-0053', description: 'No movement – share capital unchanged',        debit: 0,          credit: 0           },
    ],
  },
  {
    code: '3200', name: 'Retained Earnings', type: 'EQUITY', openingBalance: -161_500_000,
    entries: [
      { date: '2026-06-01', ref: 'JNL-0054', description: 'Opening retained earnings b/f',                debit: 0,          credit: 0           },
    ],
  },

  /* ── REVENUE ── */
  {
    code: '4100', name: 'Clearance Fees', type: 'REVENUE', openingBalance: -42_600_000,
    entries: [
      { date: '2026-06-02', ref: 'INV-0083', description: 'Clearance fee – East African Breweries',       debit: 0,          credit: 2_200_000   },
      { date: '2026-06-07', ref: 'INV-0084', description: 'Clearance fee – Kariakoo Traders',             debit: 0,          credit: 1_800_000   },
      { date: '2026-06-13', ref: 'INV-0085', description: 'Clearance fee – TAZARA Railway',               debit: 0,          credit: 3_400_000   },
    ],
  },
  {
    code: '4200', name: 'Agency Fees', type: 'REVENUE', openingBalance: -10_200_000,
    entries: [
      { date: '2026-06-02', ref: 'INV-0083', description: 'Agency fee – East African Breweries',          debit: 0,          credit: 620_000     },
      { date: '2026-06-07', ref: 'INV-0084', description: 'Agency fee – Kariakoo Traders',                debit: 0,          credit: 500_000     },
      { date: '2026-06-13', ref: 'INV-0085', description: 'Agency fee – TAZARA Railway',                  debit: 0,          credit: 800_000     },
    ],
  },
  {
    code: '4300', name: 'Transport Fees', type: 'REVENUE', openingBalance: -7_800_000,
    entries: [
      { date: '2026-06-07', ref: 'INV-0084', description: 'Transport fee – Kariakoo Traders',             debit: 0,          credit: 480_000     },
      { date: '2026-06-13', ref: 'INV-0085', description: 'Transport fee – TAZARA (Dar-Mwanza)',          debit: 0,          credit: 1_200_000   },
    ],
  },
  {
    code: '4400', name: 'Documentation Fees', type: 'REVENUE', openingBalance: -5_600_000,
    entries: [
      { date: '2026-06-02', ref: 'INV-0083', description: 'Documentation – East African Breweries',       debit: 0,          credit: 350_000     },
      { date: '2026-06-13', ref: 'INV-0085', description: 'Documentation – TAZARA Railway',               debit: 0,          credit: 350_000     },
    ],
  },
  {
    code: '4500', name: 'Storage & Demurrage Recovery', type: 'REVENUE', openingBalance: -6_200_000,
    entries: [
      { date: '2026-06-05', ref: 'INV-0086', description: 'Demurrage recovery – TPC Ltd (CLR-0005)',      debit: 0,          credit: 840_000     },
      { date: '2026-06-09', ref: 'INV-0087', description: 'Storage recovery – EAL CLR-0016',              debit: 0,          credit: 480_000     },
    ],
  },

  /* ── EXPENSES ── */
  {
    code: '5100', name: 'Port & Terminal Charges', type: 'EXPENSE', openingBalance: 16_200_000,
    entries: [
      { date: '2026-06-03', ref: 'BILL-0040', description: 'TPA port charges – CLR-2026-0001',            debit: 1_850_000,  credit: 0           },
      { date: '2026-06-08', ref: 'BILL-0043', description: 'Terminal handling – CLR-2026-0005',            debit: 1_400_000,  credit: 0           },
    ],
  },
  {
    code: '5200', name: 'Shipping Line Fees', type: 'EXPENSE', openingBalance: 6_400_000,
    entries: [
      { date: '2026-06-05', ref: 'BILL-0041', description: 'Maersk freight charges – CLR-2026-0014',      debit: 8_400_000,  credit: 0           },
    ],
  },
  {
    code: '5300', name: 'Government Duties (Passthrough)', type: 'EXPENSE', openingBalance: 12_800_000,
    entries: [
      { date: '2026-06-04', ref: 'TRA-0024', description: 'Import duty – Dangote CLR-2026-0001',          debit: 72_000_000, credit: 0           },
      { date: '2026-06-04', ref: 'TRA-0024', description: 'Rebilled to client – Dangote',                 debit: 0,          credit: 72_000_000  },
      { date: '2026-06-09', ref: 'TRA-0025', description: 'Import duty – TPC CLR-2026-0005',              debit: 58_200_000, credit: 0           },
      { date: '2026-06-09', ref: 'TRA-0025', description: 'Rebilled to client – TPC',                     debit: 0,          credit: 58_200_000  },
    ],
  },
  {
    code: '5400', name: 'Inspection & Survey Fees', type: 'EXPENSE', openingBalance: 3_800_000,
    entries: [
      { date: '2026-06-08', ref: 'BILL-0042', description: 'TASAC inspection – CLR-2026-0011',            debit: 1_100_000,  credit: 0           },
      { date: '2026-06-10', ref: 'BILL-0044', description: 'TMDA inspection – CLR-2026-0008',             debit: 280_000,    credit: 0           },
    ],
  },
  {
    code: '5500', name: 'Haulage & Transport Costs', type: 'EXPENSE', openingBalance: 4_800_000,
    entries: [
      { date: '2026-06-07', ref: 'BILL-0045', description: 'Haulage Dar–Arusha – CLR-2026-0002',         debit: 450_000,    credit: 0           },
      { date: '2026-06-13', ref: 'BILL-0046', description: 'Delivery to Muhimbili – CLR-2026-0010',       debit: 190_000,    credit: 0           },
    ],
  },
  {
    code: '6100', name: 'Staff Salaries & Allowances', type: 'EXPENSE', openingBalance: 16_000_000,
    entries: [
      { date: '2026-06-08', ref: 'PMT-0119', description: 'Payroll – June 2026 (all staff)',              debit: 12_400_000, credit: 0           },
    ],
  },
  {
    code: '6200', name: 'Rent & Utilities', type: 'EXPENSE', openingBalance: 8_400_000,
    entries: [
      { date: '2026-06-14', ref: 'PMT-0121', description: 'Office rent – Msasani Road, June 2026',        debit: 2_800_000,  credit: 0           },
      { date: '2026-06-14', ref: 'PMT-0125', description: 'TANESCO electricity bill – June',              debit: 340_000,    credit: 0           },
    ],
  },
  {
    code: '6300', name: 'Communications', type: 'EXPENSE', openingBalance: 1_040_000,
    entries: [
      { date: '2026-06-01', ref: 'PMT-0126', description: 'Mobile & internet – June 2026',                debit: 380_000,    credit: 0           },
    ],
  },
  {
    code: '6500', name: 'Vehicle Running Expenses', type: 'EXPENSE', openingBalance: 1_600_000,
    entries: [
      { date: '2026-06-06', ref: 'PMT-0123', description: 'Vehicle repair & service – TZ-123-ABC',        debit: 1_240_000,  credit: 0           },
    ],
  },
  {
    code: '6600', name: 'Bank Charges & Forex', type: 'EXPENSE', openingBalance: 480_000,
    entries: [
      { date: '2026-06-10', ref: 'BNK-0031', description: 'NBC bank charges – June 2026',                 debit: 220_000,    credit: 0           },
      { date: '2026-06-13', ref: 'BNK-0032', description: 'Forex loss – USD payment',                     debit: 84_000,     credit: 0           },
    ],
  },
];

/* ─────────────────────────── helpers ─────────────────────────── */
function fmt(n: number, cur: string) {
  return `${cur} ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function closingBalance(acc: Account): number {
  const totalDr = acc.entries.reduce((s, e) => s + e.debit, 0);
  const totalCr = acc.entries.reduce((s, e) => s + e.credit, 0);
  return acc.openingBalance + totalDr - totalCr;
}
function runningBalance(acc: Account, upToIndex: number): number {
  let bal = acc.openingBalance;
  for (let i = 0; i <= upToIndex; i++) {
    bal += acc.entries[i].debit - acc.entries[i].credit;
  }
  return bal;
}

/* ─────────────────────────── component ─────────────────────────── */
export const FinanceLedger: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();

  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState<AccType | 'ALL'>('ALL');
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [period, setPeriod]       = useState('Jun 2026');

  const periods = ['Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026'];

  const filtered = useMemo(() =>
    ACCOUNTS.filter(a => {
      if (typeFilter !== 'ALL' && a.type !== typeFilter) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.code.includes(search)) return false;
      return true;
    }),
  [typeFilter, search]);

  function toggleExpand(code: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  const totals = useMemo(() => {
    let totalDr = 0, totalCr = 0;
    ACCOUNTS.forEach(a => {
      const dr = a.entries.reduce((s, e) => s + e.debit, 0);
      const cr = a.entries.reduce((s, e) => s + e.credit, 0);
      totalDr += dr; totalCr += cr;
    });
    return { dr: totalDr, cr: totalCr };
  }, []);

  const grouped = useMemo(() => {
    const groups: Partial<Record<AccType, typeof filtered>> = {};
    filtered.forEach(a => {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type]!.push(a);
    });
    return groups;
  }, [filtered]);

  const typeOrder: AccType[] = ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'];

  return (
    <div style={{ padding: isMobile ? '14px 16px' : '28px 32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>Ledger Summary</h1>
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>General ledger — all accounts with transaction detail</p>
        </div>
        <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
          <select title="Period" value={period} onChange={e => setPeriod(e.target.value)} className="input-field" style={{ height: 34, fontSize: 12 }}>
            {periods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" title="Export ledger" className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <Icon name="download" size={13} />Export
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label:'Total Accounts', value: ACCOUNTS.length, color:'var(--teal)' },
          { label:'Total Debits',   value: fmt(totals.dr), color:'#0891b2' },
          { label:'Total Credits',  value: fmt(totals.cr), color:'#7c3aed' },
          { label:'Net Movement',   value: fmt(totals.dr - totals.cr), color: totals.dr >= totals.cr ? '#16a34a' : '#ef4444' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding:'16px 18px', borderTop:`3px solid ${c.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color:'var(--ink)' }}>{c.value}</div>
            <div style={{ fontSize: 12, color:'var(--ink3)', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap: 10, marginBottom: 18, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'1 1 180px', maxWidth: 260 }}>
          <Icon name="search" size={13} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search accounts" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search account…" className="input-field" style={{ paddingLeft:32, height:34, fontSize:13, width:'100%' }} />
        </div>
        <div style={{ display:'flex', gap: 6, flexWrap:'wrap' }}>
          {(['ALL', ...typeOrder] as const).map(t => (
            <button key={t} type="button" title={`Filter by ${t}`}
              onClick={() => setTypeFilter(t)}
              style={{ padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)',
                background: typeFilter===t ? (t==='ALL'?'var(--teal)':TYPE_CFG[t].color) : 'var(--white)',
                color: typeFilter===t ? '#fff' : 'var(--ink3)',
              }}>
              {t === 'ALL' ? 'All' : TYPE_CFG[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger table */}
      {typeOrder.filter(t => grouped[t]).map(t => (
        <div key={t} style={{ marginBottom: 24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:`${TYPE_CFG[t].color}12`, borderRadius: '9px 9px 0 0', borderBottom:`2px solid ${TYPE_CFG[t].color}` }}>
            <span style={{ fontSize:11, fontWeight:800, color:TYPE_CFG[t].color, textTransform:'uppercase', letterSpacing:'0.08em' }}>{TYPE_CFG[t].label}S</span>
            <span style={{ fontSize:11, color:'var(--ink3)' }}>— {grouped[t]!.length} accounts</span>
          </div>

          <div style={{ border:'1px solid var(--border)', borderTop:'none', borderRadius: '0 0 9px 9px', overflow:'hidden', overflowX:'auto' }}>
            {/* Account rows */}
            {grouped[t]!.map((acc, ai) => {
              const open = acc.openingBalance;
              const totalDr = acc.entries.reduce((s, e) => s + e.debit, 0);
              const totalCr = acc.entries.reduce((s, e) => s + e.credit, 0);
              const close = closingBalance(acc);
              const isOpen = expanded.has(acc.code);
              const cfg = TYPE_CFG[acc.type];

              return (
                <div key={acc.code} style={{ borderBottom: ai < grouped[t]!.length-1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Account header row */}
                  <button type="button" title={`Expand ${acc.name}`}
                    onClick={() => acc.entries.filter(e=>e.debit||e.credit).length > 0 && toggleExpand(acc.code)}
                    style={{ width:'100%', display:'grid', gridTemplateColumns:'28px 70px 1fr 140px 140px 140px 28px', alignItems:'center', gap:0, padding:'11px 14px', background: isOpen ? 'var(--bg)' : 'var(--white)', border:'none', cursor:'pointer', fontFamily:'var(--font)', textAlign:'left' }}>
                    <span style={{ fontSize:11, color:cfg.color, fontWeight:700 }}>{isOpen ? '−' : '+'}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink3)', fontWeight:600 }}>{acc.code}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{acc.name}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink2)', textAlign:'right' }}>{fmt(Math.abs(open))}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#0891b2', textAlign:'right' }}>{totalDr > 0 ? fmt(totalDr) : '—'}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#7c3aed', textAlign:'right' }}>{totalCr > 0 ? fmt(totalCr) : '—'}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:11, fontWeight:700, color: close < 0 ? '#7c3aed' : '#0891b2', background: close < 0 ? '#ede9fe' : '#ecfeff', padding:'2px 6px', borderRadius: 9, whiteSpace:'nowrap' }}>
                        {close < 0 ? 'Cr' : 'Dr'}
                      </span>
                    </span>
                  </button>

                  {/* Transaction detail */}
                  {isOpen && (
                    <div style={{ background:'var(--bg)' }}>
                      {/* Sub-header */}
                      <div style={{ display:'grid', gridTemplateColumns:'28px 70px 120px 1fr 130px 130px 130px', gap:0, padding:'6px 14px', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
                        {['','','Date','Description','Debit','Credit','Balance'].map((h,i)=>(
                          <span key={i} style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:i>=4?'right':'left' }}>{h}</span>
                        ))}
                      </div>
                      {/* Opening balance row */}
                      <div style={{ display:'grid', gridTemplateColumns:'28px 70px 120px 1fr 130px 130px 130px', gap:0, padding:'8px 14px', borderBottom:'1px solid var(--border)' }}>
                        <span/><span/>
                        <span style={{ fontSize:11, color:'var(--ink3)' }}>—</span>
                        <span style={{ fontSize:12, color:'var(--ink2)', fontStyle:'italic' }}>Opening Balance b/f</span>
                        <span/>
                        <span/>
                        <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink)', textAlign:'right', fontWeight:700 }}>{fmt(Math.abs(open))} {open < 0 ? 'Cr' : 'Dr'}</span>
                      </div>
                      {/* Entries */}
                      {acc.entries.filter(e => e.debit > 0 || e.credit > 0).map((e, ei) => {
                        const runBal = runningBalance(acc, ei);
                        return (
                          <div key={ei} style={{ display:'grid', gridTemplateColumns:'28px 70px 120px 1fr 130px 130px 130px', gap:0, padding:'8px 14px', borderBottom:'1px solid var(--border)', background: ei%2===1 ? 'var(--white)' : 'var(--bg)' }}>
                            <span/>
                            <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--ink3)' }}>{e.ref}</span>
                            <span style={{ fontSize:11, color:'var(--ink3)' }}>{fmtDate(e.date)}</span>
                            <span style={{ fontSize:12, color:'var(--ink2)' }}>{e.description}</span>
                            <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#0891b2', textAlign:'right' }}>{e.debit > 0 ? fmt(e.debit) : ''}</span>
                            <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#7c3aed', textAlign:'right' }}>{e.credit > 0 ? fmt(e.credit) : ''}</span>
                            <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink)', textAlign:'right' }}>{fmt(Math.abs(runBal))} {runBal < 0 ? 'Cr' : 'Dr'}</span>
                          </div>
                        );
                      })}
                      {/* Closing balance */}
                      <div style={{ display:'grid', gridTemplateColumns:'28px 70px 120px 1fr 130px 130px 130px', gap:0, padding:'8px 14px', background:'var(--teal-l)', borderTop:`1px solid ${cfg.color}40` }}>
                        <span/><span/>
                        <span style={{ fontSize:11, color:'var(--ink3)', fontStyle:'italic' }}>Closing</span>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>Closing Balance c/f</span>
                        <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#0891b2', textAlign:'right', fontWeight:700 }}>{fmt(totalDr)}</span>
                        <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#7c3aed', textAlign:'right', fontWeight:700 }}>{fmt(totalCr)}</span>
                        <span style={{ fontSize:13, fontFamily:'var(--mono)', color:'var(--teal)', textAlign:'right', fontWeight:800 }}>{fmt(Math.abs(close))} {close < 0 ? 'Cr' : 'Dr'}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
