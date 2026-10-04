import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Banner } from '../components/ui/alert.js';

const YEARS = ['2026', '2025', '2024'];

interface EquityAccountRow {
  code: string; name: string; opening: number; fromNetIncome: number; dividends: number; other: number; closing: number;
}
interface EquityStatement {
  period: { from: string; to: string };
  accounts: EquityAccountRow[];
  totals: { opening: number; fromNetIncome: number; dividends: number; other: number; closing: number };
}
interface Dividend {
  id: string; declared_date: string; amount: string; description: string | null;
  status: 'DECLARED' | 'PAID'; paid_at: string | null; reference: string | null;
}

export function FinanceEquityStatement() {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmt = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`;

  const [year, setYear] = useState('2026');
  const [report, setReport] = useState<EquityStatement | null>(null);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [showDeclareForm, setShowDeclareForm] = useState(false);
  const [declareDate, setDeclareDate] = useState(new Date().toISOString().slice(0, 10));
  const [declareAmount, setDeclareAmount] = useState('');
  const [declareDesc, setDeclareDesc] = useState('');

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/v1/finance/equity-statement?from=${from}&to=${to}`),
      apiFetch(`/v1/dividends`),
    ])
      .then(([eq, divs]) => { setReport(eq); setDividends(divs); })
      .catch((err: any) => setError(err?.message ?? 'Failed to load equity statement'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function declareDividend() {
    const amount = Number(declareAmount);
    if (!amount || amount <= 0) { setNotice({ kind: 'err', text: 'Enter a positive amount.' }); return; }
    setBusy('declare');
    setNotice(null);
    try {
      await apiFetch('/v1/dividends', {
        method: 'POST',
        body: JSON.stringify({ declared_date: declareDate, amount, description: declareDesc.trim() || undefined }),
      });
      setNotice({ kind: 'ok', text: `Dividend of ${fmt(amount)} declared.` });
      setShowDeclareForm(false);
      setDeclareAmount(''); setDeclareDesc('');
      load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not declare that dividend.' });
    } finally { setBusy(null); }
  }

  async function payDividend(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      await apiFetch(`/v1/dividends/${id}/pay`, { method: 'POST', body: JSON.stringify({}) });
      setNotice({ kind: 'ok', text: 'Dividend marked paid.' });
      load();
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.message || 'Could not record that payment.' });
    } finally { setBusy(null); }
  }

  const totals = report?.totals;
  const accountColumns: TableColumn<EquityAccountRow>[] = [
    { key: 'account', header: 'Account', accessor: 'name', sortable: true, render: row => <span className="font-semibold text-foreground">{row.name}</span> },
    { key: 'opening', header: 'Opening', accessor: 'opening', sortable: true, align: 'right', render: row => fmt(row.opening) },
    { key: 'income', header: 'From net income', accessor: 'fromNetIncome', sortable: true, align: 'right', render: row => <span className={row.fromNetIncome ? 'font-semibold text-[var(--teal)]' : 'text-muted-foreground'}>{row.fromNetIncome ? fmt(row.fromNetIncome) : '—'}</span> },
    { key: 'dividends', header: 'Dividends', accessor: 'dividends', sortable: true, align: 'right', render: row => <span className={row.dividends ? 'font-semibold text-[var(--red)]' : 'text-muted-foreground'}>{row.dividends ? fmt(row.dividends) : '—'}</span> },
    { key: 'other', header: 'Other', accessor: 'other', sortable: true, align: 'right', hideAt: 'sm', render: row => row.other ? fmt(row.other) : '—' },
    { key: 'closing', header: 'Closing', accessor: 'closing', sortable: true, align: 'right', render: row => <span className="font-bold text-foreground">{fmt(row.closing)}</span> },
  ];
  const dividendColumns: TableColumn<Dividend>[] = [
    { key: 'declared', header: 'Declared', accessor: 'declared_date', sortable: true },
    { key: 'description', header: 'Description', accessor: 'description', sortable: true, render: row => row.description || '—' },
    { key: 'amount', header: 'Amount', accessor: 'amount', sortable: true, align: 'right', render: row => <span className="font-semibold text-foreground">{fmt(Number(row.amount))}</span> },
    { key: 'status', header: 'Status', accessor: 'status', sortable: true, render: row => <Badge variant={row.status === 'PAID' ? 'success' : 'warning'}>{row.status}</Badge> },
    { key: 'action', header: '', align: 'right', render: row => row.status === 'DECLARED' ? <Button type="button" variant="outline" size="xs" disabled={busy === row.id} onClick={() => payDividend(row.id)}>{busy === row.id ? 'Paying…' : 'Mark paid'}</Button> : null },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Equity"
        titleEm="statement"
        subtitle="How Retained Earnings and Share Capital moved this year — net income, dividends, and anything else."
        actions={
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      {loading ? (
        <SectionLoading label="Loading equity statement…" />
      ) : error ? (
        <Banner variant="error" title="Equity statement unavailable">{error}</Banner>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {notice && (
          <div style={{
            padding: '10px 16px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600,
            background: notice.kind === 'ok' ? 'var(--green-l)' : 'var(--red-l)',
            color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)',
          }}>
            {notice.text}
          </div>
        )}

        <MetricsRow cards={[
          {
            title: 'Opening Equity', value: fmt(totals?.opening ?? 0), icon: 'layers',
            sub1Label: 'YEAR', sub1Value: year,
            sub2Label: 'CLOSING', sub2Value: fmt(totals?.closing ?? 0), barHighlight: 'var(--ink3)',
          },
          {
            title: 'From Net Income', value: fmt(totals?.fromNetIncome ?? 0), icon: 'trendingUp',
            sub1Label: 'DIVIDENDS', sub1Value: fmt(totals?.dividends ?? 0),
            sub2Label: 'OTHER', sub2Value: fmt(totals?.other ?? 0), barHighlight: 'var(--teal)',
          },
          {
            title: 'Dividends', value: fmt(totals?.dividends ?? 0), icon: 'dollarSign', invertTrend: true,
            sub1Label: 'DECLARED', sub1Value: String(dividends.length),
            sub2Label: 'PAID', sub2Value: String(dividends.filter(d => d.status === 'PAID').length), barHighlight: 'var(--red)',
          },
          {
            title: 'Closing Equity', value: fmt(totals?.closing ?? 0), icon: 'checkCircle',
            sub1Label: 'OPENING', sub1Value: fmt(totals?.opening ?? 0),
            sub2Label: 'MOVEMENT', sub2Value: fmt((totals?.closing ?? 0) - (totals?.opening ?? 0)), barHighlight: 'var(--green)',
          },
        ]} />

        {/* Statement table */}
        <SectionCard
          padded={false}
          title="Movement by account"
          action={<span style={{ fontSize: 11, color: 'var(--ink3)' }}>{from} to {to}</span>}
        >
          <DataTable
            columns={accountColumns}
            rows={report?.accounts ?? []}
            empty={!report?.accounts?.length}
            emptyIcon="layers"
            emptyTitle="No equity movement"
            emptyMessage={`No equity account activity was recorded for ${year}.`}
            defaultSortKey="account"
            defaultSortDir="asc"
            pageSize={12}
          />
        </SectionCard>

        {/* Dividends */}
        <SectionCard
          padded={false}
          title="Dividends"
          action={<Button type="button" variant="outline" size="sm" onClick={() => setShowDeclareForm(v => !v)}>
            <Icon name="plus" size={13} /> Declare dividend
          </Button>}
        >
          {showDeclareForm && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Declared date</div>
                <DatePicker date={parseDateOnly(declareDate)} onChange={d => setDeclareDate(toDateOnlyString(d) ?? declareDate)} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Amount ({cur})</div>
                <Input type="number" min={0} value={declareAmount} onChange={e => setDeclareAmount(e.target.value)} className="w-40" />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Description (optional)</div>
                <Input type="text" value={declareDesc} onChange={e => setDeclareDesc(e.target.value)} />
              </div>
              <Button type="button" size="sm" disabled={busy === 'declare'} onClick={declareDividend}>
                {busy === 'declare' ? 'Declaring…' : 'Declare'}
              </Button>
            </div>
          )}

          <DataTable
            columns={dividendColumns}
            rows={dividends}
            empty={dividends.length === 0}
            emptyIcon="dollarSign"
            emptyTitle="No dividends declared"
            emptyMessage="Declared dividends and their payment status appear here."
            defaultSortKey="declared"
            defaultSortDir="desc"
            pageSize={10}
          />
        </SectionCard>
      </div>
      )}
    </div>
  );
}
