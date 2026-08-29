import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { useCompany } from '../data/companyStore.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import { apiFetch } from '../lib/api.js';
import type { TrialBalanceReport, TrialBalanceRow, LedgerReport, AccountType } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

const TYPE_CFG: Record<AccountType, { label: string; color: string; bg: string }> = {
  ASSET:     { label: 'Asset',     color: '#0891b2', bg: '#ecfeff' },
  LIABILITY: { label: 'Liability', color: 'var(--red)', bg: 'var(--red-l)' },
  EQUITY:    { label: 'Equity',    color: '#7c3aed', bg: 'var(--purple-l)' },
  REVENUE:   { label: 'Revenue',   color: '#059669', bg: 'var(--green-l)' },
  EXPENSE:   { label: 'Expense',   color: 'var(--gold)', bg: 'var(--gold-l)' },
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

/** Accounts per page. Same figure as the rest of the platform's lists. */
const PAGE_SIZE = 25;

export const FinanceLedger: React.FC = () => {
  const co = useCompany();
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();
  const isFullLayout = useFullLayout();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1);
  const [page, setPage] = useState(1);
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

  /**
   * Accounts are paged first and grouped second, not the other way round.
   * Grouping first and paging the groups would make a page mean "one account
   * type", which is what the type tabs already do and would leave a page of
   * 2 next to a page of 40.
   */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamped, so narrowing the filter while on a later page cannot leave an
  // empty table with nothing explaining why.
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const paged = useMemo(() => filtered.slice(offset, offset + PAGE_SIZE), [filtered, offset]);

  useEffect(() => { setPage(1); }, [search, typeFilter, periodIdx]);

  const grouped = useMemo(() => {
    const groups: Partial<Record<AccountType, typeof filtered>> = {};
    paged.forEach(a => {
      if (!groups[a.account_type]) groups[a.account_type] = [];
      groups[a.account_type]!.push(a);
    });
    return groups;
  }, [paged]);

  function exportCsv() {
    const rows = [
      ['Code', 'Account', 'Type', 'Opening Balance', 'Period Debit', 'Period Credit', 'Closing Balance'],
      ...filtered.map(a => [
        a.account_code, a.account_name, TYPE_CFG[a.account_type].label,
        String(a.opening_debit - a.opening_credit), String(a.period_debit), String(a.period_credit),
        String(a.closing_debit - a.closing_credit),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ledger-${period.label.replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>Loading ledger…</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      {/* Header */}
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Ledger"
        titleEm="summary"
        subtitle="General ledger — all accounts with transaction detail."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
            <Select value={String(periodIdx)} onValueChange={v => setPeriodIdx(Number(v))}>
              <SelectTrigger aria-label="Period" style={{ width: 'auto', height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p, i) => <SelectItem key={p.label} value={String(i)}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" title="Export ledger" className="btn btn-secondary btn-sm" style={{ gap: 6, whiteSpace: 'nowrap' }} onClick={exportCsv}>
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Active Accounts', value: accounts.length, color: 'var(--teal)' },
          { label: 'Total Debits',    value: fmt(totals.dr), color: '#0891b2' },
          { label: 'Total Credits',   value: fmt(totals.cr), color: '#7c3aed' },
          { label: 'Net Movement',    value: fmt(totals.dr - totals.cr), color: totals.dr >= totals.cr ? '#059669' : '#ef4444' },
        ].map(c => (
          // No accent bar across the top. Four cards each in a different
          // colour is decoration competing with the figures they carry.
          <div key={c.label} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters Toolbar Card: Tabs on Left, Search on Right */}
      <div style={{ marginBottom: 20 }}>
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Tabs value={typeFilter} onValueChange={v => setTypeFilter(v as AccountType | 'ALL')} variant="pill">
          <TabsList>
            <TabsTrigger value="ALL">All ({accounts.length})</TabsTrigger>
            {TYPE_ORDER.map(t => (
              <TabsTrigger key={t} value={t}>
                {TYPE_CFG[t].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div style={{ position: 'relative', width: isMobile ? '100%' : 260 }}>
          <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' } as React.CSSProperties} />
          <input
            type="text"
            title="Search accounts"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search account…"
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r, 6px)',
              fontSize: 13,
              fontFamily: 'var(--font)',
              background: 'var(--white)',
              color: 'var(--ink)',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>
        </div>
      </SectionCard>
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
                    style={{ width:'100%', display:'grid', gridTemplateColumns:'28px 70px 1fr 140px 140px 140px 28px', alignItems:'center', gap:0, padding:'var(--ds-btn-py) 14px', background: isOpen ? 'var(--bg)' : 'var(--white)', border:'none', cursor:'pointer', fontFamily:'var(--font)', textAlign:'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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

      {/* Hidden when everything already fits on one page. */}
      {filtered.length > PAGE_SIZE && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          flexWrap: 'wrap', padding: '14px 16px', border: '1px solid var(--border)',
          borderRadius: 9, background: 'var(--white)', fontSize: 12.5, color: 'var(--ink3)',
        }}>
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, filtered.length)} of {filtered.length} account{filtered.length === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary btn-sm"
              disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <Icon name="arrowLeft" size={12} /> Previous
            </button>
            <span style={{ minWidth: 70, textAlign: 'center' }}>Page {currentPage} of {pageCount}</span>
            <button type="button" className="btn btn-secondary btn-sm"
              disabled={currentPage === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
              Next <Icon name="arrowRight" size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
