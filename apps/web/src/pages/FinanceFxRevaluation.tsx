import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { SectionLoading } from '../components/ui/spinner.js';
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

  return <div className="finance-fx-page">
    <PageHeader crumbs={['Finance', 'Accounts']} titlePlain="Currency" titleEm="revaluation" subtitle="Revalue open foreign-currency receivables and payables without changing their original documents." actions={!readOnly ? <div className="finance-fx-run"><DatePicker date={periodDate} onChange={setPeriodDate} disabled={running} /><Button onClick={() => void runRevaluation()} disabled={running || !periodDate}><Icon name="refresh" size={16} />{running ? 'Revaluing…' : 'Run revaluation'}</Button></div> : undefined} />
    <section className="finance-fx-metrics" aria-label="Foreign exchange revaluation summary">
      <div><span>REVALUED ITEMS</span><strong>{rows.length}</strong><small>Historical entries preserved</small></div>
      <div><span>CURRENCIES</span><strong>{summary.currencies.size}</strong><small>{[...summary.currencies].join(', ') || 'No foreign balances'}</small></div>
      <div><span>TOTAL GAINS</span><strong className="is-positive">{fmt(summary.gains)}</strong><small>Recognised exchange gains</small></div>
      <div><span>TOTAL LOSSES</span><strong className="is-negative">{fmt(summary.losses)}</strong><small>Recognised exchange losses</small></div>
    </section>
    {lastRun && <section className="finance-fx-result" aria-live="polite"><Icon name="checkCircle" size={18} /><div><strong>Revaluation completed for {lastRun.periodDate}</strong><span>{lastRun.subjectsRevalued} item{lastRun.subjectsRevalued === 1 ? '' : 's'} revalued · Net movement {fmt(lastRun.netMovement)}</span></div><Badge variant="success">Posted</Badge></section>}
    <section className="finance-fx-table-card">
      <header><div><h2>Revaluation history</h2><p>Foreign balances, comparison rates, period rates, and their journal movements.</p></div><Badge variant="gray">Net {fmt(summary.net)}</Badge></header>
      {loading ? <SectionLoading label="Loading revaluation history" /> : rows.length === 0 ? <div className="finance-fx-empty"><Icon name="refresh" size={22} /><strong>No revaluations recorded</strong><span>Run the first period-end revaluation when foreign-currency balances are open.</span></div> : <div className="rtbl-wrap"><table className="rtbl"><thead><tr><th>Period</th><th>Document</th><th>Currency</th><th className="num">Open balance</th><th className="num">Previous rate</th><th className="num">Period rate</th><th className="num">Gain / loss</th><th>Posting</th></tr></thead><tbody>{rows.map(row => {
        const movement = Number(row.gain_loss) || 0;
        return <tr key={row.id}><td>{new Date(`${row.period_date}T00:00:00`).toLocaleDateString()}</td><td><strong>{row.subject_type === 'AR_INVOICE' ? 'Invoice' : 'Bill'}</strong><small>{row.subject_id.slice(0, 8)}</small></td><td><Badge variant="info">{row.currency}</Badge></td><td className="num">{Number(row.open_balance_fc).toLocaleString()}</td><td className="num">{Number(row.comparison_rate).toLocaleString()}</td><td className="num">{Number(row.current_rate).toLocaleString()}</td><td className={`num ${movement >= 0 ? 'is-positive' : 'is-negative'}`}>{fmt(movement)}</td><td>{row.journal_entry_id ? <Badge variant="success">Posted</Badge> : <Badge variant="warning">No movement</Badge>}</td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}
