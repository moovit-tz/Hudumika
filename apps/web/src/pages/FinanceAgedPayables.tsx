import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmtFull = (n: number) => n > 0 ? `TZS ${n.toLocaleString()}` : '—';

const SUPPLIERS = [
  { name: 'Maersk Tanzania Ltd',         current: 0,       d30: 0,        d60: 0,        d90: 0,       over90: 0,      total: 0        },
  { name: 'DHL Express EA',              current: 850000,  d30: 0,        d60: 0,        d90: 0,       over90: 0,      total: 850000   },
  { name: 'TPA (Dar Port Authority)',    current: 0,       d30: 480000,   d60: 0,        d90: 0,       over90: 0,      total: 480000   },
  { name: 'TRA (Revenue Authority)',     current: 1200000, d30: 0,        d60: 0,        d90: 0,       over90: 0,      total: 1200000  },
  { name: 'MSC Mediterranean Shipping', current: 0,       d30: 0,        d60: 1100000,  d90: 0,       over90: 0,      total: 1100000  },
  { name: 'Zanzibar Port Corp',          current: 290000,  d30: 0,        d60: 0,        d90: 0,       over90: 0,      total: 290000   },
  { name: 'Kenya Revenue Authority',     current: 0,       d30: 0,        d60: 0,        d90: 620000,  over90: 0,      total: 620000   },
  { name: 'TAZARA Rail Freight',         current: 0,       d30: 0,        d60: 0,        d90: 0,       over90: 240000, total: 240000   },
  { name: 'Freight Logistics Kenya',     current: 420000,  d30: 0,        d60: 310000,   d90: 0,       over90: 0,      total: 730000   },
  { name: 'Mombasa Port Services',       current: 0,       d30: 185000,   d60: 0,        d90: 0,       over90: 0,      total: 185000   },
];

export const FinanceAgedPayables: React.FC = () => {
  const [asOf] = useState('13 Jun 2026');

  const totals = {
    current: SUPPLIERS.reduce((a, b) => a + b.current, 0),
    d30:     SUPPLIERS.reduce((a, b) => a + b.d30, 0),
    d60:     SUPPLIERS.reduce((a, b) => a + b.d60, 0),
    d90:     SUPPLIERS.reduce((a, b) => a + b.d90, 0),
    over90:  SUPPLIERS.reduce((a, b) => a + b.over90, 0),
    total:   SUPPLIERS.reduce((a, b) => a + b.total, 0),
  };

  const overdue = totals.d30 + totals.d60 + totals.d90 + totals.over90;

  function urgencyBadge(row: typeof SUPPLIERS[0]) {
    if (row.over90 > 0) return { label: 'Urgent',   color: 'var(--red)',   bg: '#fef2f2' };
    if (row.d90 > 0)    return { label: 'Overdue',  color: 'var(--red)',   bg: '#fef2f2' };
    if (row.d60 > 0)    return { label: 'Late',     color: '#f59e0b',      bg: '#fffbeb' };
    if (row.d30 > 0)    return { label: 'Due Soon', color: '#f59e0b',      bg: '#fffbeb' };
    if (row.current > 0)return { label: 'Current',  color: 'var(--green)', bg: '#f0fdf4' };
    return                       { label: 'Cleared', color: 'var(--ink3)', bg: 'var(--bg)' };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Aged Payables</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Outstanding supplier balances by age — as of {asOf}</div>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="download" size={13} /> Export
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Payable',     value: `TZS ${(totals.total / 1_000_000).toFixed(1)}M`,  color: 'var(--blue)',  bg: '#eff6ff',       icon: 'dollarSign'   },
            { label: 'Current',           value: `TZS ${(totals.current / 1_000_000).toFixed(1)}M`, color: 'var(--green)', bg: '#f0fdf4',       icon: 'checkCircle'  },
            { label: 'Total Overdue',     value: `TZS ${(overdue / 1_000_000).toFixed(1)}M`,        color: 'var(--red)',   bg: '#fef2f2',       icon: 'alertTriangle'},
            { label: '90+ Days',          value: `TZS ${(totals.over90 / 1_000_000).toFixed(1)}M`,  color: '#7c3aed',      bg: '#f5f3ff',       icon: 'clock'        },
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

        {/* Aging distribution */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Aging Distribution</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Current',    value: totals.current, color: 'var(--green)'  },
              { label: '1–30 Days',  value: totals.d30,     color: '#f59e0b'       },
              { label: '31–60 Days', value: totals.d60,     color: 'var(--red)'    },
              { label: '61–90 Days', value: totals.d90,     color: 'var(--red)'    },
              { label: '90+ Days',   value: totals.over90,  color: '#7c3aed'       },
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

        {/* Table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Supplier Aging Detail</span>
          </div>
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Supplier', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'Total', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SUPPLIERS.map((s, i) => {
                  const badge = urgencyBadge(s);
                  return (
                    <tr key={s.name} style={{ borderBottom: i < SUPPLIERS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--green)',  fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.current)}</td>
                      <td style={{ padding: '10px 16px', color: '#f59e0b',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.d30)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.d60)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--red)',    fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.d90)}</td>
                      <td style={{ padding: '10px 16px', color: '#7c3aed',       fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.over90)}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink)',    fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(s.total)}</td>
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
