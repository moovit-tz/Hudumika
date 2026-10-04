import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { CashFlowReport } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Banner } from '../components/ui/alert.js';

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

  const columns: TableColumn<MonthRow>[] = [
    { key: 'month', header: 'Month', accessor: 'month', render: row => <span className="font-semibold text-foreground">{row.month} {year}</span> },
    { key: 'open', header: 'Opening balance', accessor: 'open', sortable: true, align: 'right', hideAt: 'sm', render: row => fmtFull(row.open) },
    { key: 'cashIn', header: 'Cash inflows', accessor: 'cashIn', sortable: true, align: 'right', render: row => <span className="font-semibold text-[var(--teal)]">{fmtFull(row.cashIn)}</span> },
    { key: 'cashOut', header: 'Cash outflows', accessor: 'cashOut', sortable: true, align: 'right', render: row => <span className="font-semibold text-[var(--red)]">{fmtFull(row.cashOut)}</span> },
    { key: 'net', header: 'Net change', accessor: 'net', sortable: true, align: 'right', render: row => <span className={row.net >= 0 ? 'font-bold text-[var(--green)]' : 'font-bold text-[var(--red)]'}>{row.net >= 0 ? '+' : ''}{fmtFull(row.net)}</span> },
    { key: 'close', header: 'Closing balance', accessor: 'close', sortable: true, align: 'right', render: row => <span className="font-bold text-foreground">{fmtFull(row.close)}</span> },
  ];

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Cash Flow']}
        titlePlain="Cash"
        titleEm="flow"
        subtitle="Monthly cash inflows and outflows."
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
        <SectionLoading label="Loading cash flow…" />
      ) : error ? (
        <Banner variant="error" title="Cash flow unavailable">{error}</Banner>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <MetricsRow cards={[
          { title: 'Total cash in', value: fmtM(totalIn), comparisonLabel: `${year} customer and other receipts`, barHighlight: 'var(--teal)' },
          { title: 'Total cash out', value: fmtM(totalOut), comparisonLabel: `${year} supplier and operating payments`, barHighlight: 'var(--red)' },
          { title: 'Net cash flow', value: fmtM(totalNet), comparisonLabel: 'Inflows less outflows', barHighlight: totalNet >= 0 ? 'var(--green)' : 'var(--red)' },
          { title: 'Closing balance', value: fmtM(closing), comparisonLabel: `End of ${year}`, barHighlight: 'var(--blue)' },
        ]} />

        {/* Cash Flow table */}
        <SectionCard padded={false} title={`Monthly Cash Flow — ${year}`}>
          <DataTable
            columns={columns}
            rows={rows}
            empty={rows.length === 0}
            emptyIcon="activity"
            emptyTitle={`No cash flow activity for ${year}`}
            emptyMessage="Monthly movements appear after cash transactions are posted."
            pageSize={12}
          />
        </SectionCard>

        {/* Breakdown note */}
        <SectionCard title={`Cash Movement Breakdown — ${year}`}>
          <div style={{ display: 'flex', gap: 14 }}>
            {sourceBreakdown.map(s => (
              <div key={s.label} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink2)' }}>{s.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{s.pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 'var(--r-sm)', background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 'var(--r-sm)' }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
      )}
    </div>
  );
};
