import React, { useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

type ReportType = 'receivables' | 'payables' | 'revenue' | 'expenses' | 'summary';

interface ReportResult {
  report_type: ReportType;
  date_from: string | null;
  date_to: string | null;
  data: any[];
  generated_at: string;
}

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'receivables', label: 'Receivables' },
  { value: 'payables',    label: 'Payables' },
  { value: 'revenue',     label: 'Revenue' },
  { value: 'expenses',    label: 'Expenses' },
  { value: 'summary',     label: 'Summary' },
];

const STATUS_OPTIONS = ['All', 'Unpaid', 'Partial', 'Paid'];

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtAmt(n: number | string | null | undefined) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMonth(m: string | null | undefined) {
  if (!m) return '—';
  const [year, month] = (m as string).split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  let bg = 'var(--border)';
  let color = 'var(--ink)';
  if (s === 'paid') { bg = 'var(--green)'; color = '#fff'; }
  else if (s === 'unpaid') { bg = 'var(--red)'; color = '#fff'; }
  else if (s === 'partial') { bg = 'var(--gold)'; color = '#fff'; }
  else if (s === 'draft') { bg = '#e2e8f0'; color = '#475569'; }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      background: bg,
      color,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    }}>
      {status || '—'}
    </span>
  );
}

function exportCSV(reportType: ReportType, data: any[]) {
  if (!data.length) return;
  let headers: string[] = [];
  let rows: string[][] = [];

  if (reportType === 'receivables') {
    headers = ['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'];
    rows = data.map(r => [
      r.invoice_number ?? '',
      r.client_name ?? '',
      fmtDate(r.issue_date),
      fmtDate(r.due_date),
      String(Number(r.total_amount) || 0),
      String(Number(r.paid_amount) || 0),
      String(Number(r.balance) || 0),
      r.status ?? '',
    ]);
  } else if (reportType === 'payables') {
    headers = ['Bill #', 'Vendor', 'Bill Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'];
    rows = data.map(r => [
      r.bill_number ?? '',
      r.vendor_name ?? '',
      fmtDate(r.bill_date),
      fmtDate(r.due_date),
      String(Number(r.total_amount) || 0),
      String(Number(r.paid_amount) || 0),
      String(Number(r.balance) || 0),
      r.status ?? '',
    ]);
  } else if (reportType === 'revenue' || reportType === 'expenses') {
    headers = ['Month', 'Amount'];
    rows = data.map(r => [fmtMonth(r.month), String(Number(r.amount) || 0)]);
  } else if (reportType === 'summary') {
    headers = ['Category', 'Details'];
    rows = data.map(r => [r.label ?? '', JSON.stringify(r)]);
  }

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AccountsQuery() {
  const [reportType, setReportType] = useState<ReportType>('receivables');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('All');
  const [customerFilter, setCustomerFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);

  async function runReport() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ report_type: reportType });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (status !== 'All') params.set('status', status);
      if (customerFilter.trim() && reportType === 'receivables') params.set('customer_id', customerFilter.trim());
      const res = await apiFetch(`/v1/invoices/report?${params.toString()}`);
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Failed to run report');
    } finally {
      setLoading(false);
    }
  }

  // Compute summary cards from result data
  function getSummaryCards() {
    if (!result) return null;
    const data = result.data;
    if (result.report_type === 'receivables' || result.report_type === 'payables') {
      const totalRecords = data.length;
      const totalAmount = data.reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
      const paidAmount = data.reduce((s: number, r: any) => s + (Number(r.paid_amount) || 0), 0);
      const outstanding = data.reduce((s: number, r: any) => s + (Number(r.balance) || 0), 0);
      return { totalRecords, totalAmount, paidAmount, outstanding };
    }
    if (result.report_type === 'revenue' || result.report_type === 'expenses') {
      const totalRecords = data.length;
      const totalAmount = data.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
      return { totalRecords, totalAmount, paidAmount: null, outstanding: null };
    }
    return null;
  }

  const summaryCards = getSummaryCards();
  const showStatusFilter = reportType === 'receivables' || reportType === 'payables';
  const showCustomerFilter = reportType === 'receivables';

  // Bar viz max for revenue/expenses
  const maxBarAmt = result && (result.report_type === 'revenue' || result.report_type === 'expenses')
    ? Math.max(...result.data.map((r: any) => Number(r.amount) || 0), 1)
    : 1;

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', minHeight: 'calc(100vh - 120px)', fontFamily: 'var(--font)' }}>
      {/* Left panel */}
      <aside style={{
        width: 300,
        minWidth: 280,
        maxWidth: 320,
        background: 'var(--white)',
        borderRight: '1px solid var(--border)',
        padding: '28px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <Icon name="barChart" size={18} color="var(--teal)" />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Query Builder</span>
          </div>

          {/* Report type */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
              Report Type
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {REPORT_TYPES.map(rt => (
                <label key={rt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 7, cursor: 'pointer',
                  background: reportType === rt.value ? 'rgba(var(--teal-rgb, 0,128,128), 0.08)' : 'transparent',
                  border: `1.5px solid ${reportType === rt.value ? 'var(--teal)' : 'transparent'}`,
                  transition: 'all 0.12s',
                }}>
                  <input
                    type="radio"
                    name="report_type"
                    value={rt.value}
                    checked={reportType === rt.value}
                    onChange={() => { setReportType(rt.value); setResult(null); }}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: reportType === rt.value ? 700 : 400, color: reportType === rt.value ? 'var(--teal)' : 'var(--ink)' }}>
                    {rt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
              Date Range
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 3, display: 'block' }}>From</label>
                <DatePicker date={parseDateOnly(dateFrom)} onChange={d => setDateFrom(toDateOnlyString(d))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 3, display: 'block' }}>To</label>
                <DatePicker date={parseDateOnly(dateTo)} onChange={d => setDateTo(toDateOnlyString(d))} />
              </div>
            </div>
          </div>

          {/* Status filter */}
          {showStatusFilter && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                Status
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    style={{
                      padding: '4px 12px', borderRadius: 20,
                      border: `1.5px solid ${status === s ? 'var(--teal)' : 'var(--border)'}`,
                      background: status === s ? 'var(--teal)' : 'var(--white)',
                      color: status === s ? '#fff' : 'var(--ink)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Customer filter */}
          {showCustomerFilter && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                Customer ID
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <Icon name="search" size={13} color="var(--ink3)" />
                </span>
                <input
                  type="text"
                  placeholder="Filter by customer ID..."
                  value={customerFilter}
                  onChange={e => setCustomerFilter(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '7px 10px 7px 28px',
                    border: '1.5px solid var(--border)', borderRadius: 7,
                    fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)',
                    background: 'var(--bg)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Run button */}
        <button
          className="btn btn-primary"
          type="button"
          onClick={runReport}
          disabled={loading}
          style={{ width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Icon name="refreshCw" size={15} color="#fff" />
          {loading ? 'Running…' : 'Run Report'}
        </button>
      </aside>

      {/* Right panel */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 28px 40px' }}>
        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--red)',
          }}>
            <Icon name="alertCircle" size={16} color="var(--red)" />
            <span style={{ fontSize: 13 }}>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: 400, gap: 16, color: 'var(--ink3)',
          }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="barChart" size={30} color="var(--ink3)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>No report yet</div>
              <div style={{ fontSize: 13 }}>Select a report type and click <strong>Run Report</strong> to get started</div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--ink3)' }}>
            <div style={{
              width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--teal)',
              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            }} />
            <span style={{ fontSize: 14 }}>Generating report…</span>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--navy)', textTransform: 'capitalize' }}>
                  {REPORT_TYPES.find(r => r.value === result.report_type)?.label} Report
                </h2>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4, display: 'flex', gap: 16 }}>
                  <span>Generated {new Date(result.generated_at).toLocaleString()}</span>
                  {result.date_from && <span>From: {fmtDate(result.date_from)}</span>}
                  {result.date_to && <span>To: {fmtDate(result.date_to)}</span>}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => exportCSV(result.report_type, result.data)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}
              >
                <Icon name="download" size={14} color="var(--teal)" />
                Export CSV
              </button>
            </div>

            {/* Summary cards */}
            {summaryCards && (
              <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: 1, minWidth: 130, padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Records</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{summaryCards.totalRecords}</div>
                </div>
                <div className="card" style={{ flex: 1, minWidth: 130, padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Total Amount</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{fmtAmt(summaryCards.totalAmount)}</div>
                </div>
                {summaryCards.paidAmount !== null && (
                  <div className="card" style={{ flex: 1, minWidth: 130, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Paid</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{fmtAmt(summaryCards.paidAmount)}</div>
                  </div>
                )}
                {summaryCards.outstanding !== null && (
                  <div className="card" style={{ flex: 1, minWidth: 130, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Outstanding</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red)' }}>{fmtAmt(summaryCards.outstanding)}</div>
                  </div>
                )}
              </div>
            )}

            {/* Zero results */}
            {result.data.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
                <Icon name="filter" size={28} color="var(--ink3)" />
                <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14 }}>No data for selected filters</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting your date range or status filter</div>
              </div>
            )}

            {/* Receivables table */}
            {result.report_type === 'receivables' && result.data.length > 0 && (
              <div className="card" style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                      {['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{r.invoice_number || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink)' }}>{r.client_name || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(r.issue_date)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(r.due_date)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmt(r.total_amount)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmtAmt(r.paid_amount)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: Number(r.balance) > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmt(r.balance)}</td>
                        <td style={{ padding: '10px 14px' }}><StatusBadge status={r.status || ''} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payables table */}
            {result.report_type === 'payables' && result.data.length > 0 && (
              <div className="card" style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                      {['Bill #', 'Vendor', 'Bill Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{r.bill_number || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink)' }}>{r.vendor_name || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(r.bill_date)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(r.due_date)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmt(r.total_amount)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmtAmt(r.paid_amount)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: Number(r.balance) > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmt(r.balance)}</td>
                        <td style={{ padding: '10px 14px' }}><StatusBadge status={r.status || ''} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Revenue / Expenses bar chart */}
            {(result.report_type === 'revenue' || result.report_type === 'expenses') && result.data.length > 0 && (
              <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 18 }}>
                  {result.report_type === 'revenue' ? 'Revenue by Month' : 'Expenses by Month'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.data.map((r: any, i: number) => {
                    const pct = Math.round(((Number(r.amount) || 0) / maxBarAmt) * 100);
                    const barColor = result.report_type === 'revenue' ? 'var(--teal)' : 'var(--red)';
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 70, fontSize: 12, color: 'var(--ink3)', textAlign: 'right', flexShrink: 0 }}>{fmtMonth(r.month)}</div>
                        <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 22, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%', background: barColor,
                            borderRadius: 4, transition: 'width 0.4s ease',
                            minWidth: pct > 0 ? 4 : 0,
                          }} />
                        </div>
                        <div style={{ width: 110, fontSize: 12, fontWeight: 700, color: 'var(--ink)', textAlign: 'right', flexShrink: 0 }}>
                          {fmtAmt(r.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Summary cards grid */}
            {result.report_type === 'summary' && result.data.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {result.data.map((item: any, i: number) => (
                  <div key={i} className="card" style={{ padding: '20px 22px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginBottom: 14 }}>{item.label}</div>
                    {item.count !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Total records</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{item.count}</span>
                      </div>
                    )}
                    {item.paid !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Paid</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)' }}>{fmtAmt(item.paid)}</span>
                      </div>
                    )}
                    {item.unpaid !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Unpaid</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>{item.unpaid}</span>
                      </div>
                    )}
                    {item.partial !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Partial</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>{item.partial}</span>
                      </div>
                    )}
                    {item.outstanding !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Outstanding</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>{fmtAmt(item.outstanding)}</span>
                      </div>
                    )}
                    {item.total !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Total (12m)</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{fmtAmt(item.total)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spin keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
