import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { exportCsv, ExportButton, StatTile, DataTable, ClickableBarChart, type ColumnDef } from '../components/AnalyticsKit.js';
import { apiFetch } from '../lib/api.js';
import type { DateRange } from 'react-day-picker';
import './Petti.css';

const CATEGORY_LABELS: Record<string, string> = {
  OFFICE_SUPPLIES: 'Office supplies', TRANSPORT: 'Transport', MEALS_ENTERTAINMENT: 'Meals & entertainment',
  UTILITIES: 'Utilities', STAFF_WELFARE: 'Staff welfare', REPAIRS_MAINTENANCE: 'Repairs & maintenance',
  POSTAGE_COURIER: 'Postage & courier', MISCELLANEOUS: 'Miscellaneous',
};

interface CategoryBucket { category: string; total: number; count: number; }
interface WalletBucket { walletId: string; walletName: string; total: number; count: number; }
interface CurrencyReport { currency: string; total: number; count: number; byCategory: CategoryBucket[]; byWallet: WalletBucket[]; }

const BAR_COLORS = ['rgba(20,184,166,.75)', 'rgba(59,130,246,.75)', 'rgba(234,179,8,.75)', 'rgba(236,72,153,.75)', 'rgba(139,92,246,.75)', 'rgba(239,68,68,.75)', 'rgba(16,185,129,.75)', 'rgba(107,114,128,.75)'];

function CurrencySection({ report }: { report: CurrencyReport }) {
  const [categoryFocus, setCategoryFocus] = useState<string | null>(null);
  const [walletFocus, setWalletFocus] = useState<string | null>(null);

  const categoryColumns: ColumnDef<CategoryBucket>[] = [
    { key: 'category', label: 'Category', sortValue: r => CATEGORY_LABELS[r.category] || r.category, render: r => CATEGORY_LABELS[r.category] || r.category },
    { key: 'count', label: 'Disbursements', align: 'right', sortValue: r => r.count, render: r => r.count },
    { key: 'total', label: 'Total', align: 'right', sortValue: r => r.total, render: r => `${r.total.toLocaleString()} ${report.currency}` },
  ];
  const walletColumns: ColumnDef<WalletBucket>[] = [
    { key: 'wallet', label: 'Wallet', sortValue: r => r.walletName, render: r => r.walletName },
    { key: 'count', label: 'Disbursements', align: 'right', sortValue: r => r.count, render: r => r.count },
    { key: 'total', label: 'Total', align: 'right', sortValue: r => r.total, render: r => `${r.total.toLocaleString()} ${report.currency}` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatTile label="Total disbursed" value={`${report.total.toLocaleString()} ${report.currency}`} tone="red" />
        <StatTile label="Disbursements" value={String(report.count)} />
      </div>

      <SectionCard
        title={`Spend by category (${report.currency})`}
        action={<ExportButton onClick={() => exportCsv(`petti-spend-by-category-${report.currency}.csv`, ['Category', 'Disbursements', 'Total'], report.byCategory.map(c => [CATEGORY_LABELS[c.category] || c.category, c.count, c.total]))} />}
      >
        {report.byCategory.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>No disbursements in this period.</div>
        ) : (
          <>
            <ClickableBarChart
              labels={report.byCategory.map(c => CATEGORY_LABELS[c.category] || c.category)}
              values={report.byCategory.map(c => c.total)}
              barColors={report.byCategory.map((_, i) => BAR_COLORS[i % BAR_COLORS.length])}
              onBarClick={i => setCategoryFocus(report.byCategory[i].category)}
              yLabel={`Total (${report.currency})`}
            />
            <div style={{ height: 16 }} />
            <DataTable rows={report.byCategory} columns={categoryColumns} rowKey={r => r.category} emptyMessage="No disbursements in this period." focusKey={categoryFocus} />
          </>
        )}
      </SectionCard>

      <SectionCard
        title={`Spend by wallet (${report.currency})`}
        action={<ExportButton onClick={() => exportCsv(`petti-spend-by-wallet-${report.currency}.csv`, ['Wallet', 'Disbursements', 'Total'], report.byWallet.map(w => [w.walletName, w.count, w.total]))} />}
      >
        {report.byWallet.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>No disbursements in this period.</div>
        ) : (
          <>
            <ClickableBarChart
              labels={report.byWallet.map(w => w.walletName)}
              values={report.byWallet.map(w => w.total)}
              barColors={report.byWallet.map((_, i) => BAR_COLORS[i % BAR_COLORS.length])}
              onBarClick={i => setWalletFocus(report.byWallet[i].walletId)}
              yLabel={`Total (${report.currency})`}
            />
            <div style={{ height: 16 }} />
            <DataTable rows={report.byWallet} columns={walletColumns} rowKey={r => r.walletId} emptyMessage="No disbursements in this period." focusKey={walletFocus} />
          </>
        )}
      </SectionCard>
    </div>
  );
}

export function PettiReports() {
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [currencies, setCurrencies] = useState<CurrencyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (range?.from) params.set('from', range.from.toISOString());
    if (range?.to) params.set('to', range.to.toISOString());
    apiFetch(`/v1/petti/reports/spend?${params.toString()}`)
      .then(res => setCurrencies(res.currencies || []))
      .catch(() => setCurrencies([]))
      .finally(() => setLoading(false));
  }, [range]);

  function printFinancialReport() {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`
      <html>
        <head>
          <title>ClearOS Petty Cash Financial Report</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #161A1E; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d7a6b; padding-bottom: 16px; margin-bottom: 24px; }
            .brand { font-size: 22px; font-weight: 800; color: #0d7a6b; }
            .hero-card { background: #0e1f3d; color: #fff; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 13px; }
            th { font-size: 11px; text-transform: uppercase; color: #64748b; background: #f8fafc; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">HUDUMIKA · PETTI OPERATIONS</div>
              <div style="font-size: 12px; color: #64748b;">Financial Spend & Liquidity Report</div>
            </div>
            <div style="text-align: right; font-size: 12px;">
              <strong>Date:</strong> ${new Date().toLocaleDateString()}<br/>
              <strong>Period:</strong> ${range?.from ? range.from.toLocaleDateString() : 'All Time'} - ${range?.to ? range.to.toLocaleDateString() : 'Present'}
            </div>
          </div>

          ${currencies.map(c => `
            <div class="hero-card">
              <div style="font-size: 11px; text-transform: uppercase; color: rgba(255,255,255,0.7);">Total ${c.currency} Spend</div>
              <div style="font-size: 32px; font-weight: 900; margin-top: 4px;">${c.total.toLocaleString()} ${c.currency}</div>
              <div style="font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px;">${c.count} Disbursements Executed</div>
            </div>

            <h3>Spend Breakdown By Category (${c.currency})</h3>
            <table>
              <thead><tr><th>Category</th><th>Disbursements</th><th>Total Spent</th></tr></thead>
              <tbody>
                ${c.byCategory.map(cat => `
                  <tr>
                    <td>${CATEGORY_LABELS[cat.category] || cat.category}</td>
                    <td>${cat.count}</td>
                    <td><strong>${cat.total.toLocaleString()} ${c.currency}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `).join('')}

          <script>window.print();</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Reports']}
        titlePlain="Spend"
        titleEm="report"
        subtitle="Where petty cash actually went — by category and by wallet, for real disbursements."
        actions={
          <Button variant="outline" size="sm" onClick={printFinancialReport}>
            <Icon name="printer" size={14} /> Print Report PDF
          </Button>
        }
      />

      <div style={{ marginBottom: 20 }}>
        <DateRangePicker range={range} onChange={setRange} placeholder="All time" />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
      ) : currencies.length === 0 ? (
        <SectionCard title="Spend" collapsible={false}>
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No disbursements recorded yet.</div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {currencies.map(c => <CurrencySection key={c.currency} report={c} />)}
        </div>
      )}
    </div>
  );
}
