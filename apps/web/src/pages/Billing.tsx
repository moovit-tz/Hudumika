import { FinanceDocumentListExport } from '../components/FinanceDocumentListExport.js';
import { clearFinanceDrafts } from '../hooks/useFinanceDraft.js';
import { canCollectInvoicePayment } from '../lib/invoice-payment-actions.js';
import { useFinanceDocumentRoute } from '../hooks/useFinanceDocumentRoute.js';
import { downloadDocumentBatch } from '../lib/financeDocuments.js';
import { csvText } from '../lib/financeDocuments.js';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button.js';
import { formatAmount, formatCompact } from '../lib/currency.js';
import type { InvoiceListPage } from '@hudumika/types';
import { Icon } from '../components/Icon.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { PickerItem } from '../components/EntityPicker.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { Badge } from '../components/ui/badge.js';
import { Tip } from '../components/ui/tooltip.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { datePresetRange } from '../components/ui/date-filter-row.js';
import { cn } from '../lib/utils.js';
import './Billing.css';

// -- group file imports -------------------------------------------------------
import type { Status, FilterStatus, PageMode, ChargeGroup, Currency, LineItem, Invoice, InvNote, InvTask, InvReminder, InvAuditEntry } from './billing/shared.js';
import { fmtTZS, invoiceTotals, invoiceTotal, genRefCode, normalizeStatus, STATUS_STYLE, getStatusStyle, mapApiInvoice, openPrintWindow, saveInvoiceDraft, takeInvoiceDraft } from './billing/shared.js';
import { InvoiceEditor } from './billing/editor.js';
import type { EditItem } from './billing/editor.js';
import { InvoiceDetailPanel } from './billing/panel.js';
import type { DetailPanelProps } from './billing/panel.js';

// -- re-exports for external callers ------------------------------------------
export type { Status, FilterStatus, ChargeGroup, Currency, LineItem, Invoice, InvNote, InvTask, InvReminder, InvAuditEntry, DetailPanelProps, EditItem, PageMode };
export { fmtTZS, invoiceTotals, invoiceTotal, genRefCode, normalizeStatus, STATUS_STYLE, getStatusStyle, mapApiInvoice, openPrintWindow };
export { InvoiceEditor };
export { InvoiceDetailPanel };

/* ── Humanized Date Helper ── */
function humanizeDate(d?: string | null): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    }
    const dt = new Date(year, month, day);
    if (!isNaN(dt.getTime())) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${monthNames[month]} ${year}`;
    }
  }
  return d;
}

function isInvoiceOverdue(inv: Invoice): boolean {
  if (inv.status === 'Overdue') return true;
  if (!inv.dueDate || inv.status === 'Paid' || inv.status === 'Credited' || inv.status === 'Draft') return false;
  const parts = inv.dueDate.split('-');
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    }
    const due = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  }
  return false;
}

function ModePill({ mode }: { mode: Invoice['mode'] }) {
  if (mode === 'AIR') {
    return (
      <span className="inv-mode-pill inv-mode-pill--air" title="Air freight">
        <Icon name="plane" size={11} /> Air
      </span>
    );
  }
  if (mode === 'ROAD') {
    return (
      <span className="inv-mode-pill inv-mode-pill--road" title="Road transport">
        <Icon name="truck" size={11} /> Road
      </span>
    );
  }
  return (
    <span className="inv-mode-pill inv-mode-pill--sea" title="Sea freight">
      <Icon name="ship" size={11} /> Sea
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: Status }) {
  switch (status) {
    case 'Draft':
      return <Badge variant="gray">Draft</Badge>;
    case 'Paid':
      return <Badge variant="success">Paid</Badge>;
    case 'Unpaid':
      return <Badge variant="brand">Unpaid</Badge>;
    case 'Partial':
      return <Badge variant="warning">Partial</Badge>;
    case 'Overdue':
      return <Badge variant="error">Overdue</Badge>;
    case 'Credited':
      return <Badge variant="info">Credited</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getDatePresetLabel(from: string, to: string): string | null {
  if (!from && !to) return null;
  const today = new Date();
  const [todayFrom, todayTo] = datePresetRange('today', today);
  if (from === todayFrom && to === todayTo) return 'Today';
  const [d7From, d7To] = datePresetRange('7d', today);
  if (from === d7From && to === d7To) return '7 days';
  const [d30From, d30To] = datePresetRange('30d', today);
  if (from === d30From && to === d30To) return '30 days';
  const [mFrom, mTo] = datePresetRange('month', today);
  if (from === mFrom && to === mTo) return 'This month';
  if (from && to) {
    return `${humanizeDate(from)} – ${humanizeDate(to)}`;
  }
  if (from) return `From ${humanizeDate(from)}`;
  if (to) return `Until ${humanizeDate(to)}`;
  return null;
}

function InvoiceDateFilterPopover({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = getDatePresetLabel(from, to);
  const isActive = Boolean(from || to);

  const applyPreset = (preset: 'all' | 'today' | '7d' | '30d' | 'month') => {
    const today = new Date();
    const [start, end] = datePresetRange(preset, today);
    onChange(start, end);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="inline-flex items-center gap-1">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inv-date-trigger inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 h-[30px] text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive && "border-teal-500/50 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 font-semibold"
            )}
            title="Filter by date range"
          >
            <Icon name="calendar" size={13} className={isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground"} />
            <span className="max-w-[130px] truncate">{activeLabel ? activeLabel : "Date"}</span>
            <Icon name="chevronDown" size={11} className="opacity-60" />
          </button>
        </PopoverTrigger>
        {isActive && (
          <Tip label="Clear date filter">
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Icon name="close" size={11} />
            </button>
          </Tip>
        )}
      </div>
      <PopoverContent align="start" className="w-80 p-3.5 shadow-xl rounded-xl border border-border bg-popover z-50">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick presets</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 days' },
                { id: '30d', label: '30 days' },
                { id: 'month', label: 'This month' },
                { id: 'all', label: 'All time' },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id as any)}
                  className="px-2 py-1.5 text-xs text-center font-medium rounded-md border border-border/80 bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-border pt-2.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom range</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10.5px] font-medium text-muted-foreground block mb-1">From</label>
                <DatePicker
                  date={parseDateOnly(from)}
                  onChange={d => onChange(toDateOnlyString(d), to && d && toDateOnlyString(d) > to ? '' : to)}
                  placeholder="Start date"
                />
              </div>
              <div>
                <label className="text-[10.5px] font-medium text-muted-foreground block mb-1">To</label>
                <DatePicker
                  date={parseDateOnly(to)}
                  onChange={d => onChange(from && d && toDateOnlyString(d) < from ? '' : from, toDateOnlyString(d))}
                  placeholder="End date"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <Button variant="ghost" size="xs" onClick={() => { onChange('', ''); setOpen(false); }}>Reset</Button>
            <Button size="xs" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Main Billing page ── */
export const Billing: React.FC = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const documentRoute = useFinanceDocumentRoute("invoices");
  const [invoices, setInvoices]         = useState<Invoice[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [presetCustomer, setPresetCustomer] = useState<PickerItem | null>(null);
  const [presetShipment, setPresetShipment] = useState<any | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [mode, setMode]                 = useState<PageMode>('list');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch]             = useState('');
  const [sortAsc, setSortAsc]           = useState(false);
  const [viewMode, setViewMode]         = useState<'row' | 'grid'>('row');
  const [pageSize, setPageSize]         = useState(25);
  const [copiedId, setCopiedId]         = useState<string | null>(null);

  // Arriving from a customer's profile (Customers.tsx "+ New invoice" /
  // "+ Record Payment") – previously this query param was silently ignored,
  // dropping the user on a generic, unscoped Billing page.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const customerId = params.get('customer_id');
    if (!customerId) return;
    apiFetch(`/v1/customers/${customerId}`)
      .then((c: any) => {
        const item: PickerItem = { id: c.id, label: c.name };
        setPresetCustomer(item);
        if (params.get('new') === '1') {
          setSelectedId(null);
          setMode('create');
        } else {
          setSearch(c.name);
        }
      })
      .catch(() => {});
  }, [location.search]);

  // Arriving back from "create a new shipment" mid-invoice (Billing's
  // InvoiceEditor createShipment() → CreateShipmentPage.tsx's `returnTo`) –
  // same round trip as the customer_id effect above.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shipmentId = params.get('shipment_id');
    if (!shipmentId || params.get('new') !== '1') return;
    apiFetch(`/v1/shipments/${shipmentId}`)
      .then((s: any) => { setPresetShipment(s); documentRoute.open('new'); })
      .catch(() => {});
  }, [location.search]);

  // Arriving from the Finance dashboard's "Recent Invoices" row – deep-link
  // straight to that invoice's detail panel instead of the generic list.
  // Waits on `invoices` since the id only resolves once the list has loaded.
  useEffect(() => {
    if(documentRoute.mode==='new'){setMode('create');setSelectedId(null);return;}
    const invoiceId = documentRoute.id || new URLSearchParams(location.search).get('id');
    if (!invoiceId) {setMode('list');setSelectedId(null);return;}
    if (!invoiceId) return;
    let active = true;
    const query = /^[0-9a-f-]{36}$/i.test(invoiceId) ? `/v1/invoices/${invoiceId}` : `/v1/invoices?invoice_number=${encodeURIComponent(invoiceId)}&page=1&page_size=1`;
    apiFetch(query).then((data: any) => {
      const row = data.items && Array.isArray(data.items) && !data.id ? data.items.find((i: any) => i.invoice_number === invoiceId) : data;
      if (active && row) { const invoice = mapApiInvoice(row); setDetailInvoice(invoice);setSelectedId(invoice.id);setMode(documentRoute.mode==='edit'?'edit':'view'); }
    }).catch(error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [location.search, location.pathname]);

  /* ── Filters popover ── */
  const [filterMode, setFilterMode]       = useState<'all' | Invoice['mode']>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const activeFilterCount = (filterMode !== 'all' ? 1 : 0) + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  /* ── Row selection → bulk export ── keyed by invoice id, not filtered
     index, so a selection survives the user narrowing/widening the table
     with the status tabs / filters / search afterward. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedInvoice = selectedId ? (invoices.find(i => i.id === selectedId) ?? (detailInvoice?.id === selectedId ? detailInvoice : null)) : null;
  const isSplit = mode !== 'list';

  const nextId = 'Assigned on save';
  const filterKey = JSON.stringify([filterStatus, filterMode, filterDateFrom, filterDateTo, search, sortAsc]);
  const previousFilter = useRef(filterKey);
  useEffect(() => {
    if (previousFilter.current !== filterKey) { previousFilter.current = filterKey; setPage(1); }
    setSelectedIds(new Set());
  }, [filterKey, page]);
  useEffect(() => {
    let active = true;
    setApiLoading(true);
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ page: String(page), page_size: String(pageSize), sort: sortAsc ? 'asc' : 'desc' });
      if (filterStatus !== 'all') query.set('status', filterStatus);
      if (filterMode !== 'all') query.set('mode', filterMode);
      if (filterDateFrom) query.set('date_from', filterDateFrom);
      if (filterDateTo) query.set('date_to', filterDateTo);
      if (search) query.set('search', search);
      const customerId = new URLSearchParams(location.search).get('customer_id');
      if (customerId) query.set('customer_id', customerId);
      apiFetch(`/v1/invoices?${query}`).then((data: InvoiceListPage<any>) => {
        if (!active) return;
        setInvoices(data.items.map(mapApiInvoice)); setTotal(data.total); setLoadError('');
        if (page > 1 && data.items.length === 0) setPage(Math.max(1, data.total_pages));
      }).catch(error => { if (active) setLoadError(error.message); }).finally(() => { if (active) setApiLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [filterKey, page, pageSize, refresh, location.search]);
  useEffect(() => {
    let active = true;
    apiFetch('/v1/invoices/stats').then(data => { if (active) setSummary(data); }).catch(error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [refresh]);
  const filtered = invoices;
  const money = summary?.currency_totals?.TZS;
  const invStats = {
    total: summary?.total_invoices ?? 0, draftCount: summary?.status_counts?.Draft ?? 0,
    paidCount: summary?.status_counts?.Paid ?? 0, outstandingTotal: money?.outstanding ?? 0,
    overdueTotal: money?.overdue ?? 0, dueSoonTotal: Math.max(0, (money?.outstanding ?? 0) - (money?.overdue ?? 0)),
    totalReceived: money?.received ?? 0, collectionRate: money?.billed ? Math.round(money.received / money.billed * 100) : 0,
  };

  const selectedInvoicesList = invoices.filter(inv => selectedIds.has(inv.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every(inv => selectedIds.has(inv.id));

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelectAllFiltered() {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach(inv => next.delete(inv.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach(inv => next.add(inv.id));
      return next;
    });
  }

  function exportSelectedCsv() {
    const rows = [
      ['Invoice ID', 'Client', 'BL/AWB', 'Origin', 'Destination', 'Mode', 'Date', 'Due Date', 'Status', 'Currency', 'Grand Total', 'Received', 'Balance Due'],
      ...selectedInvoicesList.map(inv => {
        const total = invoiceTotals(inv).documentTotal;
        return [inv.id, inv.client, inv.blNumber, inv.origin, inv.destination, inv.mode, inv.billDate, inv.dueDate ?? '', inv.status, inv.documentCurrency || 'TZS', total, inv.received, Math.max(0, total - inv.received)];
      }),
    ];
    const csv = csvText(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [downloadingAll, setDownloadingAll] = useState(false);
  async function downloadAllSelected() {
    if (downloadingAll) return;
    setDownloadingAll(true);
    try {
      await downloadDocumentBatch(selectedInvoicesList.filter(inv=>inv._dbId).map(inv=>({kind:'invoice' as const,id:inv._dbId!})));
      showAlert('ZIP downloaded. Read export-summary.txt inside for any failed records.');
    } catch(error) { showAlert(error instanceof Error?error.message:'Could not download selected invoices.'); }
    setDownloadingAll(false);
  }

  async function handleSaveInvoice(inv: Invoice): Promise<void> {
    const isCreate = mode === 'create';
    const apiPayload = {
      invoice_number: isCreate ? undefined : inv.id,
      // Both accepted by the backend (see fastify.post/patch '/v1/invoices'
      // in invoices.routes.ts) since before this page existed – the editor's
      // Client and Linked Shipment pickers set inv.customerId/inv.shipmentRef
      // correctly, but this payload never sent either, so the link only
      // ever lived in local state and was gone on the next page load.
      customer_id: inv.customerId || null,
      business_line_id: inv.businessLineId || null,
      shipment_ref: inv.shipmentRef || null,
      client_name: inv.client,
      client_address: inv.clientAddress,
      bl_number: inv.blNumber,
      origin: inv.origin,
      destination: inv.destination,
      mode: inv.mode,
      bill_date: inv.billDate ? inv.billDate.split('-').reverse().join('-') : null,
      due_date: inv.dueDate ? inv.dueDate.split('-').reverse().join('-') : null,
      sale_agent: inv.saleAgent,
      payment_terms: inv.terms,
      exchange_rate: inv.exchangeRate,
      ref_code: isCreate ? undefined : inv.refCode,
      version: inv.version,
      notes: '',
      items: inv.items.map((it, i) => ({
        name: it.name, description: it.description || '', unit: it.unit, rate: it.rate, qty: it.qty,
        tax_pct: it.taxPct, line_group: it.group, currency: it.currency, sort_order: i,
      })),
    };
    const dbId = (!isCreate && selectedInvoice?._dbId) ? selectedInvoice._dbId : null;
    const saved = await apiFetch(dbId ? `/v1/invoices/${dbId}` : '/v1/invoices', {
      method: dbId ? 'PATCH' : 'POST',
      body: JSON.stringify({ ...apiPayload, status: inv.status, currency: inv.documentCurrency || undefined }),
    });
    // Mutation responses contain the header; use the submitted lines until a later refresh.
    const canonical = mapApiInvoice({ ...saved, items: apiPayload.items });
    setInvoices(prev => [canonical, ...prev.filter(i => i._dbId !== canonical._dbId && i.id !== inv.id)]);
    setDetailInvoice(canonical);
    setRefresh(value => value + 1);
    setSelectedId(canonical.id);
    setMode('view');
    clearFinanceDrafts();if(canonical._dbId) documentRoute.open('detail',canonical._dbId);
  }

  function handleCopyInvoice() {
    if (!selectedInvoice) return;
    saveInvoiceDraft({
      client: selectedInvoice.client, addr: selectedInvoice.clientAddress.join('\n'),
      billDate: new Date().toLocaleDateString('en-GB').split('/').join('-'), dueDate: '',
      agent: selectedInvoice.saleAgent, blNo: selectedInvoice.blNumber,
      origin: selectedInvoice.origin, dest: selectedInvoice.destination, mode: selectedInvoice.mode,
      exRate: String(selectedInvoice.exchangeRate), terms: selectedInvoice.terms,
      businessLineId: selectedInvoice.businessLineId || '',
      documentCurrency: selectedInvoice.documentCurrency,
      clearing: selectedInvoice.items.filter(i => i.group === 'clearing').map((i, n) => ({ ...i, uid: `copy-clearing-${n}` })),
      shipping: selectedInvoice.items.filter(i => i.group === 'shipping').map((i, n) => ({ ...i, uid: `copy-shipping-${n}` })),
      other: selectedInvoice.items.filter(i => i.group === 'other').map((i, n) => ({ ...i, uid: `copy-other-${n}` })),
    });
    setPresetCustomer(selectedInvoice.customerId ? { id: selectedInvoice.customerId, label: selectedInvoice.client } : null);
    setSelectedId(null);
    documentRoute.open('new');
  }

  const paymentRequest = useRef<{ signature: string; key: string } | null>(null);
  const paymentInFlight = useRef(false);

  async function handleDeleteInvoice() {
    if (!selectedInvoice || !(await showConfirm(`Delete ${selectedInvoice.id}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    if (selectedInvoice._dbId) {
      try { await apiFetch(`/v1/invoices/${selectedInvoice._dbId}`, { method: 'DELETE' }); }
      catch (err) { showAlert(err instanceof Error ? err.message : 'Could not delete invoice.'); return; }
    }
    setInvoices(prev => prev.filter(i => i.id !== selectedInvoice.id));
    setRefresh(value => value + 1);
    setSelectedId(null); setMode('list');documentRoute.open('list');
  }

  async function handleRecordPayment(amount: number, payMethod: string, payDate: string) {
    if (!selectedInvoice?._dbId || paymentInFlight.current) return false;
    if (!canCollectInvoicePayment(selectedInvoice.status, invoiceTotals(selectedInvoice).documentTotal - selectedInvoice.received)) return false;
    const signature = JSON.stringify([selectedInvoice._dbId, amount, payMethod, payDate]);
    if (paymentRequest.current?.signature !== signature) paymentRequest.current = { signature, key: crypto.randomUUID() };
    paymentInFlight.current = true;
    try {
      const recorded = await apiFetch(`/v1/invoices/${selectedInvoice._dbId}/payment`, {
        method: 'POST', headers: { 'Idempotency-Key': paymentRequest.current.key },
        body: JSON.stringify({ amount, method: payMethod, payment_date: payDate }),
      });
      setInvoices(prev => prev.map(invoice => invoice.id === selectedInvoice.id ? { ...invoice, received: Number(recorded.received), status: recorded.status } : invoice));
      setDetailInvoice({ ...selectedInvoice, received: Number(recorded.received), status: recorded.status });
      setRefresh(value => value + 1);
      paymentRequest.current = null;
      return true;
    } catch (err) { showAlert(err instanceof Error ? err.message : 'Could not record payment.'); return false; }
    finally { paymentInFlight.current = false; }
  }

  async function handleSubmitTRA() {
    if (!selectedInvoice?._dbId) return;
    try {
      const res: any = await apiFetch(`/v1/tra/invoices/${selectedInvoice._dbId}/submit`, { method: 'POST' });
      setInvoices(prev => prev.map(i => i.id === selectedInvoice.id ? {
        ...i,
        traStatus: 'submitted',
        traRctvnum: res.rctvNum,
        traQrUrl: res.qrUrl,
        traAckCode: res.ackCode,
        traAckMsg: res.ackMsg
      } : i));
    } catch (err) {
      throw err;
    }
  }

  return (
    <div className="inv-shell">
      {mode === 'list' && (
      <>
      <FinanceDocumentListExport kind="invoice"/>
      <PageHeader
        crumbs={['Finance', 'Invoices']}
        titlePlain="Sales"
        titleEm="invoices"
        subtitle="Every invoice raised, what has been received and what is still due."
      />
      <MetricsRow cards={[
        {
          title: 'Total Invoices', value: String(invStats.total),
          sub1Label: 'DRAFT', sub1Value: String(invStats.draftCount),
          sub2Label: 'SENT', sub2Value: String(invStats.total - invStats.draftCount), barHighlight: 'var(--teal)',
        },
        {
          title: 'Outstanding · TZS', value: formatCompact(invStats.outstandingTotal, 'TZS'),
          invertTrend: true,
          sub1Label: 'NOT OVERDUE', sub1Value: formatCompact(invStats.dueSoonTotal, 'TZS'),
          sub2Label: 'OVERDUE', sub2Value: formatCompact(invStats.overdueTotal, 'TZS'), barHighlight: 'var(--red)',
        },
        {
          title: 'Received · TZS', value: formatCompact(invStats.totalReceived, 'TZS'),
          sub1Label: 'PAID', sub1Value: String(invStats.paidCount),
          sub2Label: 'ALL INVOICES', sub2Value: String(invStats.total), barHighlight: 'var(--green)',
        },
        {
          title: 'Collection · TZS', value: `${invStats.collectionRate}%`,
          sub1Label: 'PAID', sub1Value: String(invStats.paidCount),
          sub2Label: 'TOTAL', sub2Value: String(invStats.total), barHighlight: 'var(--blue)',
        },
      ]} />
      </>
      )}

      {mode==='view' && selectedInvoice && <PageHeader crumbs={[{label:'Finance',to:'/finance'},{label:'Invoices',to:'/finance/invoices'}]} titleEm={selectedInvoice.id} subtitle="Sales invoice"/>}
      {/* While creating or editing, the form takes the whole body – the list
          panel is hidden rather than the form being squeezed into the right
          column beside it, matching how Quotations gives its form the page. */}
      <div className={`inv-body${isSplit ? ' inv-body--split' : ''}${selectedInvoice || mode === 'create' ? ' inv-body--has-selection' : ''}${mode === 'create' || mode === 'edit' || mode === 'view' ? ' inv-body--form' : ''}`}>
        {/* List panel */}
        <div className="inv-list-panel">

          <div className="inv-list-toolbar">
          <SearchToolbar layout="register"
            search={search}
            onSearch={setSearch}
            placeholder="Search invoices, customers, BL/AWB…"
            {...(!isSplit ? {
              quickFilter: {
                label: 'Status',
                allLabel: 'All',
                value: filterStatus === 'all' ? null : filterStatus,
                onChange: (v: string | null) => setFilterStatus((v ?? 'all') as FilterStatus),
                options: (['Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited'] as Status[]).map(s => ({
                  value: s,
                  label: `${STATUS_STYLE[s].label} (${summary?.status_counts?.[s] ?? 0})`,
                })),
              },
            } : {})}
            activeFilterCount={activeFilterCount}
            filterContent={(close) => (
              <div className="flex flex-col gap-3 p-3.5 w-64">
                <div className="inv-filters-field">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Transport Mode</label>
                  <Select value={filterMode} onValueChange={v => setFilterMode(v as any)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modes</SelectItem>
                      <SelectItem value="SEA">Sea (FCL / LCL)</SelectItem>
                      <SelectItem value="AIR">Air freight</SelectItem>
                      <SelectItem value="ROAD">Road transport</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <Button variant="ghost" size="xs" onClick={() => { setFilterMode('all'); setFilterDateFrom(''); setFilterDateTo(''); }}>Reset</Button>
                  <Button size="xs" onClick={() => close()}>Done</Button>
                </div>
              </div>
            )}
            actions={
              <>
                <InvoiceDateFilterPopover
                  from={filterDateFrom}
                  to={filterDateTo}
                  onChange={(from, to) => { setFilterDateFrom(from); setFilterDateTo(to); }}
                />
                {viewMode === 'row' && selectedIds.size > 0 && (
                  <div className="inv-bulk-actions">
                    <span className="inv-bulk-count">{selectedIds.size} selected</span>
                    <Button variant="outline" size="xs" onClick={exportSelectedCsv}>
                      <Icon name="download" size={13} /> CSV
                    </Button>
                    <Button variant="outline" size="xs" onClick={downloadAllSelected} disabled={downloadingAll}>
                      <Icon name="file" size={13} /> {downloadingAll ? 'Downloading…' : 'Download all'}
                    </Button>
                    <button type="button" className="inv-bulk-clear" onClick={() => setSelectedIds(new Set())} title="Clear selection" data-ui-native-button="">
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                )}
                <Tip label="Recurring invoice schedules">
                  <Button variant="outline" size="sm" asChild className="h-[30px] px-2.5 text-xs">
                    <Link to="/finance/invoices/recurring" style={{ textDecoration: 'none' }}>
                      <Icon name="refresh" size={13} />
                      <span className="hidden sm:inline">Recurring</span>
                    </Link>
                  </Button>
                </Tip>
                {!isSplit && (
                  <div className="inv-view-toggle" role="group" aria-label="Invoice view">
                    <Tip label="Card grid">
                      <button
                        type="button"
                        className={viewMode === 'grid' ? 'is-active' : ''}
                        onClick={() => setViewMode('grid')}
                        aria-pressed={viewMode === 'grid'}
                        title="Card grid"
                        aria-label="Card grid"
                        data-ui-native-button=""
                      >
                        <Icon name="layoutGrid" size={14} />
                      </button>
                    </Tip>
                    <Tip label="Table view">
                      <button
                        type="button"
                        className={viewMode === 'row' ? 'is-active' : ''}
                        onClick={() => setViewMode('row')}
                        aria-pressed={viewMode === 'row'}
                        title="Table view"
                        aria-label="Table view"
                        data-ui-native-button=""
                      >
                        <Icon name="list" size={14} />
                      </button>
                    </Tip>
                  </div>
                )}
              </>
            }
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <Button onClick={() => { documentRoute.open('new'); }} className="inv-toolbar-cta shrink-0" size="sm">
            <Icon name="plus" size={13} />
            <span className="hidden sm:inline">New invoice</span>
            <span className="sm:hidden">New</span>
          </Button>
          </div>

          {viewMode === 'row' || isSplit ? (
          <div className="inv-table-wrap">
            <table className="rtbl inv-table">
              <thead>
                <tr>
                  <th className="th--checkbox">
                    <Checkbox className="mx-auto" checked={allFilteredSelected} onCheckedChange={toggleSelectAllFiltered} title="Select all" />
                  </th>
                  <th className="th--sortable" onClick={() => setSortAsc(v => !v)}>
                    <span className="flex items-center gap-1.5">
                      Invoice #
                      <Icon name={sortAsc ? 'arrowUp' : 'arrowDown'} size={11} className="text-muted-foreground" />
                    </span>
                  </th>
                  {!isSplit && <th>Shipment Ref</th>}
                  <th>Customer</th>
                  {!isSplit && <th>Transport</th>}
                  <th className="th--right">Amount</th>
                  <th>Issued</th>
                  {!isSplit && <th>Due</th>}
                  <th>Status</th>
                  <th className="th--actions text-right pr-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {(!apiLoading ? filtered : []).map(inv => {
                  const isSelected = inv.id === selectedId;
                  const isChecked = selectedIds.has(inv.id);
                  const total = invoiceTotals(inv).documentTotal;
                  const isOverdue = isInvoiceOverdue(inv);
                  const isCopied = copiedId === inv.id;

                  return (
                    <tr
                      key={inv.id}
                      className={cn(
                        "inv-row group transition-colors",
                        isSelected && "inv-row--selected"
                      )}
                      onClick={() => {
                        if (mode !== 'edit' && mode !== 'create') {
                          documentRoute.open('detail', inv._dbId);
                        }
                      }}
                    >
                      <td className="th--checkbox" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          className="mx-auto"
                          checked={isChecked}
                          onCheckedChange={() => toggleSelect(inv.id)}
                          aria-label={`Select invoice ${inv.id}`}
                        />
                      </td>

                      {/* Invoice # */}
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="inv-doc-icon shrink-0">
                            <Icon name="fileText" size={13} />
                          </span>
                          <Link
                            className="inv-cell-id font-mono text-[12.5px] font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                            to={`/finance/invoices/${inv._dbId}`}
                            onClick={e => e.stopPropagation()}
                          >
                            {inv.id}
                          </Link>
                          <Tip label={isCopied ? "Copied!" : "Copy invoice #"}>
                            <button
                              type="button"
                              className="inv-copy-btn opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-foreground rounded"
                              onClick={e => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(inv.id);
                                setCopiedId(inv.id);
                                setTimeout(() => setCopiedId(null), 1800);
                              }}
                            >
                              <Icon name={isCopied ? "check" : "copy"} size={11} className={isCopied ? "text-emerald-600" : ""} />
                            </button>
                          </Tip>
                        </div>
                      </td>

                      {/* Shipment Ref */}
                      {!isSplit && (
                        <td>
                          {inv.blNumber ? (
                            <Link
                              to={`/clearos/ops?search=${encodeURIComponent(inv.blNumber)}`}
                              onClick={e => e.stopPropagation()}
                              title={`Open shipment ${inv.blNumber} in Ops Command`}
                              className="inv-cell-link font-mono text-xs flex items-center gap-1.5"
                            >
                              <Icon
                                name={inv.mode === 'AIR' ? 'plane' : inv.mode === 'ROAD' ? 'truck' : 'ship'}
                                size={12}
                                className="text-muted-foreground shrink-0"
                              />
                              <span className="truncate max-w-[160px]">{inv.blNumber}</span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                      )}

                      {/* Customer */}
                      <td className="inv-cell-client">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CompanyAvatar
                            id={inv.customerId}
                            name={inv.client || 'Unassigned'}
                            size={24}
                            shape="square"
                          />
                          {inv.client ? (
                            <Link
                              to={inv.customerId ? `/crm/customers?id=${encodeURIComponent(inv.customerId)}` : '/crm/customers'}
                              onClick={e => e.stopPropagation()}
                              title={`View ${inv.client} profile`}
                              className="inv-cell-client-link truncate font-medium text-xs hover:underline"
                            >
                              {inv.client}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs italic">Unassigned</span>
                          )}
                        </div>
                      </td>

                      {/* Transport Mode */}
                      {!isSplit && (
                        <td>
                          <ModePill mode={inv.mode} />
                        </td>
                      )}

                      {/* Total */}
                      <td className="inv-cell-total text-right">
                        <div className="tabular-nums font-semibold text-[13px] text-foreground">
                          {formatAmount(total, inv.documentCurrency || 'TZS')}
                        </div>
                        {inv.received > 0 && inv.received < total && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            Rec'd {formatAmount(inv.received, inv.documentCurrency || 'TZS')}
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="inv-cell-date text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {humanizeDate(inv.billDate)}
                      </td>

                      {/* Due */}
                      {!isSplit && (
                        <td className="inv-cell-due text-xs tabular-nums whitespace-nowrap">
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                              <Icon name="clock" size={11} />
                              {humanizeDate(inv.dueDate)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {humanizeDate(inv.dueDate)}
                            </span>
                          )}
                        </td>
                      )}

                      {/* Status */}
                      <td>
                        <InvoiceStatusBadge status={inv.status} />
                      </td>

                      {/* Actions */}
                      <td className="text-right pr-3" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inv-row-more-btn inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title="Invoice options"
                              aria-label={`Options for invoice ${inv.id}`}
                            >
                              <Icon name="moreHorizontal" size={14} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 shadow-lg rounded-xl">
                            <DropdownMenuItem onSelect={() => documentRoute.open('detail', inv._dbId)}>
                              <Icon name="eye" size={13} className="mr-2" /> View invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => documentRoute.open('edit', inv._dbId)}>
                              <Icon name="edit" size={13} className="mr-2" /> Edit invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openPrintWindow(inv)}>
                              <Icon name="printer" size={13} className="mr-2" /> Print / PDF
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => {
                                navigator.clipboard.writeText(inv.id);
                                showAlert(`Copied ${inv.id} to clipboard.`);
                              }}
                            >
                              <Icon name="copy" size={13} className="mr-2" /> Copy invoice #
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {apiLoading && (
                  <tr><td colSpan={10} className="inv-table-msg">Loading invoices…</td></tr>
                )}
                {!apiLoading && !loadError && filtered.length === 0 && !search && filterStatus === 'all' && !activeFilterCount && (
                  <tr><td colSpan={10} className="inv-table-msg">
                    <div className="inv-empty-title">No invoices yet</div>
                    <div className="inv-empty-sub">Create your first invoice to start billing customers.</div>
                    <Button onClick={() => { documentRoute.open('new'); }}>
                      <Icon name="plus" size={14} /> Create New Invoice
                    </Button>
                  </td></tr>
                )}
                {!apiLoading && !loadError && filtered.length === 0 && (!!search || filterStatus !== 'all' || activeFilterCount > 0) && (
                  <tr><td colSpan={10} className="inv-table-msg">No invoices match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="inv-grid" aria-label="Invoices grid">
              {(!apiLoading ? filtered : []).map(invoice => {
                const totalValue = invoiceTotals(invoice).documentTotal;
                const isOverdue = isInvoiceOverdue(invoice);
                return (
                  <button
                    key={invoice.id}
                    type="button"
                    className="inv-board-card group text-left"
                    onClick={() => { documentRoute.open('detail', invoice._dbId); }}
                    data-ui-native-button=""
                  >
                    <div className="inv-board-card-top flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-teal-700 dark:text-teal-300">
                        <Icon name="fileText" size={13} className="opacity-70" />
                        <span>{invoice.id}</span>
                      </div>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>

                    <div className="flex items-center gap-2 my-1">
                      <CompanyAvatar
                        id={invoice.customerId}
                        name={invoice.client || 'Unassigned'}
                        size={22}
                        shape="square"
                      />
                      <span className="inv-board-client truncate font-medium text-xs text-foreground">
                        {invoice.client || <span className="text-muted-foreground italic">Unassigned</span>}
                      </span>
                    </div>

                    <div className="inv-board-card-meta flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono text-[11px] truncate max-w-[140px]">
                        {invoice.blNumber || 'No BL / AWB'}
                      </span>
                      <strong className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAmount(totalValue, invoice.documentCurrency || 'TZS')}
                      </strong>
                    </div>

                    <div className="inv-board-card-meta flex items-center justify-between text-xs pt-1 border-t border-border/60">
                      <span className="text-muted-foreground text-[11px]">
                        Issued {humanizeDate(invoice.billDate)}
                      </span>
                      <span className={cn(
                        "text-[11px] tabular-nums",
                        isOverdue ? "text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1" : "text-muted-foreground"
                      )}>
                        {isOverdue && <Icon name="clock" size={10} />}
                        Due {humanizeDate(invoice.dueDate)}
                      </span>
                    </div>

                    <div className="inv-board-card-bottom pt-1 flex items-center justify-between">
                      <ModePill mode={invoice.mode} />
                    </div>
                  </button>
                );
              })}
              {apiLoading && <div className="inv-board-loading">Loading invoices…</div>}
              {!apiLoading && !loadError && filtered.length === 0 && !search && filterStatus === 'all' && !activeFilterCount && (
                <div className="inv-grid-empty">
                  <div className="inv-empty-title">No invoices yet</div>
                  <div className="inv-empty-sub">Create your first invoice to start billing customers.</div>
                  <Button onClick={() => { documentRoute.open('new'); }}>
                    <Icon name="plus" size={14} /> Create New Invoice
                  </Button>
                </div>
              )}
              {!apiLoading && !loadError && filtered.length === 0 && (!!search || filterStatus !== 'all' || activeFilterCount > 0) && (
                <div className="inv-grid-empty">No invoices match your filters</div>
              )}
            </div>
          )}

          {/* Pagination */}
          {loadError && (
            <div role="alert" className="p-3 text-sm flex items-center justify-between" style={{ color: 'var(--red)' }}>
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={() => setRefresh(v => v + 1)}>Retry</Button>
            </div>
          )}
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={size => { setPageSize(size); setPage(1); }}
            pageSizeOptions={[10, 25, 50, 100]}
            itemLabel="invoice"
            bordered={true}
          />
        </div>

        {/* Right panel */}
        <div className="inv-detail-panel" style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          {mode === 'view' && selectedInvoice && (
            <InvoiceDetailPanel inv={selectedInvoice} onClose={() => { setMode('list'); setSelectedId(null); documentRoute.open('list'); }} onEdit={() => documentRoute.open('edit',selectedInvoice._dbId)} onCopy={handleCopyInvoice} onDelete={handleDeleteInvoice} onRecordPayment={handleRecordPayment} onSubmitTRA={handleSubmitTRA} isMobile={isMobile} />
          )}
          {mode === 'edit' && selectedInvoice && (
            <InvoiceEditor initial={selectedInvoice} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => documentRoute.open('detail',selectedInvoice?._dbId)} isMobile={isMobile} />
          )}
          {mode === 'create' && (
            <InvoiceEditor initial={null} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => { setMode('list'); setSelectedId(null); documentRoute.open('list'); }} isMobile={isMobile} presetCustomer={presetCustomer} presetShipment={presetShipment} />
          )}
        </div>
      </div>

      {/* Batch Payments modal */}
    </div>
  );
};
