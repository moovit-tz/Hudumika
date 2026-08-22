import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiViewBlob } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

/**
 * Dangerous goods declaration(s) for one shipment — read/issue/print only.
 * Capturing and editing the declaration's own fields now happens on the
 * shipment's Cargo Details edit step (ShipmentEdit.tsx), right alongside
 * the "Normal / Dangerous goods" choice, rather than in a second inline
 * form here — a shipment either carries DG cargo or it doesn't, and that's
 * an edit to the shipment's own cargo details, not a separate worklist
 * action. This card is the Overview tab's read surface for whatever was
 * captured there: what's declared, whether it's been issued, and the real
 * IATA-shaped declaration PDF.
 */

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

export function DangerousGoodsPanel({ shipmentId }: { shipmentId: string }) {
  const [rows, setRows] = useState<DgDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuingId, setIssuingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/dangerous-goods/declarations?subject_type=shipment&subject_id=${shipmentId}`)
      .then((res: any) => setRows(Array.isArray(res) ? res : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  useEffect(load, [load]);

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

  if (loading) return <div style={{ color: 'var(--ink3)', fontSize: 12.5 }}>Loading…</div>;

  if (rows.length === 0) {
    return (
      <div style={{ color: 'var(--ink3)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="alertTriangle" size={13} color="var(--gold)" /> Tagged as dangerous goods, but no declaration details were saved. Edit the shipment's Cargo Details step to add them.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(row => (
        <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13.5 }}>{row.un_number} — {row.proper_shipping_name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                Class {row.class_or_division}
                {row.subsidiary_risk ? ` (sub. ${row.subsidiary_risk})` : ''}
                {row.packing_group ? ` · PG ${row.packing_group}` : ''}
                {' · '}{row.transport_mode}
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[row.status] ?? 'gray'}>{row.status}</Badge>
          </div>

          {row.transport_mode === 'AIR' && row.air_transport_restriction && row.air_transport_restriction !== 'PASSENGER_AND_CARGO' && (
            <div style={{
              fontSize: 11, fontWeight: 700, marginBottom: 8, padding: '4px 8px', borderRadius: 6, display: 'inline-block',
              background: row.air_transport_restriction === 'FORBIDDEN' ? 'var(--red-l)' : 'var(--gold-l)',
              color: row.air_transport_restriction === 'FORBIDDEN' ? 'var(--red)' : 'var(--gold)',
            }}>
              {row.air_transport_restriction.replace(/_/g, ' ')}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12, color: 'var(--ink2)', marginBottom: 10 }}>
            <div>Shipper: <strong style={{ color: 'var(--ink)' }}>{row.shipper_name}</strong></div>
            {(row.number_of_packages || row.net_quantity) && (
              <div>Qty: <strong style={{ color: 'var(--ink)' }}>{row.number_of_packages ?? '—'} {row.packaging_type || ''} / {row.net_quantity ?? '—'} {row.quantity_unit || ''}</strong></div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {row.status === 'draft' && (
              <Button size="xs" variant="outline" disabled={issuingId === row.id} onClick={() => issue(row.id)}>
                {issuingId === row.id ? 'Issuing…' : 'Issue'}
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => openPdf(row.id)}><Icon name="fileText" size={12} /> PDF</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
