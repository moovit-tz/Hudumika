import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useFinanceReadOnly } from '../components/FinanceCapabilityGate.js';
import { showAlert } from '../lib/alert.js';
import './FinanceFxRevaluation.css';

interface FxRevaluation {
  id: string; period_date: string; subject_type: string; subject_id: string; currency: string;
  open_balance_fc: string; comparison_rate: string; current_rate: string; gain_loss: string;
  journal_entry_id: string | null; created_at: string;
}

interface RevaluationRun {
  periodDate: string; subjectsRevalued: number; totalGain: number; totalLoss: number;
  netMovement: number; journalEntryId: string | null;
}

export function FinanceFxRevaluation() {
  const { fmt } = useCurrency();
  const readOnly = useFinanceReadOnly();
  const [rows, setRows] = useState<FxRevaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [periodDate, setPeriodDate] = useState<Date | undefined>(new Date());
  const [lastRun, setLastRun] = useState<RevaluationRun | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch('/v1/fx-revaluations');
      setRows(Array.isArray(result) ? result : []);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not load FX revaluations.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => rows.reduce((result, row) => {
    const amount = Number(row.gain_loss) || 0;
    result.net += amount;
    if (amount >= 0) result.gains += amount; else result.losses += Math.abs(amount);
    result.currencies.add(row.currency);
    return result;
  }, { gains: 0, losses: 0, net: 0, currencies: new Set<string>() }), [rows]);

  async function runRevaluation() {
    const date = toDateOnlyString(periodDate);
    if (!date) return showAlert('Select a period date first.');
    setRunning(true);
    try {
      const result: RevaluationRun = await apiFetch('/v1/fx-revaluations/run', { method: 'POST', body: JSON.stringify({ period_date: date }) });
      setLastRun(result);
      await load();
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not run FX revaluation.');
    } finally { setRunning(false); }
  }

  const columns: TableColumn<FxRevaluation>[] = [
    { key: 'period', header: 'Period', accessor: 'period_date', sortable: true, render: row => new Date(`${row.period_date}T00:00:00`).toLocaleDateString() },
    {
      key: 'document', header: 'Document', accessor: 'subject_type', sortable: true,
      render: row => <div><div className="font-semibold text-foreground">{row.subject_type === 'AR_INVOICE' ? 'Invoice' : 'Bill'}</div><div className="text-xs text-muted-foreground">{row.subject_id.slice(0, 8)}</div></div>,
    },
    { key: 'currency', header: 'Currency', accessor: 'currency', sortable: true, render: row => <Badge variant="info">{row.currency}</Badge> },
    { key: 'balance', header: 'Open balance', accessor: 'open_balance_fc', sortable: true, align: 'right', render: row => Number(row.open_balance_fc).toLocaleString() },
    { key: 'previousRate', header: 'Previous rate', accessor: 'comparison_rate', sortable: true, align: 'right', hideAt: 'md', render: row => Number(row.comparison_rate).toLocaleString() },
    { key: 'periodRate', header: 'Period rate', accessor: 'current_rate', sortable: true, align: 'right', hideAt: 'md', render: row => Number(row.current_rate).toLocaleString() },
    {
      key: 'movement', header: 'Gain / loss', accessor: 'gain_loss', sortable: true, align: 'right',
      render: row => { const movement = Number(row.gain_loss) || 0; return <span className={movement >= 0 ? 'font-semibold text-[var(--green)]' : 'font-semibold text-[var(--red)]'}>{fmt(movement)}</span>; },
    },
    { key: 'posting', header: 'Posting', accessor: 'journal_entry_id', sortable: true, render: row => row.journal_entry_id ? <Badge variant="success">Posted</Badge> : <Badge variant="warning">No movement</Badge> },
  ];

  return <div className="finance-fx-page">
    <PageHeader crumbs={['Finance', 'Accounts']} titlePlain="Currency" titleEm="revaluation" subtitle="Revalue open foreign-currency receivables and payables without changing their original documents." actions={!readOnly ? <div className="finance-fx-run"><DatePicker date={periodDate} onChange={setPeriodDate} disabled={running} /><Button onClick={() => void runRevaluation()} disabled={running || !periodDate}><Icon name="refresh" size={16} />{running ? 'Revaluing…' : 'Run revaluation'}</Button></div> : undefined} />
    <MetricsRow cards={[
      { title: 'Revalued items', value: String(rows.length), comparisonLabel: 'Historical entries preserved', loading },
      { title: 'Currencies', value: String(summary.currencies.size), comparisonLabel: [...summary.currencies].join(', ') || 'No foreign balances', loading },
      { title: 'Total gains', value: fmt(summary.gains), comparisonLabel: 'Recognised exchange gains', barHighlight: 'var(--green)', loading },
      { title: 'Total losses', value: fmt(summary.losses), comparisonLabel: 'Recognised exchange losses', barHighlight: 'var(--red)', loading },
    ]} />
    {lastRun && <section className="finance-fx-result" aria-live="polite"><Icon name="checkCircle" size={18} /><div><strong>Revaluation completed for {lastRun.periodDate}</strong><span>{lastRun.subjectsRevalued} item{lastRun.subjectsRevalued === 1 ? '' : 's'} revalued · Net movement {fmt(lastRun.netMovement)}</span></div><Badge variant="success">Posted</Badge></section>}
    <section className="finance-fx-table-card">
      <header><div><h2>Revaluation history</h2><p>Foreign balances, comparison rates, period rates, and their journal movements.</p></div><Badge variant="gray">Net {fmt(summary.net)}</Badge></header>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={!loading && rows.length === 0}
        emptyIcon="refresh"
        emptyTitle="No revaluations recorded"
        emptyMessage="Run the first period-end revaluation when foreign-currency balances are open."
        defaultSortKey="period"
        defaultSortDir="desc"
        pageSize={15}
      />
    </section>
  </div>;
}
