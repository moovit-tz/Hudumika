import { useRef } from 'react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { apiFetch } from '../../lib/api.js';
import { formatAmount } from '../../lib/currency.js';
import type { EditItem } from './shared.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Icon } from '../../components/Icon.js';

export function InvoiceLinesEditor({
  items,
  onChange,
  currency,
  customerId,
}: {
  items: EditItem[];
  onChange: (items: EditItem[]) => void;
  currency: string;
  customerId?: string;
}) {
  const products = useRef<
    Map<string, { name: string; unit: string; currency: string; sale_price: number; tax_rate: number; billing_description?: string }>
  >(new Map());

  async function search(query: string): Promise<PickerItem[]> {
    const params = new URLSearchParams({ status: 'active', search: query, page: '1', page_size: '25' });
    if (customerId) params.set('customer_id', customerId);
    const response = await apiFetch(`/v1/products?${params}`);
    const rows = Array.isArray(response) ? response : response.items ?? response.data ?? [];
    rows.forEach((row: any) => products.current.set(row.id, row));
    return rows.slice(0, 25).map((row: any) => ({
      id: row.id,
      label: row.name,
      sublabel: `${formatAmount(Number(row.sale_price), row.currency || currency)} / ${row.unit || 'unit'}`,
    }));
  }

  const update = (id: string, patch: Partial<EditItem>) =>
    onChange(items.map((item) => (item.uid === id ? { ...item, ...patch } : item)));

  const handleAddLine = () => {
    onChange([
      ...items,
      {
        uid: crypto.randomUUID(),
        name: '',
        unit: 'UNIT',
        qty: 1,
        rate: 0,
        taxPct: 0,
        group: 'other',
        currency,
      },
    ]);
  };

  const handleRemove = (uid: string) => {
    onChange(items.filter((row) => row.uid !== uid));
  };

  const CURRENCY_OPTIONS = Array.from(new Set([currency, 'TZS', 'USD', 'EUR', 'GBP', 'KES', 'ZAR', 'AED']));

  return (
    <div className="min-w-0 space-y-4">
      {/* Search Catalog */}
      <EntityPicker
        label="Add from product catalog"
        value={null}
        search={search}
        onChange={(selection) => {
          if (!selection) return;
          const product = products.current.get(selection.id);
          if (product) {
            onChange([
              ...items,
              {
                uid: crypto.randomUUID(),
                name: product.name,
                description: product.billing_description || '',
                unit: product.unit || 'UNIT',
                rate: Number(product.sale_price) || 0,
                qty: 1,
                taxPct: Number(product.tax_rate) || 0,
                group: 'other',
                currency: product.currency || currency,
              },
            ]);
          }
        }}
        placeholder="Search products and services to auto-fill line…"
      />

      {/* ── DESKTOP TABLE VIEW (hidden on small mobile < 640px) ── */}
      <div className="hidden sm:block overflow-x-auto rounded-[var(--r)] border border-[var(--border)] bg-[var(--card-bg,var(--white))] shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-[var(--ink3)] font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-3 min-w-[220px]">Item Description</th>
              <th className="py-2.5 px-2.5 w-20 min-w-[70px]">Qty</th>
              <th className="py-2.5 px-2.5 w-24 min-w-[80px]">Unit</th>
              <th className="py-2.5 px-2.5 w-28 min-w-[95px]">Currency</th>
              <th className="py-2.5 px-2.5 w-32 min-w-[110px]">Rate</th>
              <th className="py-2.5 px-2.5 w-20 min-w-[75px]">Tax %</th>
              <th className="py-2.5 px-3 w-32 min-w-[110px] text-right">Amount</th>
              <th className="py-2.5 px-2 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.map((item, index) => {
              const lineTotal = item.qty * item.rate * (1 + item.taxPct / 100);
              return (
                <tr key={item.uid} className="hover:bg-[var(--bg)]/40 transition-colors">
                  {/* Item name & description */}
                  <td className="py-2.5 px-3 align-top">
                    <Input
                      aria-label={`Item ${index + 1} name`}
                      value={item.name}
                      onChange={(event) => update(item.uid, { name: event.target.value })}
                      placeholder="Product or service name *"
                      className="h-8 text-xs font-medium"
                    />
                    <Textarea
                      className="mt-1.5 text-xs rounded-[var(--r-sm)] border-[var(--border)]"
                      aria-label={`Item ${index + 1} specification`}
                      maxLength={5000}
                      rows={2}
                      value={item.description || ''}
                      onChange={(event) => update(item.uid, { description: event.target.value })}
                      placeholder="Specification / deliverables (printed on invoice)"
                    />
                  </td>

                  {/* Quantity */}
                  <td className="py-2.5 px-2.5 align-top">
                    <Input
                      aria-label={`Item ${index + 1} quantity`}
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.qty}
                      onChange={(event) => update(item.uid, { qty: Number(event.target.value) })}
                      className="h-8 text-xs"
                    />
                  </td>

                  {/* Unit */}
                  <td className="py-2.5 px-2.5 align-top">
                    <Input
                      aria-label={`Item ${index + 1} unit`}
                      value={item.unit}
                      onChange={(event) => update(item.uid, { unit: event.target.value })}
                      className="h-8 text-xs uppercase"
                    />
                  </td>

                  {/* Currency */}
                  <td className="py-2.5 px-2.5 align-top">
                    <Select value={item.currency} onValueChange={(value) => update(item.uid, { currency: value })}>
                      <SelectTrigger className="h-8 text-xs font-semibold" aria-label={`Item ${index + 1} currency`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  {/* Rate */}
                  <td className="py-2.5 px-2.5 align-top">
                    <Input
                      aria-label={`Item ${index + 1} rate`}
                      type="number"
                      min="0"
                      step="any"
                      value={item.rate}
                      onChange={(event) => update(item.uid, { rate: Number(event.target.value) })}
                      className="h-8 text-xs font-mono"
                    />
                  </td>

                  {/* Tax % */}
                  <td className="py-2.5 px-2.5 align-top">
                    <Input
                      aria-label={`Item ${index + 1} tax percent`}
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={item.taxPct}
                      onChange={(event) => update(item.uid, { taxPct: Number(event.target.value) })}
                      className="h-8 text-xs"
                    />
                  </td>

                  {/* Amount */}
                  <td className="py-2.5 px-3 align-top text-right font-semibold text-[var(--ink)] tabular-nums text-xs pt-4">
                    {formatAmount(lineTotal, item.currency)}
                  </td>

                  {/* Remove */}
                  <td className="py-2.5 px-2 align-top text-center pt-3">
                    <button
                      type="button"
                      aria-label={`Remove item ${index + 1}`}
                      onClick={() => handleRemove(item.uid)}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[var(--ink3)] hover:text-[var(--red)] hover:bg-[var(--red-l)] transition-colors"
                      title="Remove line"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {!items.length && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-[var(--ink3)] italic">
                  No line items yet. Click &ldquo;Add line&rdquo; or pick an item from your catalog above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── MOBILE CARD LIST VIEW (visible only on mobile < 640px) ── */}
      <div className="sm:hidden space-y-3">
        {items.map((item, index) => {
          const lineTotal = item.qty * item.rate * (1 + item.taxPct / 100);
          return (
            <div
              key={item.uid}
              className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card-bg,var(--white))] p-3.5 shadow-xs space-y-3"
            >
              {/* Header row: Line # badge + Remove */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--teal)] bg-[var(--teal-l)] px-2 py-0.5 rounded-md">
                  Line #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(item.uid)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--red)] font-medium hover:underline p-1"
                >
                  <Icon name="trash" size={13} />
                  <span>Remove</span>
                </button>
              </div>

              {/* Item Name */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                  Item Description *
                </label>
                <Input
                  value={item.name}
                  onChange={(event) => update(item.uid, { name: event.target.value })}
                  placeholder="Product or service name *"
                  className="h-9 text-sm"
                />
              </div>

              {/* Specification */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                  Deliverables / Specification
                </label>
                <Textarea
                  maxLength={5000}
                  rows={2}
                  value={item.description || ''}
                  onChange={(event) => update(item.uid, { description: event.target.value })}
                  placeholder="Details printed on invoice…"
                  className="text-xs rounded-[var(--r-sm)] border-[var(--border)]"
                />
              </div>

              {/* 2x2 Grid for Quantities and Rates */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                    Quantity
                  </label>
                  <Input
                    type="number"
                    min="0.001"
                    step="any"
                    value={item.qty}
                    onChange={(event) => update(item.uid, { qty: Number(event.target.value) })}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                    Unit
                  </label>
                  <Input
                    value={item.unit}
                    onChange={(event) => update(item.uid, { unit: event.target.value })}
                    className="h-9 text-xs uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                    Rate / Price
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={item.rate}
                    onChange={(event) => update(item.uid, { rate: Number(event.target.value) })}
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                    Currency
                  </label>
                  <Select value={item.currency} onValueChange={(value) => update(item.uid, { currency: value })}>
                    <SelectTrigger className="h-9 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                    Tax (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={item.taxPct}
                    onChange={(event) => update(item.uid, { taxPct: Number(event.target.value) })}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex flex-col justify-end text-right">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-0.5">
                    Line Total
                  </span>
                  <span className="font-bold text-sm text-[var(--ink)] tabular-nums">
                    {formatAmount(lineTotal, item.currency)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {!items.length && (
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--ink3)] italic">
            No line items yet.
          </div>
        )}
      </div>

      {/* Add Line button */}
      <Button type="button" variant="outline" size="sm" onClick={handleAddLine} className="gap-1.5">
        <Icon name="plus" size={14} />
        <span>Add line</span>
      </Button>
    </div>
  );
}
