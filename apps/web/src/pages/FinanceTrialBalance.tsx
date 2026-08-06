import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { useCompany } from '../data/companyStore.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch } from '../lib/api.js';
import type { TrialBalanceReport, AccountType } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';

const TYPE_CFG: Record<AccountType, { label: string; color: string; bg: string }> = {
  ASSET:     { label: 'Assets',      color: '#0891b2', bg: '#ecfeff' },
  LIABILITY: { label: 'Liabilities', color: '#ef4444', bg: '#fef2f2' },
  EQUITY:    { label: 'Equity',      color: '#7c3aed', bg: '#ede9fe' },
  REVENUE:   { label: 'Revenue',     color: '#059669', bg: '#ecfdf5' },
  EXPENSE:   { label: 'Expenses',    color: '#d97706', bg: '#fef3c7' },
};
const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

function monthRange(offsetFromNow: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offsetFromNow, 1);
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}
const PERIODS = Array.from({ length: 12 }, (_, i) => monthRange(11 - i));

function fmt(n: number, cur: string) {
  if (n === 0) return '—';
  return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

export const FinanceTrialBalance: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const isMobile = useIsMobile();

  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1);
  const [typeFilter, setTypeFilter] = useState<AccountType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const period = PERIODS[periodIdx];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiFetch(`/v1/finance/trial-balance?from=${period.from}&to=${period.to}`)
      .then((res: TrialBalanceReport) => { if (alive) setReport(res); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load trial balance'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period.from, period.to]);

  const rows = report?.rows ?? [];

  const filtered = useMemo(() =>
    rows.filter(a => {
      if (typeFilter !== 'ALL' && a.account_type !== typeFilter) return false;
      if (search && !a.account_name.toLowerCase().includes(search.toLowerCase()) && !a.account_code.includes(search)) return false;
      if (a.closing_debit === 0 && a.closing_credit === 0) return false;
      return true;
    }),
  [rows, typeFilter, search]);

  const totals = report?.totals ?? { debit: 0, credit: 0 };
  const balanced = Math.abs(totals.debit - totals.credit) < 1;

  const grouped = useMemo(() => {
    const g: Partial<Record<AccountType, typeof filtered>> = {};
    filtered.forEach(a => { if (!g[a.account_type]) g[a.account_type] = []; g[a.account_type]!.push(a); });
    return g;
  }, [filtered]);

  const groupTotals = useMemo(() =>
    Object.fromEntries(
      TYPE_ORDER.map(t => [
        t,
        {
          debit: rows.filter(a => a.account_type === t).reduce((s, a) => s + a.closing_debit, 0),
          credit: rows.filter(a => a.account_type === t).reduce((s, a) => s + a.closing_credit, 0),
        },
      ])
    ) as Record<AccountType, { debit: number; credit: number }>,
  [rows]);

  function exportCsv() {
    const rows2 = [
      ['Code', 'Account Name', 'Type', 'Debit', 'Credit'],
      ...filtered.map(a => [a.account_code, a.account_name, TYPE_CFG[a.account_type].label, String(a.closing_debit), String(a.closing_credit)]),
    ];
    const csv = rows2.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `trial-balance-${period.label.replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading trial balance…</div>;
  if (error) return <div style={{ textAlign: 'center', color: '#ef4444' }}>{error}</div>;

  return (
    <div style={{ padding: '0 0 28px', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom: 24 }}>
        <div>
          <PageHeader
            crumbs={['FinOps', 'Trial Balance']}
            titlePlain="Trial"
            titleEm="balance"
          />
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>{co.name} — verifying debits equal credits</p>
        </div>
        <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
          <Select value={String(periodIdx)} onValueChange={v => setPeriodIdx(Number(v))}>
            <SelectTrigger aria-label="Period" className="input-field" style={{ height: 34, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p, i) => <SelectItem key={p.label} value={String(i)}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" title="Export trial balance" className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={exportCsv}>
            <Icon name="download" size={13} />Export
          </button>
          <button type="button" title="Print trial balance" className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={() => window.print()}>
            <Icon name="fileText" size={13} />Print
          </button>
        </div>
      </div>

      {/* Balance status banner */}
      <div style={{ display:'flex', alignItems:'center', gap: 12, padding:'12px 18px', borderRadius: 9, marginBottom: 24, background: balanced ? '#ecfdf5' : '#fef2f2', border:`1px solid ${balanced ? '#059669' : '#ef4444'}40` }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: balanced ? '#059669' : '#ef4444', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>
          <Icon name={balanced ? 'check' : 'alertTriangle'} size={16} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: balanced ? '#059669' : '#ef4444' }}>
            {balanced ? 'Trial Balance is Balanced ✓' : 'Trial Balance Out of Balance ✗'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
            Total Debits: <strong>{cur} {totals.debit.toLocaleString()}</strong> &nbsp;·&nbsp; Total Credits: <strong>{cur} {totals.credit.toLocaleString()}</strong>
            {balanced ? ' — Difference: Nil' : ` — Difference: ${cur} ${Math.abs(totals.debit - totals.credit).toLocaleString()}`}
          </div>
        </div>
      </div>

      {/* Summary metric cards */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
        {TYPE_ORDER.map(t => {
          const gt = groupTotals[t];
          const cfg = TYPE_CFG[t];
          const count = rows.filter(a => a.account_type === t && (a.closing_debit !== 0 || a.closing_credit !== 0)).length;
          return (
            <div key={t} className="card" style={{ padding:'12px 14px', borderTop:`3px solid ${cfg.color}`, cursor:'pointer' }} onClick={() => setTypeFilter(typeFilter === t ? 'ALL' : t)}>
              <div style={{ fontSize: 10, fontWeight: 800, color: cfg.color, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom: 6 }}>{cfg.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color:'var(--ink)', fontFamily:'var(--mono)' }}>
                {gt.debit > 0 ? `Dr ${(gt.debit/1_000_000).toFixed(1)}M` : `Cr ${(gt.credit/1_000_000).toFixed(1)}M`}
              </div>
              <div style={{ fontSize: 10, color:'var(--ink3)', marginTop: 3 }}>{count} accounts</div>
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
          {(['ALL',...TYPE_ORDER] as const).map(t => (
            <button key={t} type="button" title={`Filter ${t}`}
              onClick={() => setTypeFilter(t)}
              style={{ padding:'var(--ds-btn-py-sm) 12px', borderRadius:20, border:'1px solid var(--border)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)',
                background: typeFilter===t ? (t==='ALL'?'var(--teal)':TYPE_CFG[t].color) : 'var(--white)',
                color: typeFilter===t ? '#fff' : 'var(--ink3)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {t==='ALL' ? 'All' : TYPE_CFG[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table — .rtbl/.rtbl-wrap is the shared responsive-table convention (index.css):
          horizontal scroll + col-hide-md/col-hide-sm on narrow viewports, instead of a
          fixed-pixel CSS grid that would overflow on mobile. */}
      <div className="rtbl-wrap" style={{ border:'1px solid var(--border)', borderRadius: 9 }}>
        <table className="rtbl" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account Name</th>
              <th className="col-hide-sm">Type</th>
              <th style={{ textAlign:'right' }}>Debit</th>
              <th style={{ textAlign:'right' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding:'40px 0', textAlign:'center', color:'var(--ink3)' }}>No account activity for this period.</td></tr>
            )}

            {TYPE_ORDER.filter(t => grouped[t]).map(t => {
              const cfg = TYPE_CFG[t];
              const gt = groupTotals[t];
              const grpFiltered = grouped[t]!;
              return (
                <React.Fragment key={t}>
                  {/* Group header */}
                  <tr style={{ background:`${cfg.color}10` }}>
                    <td colSpan={3} style={{ fontSize:10, fontWeight:800, color:cfg.color, textTransform:'uppercase', letterSpacing:'0.08em' }}>{cfg.label}</td>
                    <td style={{ textAlign:'right', fontSize:11, fontWeight:700, color:'#0891b2', fontFamily:'var(--mono)' }}>{gt.debit > 0 ? `${cur} ${gt.debit.toLocaleString()}` : ''}</td>
                    <td style={{ textAlign:'right', fontSize:11, fontWeight:700, color:'#7c3aed', fontFamily:'var(--mono)' }}>{gt.credit > 0 ? `${cur} ${gt.credit.toLocaleString()}` : ''}</td>
                  </tr>

                  {/* Account rows */}
                  {grpFiltered.map(acc => (
                    <tr key={acc.account_code}>
                      <td style={{ fontFamily:'var(--mono)', color:'var(--ink3)', fontWeight:600 }}>{acc.account_code}</td>
                      <td style={{ color:'var(--ink)', fontWeight:500 }}>{acc.account_name}</td>
                      <td className="col-hide-sm">
                        <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:cfg.bg, padding:'2px 7px', borderRadius: 9 }}>{cfg.label.slice(0,-1)}</span>
                      </td>
                      <td style={{ textAlign:'right', fontFamily:'var(--mono)', color: acc.closing_debit > 0 ? '#0891b2' : 'var(--ink3)', fontWeight: acc.closing_debit > 0 ? 600 : 400 }}>
                        {fmt(acc.closing_debit, cur)}
                      </td>
                      <td style={{ textAlign:'right', fontFamily:'var(--mono)', color: acc.closing_credit > 0 ? '#7c3aed' : 'var(--ink3)', fontWeight: acc.closing_credit > 0 ? 600 : 400 }}>
                        {fmt(acc.closing_credit, cur)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}

            {/* Grand total */}
            <tr style={{ background:'var(--teal-l)' }}>
              <td colSpan={3} style={{ fontSize:13, fontWeight:800, color:'var(--teal)' }}>GRAND TOTAL</td>
              <td style={{ textAlign:'right', fontSize:14, fontFamily:'var(--mono)', color:'#0891b2', fontWeight:800 }}>{cur} {totals.debit.toLocaleString()}</td>
              <td style={{ textAlign:'right', fontSize:14, fontFamily:'var(--mono)', color:'#7c3aed', fontWeight:800 }}>{cur} {totals.credit.toLocaleString()}</td>
            </tr>

            {/* Balance check row */}
            <tr style={{ background: balanced ? '#ecfdf5' : '#fef2f2' }}>
              <td colSpan={3} style={{ fontSize:12, fontWeight:700, color: balanced ? '#059669' : '#ef4444' }}>
                <Icon name={balanced ? 'check' : 'alertTriangle'} size={12} color={balanced?'#059669':'#ef4444'} style={{ marginRight:5, verticalAlign:'middle' }} />
                {balanced ? 'Balanced — Nil Difference' : 'Out of Balance'}
              </td>
              <td style={{ textAlign:'right', fontSize:12, fontFamily:'var(--mono)', color: balanced ? '#059669' : '#ef4444', fontWeight:700 }}>{balanced ? '—' : `${cur} ${Math.abs(totals.debit - totals.credit).toLocaleString()}`}</td>
              <td style={{ textAlign:'right', fontSize:12, fontFamily:'var(--mono)', color: balanced ? '#059669' : '#ef4444', fontWeight:700 }}>{balanced ? '—' : ''}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ fontSize:11, color:'var(--ink3)', marginTop:14, textAlign:'right' }}>
        Period: {period.label} &nbsp;·&nbsp; Prepared: {new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})} &nbsp;·&nbsp; {co.name}
      </p>
    </div>
  );
};
