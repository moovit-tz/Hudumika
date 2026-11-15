import { Link } from 'react-router-dom';
import { Banner } from '../components/ui/alert.js';
import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Inventory.css';
import { PageHeader } from '../components/PageHeader.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { SectionCard } from '../components/SectionCard.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';

interface StockLevel {
  itemId: string; locationId: string; batchNo: string | null; expiryDate: string | null; qtyOnHand: number;
  itemName?: string; itemSku?: string; baseUom?: string; locationCode?: string; warehouseId?: string; warehouseName?: string;
  avgCost?: number; value?: number;
}
interface Movement {
  id: string; occurredAt: string; movementType: string; qtyDelta: number; enteredQty: number; enteredUom: string;
  batchNo: string | null; reference: string | null; fromLocationCode?: string; toLocationCode?: string;
  unitCost?: number | null; totalCost?: number | null;
}
interface Item { id: string; sku: string; name: string; baseUom: string; isBatchTracked: boolean; }
interface Location { id: string; code: string; name: string; warehouseName?: string; }
interface Uom { uomCode: string; conversionFactor: number; }
interface ReorderAlert {
  itemId: string; name: string; sku: string; baseUom: string;
  totalQtyOnHand: number; reorderPoint: number; reorderQty: number | null;
  inboundQty: number; projectedQty: number; suggestedQty: number | null; unconvertedLines: number;
}

const MOVEMENT_TYPES = [
  { value: 'receipt', label: 'Receipt (stock in)' },
  { value: 'issue', label: 'Issue (stock out)' },
  { value: 'transfer', label: 'Transfer (between locations)' },
  { value: 'adjust', label: 'Adjustment (+/-)' },
];

export function InventoryStock() {
  const procurementEnabled = useFinanceCapabilities().isEnabled('finance.procurement');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockError, setStockError] = useState('');
  const [warehouseId, setWarehouseId] = useState('all');
  const [search, setSearch] = useState('');
  const [alerts, setAlerts] = useState<ReorderAlert[] | null>(null);
  const [alertsError, setAlertsError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<StockLevel | null>(null);
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [movementError, setMovementError] = useState('');

  const [movementType, setMovementType] = useState('receipt');
  const [itemId, setItemId] = useState('');
  const [itemUoms, setItemUoms] = useState<Uom[]>([]);
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [enteredQty, setEnteredQty] = useState('');
  const [enteredUom, setEnteredUom] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [reference, setReference] = useState('');
  const [unitCost, setUnitCost] = useState('');

  const selectedItem = items.find(i => i.id === itemId);
  const warehouses = new Map(levels.flatMap(level =>
    level.warehouseId && level.warehouseName ? [[level.warehouseId, level.warehouseName] as const] : [],
  ));
  const searchText = search.trim().toLowerCase();
  const visibleLevels = levels.filter(level =>
    (warehouseId === 'all' || level.warehouseId === warehouseId) &&
    (!searchText || [level.itemName, level.itemSku, level.locationCode, level.batchNo]
      .some(value => value?.toLowerCase().includes(searchText))),
  );

  function reload() {
    setLoading(true);
    setStockError('');
    setExpanded(null);
    loadAlerts();
    apiFetch('/v1/inventory/stock-levels')
      .then(setLevels)
      .catch(err => setStockError(err.message || 'Could not load stock balances.'))
      .finally(() => setLoading(false));
  }
  function loadAlerts() {
    setAlerts(null);
    setAlertsError('');
    apiFetch('/v1/inventory/reorder-alerts')
      .then(setAlerts)
      .catch(err => setAlertsError(err.message || 'Could not load reorder alerts.'));
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    apiFetch('/v1/inventory/items').then(setItems);
    apiFetch('/v1/inventory/locations').then(setLocations);
  }, []);
  useEffect(() => {
    if (!itemId) { setItemUoms([]); return; }
    apiFetch(`/v1/inventory/items/${itemId}/uoms`).then(setItemUoms);
    const it = items.find(i => i.id === itemId);
    if (it) setEnteredUom(it.baseUom);
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded) return;
    let current = true;
    const query = new URLSearchParams({
      item_id: expanded.itemId,
      location_id: expanded.locationId,
      batch_no: expanded.batchNo ?? '',
    });
    apiFetch(`/v1/inventory/movements?${query}`)
      .then(rows => { if (current) setMovements(rows); })
      .catch(err => { if (current) setMovementError(err.message || 'Could not load movements.'); });
    return () => { current = false; };
  }, [expanded]);

  async function handleRecordMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!itemId || !enteredQty || !enteredUom) return;
    if (movementType === 'receipt' && !toLocationId) return;
    if (movementType === 'issue' && !fromLocationId) return;
    if (movementType === 'transfer' && (!fromLocationId || !toLocationId)) return;
    if (movementType === 'adjust' && !toLocationId) return;
    if (selectedItem?.isBatchTracked && !batchNo.trim()) {
      showAlert('This item is batch/lot-tracked — a batch number is required.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({
          movementType, itemId,
          fromLocationId: (movementType === 'issue' || movementType === 'transfer') ? fromLocationId : null,
          toLocationId: (movementType === 'receipt' || movementType === 'transfer' || movementType === 'adjust') ? toLocationId : null,
          enteredQty: Number(enteredQty), enteredUom,
          batchNo: batchNo.trim() || null,
          expiryDate: expiryDate ? toDateOnlyString(expiryDate) : null,
          reference: reference.trim() || null,
          unitCost: movementType === 'receipt' && unitCost ? Number(unitCost) : null,
        }),
      });
      setItemId(''); setFromLocationId(''); setToLocationId(''); setEnteredQty(''); setEnteredUom('');
      setBatchNo(''); setExpiryDate(undefined); setReference(''); setUnitCost(''); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to record this movement.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SkeletonPage variant="table" />;

  return (
    <div className="inv-page">
      <div className="inv-page-hdr">
        <div>
          <PageHeader
            crumbs={['Inventory', 'Stock']}
            titlePlain="Item stock"
            titleEm="ledger"
            subtitle="Every quantity here traces to a real ledger movement — receipts, issues, transfers, and adjustments are never a direct edit to the stock level itself."
          />
        </div>
        <Button type="button" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>Record Movement</span>
        </Button>
      </div>
      <Banner variant="info">FinOps and production use the item warehouses shown here. <Link className="underline" to="/seal/stock">View SEAL lot stock</Link> · <Link className="underline" to="/seal/counts">Item stock counts</Link> · <Link className="underline" to="/seal/item-warehouses">Item warehouses & locations</Link></Banner>
      <SectionCard title="Replenishment" collapsible={false} padded={false}>
        <div className="inv-card-body">
          <p className="mb-3 text-sm">Across all item warehouses. Projected stock adds outstanding quantities on sent and partially received purchase orders. Suggested quantity uses the larger of the configured reorder quantity and the projected shortfall when projected stock is at or below the reorder point.</p>
          {alertsError ? (
            <div role="alert">{alertsError} <Button type="button" variant="outline" onClick={loadAlerts}>Retry</Button></div>
          ) : alerts === null ? (
            <div role="status">Loading reorder alerts…</div>
          ) : alerts.length === 0 ? (
            <div className="inv-empty">No items are at or below their reorder point.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="inv-table">
                <thead><tr><th>Item</th><th>On hand</th><th>Open PO quantity</th><th>Projected</th><th>Reorder point</th><th>Suggested quantity</th>{procurementEnabled && <th>Action</th>}</tr></thead>
                <tbody>
                  {alerts.map(alert => (
                    <tr key={alert.itemId}>
                      <td>{alert.name}<div className="inv-mono">{alert.sku}</div></td>
                      <td>{alert.totalQtyOnHand} {alert.baseUom}</td>
                      <td>{alert.inboundQty} {alert.baseUom}</td>
                      <td>{alert.unconvertedLines > 0 ? 'Incomplete' : `${alert.projectedQty} ${alert.baseUom}`}</td>
                      <td>{alert.reorderPoint} {alert.baseUom}</td>
                      <td>{alert.suggestedQty === null ? 'Check purchase order units' : `${alert.suggestedQty} ${alert.baseUom}`}</td>
                      {procurementEnabled && <td>
                        {alert.suggestedQty !== null && alert.suggestedQty > 0 && (
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/finance/purchase-orders/new?${new URLSearchParams({ reorderItem: alert.itemId })}`}>Prepare purchase order</Link>
                          </Button>
                        )}
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      {showNew && (
        <form onSubmit={handleRecordMovement} style={{ marginBottom: 20 }}>
        <SectionCard collapsible={false} padded={false}>
          <div className="inv-form-grid-3">
            <div className="inv-field-row">
              <label className="inv-field-label">Movement Type</label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger aria-label="Movement Type"><SelectValue /></SelectTrigger>
                <SelectContent>{MOVEMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="inv-field-row" style={{ gridColumn: 'span 2' }}>
              <label className="inv-field-label">Item</label>
              <Combobox
                options={items.map(i => ({ value: i.id, label: i.name, sublabel: i.sku }))}
                value={itemId} onChange={setItemId}
                placeholder="Search items…" searchPlaceholder="Search…" emptyText="No matching items." aria-label="Item" />
            </div>

            {(movementType === 'issue' || movementType === 'transfer') && (
              <div className="inv-field-row">
                <label className="inv-field-label">From Location</label>
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger aria-label="From Location"><SelectValue placeholder="Choose a location" /></SelectTrigger>
                  <SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.code} — {l.warehouseName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {(movementType === 'receipt' || movementType === 'transfer' || movementType === 'adjust') && (
              <div className="inv-field-row">
                <label className="inv-field-label">{movementType === 'adjust' ? 'Location Being Corrected' : 'To Location'}</label>
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger aria-label={movementType === 'adjust' ? 'Location being corrected' : 'To location'}><SelectValue placeholder="Choose a location" /></SelectTrigger>
                  <SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.code} — {l.warehouseName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div className="inv-field-row">
              <label className="inv-field-label">{movementType === 'adjust' ? 'Quantity (+/-)' : 'Quantity'}</label>
              <Input aria-label={movementType === 'adjust' ? 'Quantity adjustment' : 'Quantity'} type="number" step="any" value={enteredQty} onChange={e => setEnteredQty(e.target.value)} placeholder="0" />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Unit</label>
              <Select value={enteredUom} onValueChange={setEnteredUom} disabled={!itemId}>
                <SelectTrigger aria-label="Unit"><SelectValue placeholder={itemId ? 'Choose a unit' : 'Choose an item first'} /></SelectTrigger>
                <SelectContent>
                  {selectedItem && <SelectItem value={selectedItem.baseUom}>{selectedItem.baseUom} (base)</SelectItem>}
                  {itemUoms.map(u => <SelectItem key={u.uomCode} value={u.uomCode}>{u.uomCode} (×{u.conversionFactor})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {movementType === 'receipt' && (
              <div className="inv-field-row">
                <label className="inv-field-label">Unit Cost (optional)</label>
                <Input type="number" step="any" min="0" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0.00" aria-label="Unit Cost (optional)" />
              </div>
            )}

            {selectedItem?.isBatchTracked && (
              <>
                <div className="inv-field-row">
                  <label className="inv-field-label">Batch / Lot No.</label>
                  <Input type="text" value={batchNo} onChange={e => setBatchNo(e.target.value)} placeholder="BATCH-001" aria-label="Batch / Lot No." />
                </div>
                <div className="inv-field-row">
                  <label className="inv-field-label">Expiry Date (optional)</label>
                  <DatePicker date={expiryDate} onChange={setExpiryDate} aria-label="Expiry Date (optional)" />
                </div>
              </>
            )}
            <div className="inv-field-row">
              <label className="inv-field-label">Reference (optional)</label>
              <Input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="PO-1234 / notes" aria-label="Reference (optional)" />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" loading={saving} disabled={!itemId || !enteredQty || !enteredUom} loadingText="Recording…">Record Movement</Button>
          </div>
        </SectionCard>
        </form>
      )}

      <SectionCard collapsible={false} padded={false}>
        <div className="inv-card-body">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input className="w-full sm:w-72" aria-label="Search item stock" placeholder="Search item, SKU, location or batch" value={search} onChange={event => setSearch(event.target.value)} />
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger aria-label="Item warehouse"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All item warehouses</SelectItem>
                {[...warehouses].map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {stockError ? (
            <div role="alert">{stockError} <Button type="button" variant="outline" onClick={reload}>Retry</Button></div>
          ) : levels.length === 0 ? (
            <div className="inv-empty">No stock on hand yet.</div>
          ) : visibleLevels.length === 0 ? (
            <div className="inv-empty">No stock balances match these filters.</div>
          ) : (
            <table className="inv-table">
              <thead><tr><th>Item</th><th>Location</th><th>Batch</th><th>Expiry</th><th>Qty On Hand</th><th>Value</th><th></th></tr></thead>
              <tbody>
                {visibleLevels.map(l => {
                  const key = `${l.itemId}:${l.locationId}:${l.batchNo ?? ''}`;
                  const isOpen = expanded === l;
                  return (
                    <React.Fragment key={key}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{l.itemName}</div>
                          <div className="inv-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>{l.itemSku}</div>
                        </td>
                        <td>{l.locationCode} <span style={{ color: 'var(--ink3)', fontSize: 11.5 }}>({l.warehouseName})</span></td>
                        <td>{l.batchNo ? <Badge variant="info">{l.batchNo}</Badge> : <span style={{ color: 'var(--ink3)' }}>—</span>}</td>
                        <td>{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString() : '—'}</td>
                        <td className="inv-mono" style={{ fontWeight: 700 }}>{l.qtyOnHand} {l.baseUom}</td>
                        <td className="inv-mono" style={{ color: 'var(--ink3)' }}>{l.value != null ? l.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td>
                        <td>
                          <Button type="button" variant="ghost" aria-expanded={isOpen} aria-label={`Movements for ${l.itemSku ?? l.itemName} at ${l.locationCode ?? l.locationId}${l.batchNo ? `, batch ${l.batchNo}` : ''}`} onClick={() => {
                            setMovements(null);
                            setMovementError('');
                            setExpanded(isOpen ? null : l);
                          }}>
                            <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={14} />
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--bg)', padding: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>Recent Movements</div>
                            {movementError ? (
                              <div role="alert">{movementError}</div>
                            ) : movements === null ? (
                              <div role="status">Loading movements…</div>
                            ) : movements.length === 0 ? (
                              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No movements recorded.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {movements.map(m => (
                                  <div key={m.id} style={{ fontSize: 12.5, padding: '8px 10px', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                                    <strong>{m.movementType}</strong> {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}
                                    {m.fromLocationCode && <> from {m.fromLocationCode}</>}
                                    {m.toLocationCode && <> to {m.toLocationCode}</>}
                                    <span style={{ color: 'var(--ink3)' }}> · {new Date(m.occurredAt).toLocaleString()}</span>
                                    {m.reference && <span style={{ color: 'var(--ink3)' }}> · ref {m.reference}</span>}
                                    {m.unitCost != null && <span style={{ color: 'var(--teal)' }}> · cost {m.unitCost}/unit</span>}
                                    {m.totalCost != null && <span style={{ color: 'var(--gold)' }}> · COGS {m.totalCost}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
