import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmtM = (n: number) => `TZS ${(n / 1_000_000).toFixed(1)}M`;
const fmtFull = (n: number) => `TZS ${n.toLocaleString()}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const MONTHLY = [8200000, 9100000, 11400000, 10800000, 13200000, 12600000];

const INVOICES = [
  { id: 'INV-2024', client: 'Simba Logistics Ltd',      date: '10 Jun 2026', due: '25 Jun 2026', total: 2850000, dueAmt: 0,       status: 'Paid'    },
  { id: 'INV-2023', client: 'Kilimanjaro Trading Co.',   date: '08 Jun 2026', due: '23 Jun 2026', total: 1720000, dueAmt: 1720000, status: 'Unpaid'  },
  { id: 'INV-2022', client: 'Dar Freight Solutions',     date: '05 Jun 2026', due: '20 Jun 2026', total: 3100000, dueAmt: 3100000, status: 'Overdue' },
  { id: 'INV-2021', client: 'Zanzibar Export Bureau',    date: '03 Jun 2026', due: '18 Jun 2026', total: 950000,  dueAmt: 0,       status: 'Paid'    },
  { id: 'INV-2020', client: 'Mombasa Gate Clearers',     date: '01 Jun 2026', due: '16 Jun 2026', total: 1480000, dueAmt: 740000,  status: 'Partial' },
  { id: 'INV-2019', client: 'TanzaPort Logistics',       date: '28 May 2026', due: '12 Jun 2026', total: 2200000, dueAmt: 2200000, status: 'Overdue' },
  { id: 'INV-2018', client: 'East Africa Freight Ltd',   date: '25 May 2026', due: '09 Jun 2026', total: 1650000, dueAmt: 0,       status: 'Paid'    },
  { id: 'INV-2017', client: 'Ocean Bridge Clearing',     date: '22 May 2026', due: '06 Jun 2026', total: 870000,  dueAmt: 0,       status: 'Paid'    },
  { id: 'INV-2016', client: 'Nairobi Express Cargo',     date: '18 May 2026', due: '02 Jun 2026', total: 1320000, dueAmt: 660000,  status: 'Partial' },
  { id: 'INV-2015', client: 'Arusha Port Agents',        date: '14 May 2026', due: '29 May 2026', total: 540000,  dueAmt: 540000,  status: 'Overdue' },
];

const SC: Record<string, { color: string; bg: string }> = {
  Paid:    { color: 'var(--green)', bg: '#f0fdf4' },
  Unpaid:  { color: '#f59e0b',     bg: '#fffbeb' },
  Overdue: { color: 'var(--red)',   bg: '#fef2f2' },
  Partial: { color: 'var(--blue)',  bg: '#eff6ff' },
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

export const FinanceSalesReport: React.FC = () => {
  const [period, setPeriod] = useState('This Year');

  const totalSales = MONTHLY.reduce((a, b) => a + b, 0);
  const paid   = INVOICES.filter(i => i.status === 'Paid').reduce((a, b) => a + b.total, 0);
  const unpaid = INVOICES.filter(i => i.status === 'Unpaid').reduce((a, b) => a + b.dueAmt, 0);
  const overdue = INVOICES.filter(i => i.status === 'Overdue').reduce((a, b) => a + b.dueAmt, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Sales Report</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Invoice income and payment status</div>
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

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Sales',   value: fmtM(totalSales), icon: 'trendingUp',    color: 'var(--teal)',   bg: 'var(--teal-l)' },
            { label: 'Total Paid',    value: fmtM(paid),       icon: 'checkCircle',   color: 'var(--green)', bg: '#f0fdf4'       },
            { label: 'Total Unpaid',  value: fmtM(unpaid),     icon: 'clock',         color: '#f59e0b',      bg: '#fffbeb'       },
            { label: 'Total Overdue', value: fmtM(overdue),    icon: 'alertTriangle', color: 'var(--red)',   bg: '#fef2f2'       },
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
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Monthly Sales Income</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 16 }}>{period}</div>
          <BarChart labels={MONTHS} values={MONTHLY} color="var(--teal)" />
        </div>

        {/* Table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Invoice Details</span>
          </div>
          <div className="rtbl-wrap" style={{ overflowX: 'auto' }}><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Invoice #', 'Client', 'Date', 'Due Date', 'Total', 'Amount Due', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((inv, i) => {
                const sc = SC[inv.status] ?? SC['Unpaid'];
                return (
                  <tr key={inv.id} style={{ borderBottom: i < INVOICES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 11 }}>{inv.id}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500 }}>{inv.client}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{inv.date}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{inv.due}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(inv.total)}</td>
                    <td style={{ padding: '10px 16px', color: inv.dueAmt > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: inv.dueAmt > 0 ? 600 : 400, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(inv.dueAmt)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, borderRadius: 5, padding: '2px 8px' }}>{inv.status}</span>
                    </td>
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
