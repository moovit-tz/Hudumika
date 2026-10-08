import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { PickerItem } from '../components/EntityPicker.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { useCurrency } from '../hooks/useCurrency.js';
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
  const { fmt } = useCurrency();
  const location = useLocation();
  const [invoices, setInvoices]         = useState<Invoice[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [presetCustomer, setPresetCustomer] = useState<PickerItem | null>(null);
  const [presetShipment, setPresetShipment] = useState<any | null>(null);

  useEffect(() => {
    apiFetch('/v1/invoices')
      .then((data: any) => {
        setInvoices(Array.isArray(data) ? data.map(mapApiInvoice) : []);
      })
      .catch(() => setInvoices([]))
      .finally(() => setApiLoading(false));
  }, []);
  const [mode, setMode]                 = useState<PageMode>('list');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch]             = useState('');
  const [sortAsc, setSortAsc]           = useState(false);

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
    const params = new URLSearchParams(location.search);
    const invoiceId = params.get('id');
    if (!invoiceId || !invoices.length) return;
    // A deep link may carry either the display id (invoice_number, what
    // this page's own rows are keyed by) or the real database UUID
    // (_dbId) – a note's subject_id (NotesApp.tsx's "Related to" link)
    // always stores the real UUID, never the display number, so matching
    // on i.id alone silently failed for any invoice linked from a note.
    const match = invoices.find(i => i.id === invoiceId || i._dbId === invoiceId);
    if (match) {
      setSelectedId(match.id);
      setMode('view');
    }
  }, [location.search, invoices]);

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

  const selectedInvoice = selectedId ? (invoices.find(i => i.id === selectedId) ?? null) : null;
  const isSplit = mode !== 'list';

  const maxNumber = Math.max(...invoices.map(i => parseInt(i.id.match(/\d{4}/g)?.pop() || '0')), 0);
  const nextId = `CLR-2026-${String(maxNumber + 1).padStart(4, '0')} INV`;

  const billDateToIso = (d: string) => { const [dd, mm, yyyy] = d.split('-'); return `${yyyy}-${mm}-${dd}`; };

  const filtered = invoices
    .filter(inv => filterStatus === 'all' || inv.status === filterStatus)
    .filter(inv => filterMode === 'all' || inv.mode === filterMode)
    .filter(inv => !filterDateFrom || (inv.billDate && billDateToIso(inv.billDate) >= filterDateFrom))
    .filter(inv => !filterDateTo || (inv.billDate && billDateToIso(inv.billDate) <= filterDateTo))
    .filter(inv => !search || [inv.client, inv.id, inv.blNumber].some(s => s.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));

  const invStats = (() => {
    const draftCount = invoices.filter(i => i.status === 'Draft').length;
    const paidCount = invoices.filter(i => i.status === 'Paid').length;
    const overdueInvoices = invoices.filter(i => i.status === 'Overdue');
    const overdueTotal = overdueInvoices.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - i.received), 0);
    const outstandingTotal = invoices.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - i.received), 0);
    const totalReceived = invoices.reduce((s, i) => s + i.received, 0);
    const totalBilled = invoices.reduce((s, i) => s + invoiceTotal(i), 0);
    return {
      total: invoices.length, draftCount, paidCount,
      outstandingTotal, overdueTotal, dueSoonTotal: Math.max(0, outstandingTotal - overdueTotal),
      totalReceived,
      collectionRate: totalBilled ? Math.round((totalReceived / totalBilled) * 100) : 0,
    };
  })();

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
      ['Invoice ID', 'Client', 'BL/AWB', 'Origin', 'Destination', 'Mode', 'Date', 'Due Date', 'Status', 'Grand Total (TZS)', 'Received (TZS)', 'Balance Due (TZS)'],
      ...selectedInvoicesList.map(inv => {
        const total = invoiceTotal(inv);
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

  function handleSaveInvoice(inv: Invoice) {
    const isCreate = mode === 'create';
    if (isCreate) {
      setInvoices(prev => [inv, ...prev]);
      setSelectedId(inv.id);
    } else {
      setInvoices(prev => prev.map(i => i.id === inv.id ? inv : i));
    }
    setMode('view');

    const apiPayload = {
      invoice_number: inv.id,
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
      ref_code: inv.refCode,
      version: inv.version,
      notes: '',
      items: inv.items.map((it, i) => ({
        name: it.name, unit: it.unit, rate: it.rate, qty: it.qty,
        tax_pct: it.taxPct, line_group: it.group, currency: it.currency, sort_order: i,
      })),
    };
    const dbId = (!isCreate && selectedInvoice?._dbId) ? selectedInvoice._dbId : null;
    apiFetch(dbId ? `/v1/invoices/${dbId}` : '/v1/invoices', {
      method: dbId ? 'PATCH' : 'POST',
      body: JSON.stringify(apiPayload),
    }).then(() => apiFetch('/v1/invoices'))
      .then((data: any) => { if (Array.isArray(data)) setInvoices(data.map(mapApiInvoice)); })
      .catch(() => {});
  }

  function handleCopyInvoice() {
    if (!selectedInvoice) return;
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    const newId = nextId;
    const copy: Invoice = { ...selectedInvoice, id: newId, status: 'Draft', received: 0, billDate: today, dueDate: null, version: 1, refCode: genRefCode(newId, 1) };
    setInvoices(prev => [copy, ...prev]);
    setSelectedId(copy.id);
    setMode('view');
  }

  async function handleDeleteInvoice() {
    if (!selectedInvoice || !(await showConfirm(`Delete ${selectedInvoice.id}? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    if (selectedInvoice._dbId) {
      apiFetch(`/v1/invoices/${selectedInvoice._dbId}`, { method: 'DELETE' }).catch(() => {});
    }
    setInvoices(prev => prev.filter(i => i.id !== selectedInvoice.id));
    setSelectedId(null); setMode('list');
  }

  function handleRecordPayment(amount: number, payMethod: string, payDate: string) {
    if (!selectedInvoice) return;
    const newReceived = Math.min(selectedInvoice.received + amount, invoiceTotal(selectedInvoice));
    const newStatus: Status = newReceived >= invoiceTotal(selectedInvoice) ? 'Paid' : 'Partial';
    setInvoices(prev => prev.map(i => i.id === selectedInvoice.id ? { ...i, received: newReceived, status: newStatus } : i));
    if (selectedInvoice._dbId) {
      apiFetch(`/v1/invoices/${selectedInvoice._dbId}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount, method: payMethod, payment_date: payDate }),
      }).then(() => apiFetch('/v1/invoices'))
        .then((data: any) => { if (Array.isArray(data)) setInvoices(data.map(mapApiInvoice)); })
        .catch(() => {});
    }
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
          title: 'Outstanding', value: fmt(invStats.outstandingTotal, 'TZS'),
          invertTrend: true,
          sub1Label: 'DUE SOON', sub1Value: fmt(invStats.dueSoonTotal, 'TZS'),
          sub2Label: 'OVERDUE', sub2Value: fmt(invStats.overdueTotal, 'TZS'), barHighlight: 'var(--red)',
        },
        {
          title: 'Total Received', value: fmt(invStats.totalReceived, 'TZS'),
          sub1Label: 'PAID', sub1Value: String(invStats.paidCount),
          sub2Label: 'ALL INVOICES', sub2Value: String(invStats.total), barHighlight: 'var(--green)',
        },
        {
          title: 'Collection Rate', value: `${invStats.collectionRate}%`,
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
              <Tabs value={filterStatus} onValueChange={v => setFilterStatus(v as FilterStatus)} variant="segmented">
                <TabsList>
                  {(['all', 'Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited'] as FilterStatus[]).map(s => {
                    const cnt = s === 'all' ? invoices.length : invoices.filter(i => i.status === s).length;
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
              {selectedIds.size > 0 && (
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
              <div className="inv-search-wrap">
                <Icon name="search" size={13} color="var(--ink3)" className="inv-search-icon" />
                <input className="inv-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice, client, BL…" />
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { setSelectedId(null); setMode('create'); }}
            className="inv-toolbar-cta"
            style={{ padding: 'var(--ds-btn-py-sm) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
            <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> Create Invoice
          </button>
          </div>

          {/* Table */}
          <div className="inv-table-wrap">
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
                  <th className="th--right">Total (TZS)</th>
                  <th>Date</th>
                  {!isSplit && <th>Due</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const isSelected = inv.id === selectedId;
                  const isChecked = selectedIds.has(inv.id);
                  const st = getStatusStyle(inv.status);
                  const total = invoiceTotal(inv);
                  return (
                    <tr key={inv.id}
                      className={isSelected ? 'inv-row--selected' : ''}
                      onClick={() => { if (mode !== 'edit' && mode !== 'create') { setSelectedId(inv.id); setMode('view'); } }}>
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
                      <td className="inv-cell-total">{fmt(total, 'TZS')}</td>
                      <td className="inv-cell-date">{inv.billDate}</td>
                      {!isSplit && <td className={`inv-cell-due${inv.status === 'Overdue' ? ' inv-cell-due--overdue' : ''}`}>{inv.dueDate ?? '–'}</td>}
                      <td><span className="inv-status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    </tr>
                  );
                })}
                {apiLoading && (
                  <tr><td colSpan={10} className="inv-table-msg">Loading invoices…</td></tr>
                )}
                {!apiLoading && filtered.length === 0 && invoices.length === 0 && (
                  <tr><td colSpan={10} className="inv-table-msg">
                    <div className="inv-empty-title">No invoices yet</div>
                    <div className="inv-empty-sub">Create your first invoice to start billing customers.</div>
                    <button type="button" className="btn btn-primary" onClick={() => { setSelectedId(null); setMode('create'); }} data-ui-native-button="">
                      <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> Create New Invoice
                    </button>
                  </td></tr>
                )}
                {!apiLoading && filtered.length === 0 && invoices.length > 0 && (
                  <tr><td colSpan={10} className="inv-table-msg">No invoices match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          {!isSplit && filtered.length > 0 && (
            <div className="inv-list-footer">
              <span style={{ color: 'var(--ink3)' }}>{filtered.length} invoices</span>
              <span style={{ color: 'var(--ink2)' }}>Total: <strong style={{ fontFamily: 'var(--font)', color: 'var(--ink)' }}>{fmt(filtered.reduce((s, i) => s + invoiceTotal(i), 0), 'TZS')}</strong></span>
              <span style={{ color: 'var(--ink2)' }}>Received: <strong style={{ fontFamily: 'var(--font)', color: 'var(--green)' }}>{fmt(filtered.reduce((s, i) => s + i.received, 0), 'TZS')}</strong></span>
              <span style={{ color: 'var(--ink2)' }}>Outstanding: <strong style={{ fontFamily: 'var(--font)', color: 'var(--red)' }}>{fmt(filtered.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - i.received), 0), 'TZS')}</strong></span>
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
