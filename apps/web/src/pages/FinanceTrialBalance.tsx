import React, { useState, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { useCompany } from '../data/companyStore.js';

type AccType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

interface TBAccount {
  code: string;
  name: string;
  type: AccType;
  debit: number;   // 0 if credit-balance account
  credit: number;  // 0 if debit-balance account
}

const TYPE_CFG: Record<AccType, { label: string; color: string; bg: string }> = {
  ASSET:     { label: 'Assets',              color: '#0891b2', bg: '#ecfeff' },
  LIABILITY: { label: 'Liabilities',         color: '#ef4444', bg: '#fef2f2' },
  EQUITY:    { label: 'Equity',              color: '#7c3aed', bg: '#ede9fe' },
  REVENUE:   { label: 'Revenue',             color: '#16a34a', bg: '#dcfce7' },
  EXPENSE:   { label: 'Expenses',            color: '#d97706', bg: '#fef3c7' },
};

/* ── Trial Balance data (Debits = Credits = 435,000,000 TZS) ── */
const TB_ACCOUNTS: TBAccount[] = [
  /* ASSETS — debit balances */
  { code:'1100', name:'Cash & Bank',                     type:'ASSET',     debit: 168_810_000, credit: 0           },
  { code:'1200', name:'Accounts Receivable',             type:'ASSET',     debit:  55_500_000, credit: 0           },
  { code:'1300', name:'Prepaid Expenses',                type:'ASSET',     debit:   8_700_000, credit: 0           },
  { code:'1500', name:'Office Equipment (Net)',           type:'ASSET',     debit:  26_238_000, credit: 0           },
  { code:'1600', name:'Motor Vehicles (Net)',             type:'ASSET',     debit:  65_627_000, credit: 0           },

  /* LIABILITIES — credit balances */
  { code:'2100', name:'Accounts Payable',                type:'LIABILITY', debit: 0,           credit:  43_850_000 },
  { code:'2200', name:'VAT Payable',                     type:'LIABILITY', debit: 0,           credit:   4_040_000 },
  { code:'2300', name:'Withholding Tax Payable',         type:'LIABILITY', debit: 0,           credit:     720_000 },
  { code:'2400', name:'Advance from Customers',          type:'LIABILITY', debit: 0,           credit:  18_000_000 },

  /* EQUITY — credit balances */
  { code:'3100', name:'Share Capital',                   type:'EQUITY',    debit: 0,           credit: 100_000_000 },
  { code:'3200', name:'Retained Earnings',               type:'EQUITY',    debit: 0,           credit: 161_500_000 },

  /* REVENUE — credit balances */
  { code:'4100', name:'Clearance Fees',                  type:'REVENUE',   debit: 0,           credit:  49_600_000 },
  { code:'4200', name:'Agency Fees',                     type:'REVENUE',   debit: 0,           credit:  12_120_000 },
  { code:'4300', name:'Transport Fees',                  type:'REVENUE',   debit: 0,           credit:   9_480_000 },
  { code:'4400', name:'Documentation Fees',              type:'REVENUE',   debit: 0,           credit:   6_300_000 },
  { code:'4500', name:'Storage & Demurrage Recovery',    type:'REVENUE',   debit: 0,           credit:   7_520_000 },

  /* EXPENSES — debit balances */
  { code:'5100', name:'Port & Terminal Charges',         type:'EXPENSE',   debit:  19_450_000, credit: 0           },
  { code:'5200', name:'Shipping Line Fees',              type:'EXPENSE',   debit:  14_800_000, credit: 0           },
  { code:'5300', name:'Government Duties (Passthrough)', type:'EXPENSE',   debit:  13_000_000, credit: 0           },
  { code:'5400', name:'Inspection & Survey Fees',        type:'EXPENSE',   debit:   5_180_000, credit: 0           },
  { code:'5500', name:'Haulage & Transport Costs',       type:'EXPENSE',   debit:   5_440_000, credit: 0           },
  { code:'6100', name:'Staff Salaries & Allowances',     type:'EXPENSE',   debit:  28_400_000, credit: 0           },
  { code:'6200', name:'Rent & Utilities',                type:'EXPENSE',   debit:  11_540_000, credit: 0           },
  { code:'6300', name:'Communications',                  type:'EXPENSE',   debit:   1_420_000, credit: 0           },
  { code:'6500', name:'Vehicle Running Expenses',        type:'EXPENSE',   debit:   2_840_000, credit: 0           },
  { code:'6600', name:'Bank Charges & Forex',            type:'EXPENSE',   debit:     784_000, credit: 0           },
];

const PERIODS = ['Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026'];

function fmt(n: number, cur: string) {
  if (n === 0) return '—';
  return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

export const FinanceTrialBalance: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';

  const [period, setPeriod]     = useState('Jun 2026');
  const [typeFilter, setTypeFilter] = useState<AccType | 'ALL'>('ALL');
  const [search, setSearch]     = useState('');

  const filtered = useMemo(() =>
    TB_ACCOUNTS.filter(a => {
      if (typeFilter !== 'ALL' && a.type !== typeFilter) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.code.includes(search)) return false;
      return true;
    }),
  [typeFilter, search]);

  const totals = useMemo(() => ({
    debit:  TB_ACCOUNTS.reduce((s, a) => s + a.debit,  0),
    credit: TB_ACCOUNTS.reduce((s, a) => s + a.credit, 0),
  }), []);

  const balanced = Math.abs(totals.debit - totals.credit) < 1;

  const typeOrder: AccType[] = ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'];

  const grouped = useMemo(() => {
    const g: Partial<Record<AccType, typeof filtered>> = {};
    filtered.forEach(a => { if (!g[a.type]) g[a.type] = []; g[a.type]!.push(a); });
    return g;
  }, [filtered]);

  const groupTotals = useMemo(() =>
    Object.fromEntries(
      typeOrder.map(t => [
        t,
        {
          debit:  TB_ACCOUNTS.filter(a => a.type === t).reduce((s,a) => s + a.debit,  0),
          credit: TB_ACCOUNTS.filter(a => a.type === t).reduce((s,a) => s + a.credit, 0),
        },
      ])
    ) as Record<AccType, { debit:number; credit:number }>,
  []);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>Trial Balance</h1>
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>{co.name} — verifying debits equal credits</p>
        </div>
        <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
          <select title="Period" value={period} onChange={e => setPeriod(e.target.value)} className="input-field" style={{ height: 34, fontSize: 12 }}>
            {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" title="Export trial balance" className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <Icon name="download" size={13} />Export
          </button>
          <button type="button" title="Print trial balance" className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <Icon name="fileText" size={13} />Print
          </button>
        </div>
      </div>

      {/* Balance status banner */}
      <div style={{ display:'flex', alignItems:'center', gap: 12, padding:'12px 18px', borderRadius: 9, marginBottom: 24, background: balanced ? '#dcfce7' : '#fef2f2', border:`1px solid ${balanced ? '#16a34a' : '#ef4444'}40` }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: balanced ? '#16a34a' : '#ef4444', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>
          <Icon name={balanced ? 'check' : 'alertTriangle'} size={16} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: balanced ? '#16a34a' : '#ef4444' }}>
            {balanced ? 'Trial Balance is Balanced ✓' : 'Trial Balance Out of Balance ✗'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
            Total Debits: <strong>{cur} {totals.debit.toLocaleString()}</strong> &nbsp;·&nbsp; Total Credits: <strong>{cur} {totals.credit.toLocaleString()}</strong>
            {balanced ? ' — Difference: Nil' : ` — Difference: ${cur} ${Math.abs(totals.debit - totals.credit).toLocaleString()}`}
          </div>
        </div>
      </div>

      {/* Summary metric cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
        {typeOrder.map(t => {
          const gt = groupTotals[t];
          const cfg = TYPE_CFG[t];
          return (
            <div key={t} className="card" style={{ padding:'12px 14px', borderTop:`3px solid ${cfg.color}`, cursor:'pointer' }} onClick={() => setTypeFilter(typeFilter === t ? 'ALL' : t)}>
              <div style={{ fontSize: 10, fontWeight: 800, color: cfg.color, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom: 6 }}>{cfg.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color:'var(--ink)', fontFamily:'var(--mono)' }}>
                {gt.debit > 0 ? `Dr ${(gt.debit/1_000_000).toFixed(1)}M` : `Cr ${(gt.credit/1_000_000).toFixed(1)}M`}
              </div>
              <div style={{ fontSize: 10, color:'var(--ink3)', marginTop: 3 }}>{TB_ACCOUNTS.filter(a=>a.type===t).length} accounts</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap: 10, marginBottom: 16, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'1 1 180px', maxWidth: 260 }}>
          <Icon name="search" size={13} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
          <input title="Search accounts" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search account…" className="input-field" style={{ paddingLeft:32, height:34, fontSize:13, width:'100%' }} />
        </div>
        <div style={{ display:'flex', gap: 6, flexWrap:'wrap' }}>
          {(['ALL',...typeOrder] as const).map(t => (
            <button key={t} type="button" title={`Filter ${t}`}
              onClick={() => setTypeFilter(t)}
              style={{ padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)',
                background: typeFilter===t ? (t==='ALL'?'var(--teal)':TYPE_CFG[t].color) : 'var(--white)',
                color: typeFilter===t ? '#fff' : 'var(--ink3)',
              }}>
              {t==='ALL' ? 'All' : TYPE_CFG[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ border:'1px solid var(--border)', borderRadius: 9, overflow:'hidden' }}>
        {/* Table header */}
        <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 100px 180px 180px', background:'var(--bg)', padding:'10px 16px', borderBottom:'2px solid var(--border)' }}>
          {['Code','Account Name','Type','Debit','Credit'].map((h,i) => (
            <span key={h} style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.06em', textAlign: i>=3 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>

        {/* Grouped rows */}
        {typeOrder.filter(t => grouped[t]).map(t => {
          const cfg = TYPE_CFG[t];
          const gt = groupTotals[t];
          const grpFiltered = grouped[t]!;
          return (
            <React.Fragment key={t}>
              {/* Group header */}
              <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 100px 180px 180px', padding:'8px 16px', background:`${cfg.color}10`, borderTop:'1px solid var(--border)' }}>
                <span style={{ fontSize:10, fontWeight:800, color:cfg.color, textTransform:'uppercase', letterSpacing:'0.08em', gridColumn:'span 2' }}>{cfg.label}</span>
                <span/>
                <span style={{ fontSize:11, fontWeight:700, color:'#0891b2', textAlign:'right', fontFamily:'var(--mono)' }}>{gt.debit > 0 ? `${cur} ${gt.debit.toLocaleString()}` : ''}</span>
                <span style={{ fontSize:11, fontWeight:700, color:'#7c3aed', textAlign:'right', fontFamily:'var(--mono)' }}>{gt.credit > 0 ? `${cur} ${gt.credit.toLocaleString()}` : ''}</span>
              </div>

              {/* Account rows */}
              {grpFiltered.map((acc, i) => (
                <div key={acc.code} style={{ display:'grid', gridTemplateColumns:'90px 1fr 100px 180px 180px', padding:'11px 16px', borderTop:'1px solid var(--border)', background: i%2===1 ? 'var(--bg)' : 'var(--white)', transition:'background .1s' }}>
                  <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink3)', fontWeight:600 }}>{acc.code}</span>
                  <span style={{ fontSize:13, color:'var(--ink)', fontWeight:500 }}>{acc.name}</span>
                  <span>
                    <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:cfg.bg, padding:'2px 7px', borderRadius: 9 }}>{cfg.label.slice(0,-1)}</span>
                  </span>
                  <span style={{ fontSize:13, fontFamily:'var(--mono)', color: acc.debit > 0 ? '#0891b2' : 'var(--ink3)', textAlign:'right', fontWeight: acc.debit > 0 ? 600 : 400 }}>
                    {fmt(acc.debit, cur)}
                  </span>
                  <span style={{ fontSize:13, fontFamily:'var(--mono)', color: acc.credit > 0 ? '#7c3aed' : 'var(--ink3)', textAlign:'right', fontWeight: acc.credit > 0 ? 600 : 400 }}>
                    {fmt(acc.credit, cur)}
                  </span>
                </div>
              ))}
            </React.Fragment>
          );
        })}

        {/* Grand total */}
        <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 100px 180px 180px', padding:'14px 16px', background:'var(--teal-l)', borderTop:'2px solid var(--teal)' }}>
          <span style={{ gridColumn:'span 3', fontSize:13, fontWeight:800, color:'var(--teal)' }}>GRAND TOTAL</span>
          <span style={{ fontSize:14, fontFamily:'var(--mono)', color:'#0891b2', textAlign:'right', fontWeight:800 }}>{cur} {totals.debit.toLocaleString()}</span>
          <span style={{ fontSize:14, fontFamily:'var(--mono)', color:'#7c3aed', textAlign:'right', fontWeight:800 }}>{cur} {totals.credit.toLocaleString()}</span>
        </div>

        {/* Balance check row */}
        <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 100px 180px 180px', padding:'10px 16px', background: balanced ? '#dcfce7' : '#fef2f2', borderTop:`1px solid ${balanced?'#16a34a':'#ef4444'}40` }}>
          <span style={{ gridColumn:'span 3', fontSize:12, fontWeight:700, color: balanced ? '#16a34a' : '#ef4444' }}>
            <Icon name={balanced ? 'check' : 'alertTriangle'} size={12} color={balanced?'#16a34a':'#ef4444'} style={{ marginRight:5, verticalAlign:'middle' }} />
            {balanced ? 'Balanced — Nil Difference' : 'Out of Balance'}
          </span>
          <span style={{ fontSize:12, fontFamily:'var(--mono)', color: balanced ? '#16a34a' : '#ef4444', textAlign:'right', fontWeight:700 }}>{balanced ? '—' : `${cur} ${Math.abs(totals.debit - totals.credit).toLocaleString()}`}</span>
          <span style={{ fontSize:12, fontFamily:'var(--mono)', color: balanced ? '#16a34a' : '#ef4444', textAlign:'right', fontWeight:700 }}>{balanced ? '—' : ''}</span>
        </div>
      </div>

      <p style={{ fontSize:11, color:'var(--ink3)', marginTop:14, textAlign:'right' }}>
        Period: {period} &nbsp;·&nbsp; Prepared: {new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})} &nbsp;·&nbsp; {co.name}
      </p>
    </div>
  );
};
