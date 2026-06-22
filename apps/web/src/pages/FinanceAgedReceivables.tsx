import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmtFull = (n: number) => n > 0 ? `TZS ${n.toLocaleString()}` : '—';

const CUSTOMERS = [
  { name: 'Simba Logistics Ltd',      current: 0,       d30: 0,       d60: 0,        d90: 0,        over90: 0,       total: 0        },
  { name: 'Kilimanjaro Trading Co.',  current: 1720000, d30: 0,       d60: 0,        d90: 0,        over90: 0,       total: 1720000  },
  { name: 'Dar Freight Solutions',    current: 0,       d30: 3100000, d60: 0,        d90: 0,        over90: 0,       total: 3100000  },
  { name: 'Zanzibar Export Bureau',   current: 850000,  d30: 0,       d60: 420000,   d90: 0,        over90: 0,       total: 1270000  },
  { name: 'Mombasa Gate Clearers',    current: 740000,  d30: 0,       d60: 0,        d90: 0,        over90: 0,       total: 740000   },
  { name: 'TanzaPort Logistics',      current: 0,       d30: 0,       d60: 2200000,  d90: 0,        over90: 0,       total: 2200000  },
  { name: 'Nairobi Express Cargo',    current: 660000,  d30: 0,       d60: 0,        d90: 660000,   over90: 0,       total: 1320000  },
  { name: 'Arusha Port Agents',       current: 0,       d30: 0,       d60: 0,        d90: 540000,   over90: 0,       total: 540000   },
  { name: 'Ocean Bridge Clearing',    current: 0,       d30: 0,       d60: 0,        d90: 0,        over90: 320000,  total: 320000   },
  { name: 'Dodoma Trade Solutions',   current: 420000,  d30: 0,       d60: 0,        d90: 0,        over90: 180000,  total: 600000   },
];

export const FinanceAgedReceivables: React.FC = () => {
  const [asOf] = useState('13 Jun 2026');

  const totals = {
    current: CUSTOMERS.reduce((a, b) => a + b.current, 0),
    d30:     CUSTOMERS.reduce((a, b) => a + b.d30, 0),
    d60:     CUSTOMERS.reduce((a, b) => a + b.d60, 0),
    d90:     CUSTOMERS.reduce((a, b) => a + b.d90, 0),
    over90:  CUSTOMERS.reduce((a, b) => a + b.over90, 0),
    total:   CUSTOMERS.reduce((a, b) => a + b.total, 0),
  };

  const overdue = totals.d30 + totals.d60 + totals.d90 + totals.over90;

  function riskBadge(row: typeof CUSTOMERS[0]) {
    if (row.over90 > 0) return { label: 'High Risk', color: 'var(--red)', bg: '#fef2f2' };
    if (row.d90 > 0)    return { label: 'At Risk',   color: '#f59e0b',    bg: '#fffbeb' };
    if (row.d60 > 0)    return { label: 'Overdue',   color: 'var(--red)', bg: '#fef2f2' };
    if (row.d30 > 0)    return { label: 'Due',       color: '#f59e0b',    bg: '#fffbeb' };
    if (row.current > 0)return { label: 'Current',   color: 'var(--green)', bg: '#f0fdf4' };
    return                       { label: 'Cleared',  color: 'var(--ink3)', bg: 'var(--bg)' };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Aged Receivables</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Outstanding customer balances by age — as of {asOf}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Outstanding',   value: `TZS ${(totals.total / 1_000_000).toFixed(1)}M`,  color: 'var(--blue)',  bg: '#eff6ff',       icon: 'dollarSign'   },
            { label: 'Current (not due)',    value: `TZS ${(totals.current / 1_000_000).toFixed(1)}M`, color: 'var(--green)', bg: '#f0fdf4',       icon: 'checkCircle'  },
            { label: 'Total Overdue',        value: `TZS ${(overdue / 1_000_000).toFixed(1)}M`,       color: 'var(--red)',   bg: '#fef2f2',       icon: 'alertTriangle'},
            { label: '90+ Days Overdue',     value: `TZS ${(totals.over90 / 1_000_000).toFixed(1)}M`, color: '#f59e0b',      bg: '#fffbeb',       icon: 'clock'        },
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

        {/* Aging bars summary */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Aging Distribution</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Current',   value: totals.current, color: 'var(--green)'  },
              { label: '1–30 Days', value: totals.d30,     color: '#f59e0b'       },
              { label: '31–60 Days',value: totals.d60,     color: 'var(--red)'    },
              { label: '61–90 Days',value: totals.d90,     color: 'var(--red)'    },
              { label: '90+ Days',  value: totals.over90,  color: '#7c3aed'       },
            ].map(band => {
              const pct = totals.total > 0 ? Math.round((band.value / totals.total) * 100) : 0;
              return (
                <div key={band.label} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 500 }}>{band.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: band.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 4, fontFamily: 'var(--mono)' }}>{fmtFull(band.value)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Aging table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Customer Aging Detail</span>
          </div>
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Customer', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'Total', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CUSTOMERS.map((c, i) => {
                  const badge = riskBadge(c);
                  return (
                    <tr key={c.name} style={{ borderBottom: i < CUSTOMERS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--green)',  fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.current)}</td>
                      <td style={{ padding: '10px 16px', color: '#f59e0b',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.d30)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.d60)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.d90)}</td>
                      <td style={{ padding: '10px 16px', color: '#7c3aed',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.over90)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)',    fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(c.total)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 5, padding: '2px 7px' }}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--bg)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total</td>
                  <td style={{ padding: '10px 16px', color: 'var(--green)',  fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.current)}</td>
                  <td style={{ padding: '10px 16px', color: '#f59e0b',       fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.d30)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--red)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.d60)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--red)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.d90)}</td>
                  <td style={{ padding: '10px 16px', color: '#7c3aed',       fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.over90)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)',    fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totals.total)}</td>
                  <td style={{ borderTop: '2px solid var(--border)' }} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
