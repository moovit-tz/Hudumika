import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import type { BalanceSheetReport, BalanceSheetLine } from '@hudumika/types';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['FinOps', 'Balance Sheet']}
        titlePlain="Balance"
        titleEm="sheet"
        subtitle="Assets, liabilities and equity as at a date."
      />

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '13px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Balance Sheet</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Statement of financial position</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <DatePicker date={parseDateOnly(asOf)} onChange={d => setAsOf(toDateOnlyString(d))} triggerClassName="w-auto" />
          <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="download" size={13} /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading balance sheet…</div>
      ) : error ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { label: 'Total Assets',              value: fmt(totalAssets),      color: 'var(--teal)',  bg: 'var(--teal-l)', icon: 'layers'      },
            { label: 'Total Liabilities',         value: fmt(totalLiabilities), color: 'var(--red)',   bg: '#fef2f2',       icon: 'receipt'     },
            { label: 'Total Equity',              value: fmt(totalEquity),      color: 'var(--green)', bg: '#ecfdf5',       icon: 'dollarSign'  },
            { label: 'Debt to Equity Ratio',      value: totalEquity !== 0 ? `${(totalLiabilities / totalEquity).toFixed(2)}x` : '—', color: 'var(--blue)', bg: '#eff6ff', icon: 'barChart2' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={s.icon as IconName} size={18} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {Math.abs(totalAssets - (totalLiabilities + totalEquity)) > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:9, background:'#fef2f2', border:'1px solid #ef444440', fontSize:12, fontWeight:600, color:'#ef4444' }}>
            <Icon name="alertTriangle" size={14} color="#ef4444" />
            Assets do not equal Liabilities + Equity — difference of {fmt(Math.abs(totalAssets - (totalLiabilities + totalEquity)))}
          </div>
        )}

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
              <StatementSection rows={assetRows} highlight="var(--teal)" cur={cur} />
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
              <StatementSection rows={liabEquityRows} highlight="var(--blue)" cur={cur} />
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
