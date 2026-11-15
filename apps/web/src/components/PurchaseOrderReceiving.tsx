import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { showConfirm } from '../lib/confirm.js';
import { SectionCard } from './SectionCard.js';
import { SupplierReturnCredit, type SupplierReturnCreditEvidence } from './SupplierReturnCredit.js';
import { Button } from './ui/button.js';
import { DatePicker, toDateOnlyString } from './ui/date-picker.js';
import { Input } from './ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';

export interface PurchaseOrderReceiptLine {
  id: string;
  description: string;
  inventoryItemId?: string;
  inventoryUom?: string;
  qty: number;
  receivedQty: number;
}

interface ReceivingLocation {
  id: string;
  code: string;
  warehouseName?: string;
}

interface ReceiptInput {
  quantity?: string;
  locationId?: string;
  batch?: string;
  expiry?: Date;
}

interface ReceiptHistoryLine {
  po_line_id: string;
  description: string;
  received_qty: string;
  entered_uom: string | null;
  movement_id: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  created_at: string;
  return_drafts: (SupplierReturnCreditEvidence & {
    id: string; quantity: string; reason: string; posted_at: string | null; stock_movement_id: string | null;
  })[];
}

function remainingReturnQty(line: ReceiptHistoryLine) {
  const drafted = line.return_drafts.reduce((total, draft) => total + Number(draft.quantity), 0);
  return Math.max(0, Number((Number(line.received_qty) - drafted).toFixed(2)));
}

export function PurchaseOrderReceiptHistory({ orderId, readOnly }: { orderId: string; readOnly: boolean }) {
  const { user } = useAuth();
  const canDraft = !readOnly && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'].includes(user?.role ?? '');
  const canPost = !readOnly && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'].includes(user?.role ?? '');
  const [lines, setLines] = useState<ReceiptHistoryLine[] | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [creditReturnId, setCreditReturnId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const attempt = useRef<{ details: string; id: string } | null>(null);
  const selectedLine = lines?.find(line => line.movement_id === selected);
  const creditReturn = lines?.flatMap(line => line.return_drafts).find(draft => draft.id === creditReturnId);
  useEffect(() => {
    let current = true;
    setError('');
    apiFetch(`/v1/purchase-orders/${orderId}/receipts`)
      .then(rows => { if (current) setLines(rows); })
      .catch(err => { if (current) setError(err.message || 'Could not load receipts.'); });
    return () => { current = false; };
  }, [orderId, revision]);

  async function changeDraft(path: string, body?: string) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setActionError('');
    try {
      await apiFetch(`/v1/purchase-orders/${orderId}/returns${path}`, { method: 'POST', body });
      attempt.current = null;
      setSelected(null);
      setQuantity('');
      setReason('');
      setRevision(value => value + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the return draft.');
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLine?.movement_id) return;
    const payload = { receipt_movement_id: selectedLine.movement_id, quantity: Number(quantity), reason: reason.trim() };
    const details = JSON.stringify(payload);
    if (attempt.current?.details !== details) attempt.current = { details, id: crypto.randomUUID() };
    void changeDraft('', JSON.stringify({ ...payload, id: attempt.current.id }));
  }

  async function postReturn(draftId: string, applyCredit = false) {
    const message = applyCredit
      ? 'Post this return and apply the supplier credit to the linked bill?'
      : 'Post this supplier return? This removes stock from the original receipt location and reverses its unbilled inventory value.';
    if (await showConfirm(message)) {
      await changeDraft(`/${draftId}/post`, JSON.stringify({ apply_credit: applyCredit }));
    }
  }

  return (
    <SectionCard title="Receipt history">
      {error ? <p role="alert">{error}</p> : lines === null ? (
        <p role="status">Loading receipts…</p>
      ) : !lines.length ? <p>No itemized receipts are recorded for this order.</p> : (
        <div className="overflow-x-auto">
          <table className="rtbl">
            <thead><tr><th>Received at</th><th>Item</th><th>Quantity</th><th>Batch</th><th>Expiry</th><th>Stock movement</th><th>Supplier returns</th></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.po_line_id}:${line.movement_id ?? index}`}>
                  <td>{new Date(line.created_at).toLocaleString()}</td>
                  <td>{line.description}</td>
                  <td>{Number(line.received_qty)} {line.entered_uom}</td>
                  <td>{line.batch_no || '—'}</td>
                  <td>{line.expiry_date?.slice(0, 10) || '—'}</td>
                  <td>{line.movement_id ? `#${line.movement_id}` : '—'}</td>
                  <td>
                    {line.return_drafts.map(draft => (
                      <div key={draft.id} className="mb-2">
                        {Number(draft.quantity)} {line.entered_uom} · {draft.reason}
                        {draft.posted_at ? <div>Posted{draft.stock_movement_id ? ` · Stock movement #${draft.stock_movement_id}` : ''}</div> : <div>Draft</div>}
                        {draft.supplier_reference && <div>
                          Credit evidence · {draft.supplier_reference} · {draft.currency} {(Number(draft.net_amount) + Number(draft.tax_amount)).toFixed(2)}
                          {draft.bill_line_description && <div>Bill line {draft.bill_line_description}</div>}
                        </div>}
                        {canPost && !draft.posted_at && !draft.bill_id && <Button type="button" variant="outline" size="sm" disabled={busy}
                          onClick={() => void postReturn(draft.id)}>Post unbilled return</Button>}
                        {canPost && !draft.posted_at && draft.bill_id && (
                          <Button type="button" variant="outline" size="sm" disabled={busy}
                            onClick={() => void postReturn(draft.id, true)}>Post return and credit</Button>
                        )}
                        {canPost && !draft.posted_at && <Button type="button" variant="ghost" size="sm" disabled={busy}
                          onClick={() => { setSelected(null); setCreditReturnId(draft.id); }}>
                          {draft.bill_id ? 'Edit credit evidence' : 'Record supplier credit'}
                        </Button>}
                        {canDraft && !draft.posted_at && <Button type="button" variant="ghost" size="sm" disabled={busy}
                          onClick={() => void changeDraft(`/${draft.id}/cancel`)}>Cancel draft</Button>}
                      </div>
                    ))}
                    {canDraft && line.movement_id && remainingReturnQty(line) > 0 && (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => {
                        setCreditReturnId(null);
                        setSelected(line.movement_id);
                        setQuantity('');
                        setReason('');
                        setActionError('');
                      }}>Draft supplier return</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      {canPost && creditReturn && !creditReturn.posted_at && (
        <SupplierReturnCredit key={creditReturn.id} orderId={orderId} returnId={creditReturn.id} evidence={creditReturn}
          onClose={() => setCreditReturnId(null)}
          onSaved={() => { setCreditReturnId(null); setRevision(value => value + 1); }} />
      )}
      {canDraft && selectedLine && (
        <form onSubmit={saveDraft} className="mt-4 space-y-3">
          <p>Draft return for {selectedLine.description}. Saving the draft does not move stock or create a supplier credit.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label>Quantity {selectedLine.entered_uom}
              <Input type="number" min={0.01} step={0.01} max={remainingReturnQty(selectedLine)}
                required value={quantity} onChange={event => setQuantity(event.target.value)} />
            </label>
            <label>Reason
              <Input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
            </label>
            <Button type="submit" disabled={busy}>Save return draft</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setSelected(null)}>Close</Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}

export function PurchaseOrderReceiving({ orderId, lines, onReceived }: {
  orderId: string;
  lines: PurchaseOrderReceiptLine[];
  onReceived: () => Promise<void>;
}) {
  const [inputs, setInputs] = useState<Record<string, ReceiptInput>>({});
  const [locations, setLocations] = useState<ReceivingLocation[]>([]);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const active = useRef(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const storageKey = `purchase-order-receipt:${orderId}`;

  useEffect(() => {
    let current = true;
    apiFetch('/v1/inventory/locations')
      .then(rows => { if (current) setLocations(rows); })
      .catch(err => { if (current) setLocationError(err.message || 'Could not load receiving locations.'); });
    return () => { current = false; };
  }, []);

  function update(id: string, change: ReceiptInput) {
    setInputs(previous => ({ ...previous, [id]: { ...previous[id], ...change } }));
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || complete) return;
    setError('');
    const selected = lines.filter(line => Number(inputs[line.id]?.quantity) > 0);
    if (!selected.length) {
      setError('Enter a quantity for at least one line.');
      return;
    }
    const missingLocation = selected.find(line => line.inventoryItemId && !inputs[line.id]?.locationId);
    if (missingLocation) {
      setError(`Choose a receiving location for ${missingLocation.description}.`);
      return;
    }
    const payload = JSON.stringify({ lines: selected.map(line => {
      const input = inputs[line.id];
      return {
        line_id: line.id,
        received_qty: Number(input.quantity),
        location_id: input.locationId || undefined,
        batch_no: input.batch?.trim() || undefined,
        expiry_date: input.expiry ? toDateOnlyString(input.expiry) : undefined,
      };
    }) });
    if (attempt.current?.payload !== payload) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
        if (stored?.payload === payload && typeof stored.key === 'string') attempt.current = stored;
      } catch { /* Retry remains available while the form is open. */ }
      if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
      try { sessionStorage.setItem(storageKey, JSON.stringify(attempt.current)); } catch {}
    }
    active.current = true;
    setSaving(true);
    try {
      await apiFetch(`/v1/purchase-orders/${orderId}/receive`, {
        method: 'POST', body: payload, headers: { 'Idempotency-Key': attempt.current.key },
      });
      try { sessionStorage.removeItem(storageKey); } catch {}
      setComplete(true);
      await onReceived().catch(() => setError('Receipt recorded. Reload this order to see the updated quantities.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the receipt.');
    } finally {
      active.current = false;
      setSaving(false);
    }
  }

  const outstanding = lines.filter(line => line.receivedQty < line.qty - 0.0001);
  return (
    <SectionCard title="Receive items" collapsible={false}>
      <form onSubmit={receive} className="space-y-4">
        {outstanding.map(line => {
          const input = inputs[line.id];
          return (
            <fieldset key={line.id} disabled={saving || complete} className="grid gap-3 md:grid-cols-4">
              <legend className="mb-2 font-medium">{line.description}</legend>
              <label>
                Quantity to receive {line.inventoryUom && `(${line.inventoryUom})`}
                <Input type="number" min={0} step={0.01} max={Number((line.qty - line.receivedQty).toFixed(2))}
                  value={input?.quantity ?? ''} onChange={event => update(line.id, { quantity: event.target.value })} />
              </label>
              {line.inventoryItemId && <>
                <div>
                  Location
                  <Select value={input?.locationId ?? ''} onValueChange={locationId => update(line.id, { locationId })}>
                    <SelectTrigger aria-label={`Receiving location for ${line.description}`}><SelectValue placeholder="Choose a location" /></SelectTrigger>
                    <SelectContent>{locations.map(location => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.warehouseName ? `${location.warehouseName} · ` : ''}{location.code}
                      </SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <label>Batch <Input value={input?.batch ?? ''} maxLength={100}
                  onChange={event => update(line.id, { batch: event.target.value })} /></label>
                <div>Expiry <DatePicker date={input?.expiry} onChange={expiry => update(line.id, { expiry })} /></div>
              </>}
            </fieldset>
          );
        })}
        {locationError && lines.some(line => line.inventoryItemId) && <div role="alert">{locationError}</div>}
        {error && <div role="alert">{error}</div>}
        {complete ? <div role="status">Receipt recorded.</div> : (
          <Button type="submit" disabled={saving || !outstanding.length}>{saving ? 'Recording…' : 'Record receipt'}</Button>
        )}
      </form>
    </SectionCard>
  );
}
