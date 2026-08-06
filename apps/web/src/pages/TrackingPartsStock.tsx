import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

interface Vendor { id: string; name: string }
interface Part {
  id: string; part_name: string; part_number: string | null; category: string | null;
  quantity: number; unit_cost: number | null; reorder_level: number; vendor_id: string | null;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function AddPartModal({ vendors, onClose, onAdded }: { vendors: Vendor[]; onClose: () => void; onAdded: () => void }) {
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [unitCost, setUnitCost] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [vendorId, setVendorId] = useState('');
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
          reorder_level: Number(reorderLevel), vendor_id: vendorId || undefined,
        }),
      });
      onAdded(); onClose();
    } catch (err: any) { setError(err.message || 'Failed to add part'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 440, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Add a part</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={labelStyle}>Part name</label><input required value={partName} onChange={e => setPartName(e.target.value)} style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Part number</label><input value={partNumber} onChange={e => setPartNumber(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Category</label><input value={category} onChange={e => setCategory(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Quantity</label><input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Unit cost</label><input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Reorder level</label><input type="number" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} style={inputStyle} /></div>
          </div>
          <div>
            <label style={labelStyle}>Supplier</label>
            <Combobox
              options={[{ value: '', label: '— None —' }, ...vendors.map(v => ({ value: v.id, label: v.name }))]}
              value={vendorId} onChange={setVendorId} placeholder="— None —"
            />
          </div>
          {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving || !partName} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Saving…' : 'Add part'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const TrackingPartsStock: React.FC = () => {
  const [parts, setParts] = useState<Part[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/parts').then(setParts).catch(() => setParts([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vendors').then(setVendors).catch(() => setVendors([]));
  }, [reload]);

  const vendorName = (id: string | null) => vendors.find(v => v.id === id)?.name ?? '—';

  async function remove(id: string) {
    if (!(await showConfirm('Remove this part?', { confirmLabel: 'Remove' }))) return;
    await apiFetch(`/v1/tracking/parts/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
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
        <button type="button" onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="package" size={15} /> Add part
        </button>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Part', 'Category', 'Quantity', 'Unit cost', 'Supplier', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && parts.map(p => {
              const low = p.quantity <= p.reorder_level;
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{p.part_name}{p.part_number ? <span style={{ color: 'var(--ink3)', fontWeight: 400 }}> · {p.part_number}</span> : ''}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{p.category || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontWeight: 700, color: low ? '#dc2626' : 'var(--ink)' }}>{p.quantity}</span>
                    {low && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 8px', background: '#fee2e2', color: '#dc2626' }}>LOW STOCK</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{p.unit_cost != null ? p.unit_cost.toLocaleString() : '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{vendorName(p.vendor_id)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button type="button" onClick={() => remove(p.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                      <Icon name="close" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && parts.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No parts in stock yet.</div>
        )}
      </div>
    </div>
  );
};
