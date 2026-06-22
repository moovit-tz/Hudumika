import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmtFull = (n: number) => `TZS ${n.toLocaleString()}`;
const fmtM    = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;

const YEARS = ['2026', '2025', '2024'];

const ROWS = [
  { month: 'January',  open: 4200000,  cashIn: 8200000,  cashOut: 3100000,  net:  5100000  },
  { month: 'February', open: 9300000,  cashIn: 9100000,  cashOut: 3800000,  net:  5300000  },
  { month: 'March',    open: 14600000, cashIn: 11400000, cashOut: 4200000,  net:  7200000  },
  { month: 'April',    open: 21800000, cashIn: 10800000, cashOut: 3900000,  net:  6900000  },
  { month: 'May',      open: 28700000, cashIn: 13200000, cashOut: 4800000,  net:  8400000  },
  { month: 'June',     open: 37100000, cashIn: 12600000, cashOut: 4100000,  net:  8500000  },
];

export const FinanceCashFlow: React.FC = () => {
  const [year, setYear] = useState('2026');

  const totalIn  = ROWS.reduce((a, b) => a + b.cashIn, 0);
  const totalOut = ROWS.reduce((a, b) => a + b.cashOut, 0);
  const totalNet = ROWS.reduce((a, b) => a + b.net, 0);
  const closing  = ROWS[ROWS.length - 1].open + ROWS[ROWS.length - 1].net;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Cash Flow Statement</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Monthly cash inflows and outflows</div>
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

        {/* Summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Cash In',  value: fmtM(totalIn),  color: 'var(--teal)',  bg: 'var(--teal-l)', icon: 'trendingUp'   },
            { label: 'Total Cash Out', value: fmtM(totalOut), color: 'var(--red)',   bg: '#fef2f2',       icon: 'trendingDown' },
            { label: 'Net Cash Flow',  value: fmtM(totalNet), color: 'var(--green)', bg: '#f0fdf4',       icon: 'activity'     },
            { label: 'Closing Balance',value: fmtM(closing),  color: 'var(--blue)',  bg: '#eff6ff',       icon: 'dollarSign'   },
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

        {/* Cash Flow table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Monthly Cash Flow — {year}</span>
          </div>
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Month', 'Opening Balance', 'Cash Inflows', 'Cash Outflows', 'Net Change', 'Closing Balance'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => {
                const close = row.open + row.net;
                return (
                  <tr key={row.month} style={{ borderBottom: i < ROWS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600 }}>{row.month} {year}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{fmtFull(row.open)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{fmtFull(row.cashIn)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{fmtFull(row.cashOut)}</td>
                    <td style={{ padding: '10px 16px', color: row.net >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'var(--mono)' }}>+{fmtFull(row.net)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmtFull(close)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--bg)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total {year}</td>
                <td style={{ padding: '10px 16px', borderTop: '2px solid var(--border)' }} />
                <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalIn)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--red)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalOut)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--green)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>+{fmtFull(totalNet)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(closing)}</td>
              </tr>
            </tbody>
          </table></div>
        </div>

        {/* Breakdown note */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Cash Inflow Sources — YTD</div>
          <div style={{ display: 'flex', gap: 14 }}>
            {[
              { label: 'Invoice Payments',   pct: 68, color: 'var(--teal)'   },
              { label: 'Advance Deposits',   pct: 18, color: 'var(--blue)'   },
              { label: 'Duty Reimbursements',pct:  9, color: 'var(--purple)' },
              { label: 'Other Income',       pct:  5, color: '#f59e0b'       },
            ].map(s => (
              <div key={s.label} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink2)' }}>{s.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{s.pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
