import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import type { ExpenseListItem } from './Expenses.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

const fmtM = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;
const fmtFull = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;

// Same real category taxonomy Expenses.tsx uses (finance_expenses.category +
// the two synthetic fleet-sourced categories, FUEL/MAINTENANCE).
const CATS: Record<string, { label: string; color: string }> = {
  PORT_CHARGES:    { label: 'Port Charges',    color: 'var(--blue)' },
  CUSTOMS_DUTY:    { label: 'Customs Duty',    color: '#cf222e' },
  FREIGHT:         { label: 'Freight',         color: 'var(--teal)' },
  HANDLING:        { label: 'Handling',        color: '#9a6700' },
  TRANSPORT:       { label: 'Transport',       color: '#6e40c9' },
  INSPECTION_FEE:  { label: 'Inspection Fee',  color: '#059669' },
  AGENT_FEE:       { label: 'Agent Fee',       color: '#cf222e' },
  MISCELLANEOUS:   { label: 'Miscellaneous',   color: 'var(--ink3)' },
  FUEL:            { label: 'Fuel',            color: '#0891b2' },
  MAINTENANCE:     { label: 'Maintenance',     color: '#7c3aed' },
};
const PAGE_SIZE = 15;

const pagerBtn = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: 'var(--ds-btn-py-sm) 12px',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25,
  border: '1px solid var(--border)', borderRadius: 'var(--r)',
  background: 'var(--white)', color: 'var(--ink2)',
  fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.45 : 1,
});

function catLabel(cat: string) { return CATS[cat]?.label ?? cat; }
function catColor(cat: string) { return CATS[cat]?.color ?? 'var(--ink3)'; }

function BarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, paddingTop: 20 }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 9, color: 'var(--ink3)', marginBottom: 4, whiteSpace: 'nowrap' }}>{fmtM(v)}</div>
          <div style={{ width: '65%', height: `${Math.max(4, (v / max) * 140)}px`, background: color, borderRadius: '4px 4px 0 0' }} />
          <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 6 }}>{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year', 'Last Year'] as const;
type Period = typeof PERIODS[number];

function periodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (period) {
    case 'This Month': return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    case 'Last Month': return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
    case 'This Quarter': { const qStart = m - (m % 3); return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 1) }; }
    case 'This Year': return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
    case 'Last Year': return { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1) };
  }
}

export const FinanceExpensesReport: React.FC = () => {
  const [period, setPeriod] = useState<Period>('This Year');
  const [category, setCategory] = useState('All Categories');
  const [rawExpenses, setRawExpenses] = useState<ExpenseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    apiFetch('/v1/finance/expenses')
      .then((res: any) => setRawExpenses(Array.isArray(res?.data) ? res.data.filter((e: ExpenseListItem) => !e.is_revenue) : []))
      .catch((err: any) => setLoadError(err.message || 'Failed to load expenses'))
      .finally(() => setLoading(false));
  }, []);

  const { expenses, monthLabels, monthlyTotals, totalExpenses, thisMonthTotal, categoryBreakdown, largestCategory } = useMemo(() => {
    const { from, to } = periodRange(period);
    const withDate = rawExpenses.map(e => ({ e, date: new Date(e.date) }));
    const inPeriod = withDate.filter(x => x.date >= from && x.date < to);
    const expenses = (category === 'All Categories' ? inPeriod : inPeriod.filter(x => x.e.category === category))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const monthCount = period === 'This Quarter' ? 3 : (period === 'This Month' || period === 'Last Month') ? 1 : 12;
    const monthLabels: string[] = [];
    const monthlyTotals: number[] = [];
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
      monthLabels.push(d.toLocaleDateString('en-GB', { month: 'short' }));
      const bucketEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      monthlyTotals.push(inPeriod.filter(x => x.date >= d && x.date < bucketEnd).reduce((s, x) => s + x.e.amount, 0));
    }

    const totalExpenses = inPeriod.reduce((s, x) => s + x.e.amount, 0);
    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthTotal = withDate.filter(x => x.date >= curMonthStart).reduce((s, x) => s + x.e.amount, 0);

    const byCat = new Map<string, number>();
    inPeriod.forEach(x => byCat.set(x.e.category, (byCat.get(x.e.category) || 0) + x.e.amount));
    const categoryBreakdown = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
    const largestCategory = categoryBreakdown[0] ? catLabel(categoryBreakdown[0][0]) : '—';

    return { expenses, monthLabels, monthlyTotals, totalExpenses, thisMonthTotal, categoryBreakdown, largestCategory };
  }, [rawExpenses, period, category]);

  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [period, category]);

  const pageCount = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const pagedExpenses = expenses.slice(offset, offset + PAGE_SIZE);

  const allCategories = useMemo(() => Array.from(new Set(rawExpenses.map(e => e.category))).sort(), [rawExpenses]);

  function exportCsv() {
    const rows = [
      ['Name', 'Category', 'Date', 'Amount'],
      ...expenses.map(x => [x.e.name, catLabel(x.e.category), x.e.date.split('T')[0], String(Math.round(x.e.amount))]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `expenses-report-${period.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Expense"
        titleEm="report"
        subtitle="What was spent, by category and period."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Category" style={{ width: 'auto', height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All Categories">All Categories</SelectItem>
                {allCategories.map(c => <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={v => setPeriod(v as Period)}>
              <SelectTrigger aria-label="Period" style={{ width: 'auto', height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { label: `Total Expenses (${period})`, value: fmtM(totalExpenses),      icon: 'receipt',  color: 'var(--red)',    bg: 'var(--red-l)' },
            { label: 'Largest Category',            value: largestCategory,          icon: 'package',  color: 'var(--purple)', bg: 'var(--purple-l)' },
            { label: 'This Month',                  value: fmtM(thisMonthTotal),      icon: 'calendar', color: 'var(--blue)',   bg: 'var(--blue-l)' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon as IconName} size={18} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {/* Monthly chart */}
          <div style={{ flex: 2 }}>
          <SectionCard title="Monthly Expenses">
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 16 }}>{period}</div>
            <BarChart labels={monthLabels} values={monthlyTotals} color="var(--red)" />
          </SectionCard>
          </div>

          {/* Category breakdown */}
          <div style={{ flex: 1 }}>
          <SectionCard padded={false} title="By Category">
            <div style={{ padding: '4px 0' }}>
              {categoryBreakdown.length === 0 ? (
                <div style={{ padding: '20px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>No expenses in this period</div>
              ) : categoryBreakdown.map(([cat, amt]) => {
                const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
                const color = catColor(cat);
                return (
                  <div key={cat} style={{ padding: '9px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 500 }}>{catLabel(cat)}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
          </div>
        </div>

        {/* Table Container Card */}
        <SectionCard padded={false} title={`Expense Details (${expenses.length})`}>
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Name', 'Category', 'Date', 'Amount'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</td></tr>
              ) : loadError ? (
                <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--red)' }}>{loadError}</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)' }}>No expenses in this period.</td></tr>
              ) : pagedExpenses.map((x, i) => (
                <tr key={x.e.id} style={{ borderBottom: i < pagedExpenses.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500 }}>{x.e.name}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: catColor(x.e.category), background: catColor(x.e.category) + '1a', borderRadius: 5, padding: '2px 7px' }}>{catLabel(x.e.category)}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{x.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(x.e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          {/* Pagination Controls */}
          {expenses.length > PAGE_SIZE && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: 'var(--white)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                Showing <strong>{offset + 1}–{Math.min(offset + PAGE_SIZE, expenses.length)}</strong> of <strong>{expenses.length}</strong> expenses
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={pagerBtn(currentPage <= 1)}
                >
                  <Icon name="chevronLeft" size={13} /> Previous
                </button>
                <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, padding: '0 6px' }}>
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  style={pagerBtn(currentPage >= pageCount)}
                >
                  Next <Icon name="chevronRight" size={13} />
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
