import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/button.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from './ui/date-picker.js';
import { Input } from './ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';

export interface SupplierReturnCreditEvidence {
  bill_id: string | null;
  bill_line_id: string | null;
  bill_line_description: string | null;
  supplier_reference: string | null;
  credit_date: string | null;
  net_amount: string | null;
  tax_amount: string | null;
  currency: string | null;
}

interface CreditBill {
  id: string;
  bill_number: string;
  currency: string;
  requires_bill_line: boolean;
  lines: { id: string; description: string; category?: string; tax_rate: number; tax_code: string | null }[];
}

export function SupplierReturnCredit({ orderId, returnId, evidence, onClose, onSaved }: {
  orderId: string;
  returnId: string;
  evidence: SupplierReturnCreditEvidence;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bills, setBills] = useState<CreditBill[] | null>(null);
  const [billId, setBillId] = useState(evidence.bill_id ?? '');
  const [billLineId, setBillLineId] = useState(evidence.bill_line_id ?? '');
  const [reference, setReference] = useState(evidence.supplier_reference ?? '');
  const [date, setDate] = useState(() => parseDateOnly(evidence.credit_date?.slice(0, 10) ?? ''));
  const [net, setNet] = useState(evidence.net_amount ?? '');
  const [tax, setTax] = useState(evidence.tax_amount ?? '0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  const bill = bills?.find(candidate => candidate.id === billId);
  const selectedLine = bill?.lines.find(line => line.id === billLineId);

  useEffect(() => {
    let current = true;
    apiFetch(`/v1/purchase-orders/${orderId}/return-credit-bills`)
      .then(rows => { if (current) setBills(rows); })
      .catch(err => { if (current) setError(err.message || 'Could not load supplier bills.'); });
    return () => { current = false; };
  }, [orderId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !bill || !date || (bill.requires_bill_line && !selectedLine)) return;
    active.current = true;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/purchase-orders/${orderId}/returns/${returnId}/credit-evidence`, {
        method: 'POST',
        body: JSON.stringify({
          bill_id: bill.id, bill_line_id: selectedLine?.id ?? null,
          supplier_reference: reference.trim(), credit_date: toDateOnlyString(date),
          net_amount: Number(net), tax_amount: Number(tax),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the supplier credit evidence.');
    } finally {
      active.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3">
      <p>Record the supplier’s credit note for this return. Stock and payable balances change only when the return and credit are posted.</p>
      {error && <p role="alert">{error}</p>}
      {bills === null ? (!error && <p role="status">Loading supplier bills…</p>) : !bills.length ? (
        <p>There are no posted supplier bills linked to this purchase order.</p>
      ) : (
        <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
          <div>Supplier bill
            <Select value={billId} onValueChange={id => { setBillId(id); setBillLineId(''); }}>
              <SelectTrigger aria-label="Supplier bill"><SelectValue placeholder="Choose a bill" /></SelectTrigger>
              <SelectContent>{bills.map(row => (
                <SelectItem key={row.id} value={row.id}>{row.bill_number} · {row.currency}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          {bill && bill.lines.length > 0 && (
            <div>Original bill line{bill.requires_bill_line ? ' (required)' : ' (optional)'}
              <Select value={billLineId || (bill.requires_bill_line ? '' : 'bill-wide')}
                onValueChange={id => setBillLineId(id === 'bill-wide' ? '' : id)}>
                <SelectTrigger aria-label="Original bill line"><SelectValue placeholder="Choose the credited bill line" /></SelectTrigger>
                <SelectContent>
                  {!bill.requires_bill_line && <SelectItem value="bill-wide">Apply to bill</SelectItem>}
                  {bill.lines.map((line, index) => (
                    <SelectItem key={line.id} value={line.id}>
                      {index + 1}. {line.description} · {line.category ? `${line.category} · ` : ''}{line.tax_code ? `${line.tax_code} ` : ''}{Number(line.tax_rate)}% tax
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <label>Supplier credit reference<Input required maxLength={100} value={reference} onChange={event => setReference(event.target.value)} /></label>
          <div>Credit date<DatePicker date={date} onChange={setDate} /></div>
          <label>Net amount {bill?.currency}<Input type="number" min={0.01} step={0.01} required value={net} onChange={event => setNet(event.target.value)} /></label>
          <label>Tax amount {bill?.currency}<Input type="number" min={0} step={0.01} required value={tax} onChange={event => setTax(event.target.value)} /></label>
        </fieldset>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !bill || !date || (bill.requires_bill_line && !selectedLine)}>Save credit evidence</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Close</Button>
      </div>
    </form>
  );
}
