import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { useCompany } from '../data/companyStore.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import { apiFetch } from '../lib/api.js';
import type { TrialBalanceReport, TrialBalanceRow, LedgerReport, AccountType } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

const TYPE_CFG: Record<AccountType, { label: string; color: string; bg: string }> = {
  ASSET:     { label: 'Asset',     color: '#0891b2', bg: '#ecfeff' },
  LIABILITY: { label: 'Liability', color: '#ef4444', bg: '#fef2f2' },
  EQUITY:    { label: 'Equity',    color: '#7c3aed', bg: '#ede9fe' },
  REVENUE:   { label: 'Revenue',   color: '#059669', bg: '#ecfdf5' },
  EXPENSE:   { label: 'Expense',   color: '#d97706', bg: '#fef3c7' },
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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const FinanceLedger: React.FC = () => {
  const co = useCompany();
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();
  const isFullLayout = useFullLayout();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1);
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerCache, setLedgerCache] = useState<Record<string, LedgerReport>>({});
  const [ledgerLoading, setLedgerLoading] = useState<Set<string>>(new Set());

  const period = PERIODS[periodIdx];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setExpanded(new Set());
    setLedgerCache({});
    apiFetch(`/v1/finance/trial-balance?from=${period.from}&to=${period.to}`)
      .then((res: TrialBalanceReport) => { if (alive) setReport(res); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period.from, period.to]);

  const accounts = useMemo(() =>
    (report?.rows ?? []).filter(a =>
      a.opening_debit || a.opening_credit || a.period_debit || a.period_credit
    ),
  [report]);

  const filtered = useMemo(() =>
    accounts.filter(a => {
      if (typeFilter !== 'ALL' && a.account_type !== typeFilter) return false;
      if (search && !a.account_name.toLowerCase().includes(search.toLowerCase()) && !a.account_code.includes(search)) return false;
      return true;
    }),
  [accounts, typeFilter, search]);

  async function toggleExpand(acc: TrialBalanceRow) {
    const code = acc.account_code;
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
    if (!ledgerCache[code]) {
      setLedgerLoading(prev => new Set(prev).add(code));
      try {
        const res: LedgerReport = await apiFetch(`/v1/finance/ledger?account=${code}&from=${period.from}&to=${period.to}`);
        setLedgerCache(prev => ({ ...prev, [code]: res }));
      } catch {
        // leave uncached — row will just show no detail
      } finally {
        setLedgerLoading(prev => { const n = new Set(prev); n.delete(code); return n; });
      }
    }
  }

  const totals = useMemo(() => ({
    dr: accounts.reduce((s, a) => s + a.period_debit, 0),
    cr: accounts.reduce((s, a) => s + a.period_credit, 0),
  }), [accounts]);

  const grouped = useMemo(() => {
    const groups: Partial<Record<AccountType, typeof filtered>> = {};
    filtered.forEach(a => {
      if (!groups[a.account_type]) groups[a.account_type] = [];
      groups[a.account_type]!.push(a);
    });
    return groups;
  }, [filtered]);

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading ledger…</div>;

  return (
    <div style={{ padding: isMobile ? '14px 16px' : '28px 32px', maxWidth: isFullLayout ? 'none' : 1100 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>Ledger Summary</h1>
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>General ledger — all accounts with transaction detail</p>
        </div>
        <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
          <Select value={String(periodIdx)} onValueChange={v => setPeriodIdx(Number(v))}>
            <SelectTrigger aria-label="Period" className="input-field" style={{ height: 34, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p, i) => <SelectItem key={p.label} value={String(i)}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" title="Export ledger" className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <Icon name="download" size={13} />Export
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label:'Active Accounts', value: accounts.length, color:'var(--teal)' },
          { label:'Total Debits',    value: fmt(totals.dr), color:'#0891b2' },
          { label:'Total Credits',   value: fmt(totals.cr), color:'#7c3aed' },
          { label:'Net Movement',    value: fmt(totals.dr - totals.cr), color: totals.dr >= totals.cr ? '#059669' : '#ef4444' },
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
          {(['ALL', ...TYPE_ORDER] as const).map(t => (
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

      {filtered.length === 0 && (
        <div style={{ padding:'40px 0', textAlign:'center', color:'var(--ink3)', fontSize:13 }}>No account activity for this period.</div>
      )}

      {/* Ledger table */}
      {TYPE_ORDER.filter(t => grouped[t]).map(t => (
        <div key={t} style={{ marginBottom: 24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:`${TYPE_CFG[t].color}12`, borderRadius: '9px 9px 0 0', borderBottom:`2px solid ${TYPE_CFG[t].color}` }}>
            <span style={{ fontSize:11, fontWeight:800, color:TYPE_CFG[t].color, textTransform:'uppercase', letterSpacing:'0.08em' }}>{TYPE_CFG[t].label}S</span>
            <span style={{ fontSize:11, color:'var(--ink3)' }}>— {grouped[t]!.length} accounts</span>
          </div>

          <div style={{ border:'1px solid var(--border)', borderTop:'none', borderRadius: '0 0 9px 9px', overflow:'hidden', overflowX:'auto' }}>
            {/* Account rows */}
            {grouped[t]!.map((acc, ai) => {
              const open = acc.opening_debit - acc.opening_credit;
              const close = acc.closing_debit - acc.closing_credit;
              const isOpen = expanded.has(acc.account_code);
              const isLoadingLedger = ledgerLoading.has(acc.account_code);
              const ledger = ledgerCache[acc.account_code];
              const cfg = TYPE_CFG[acc.account_type];

              return (
                <div key={acc.account_code} style={{ borderBottom: ai < grouped[t]!.length-1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Account header row */}
                  <button type="button" title={`Expand ${acc.account_name}`}
                    onClick={() => toggleExpand(acc)}
                    style={{ width:'100%', display:'grid', gridTemplateColumns:'28px 70px 1fr 140px 140px 140px 28px', alignItems:'center', gap:0, padding:'11px 14px', background: isOpen ? 'var(--bg)' : 'var(--white)', border:'none', cursor:'pointer', fontFamily:'var(--font)', textAlign:'left' }}>
                    <span style={{ fontSize:11, color:cfg.color, fontWeight:700 }}>{isOpen ? '−' : '+'}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink3)', fontWeight:600 }}>{acc.account_code}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{acc.account_name}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink2)', textAlign:'right' }}>{fmt(Math.abs(open))}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#0891b2', textAlign:'right' }}>{acc.period_debit > 0 ? fmt(acc.period_debit) : '—'}</span>
                    <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#7c3aed', textAlign:'right' }}>{acc.period_credit > 0 ? fmt(acc.period_credit) : '—'}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:11, fontWeight:700, color: close < 0 ? '#7c3aed' : '#0891b2', background: close < 0 ? '#ede9fe' : '#ecfeff', padding:'2px 6px', borderRadius: 9, whiteSpace:'nowrap' }}>
                        {close < 0 ? 'Cr' : 'Dr'}
                      </span>
                    </span>
                  </button>

                  {/* Transaction detail */}
                  {isOpen && (
                    <div style={{ background:'var(--bg)' }}>
                      {isLoadingLedger ? (
                        <div style={{ padding:'16px', fontSize:12, color:'var(--ink3)', textAlign:'center' }}>Loading entries…</div>
                      ) : !ledger ? (
                        <div style={{ padding:'16px', fontSize:12, color:'var(--ink3)', textAlign:'center' }}>Couldn't load entries for this account.</div>
                      ) : (
                      <>
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
                        <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink)', textAlign:'right', fontWeight:700 }}>{fmt(Math.abs(ledger.opening_balance))} {ledger.opening_balance < 0 ? 'Cr' : 'Dr'}</span>
                      </div>
                      {/* Entries */}
                      {ledger.entries.map((e, ei) => (
                        <div key={e.id} style={{ display:'grid', gridTemplateColumns:'28px 70px 120px 1fr 130px 130px 130px', gap:0, padding:'8px 14px', borderBottom:'1px solid var(--border)', background: ei%2===1 ? 'var(--white)' : 'var(--bg)' }}>
                          <span/>
                          <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--ink3)' }}>{e.entry_number}</span>
                          <span style={{ fontSize:11, color:'var(--ink3)' }}>{fmtDate(e.date)}</span>
                          <span style={{ fontSize:12, color:'var(--ink2)' }}>{e.description}</span>
                          <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#0891b2', textAlign:'right' }}>{e.debit > 0 ? fmt(e.debit) : ''}</span>
                          <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#7c3aed', textAlign:'right' }}>{e.credit > 0 ? fmt(e.credit) : ''}</span>
                          <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--ink)', textAlign:'right' }}>{fmt(Math.abs(e.running_balance))} {e.running_balance < 0 ? 'Cr' : 'Dr'}</span>
                        </div>
                      ))}
                      {ledger.entries.length === 0 && (
                        <div style={{ padding:'10px 14px', fontSize:12, color:'var(--ink3)', fontStyle:'italic' }}>No entries this period.</div>
                      )}
                      {/* Closing balance */}
                      <div style={{ display:'grid', gridTemplateColumns:'28px 70px 120px 1fr 130px 130px 130px', gap:0, padding:'8px 14px', background:'var(--teal-l)', borderTop:`1px solid ${cfg.color}40` }}>
                        <span/><span/>
                        <span style={{ fontSize:11, color:'var(--ink3)', fontStyle:'italic' }}>Closing</span>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>Closing Balance c/f</span>
                        <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#0891b2', textAlign:'right', fontWeight:700 }}>{fmt(acc.period_debit)}</span>
                        <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'#7c3aed', textAlign:'right', fontWeight:700 }}>{fmt(acc.period_credit)}</span>
                        <span style={{ fontSize:13, fontFamily:'var(--mono)', color:'var(--teal)', textAlign:'right', fontWeight:800 }}>{fmt(Math.abs(close))} {close < 0 ? 'Cr' : 'Dr'}</span>
                      </div>
                      </>
                      )}
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
