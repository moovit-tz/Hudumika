import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button.js';
import { formatAmount } from '../lib/currency.js';
import type { InvoiceListPage } from '@hudumika/types';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
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

/* ── Main Billing page ── */
export const Billing: React.FC = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
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
  const [viewMode, setViewMode]         = useState<'board' | 'list'>('board');

  // Arriving from a customer's profile (Customers.tsx "+ Create Invoice" /
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
      .then((s: any) => { setPresetShipment(s); setSelectedId(null); setMode('create'); })
      .catch(() => {});
  }, [location.search]);

  // Arriving from the Finance dashboard's "Recent Invoices" row – deep-link
  // straight to that invoice's detail panel instead of the generic list.
  // Waits on `invoices` since the id only resolves once the list has loaded.
  useEffect(() => {
    const invoiceId = new URLSearchParams(location.search).get('id');
    if (!invoiceId) return;
    let active = true;
    const query = /^[0-9a-f-]{36}$/i.test(invoiceId) ? `/v1/invoices/${invoiceId}` : `/v1/invoices?invoice_number=${encodeURIComponent(invoiceId)}&page=1&page_size=1`;
    apiFetch(query).then((data: any) => {
      const row = data.items && Array.isArray(data.items) && !data.id ? data.items.find((i: any) => i.invoice_number === invoiceId) : data;
      if (active && row) { const invoice = mapApiInvoice(row); setDetailInvoice(invoice); setSelectedId(invoice.id); setMode('view'); }
    }).catch(error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [location.search]);

  /* ── Filters popover ── */
  const [showFilters, setShowFilters]     = useState(false);
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
      const query = new URLSearchParams({ page: String(page), page_size: '25', sort: sortAsc ? 'asc' : 'desc' });
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
  }, [filterKey, page, refresh, location.search]);
  useEffect(() => {
    let active = true;
    apiFetch('/v1/invoices/stats').then(data => { if (active) setSummary(data); }).catch(error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [refresh]);
  const filtered = invoices;
  const boardStatuses: Status[] = filterStatus === 'all'
    ? ['Draft', 'Unpaid', 'Partial', 'Overdue', 'Paid', 'Credited']
    : [filterStatus];
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
      ['Invoice ID', 'Client', 'BL/AWB', 'Origin', 'Destination', 'Mode', 'Date', 'Due Date', 'Status', 'Grand Total', 'Received (TZS)', 'Balance Due (TZS)'],
      ...selectedInvoicesList.map(inv => {
        const total = invoiceTotals(inv).documentTotal;
        return [inv.id, inv.client, inv.blNumber, inv.origin, inv.destination, inv.mode, inv.billDate, inv.dueDate ?? '', inv.status, Math.round(total), Math.round(inv.received), Math.round(Math.max(0, total - inv.received))];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
    // Sequential, not Promise.all – back-to-back a.click() downloads
    // fired all at once are exactly what triggers a browser's
    // multiple-automatic-downloads block; pacing them by each fetch's own
    // network time avoids that.
    for (const inv of selectedInvoicesList) {
      if (!inv._dbId) continue;
      try { await apiDownload(`/v1/invoices/${inv._dbId}/pdf`, `${inv.id}.pdf`); } catch { /* continue with the rest */ }
    }
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
        name: it.name, unit: it.unit, rate: it.rate, qty: it.qty,
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
    setMode('create');
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
    setSelectedId(null); setMode('list');
  }

  async function handleRecordPayment(amount: number, payMethod: string, payDate: string) {
    if (!selectedInvoice?._dbId || paymentInFlight.current) return false;
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
      {mode !== 'create' && mode !== 'edit' && (
      <>
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
          title: 'Outstanding · TZS', value: formatAmount(invStats.outstandingTotal, 'TZS'),
          invertTrend: true,
          sub1Label: 'NOT OVERDUE', sub1Value: formatAmount(invStats.dueSoonTotal, 'TZS'),
          sub2Label: 'OVERDUE', sub2Value: formatAmount(invStats.overdueTotal, 'TZS'), barHighlight: 'var(--red)',
        },
        {
          title: 'Received · TZS', value: formatAmount(invStats.totalReceived, 'TZS'),
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

      {/* While creating or editing, the form takes the whole body – the list
          panel is hidden rather than the form being squeezed into the right
          column beside it, matching how Quotations gives its form the page. */}
      <div className={`inv-body${isSplit ? ' inv-body--split' : ''}${selectedInvoice || mode === 'create' ? ' inv-body--has-selection' : ''}${mode === 'create' || mode === 'edit' || mode === 'view' ? ' inv-body--form' : ''}`}>
        {/* List panel */}
        <div className="inv-list-panel">

          {/* Toolbar – tabs, actions and search all in one row. The tabs +
              actions + search live inside .inv-toolbar-scroll, which scrolls
              sideways on a viewport too narrow to fit them all (instead of
              wrapping into a second row); Create Invoice sits outside that
              scroller as a fixed sibling, so the primary action is never
              something a user has to scroll to discover. */}
          <div className="inv-list-toolbar">
          <div className="inv-toolbar-scroll">
            {!isSplit && (
              <div className="inv-search-wrap inv-search-wrap--primary">
                <Icon name="search" size={15} color="var(--ink3)" className="inv-search-icon" />
                <input className="inv-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices or customers…" aria-label="Search invoices or customers" />
              </div>
            )}
            {!isSplit && (
              <Tabs value={filterStatus} onValueChange={v => setFilterStatus(v as FilterStatus)} variant="segmented">
                <TabsList>
                  {(['all', 'Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited'] as FilterStatus[]).map(s => {
                    const cnt = s === 'all' ? (summary?.total_invoices ?? 0) : (summary?.status_counts?.[s] ?? 0);
                    return (
                      <TabsTrigger key={s} value={s}>
                        {s === 'all' ? 'All' : STATUS_STYLE[s as Status].label}
                        {cnt > 0 && <span className="inv-status-chip-count">{cnt}</span>}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
            )}
            <div className="inv-topbar-spacer" />
            <div className="inv-toolbar-actions">
              {/* Bulk export – only appears once at least one row is
                  checked, rather than a permanently-visible "Export"
                  button that acted on the whole filtered list regardless
                  of what (if anything) the user had actually picked. */}
              {viewMode === 'list' && selectedIds.size > 0 && (
                <div className="inv-bulk-actions">
                  <span className="inv-bulk-count">{selectedIds.size} selected</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={exportSelectedCsv} data-ui-native-button="">
                    <Icon name="download" size={13} /> Export CSV
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={downloadAllSelected} disabled={downloadingAll} data-ui-native-button="">
                    <Icon name="file" size={13} /> {downloadingAll ? 'Downloading…' : 'Download all'}
                  </button>
                  <button type="button" className="inv-bulk-clear" onClick={() => setSelectedIds(new Set())} title="Clear selection" data-ui-native-button="">
                    <Icon name="x" size={13} />
                  </button>
                </div>
              )}
              {/* A real Radix Popover, not a hand-rolled absolute-positioned
                  div – that version rendered inside .inv-toolbar-scroll,
                  whose overflow-x:auto (needed for the horizontal-scroll
                  toolbar) computes overflow-y to auto too, clipping any
                  plain absolutely-positioned child that extended below the
                  row. PopoverContent portals to document.body, so it always
                  escapes that clip regardless of which row it's triggered
                  from. It also gets outside-click/Escape dismissal for free,
                  replacing the manual stopPropagation + shell-level onClick
                  dance that used to do the same job a second way. */}
              <Popover open={showFilters} onOpenChange={setShowFilters}>
                <PopoverTrigger asChild>
                  <button type="button" className={`btn btn-secondary btn-sm${activeFilterCount > 0 ? ' inv-btn--active' : ''}`} data-ui-native-button="">
                    <Icon name="filter" size={13} color={activeFilterCount > 0 ? 'var(--teal)' : 'var(--ink3)'} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} className="w-72 flex flex-col gap-2.5">
                  <div className="inv-filters-field">
                    <label>Mode</label>
                    <Select value={filterMode} onValueChange={v => setFilterMode(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All modes</SelectItem>
                        <SelectItem value="SEA">SEA</SelectItem>
                        <SelectItem value="AIR">AIR</SelectItem>
                        <SelectItem value="ROAD">ROAD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="inv-filters-row">
                    <div className="inv-filters-field">
                      <label>From</label>
                      <DatePicker date={parseDateOnly(filterDateFrom)} onChange={d => setFilterDateFrom(toDateOnlyString(d))} />
                    </div>
                    <div className="inv-filters-field">
                      <label>To</label>
                      <DatePicker date={parseDateOnly(filterDateTo)} onChange={d => setFilterDateTo(toDateOnlyString(d))} />
                    </div>
                  </div>
                  <div className="inv-filters-foot">
                    <button type="button" className="btn btn-secondary" onClick={() => { setFilterMode('all'); setFilterDateFrom(''); setFilterDateTo(''); }} data-ui-native-button="">Clear</button>
                    <button type="button" className="btn btn-primary" onClick={() => setShowFilters(false)} data-ui-native-button="">Done</button>
                  </div>
                </PopoverContent>
              </Popover>
              <Link to="/finance/invoices/recurring" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <Icon name="calendar" size={13} /> Recurring
              </Link>
              {isSplit && <div className="inv-search-wrap">
                <Icon name="search" size={13} color="var(--ink3)" className="inv-search-icon" />
                <input className="inv-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice, client, BL…" />
              </div>}
              {!isSplit && (
                <div className="inv-view-toggle" role="group" aria-label="Invoice view">
                  <button type="button" className={viewMode === 'board' ? 'is-active' : ''} onClick={() => setViewMode('board')} aria-pressed={viewMode === 'board'} data-ui-native-button="">
                    <Icon name="columns" size={14} /> Board
                  </button>
                  <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} data-ui-native-button="">
                    <Icon name="list" size={14} /> List
                  </button>
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={() => { setSelectedId(null); setMode('create'); }}
            className="inv-toolbar-cta"
            style={{ padding: 'var(--ds-btn-py-sm) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
            <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> Create Invoice
          </button>
          </div>

          {/* List and board share the same filters and invoice detail panel. */}
          {viewMode === 'list' || isSplit ? <div className="inv-table-wrap">
            <table className="rtbl inv-table">
              <thead>
                <tr>
                  <th className="th--checkbox">
                    {/* .th--checkbox centers via text-align, which only
                        centers inline-level children – Checkbox's root is
                        display:grid (block-level), so it needs mx-auto to
                        land centered instead of flush left in the column. */}
                    <Checkbox className="mx-auto" checked={allFilteredSelected} onCheckedChange={toggleSelectAllFiltered} title="Select all" />
                  </th>
                  <th className="th--sortable" onClick={() => setSortAsc(v => !v)}>
                    <span>Invoice # <Icon name={sortAsc ? 'arrowUp' : 'arrowDown'} size={11} color="var(--ink3)" /></span>
                  </th>
                  {!isSplit && <th>BL / AWB</th>}
                  <th>Customer</th>
                  {!isSplit && <th>Mode</th>}
                  <th className="th--right">Total</th>
                  <th>Date</th>
                  {!isSplit && <th>Due</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(!apiLoading ? filtered : []).map(inv => {
                  const isSelected = inv.id === selectedId;
                  const isChecked = selectedIds.has(inv.id);
                  const st = getStatusStyle(inv.status);
                  const total = invoiceTotals(inv).documentTotal;
                  return (
                    <tr key={inv.id}
                      className={isSelected ? 'inv-row--selected' : ''}
                      onClick={() => { if (mode !== 'edit' && mode !== 'create') { setDetailInvoice(inv); setSelectedId(inv.id); setMode('view'); } }}>
                      <td className="th--checkbox" onClick={e => e.stopPropagation()}>
                        <Checkbox className="mx-auto" checked={isChecked} onCheckedChange={() => toggleSelect(inv.id)} />
                      </td>
                      <td><span className="inv-cell-id">{inv.id}</span></td>
                      {!isSplit && (
                        <td>
                          <Link to={`/clearos/ops?search=${encodeURIComponent(inv.blNumber)}`} onClick={e => e.stopPropagation()}
                            title={`Open shipment ${inv.blNumber} in Ops Command`} className="inv-cell-link">
                            {inv.blNumber}
                          </Link>
                        </td>
                      )}
                      <td className="inv-cell-client">
                        {/* Customers.tsx only reads ?id=, not ?search= – a
                            name-search param there was silently ignored, so
                            this deep-links straight to the record instead
                            (falls back to the plain list on legacy invoices
                            with no linked customer). */}
                        <Link to={inv.customerId ? `/crm/customers?id=${encodeURIComponent(inv.customerId)}` : '/crm/customers'} onClick={e => e.stopPropagation()}
                          title={`View ${inv.client} profile`} className="inv-cell-client-link">
                          {inv.client}
                        </Link>
                      </td>
                      {!isSplit && <td><span className="inv-mode-badge" data-mode={inv.mode}>{inv.mode}</span></td>}
                      <td className="inv-cell-total">{formatAmount(total, inv.documentCurrency || 'TZS')}</td>
                      <td className="inv-cell-date">{inv.billDate}</td>
                      {!isSplit && <td className={`inv-cell-due${inv.status === 'Overdue' ? ' inv-cell-due--overdue' : ''}`}>{inv.dueDate ?? '–'}</td>}
                      <td><span className="inv-status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
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
                    <button type="button" className="btn btn-primary" onClick={() => { setSelectedId(null); setMode('create'); }} data-ui-native-button="">
                      <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> Create New Invoice
                    </button>
                  </td></tr>
                )}
                {!apiLoading && !loadError && filtered.length === 0 && (!!search || filterStatus !== 'all' || activeFilterCount > 0) && (
                  <tr><td colSpan={10} className="inv-table-msg">No invoices match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div> : (
            <div className="inv-board" aria-label="Invoices board">
              {boardStatuses.map(status => {
                const statusInvoices = filtered.filter(invoice => invoice.status === status);
                const style = getStatusStyle(status);
                const statusTotal = statusInvoices.reduce((sum, invoice) => sum + invoiceTotals(invoice).documentTotal, 0);
                return (
                  <section className="inv-board-column" key={status} aria-labelledby={`invoice-column-${status}`}>
                    <header className="inv-board-column-head">
                      <div><span className="inv-board-dot" style={{ background: style.color }} /><strong id={`invoice-column-${status}`}>{style.label}</strong><span>{statusInvoices.length}</span></div>
                      <span>{statusInvoices.length ? formatAmount(statusTotal, statusInvoices[0].documentCurrency || 'TZS') : '—'}</span>
                    </header>
                    <div className="inv-board-cards">
                      {statusInvoices.map(invoice => {
                        const totalValue = invoiceTotals(invoice).documentTotal;
                        return (
                          <button key={invoice.id} type="button" className="inv-board-card" onClick={() => { setDetailInvoice(invoice); setSelectedId(invoice.id); setMode('view'); }} data-ui-native-button="">
                            <span className="inv-board-card-top"><strong>{invoice.id}</strong><span className="inv-mode-badge" data-mode={invoice.mode}>{invoice.mode}</span></span>
                            <span className="inv-board-client">{invoice.client}</span>
                            <span className="inv-board-card-meta"><span>{invoice.blNumber || 'No BL / AWB'}</span><strong>{formatAmount(totalValue, invoice.documentCurrency || 'TZS')}</strong></span>
                            <span className="inv-board-card-meta"><span>Issued {invoice.billDate}</span><span className={invoice.status === 'Overdue' ? 'inv-board-overdue' : ''}>Due {invoice.dueDate ?? '—'}</span></span>
                          </button>
                        );
                      })}
                      {!apiLoading && statusInvoices.length === 0 && <div className="inv-board-empty">No {style.label.toLowerCase()} invoices</div>}
                    </div>
                  </section>
                );
              })}
              {apiLoading && <div className="inv-board-loading">Loading invoices…</div>}
            </div>
          )}

          {/* Footer summary */}
          {loadError && <div role="alert" className="p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError} <Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button></div>}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3" aria-label="Invoice pagination">
            <span className="text-sm">Page {page} of {Math.max(1, Math.ceil(total / 25))} · {total} matches</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={apiLoading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
              <Button variant="outline" disabled={apiLoading || page * 25 >= total} onClick={() => setPage(value => value + 1)}>Next</Button>
            </div>
          </div>
          {!apiLoading && !isSplit && filtered.length > 0 && (
            <div className="inv-list-footer">
              <span style={{ color: 'var(--ink3)' }}>{filtered.length} of {total} invoices · Select visible rows to export</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="inv-detail-panel" style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          {mode === 'view' && selectedInvoice && (
            <InvoiceDetailPanel inv={selectedInvoice} onClose={() => { setMode('list'); setSelectedId(null); }} onEdit={() => setMode('edit')} onCopy={handleCopyInvoice} onDelete={handleDeleteInvoice} onRecordPayment={handleRecordPayment} onSubmitTRA={handleSubmitTRA} isMobile={isMobile} />
          )}
          {mode === 'edit' && selectedInvoice && (
            <InvoiceEditor initial={selectedInvoice} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => setMode('view')} isMobile={isMobile} />
          )}
          {mode === 'create' && (
            <InvoiceEditor initial={null} nextId={nextId} onSave={handleSaveInvoice} onCancel={() => { setMode('list'); setSelectedId(null); }} isMobile={isMobile} presetCustomer={presetCustomer} presetShipment={presetShipment} />
          )}
        </div>
      </div>

      {/* Batch Payments modal */}
    </div>
  );
};
