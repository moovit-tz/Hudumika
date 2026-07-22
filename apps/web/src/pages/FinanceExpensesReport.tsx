import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

const fmtM = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;
const fmtFull = (n: number) => `TZS ${n.toLocaleString()}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const MONTHLY = [3100000, 3800000, 4200000, 3900000, 4800000, 4100000];

const CATEGORIES = ['Customs Duties', 'Port Charges', 'Freight Costs', 'Staff Costs', 'Office & Admin', 'Vehicle & Fuel'];
const CAT_TOTALS = [6200000, 4800000, 5100000, 3900000, 1800000, 2100000];

const EXPENSES = [
  { id: 'EXP-0891', name: 'Dar Port Terminal Fee',      category: 'Port Charges',  date: '10 Jun 2026', amount: 480000,  tax: 86400,  total: 566400  },
  { id: 'EXP-0890', name: 'Customs Clearance Duty — Simba', category: 'Customs Duties', date: '09 Jun 2026', amount: 1200000, tax: 0,     total: 1200000 },
  { id: 'EXP-0889', name: 'Fuel — Fleet Vehicles',      category: 'Vehicle & Fuel', date: '08 Jun 2026', amount: 320000,  tax: 57600,  total: 377600  },
  { id: 'EXP-0888', name: 'Ocean Freight — Maersk',     category: 'Freight Costs',  date: '07 Jun 2026', amount: 850000,  tax: 0,      total: 850000  },
  { id: 'EXP-0887', name: 'Staff Salaries — June',      category: 'Staff Costs',    date: '05 Jun 2026', amount: 2200000, tax: 0,      total: 2200000 },
  { id: 'EXP-0886', name: 'Zanzibar Port Storage',      category: 'Port Charges',   date: '04 Jun 2026', amount: 290000,  tax: 52200,  total: 342200  },
  { id: 'EXP-0885', name: 'Office Rent — June',         category: 'Office & Admin', date: '01 Jun 2026', amount: 450000,  tax: 81000,  total: 531000  },
  { id: 'EXP-0884', name: 'Air Freight — DHL Express',  category: 'Freight Costs',  date: '30 May 2026', amount: 660000,  tax: 0,      total: 660000  },
  { id: 'EXP-0883', name: 'Customs Duty — Kilimanjaro', category: 'Customs Duties', date: '28 May 2026', amount: 980000,  tax: 0,      total: 980000  },
  { id: 'EXP-0882', name: 'Truck Maintenance',          category: 'Vehicle & Fuel', date: '25 May 2026', amount: 185000,  tax: 33300,  total: 218300  },
];

const CAT_COLORS: Record<string, string> = {
  'Customs Duties': 'var(--blue)',
  'Port Charges':   'var(--teal)',
  'Freight Costs':  'var(--purple)',
  'Staff Costs':    '#f59e0b',
  'Office & Admin': 'var(--green)',
  'Vehicle & Fuel': 'var(--red)',
};

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

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year', 'Last Year'];

export const FinanceExpensesReport: React.FC = () => {
  const [period, setPeriod] = useState('This Year');
  const [category, setCategory] = useState('All Categories');

  const totalExpenses = MONTHLY.reduce((a, b) => a + b, 0);
  const totalTax = EXPENSES.reduce((a, b) => a + b.tax, 0);
  const filtered = category === 'All Categories' ? EXPENSES : EXPENSES.filter(e => e.category === category);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Expenses Report</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Operational costs by category and period</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Category" style={{ width: 'auto', height: 'auto', padding: '7px 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All Categories">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger aria-label="Period" style={{ width: 'auto', height: 'auto', padding: '7px 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Expenses',   value: fmtM(totalExpenses),            icon: 'receipt',      color: 'var(--red)',    bg: '#fef2f2'       },
            { label: 'Total Tax Paid',   value: fmtFull(totalTax),              icon: 'percent',      color: '#f59e0b',       bg: '#fffbeb'       },
            { label: 'Largest Category', value: 'Freight Costs',                icon: 'package',      color: 'var(--purple)', bg: '#f5f3ff'       },
            { label: 'This Month',       value: fmtM(MONTHLY[MONTHLY.length-1]),icon: 'calendar',     color: 'var(--blue)',   bg: '#eff6ff'       },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon} size={18} color={s.color} />
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
          <div style={{ flex: 2, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Monthly Expenses</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 16 }}>{period}</div>
            <BarChart labels={MONTHS} values={MONTHLY} color="var(--red)" />
          </div>

          {/* Category breakdown */}
          <div style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>By Category</span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {CATEGORIES.map((cat, i) => {
                const total = CAT_TOTALS.reduce((a, b) => a + b, 0);
                const pct = Math.round((CAT_TOTALS[i] / total) * 100);
                const color = CAT_COLORS[cat] ?? 'var(--ink3)';
                return (
                  <div key={cat} style={{ padding: '9px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 500 }}>{cat}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Expense Details</span>
          </div>
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Expense #', 'Name', 'Category', 'Date', 'Net Amount', 'Tax', 'Total'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((exp, i) => {
                const catColor = CAT_COLORS[exp.category] ?? 'var(--ink3)';
                return (
                  <tr key={exp.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 11 }}>{exp.id}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500 }}>{exp.name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: catColor, background: catColor + '1a', borderRadius: 5, padding: '2px 7px' }}>{exp.category}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{exp.date}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(exp.amount)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{exp.tax > 0 ? fmtFull(exp.tax) : '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(exp.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
};
