import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { CashFlowReport } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';

const YEARS = ['2026', '2025', '2024'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function monthRangeInYear(year: number, monthIndex: number) {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

interface MonthRow { month: string; open: number; cashIn: number; cashOut: number; net: number; close: number }

export const FinanceCashFlow: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmtFull = (n: number) => `${cur} ${n.toLocaleString()}`;
  const fmtM = (n: number) => `${cur} ${(n / 1_000_000).toFixed(1)}M`;

  const [year, setYear] = useState('2026');
  const [rows, setRows] = useState<MonthRow[]>([]);
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
        return apiFetch(`/v1/finance/cash-flow?from=${from}&to=${to}`).then((res: CashFlowReport) => {
          const cashIn = res.items.filter(it => it.amount > 0).reduce((s, it) => s + it.amount, 0);
          const cashOut = -res.items.filter(it => it.amount < 0).reduce((s, it) => s + it.amount, 0);
          return {
            month: MONTH_NAMES[i],
            open: res.opening_cash,
            cashIn,
            cashOut,
            net: res.totals.net,
            close: res.closing_cash,
          } as MonthRow;
        });
      })
    )
      .then(monthRows => { if (alive) setRows(monthRows); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load cash flow'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year]);

  const totalIn = rows.reduce((a, b) => a + b.cashIn, 0);
  const totalOut = rows.reduce((a, b) => a + b.cashOut, 0);
  const totalNet = rows.reduce((a, b) => a + b.net, 0);
  const closing = rows.length ? rows[rows.length - 1].close : 0;

  const sourceBreakdown = useMemo(() => {
    const total = totalIn + totalOut || 1;
    return [
      { label: 'Cash Receipts from Customers', pct: Math.round((totalIn / total) * 100), color: 'var(--teal)' },
      { label: 'Cash Paid to Suppliers & Expenses', pct: Math.round((totalOut / total) * 100), color: 'var(--red)' },
    ];
  }, [totalIn, totalOut]);

  function exportCsv() {
    const csvRows = [
      ['Month', 'Opening', 'Cash In', 'Cash Out', 'Net', 'Closing'],
      ...rows.map(r => [r.month, String(r.open), String(r.cashIn), String(r.cashOut), String(r.net), String(r.close)]),
    ];
    const csv = csvRows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cash-flow-${year}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['FinOps', 'Cash Flow']}
        titlePlain="Cash"
        titleEm="flow"
        subtitle="Money in and out over the period."
      />

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Cash Flow Statement</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Monthly cash inflows and outflows</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger aria-label="Year" style={{ width: 'auto', height: 'auto', padding: '7px 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading cash flow…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Cash In',  value: fmtM(totalIn),  color: 'var(--teal)',  bg: 'var(--teal-l)', icon: 'trendingUp'   },
            { label: 'Total Cash Out', value: fmtM(totalOut), color: 'var(--red)',   bg: 'var(--red-l)',       icon: 'trendingDown' },
            { label: 'Net Cash Flow',  value: fmtM(totalNet), color: 'var(--green)', bg: 'var(--green-l)',       icon: 'activity'     },
            { label: 'Closing Balance',value: fmtM(closing),  color: 'var(--blue)',  bg: 'var(--blue-l)',       icon: 'dollarSign'   },
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
              {rows.map((row, i) => (
                <tr key={row.month} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 600 }}>{row.month} {year}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{fmtFull(row.open)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{fmtFull(row.cashIn)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{fmtFull(row.cashOut)}</td>
                  <td style={{ padding: '10px 16px', color: row.net >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{row.net >= 0 ? '+' : ''}{fmtFull(row.net)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmtFull(row.close)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>Total {year}</td>
                <td style={{ padding: '10px 16px', borderTop: '2px solid var(--border)' }} />
                <td style={{ padding: '10px 16px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalIn)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--red)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(totalOut)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--green)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{totalNet >= 0 ? '+' : ''}{fmtFull(totalNet)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink)', fontWeight: 800, fontFamily: 'var(--mono)', borderTop: '2px solid var(--border)' }}>{fmtFull(closing)}</td>
              </tr>
            </tbody>
          </table></div>
        </div>

        {/* Breakdown note */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Cash Movement Breakdown — {year}</div>
          <div style={{ display: 'flex', gap: 14 }}>
            {sourceBreakdown.map(s => (
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
      )}
    </div>
  );
};
