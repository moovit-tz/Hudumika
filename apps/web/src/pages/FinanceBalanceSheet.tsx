import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { BalanceSheetReport, BalanceSheetLine } from '@hudumika/types';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { SectionCard } from '../components/SectionCard.js';

interface LineItem { label: string; amount: number; sub?: boolean; bold?: boolean; separator?: boolean }

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function buildAssetRows(lines: BalanceSheetLine[]): LineItem[] {
  const current = lines.filter(l => l.subtype === 'CURRENT_ASSET');
  const nonCurrent = lines.filter(l => l.subtype !== 'CURRENT_ASSET');
  const currentTotal = current.reduce((s, l) => s + l.balance, 0);
  const nonCurrentTotal = nonCurrent.reduce((s, l) => s + l.balance, 0);
  const rows: LineItem[] = [];
  if (current.length) {
    rows.push({ label: 'Current Assets', amount: 0, bold: true });
    current.forEach(l => rows.push({ label: l.account_name, amount: l.balance, sub: true }));
    rows.push({ label: 'Total Current Assets', amount: currentTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  if (nonCurrent.length) {
    rows.push({ label: 'Non-Current Assets', amount: 0, bold: true });
    nonCurrent.forEach(l => rows.push({ label: l.account_name, amount: l.balance, sub: true }));
    rows.push({ label: 'Total Non-Current Assets', amount: nonCurrentTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  rows.push({ label: 'TOTAL ASSETS', amount: currentTotal + nonCurrentTotal, bold: true });
  return rows;
}

function buildLiabilitiesEquityRows(liabilities: BalanceSheetLine[], equity: BalanceSheetLine[]): LineItem[] {
  const current = liabilities.filter(l => l.subtype === 'CURRENT_LIABILITY');
  const nonCurrent = liabilities.filter(l => l.subtype !== 'CURRENT_LIABILITY');
  const currentTotal = current.reduce((s, l) => s + l.balance, 0);
  const nonCurrentTotal = nonCurrent.reduce((s, l) => s + l.balance, 0);
  const equityTotal = equity.reduce((s, l) => s + l.balance, 0);
  const rows: LineItem[] = [];
  if (current.length) {
    rows.push({ label: 'Current Liabilities', amount: 0, bold: true });
    current.forEach(l => rows.push({ label: l.account_name, amount: l.balance, sub: true }));
    rows.push({ label: 'Total Current Liabilities', amount: currentTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  if (nonCurrent.length) {
    rows.push({ label: 'Non-Current Liabilities', amount: 0, bold: true });
    nonCurrent.forEach(l => rows.push({ label: l.account_name, amount: l.balance, sub: true }));
    rows.push({ label: 'Total Non-Current Liabilities', amount: nonCurrentTotal, bold: true });
    rows.push({ label: '', amount: 0, separator: true });
  }
  rows.push({ label: 'Equity', amount: 0, bold: true });
  equity.forEach(l => rows.push({ label: l.account_name, amount: l.balance, sub: true }));
  rows.push({ label: 'Total Equity', amount: equityTotal, bold: true });
  rows.push({ label: '', amount: 0, separator: true });
  rows.push({ label: 'TOTAL LIABILITIES & EQUITY', amount: currentTotal + nonCurrentTotal + equityTotal, bold: true });
  return rows;
}

function StatementSection({ rows, highlight, cur }: { rows: LineItem[]; highlight: string; cur: string }) {
  const fmt = (n: number) => `${cur} ${n.toLocaleString()}`;
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
            {(row.amount !== 0 || row.bold) && !row.separator && row.label && (
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

export const FinanceBalanceSheet: React.FC = () => {
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const [asOf, setAsOf] = useState(todayIso());
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiFetch(`/v1/finance/balance-sheet?date=${asOf}`)
      .then((res: BalanceSheetReport) => { if (alive) setReport(res); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load balance sheet'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [asOf]);

  const assetRows = useMemo(() => buildAssetRows(report?.assets ?? []), [report]);
  const liabEquityRows = useMemo(() => buildLiabilitiesEquityRows(report?.liabilities ?? [], report?.equity ?? []), [report]);

  const totalAssets = report?.totals.assets ?? 0;
  const totalLiabilities = report?.totals.liabilities ?? 0;
  const totalEquity = report?.totals.equity ?? 0;
  const fmt = (n: number) => `${cur} ${n.toLocaleString()}`;

  const currentAssets = (report?.assets ?? []).filter(l => l.subtype === 'CURRENT_ASSET').reduce((s, l) => s + l.balance, 0);
  const nonCurrentAssets = totalAssets - currentAssets;
  const currentLiabilities = (report?.liabilities ?? []).filter(l => l.subtype === 'CURRENT_LIABILITY').reduce((s, l) => s + l.balance, 0);
  const nonCurrentLiabilities = totalLiabilities - currentLiabilities;

  function exportCsv() {
    const rows = [
      ['Section', 'Line', 'Amount'],
      ...assetRows.filter(r => r.label && !r.separator).map(r => ['Assets', r.label, String(r.amount)]),
      ...liabEquityRows.filter(r => r.label && !r.separator).map(r => ['Liabilities & Equity', r.label, String(r.amount)]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `balance-sheet-${asOf}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Reports']}
        titlePlain="Balance"
        titleEm="sheet"
        subtitle="Statement of financial position — Assets, liabilities and equity."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <DatePicker date={parseDateOnly(asOf)} onChange={d => setAsOf(toDateOnlyString(d))} triggerClassName="w-auto" />
            <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        }
      />

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading balance sheet…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <MetricsRow cards={[
          {
            title: 'Total Assets', value: fmt(totalAssets), icon: 'layers',
            sub1Label: 'CURRENT', sub1Value: fmt(currentAssets),
            sub2Label: 'NON-CURRENT', sub2Value: fmt(nonCurrentAssets), barHighlight: 'var(--teal)',
          },
          {
            title: 'Total Liabilities', value: fmt(totalLiabilities), icon: 'receipt', invertTrend: true,
            sub1Label: 'CURRENT', sub1Value: fmt(currentLiabilities),
            sub2Label: 'NON-CURRENT', sub2Value: fmt(nonCurrentLiabilities), barHighlight: 'var(--red)',
          },
          {
            title: 'Total Equity', value: fmt(totalEquity), icon: 'dollarSign',
            sub1Label: 'ASSETS', sub1Value: fmt(totalAssets),
            sub2Label: 'LIABILITIES', sub2Value: fmt(totalLiabilities), barHighlight: 'var(--green)',
          },
          {
            title: 'Debt to Equity Ratio', value: totalEquity !== 0 ? `${(totalLiabilities / totalEquity).toFixed(2)}x` : '—', icon: 'barChart2',
            sub1Label: 'LIABILITIES', sub1Value: fmt(totalLiabilities),
            sub2Label: 'EQUITY', sub2Value: fmt(totalEquity), barHighlight: 'var(--blue)',
          },
        ]} />

        {Math.abs(totalAssets - (totalLiabilities + totalEquity)) > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:9, background:'var(--red-l)', border:'1px solid #ef444440', fontSize:12, fontWeight:600, color:'var(--red)' }}>
            <Icon name="alertTriangle" size={14} color="#ef4444" />
            Assets do not equal Liabilities + Equity — difference of {fmt(Math.abs(totalAssets - (totalLiabilities + totalEquity)))}
          </div>
        )}

        {/* Statement */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {/* Assets */}
          <div style={{ flex: 1, minWidth: 300 }}>
          <SectionCard title="Assets" action={<span style={{ fontSize: 11, color: 'var(--ink3)' }}>As of {asOf}</span>}>
            <StatementSection rows={assetRows} highlight="var(--teal)" cur={cur} />
          </SectionCard>
          </div>

          {/* Liabilities & Equity */}
          <div style={{ flex: 1, minWidth: 300 }}>
          <SectionCard title="Liabilities & Equity" action={<span style={{ fontSize: 11, color: 'var(--ink3)' }}>As of {asOf}</span>}>
            <StatementSection rows={liabEquityRows} highlight="var(--blue)" cur={cur} />
          </SectionCard>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
