import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch, apiViewBlob } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';

/**
 * Container/equipment depot management — lives in HuduFreight (moved from
 * ClearOS: collecting cargo against a release document is a fleet act).
 * Deliberately not merged with the three existing per-shipment container
 * tables (shipment_cases.containers, container_tracking, seal_containers).
 * See depot.service.ts's header for why. Equipment Interchange Receipts
 * replace SEAL's unpersisted print-only EIR popup with a real record, and
 * can link to the release/delivery order (now in FinOps's Delivery
 * Documents) that authorized the pickup — see release_document_id.
 */

interface Equipment {
  id: string; equipment_number: string; equipment_type: string; condition: string;
  location: string | null; status: string; owner_carrier: string | null; last_movement_at: string | null;
}
interface Receipt {
  id: string; equipment_number: string; direction: 'GATE_IN' | 'GATE_OUT'; party_name: string;
  condition_at_interchange: string; reference_number: string | null; occurred_at: string;
  release_document_id: string | null;
}
interface ReleaseDoc {
  id: string; doc_type: string; doc_number: string | null; customer_name: string | null;
}

const EQUIPMENT_TYPES = [
  { value: 'CONTAINER_20FT', label: 'Container — 20FT' },
  { value: 'CONTAINER_40FT', label: 'Container — 40FT' },
  { value: 'CONTAINER_40HC', label: 'Container — 40HC' },
  { value: 'CHASSIS', label: 'Chassis' },
  { value: 'GENSET', label: 'Genset' },
  { value: 'OTHER', label: 'Other' },
];
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'gray' | 'error'> = {
  AVAILABLE: 'success', ALLOCATED: 'warning', OUT: 'gray', MAINTENANCE: 'error',
};
const CONDITION_VARIANT: Record<string, 'success' | 'error' | 'warning'> = { GOOD: 'success', DAMAGED: 'error', UNDER_REPAIR: 'warning' };

export function DepotPage() {
  usePageSEO('Container Depot', 'Equipment sitting at a depot, and a real Equipment Interchange Receipt for every gate movement — not a print-and-forget popup.');
  const [tab, setTab] = useState<'equipment' | 'receipts'>('equipment');

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [releaseDocs, setReleaseDocs] = useState<ReleaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEqForm, setShowEqForm] = useState(false);
  const [showRcForm, setShowRcForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eqForm, setEqForm] = useState({ equipmentNumber: '', equipmentType: 'CONTAINER_40FT', location: '', ownerCarrier: '' });
  const [rcForm, setRcForm] = useState({ equipmentNumber: '', direction: 'GATE_IN' as 'GATE_IN' | 'GATE_OUT', partyName: '', conditionAtInterchange: 'GOOD' as 'GOOD' | 'DAMAGED', damageNotes: '', driverName: '', vehicleReg: '', releaseDocumentId: '' });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/depot/equipment').catch(() => []),
      apiFetch('/v1/depot/interchange-receipts').catch(() => []),
      // Issued release/delivery orders — the ones a truck could actually be
      // collecting against right now. Lives in FinOps now (migration 263).
      apiFetch('/v1/delivery-documents?status=issued').catch(() => []),
    ]).then(([eq, rc, docs]) => {
      setEquipment(Array.isArray(eq) ? eq : []);
      setReceipts(Array.isArray(rc) ? rc : []);
      setReleaseDocs(Array.isArray(docs) ? docs.filter((d: any) => d.doc_type !== 'DELIVERY_NOTE') : []);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const submitEquipment = async () => {
    if (!eqForm.equipmentNumber.trim()) { setError('Equipment number is required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/depot/equipment', {
        method: 'POST',
        body: JSON.stringify({
          equipmentNumber: eqForm.equipmentNumber.trim(), equipmentType: eqForm.equipmentType,
          location: eqForm.location.trim() || undefined, ownerCarrier: eqForm.ownerCarrier.trim() || undefined,
        }),
      });
      setEqForm({ equipmentNumber: '', equipmentType: 'CONTAINER_40FT', location: '', ownerCarrier: '' });
      setShowEqForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to add equipment'); }
    finally { setSaving(false); }
  };

  const submitReceipt = async () => {
    if (!rcForm.equipmentNumber.trim() || !rcForm.partyName.trim()) { setError('Equipment number and party are required.'); return; }
    setSaving(true); setError(null);
    try {
      // Match against the depot's own equipment registry (already loaded in
      // state) so the receipt links to the real depot_equipment row instead
      // of just carrying a plain-text equipment number. A number that isn't
      // registered yet is a legitimate case too — recordInterchange() still
      // accepts it as 'adhoc', it just can't be linked to nothing that exists.
      const matched = equipment.find(e => e.equipment_number === rcForm.equipmentNumber.trim().toUpperCase());
      await apiFetch('/v1/depot/interchange-receipts', {
        method: 'POST',
        body: JSON.stringify({
          subjectType: matched ? 'depot_equipment' : 'adhoc',
          subjectId: matched?.id,
          releaseDocumentId: rcForm.releaseDocumentId || undefined,
          equipmentNumber: rcForm.equipmentNumber.trim(), direction: rcForm.direction, partyName: rcForm.partyName.trim(),
          conditionAtInterchange: rcForm.conditionAtInterchange, damageNotes: rcForm.damageNotes.trim() || undefined,
          driverName: rcForm.driverName.trim() || undefined, vehicleReg: rcForm.vehicleReg.trim() || undefined,
        }),
      });
      setRcForm({ equipmentNumber: '', direction: 'GATE_IN', partyName: '', conditionAtInterchange: 'GOOD', damageNotes: '', driverName: '', vehicleReg: '', releaseDocumentId: '' });
      setShowRcForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to record interchange'); }
    finally { setSaving(false); }
  };

  const openPdf = (id: string) => {
    apiViewBlob(`/v1/depot/interchange-receipts/${id}/pdf`).catch(() => showAlert('Could not open the receipt PDF.', { variant: 'error' }));
  };

  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const updateStatus = async (id: string, status: string) => {
    setStatusSavingId(id);
    try {
      await apiFetch(`/v1/depot/equipment/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update status.', { variant: 'error' });
    } finally {
      setStatusSavingId(null);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['HuduFreight', 'Equipment & Depot']}
        titlePlain="Container"
        titleEm="depot"
        subtitle="Equipment sitting at a depot, and a real Equipment Interchange Receipt for every gate movement — not a print-and-forget popup."
        actions={
          tab === 'equipment'
            ? <Button onClick={() => setShowEqForm(s => !s)}><Icon name="plus" size={14} /> {showEqForm ? 'Cancel' : 'Add equipment'}</Button>
            : <Button onClick={() => setShowRcForm(s => !s)}><Icon name="plus" size={14} /> {showRcForm ? 'Cancel' : 'Record interchange'}</Button>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button size="sm" variant={tab === 'equipment' ? 'default' : 'outline'} onClick={() => setTab('equipment')}>Equipment</Button>
        <Button size="sm" variant={tab === 'receipts' ? 'default' : 'outline'} onClick={() => setTab('receipts')}>Interchange Receipts</Button>
      </div>

      {tab === 'equipment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {showEqForm && (
            <SectionCard title="Add equipment" collapsible={false}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Equipment number *</label>
                  <Input value={eqForm.equipmentNumber} onChange={e => setEqForm(p => ({ ...p, equipmentNumber: e.target.value.toUpperCase() }))} placeholder="TCLU9988776" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Type</label>
                  <Select value={eqForm.equipmentType} onValueChange={v => setEqForm(p => ({ ...p, equipmentType: v }))}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>{EQUIPMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Location</label>
                  <Input value={eqForm.location} onChange={e => setEqForm(p => ({ ...p, location: e.target.value }))} placeholder="Depot Yard A" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Owner carrier</label>
                  <Input value={eqForm.ownerCarrier} onChange={e => setEqForm(p => ({ ...p, ownerCarrier: e.target.value }))} />
                </div>
              </div>
              {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
              <Button disabled={saving} onClick={submitEquipment}>{saving ? 'Saving…' : 'Add equipment'}</Button>
            </SectionCard>
          )}

          <SectionCard title="Equipment" padded={false} collapsible={false}>
            {loading ? (
              <SectionLoading />
            ) : equipment.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No equipment recorded at any depot yet.</div>
            ) : (
              <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Equipment No.', 'Type', 'Condition', 'Location', 'Owner', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipment.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{e.equipment_number}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{EQUIPMENT_TYPES.find(t => t.value === e.equipment_type)?.label ?? e.equipment_type}</td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={CONDITION_VARIANT[e.condition] ?? 'gray' as any}>{e.condition}</Badge></td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{e.location || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{e.owner_carrier || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Select value={e.status} onValueChange={v => updateStatus(e.id, v)} disabled={statusSavingId === e.id}>
                          <SelectTrigger className="input-field" style={{ width: 140, minHeight: 'var(--ctl-h-xs)' }}>
                            <Badge variant={STATUS_VARIANT[e.status] ?? 'gray'}>{e.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AVAILABLE">Available</SelectItem>
                            <SelectItem value="ALLOCATED">Allocated</SelectItem>
                            <SelectItem value="OUT">Out</SelectItem>
                            <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'receipts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {showRcForm && (
            <SectionCard title="Record interchange" collapsible={false}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Equipment number *</label>
                  <Input value={rcForm.equipmentNumber} onChange={e => setRcForm(p => ({ ...p, equipmentNumber: e.target.value.toUpperCase() }))} placeholder="TCLU9988776" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Release / delivery order</label>
                  <Combobox
                    options={releaseDocs.map(d => ({ value: d.id, label: `${d.doc_number || d.doc_type} — ${d.customer_name || 'No customer'}` }))}
                    value={rcForm.releaseDocumentId} onChange={v => setRcForm(p => ({ ...p, releaseDocumentId: v }))} placeholder="Not linked to an order"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Direction</label>
                  <Select value={rcForm.direction} onValueChange={v => setRcForm(p => ({ ...p, direction: v as any }))}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GATE_IN">Gate In (returning)</SelectItem>
                      <SelectItem value="GATE_OUT">Gate Out (releasing)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Party (trucker/carrier) *</label>
                  <Input value={rcForm.partyName} onChange={e => setRcForm(p => ({ ...p, partyName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Condition</label>
                  <Select value={rcForm.conditionAtInterchange} onValueChange={v => setRcForm(p => ({ ...p, conditionAtInterchange: v as any }))}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GOOD">Good</SelectItem>
                      <SelectItem value="DAMAGED">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Driver</label>
                  <Input value={rcForm.driverName} onChange={e => setRcForm(p => ({ ...p, driverName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Vehicle reg.</label>
                  <Input value={rcForm.vehicleReg} onChange={e => setRcForm(p => ({ ...p, vehicleReg: e.target.value }))} />
                </div>
                {rcForm.conditionAtInterchange === 'DAMAGED' && (
                  <div style={{ gridColumn: 'span 3' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Damage notes</label>
                    <Input value={rcForm.damageNotes} onChange={e => setRcForm(p => ({ ...p, damageNotes: e.target.value }))} />
                  </div>
                )}
              </div>
              {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
              <Button disabled={saving} onClick={submitReceipt}>{saving ? 'Saving…' : 'Record interchange'}</Button>
            </SectionCard>
          )}

          <SectionCard title="Interchange receipts" padded={false} collapsible={false}>
            {loading ? (
              <SectionLoading />
            ) : receipts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No interchange receipts yet.</div>
            ) : (
              <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Reference', 'Equipment No.', 'Direction', 'Party', 'Condition', 'Occurred', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{r.reference_number}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>
                        {r.equipment_number}
                        {r.release_document_id && (
                          <div>
                            <Link to={`/finance/delivery-documents`} style={{ fontSize: 10.5, color: 'var(--teal)', fontWeight: 600 }}>
                              {releaseDocs.find(d => d.id === r.release_document_id)?.doc_number || 'Linked order'}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={r.direction === 'GATE_IN' ? 'info' : 'gray'}>{r.direction.replace('_', ' ')}</Badge></td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{r.party_name}</td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={CONDITION_VARIANT[r.condition_at_interchange] ?? 'gray' as any}>{r.condition_at_interchange}</Badge></td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>{new Date(r.occurred_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <Button size="xs" variant="outline" onClick={() => openPdf(r.id)}>PDF</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
