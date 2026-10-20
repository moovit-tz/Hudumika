import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { matchesRecordSearch } from '../lib/record-search.js';
import type { PartStockMovement } from '@hudumika/types';
import { Banner } from '../components/ui/alert.js';
import './FreightOperations.css';
import { ResponsiveTable } from '../components/ui/responsive-table.js';
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';

interface Vendor { id: string; name: string }
interface Part {
  id: string; part_name: string; part_number: string | null; category: string | null;
  location_id: string | null; quantity: number; unit_cost: number | null; reorder_level: number; vendor_id: string | null;
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function AddPartModal({ vendors, onClose, onAdded }: { vendors: Vendor[]; onClose: () => void; onAdded: () => void }) {
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [unitCost, setUnitCost] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [vendorId, setVendorId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<{id:string;name:string;code:string}[]>([]);
  const [locationError, setLocationError] = useState('');
  useEffect(()=>{apiFetch('/v1/tracking/warehouse/locations').then(setLocations).catch(e=>setLocationError(e.message));},[]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/parts', {
        method: 'POST',
        body: JSON.stringify({
          part_name: partName, part_number: partNumber, category,
          quantity: Number(quantity), unit_cost: unitCost ? Number(unitCost) : undefined,
          location_id: locationId || undefined, reorder_level: Number(reorderLevel), vendor_id: vendorId || undefined,
        }),
      });
      onAdded(); onClose();
    } catch (err: any) { setError(err.message || 'Failed to add part'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(440px,92vw)] gap-0" style={{ padding: 28 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Add a part</DialogTitle>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label htmlFor="trackingpartsstock-field-1" style={labelStyle}>Part name</label><Input id="trackingpartsstock-field-1" required value={partName} onChange={e => setPartName(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label htmlFor="trackingpartsstock-field-2" style={labelStyle}>Part number</label><Input id="trackingpartsstock-field-2" value={partNumber} onChange={e => setPartNumber(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label htmlFor="trackingpartsstock-field-3" style={labelStyle}>Category</label><Input id="trackingpartsstock-field-3" value={category} onChange={e => setCategory(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label htmlFor="trackingpartsstock-field-4" style={labelStyle}>Quantity</label><Input id="trackingpartsstock-field-4" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label htmlFor="trackingpartsstock-field-5" style={labelStyle}>Unit cost</label><Input id="trackingpartsstock-field-5" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label htmlFor="trackingpartsstock-field-6" style={labelStyle}>Reorder level</label><Input id="trackingpartsstock-field-6" type="number" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} /></div>
          </div>
          <div>
            <label className="freight-field">Storage location<Combobox value={locationId} onChange={setLocationId} options={[{value:'',label:'Unassigned'},...locations.map(l=>({value:l.id,label:l.name,sublabel:l.code}))]} /></label>{locationError && <p className="freight-note">Locations unavailable: {locationError}</p>}<label style={labelStyle}>Supplier</label>
            <Combobox
              options={[{ value: '', label: '— None —' }, ...vendors.map(v => ({ value: v.id, label: v.name }))]}
              value={vendorId} onChange={setVendorId} placeholder="— None —"
            />
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !partName}>{saving ? 'Saving…' : 'Add part'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const TrackingPartsStock: React.FC = () => {
  const [query, setQuery] = useState('');
  const [pageError, setPageError] = useState('');
  const reportError = (e: unknown) => setPageError(e instanceof Error ? e.message : 'Unable to load records.');
  const [parts, setParts] = useState<Part[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [stockPart, setStockPart] = useState<Part | null>(null);
  const [movements, setMovements] = useState<PartStockMovement[]>([]);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [stockBusy, setStockBusy] = useState(false);
  useEffect(()=>{setMovements([]); if(stockPart) apiFetch(`/v1/tracking/parts/${stockPart.id}/movements`).then(setMovements).catch(reportError);},[stockPart]);
  async function recordMovement(e:React.FormEvent) { e.preventDefault(); if(!stockPart) return; setStockBusy(true); try { await apiFetch(`/v1/tracking/parts/${stockPart.id}/movements`,{method:'POST',body:JSON.stringify({quantity_delta:Number(delta),reason})}); setMovements(await apiFetch(`/v1/tracking/parts/${stockPart.id}/movements`)); setDelta('');setReason('');reload(); } catch(e){reportError(e);} finally{setStockBusy(false);} }

  const reload = useCallback(() => {
    setPageError('');
    setLoading(true);
    apiFetch('/v1/tracking/parts').then(setParts).catch(reportError).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vendors').then(setVendors).catch(reportError);
  }, [reload]);

  const vendorName = (id: string | null) => vendors.find(v => v.id === id)?.name ?? '—';

  async function remove(id: string) {
    if (!(await showConfirm('Remove this part?', { confirmLabel: 'Remove' }))) return;
    await apiFetch(`/v1/tracking/parts/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="freight-workspace">{pageError && <Banner variant="error">{pageError}</Banner>}
      {showAdd && <AddPartModal vendors={vendors} onClose={() => setShowAdd(false)} onAdded={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Parts']}
            titlePlain="Spare"
            titleEm="parts"
            subtitle="Spare parts inventory"
          />
        </div>
        <Button type="button" onClick={() => setShowAdd(true)}>
          <Icon name="package" size={15} /> Add part
        </Button>
      </div>

      {stockPart && <SectionCard title={`Stock movements · ${stockPart.part_name}`} collapsible={false} action={<Button variant="ghost" size="icon" title="Close movements" aria-label="Close movements" onClick={()=>setStockPart(null)}><Icon name="close" size={16}/></Button>}><form className="freight-form" onSubmit={recordMovement}><label className="freight-field">Change in units (+ receive / − issue)<Input type="number" step="1" required value={delta} onChange={e=>setDelta(e.target.value)}/></label><label className="freight-field">Reason / reference<Input required value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={stockBusy || !Number(delta) || !reason.trim()}>Record</Button></form><p className="freight-note">Balances before the ledger was introduced have no historical movement evidence.</p>{movements.map(m=><div className="freight-record" key={m.id}><span>{m.reason}<small className="freight-note"> · {new Date(m.created_at).toLocaleString()}</small></span><strong>{m.quantity_delta>0?'+':''}{m.quantity_delta} → {m.balance_after} units</strong></div>)}</SectionCard>}
      <SearchToolbar search={query} onSearch={setQuery} placeholder="Search records…" />
      <SectionCard>
        <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Part', 'Category', 'Quantity', 'Unit cost', 'Supplier', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && parts.filter(record => matchesRecordSearch(record, query)).map(p => {
              const low = p.quantity <= p.reorder_level;
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{p.part_name}{p.part_number ? <span style={{ color: 'var(--ink3)', fontWeight: 400 }}> · {p.part_number}</span> : ''}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{p.category || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontWeight: 700, color: low ? 'var(--red)' : 'var(--ink)' }}>{p.quantity}</span>
                    {low && <Badge variant="error" style={{ marginLeft: 8 }}>LOW STOCK</Badge>}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{p.unit_cost != null ? p.unit_cost.toLocaleString() : '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{vendorName(p.vendor_id)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}><Button variant="ghost" size="icon" title="Stock movements" aria-label="Stock movements" onClick={()=>setStockPart(p)}><Icon name="activity" size={16}/></Button>
                    <Button type="button" onClick={() => { void remove(p.id).catch(reportError); }} title="Remove" aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} data-ui-native-button="">
                      <Icon name="close" size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ResponsiveTable>
        {!loading && parts.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No matching parts.</div>
        )}
      </SectionCard>
    </div>
  );
};
