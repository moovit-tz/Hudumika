import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Inventory.css';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface Item {
  id: string; sku: string; name: string; productId: string | null; productName?: string;
  baseUom: string; itemType: string; isBatchTracked: boolean;
  reorderPoint: number | null; reorderQty: number | null; active: boolean;
}
interface Product { id: string; name: string; code: string; }
interface Uom { id: string; itemId: string; uomCode: string; conversionFactor: number; }

const ITEM_TYPES = ['raw_material', 'finished_good', 'retail', 'consumable'];

export function InventoryItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uoms, setUoms] = useState<Uom[]>([]);

  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newProductId, setNewProductId] = useState('');
  const [newBaseUom, setNewBaseUom] = useState('each');
  const [newItemType, setNewItemType] = useState('finished_good');
  const [newBatchTracked, setNewBatchTracked] = useState(false);
  const [newReorderPoint, setNewReorderPoint] = useState('');
  const [newReorderQty, setNewReorderQty] = useState('');

  const [newUomCode, setNewUomCode] = useState('');
  const [newUomFactor, setNewUomFactor] = useState('');

  function reload() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    apiFetch(`/v1/inventory/items?${params.toString()}`).then(setItems);
  }
  useEffect(() => { reload(); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiFetch('/v1/products').then(res => setProducts(Array.isArray(res) ? res : res.data || res.products || []));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newSku.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          sku: newSku.trim(), name: newName.trim(), productId: newProductId || null,
          baseUom: newBaseUom.trim() || 'each', itemType: newItemType, isBatchTracked: newBatchTracked,
          reorderPoint: newReorderPoint ? Number(newReorderPoint) : null,
          reorderQty: newReorderQty ? Number(newReorderQty) : null,
        }),
      });
      setNewSku(''); setNewName(''); setNewProductId(''); setNewBaseUom('each'); setNewItemType('finished_good');
      setNewBatchTracked(false); setNewReorderPoint(''); setNewReorderQty(''); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExpand(item: Item) {
    if (expanded === item.id) { setExpanded(null); return; }
    setExpanded(item.id);
    const rows = await apiFetch(`/v1/inventory/items/${item.id}/uoms`);
    setUoms(rows);
  }

  async function handleAddUom(itemId: string) {
    if (!newUomCode.trim() || !newUomFactor || Number(newUomFactor) <= 0) return;
    try {
      await apiFetch(`/v1/inventory/items/${itemId}/uoms`, {
        method: 'POST',
        body: JSON.stringify({ uomCode: newUomCode.trim(), conversionFactor: Number(newUomFactor) }),
      });
      setNewUomCode(''); setNewUomFactor('');
      const rows = await apiFetch(`/v1/inventory/items/${itemId}/uoms`);
      setUoms(rows);
    } catch (err: any) {
      showAlert(err.message || 'Failed to add this unit of measure.');
    }
  }

  return (
    <div className="inv-page">
      <div className="inv-page-hdr">
        <div>
          <PageHeader
            crumbs={['Inventory', 'Items']}
            titlePlain="Inventory"
            titleEm="items"
            subtitle="Every SKU stock is tracked against — optionally linked to a billing catalog entry, never duplicating its name or price."
          />
        </div>
        <Button type="button" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>New Item</span>
        </Button>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <Input type="text" placeholder="Search by name or SKU…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {showNew && (
        <div style={{ marginBottom: 20 }}>
        <SectionCard padded={false}>
          <form onSubmit={handleCreate}>
          <div className="inv-form-grid-3">
            <div className="inv-field-row">
              <label className="inv-field-label">SKU</label>
              <Input type="text" value={newSku} onChange={e => setNewSku(e.target.value)} placeholder="SKU-0001" />
            </div>
            <div className="inv-field-row" style={{ gridColumn: 'span 2' }}>
              <label className="inv-field-label">Name</label>
              <Input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. 20L Cooking Oil Jerrycan" />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Type</label>
              <Select value={newItemType} onValueChange={setNewItemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Base Unit</label>
              <Input type="text" value={newBaseUom} onChange={e => setNewBaseUom(e.target.value)} placeholder="each" />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Linked Product (optional)</label>
              <Combobox
                options={products.map(p => ({ value: p.id, label: p.name, sublabel: p.code }))}
                value={newProductId} onChange={setNewProductId}
                placeholder="None" searchPlaceholder="Search catalog…" emptyText="No matching products."
              />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Reorder Point</label>
              <Input type="number" min="0" step="any" value={newReorderPoint} onChange={e => setNewReorderPoint(e.target.value)} placeholder="0" />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Reorder Qty</label>
              <Input type="number" min="0" step="any" value={newReorderQty} onChange={e => setNewReorderQty(e.target.value)} placeholder="0" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={newBatchTracked} onChange={e => setNewBatchTracked(e.target.checked)} />
              Batch/Lot Tracked
            </label>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newSku.trim() || !newName.trim()}>{saving ? 'Creating…' : 'Create Item'}</Button>
          </div>
          </form>
        </SectionCard>
        </div>
      )}

      <SectionCard padded={false}>
        <div style={{ overflowX: 'auto' }}>
          {items.length === 0 ? (
            <div className="inv-empty">No items match.</div>
          ) : (
            <table className="inv-table">
              <thead>
                <tr><th>Item</th><th>Type</th><th>Base Unit</th><th>Reorder Point</th><th>Product Link</th><th></th></tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <React.Fragment key={item.id}>
                    <tr onClick={() => handleExpand(item)}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{item.name}</div>
                        <div className="inv-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>{item.sku}</div>
                      </td>
                      <td>{item.itemType.replace(/_/g, ' ')}</td>
                      <td>{item.baseUom}{item.isBatchTracked && <Badge variant="info" style={{ marginLeft: 6 }}>Batch</Badge>}</td>
                      <td>{item.reorderPoint ?? '—'}</td>
                      <td>{item.productName ?? <span style={{ color: 'var(--ink3)' }}>—</span>}</td>
                      <td><Icon name={expanded === item.id ? 'chevronUp' : 'chevronDown'} size={14} /></td>
                    </tr>
                    {expanded === item.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg)', padding: 16 }} onClick={e => e.stopPropagation()}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>Units of Measure</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            <span className="inv-mono" style={{ fontSize: 12, padding: '5px 10px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }}>
                              {item.baseUom} (base, ×1)
                            </span>
                            {uoms.map(u => (
                              <span key={u.id} className="inv-mono" style={{ fontSize: 12, padding: '5px 10px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                {u.uomCode} (×{u.conversionFactor})
                              </span>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <Input type="text" style={{ width: 120 }} placeholder="e.g. case" value={newUomCode} onChange={e => setNewUomCode(e.target.value)} />
                            <Input type="number" min="0" step="any" style={{ width: 100 }} placeholder="factor" value={newUomFactor} onChange={e => setNewUomFactor(e.target.value)} />
                            <Button type="button" variant="outline" onClick={() => handleAddUom(item.id)}>Add Unit</Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
