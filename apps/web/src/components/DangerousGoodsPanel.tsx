import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiViewBlob } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { EntityPicker, type PickerItem } from './EntityPicker.js';

/**
 * Dangerous goods declarations for one shipment — DG cargo follows the same
 * clearing flow as any other shipment, with an extra layer of legally
 * required paperwork, so this renders inline here rather than as a separate
 * worklist page (that page, DangerousGoodsPage.tsx, has been removed —
 * everything it did — list, create, issue, print — now lives right where
 * the shipment itself is worked). See CreateShipmentPage.tsx for the
 * equivalent inline panel shown during shipment creation; this is the same
 * shape adapted to an already-existing shipment. Renders nothing until data
 * loads, then always shows something — even zero declarations — because the
 * "add one" affordance has to live somewhere now that the standalone page is
 * gone.
 */

interface DgReferenceEntry {
  un_number: string;
  proper_shipping_name: string;
  class_or_division: string;
  subsidiary_risk: string | null;
  packing_group: string | null;
  air_transport_restriction: string | null;
}

interface DgDeclaration {
  id: string;
  transport_mode: 'AIR' | 'SEA' | 'ROAD';
  un_number: string;
  proper_shipping_name: string;
  class_or_division: string;
  subsidiary_risk: string | null;
  packing_group: string | null;
  air_transport_restriction: string | null;
  packaging_type: string | null;
  number_of_packages: number | null;
  net_quantity: number | string | null;
  quantity_unit: string | null;
  shipper_name: string;
  status: 'draft' | 'issued';
  issued_at: string | null;
}

const STATUS_VARIANT: Record<string, 'gray' | 'success'> = { draft: 'gray', issued: 'success' };

const emptyForm = {
  transportMode: 'SEA' as 'AIR' | 'SEA' | 'ROAD',
  packagingType: '', numberOfPackages: '', netQuantity: '', quantityUnit: 'kg',
  shipperName: '', shipperAddress: '', emergencyContact: '',
};

export function DangerousGoodsPanel({
  shipmentId, customerId, customerName,
}: { shipmentId: string; customerId?: string; customerName?: string }) {
  const [rows, setRows] = useState<DgDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [selectedDg, setSelectedDg] = useState<PickerItem | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<DgReferenceEntry | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/dangerous-goods/declarations?subject_type=shipment&subject_id=${shipmentId}`)
      .then((res: any) => setRows(Array.isArray(res) ? res : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  useEffect(load, [load]);

  const searchDg = async (q: string): Promise<PickerItem[]> => {
    if (!q.trim()) return [];
    const res: DgReferenceEntry[] = await apiFetch(`/v1/dangerous-goods/reference?q=${encodeURIComponent(q)}`);
    return res.map(e => ({ id: e.un_number, label: `${e.un_number} — ${e.proper_shipping_name}`, sublabel: `Class ${e.class_or_division}${e.packing_group ? ` · PG ${e.packing_group}` : ''}` }));
  };

  const onPickDg = async (item: PickerItem | null) => {
    setSelectedDg(item);
    if (!item) { setSelectedEntry(null); return; }
    const res: DgReferenceEntry[] = await apiFetch(`/v1/dangerous-goods/reference?q=${encodeURIComponent(item.id)}`);
    setSelectedEntry(res.find(e => e.un_number === item.id) ?? null);
  };

  const submit = async () => {
    if (!selectedEntry) { setError('Choose a UN number from the reference list.'); return; }
    if (!form.shipperName.trim()) { setError('Shipper name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      let consigneeAddress: string | undefined;
      if (customerId) {
        const c = await apiFetch(`/v1/customers/${customerId}`).catch(() => null);
        consigneeAddress = c?.address || c?.data?.address || undefined;
      }
      await apiFetch('/v1/dangerous-goods/declarations', {
        method: 'POST',
        body: JSON.stringify({
          subjectType: 'shipment',
          subjectId: shipmentId,
          transportMode: form.transportMode,
          unNumber: selectedEntry.un_number,
          packagingType: form.packagingType.trim() || undefined,
          numberOfPackages: form.numberOfPackages ? parseInt(form.numberOfPackages, 10) : undefined,
          netQuantity: form.netQuantity ? parseFloat(form.netQuantity) : undefined,
          quantityUnit: form.quantityUnit.trim() || undefined,
          shipperName: form.shipperName.trim(),
          shipperAddress: form.shipperAddress.trim() || undefined,
          consigneeName: customerName || 'Unknown',
          consigneeAddress,
          emergencyContact: form.emergencyContact.trim() || undefined,
        }),
      });
      setForm(emptyForm);
      setSelectedDg(null);
      setSelectedEntry(null);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create declaration');
    } finally {
      setSaving(false);
    }
  };

  const issue = async (id: string) => {
    setIssuingId(id);
    try {
      await apiFetch(`/v1/dangerous-goods/declarations/${id}/issue`, { method: 'PATCH' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not issue this declaration.', { variant: 'error' });
    } finally {
      setIssuingId(null);
    }
  };

  const openPdf = (id: string) => {
    apiViewBlob(`/v1/dangerous-goods/declarations/${id}/pdf`).catch(() => showAlert('Could not open the declaration PDF.', { variant: 'error' }));
  };

  if (loading) return null;

  return (
    <div id="dg-panel" style={{ padding: '10px 24px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="alertTriangle" size={13} color="var(--gold)" /> Dangerous Goods
        </div>
        <Button size="xs" variant="outline" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : 'Add declaration'}
        </Button>
      </div>

      {rows.length === 0 && !showForm && (
        <div style={{ padding: '8px 0 12px', color: 'var(--ink3)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="checkCircle" size={14} /> No dangerous goods declared on this shipment.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>UN / Goods</th>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Class</th>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shipper</th>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{row.un_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{row.proper_shipping_name}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink2)' }}>
                    {row.class_or_division}{row.packing_group ? ` · PG ${row.packing_group}` : ''}
                    {row.transport_mode === 'AIR' && row.air_transport_restriction && row.air_transport_restriction !== 'PASSENGER_AND_CARGO' && (
                      <div style={{ fontSize: 10.5, color: row.air_transport_restriction === 'FORBIDDEN' ? 'var(--red)' : 'var(--gold)', fontWeight: 700, marginTop: 2 }}>
                        {row.air_transport_restriction.replace(/_/g, ' ')}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink2)' }}>{row.shipper_name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'gray'}>{row.status}</Badge>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {row.status === 'draft' && (
                        <Button size="xs" variant="outline" disabled={issuingId === row.id} onClick={() => issue(row.id)}>Issue</Button>
                      )}
                      <Button size="xs" variant="ghost" onClick={() => openPdf(row.id)}>PDF</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 12, marginBottom: 12 }}>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Transport mode</label>
              <Select value={form.transportMode} onValueChange={v => setForm(p => ({ ...p, transportMode: v as any }))}>
                <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEA">Sea</SelectItem>
                  <SelectItem value="AIR">Air</SelectItem>
                  <SelectItem value="ROAD">Road</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>UN number / goods *</label>
              <EntityPicker value={selectedDg} onChange={onPickDg} search={searchDg} placeholder="Search UN number or name…" />
            </div>
          </div>

          {selectedEntry && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 8, background: 'var(--white)', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{selectedEntry.un_number}</span>
              <span style={{ color: 'var(--ink)' }}>{selectedEntry.proper_shipping_name}</span>
              <span style={{ color: 'var(--ink3)' }}>
                Class {selectedEntry.class_or_division}
                {selectedEntry.subsidiary_risk ? ` (sub. ${selectedEntry.subsidiary_risk})` : ''}
                {selectedEntry.packing_group ? ` · PG ${selectedEntry.packing_group}` : ''}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Packaging type</label>
              <input type="text" className="input-field" style={{ width: '100%' }} value={form.packagingType} onChange={e => setForm(p => ({ ...p, packagingType: e.target.value }))} placeholder="e.g. Fibreboard box" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>No. of packages</label>
              <input type="text" className="input-field" style={{ width: '100%' }} value={form.numberOfPackages} onChange={e => setForm(p => ({ ...p, numberOfPackages: e.target.value.replace(/[^0-9]/g, '') }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Net quantity</label>
              <input type="text" className="input-field" style={{ width: '100%' }} value={form.netQuantity} onChange={e => setForm(p => ({ ...p, netQuantity: e.target.value.replace(/[^0-9.]/g, '') }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Unit</label>
              <input type="text" className="input-field" style={{ width: '100%' }} value={form.quantityUnit} onChange={e => setForm(p => ({ ...p, quantityUnit: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Shipper name *</label>
              <input type="text" className="input-field" style={{ width: '100%' }} value={form.shipperName} onChange={e => setForm(p => ({ ...p, shipperName: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Shipper address</label>
              <input type="text" className="input-field" style={{ width: '100%' }} value={form.shipperAddress} onChange={e => setForm(p => ({ ...p, shipperAddress: e.target.value }))} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Emergency contact</label>
            <input type="text" className="input-field" style={{ width: '100%' }} value={form.emergencyContact} onChange={e => setForm(p => ({ ...p, emergencyContact: e.target.value }))} placeholder="name + 24h phone" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="sm" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save declaration'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
