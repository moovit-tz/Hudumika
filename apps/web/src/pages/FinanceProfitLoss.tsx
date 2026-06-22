import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmt = (n: number) => `TZS ${n.toLocaleString()}`;
const fmtM = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;

interface PLRow { label: string; amount: number; sub?: boolean; bold?: boolean; separator?: boolean; negative?: boolean }

const INCOME: PLRow[] = [
  { label: 'Revenue',                         amount: 0,         bold: true  },
  { label: 'Clearance & Declaration Fees',    amount: 21400000,  sub: true   },
  { label: 'Freight Forwarding Income',       amount: 18300000,  sub: true   },
  { label: 'Port Agency Services',            amount: 7200000,   sub: true   },
  { label: 'Document Handling Fees',          amount: 3100000,   sub: true   },
  { label: 'Warehousing & Storage Income',    amount: 2600000,   sub: true   },
  { label: 'Other Income',                    amount: 900000,    sub: true   },
  { label: 'Total Revenue',                   amount: 53500000,  bold: true  },
  { label: '',                                amount: 0,         separator: true },
];

const EXPENSES: PLRow[] = [
  { label: 'Cost of Revenue',                 amount: 0,         bold: true  },
  { label: 'Customs Duties Paid on Behalf',   amount: 9800000,   sub: true   },
  { label: 'Port & Terminal Charges',         amount: 4800000,   sub: true   },
  { label: 'Ocean Freight Costs',             amount: 6100000,   sub: true   },
  { label: 'Total Cost of Revenue',           amount: 20700000,  bold: true  },
  { label: '',                                amount: 0,         separator: true },
  { label: 'Gross Profit',                    amount: 32800000,  bold: true  },
  { label: '',                                amount: 0,         separator: true },
  { label: 'Operating Expenses',              amount: 0,         bold: true  },
  { label: 'Staff Salaries & Benefits',       amount: 8400000,   sub: true   },
  { label: 'Vehicle Running Costs',           amount: 1900000,   sub: true   },
  { label: 'Office Rent & Utilities',         amount: 1800000,   sub: true   },
  { label: 'IT Systems & Software',           amount: 620000,    sub: true   },
  { label: 'Marketing & Business Dev',        amount: 480000,    sub: true   },
  { label: 'Professional Fees',               amount: 350000,    sub: true   },
  { label: 'Insurance',                       amount: 290000,    sub: true   },
  { label: 'Total Operating Expenses',        amount: 13840000,  bold: true  },
  { label: '',                                amount: 0,         separator: true },
  { label: 'Operating Profit (EBIT)',         amount: 18960000,  bold: true  },
  { label: '',                                amount: 0,         separator: true },
  { label: 'Finance Costs',                   amount: 0,         bold: true  },
  { label: 'Loan Interest',                   amount: 680000,    sub: true   },
  { label: 'Bank Charges',                    amount: 120000,    sub: true   },
  { label: 'Total Finance Costs',             amount: 800000,    bold: true  },
  { label: '',                                amount: 0,         separator: true },
  { label: 'Tax',                             amount: 0,         bold: true  },
  { label: 'Corporation Tax (30%)',           amount: 4848000,   sub: true   },
  { label: '',                                amount: 0,         separator: true },
  { label: 'NET PROFIT AFTER TAX',            amount: 13312000,  bold: true  },
];

function PLSection({ rows, highlightColor }: { rows: PLRow[]; highlightColor: string }) {
  return (
    <div>
      {rows.map((row, i) => {
        if (row.separator) return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
        const isTotal = row.label.startsWith('Total') || row.label.startsWith('TOTAL') || row.label.startsWith('NET') || row.label.startsWith('Gross') || row.label.startsWith('Operating Profit');
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: row.bold ? '10px 0' : '7px 0',
            paddingLeft: row.sub ? 20 : 0,
          }}>
            <span style={{
              fontSize: row.bold ? 13 : 12,
              fontWeight: row.bold ? 700 : 400,
              color: isTotal ? highlightColor : row.bold ? 'var(--ink)' : 'var(--ink2)',
            }}>
              {row.label}
            </span>
            {row.amount > 0 && (
              <span style={{
                fontSize: row.bold ? 13 : 12,
                fontWeight: row.bold ? 700 : 400,
                color: isTotal ? highlightColor : row.sub ? 'var(--ink2)' : 'var(--ink)',
                fontFamily: 'var(--mono)',
              }}>
                {fmt(row.amount)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year (YTD)', 'Last Year'];

export const FinanceProfitLoss: React.FC = () => {
  const [period, setPeriod] = useState('This Year (YTD)');

  const revenue   = 53500000;
  const costOfRev = 20700000;
  const grossProfit = revenue - costOfRev;
  const netProfit = 13312000;
  const grossMargin = ((grossProfit / revenue) * 100).toFixed(1);
  const netMargin   = ((netProfit / revenue) * 100).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Profit &amp; Loss</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Income statement — freight &amp; customs clearing operations</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={period} onChange={e => setPeriod(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {PERIODS.map(p => <option key={p}>{p}</option>)}
          </select>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* KPI summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Revenue',   value: fmtM(revenue),       color: 'var(--teal)',   bg: 'var(--teal-l)', icon: 'trendingUp'   },
            { label: 'Gross Profit',    value: fmtM(grossProfit),   color: 'var(--blue)',   bg: '#eff6ff',       icon: 'dollarSign'   },
            { label: 'Net Profit',      value: fmtM(netProfit),     color: 'var(--green)',  bg: '#f0fdf4',       icon: 'checkCircle'  },
            { label: 'Gross Margin',    value: `${grossMargin}%`,   color: '#f59e0b',       bg: '#fffbeb',       icon: 'percent'      },
            { label: 'Net Margin',      value: `${netMargin}%`,     color: 'var(--purple)', bg: '#f5f3ff',       icon: 'pieChart'     },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon} size={16} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* P&L Statement */}
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Income</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>{period}</span>
            </div>
            <div style={{ padding: '8px 20px 16px' }}>
              <PLSection rows={INCOME} highlightColor="var(--teal)" />
            </div>
          </div>

          <div style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Costs &amp; Profit</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>{period}</span>
            </div>
            <div style={{ padding: '8px 20px 16px' }}>
              <PLSection rows={EXPENSES} highlightColor="var(--green)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
