import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import { useCurrency } from '../hooks/useCurrency.js';
import type { ProfitLossReport, ProfitLossLine } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { SectionCard } from '../components/SectionCard.js';

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
  // Income tax (5950) and deferred tax (5951) — kept out of the "Other
  // Expenses" catch-all (M5 of the corporate-tax build-out) so the final
  // line can honestly say "after tax" only for a period where a real tax
  // figure was actually subtracted, not unconditionally as it did before
  // M2/M3 gave this bucket anything real to contain.
  const tax = expenses.filter(e => e.subtype === 'TAX_EXPENSE');
  const other = expenses.filter(e => !['COST_OF_SERVICES', 'OPERATING_EXPENSE', 'ADMIN_EXPENSE', 'FINANCE_COST', 'TAX_EXPENSE'].includes(e.subtype as string));

  const cogsTotal = cogs.reduce((s, e) => s + e.amount, 0);
  const grossProfit = revenueTotal - cogsTotal;
  const opexTotal = opex.reduce((s, e) => s + e.amount, 0);
  const operatingProfit = grossProfit - opexTotal;
  const financeTotal = finance.reduce((s, e) => s + e.amount, 0);
  const otherTotal = other.reduce((s, e) => s + e.amount, 0);
  const taxTotal = tax.reduce((s, e) => s + e.amount, 0);
  const netProfitBeforeTax = operatingProfit - financeTotal - otherTotal;
  const netProfitAfterTax = netProfitBeforeTax - taxTotal;

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
  if (taxTotal !== 0) {
    rows.push({ label: 'Net Profit Before Tax', amount: netProfitBeforeTax, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
    rows.push({ label: 'Income Tax', amount: 0, bold: true });
    tax.forEach(e => rows.push({ label: e.account_name, amount: e.amount, sub: true }));
    rows.push({ label: 'Total Income Tax', amount: taxTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
    rows.push({ label: 'NET PROFIT AFTER TAX', amount: netProfitAfterTax, bold: true });
  } else {
    // No tax posted for this period (e.g. a monthly period — deferred tax
    // only posts at year-end close) — the plain "Net Profit" label is the
    // honest one; claiming "after tax" here would assert a deduction that
    // never happened.
    rows.push({ label: 'NET PROFIT', amount: netProfitAfterTax, bold: true });
  }
  return { rows, grossProfit, operatingProfit, netProfit: netProfitAfterTax };
}

function PLSection({ rows, highlightColor, cur }: { rows: PLRow[]; highlightColor: string; cur: string }) {
  const fmt = (n: number) => `${cur} ${n.toLocaleString()}`;
  return (
    <div>
      {rows.map((row, i) => {
        if (row.separator) return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
        const isTotal = row.label.startsWith('Total') || row.label.startsWith('TOTAL') || row.label.startsWith('NET') || row.label.startsWith('Gross') || row.label.startsWith('Operating Profit');
        return (
          // gap, and min-width:0 on the label, are what keep a large figure
          // inside its row. Without them the two flex children refuse to
          // shrink and the amount is drawn straight over the label: measured
          // at a trillion USD in shillings, a 117px box was painting 231px of
          // text with overflow-x:visible, so it spilled rather than clipped.
          // The label truncates because it can be re-read in the export; the
          // amount never does, because half a number is worse than none.
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
            padding: row.bold ? '10px 0' : '7px 0',
            paddingLeft: row.sub ? 20 : 0,
          }}>
            <span
              title={row.label}
              style={{
                fontSize: row.bold ? 13 : 12,
                fontWeight: row.bold ? 700 : 400,
                color: isTotal ? highlightColor : row.bold ? 'var(--ink)' : 'var(--ink2)',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {row.label}
            </span>
            {row.amount !== 0 && (
              <span style={{
                fontSize: row.bold ? 13 : 12,
                fontWeight: row.bold ? 700 : 400,
                color: isTotal ? highlightColor : row.sub ? 'var(--ink2)' : 'var(--ink)',
                fontFamily: 'var(--mono)',
                // Digits line up column-wise, and the figure is never broken
                // across lines or shrunk away.
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0, whiteSpace: 'nowrap',
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
  const { fmtCompact } = useCurrency();
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
  const { rows: costRows, grossProfit, operatingProfit, netProfit } = useMemo(
    () => buildCostsProfitRows(revenueTotal, report?.expenses ?? []),
    [report, revenueTotal]
  );

  // Was `${cur} ${(n/1e6).toFixed(1)}M` — one tier, so it stopped being short
  // exactly when it mattered: a trillion USD in shillings came out as
  // "TZS 2646444401.0M", 17 characters in a card measured at 117px on a phone.
  // fmtCompact carries the full M/B/T/Q ladder and the tenant's own currency.
  const fmtM = (n: number) => fmtCompact(n);
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Profit and"
        titleEm="loss"
        subtitle="Income statement — freight & customs clearing operations."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger aria-label="Period" style={{ width: 'auto', height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        }
      />

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading profit &amp; loss…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <MetricsRow cards={[
          {
            title: 'Total Revenue', value: fmtM(revenueTotal), icon: 'dollarSign',
            sub1Label: 'GROSS PROFIT', sub1Value: fmtM(grossProfit),
            sub2Label: 'GROSS MARGIN', sub2Value: `${grossMargin}%`, barHighlight: 'var(--teal)',
          },
          {
            title: 'Total Expenses', value: fmtM(report?.totals.expenses ?? 0), icon: 'creditCard', invertTrend: true,
            sub1Label: 'OPERATING PROFIT', sub1Value: fmtM(operatingProfit),
            sub2Label: 'GROSS PROFIT', sub2Value: fmtM(grossProfit), barHighlight: 'var(--red)',
          },
          {
            title: 'Net Profit', value: fmtM(netProfit), icon: 'checkCircle',
            sub1Label: 'NET MARGIN', sub1Value: `${netMargin}%`,
            sub2Label: 'OPERATING PROFIT', sub2Value: fmtM(operatingProfit), barHighlight: 'var(--green)',
          },
          {
            title: 'Net Margin', value: `${netMargin}%`, icon: 'barChart2',
            sub1Label: 'GROSS MARGIN', sub1Value: `${grossMargin}%`,
            sub2Label: 'REVENUE', sub2Value: fmtM(revenueTotal), barHighlight: 'var(--blue)',
          },
        ]} />

        {/* P&L Statement */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
          <SectionCard title="Income" action={<span style={{ fontSize: 11, color: 'var(--ink3)' }}>{period}</span>}>
            <PLSection rows={incomeRows} highlightColor="var(--teal)" cur={cur} />
          </SectionCard>
          </div>

          <div style={{ flex: 1, minWidth: 300 }}>
          <SectionCard title="Costs & Profit" action={<span style={{ fontSize: 11, color: 'var(--ink3)' }}>{period}</span>}>
            <PLSection rows={costRows} highlightColor="var(--green)" cur={cur} />
          </SectionCard>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
