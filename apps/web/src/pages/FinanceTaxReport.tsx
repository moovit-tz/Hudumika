import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmtFull = (n: number) => `TZS ${n.toLocaleString()}`;

const TAX_SUMMARY = [
  { name: 'Value Added Tax (VAT)',      rate: 18, taxableAmt: 14800000, taxAmt: 2664000, invoices: 24 },
  { name: 'Withholding Tax (WHT-5%)',   rate:  5, taxableAmt:  6200000, taxAmt:  310000, invoices: 12 },
  { name: 'Withholding Tax (WHT-10%)', rate: 10, taxableAmt:  4100000, taxAmt:  410000, invoices:  7 },
  { name: 'Customs Excise Duty',        rate:  0, taxableAmt:  9800000, taxAmt:  735000, invoices: 18 },
  { name: 'PAYE (Employee Tax)',         rate:  0, taxableAmt:  5500000, taxAmt:  950000, invoices:  6 },
];

const TRANSACTIONS = [
  { ref: 'INV-2024', client: 'Simba Logistics Ltd',    date: '10 Jun 2026', taxType: 'VAT',     taxable: 2415254, taxAmt: 434745, rate: 18 },
  { ref: 'INV-2022', client: 'Dar Freight Solutions',  date: '05 Jun 2026', taxType: 'VAT',     taxable: 2627119, taxAmt: 472881, rate: 18 },
  { ref: 'INV-2020', client: 'Mombasa Gate Clearers',  date: '01 Jun 2026', taxType: 'WHT-5%',  taxable: 1480000, taxAmt:  74000, rate:  5 },
  { ref: 'INV-2019', client: 'TanzaPort Logistics',    date: '28 May 2026', taxType: 'VAT',     taxable: 1864407, taxAmt: 335593, rate: 18 },
  { ref: 'INV-2018', client: 'East Africa Freight',    date: '25 May 2026', taxType: 'WHT-10%', taxable: 1650000, taxAmt: 165000, rate: 10 },
  { ref: 'INV-2016', client: 'Nairobi Express Cargo',  date: '18 May 2026', taxType: 'VAT',     taxable: 1118644, taxAmt: 201356, rate: 18 },
  { ref: 'INV-2015', client: 'Arusha Port Agents',     date: '14 May 2026', taxType: 'WHT-5%',  taxable:  540000, taxAmt:  27000, rate:  5 },
  { ref: 'INV-2014', client: 'Ocean Bridge Clearing',  date: '10 May 2026', taxType: 'VAT',     taxable:  737288, taxAmt: 132712, rate: 18 },
];

const TAX_COLORS: Record<string, { color: string; bg: string }> = {
  'VAT':     { color: 'var(--blue)',   bg: '#eff6ff' },
  'WHT-5%':  { color: '#f59e0b',      bg: '#fffbeb' },
  'WHT-10%': { color: 'var(--purple)', bg: '#f5f3ff' },
};

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year', 'Last Year'];

export const FinanceTaxReport: React.FC = () => {
  const [period, setPeriod] = useState('This Year');

  const totalTaxable = TAX_SUMMARY.reduce((a, b) => a + b.taxableAmt, 0);
  const totalTax     = TAX_SUMMARY.reduce((a, b) => a + b.taxAmt, 0);
  const totalInv     = TAX_SUMMARY.reduce((a, b) => a + b.invoices, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Tax Report</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>VAT, withholding tax and customs duty summary</div>
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
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Taxable Amount', value: fmtFull(totalTaxable), icon: 'dollarSign', color: 'var(--blue)',   bg: '#eff6ff' },
            { label: 'Total Tax Collected',  value: fmtFull(totalTax),     icon: 'percent',    color: 'var(--teal)',   bg: 'var(--teal-l)' },
            { label: 'Effective Tax Rate',   value: `${((totalTax / totalTaxable) * 100).toFixed(1)}%`, icon: 'barChart2', color: '#f59e0b', bg: '#fffbeb' },
            { label: 'Taxable Transactions', value: String(totalInv),      icon: 'file',       color: 'var(--purple)', bg: '#f5f3ff' },
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

        {/* Tax by type table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tax Summary by Type</span>
          </div>
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Tax Name', 'Rate', 'Taxable Amount', 'Tax Collected', 'Invoices', 'Share'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TAX_SUMMARY.map((row, i) => {
                const share = ((row.taxAmt / totalTax) * 100).toFixed(1);
                return (
                  <tr key={row.name} style={{ borderBottom: i < TAX_SUMMARY.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{row.rate > 0 ? `${row.rate}%` : 'Variable'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{fmtFull(row.taxableAmt)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmtFull(row.taxAmt)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', textAlign: 'center' }}>{row.invoices}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${share}%`, background: 'var(--teal)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{share}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--bg)' }}>
                <td colSpan={2} style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalTaxable)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalTax)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 800, textAlign: 'center', borderTop: '2px solid var(--border)' }}>{totalInv}</td>
                <td style={{ padding: '10px 16px', borderTop: '2px solid var(--border)' }} />
              </tr>
            </tbody>
          </table></div>
        </div>

        {/* Transaction detail table */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Taxable Transactions</span>
          </div>
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Reference', 'Client', 'Date', 'Tax Type', 'Taxable Amount', 'Tax Amount', 'Rate'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRANSACTIONS.map((tx, i) => {
                const tc = TAX_COLORS[tx.taxType] ?? { color: 'var(--ink3)', bg: 'var(--bg)' };
                return (
                  <tr key={tx.ref} style={{ borderBottom: i < TRANSACTIONS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 11 }}>{tx.ref}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 500 }}>{tx.client}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: tc.color, background: tc.bg, borderRadius: 5, padding: '2px 7px' }}>{tx.taxType}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(tx.taxable)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtFull(tx.taxAmt)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{tx.rate > 0 ? `${tx.rate}%` : 'Var'}</td>
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
