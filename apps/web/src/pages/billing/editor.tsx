import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { apiFetch } from '../../lib/api.js';
import { EntityPicker, PickerItem } from '../../components/EntityPicker.js';
import { FormPage } from '../../components/FormPage.js';
import { Combobox } from '../../components/ui/combobox.js';
import { useFinanceConfiguration } from '../../hooks/useFinanceConfiguration.js';
import { useFinanceCapabilities } from '../../hooks/useFinanceCapabilities.js';
import type { Invoice, LineItem, ChargeGroup, Currency, InvoiceDraft, EditItem } from './shared.js';
export type { EditItem };
import { fmtTZS, fmtUSD, fmtAmt, genRefCode, UNIT_OPTIONS, saveInvoiceDraft, takeInvoiceDraft } from './shared.js';

/* ── Small helpers ── */
function FormField({ label, value, onChange, placeholder, disabled, mono }: { label: string; value: string; onChange?: (v: string) => void; placeholder?: string; disabled?: boolean; mono?: boolean }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{label}</label>
      <input value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: disabled ? 'var(--bg)' : 'var(--white)', color: disabled ? 'var(--ink3)' : 'var(--ink)', fontSize: 13, fontFamily: mono ? 'var(--font)' : 'var(--font)', outline: 'none', boxSizing: 'border-box' as const }} />
    </div>
  );
}

/* ── Charge section table (view mode) ── */
export function ChargeSectionView({ title, color, currency, items, subTotal, taxAmt, sectionTotal }: {
  title: string; color: string; currency: Currency;
  items: LineItem[]; subTotal: number; taxAmt: number; sectionTotal: number;
}) {
  const fmt = (n: number) => fmtAmt(n, currency);
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--primary-foreground))', background: color, padding: '6px 14px', borderRadius: 'var(--r) var(--r) 0 0' }}>{title}</div>
      <div className="rtbl-wrap" style={{ border: '1px solid var(--border)', borderTop: 'none' }}>
      <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Item', 'Unit', 'Amount/Unit', 'Qty', 'Sub Total', 'VAT Tax', 'Total Amount'].map((h, i) => (
              <th key={h} style={{ padding: '7px 10px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: '10px 12px', color: 'var(--ink3)', fontStyle: 'italic', fontSize: 12 }}>No charges – 0</td></tr>
          ) : items.map((item, i) => {
            const lineSub = item.qty * item.rate;
            const lineTax = lineSub * item.taxPct / 100;
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', verticalAlign: 'top' }}>{item.name}</td>
                <td style={{ padding: '10px', fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{item.unit}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 12, verticalAlign: 'top' }}>{fmt(item.rate)}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontSize: 12, verticalAlign: 'top' }}>{item.qty}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 12, verticalAlign: 'top' }}>{fmt(lineSub)}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 12, color: lineTax > 0 ? 'var(--ink)' : 'var(--ink3)', verticalAlign: 'top' }}>{lineTax > 0 ? fmt(lineTax) : '0'}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, color: 'var(--ink)', verticalAlign: 'top' }}>{fmt(lineSub + lineTax)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
            <td colSpan={4} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>SUB-TOTAL</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700 }}>{fmt(subTotal)}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 12 }}>{taxAmt > 0 ? fmt(taxAmt) : '–'}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 800, color }}>{fmt(sectionTotal)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

/* ── Import Timesheets Modal ── */
// A logged time entry that carries its own rate – snapshotted at log time from
// the Products & Services catalog (see migration 143), never a re-join, so it
// still reads correctly a year later even if the catalog price changed since.
interface RatedTimeEntry {
  id: string; member: string; task_ref: string | null; hours: number;
  log_date: string; product_id: string | null; service_name: string | null;
  service_rate: number | null; service_currency: string | null; service_unit: string | null;
}

// hourly-unit services bill hours × rate; everything else (per-shipment,
// per-container, per-set, ...) bills the flat rate once – the same rule
// TimesheetsTab.entryAmount() uses, kept in sync with it.
function timeEntryAmount(e: RatedTimeEntry): number {
  if (e.service_rate == null) return 0;
  return e.service_unit === 'hour' || e.service_unit === 'hr' ? e.hours * e.service_rate : e.service_rate;
}

function ImportTimesheetsModal({ shipmentId, shipmentRef, sectionCurrency, onImport, onClose }: {
  shipmentId: string; shipmentRef: string; sectionCurrency: Currency;
  onImport: (lines: Omit<EditItem, 'uid'>[]) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<RatedTimeEntry[]>([]);
  const [otherCurrencyCount, setOtherCurrencyCount] = useState(0);
  const [taxByProduct, setTaxByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      // The real source: logged, rated shipment time entries – not the
      // shipment record itself, which never carries them.
      apiFetch(`/v1/shipments/${shipmentId}/time-entries`).catch(() => ({ data: [] })),
      apiFetch('/v1/products?status=active').catch(() => []),
    ]).then(([teRes, prodRes]: [any, any]) => {
      const rows: any[] = Array.isArray(teRes) ? teRes : (teRes?.data ?? []);
      // Billable = actually tagged with a real service at log time. An entry
      // logged with no product has no rate to bill and is left off the list
      // rather than guessed at.
      const rated = rows.filter(r => r.service_rate != null);
      const sameCurrency = rated.filter(r => (r.service_currency || 'TZS') === sectionCurrency);
      setOtherCurrencyCount(rated.length - sameCurrency.length);
      setEntries(sameCurrency);
      setSelected(new Set(sameCurrency.map((r: any) => r.id)));

      const products: any[] = Array.isArray(prodRes) ? prodRes : (prodRes?.data ?? []);
      setTaxByProduct(new Map(products.map(p => [p.id, Number(p.tax_rate) || 0])));
    }).finally(() => setLoading(false));
  }, [shipmentId, sectionCurrency]);

  function handleImport() {
    const lines = entries.filter(e => selected.has(e.id)).map(e => ({
      name: e.service_name || 'Logged time',
      unit: e.service_unit || 'PER HR',
      rate: e.service_rate || 0,
      qty: e.service_unit === 'hour' || e.service_unit === 'hr' ? e.hours : 1,
      taxPct: e.product_id ? (taxByProduct.get(e.product_id) ?? 0) : 0,
      group: 'other' as ChargeGroup,
      currency: sectionCurrency,
    }));
    onImport(lines);
  }

  const selectedTotal = entries.filter(e => selected.has(e.id)).reduce((s, e) => s + timeEntryAmount(e), 0);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose className="max-w-130 flex flex-col max-h-[90vh] p-0 gap-0 overflow-hidden">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
          <DialogTitle style={{ fontSize: 14 }}>Import Timesheets</DialogTitle>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }} aria-label="Close"><Icon name="x" size={16} color="var(--ink2)" /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 4 }}>
            {loading ? 'Loading…' : `${entries.length} rated time entr${entries.length === 1 ? 'y' : 'ies'} for`} <strong style={{ color: 'var(--ink)' }}>{shipmentRef}</strong>, each at the rate it was logged against.
          </div>
          {otherCurrencyCount > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
              {otherCurrencyCount} more {otherCurrencyCount === 1 ? 'entry is' : 'entries are'} rated in a different currency – add {otherCurrencyCount === 1 ? 'it' : 'them'} from the matching charges section instead.
            </div>
          )}
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>Loading timesheets…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>No time entries with a billable rate found. Time logged with no service attached has nothing to bill and isn't listed.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              {entries.map(e => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected.has(e.id) ? 'var(--teal-l)' : 'var(--white)' }}>
                  <Checkbox checked={selected.has(e.id)} onCheckedChange={() => {
                    setSelected(prev => {
                      const next = new Set(prev);
                      if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                      return next;
                    });
                  }} />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
                    <div style={{ fontWeight: 600 }}>{e.service_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{e.member} · {new Date(e.log_date).toLocaleDateString()} · {fmtAmt(e.service_rate || 0, sectionCurrency)}/{e.service_unit || 'unit'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--font)', fontSize: 13 }}>{fmtAmt(timeEntryAmount(e), sectionCurrency)}</div>
                    {(e.service_unit === 'hour' || e.service_unit === 'hr') && <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{Number(e.hours).toFixed(1)} hrs</div>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--bg)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
            {selected.size > 0 && <>Total: <strong style={{ fontFamily: 'var(--font)' }}>{fmtAmt(selectedTotal, sectionCurrency)}</strong></>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={handleImport} disabled={selected.size === 0}>Import {selected.size} {selected.size === 1 ? 'Entry' : 'Entries'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Charge section editor ── */
function ChargeSectionEditor({ title, color, group, currency, items, onChange, customerId }: {
  title: string; color: string; group: ChargeGroup; currency: Currency;
  items: EditItem[]; onChange: (items: EditItem[]) => void;
  /** When set, the catalog is priced for this customer – an agreed contract
   *  price replaces the list price on the item that is picked. */
  customerId?: string;
}) {
  const fmt = (n: number) => fmtAmt(n, currency);
  const add = () => onChange([...items, { uid: String(Date.now()), name: '', unit: 'PER BIL', rate: 0, qty: 1, taxPct: 0, group, currency }]);
  const remove = (uid: string) => onChange(items.filter(i => i.uid !== uid));
  const update = (uid: string, k: keyof EditItem, v: string | number) =>
    onChange(items.map(i => i.uid === uid ? { ...i, [k]: v } : i));

  const productCacheRef = useRef<Map<string, any>>(new Map());
  async function searchProducts(q: string): Promise<PickerItem[]> {
    const qs = `?status=active${customerId ? `&customer_id=${encodeURIComponent(customerId)}` : ''}${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ''}`;
    const res: any = await apiFetch(`/v1/products${qs}`).catch(() => []);
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    // This section's rate/tax math sums raw numbers under one shared currency
    // (see sub()/tax()/tot() above) – a catalog item priced in a different
    // currency than the section would silently blend into that total as if
    // its number were already in `currency`, badly under- or over-stating the
    // charge (e.g. a $150 USD line read as 150 TZS). Only offer same-currency
    // items here; the other currency's items are one click away in the
    // section paying in that currency.
    const sameCurrency = list.filter((p) => (p.currency || 'TZS') === currency);
    sameCurrency.forEach((p) => productCacheRef.current.set(p.id, p));
    return sameCurrency.slice(0, 25).map((p) => ({
      id: p.id, label: p.name,
      sublabel: [p.code, `${fmtAmt(Number(p.sale_price) || 0, (p.currency || 'TZS') as Currency)}/${p.unit}${p.has_agreed_price ? ' · agreed' : ''}`].filter(Boolean).join(' · '),
    }));
  }
  function addFromProduct(item: PickerItem | null) {
    if (!item) return;
    const p = productCacheRef.current.get(item.id);
    if (!p) return;
    onChange([...items, {
      uid: String(Date.now()), name: p.name, unit: p.unit || 'PER BIL',
      rate: Number(p.sale_price) || 0, qty: 1, taxPct: Number(p.tax_rate) || 0,
      group, currency,
    }]);
  }

  const inpS: React.CSSProperties = { padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--primary-foreground))', background: color, padding: '6px 14px', borderRadius: 'var(--r) var(--r) 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{title}</span>
        <span style={{ fontSize: 10, opacity: 0.85 }}>{currency}</span>
      </div>
      <div className="rtbl-wrap" style={{ border: '1px solid var(--border)', borderTop: 'none' }}>
      <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['', '#', 'Item Name', 'Unit', 'Rate', 'Qty', 'Tax %', 'Amount', ''].map((h, i) => (
              <th key={i} style={{ padding: '7px 8px', textAlign: i >= 4 && i <= 7 ? 'right' : 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', ...(i === 0 ? { width: 22 } : i === 1 ? { width: 26 } : i === 3 ? { width: 110 } : i === 4 ? { width: 110 } : i === 5 ? { width: 56 } : i === 6 ? { width: 70 } : i === 7 ? { width: 110 } : i === 8 ? { width: 30 } : {}) }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={10} style={{ padding: '12px 10px', color: 'var(--ink3)', fontStyle: 'italic', fontSize: 12, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>No charges – click "Add Item" below</td></tr>
          ) : items.map((item, i) => {
            const lineSub = item.qty * item.rate;
            const lineTax = lineSub * item.taxPct / 100;
            return (
              <tr key={item.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--border)', cursor: 'grab', userSelect: 'none', verticalAlign: 'middle' }}>⋮⋮</td>
                <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--ink3)', textAlign: 'center', verticalAlign: 'middle' }}>{i + 1}</td>
                <td style={{ padding: '6px 4px' }}><input value={item.name} onChange={e => update(item.uid, 'name', e.target.value)} placeholder="Item name" style={{ ...inpS, fontWeight: 600 }} /></td>
                <td style={{ padding: '6px 4px' }}>
                  <Select value={item.unit} onValueChange={v => update(item.uid, 'unit', v)}>
                    <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      {!UNIT_OPTIONS.includes(item.unit) && <SelectItem value={item.unit}>{item.unit}</SelectItem>}
                    </SelectContent>
                  </Select>
                </td>
                <td style={{ padding: '6px 4px' }}><input type="number" min={0} value={item.rate || ''} onChange={e => update(item.uid, 'rate', parseFloat(e.target.value) || 0)} placeholder="0" style={{ ...inpS, textAlign: 'right', fontFamily: 'var(--font)' }} /></td>
                <td style={{ padding: '6px 4px' }}><input type="number" min={1} value={item.qty} onChange={e => update(item.uid, 'qty', Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inpS, textAlign: 'right' }} /></td>
                <td style={{ padding: '6px 4px' }}>
                  <Select value={String(item.taxPct)} onValueChange={v => update(item.uid, 'taxPct', parseInt(v))}>
                    <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td style={{ padding: '6px 10px 6px 4px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {(lineSub + lineTax) > 0 ? fmt(lineSub + lineTax) : '–'}
                </td>
                <td style={{ padding: '6px 4px', verticalAlign: 'middle' }}>
                  {items.length > 0 && (
                    <button type="button" onClick={() => remove(item.uid)}
                      style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <Icon name="trash" size={12} color="var(--red)" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
            <td colSpan={7} style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={add}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 'var(--ds-btn-py-sm) 12px', border: `1px dashed ${color}`, borderRadius: 'var(--r)', background: 'none', color, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-l)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <Icon name="plus" size={12} color={color} /> Add Line Item
                </button>
                <div style={{ width: 220 }}>
                  <EntityPicker value={null} onChange={addFromProduct} search={searchProducts} placeholder="Add from catalog…" />
                </div>
              </div>
            </td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 800, color }} colSpan={2}>
              {fmt(items.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

/* ── Invoice Editor (Create + Edit) ── */
export function InvoiceEditor({ initial, nextId, onSave, onCancel, isMobile = false, presetCustomer = null, presetShipment = null }: {
  initial: Invoice | null; nextId: string;
  onSave: (inv: Invoice) => void; onCancel: () => void; isMobile?: boolean; presetCustomer?: PickerItem | null;
  /** The full shipment record when arriving back from "create a new
   *  shipment" mid-invoice (see createShipment below) – already has
   *  everything handleShipmentChange needs, no second fetch required. */
  presetShipment?: any | null;
}) {
  const navigate = useNavigate();
  const financeConfiguration = useFinanceConfiguration();
  const financeCapabilities = useFinanceCapabilities();
  const canUseBusinessLines = financeCapabilities.isEnabled('finance.accounting.advanced');
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  // Only a fresh "create" editor (no `initial`) ever restores a draft – never
  // let a leftover sessionStorage entry bleed into editing a real invoice.
  // Consumed once (takeInvoiceDraft clears the key) so a plain page refresh
  // afterwards doesn't keep re-applying a stale draft.
  const [draft] = useState<InvoiceDraft | null>(() => (initial ? null : takeInvoiceDraft()));
  const [client, setClient]       = useState(initial?.client ?? draft?.client ?? presetCustomer?.label ?? '');
  const [addr, setAddr]           = useState(draft?.addr ?? initial?.clientAddress.join('\n') ?? '');
  const [billDate, setBillDate]   = useState(draft?.billDate ?? initial?.billDate ?? today);
  const [dueDate, setDueDate]     = useState(draft?.dueDate ?? initial?.dueDate ?? '');
  const [agent, setAgent]         = useState(draft?.agent ?? initial?.saleAgent ?? '');
  const [blNo, setBlNo]           = useState(draft?.blNo ?? initial?.blNumber ?? '');
  const [origin, setOrigin]       = useState(draft?.origin ?? initial?.origin ?? '');
  const [dest, setDest]           = useState(draft?.dest ?? initial?.destination ?? '');
  const [mode, setMode]           = useState<Invoice['mode']>((draft?.mode as Invoice['mode']) ?? initial?.mode ?? 'SEA');
  const [exRate, setExRate]       = useState(draft?.exRate ?? String(initial?.exchangeRate ?? 2650));
  // Never auto-applied – a fetched rate only fills the field when the user
  // clicks "Use this", same provenance rule editable duty/VAT/FX overrides
  // already follow elsewhere: a typed figure must never look system-sourced,
  // and a system-sourced one must stay visibly distinct until accepted.
  const [todayFxRate, setTodayFxRate] = useState<{ rate: number; date: string } | null>(null);
  useEffect(() => {
    apiFetch('/v1/fx-rates/latest?base=USD&quote=TZS').then(setTodayFxRate).catch(() => setTodayFxRate(null));
  }, []);
  const [terms, setTerms]         = useState(draft?.terms ?? initial?.terms ?? 'Payment due within 14 days. All 3rd party charges are estimates and subject to actuals.');
  const [businessLineId, setBusinessLineId] = useState(draft?.businessLineId ?? initial?.businessLineId ?? '');

  const [customer, setCustomer] = useState<PickerItem | null>(
    initial?.customerId ? { id: initial.customerId, label: initial.client } : presetCustomer,
  );
  const [shipment, setShipment] = useState<PickerItem | null>(
    initial?.shipmentRef ? { id: initial.shipmentRef, label: initial.shipmentRef }
      : presetShipment ? { id: presetShipment.ref_number, label: presetShipment.ref_number } : null,
  );
  const customerCacheRef = useRef<Map<string, any>>(new Map());
  const shipmentCacheRef = useRef<Map<string, any>>(new Map());

  /** The full company address a selected customer's own record carries –
   *  name/address/city/country/VAT – not their contact details. Selecting a
   *  customer is supposed to mean never typing this by hand. */
  function applyAddressFromCustomer(full: any) {
    if (!full) return;
    const lines = [
      full.name || null,
      full.address || null,
      [full.city, full.country].filter(Boolean).join(', ') || null,
      (full.vat_number || full.tax_id) ? `VAT: ${full.vat_number || full.tax_id}` : null,
    ].filter(Boolean);
    if (lines.length) setAddr(lines.join('\n'));
  }

  /** Same as applyAddressFromCustomer, but fetches the full record first
   *  when only an id/name is known – e.g. a customer that arrived attached
   *  to a linked shipment rather than picked directly from the customer field. */
  function ensureCustomerAddress(id: string) {
    if (!id) return;
    const cached = customerCacheRef.current.get(id);
    if (cached) { applyAddressFromCustomer(cached); return; }
    apiFetch(`/v1/customers/${id}`)
      .then((full: any) => { customerCacheRef.current.set(id, full); applyAddressFromCustomer(full); })
      .catch(() => {});
  }

  // Arriving back from "create new customer" (createCustomer below) –
  // presetCustomer only carries {id, label}, not the full record the address
  // block needs, so fetch it once instead of leaving the address blank.
  useEffect(() => {
    if (!presetCustomer) return;
    ensureCustomerAddress(presetCustomer.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving back from "create new shipment" (createShipment below) – the
  // caller already has the full row, so just seed the cache and run the same
  // fill logic a manual pick would.
  useEffect(() => {
    if (!presetShipment) return;
    shipmentCacheRef.current.set(presetShipment.ref_number, presetShipment);
    handleShipmentChange({ id: presetShipment.ref_number, label: presetShipment.ref_number });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res = await apiFetch('/v1/customers').catch(() => ({ data: [] }));
    const raw: any[] = Array.isArray(res) ? res : (res.data ?? []);
    // Excludes draft companies (active===false) – e.g. BRELA imports still
    // sitting in Company Directory that haven't been marked complete yet –
    // from the invoice/bill customer picker.
    const list = raw.filter((c) => c.active !== false);
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? list.filter((c) => (c.name || '').toLowerCase().includes(ql) || (c.email || '').toLowerCase().includes(ql) || (c.phone || '').includes(ql))
      : list;
    filtered.forEach((c) => customerCacheRef.current.set(c.id, c));
    return filtered.slice(0, 25).map((c) => ({ id: c.id, label: c.name, sublabel: c.email || c.phone || undefined }));
  }

  // A brand-new customer needs more than the bare `{ name }` this used to
  // POST silently (no email/phone/tax id/address – every invoice customer
  // created this way started with an empty CRM profile). Hands off to the
  // full onboarding page instead, preserving everything already typed into
  // this invoice so there's actually something to "come back to" – without
  // this, "create new customer" mid-invoice would throw away the bill date,
  // line items, etc. the moment you navigated away.
  function createCustomer(name: string): Promise<PickerItem> {
    saveInvoiceDraft({
      client, addr, billDate, dueDate, agent, blNo, origin, dest, mode, exRate, terms,
      clearing, shipping, other, businessLineId,
    });
    navigate(`/crm/customers/new?name=${encodeURIComponent(name)}&returnTo=${encodeURIComponent('/finance/invoices')}`);
    // Never resolves – the page is navigating away, so EntityPicker's own
    // "Creating…" state just stays until this component unmounts.
    return new Promise<PickerItem>(() => {});
  }

  function handleCustomerChange(item: PickerItem | null) {
    setCustomer(item);
    if (!item) return;
    setClient(item.label);
    ensureCustomerAddress(item.id);
  }

  async function searchShipments(q: string): Promise<PickerItem[]> {
    const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
    const res = await apiFetch(`/v1/shipments${qs}`).catch(() => ({ data: [] }));
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    list.forEach((s) => shipmentCacheRef.current.set(s.ref_number, s));
    return list.slice(0, 25).map((s) => ({
      id: s.ref_number, label: s.ref_number,
      sublabel: [s.bl_number || s.awb_number, s.customer_name, s.goods_desc].filter(Boolean).join(' · '),
    }));
  }

  function handleShipmentChange(item: PickerItem | null) {
    setShipment(item);
    if (!item) return;
    const full = shipmentCacheRef.current.get(item.id);
    if (!full) return;
    if (!blNo.trim()) setBlNo(full.bl_number || full.awb_number || '');
    if (!origin.trim()) setOrigin(full.origin_port || '');
    if (!dest.trim()) setDest(full.dest_port || '');
    const t = String(full.type || '');
    if (t.startsWith('SEA')) setMode('SEA'); else if (t.startsWith('AIR')) setMode('AIR'); else if (t.startsWith('ROAD')) setMode('ROAD');
    if (!client.trim() && full.customer_id && full.customer_name) handleCustomerChange({ id: full.customer_id, label: full.customer_name });
  }

  // A shipment that doesn't exist yet gets the same "hand off, come back"
  // treatment as a brand-new customer above – CreateShipmentPage.tsx's
  // `returnTo` support lands back here with the new shipment's id via
  // Billing()'s own preset-from-query-param effect.
  function createShipment(): Promise<PickerItem> {
    saveInvoiceDraft({
      client, addr, billDate, dueDate, agent, blNo, origin, dest, mode, exRate, terms,
      clearing, shipping, other, businessLineId,
    });
    const qs = new URLSearchParams({ returnTo: '/finance/invoices' });
    if (customer?.id) qs.set('customer_id', customer.id);
    navigate(`/clearos/ops/new?${qs.toString()}`);
    return new Promise<PickerItem>(() => {});
  }

  const toEditItems = (g: ChargeGroup) =>
    (initial?.items.filter(i => i.group === g) ?? []).map((it, i) => ({ ...it, uid: `${g}-${i}` }));

  const [clearing, setClearing] = useState<EditItem[]>(draft?.clearing ?? toEditItems('clearing'));
  const [shipping, setShipping] = useState<EditItem[]>(draft?.shipping ?? toEditItems('shipping'));
  const [other, setOther]       = useState<EditItem[]>(draft?.other ?? toEditItems('other'));

  const [showTimesheets, setShowTimesheets] = useState(false);

  const activeShipmentFull = shipment ? shipmentCacheRef.current.get(shipment.id) : null;

  const allItems: LineItem[] = [...clearing, ...shipping, ...other].map(({ uid: _uid, ...rest }) => rest);
  const exRateNum = parseFloat(exRate) || 2650;

  const clTotal = clearing.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0);
  const shTotal = shipping.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0);
  const otTotal = other.reduce((s, i) => s + i.qty * i.rate * (1 + i.taxPct / 100), 0);
  const grandTotal = clTotal + otTotal + shTotal * exRateNum;

  const version = (initial?.version ?? 0) + (initial ? 1 : 0);
  const invId = initial?.id ?? nextId;

  function handleSave(asDraft: boolean) {
    const newVersion = (initial?.version ?? 0) + 1;
    const inv: Invoice = {
      id: invId, client: client || 'Unknown Client',
      customerId: customer?.id || undefined, shipmentRef: shipment?.id || undefined,
      businessLineId: canUseBusinessLines ? (businessLineId || undefined) : initial?.businessLineId,
      clientAddress: addr.split('\n').filter(Boolean),
      blNumber: blNo, origin, destination: dest, mode,
      billDate, dueDate: dueDate || null,
      saleAgent: agent, terms,
      items: allItems,
      exchangeRate: exRateNum,
      refCode: genRefCode(invId, newVersion),
      version: newVersion,
      status: asDraft ? 'Draft' : (initial?.status === 'Paid' || initial?.status === 'Partial' ? initial.status : 'Unpaid'),
      received: initial?.received ?? 0,
    };
    onSave(inv);
  }

  return (
    <FormPage
      title={initial ? `Edit ${initial.id}` : 'New Invoice'}
      subtitle="Parties, dates, the linked shipment and every charge line."
      onCancel={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => handleSave(true)} className="btn btn-secondary">Save Draft</button>
          <button type="button" onClick={() => handleSave(false)} className="btn btn-primary">
            <Icon name="send" size={13} color="hsl(var(--primary-foreground))" /> Save &amp; Send
          </button>
        </>
      }
    >
        {/* Top grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px 20px', marginBottom: 18 }}>
          <FormField label="Invoice #" value={invId} disabled />
          <EntityPicker
            label="Client / Company" value={customer ?? (client ? { id: '', label: client } : null)} onChange={handleCustomerChange}
            search={searchCustomers} onCreate={createCustomer}
            createLabel={(q) => `Create new customer "${q}"`}
            placeholder="Search customers…"
          />
          <FormField label="Sale Agent" value={agent} onChange={setAgent} placeholder="Agent name" />
          {canUseBusinessLines && (
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Business Line (optional)</label>
              <Combobox
                options={financeConfiguration.data?.businessLines.filter(line => line.active || line.id === businessLineId).map(line => ({ value: line.id, label: `${line.name} · ${line.code}` })) ?? []}
                value={businessLineId}
                onChange={setBusinessLineId}
                placeholder="All business lines"
                disabled={Boolean(initial && initial.status !== 'Draft')}
              />
            </div>
          )}
          <FormField label="Invoice Date" value={billDate} onChange={setBillDate} placeholder="DD-MM-YYYY" />
          <FormField label="Due Date (optional)" value={dueDate} onChange={setDueDate} placeholder="DD-MM-YYYY" />
          <div>
            <FormField label="Exchange Rate (TZS/USD)" value={exRate} onChange={setExRate} placeholder="2650" mono />
            {todayFxRate && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                Today's rate: <span style={{ fontFamily: 'var(--font)', color: 'var(--ink2)' }}>{todayFxRate.rate.toLocaleString()}</span>
                <button type="button" onClick={() => setExRate(String(todayFxRate.rate))}
                  style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 700, fontSize: 11, padding: 0 }}>
                  Use this
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bill To */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Client Address – one line per entry</label>
          <textarea value={addr} onChange={e => setAddr(e.target.value)} rows={3} placeholder={'Company Name\nStreet / P.O. Box\nCity, Country\nVAT Number'}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'var(--font)', resize: 'vertical', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box' as const }} />
        </div>

        {/* Shipment details */}
        <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 22, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 10 }}>Shipment Details</div>
          <div style={{ marginBottom: 10 }}>
            <EntityPicker
              label="Linked Shipment (optional)" value={shipment} onChange={handleShipmentChange}
              search={searchShipments} onCreate={createShipment}
              createLabel={() => 'Create a new shipment…'}
              placeholder="Search by ref, BL number or goods description…"
              hint={shipment ? undefined : 'Link a shipment to auto-fill BL/AWB, origin, destination and mode below.'}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 120px', gap: '10px 16px' }}>
            <FormField label="BL / AWB Number" value={blNo} onChange={setBlNo} placeholder="e.g. MSCU2456789" />
            <FormField label="Origin" value={origin} onChange={setOrigin} placeholder="e.g. SINGAPORE" />
            <FormField label="Destination" value={dest} onChange={setDest} placeholder="e.g. DAR ES SALAAM" />
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Mode</label>
              <Select value={mode} onValueChange={v => setMode(v as Invoice['mode'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEA">SEA</SelectItem>
                  <SelectItem value="AIR">AIR</SelectItem>
                  <SelectItem value="ROAD">ROAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Timesheet Import Modal */}
        {showTimesheets && activeShipmentFull && (
          <ImportTimesheetsModal
            shipmentId={activeShipmentFull.id}
            shipmentRef={activeShipmentFull.ref_number}
            sectionCurrency="TZS"
            onClose={() => setShowTimesheets(false)}
            onImport={(lines) => {
              setOther(prev => [
                ...prev,
                ...lines.map((l, i) => ({ ...l, uid: `ts-${Date.now()}-${i}` }))
              ]);
              setShowTimesheets(false);
            }}
          />
        )}

        {/* Three charge sections. The customer flows in so the catalog picker
            offers each service at this customer's agreed price when one exists. */}
        <ChargeSectionEditor title="Clearing Charges – Paid in TZS" color="var(--teal)" group="clearing" currency="TZS" items={clearing} onChange={setClearing} customerId={customer?.id || undefined} />
        <ChargeSectionEditor title="Shipping Line Charges – Paid in USD" color="var(--blue)" group="shipping" currency="USD" items={shipping} onChange={setShipping} customerId={customer?.id || undefined} />
        <div style={{ position: 'relative' }}>
          {shipment && activeShipmentFull && (
            <button type="button" onClick={() => setShowTimesheets(true)} style={{ position: 'absolute', top: 3, right: 10, display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', background: 'var(--purple-l)', color: 'var(--purple)', border: '1px solid var(--purple)', fontSize: 11, fontWeight: 700, cursor: 'pointer', zIndex: 10, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="clock" size={12} color="var(--purple)" /> Import Unbilled Time
            </button>
          )}
          <ChargeSectionEditor title="Other Charges – Paid in TZS" color="var(--purple)" group="other" currency="TZS" items={other} onChange={setOther} customerId={customer?.id || undefined} />
        </div>

        {/* Grand total */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingRight: 8, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--ink2)' }}>
            <span>Clearing:</span><span style={{ fontFamily: 'var(--font)' }}>{fmtTZS(clTotal)}</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--ink2)' }}>
            <span>Shipping (USD → TZS @ {exRateNum}):</span><span style={{ fontFamily: 'var(--font)' }}>{fmtUSD(shTotal)} → {fmtTZS(shTotal * exRateNum)}</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--ink2)' }}>
            <span>Other:</span><span style={{ fontFamily: 'var(--font)' }}>{fmtTZS(otTotal)}</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 15, fontWeight: 800, color: 'var(--red)', borderTop: '2px solid var(--border)', paddingTop: 8, marginTop: 4, minWidth: 320 }}>
            <span style={{ flex: 1 }}>GRAND TOTAL</span>
            <span style={{ fontFamily: 'var(--font)' }}>{fmtTZS(grandTotal)}</span>
          </div>
        </div>

        {/* Version info */}
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 18 }}>
          Invoice version will be: <strong>{version}</strong> · Ref: <span style={{ fontFamily: 'var(--font)', color: 'var(--teal)' }}>{genRefCode(invId, version)}</span>
        </div>

        {/* Terms */}
        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Terms &amp; Conditions</label>
          <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'var(--font)', resize: 'vertical', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box' as const }} />
        </div>
    </FormPage>
  );
}
