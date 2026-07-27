import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { ProfitLossReport, ProfitLossLine } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

interface PLRow { label: string; amount: number; sub?: boolean; bold?: boolean; separator?: boolean }

function iso(d: Date) { return d.toISOString().split('T')[0]; }

function periodRange(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  switch (key) {
    case 'Last Month': {
      const start = new Date(y, now.getMonth() - 1, 1);
      const end = new Date(y, now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case 'This Quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: iso(new Date(y, qStartMonth, 1)), to: iso(now) };
    }
    case 'Last Year':
      return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    case 'This Year (YTD)':
      return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    case 'This Month':
    default:
      return { from: iso(new Date(y, now.getMonth(), 1)), to: iso(now) };
  }
}

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year (YTD)', 'Last Year'];

function buildIncomeRows(revenue: ProfitLossLine[], total: number): PLRow[] {
  const rows: PLRow[] = [{ label: 'Revenue', amount: 0, bold: true }];
  revenue.forEach(r => rows.push({ label: r.account_name, amount: r.amount, sub: true }));
  rows.push({ label: 'Total Revenue', amount: total, bold: true });
  rows.push({ label: '', amount: 0, separator: true });
  return rows;
}

function buildCostsProfitRows(revenueTotal: number, expenses: ProfitLossLine[]) {
  const cogs = expenses.filter(e => e.subtype === 'COST_OF_SERVICES');
  const opex = expenses.filter(e => e.subtype === 'OPERATING_EXPENSE' || e.subtype === 'ADMIN_EXPENSE');
  const finance = expenses.filter(e => e.subtype === 'FINANCE_COST');
  const other = expenses.filter(e => !['COST_OF_SERVICES', 'OPERATING_EXPENSE', 'ADMIN_EXPENSE', 'FINANCE_COST'].includes(e.subtype as string));

  const cogsTotal = cogs.reduce((s, e) => s + e.amount, 0);
  const grossProfit = revenueTotal - cogsTotal;
  const opexTotal = opex.reduce((s, e) => s + e.amount, 0);
  const operatingProfit = grossProfit - opexTotal;
  const financeTotal = finance.reduce((s, e) => s + e.amount, 0);
  const otherTotal = other.reduce((s, e) => s + e.amount, 0);
  const netProfit = operatingProfit - financeTotal - otherTotal;

  const rows: PLRow[] = [];
  if (cogs.length) {
    rows.push({ label: 'Cost of Revenue', amount: 0, bold: true });
    cogs.forEach(e => rows.push({ label: e.account_name, amount: e.amount, sub: true }));
    rows.push({ label: 'Total Cost of Revenue', amount: cogsTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  rows.push({ label: 'Gross Profit', amount: grossProfit, bold: true });
  rows.push({ label: '', amount: 0, separator: true });
  if (opex.length) {
    rows.push({ label: 'Operating Expenses', amount: 0, bold: true });
    opex.forEach(e => rows.push({ label: e.account_name, amount: e.amount, sub: true }));
    rows.push({ label: 'Total Operating Expenses', amount: opexTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  rows.push({ label: 'Operating Profit (EBIT)', amount: operatingProfit, bold: true });
  rows.push({ label: '', amount: 0, separator: true });
  if (finance.length) {
    rows.push({ label: 'Finance Costs', amount: 0, bold: true });
    finance.forEach(e => rows.push({ label: e.account_name, amount: e.amount, sub: true }));
    rows.push({ label: 'Total Finance Costs', amount: financeTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  if (other.length) {
    rows.push({ label: 'Other Expenses', amount: 0, bold: true });
    other.forEach(e => rows.push({ label: e.account_name, amount: e.amount, sub: true }));
    rows.push({ label: 'Total Other Expenses', amount: otherTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  rows.push({ label: 'NET PROFIT AFTER TAX', amount: netProfit, bold: true });
  return { rows, grossProfit, operatingProfit, netProfit };
}

function PLSection({ rows, highlightColor, cur }: { rows: PLRow[]; highlightColor: string; cur: string }) {
  const fmt = (n: number) => `${cur} ${n.toLocaleString()}`;
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
            {row.amount !== 0 && (
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

export const FinanceProfitLoss: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const [period, setPeriod] = useState('This Year (YTD)');
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = periodRange(period);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiFetch(`/v1/finance/profit-loss?from=${range.from}&to=${range.to}`)
      .then((res: ProfitLossReport) => { if (alive) setReport(res); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load P&L'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const revenueTotal = report?.totals.revenue ?? 0;
  const incomeRows = useMemo(() => buildIncomeRows(report?.revenue ?? [], revenueTotal), [report, revenueTotal]);
  const { rows: costRows, grossProfit, netProfit } = useMemo(
    () => buildCostsProfitRows(revenueTotal, report?.expenses ?? []),
    [report, revenueTotal]
  );

  const fmtM = (n: number) => `${cur} ${(n / 1_000_000).toFixed(1)}M`;
  const grossMargin = revenueTotal !== 0 ? ((grossProfit / revenueTotal) * 100).toFixed(1) : '0.0';
  const netMargin = revenueTotal !== 0 ? ((netProfit / revenueTotal) * 100).toFixed(1) : '0.0';

  function exportCsv() {
    const rows = [
      ['Section', 'Line', 'Amount'],
      ...incomeRows.filter(r => r.label && !r.separator).map(r => ['Income', r.label, String(r.amount)]),
      ...costRows.filter(r => r.label && !r.separator).map(r => ['Costs & Profit', r.label, String(r.amount)]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `profit-loss-${period.replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Profit &amp; Loss</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Income statement — freight &amp; customs clearing operations</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger aria-label="Period" style={{ width: 'auto', height: 'auto', padding: '7px 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading profit &amp; loss…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* KPI summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Revenue',   value: fmtM(revenueTotal),  color: 'var(--teal)',   bg: 'var(--teal-l)', icon: 'trendingUp'   },
            { label: 'Gross Profit',    value: fmtM(grossProfit),   color: 'var(--blue)',   bg: '#eff6ff',       icon: 'dollarSign'   },
            { label: 'Net Profit',      value: fmtM(netProfit),     color: 'var(--green)',  bg: '#ecfdf5',       icon: 'checkCircle'  },
            { label: 'Gross Margin',    value: `${grossMargin}%`,   color: '#f59e0b',       bg: '#fffbeb',       icon: 'percent'      },
            { label: 'Net Margin',      value: `${netMargin}%`,     color: 'var(--purple)', bg: '#f5f3ff',       icon: 'pieChart'     },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon as IconName} size={16} color={s.color} />
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
              <PLSection rows={incomeRows} highlightColor="var(--teal)" cur={cur} />
            </div>
          </div>

          <div style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Costs &amp; Profit</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>{period}</span>
            </div>
            <div style={{ padding: '8px 20px 16px' }}>
              <PLSection rows={costRows} highlightColor="var(--green)" cur={cur} />
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
