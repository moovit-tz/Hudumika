import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmtM = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;
const fmtFull = (n: number) => `TZS ${n.toLocaleString()}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INCOME   = [8200000, 9100000, 11400000, 10800000, 13200000, 12600000, 0, 0, 0, 0, 0, 0];
const EXPENSES = [3100000, 3800000,  4200000,  3900000,  4800000,  4100000, 0, 0, 0, 0, 0, 0];

function GroupedBarChart({ labels, income, expenses }: {
  labels: string[]; income: number[]; expenses: number[];
}) {
  const maxVal = Math.max(...income, ...expenses, 1);
  const active = labels.filter((_, i) => income[i] > 0 || expenses[i] > 0);
  const activeIncome   = income.filter(v => v > 0);
  const activeExpenses = expenses.filter(v => v > 0);

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

const YEARS = ['2026', '2025', '2024'];

export const FinanceIncomeVsExpenses: React.FC = () => {
  const [year, setYear] = useState('2026');

  const totalIncome   = INCOME.reduce((a, b) => a + b, 0);
  const totalExpenses = EXPENSES.reduce((a, b) => a + b, 0);
  const netProfit     = totalIncome - totalExpenses;
  const profitMargin  = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : '0.0';

  const monthlyRows = MONTHS.filter((_, i) => INCOME[i] > 0 || EXPENSES[i] > 0).map((m, i) => ({
    month: m,
    income:  INCOME[i],
    expense: EXPENSES[i],
    net:     INCOME[i] - EXPENSES[i],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Income vs Expenses</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Comparative revenue and cost analysis</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Income',   value: fmtM(totalIncome),   color: 'var(--teal)',   bg: 'var(--teal-l)', icon: 'trendingUp'  },
            { label: 'Total Expenses', value: fmtM(totalExpenses), color: 'var(--red)',    bg: '#fef2f2',       icon: 'trendingDown' },
            { label: 'Net Profit',     value: fmtM(netProfit),     color: 'var(--green)',  bg: '#f0fdf4',       icon: 'dollarSign'  },
            { label: 'Profit Margin',  value: `${profitMargin}%`,  color: 'var(--purple)', bg: '#f5f3ff',       icon: 'percent'     },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon} size={18} color={s.color} />
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
          <GroupedBarChart labels={MONTHS} income={INCOME} expenses={EXPENSES} />
        </div>

        {/* Monthly breakdown table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Monthly Breakdown</span>
          </div>
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
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
                          <div style={{ height: '100%', width: `${Math.min(100, parseFloat(margin))}%`, background: 'var(--green)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{margin}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
    </div>
  );
};
