import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FinanceExpenseReport, FinanceExpenseReportItem } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { BackButton } from '../components/ui/BackButton.js';
import { PersonAvatar, CompanyAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';
import { ButtonSpinner } from '../components/ui/spinner.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Badge } from '../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Icon } from '../components/Icon.js';
import { cn } from '../lib/utils.js';
import './FinanceExpenseReports.css';

const base = '/v1/finance/expense-reports';
const states = ['all', 'draft', 'submitted', 'approved', 'rejected', 'reimbursed'] as const;

function ReportStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'submitted':
      return <Badge variant="warning" className="gap-1.5"><Icon name="clock" size={12} /><span>Submitted</span></Badge>;
    case 'approved':
      return <Badge variant="info" className="gap-1.5"><Icon name="check" size={12} /><span>Approved</span></Badge>;
    case 'reimbursed':
      return <Badge variant="success" className="gap-1.5"><Icon name="wallet" size={12} /><span>Reimbursed</span></Badge>;
    case 'rejected':
      return <Badge variant="error" className="gap-1.5"><Icon name="close" size={12} /><span>Rejected</span></Badge>;
    case 'draft':
    default:
      return <Badge variant="gray" className="gap-1.5"><Icon name="fileText" size={12} /><span>Draft</span></Badge>;
  }
}

const CAT_OPTIONS = [
  'PORT_CHARGES', 'CUSTOMS_DUTY', 'FREIGHT', 'HANDLING',
  'TRANSPORT', 'INSPECTION_FEE', 'AGENT_FEE', 'MEALS',
  'ACCOMMODATION', 'FUEL', 'OFFICE_SUPPLIES', 'MISCELLANEOUS',
];

const CAT_LABELS: Record<string, string> = {
  PORT_CHARGES: 'Port Charges',
  CUSTOMS_DUTY: 'Customs Duty',
  FREIGHT: 'Freight',
  HANDLING: 'Handling',
  TRANSPORT: 'Transport',
  INSPECTION_FEE: 'Inspection Fee',
  AGENT_FEE: 'Agent Fee',
  MEALS: 'Meals & Subsistence',
  ACCOMMODATION: 'Accommodation',
  FUEL: 'Fuel & Oil',
  OFFICE_SUPPLIES: 'Office Supplies',
  MISCELLANEOUS: 'Miscellaneous',
};

/* ── 1. Reports List View ── */
export function FinanceExpenseReports() {
  const { currency, fmt } = useCurrency();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<FinanceExpenseReport[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    apiFetch<{ data: FinanceExpenseReport[]; has_more: boolean }>(`${base}?page=${page}&status=${status}`)
      .then(result => {
        if (live) {
          setRows(result.data);
          setMore(result.has_more);
          setError('');
        }
      })
      .catch(err => {
        if (live) setError(err.message || 'Failed to load expense reports.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [page, status]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q) || (r.payment_reference && r.payment_reference.toLowerCase().includes(q)));
  }, [rows, search]);

  const draftCount = rows.filter(r => r.status === 'draft').length;
  const submittedCount = rows.filter(r => r.status === 'submitted').length;
  const approvedCount = rows.filter(r => r.status === 'approved').length;
  const reimbursedCount = rows.filter(r => r.status === 'reimbursed').length;

  return (
    <div className="expense-reports-page">
      <PageHeader
        crumbs={['Finance', 'Expenses']}
        titlePlain="Expense"
        titleEm="reports"
        subtitle="Submit receipts, review claims, and record employee reimbursements."
        actions={
          <Button asChild className="gap-2">
            <Link to="/finance/expense-reports/new">
              <Icon name="plus" size={15} />
              <span>New report</span>
            </Link>
          </Button>
        }
      />

      {/* Top Metrics Row */}
      <div className="expense-metrics-grid">
        <div className="expense-metric-card">
          <div className="expense-metric-top">
            <span className="expense-metric-label">All Reports</span>
            <div className="expense-metric-icon-wrap" style={{ background: 'var(--teal-l)', color: 'var(--teal)' }}>
              <Icon name="fileText" size={16} />
            </div>
          </div>
          <div className="expense-metric-val">{rows.length}</div>
          <span className="expense-metric-sub">Active in workspace</span>
        </div>

        <div className="expense-metric-card">
          <div className="expense-metric-top">
            <span className="expense-metric-label">Pending Review</span>
            <div className="expense-metric-icon-wrap" style={{ background: 'var(--gold-l)', color: 'var(--gold)' }}>
              <Icon name="clock" size={16} />
            </div>
          </div>
          <div className="expense-metric-val" style={{ color: 'var(--gold)' }}>{submittedCount}</div>
          <span className="expense-metric-sub">Awaiting approval</span>
        </div>

        <div className="expense-metric-card">
          <div className="expense-metric-top">
            <span className="expense-metric-label">Approved</span>
            <div className="expense-metric-icon-wrap" style={{ background: 'var(--blue-l)', color: 'var(--blue)' }}>
              <Icon name="check" size={16} />
            </div>
          </div>
          <div className="expense-metric-val" style={{ color: 'var(--blue)' }}>{approvedCount}</div>
          <span className="expense-metric-sub">Ready for payment</span>
        </div>

        <div className="expense-metric-card">
          <div className="expense-metric-top">
            <span className="expense-metric-label">Reimbursed</span>
            <div className="expense-metric-icon-wrap" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>
              <Icon name="wallet" size={16} />
            </div>
          </div>
          <div className="expense-metric-val" style={{ color: 'var(--green)' }}>{reimbursedCount}</div>
          <span className="expense-metric-sub">Disbursed to staff</span>
        </div>
      </div>

      {/* Toolbar: Segmented Status Tabs on Left, Search & View Switcher on Right */}
      <div className="expense-toolbar">
        <div className="expense-tabs-group">
          {states.map(tab => (
            <button
              key={tab}
              type="button"
              className={cn("expense-tab-btn", status === tab && "active")}
              onClick={() => { setStatus(tab); setPage(1); }}
            >
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              {tab !== 'all' && (
                <span className="expense-tab-pill">
                  {rows.filter(r => r.status === tab).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="expense-toolbar-right">
          <div className="expense-search-wrap">
            <Icon
              name="search"
              size={14}
              color="var(--ink3)"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reports…"
              className="expense-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
              >
                <Icon name="close" size={12} color="var(--ink3)" />
              </button>
            )}
          </div>

          {!isMobile && (
            <div className="expense-view-toggle">
              <button
                type="button"
                className={cn("expense-view-btn", viewMode === 'table' && "active")}
                onClick={() => setViewMode('table')}
                title="Table view"
              >
                <Icon name="list" size={14} />
              </button>
              <button
                type="button"
                className={cn("expense-view-btn", viewMode === 'cards' && "active")}
                onClick={() => setViewMode('cards')}
                title="Card grid view"
              >
                <Icon name="grid" size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm font-medium">
          <Icon name="alertTriangle" size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="expense-table-card p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--ink3)]">
            <Icon name="receipt" size={24} />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-[var(--ink)]">No expense reports found</h3>
            <p className="text-xs text-[var(--ink3)] mt-1">
              {search
                ? `No reports match your search query "${search}". Try clearing the search.`
                : status === 'all'
                ? "Start a new report to bundle and submit receipts for employee reimbursement."
                : `There are currently no reports marked as "${status}".`}
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/finance/expense-reports/new">Create New Report</Link>
          </Button>
        </div>
      ) : viewMode === 'table' && !isMobile ? (
        /* ── Data Table View ── */
        <div className="expense-table-card">
          <div className="expense-table-container">
            <table className="expense-table">
              <thead>
                <tr>
                  <th>Report Details</th>
                  <th>Created Date</th>
                  <th>Status</th>
                  <th>Audit Notes / Reference</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <div className="expense-report-identity">
                        <div className="expense-report-icon">
                          <Icon name="fileText" size={16} />
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <Link to={`/finance/expense-reports/${row.id}`} className="expense-report-name-link">
                            {row.name}
                          </Link>
                          <span className="text-[11px] text-[var(--ink3)] font-mono">
                            ID: {row.id.slice(0, 8)}…
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--ink2)]">
                        <Icon name="calendar" size={13} color="var(--ink3)" />
                        <span>{new Date(row.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    </td>

                    <td>
                      <ReportStatusBadge status={row.status} />
                    </td>

                    <td>
                      {row.payment_reference ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--green)]">
                          <Icon name="check" size={12} />
                          <span>Bank Ref: {row.payment_reference}</span>
                        </span>
                      ) : row.review_note ? (
                        <span className={cn("text-xs line-clamp-1 max-w-xs", row.status === 'rejected' ? "text-[var(--red)] font-medium" : "text-[var(--ink3)]")}>
                          {row.review_note}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink3)]">—</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <Button asChild variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                        <Link to={`/finance/expense-reports/${row.id}`}>
                          <span>Open</span>
                          <Icon name="arrowRight" size={12} />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Card Grid View (Always active on mobile) ── */
        <div className="expense-cards-grid">
          {filteredRows.map(row => (
            <Link key={row.id} to={`/finance/expense-reports/${row.id}`} className="expense-report-card">
              <div className="expense-report-card-top">
                <div className="expense-report-card-hdr">
                  <h4 className="expense-report-card-title">{row.name}</h4>
                  <ReportStatusBadge status={row.status} />
                </div>

                <div className="expense-report-card-meta">
                  <span className="flex items-center gap-1">
                    <Icon name="calendar" size={12} />
                    <span>{new Date(row.created_at).toLocaleDateString()}</span>
                  </span>
                  {row.payment_reference && (
                    <span className="flex items-center gap-1 text-[var(--green)] font-semibold">
                      <Icon name="check" size={12} />
                      <span>Ref: {row.payment_reference}</span>
                    </span>
                  )}
                </div>

                {row.review_note && (
                  <div className={cn("expense-report-card-note", row.status === 'rejected' && "rejection")}>
                    <span className="font-semibold">{row.status === 'rejected' ? 'Rejection:' : 'Note:'}</span> {row.review_note}
                  </div>
                )}
              </div>

              <div className="expense-report-card-ftr">
                <span className="text-xs font-semibold text-[var(--teal)] flex items-center gap-1">
                  <span>View claims & verification</span>
                </span>
                <div className="text-[var(--ink3)]">
                  <Icon name="arrowRight" size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      <div className="flex items-center justify-between py-4 border-t border-[var(--border)]">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1 || loading}
          onClick={() => setPage(v => Math.max(1, v - 1))}
        >
          Previous
        </Button>
        <span className="text-xs font-semibold text-[var(--ink2)]">
          Page {page}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!more || loading}
          onClick={() => setPage(v => v + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/* ── 2. New Report View ── */
export function FinanceExpenseReportNew() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const report = await apiFetch<FinanceExpenseReport>(base, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      navigate(`/finance/expense-reports/${report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="expense-reports-page max-w-xl mx-auto py-4">
      <BackButton to="/finance/expense-reports" label="Expense Reports" />

      <PageHeader
        crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Expense reports', to: '/finance/expense-reports' }, 'New']}
        titlePlain="New expense"
        titleEm="report"
        subtitle="Start a report, then attach receipt-backed line claims for approval."
      />

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm font-medium">
          <Icon name="alertTriangle" size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--border)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--teal-l)] text-[var(--teal)] flex items-center justify-center">
            <Icon name="fileText" size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--ink)]">Report Setup</h3>
            <p className="text-xs text-[var(--ink3)]">Provide an audit title for this collection of expense claims.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-name" className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
              Report Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="report-name"
              value={name}
              required
              maxLength={160}
              placeholder="e.g. Dar es Salaam Port Clearing - Oct 2026"
              onChange={e => setName(e.target.value)}
              className="h-10 text-sm"
              autoFocus
            />
            <span className="text-[11.5px] text-[var(--ink3)]">
              Choose a clear name reflecting the trip, customer project, or operational cycle.
            </span>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3 text-xs text-[var(--ink2)]">
            <Icon name="check" size={16} color="var(--teal)" className="shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Workflow steps:</strong> Once created, you can attach individual receipts, link customers or suppliers, and submit the full bundle for finance review.
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button asChild variant="outline" type="button" disabled={busy}>
              <Link to="/finance/expense-reports">Cancel</Link>
            </Button>
            <Button type="submit" disabled={busy || !name.trim()} className="min-w-[130px]">
              {busy ? <ButtonSpinner /> : 'Create Report'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 3. Report Detail View ── */
export function FinanceExpenseReportDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { currency, fmt } = useCurrency();

  const [report, setReport] = useState<FinanceExpenseReport>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Claim entry state
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('PORT_CHARGES');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [customer, setCustomer] = useState<PickerItem | null>(null);
  const [supplier, setSupplier] = useState<PickerItem | null>(null);

  const findCustomers = useCallback(async (search: string) => {
    const result = await apiFetch<{ data: { id: string; name: string; email?: string; active: boolean; logo_url?: string }[] }>(`/v1/customers?limit=20&search=${encodeURIComponent(search)}`);
    return (result.data || []).filter(item => item.active).map(item => ({
      id: item.id,
      label: item.name,
      sublabel: item.email || undefined,
      avatarUserId: item.id,
      avatarKind: 'customers' as const,
      avatarType: 'company' as const,
      avatarUrl: item.logo_url || undefined,
    }));
  }, []);

  const findSuppliers = useCallback(async (search: string) => {
    const result = await apiFetch<{ id: string; name: string; email?: string; logo_url?: string }[]>(`/v1/suppliers?limit=20&status=active&search=${encodeURIComponent(search)}`);
    return (result || []).map(item => ({
      id: item.id,
      label: item.name,
      sublabel: item.email || undefined,
      avatarUserId: item.id,
      avatarKind: 'suppliers' as const,
      avatarType: 'company' as const,
      avatarUrl: item.logo_url || undefined,
    }));
  }, []);

  useEffect(() => {
    let live = true;
    apiFetch<FinanceExpenseReport>(`${base}/${id}`)
      .then(result => { if (live) setReport(result); })
      .catch(err => { if (live) setError(err.message || 'Failed to load report.'); });
    return () => { live = false; };
  }, [id, revision]);

  async function action(suffix: string, body?: object) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`${base}/${id}/${suffix}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setRevision(v => v + 1);
      setPreview('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete action.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setReceipt('');
    setReceiptFileName('');
    if (!file) return;
    if (file.size > 700000 || !['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Choose a PNG or JPEG file up to 700 KB.');
      return;
    }
    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setReceipt(String(reader.result));
      setError('');
    };
    reader.readAsDataURL(file);
  }

  const owned = report?.owner_id === user?.id;
  const editable = owned && ['draft', 'rejected'].includes(report?.status || '');
  const canReview = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'].includes(user?.role || '') && !owned;
  const canPay = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'].includes(user?.role || '');

  const totalAmount = report?.items?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

  const currentStep = report?.status === 'draft' ? 1
    : report?.status === 'submitted' ? 2
    : report?.status === 'approved' ? 3
    : report?.status === 'reimbursed' ? 4 : 1;

  return (
    <div className="expense-reports-page">
      <BackButton to="/finance/expense-reports" label="Expense Reports" />

      <PageHeader
        crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Expense reports', to: '/finance/expense-reports' }, report?.name || 'Report']}
        titlePlain="Expense"
        titleEm="report"
        subtitle={report ? `${report.name} · Created on ${new Date(report.created_at).toLocaleDateString()}` : 'Loading report…'}
        actions={
          editable && (
            <Button
              disabled={busy || !report?.items?.length}
              onClick={() => action('submit')}
              className="gap-2"
            >
              <Icon name="arrowUpRight" size={15} />
              <span>Submit for Review</span>
            </Button>
          )
        }
      />

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm font-medium">
          <Icon name="alertTriangle" size={16} />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="p-1 opacity-70 hover:opacity-100">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {report && (
        <>
          {/* Interactive Workflow Stepper (Evenly Distributed) */}
          <div className="expense-stepper">
            <div className="expense-step-segment">
              <div className={cn("expense-step-item", currentStep > 1 && "is-done", currentStep === 1 && "is-current")}>
                <div className="expense-step-circle">
                  {currentStep > 1 ? <Icon name="check" size={13} color="var(--teal)" /> : '1'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-bold">Draft</span>
                  <span className="text-[11px] font-normal text-[var(--ink3)]">Add receipts</span>
                </div>
              </div>
              <div className={cn("expense-step-track", currentStep > 1 && "is-done")} />
            </div>

            <div className="expense-step-segment">
              <div className={cn("expense-step-item", currentStep > 2 && "is-done", currentStep === 2 && "is-current", report.status === 'rejected' && "is-rejected")}>
                <div className="expense-step-circle">
                  {currentStep > 2 ? <Icon name="check" size={13} color="var(--teal)" /> : report.status === 'rejected' ? <Icon name="close" size={13} color="var(--red)" /> : '2'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-bold">{report.status === 'rejected' ? 'Rejected' : 'Submitted'}</span>
                  <span className="text-[11px] font-normal text-[var(--ink3)]">{report.status === 'rejected' ? 'Needs revision' : 'Finance approval'}</span>
                </div>
              </div>
              <div className={cn("expense-step-track", currentStep > 2 && "is-done")} />
            </div>

            <div className="expense-step-segment">
              <div className={cn("expense-step-item", currentStep > 3 && "is-done", currentStep === 3 && "is-current")}>
                <div className="expense-step-circle">
                  {currentStep > 3 ? <Icon name="check" size={13} color="var(--teal)" /> : '3'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-bold">Approved</span>
                  <span className="text-[11px] font-normal text-[var(--ink3)]">Ready for payment</span>
                </div>
              </div>
              <div className={cn("expense-step-track", currentStep > 3 && "is-done")} />
            </div>

            <div className="expense-step-segment">
              <div className={cn("expense-step-item", currentStep === 4 && "is-done is-current")}>
                <div className="expense-step-circle">
                  {currentStep === 4 ? <Icon name="check" size={13} color="var(--teal)" /> : '4'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-bold">Reimbursed</span>
                  <span className="text-[11px] font-normal text-[var(--ink3)]">Disbursed to staff</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Total Card */}
          <div className="expense-detail-hero">
            <div className="expense-detail-hero-left">
              <span className="expense-detail-hero-label">Total Claim Amount</span>
              <div className="expense-detail-hero-val">
                <span>{fmt(totalAmount)}</span>
                <span className="text-sm font-bold text-[var(--teal)] uppercase">{currency}</span>
              </div>
              <span className="text-xs text-[var(--ink3)] mt-0.5">
                {report.items?.length || 0} receipt-backed claim item{(report.items?.length || 0) === 1 ? '' : 's'}
              </span>
            </div>

            <div className="flex flex-col items-end gap-2">
              <ReportStatusBadge status={report.status} />
              {report.payment_reference && (
                <span className="text-xs font-semibold text-[var(--green)] bg-[var(--green-l)] px-2.5 py-1 rounded-full border border-transparent">
                  Reimbursed Ref: {report.payment_reference}
                </span>
              )}
            </div>
          </div>

          {/* Review Remark Banner if rejected or approved with comment */}
          {report.review_note && (
            <div className={cn("p-4 rounded-xl border text-xs leading-relaxed flex items-start gap-3", report.status === 'rejected' ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-[var(--border)] bg-[var(--bg)] text-[var(--ink2)]")}>
              <Icon name={report.status === 'rejected' ? "alertTriangle" : "message"} size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold mb-0.5">
                  {report.status === 'rejected' ? 'Rejection Reason' : 'Finance Reviewer Remarks'}:
                </strong>
                {report.review_note}
              </div>
            </div>
          )}

          {/* Itemized Claims List */}
          <div className="expense-claims-card">
            <div className="expense-claims-header">
              <div>
                <h3 className="text-sm font-bold text-[var(--ink)]">Itemized Claims</h3>
                <p className="text-xs text-[var(--ink3)]">All verified receipts attached to this expense report.</p>
              </div>
              <span className="text-xs font-bold text-[var(--ink3)] uppercase tracking-wider">
                {report.items?.length || 0} Items
              </span>
            </div>

            {!report.items?.length ? (
              <div className="p-8 text-center text-xs text-[var(--ink3)]">
                No claims added to this report yet.
                {editable && " Use the form below to attach your first receipt claim."}
              </div>
            ) : (
              report.items.map(item => (
                <div key={item.id} className="expense-claim-item">
                  <div className="expense-claim-left">
                    <div className="expense-claim-icon">
                      <Icon name="receipt" size={16} />
                    </div>

                    <div className="expense-claim-details">
                      <span className="expense-claim-name">{item.name}</span>
                      <div className="expense-claim-meta">
                        <span className="text-[var(--ink)] font-medium">{item.expense_date}</span>
                        <span>·</span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg)] text-[10.5px] font-semibold text-[var(--ink3)] border border-[var(--border)]">
                          {CAT_LABELS[item.category] || item.category}
                        </span>

                        {item.customer_id && (
                          <Link to={`/crm/customers/${item.customer_id}`} className="inline-flex items-center gap-1.5 text-[var(--teal)] hover:underline ml-1">
                            <PersonAvatar userId={item.customer_id} kind="customers" name={item.customer_name || "Customer"} size={18} />
                            <span>{item.customer_name || "Customer"}</span>
                          </Link>
                        )}

                        {item.supplier_id && (
                          <Link to={`/crm/vendors/${item.supplier_id}`} className="inline-flex items-center gap-1.5 text-[var(--teal)] hover:underline ml-1">
                            <CompanyAvatar id={item.supplier_id} kind="suppliers" name={item.supplier_name || "Vendor"} size={18} shape="square" />
                            <span>{item.supplier_name || "Vendor"}</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="expense-claim-right">
                    <span className="expense-claim-amount">
                      {fmt(Number(item.amount))}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={async () => {
                        try {
                          const data = await apiFetch<{ receipt_data: string }>(`${base}/${id}/items/${item.id}/receipt`);
                          setPreview(data.receipt_data);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Unable to load receipt image.');
                        }
                      }}
                    >
                      <Icon name="fileText" size={13} />
                      <span>View Receipt</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Form to Add Claim (Only if Editable) */}
          {editable && (
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-5">
              <div className="flex items-center gap-3 pb-3 border-b border-[var(--border)]">
                <div className="w-8 h-8 rounded-lg bg-[var(--teal-l)] text-[var(--teal)] flex items-center justify-center">
                  <Icon name="plus" size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ink)]">Add Receipt Claim</h3>
                  <p className="text-xs text-[var(--ink3)]">Attach an itemized expense receipt to include in this report.</p>
                </div>
              </div>

              <form
                onSubmit={async event => {
                  event.preventDefault();
                  if (!receipt) {
                    setError('A receipt image (PNG or JPEG) is strictly required.');
                    return;
                  }
                  const ok = await action('items', {
                    name: name.trim(),
                    amount: Number(amount),
                    category,
                    expense_date: date,
                    receipt_data: receipt,
                    customer_id: customer?.id ?? null,
                    supplier_id: supplier?.id ?? null,
                  });
                  if (ok) {
                    setName('');
                    setAmount('');
                    setReceipt('');
                    setReceiptFileName('');
                  }
                }}
                className="flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="claim-name" className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                      Expense Description <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="claim-name"
                      required
                      value={name}
                      maxLength={255}
                      placeholder="e.g. Fuel receipt / Port gate pass"
                      onChange={e => setName(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="claim-amount" className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                      Amount ({currency}) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="claim-amount"
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                      Category <span className="text-destructive">*</span>
                    </Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAT_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>
                            {CAT_LABELS[opt] || opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                      Expense Date <span className="text-destructive">*</span>
                    </Label>
                    <DatePicker
                      date={parseDateOnly(date)}
                      onChange={value => setDate(value ? toDateOnlyString(value) : '')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EntityPicker
                    label="CRM Customer (Optional)"
                    value={customer}
                    onChange={setCustomer}
                    search={findCustomers}
                    placeholder="Search customers…"
                    disabled={busy}
                    hint="Link to customer job ledger"
                  />
                  <EntityPicker
                    label="CRM Vendor / Supplier (Optional)"
                    value={supplier}
                    onChange={setSupplier}
                    search={findSuppliers}
                    placeholder="Search suppliers…"
                    disabled={busy}
                    hint="Link to vendor statement"
                  />
                </div>

                {/* Receipt Upload Dropzone */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="claim-receipt" className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                    Receipt Image (PNG or JPEG, up to 700 KB) <span className="text-destructive">*</span>
                  </Label>

                  {receipt ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--teal)] bg-[var(--teal-l)] text-xs">
                      <Icon name="check" size={16} color="var(--teal)" />
                      <span className="font-semibold text-[var(--teal)] flex-1 truncate">
                        {receiptFileName || 'Receipt image attached (PNG/JPEG)'}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setReceipt(''); setReceiptFileName(''); }}
                        className="text-destructive hover:text-destructive h-7 px-2"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-6 border-1.5 border-dashed border-[var(--border)] rounded-xl bg-[var(--bg)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.02)] cursor-pointer text-center gap-1.5 transition-colors">
                      <Icon name="upload" size={20} color="var(--ink3)" />
                      <span className="text-xs font-semibold text-[var(--ink)]">Click to browse receipt image</span>
                      <span className="text-[11px] text-[var(--ink3)]">PNG or JPEG format up to 700 KB (Required by audit policy)</span>
                      <input
                        id="claim-receipt"
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                  <p className="text-[11px] text-[var(--ink3)]">
                    Duplicate receipt files across this workspace are automatically blocked for anti-fraud integrity.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <Button disabled={busy || !receipt || !name.trim() || !amount} className="gap-2">
                    {busy ? <ButtonSpinner /> : <Icon name="plus" size={15} />}
                    <span>Add Claim Line</span>
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Finance Review Card */}
          {canReview && report.status === 'submitted' && (
            <div className="bg-[var(--card-bg)] border-2 border-[var(--gold)] rounded-2xl p-6 shadow-md flex flex-col gap-4">
              <div className="flex items-center gap-3 pb-3 border-b border-[var(--border)]">
                <div className="w-8 h-8 rounded-lg bg-[var(--gold-l)] text-[var(--gold)] flex items-center justify-center">
                  <Icon name="check" size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ink)]">Finance Review & Approval</h3>
                  <p className="text-xs text-[var(--ink3)]">Approval records the expense and employee payable in the General Ledger.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="claim-review" className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                  Review Remarks / Note <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="claim-review"
                  maxLength={2000}
                  value={note}
                  placeholder="Enter approval comments or reasons if rejecting..."
                  onChange={e => setNote(e.target.value)}
                  className="h-10"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  disabled={busy || !note.trim()}
                  onClick={() => action('review', { approve: false, note })}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  Reject Report
                </Button>
                <Button
                  disabled={busy || !note.trim()}
                  onClick={() => action('review', { approve: true, note })}
                  className="gap-2"
                >
                  {busy ? <ButtonSpinner /> : <Icon name="check" size={15} />}
                  <span>Approve Report</span>
                </Button>
              </div>
            </div>
          )}

          {/* Reimbursement Card */}
          {canPay && report.status === 'approved' && (
            <div className="bg-[var(--card-bg)] border-2 border-[var(--green)] rounded-2xl p-6 shadow-md flex flex-col gap-4">
              <div className="flex items-center gap-3 pb-3 border-b border-[var(--border)]">
                <div className="w-8 h-8 rounded-lg bg-[var(--green-l)] text-[var(--green)] flex items-center justify-center">
                  <Icon name="wallet" size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ink)]">Record Staff Reimbursement</h3>
                  <p className="text-xs text-[var(--ink3)]">Record a bank payment to post GL entry (Bank 1010 credit, Employee Payable 2100 debit).</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="claim-reference" className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                    Bank Payment Reference # <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="claim-reference"
                    value={reference}
                    maxLength={160}
                    placeholder="e.g. TR-20261017-0091"
                    onChange={e => setReference(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
                    Payment Date <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker
                    date={parseDateOnly(date)}
                    onChange={value => setDate(value ? toDateOnlyString(value) : '')}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  disabled={busy || !reference.trim() || !date}
                  onClick={() => action('reimburse', { reference: reference.trim(), date })}
                  className="gap-2 bg-[var(--green)] hover:bg-[var(--green)]/90"
                >
                  {busy ? <ButtonSpinner /> : <Icon name="wallet" size={15} />}
                  <span>Disburse Reimbursement</span>
                </Button>
              </div>
            </div>
          )}

          {/* Receipt Lightbox Modal */}
          {preview && (
            <div className="expense-receipt-modal" onClick={() => setPreview('')}>
              <div className="expense-receipt-modal-inner" onClick={e => e.stopPropagation()}>
                <div className="expense-receipt-modal-hdr">
                  <span className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
                    <Icon name="fileText" size={16} />
                    <span>Receipt Preview</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setPreview('')}>
                    <Icon name="close" size={16} />
                  </Button>
                </div>
                <div className="expense-receipt-modal-body">
                  <img src={preview} alt="Claim receipt" className="expense-receipt-modal-img" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
