import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { ProfitLossReport } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = ['2026', '2025', '2024'];

function monthRangeInYear(year: number, monthIndex: number) {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

function GroupedBarChart({ labels, income, expenses }: {
  labels: string[]; income: number[]; expenses: number[];
}) {
  const maxVal = Math.max(...income, ...expenses, 1);
  const active = labels.filter((_, i) => income[i] > 0 || expenses[i] > 0);
  const activeIncome   = income.filter((_, i) => income[i] > 0 || expenses[i] > 0);
  const activeExpenses = expenses.filter((_, i) => income[i] > 0 || expenses[i] > 0);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, paddingTop: 20 }}>
      {active.map((label, i) => (
        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
            <div style={{ flex: 1, maxWidth: 20, height: `${Math.max(4, (activeIncome[i] / maxVal) * 140)}px`, background: 'var(--teal)', borderRadius: '3px 3px 0 0' }} />
            <div style={{ flex: 1, maxWidth: 20, height: `${Math.max(4, (activeExpenses[i] / maxVal) * 140)}px`, background: 'var(--red)', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--ink3)', marginTop: 6 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

export const FinanceIncomeVsExpenses: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmtM = (n: number) => `${cur} ${(n / 1_000_000).toFixed(1)}M`;
  const fmtFull = (n: number) => `${cur} ${n.toLocaleString()}`;

  const [year, setYear] = useState('2026');
  const [income, setIncome] = useState<number[]>(Array(12).fill(0));
  const [expenses, setExpenses] = useState<number[]>(Array(12).fill(0));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const y = Number(year);
    Promise.all(
      Array.from({ length: 12 }, (_, i) => {
        const { from, to } = monthRangeInYear(y, i);
        return apiFetch(`/v1/finance/profit-loss?from=${from}&to=${to}`) as Promise<ProfitLossReport>;
      })
    )
      .then(reports => {
        if (!alive) return;
        setIncome(reports.map(r => r.totals.revenue));
        setExpenses(reports.map(r => r.totals.expenses));
      })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load income vs expenses'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year]);

  const totalIncome   = income.reduce((a, b) => a + b, 0);
  const totalExpenses = expenses.reduce((a, b) => a + b, 0);
  const netProfit     = totalIncome - totalExpenses;
  const profitMargin  = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : '0.0';

  const monthlyRows = MONTHS
    .map((m, i) => ({ month: m, income: income[i], expense: expenses[i], net: income[i] - expenses[i] }))
    .filter(row => row.income > 0 || row.expense > 0);

  function exportCsv() {
    const rows = [
      ['Month', 'Income', 'Expenses', 'Net'],
      ...monthlyRows.map(r => [r.month, String(r.income), String(r.expense), String(r.net)]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `income-vs-expenses-${year}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Income vs"
        titleEm="expenses"
        subtitle="Comparative revenue and cost analysis."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger aria-label="Year" style={{ width: 'auto', height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        }
      />

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading income vs expenses…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Income',   value: fmtM(totalIncome),   color: 'var(--teal)',   bg: 'var(--teal-l)', icon: 'trendingUp'  },
            { label: 'Total Expenses', value: fmtM(totalExpenses), color: 'var(--red)',    bg: 'var(--red-l)',       icon: 'trendingDown' },
            { label: 'Net Profit',     value: fmtM(netProfit),     color: 'var(--green)',  bg: 'var(--green-l)',       icon: 'dollarSign'  },
            { label: 'Profit Margin',  value: `${profitMargin}%`,  color: 'var(--purple)', bg: 'var(--purple-l)',       icon: 'percent'     },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon as IconName} size={18} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Monthly Comparison — {year}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Green = Income &nbsp;·&nbsp; Red = Expenses</div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--teal)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Income</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)', opacity: 0.85 }} />
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Expenses</span>
              </div>
            </div>
          </div>
          <GroupedBarChart labels={MONTHS} income={income} expenses={expenses} />
        </div>

        {/* Monthly breakdown table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Monthly Breakdown</span>
          </div>
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Month', 'Income', 'Expenses', 'Net Profit', 'Margin'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row, i) => {
                const margin = row.income > 0 ? ((row.net / row.income) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={row.month} style={{ borderBottom: i < monthlyRows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600 }}>{row.month} {year}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{fmtFull(row.income)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{fmtFull(row.expense)}</td>
                    <td style={{ padding: '10px 16px', color: row.net >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmtFull(row.net)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, parseFloat(margin)))}%`, background: 'var(--green)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{margin}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {monthlyRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--ink3)' }}>No activity for {year}.</td></tr>
              )}
              <tr style={{ background: 'var(--bg)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total {year}</td>
                <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalIncome)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--red)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalExpenses)}</td>
                <td style={{ padding: '10px 16px', color: netProfit >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(netProfit)}</td>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink2)', borderTop: '2px solid var(--border)' }}>{profitMargin}%</td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </div>
      )}
    </div>
  );
};
