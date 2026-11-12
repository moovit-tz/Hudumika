import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Quote {
  id: string; number: string; rfq_id: string | null; customer_id: string | null; version: number;
  previous_version_id: string | null; status: string; currency: string;
  subtotal_minor: number; margin_total_minor: number; total_minor: number; created_at: string;
}
interface QuoteItem {
  id: string; pn_free_text: string | null; description: string | null; quantity: number;
  part_cost_minor: number; freight_minor: number; duty_vat_minor: number; clearance_fee_minor: number;
  handling_minor: number; margin_percent: number; line_cost_minor: number; margin_minor: number; sell_price_minor: number;
}
interface Customer { id: string; name: string }
interface Rfq { id: string; number: string }
interface DraftItem {
  pn_free_text: string; quantity: number; part_cost_minor: string; freight_minor: string;
  duty_vat_minor: string; clearance_fee_minor: string; handling_minor: string; margin_percent: string;
}
const EMPTY_ITEM: DraftItem = { pn_free_text: '', quantity: 1, part_cost_minor: '0', freight_minor: '0', duty_vat_minor: '0', clearance_fee_minor: '0', handling_minor: '0', margin_percent: '0' };

const QUOTE_BADGE: Record<string, 'gray' | 'info' | 'success' | 'error' | 'warning' | 'brand'> = {
  draft: 'gray', sent: 'info', accepted: 'success', rejected: 'error', expired: 'error', superseded: 'gray', converted: 'brand',
};
const TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'], sent: ['accepted', 'rejected', 'expired'], accepted: ['converted'], rejected: [], expired: [], superseded: [], converted: [],
};

const money = (minor: number) => (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });


export function GerejiAngaQuotes() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<QuoteItem[]>([]);

  const [rfqId, setRfqId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/anga/quotes').then(d => setRows(d.quotes ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/anga/customers').then(d => setCustomers(d.customers ?? []));
    apiFetch('/v1/gereji/anga/rfqs').then(d => setRfqs(d.rfqs ?? []));
  }, [reload]);

  useEffect(() => {
    const presetRfq = params.get('rfq');
    if (presetRfq) { setRfqId(presetRfq); setOpen(true); }
  }, [params]);

  const filtered = q.trim() ? rows.filter(r => r.number.toLowerCase().includes(q.toLowerCase())) : rows;

  function resetForm() { setRfqId(''); setCustomerId(''); setCurrency('USD'); setItems([{ ...EMPTY_ITEM }]); }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function computeSellPreview(it: DraftItem) {
    const lineCost = (Number(it.part_cost_minor) || 0) + (Number(it.freight_minor) || 0) + (Number(it.duty_vat_minor) || 0) + (Number(it.clearance_fee_minor) || 0) + (Number(it.handling_minor) || 0);
    const margin = Math.round(lineCost * ((Number(it.margin_percent) || 0) / 100));
    return lineCost + margin;
  }

  async function create() {
    if (items.some(it => !it.pn_free_text.trim())) { showAlert('Every item needs a part number.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/quotes', {
        method: 'POST',
        body: JSON.stringify({
          rfq_id: rfqId || undefined, customer_id: customerId || undefined, currency,
          items: items.map(it => ({
            pn_free_text: it.pn_free_text.trim(), quantity: it.quantity,
            part_cost_minor: Math.round(Number(it.part_cost_minor) * 100) || 0,
            freight_minor: Math.round(Number(it.freight_minor) * 100) || 0,
            duty_vat_minor: Math.round(Number(it.duty_vat_minor) * 100) || 0,
            clearance_fee_minor: Math.round(Number(it.clearance_fee_minor) * 100) || 0,
            handling_minor: Math.round(Number(it.handling_minor) * 100) || 0,
            margin_percent: Number(it.margin_percent) || 0,
          })),
        }),
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create quote.'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, status: string) {
    try {
      await apiFetch(`/v1/gereji/anga/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function version(id: string) {
    try {
      await apiFetch(`/v1/gereji/anga/quotes/${id}/version`, { method: 'POST' });
      showAlert('New draft version created.', { variant: 'success' });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function expand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const d = await apiFetch(`/v1/gereji/anga/quotes/${id}`).catch(() => ({ items: [] }));
    setExpandedItems(d.items ?? []);
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Parts"
        titleEm="quotes"
        subtitle="Cost build-up, margin and multi-currency pricing — one source of truth per version."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Quote</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search quote number..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No quotes yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Quote #', 'Version', 'Customer', 'Status', 'Total', 'Created', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(r => {
                    const customer = customers.find(c => c.id === r.customer_id);
                    return (
                      <React.Fragment key={r.id}>
                        <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => expand(r.id)}>
                          <td style={{ ...TD, fontWeight: 600 }}>{r.number}</td>
                          <td style={{ ...TD, color: 'var(--ink3)' }}>v{r.version}</td>
                          <td style={TD}>{customer?.name ?? '—'}</td>
                          <td style={TD}><Badge variant={QUOTE_BADGE[r.status] ?? 'gray'}>{r.status}</Badge></td>
                          <td style={{ ...TD, fontWeight: 600 }}>{money(r.total_minor)} {r.currency}</td>
                          <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(r.created_at)}</td>
                          <td style={{ ...TD, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(TRANSITIONS[r.status] ?? []).map(s => <DropdownMenuItem key={s} onClick={() => transition(r.id, s)}>Mark {s}</DropdownMenuItem>)}
                                {r.status !== 'converted' && <DropdownMenuItem onClick={() => version(r.id)}>New version</DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                        {expanded === r.id && (
                          <tr><td colSpan={7} style={{ padding: 0, background: 'var(--card-sunken, var(--bg))' }}>
                            <div style={{ padding: '12px 24px' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items</div>
                              {expandedItems.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No items.</div> : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                  <thead><tr>{['PN', 'Qty', 'Cost', 'Margin %', 'Sell Price'].map(h => <th key={h} style={{ ...TH, fontSize: 10, padding: '6px 12px' }}>{h}</th>)}</tr></thead>
                                  <tbody>
                                    {expandedItems.map(it => (
                                      <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px 12px', color: 'var(--ink)' }}>{it.pn_free_text ?? it.description ?? '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{it.quantity}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{money(it.line_cost_minor)}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{it.margin_percent}%</td>
                                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--ink)' }}>{money(it.sell_price_minor)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New quote</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
                <div>
                  <label style={LABEL}>RFQ (optional)</label>
                  <Select value={rfqId} onValueChange={setRfqId}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{rfqs.map(r => <SelectItem key={r.id} value={r.id}>{r.number}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={LABEL}>Customer</label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><label style={LABEL}>Currency</label><Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={LABEL as React.CSSProperties}>Line items (cost build-up)</label>
                  <Button variant="ghost" size="sm" onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])}><Icon name="plus" size={12} /> Add line</Button>
                </div>
                {items.map((it, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 10, marginBottom: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px auto', gap: 8, marginBottom: 8 }}>
                      <Input placeholder="Part number" value={it.pn_free_text} onChange={e => updateItem(i, { pn_free_text: e.target.value })} />
                      <Input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, { quantity: Number(e.target.value) || 1 })} placeholder="Qty" />
                      <Button variant="ghost" size="icon" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} disabled={items.length === 1}><Icon name="close" size={14} /></Button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                      <Input type="number" min={0} value={it.part_cost_minor} onChange={e => updateItem(i, { part_cost_minor: e.target.value })} placeholder="Part cost" />
                      <Input type="number" min={0} value={it.freight_minor} onChange={e => updateItem(i, { freight_minor: e.target.value })} placeholder="Freight" />
                      <Input type="number" min={0} value={it.duty_vat_minor} onChange={e => updateItem(i, { duty_vat_minor: e.target.value })} placeholder="Duty/VAT" />
                      <Input type="number" min={0} value={it.clearance_fee_minor} onChange={e => updateItem(i, { clearance_fee_minor: e.target.value })} placeholder="Clearance" />
                      <Input type="number" min={0} value={it.handling_minor} onChange={e => updateItem(i, { handling_minor: e.target.value })} placeholder="Handling" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                      <Input type="number" min={0} value={it.margin_percent} onChange={e => updateItem(i, { margin_percent: e.target.value })} placeholder="Margin %" style={{ maxWidth: 110 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Sell price: <strong style={{ color: 'var(--teal)' }}>{(computeSellPreview(it) / 100).toFixed(2)} {currency}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} loadingText="Creating…">Create quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
