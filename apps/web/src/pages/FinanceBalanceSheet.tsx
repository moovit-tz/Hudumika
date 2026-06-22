import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

const fmt = (n: number) => `TZS ${n.toLocaleString()}`;

interface LineItem { label: string; amount: number; sub?: boolean; bold?: boolean; separator?: boolean }

const ASSETS: LineItem[] = [
  { label: 'Current Assets',                  amount: 0,          bold: true },
  { label: 'Cash and Cash Equivalents',        amount: 45600000,   sub: true  },
  { label: 'Accounts Receivable',              amount: 11810000,   sub: true  },
  { label: 'Advance Payments to Suppliers',    amount: 3200000,    sub: true  },
  { label: 'Prepaid Expenses',                 amount: 850000,     sub: true  },
  { label: 'Tax Receivable (VAT Refund)',       amount: 920000,     sub: true  },
  { label: 'Total Current Assets',             amount: 62380000,   bold: true },
  { label: '',                                 amount: 0,          separator: true },
  { label: 'Non-Current Assets',               amount: 0,          bold: true },
  { label: 'Property & Equipment (net)',        amount: 12400000,   sub: true  },
  { label: 'Vehicles & Fleet (net)',            amount: 8700000,    sub: true  },
  { label: 'Office Furniture & Equipment',     amount: 1200000,    sub: true  },
  { label: 'Intangible Assets (Software)',     amount: 450000,     sub: true  },
  { label: 'Total Non-Current Assets',         amount: 22750000,   bold: true },
  { label: '',                                 amount: 0,          separator: true },
  { label: 'TOTAL ASSETS',                     amount: 85130000,   bold: true },
];

const LIABILITIES: LineItem[] = [
  { label: 'Current Liabilities',             amount: 0,          bold: true },
  { label: 'Accounts Payable (Suppliers)',     amount: 5695000,    sub: true  },
  { label: 'Customs Duties Payable',           amount: 2100000,    sub: true  },
  { label: 'VAT Payable',                      amount: 1840000,    sub: true  },
  { label: 'PAYE & Staff Levies Payable',      amount: 950000,     sub: true  },
  { label: 'Accrued Expenses',                 amount: 620000,     sub: true  },
  { label: 'Short-term Loan',                  amount: 3000000,    sub: true  },
  { label: 'Total Current Liabilities',        amount: 14205000,   bold: true },
  { label: '',                                 amount: 0,          separator: true },
  { label: 'Non-Current Liabilities',          amount: 0,          bold: true },
  { label: 'Long-term Bank Loan',              amount: 8500000,    sub: true  },
  { label: 'Deferred Tax Liability',           amount: 680000,     sub: true  },
  { label: 'Total Non-Current Liabilities',    amount: 9180000,    bold: true },
  { label: '',                                 amount: 0,          separator: true },
  { label: 'Equity',                           amount: 0,          bold: true },
  { label: 'Share Capital',                    amount: 20000000,   sub: true  },
  { label: 'Retained Earnings',                amount: 38545000,   sub: true  },
  { label: 'Profit for the Period',            amount: 3200000,    sub: true  },
  { label: 'Total Equity',                     amount: 61745000,   bold: true },
  { label: '',                                 amount: 0,          separator: true },
  { label: 'TOTAL LIABILITIES & EQUITY',       amount: 85130000,   bold: true },
];

function StatementSection({ rows, highlight }: { rows: LineItem[]; highlight: string }) {
  return (
    <div>
      {rows.map((row, i) => {
        if (row.separator) return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: row.bold ? '10px 0' : '7px 0',
            paddingLeft: row.sub ? 20 : 0,
            borderBottom: row.bold && !row.label.startsWith('TOTAL') ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{
              fontSize: row.bold ? 13 : 12,
              fontWeight: row.bold ? 700 : 400,
              color: row.label.startsWith('TOTAL') ? highlight : row.bold ? 'var(--ink)' : 'var(--ink2)',
            }}>
              {row.label}
            </span>
            {row.amount > 0 && (
              <span style={{
                fontSize: row.bold ? 13 : 12,
                fontWeight: row.bold ? 700 : 400,
                color: row.label.startsWith('TOTAL') ? highlight : row.bold ? 'var(--ink)' : 'var(--ink2)',
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

const AS_OF_OPTIONS = ['13 Jun 2026', '31 Mar 2026', '31 Dec 2025', '30 Sep 2025'];

export const FinanceBalanceSheet: React.FC = () => {
  const [asOf, setAsOf] = useState('13 Jun 2026');

  const totalAssets = 85130000;
  const totalLiabilities = 14205000 + 9180000;
  const totalEquity = 61745000;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Balance Sheet</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Statement of financial position</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={asOf} onChange={e => setAsOf(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {AS_OF_OPTIONS.map(d => <option key={d}>{d}</option>)}
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
            { label: 'Total Assets',              value: fmt(totalAssets),      color: 'var(--teal)',  bg: 'var(--teal-l)', icon: 'layers'      },
            { label: 'Total Liabilities',         value: fmt(totalLiabilities), color: 'var(--red)',   bg: '#fef2f2',       icon: 'receipt'     },
            { label: 'Total Equity',              value: fmt(totalEquity),      color: 'var(--green)', bg: '#f0fdf4',       icon: 'dollarSign'  },
            { label: 'Debt to Equity Ratio',      value: `${(totalLiabilities / totalEquity).toFixed(2)}x`, color: 'var(--blue)', bg: '#eff6ff', icon: 'barChart2' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon} size={18} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Statement */}
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Assets */}
          <div style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assets</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>As of {asOf}</span>
            </div>
            <div style={{ padding: '8px 20px 16px' }}>
              <StatementSection rows={ASSETS} highlight="var(--teal)" />
            </div>
          </div>

          {/* Liabilities & Equity */}
          <div style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liabilities &amp; Equity</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>As of {asOf}</span>
            </div>
            <div style={{ padding: '8px 20px 16px' }}>
              <StatementSection rows={LIABILITIES} highlight="var(--blue)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
