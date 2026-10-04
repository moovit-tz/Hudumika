import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { ProfitLossReport } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Button } from '../components/ui/button.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = ['2026', '2025', '2024'];

function monthRangeInYear(year: number, monthIndex: number) {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

function GroupedBarChart({ labels, income, expenses }: {
  labels: string[]; income: number[]; expenses: number[];
}) {
  const maxVal = Math.max(...income, ...expenses, 1);
  const active = labels.filter((_, i) => income[i] > 0 || expenses[i] > 0);
  const activeIncome   = income.filter((_, i) => income[i] > 0 || expenses[i] > 0);
  const activeExpenses = expenses.filter((_, i) => income[i] > 0 || expenses[i] > 0);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, paddingTop: 20 }}>
      {active.map((label, i) => (
        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
            <div style={{ flex: 1, maxWidth: 20, height: `${Math.max(4, (activeIncome[i] / maxVal) * 140)}px`, background: 'var(--teal)', borderRadius: '3px 3px 0 0' }} />
            <div style={{ flex: 1, maxWidth: 20, height: `${Math.max(4, (activeExpenses[i] / maxVal) * 140)}px`, background: 'var(--red)', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--ink3)', marginTop: 6 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

export const FinanceIncomeVsExpenses: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmtM = (n: number) => `${cur} ${(n / 1_000_000).toFixed(1)}M`;
  const fmtFull = (n: number) => `${cur} ${n.toLocaleString()}`;

  const [year, setYear] = useState('2026');
  const [income, setIncome] = useState<number[]>(Array(12).fill(0));
  const [expenses, setExpenses] = useState<number[]>(Array(12).fill(0));
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
        return apiFetch(`/v1/finance/profit-loss?from=${from}&to=${to}`) as Promise<ProfitLossReport>;
      })
    )
      .then(reports => {
        if (!alive) return;
        setIncome(reports.map(r => r.totals.revenue));
        setExpenses(reports.map(r => r.totals.expenses));
      })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load income vs expenses'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year]);

  const totalIncome   = income.reduce((a, b) => a + b, 0);
  const totalExpenses = expenses.reduce((a, b) => a + b, 0);
  const netProfit     = totalIncome - totalExpenses;
  const profitMargin  = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : '0.0';

  const monthlyRows = MONTHS
    .map((m, i) => ({ month: m, income: income[i], expense: expenses[i], net: income[i] - expenses[i] }))
    .filter(row => row.income > 0 || row.expense > 0);

  const columns: TableColumn<(typeof monthlyRows)[number]>[] = [
    { key: 'month', header: 'Month', accessor: 'month', sortable: true, render: row => <span className="font-semibold text-foreground">{row.month} {year}</span> },
    { key: 'income', header: 'Income', accessor: 'income', sortable: true, align: 'right', render: row => <span className="font-semibold text-[var(--teal)]">{fmtFull(row.income)}</span> },
    { key: 'expense', header: 'Expenses', accessor: 'expense', sortable: true, align: 'right', render: row => <span className="font-semibold text-[var(--red)]">{fmtFull(row.expense)}</span> },
    { key: 'net', header: 'Net profit', accessor: 'net', sortable: true, align: 'right', render: row => <span className={row.net >= 0 ? 'font-bold text-[var(--green)]' : 'font-bold text-[var(--red)]'}>{fmtFull(row.net)}</span> },
    {
      key: 'margin', header: 'Margin', align: 'right',
      render: row => { const margin = row.income > 0 ? (row.net / row.income) * 100 : 0; return <div className="flex items-center justify-end gap-2"><div className="h-1 w-15 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-[var(--green)]" style={{ width: `${Math.min(100, Math.max(0, margin))}%` }} /></div><span className="font-semibold">{margin.toFixed(1)}%</span></div>; },
    },
  ];

  function exportCsv() {
    const rows = [
      ['Month', 'Income', 'Expenses', 'Net'],
      ...monthlyRows.map(r => [r.month, String(r.income), String(r.expense), String(r.net)]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `income-vs-expenses-${year}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Income vs"
        titleEm="expenses"
        subtitle="Comparative revenue and cost analysis."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger aria-label="Year" style={{ width: 'auto', height: 34, padding: '0 10px', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
              <Icon name="download" size={13} /> Export
            </Button>
          </div>
        }
      />

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading income vs expenses…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <MetricsRow cards={[
          { title: 'Total income', value: fmtM(totalIncome), comparisonLabel: `${year} recorded revenue`, barHighlight: 'var(--teal)' },
          { title: 'Total expenses', value: fmtM(totalExpenses), comparisonLabel: `${year} recorded costs`, barHighlight: 'var(--red)' },
          { title: 'Net profit', value: fmtM(netProfit), comparisonLabel: netProfit >= 0 ? 'Income less expenses' : 'Expenses exceed income', barHighlight: netProfit >= 0 ? 'var(--green)' : 'var(--red)' },
          { title: 'Profit margin', value: `${profitMargin}%`, comparisonLabel: 'Net profit ÷ income', barHighlight: netProfit >= 0 ? 'var(--purple)' : 'var(--red)' },
        ]} />

        {/* Chart */}
        <SectionCard
          title={`Monthly Comparison — ${year}`}
          action={
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--teal)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Income</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)', opacity: 0.85 }} />
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Expenses</span>
              </div>
            </div>
          }
        >
          <GroupedBarChart labels={MONTHS} income={income} expenses={expenses} />
        </SectionCard>

        {/* Monthly breakdown table */}
        <SectionCard padded={false} title="Monthly Breakdown">
          <DataTable
            columns={columns}
            rows={monthlyRows}
            empty={monthlyRows.length === 0}
            emptyIcon="barChart2"
            emptyTitle={`No activity for ${year}`}
            emptyMessage="Income and expense months appear here after transactions are posted."
            defaultSortKey="month"
            defaultSortDir="asc"
            pageSize={12}
          />
        </SectionCard>
      </div>
      )}
    </div>
  );
};
