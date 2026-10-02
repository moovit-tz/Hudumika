import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

interface AgedLot {
  lot_id: string;
  lot_ref: string;
  description: string;
  qty: number;
  unit: string;
  compartment_name: string;
  received_at: string;
  days_stored: number;
  current_charges: number;
  currency: string;
}

function ageBucket(days: number): { label: string; variant: 'success' | 'warning' | 'error' | 'gray' } {
  if (days < 7)   return { label: '0–7 days',  variant: 'gray' };
  if (days < 30)  return { label: '7–30 days', variant: 'success' };
  if (days < 90)  return { label: '30–90 days',variant: 'warning' };
  return { label: '90+ days', variant: 'error' };
}

export function SealAgedStorage() {
  const [compartmentId] = useSealCompartmentId();
  const [lots, setLots] = useState<AgedLot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ aged: '1' });
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/lots?${params}`)
      .then((r: any) => setLots(Array.isArray(r) ? r : r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [compartmentId]);

  const totalCharges = lots.reduce((s, l) => s + (l.current_charges ?? 0), 0);
  const overdue = lots.filter(l => l.days_stored >= 90);

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Billing', 'Aged Storage']}
        titlePlain="Aged"
        titleEm="storage"
        subtitle="Lots that have been in storage beyond standard dwell times — review for billing or release action."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Lots', value: lots.length, color: 'var(--teal)' },
          { label: '90+ Days', value: overdue.length, color: 'var(--red)' },
          { label: 'Accrued Charges', value: `${lots[0]?.currency ?? 'TZS'} ${totalCharges.toLocaleString()}`, color: 'var(--gold)' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : lots.length === 0 ? (
            <div className="seal-empty">No aged lots found.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot Ref</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Warehouse</th>
                  <th>Received</th>
                  <th>Age</th>
                  <th>Charges</th>
                </tr>
              </thead>
              <tbody>
                {lots.map(l => {
                  const { label, variant } = ageBucket(l.days_stored);
                  return (
                    <tr key={l.lot_id}>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600 }}>{l.lot_ref}</td>
                      <td>{l.description}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{l.qty} {l.unit}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{l.compartment_name}</td>
                      <td style={{ fontSize: 12 }}>{new Date(l.received_at).toLocaleDateString()}</td>
                      <td>
                        <Badge variant={variant}>{label}</Badge>
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink3)' }}>{l.days_stored}d</span>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: l.days_stored >= 90 ? 'var(--red)' : 'var(--ink)' }}>
                        {l.currency} {(l.current_charges ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
