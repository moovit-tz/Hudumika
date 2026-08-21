import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch, apiViewBlob } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { getJobs } from './clearanceData.js';

/**
 * Delivery Documents — the merge of ClearOS's Release/Delivery Orders
 * (customs gate-pass: container list, carrier, validity window) and
 * FinOps's Delivery Notes (proof-of-delivery: goods table, driver,
 * signatures). See migration 263 / delivery-document.service.ts for the
 * combined data model. Lives in FinOps; ClearOS's ShipmentDetail reaches it
 * by calling the API directly (see LinkedOperationalDocs there).
 */

type DocType = 'RELEASE_ORDER' | 'DELIVERY_ORDER' | 'DELIVERY_NOTE';

interface ContainerLine { number: string; size: '20FT' | '40FT' | '40HC' | 'OTHER'; seal_number?: string; weight_kg?: number; }
interface DocLine { description?: string; qty_ordered?: number; qty_delivered?: number; unit?: string; condition?: string; remarks?: string; }

interface DeliveryDocument {
  id: string; doc_type: DocType; doc_number: string | null; status: string;
  subject_type: 'shipment' | 'adhoc'; subject_id: string | null;
  customer_name: string | null; carrier_name: string | null;
  containers: ContainerLine[] | string; valid_from: string | null; valid_until: string | null;
  delivery_date: string | null; driver_name: string | null; vehicle_no: string | null;
  created_at: string;
}

const DOC_TYPE_LABEL: Record<DocType, string> = {
  RELEASE_ORDER: 'Release Order', DELIVERY_ORDER: 'Delivery Order', DELIVERY_NOTE: 'Delivery Note',
};
const STATUS_VARIANT: Record<string, 'gray' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'gray', issued: 'info', dispatched: 'info', delivered: 'success', used: 'success',
  returned: 'warning', expired: 'warning', cancelled: 'error',
};

const emptyContainer = (): ContainerLine => ({ number: '', size: '40FT', seal_number: '', weight_kg: undefined });
const emptyLine = (): DocLine => ({ description: '', qty_ordered: undefined, qty_delivered: undefined, unit: '', condition: '', remarks: '' });

function parseContainers(c: ContainerLine[] | string): ContainerLine[] {
  if (Array.isArray(c)) return c;
  try { return JSON.parse(c) ?? []; } catch { return []; }
}

const emptyForm = {
  docType: 'DELIVERY_ORDER' as DocType,
  customerName: '', customerAddress: '', contactPerson: '', contactPhone: '', contactEmail: '',
  deliveryAddress: '', city: '',
  carrierName: '', vesselVoyage: '', driverName: '', vehicleNo: '', driverContact: '',
  releaseConditions: '', discrepancyNotes: '',
  validFrom: '', validUntil: '', deliveryDate: '',
};

export function DeliveryDocumentsPage() {
  usePageSEO('Delivery Documents', 'Release orders, delivery orders and delivery notes — one combined document, container list or goods table, real PDF, linked to the shipment they’re for.');
  const [urlParams] = useSearchParams();
  const shipmentFilter = urlParams.get('shipment');

  const [rows, setRows] = useState<DeliveryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [containers, setContainers] = useState<ContainerLine[]>([emptyContainer()]);
  const [lines, setLines] = useState<DocLine[]>([emptyLine()]);
  const [selectedJobId, setSelectedJobId] = useState(shipmentFilter || '');
  const [busyId, setBusyId] = useState<string | null>(null);

  const jobs = getJobs();
  const shipmentLabel = (id: string | null) => {
    if (!id) return null;
    const job = jobs.find(j => j.id === id);
    return job ? `${job.bl ? `${job.bl} — ` : ''}${job.customer}` : id;
  };

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(shipmentFilter ? `/v1/delivery-documents?shipment_id=${shipmentFilter}` : '/v1/delivery-documents')
      .then((res: any) => setRows(Array.isArray(res) ? res : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [shipmentFilter]);
  useEffect(load, [load]);
  useEffect(() => { if (shipmentFilter) setShowForm(true); }, [shipmentFilter]);

  const resetForm = () => {
    setForm(emptyForm); setContainers([emptyContainer()]); setLines([emptyLine()]);
    setSelectedJobId(shipmentFilter || ''); setError(null);
  };

  const pickJob = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    if (job) setForm(p => ({ ...p, customerName: p.customerName || job.customer }));
  };

  const isReleaseType = form.docType === 'RELEASE_ORDER' || form.docType === 'DELIVERY_ORDER';

  const submit = async () => {
    if (!form.customerName.trim()) { setError('Customer / consignee name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/delivery-documents', {
        method: 'POST',
        body: JSON.stringify({
          docType: form.docType,
          subjectType: selectedJobId ? 'shipment' : 'adhoc',
          subjectId: selectedJobId || undefined,
          customerName: form.customerName.trim(),
          customerAddress: form.customerAddress.trim() || undefined,
          contactPerson: form.contactPerson.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          ...(isReleaseType ? {
            containers: containers.filter(c => c.number.trim()).map(c => ({ ...c, weight_kg: c.weight_kg || undefined })),
            carrierName: form.carrierName.trim() || undefined,
            vesselVoyage: form.vesselVoyage.trim() || undefined,
            releaseConditions: form.releaseConditions.trim() || undefined,
            validFrom: form.validFrom || undefined,
            validUntil: form.validUntil || undefined,
          } : {
            deliveryAddress: form.deliveryAddress.trim() || undefined,
            city: form.city.trim() || undefined,
            driverName: form.driverName.trim() || undefined,
            vehicleNo: form.vehicleNo.trim() || undefined,
            driverContact: form.driverContact.trim() || undefined,
            discrepancyNotes: form.discrepancyNotes.trim() || undefined,
            deliveryDate: form.deliveryDate || undefined,
            lines: lines.filter(l => l.description?.trim()),
          }),
        }),
      });
      resetForm();
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  const issue = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/v1/delivery-documents/${id}/issue`, { method: 'PATCH' }); load(); }
    catch (err: any) { showAlert(err.message || 'Could not issue.', { variant: 'error' }); }
    finally { setBusyId(null); }
  };
  const markUsed = async (id: string) => {
    const ok = await showConfirm('Mark this order as used? This records that the gate pass has been redeemed.', { confirmLabel: 'Mark used' });
    if (!ok) return;
    setBusyId(id);
    try { await apiFetch(`/v1/delivery-documents/${id}/mark-used`, { method: 'PATCH' }); load(); }
    catch (err: any) { showAlert(err.message || 'Could not mark as used.', { variant: 'error' }); }
    finally { setBusyId(null); }
  };
  const setStatus = async (id: string, status: string) => {
    setBusyId(id);
    try { await apiFetch(`/v1/delivery-documents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); }
    catch (err: any) { showAlert(err.message || 'Could not update status.', { variant: 'error' }); }
    finally { setBusyId(null); }
  };
  const openPdf = (id: string) => {
    apiViewBlob(`/v1/delivery-documents/${id}/pdf`).catch(() => showAlert('Could not open the document.', { variant: 'error' }));
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['FinOps', 'Delivery Documents']}
        titlePlain="Delivery"
        titleEm="documents"
        subtitle="Release orders, delivery orders and delivery notes — one combined document, container list or goods table, real PDF, linked to the shipment they're for."
        actions={
          <Button onClick={() => setShowForm(s => !s)}>
            <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'New document'}
          </Button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {shipmentFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink2)' }}>
            <Icon name="package" size={14} color="var(--teal)" />
            <span>Showing documents for shipment <strong>{shipmentLabel(shipmentFilter) ?? shipmentFilter}</strong>.</span>
            <Link to="/finance/delivery-documents" style={{ marginLeft: 'auto', color: 'var(--teal)', fontWeight: 600, fontSize: 12 }}>View all documents</Link>
          </div>
        )}

        {showForm && (
          <SectionCard title="New document" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Document type *</label>
                <Select value={form.docType} onValueChange={v => setForm(p => ({ ...p, docType: v as DocType }))}>
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DELIVERY_ORDER">Delivery Order</SelectItem>
                    <SelectItem value="RELEASE_ORDER">Release Order</SelectItem>
                    <SelectItem value="DELIVERY_NOTE">Delivery Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Shipment (optional)</label>
                <Combobox
                  options={jobs.map(j => ({ value: j.id, label: `${j.bl ? `BL: ${j.bl} — ` : ''}${j.customer} (${j.title})` }))}
                  value={selectedJobId} onChange={pickJob} placeholder="Not linked to a shipment"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Customer / Consignee *</label>
                <Input value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Address</label>
                <Input value={form.customerAddress} onChange={e => setForm(p => ({ ...p, customerAddress: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Contact person</label>
                <Input value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Contact phone</label>
                <Input value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
              </div>
            </div>

            {isReleaseType ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Carrier</label>
                    <Input value={form.carrierName} onChange={e => setForm(p => ({ ...p, carrierName: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Vessel / Voyage</label>
                    <Input value={form.vesselVoyage} onChange={e => setForm(p => ({ ...p, vesselVoyage: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Valid from</label>
                    <DatePicker date={parseDateOnly(form.validFrom)} onChange={d => setForm(p => ({ ...p, validFrom: toDateOnlyString(d) }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Valid until</label>
                    <DatePicker date={parseDateOnly(form.validUntil)} onChange={d => setForm(p => ({ ...p, validUntil: toDateOnlyString(d) }))} />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Containers</label>
                    <Button size="xs" variant="outline" onClick={() => setContainers(p => [...p, emptyContainer()])}>Add container</Button>
                  </div>
                  {containers.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                      <Input placeholder="Container number" value={c.number} onChange={e => setContainers(p => p.map((x, j) => j === i ? { ...x, number: e.target.value.toUpperCase() } : x))} />
                      <Select value={c.size} onValueChange={v => setContainers(p => p.map((x, j) => j === i ? { ...x, size: v as any } : x))}>
                        <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20FT">20FT</SelectItem>
                          <SelectItem value="40FT">40FT</SelectItem>
                          <SelectItem value="40HC">40HC</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Seal number" value={c.seal_number || ''} onChange={e => setContainers(p => p.map((x, j) => j === i ? { ...x, seal_number: e.target.value } : x))} />
                      <Input type="number" placeholder="Weight (kg)" value={c.weight_kg ?? ''} onChange={e => setContainers(p => p.map((x, j) => j === i ? { ...x, weight_kg: e.target.value ? Number(e.target.value) : undefined } : x))} />
                      {containers.length > 1 && (
                        <Button size="icon" variant="ghost" onClick={() => setContainers(p => p.filter((_, j) => j !== i))}><Icon name="close" size={14} /></Button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Release conditions</label>
                  <Textarea value={form.releaseConditions} onChange={e => setForm(p => ({ ...p, releaseConditions: e.target.value }))} rows={2} placeholder="e.g. Subject to payment of outstanding demurrage." />
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Delivery address</label>
                    <Input value={form.deliveryAddress} onChange={e => setForm(p => ({ ...p, deliveryAddress: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>City</label>
                    <Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Driver name</label>
                    <Input value={form.driverName} onChange={e => setForm(p => ({ ...p, driverName: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Vehicle no.</label>
                    <Input value={form.vehicleNo} onChange={e => setForm(p => ({ ...p, vehicleNo: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Delivery date</label>
                    <DatePicker date={parseDateOnly(form.deliveryDate)} onChange={d => setForm(p => ({ ...p, deliveryDate: toDateOnlyString(d) }))} />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Goods</label>
                    <Button size="xs" variant="outline" onClick={() => setLines(p => [...p, emptyLine()])}>Add line</Button>
                  </div>
                  {lines.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                      <Input placeholder="Description" value={l.description || ''} onChange={e => setLines(p => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                      <Input type="number" placeholder="Qty sent" value={l.qty_ordered ?? ''} onChange={e => setLines(p => p.map((x, j) => j === i ? { ...x, qty_ordered: e.target.value ? Number(e.target.value) : undefined } : x))} />
                      <Input type="number" placeholder="Qty received" value={l.qty_delivered ?? ''} onChange={e => setLines(p => p.map((x, j) => j === i ? { ...x, qty_delivered: e.target.value ? Number(e.target.value) : undefined } : x))} />
                      <Input placeholder="Condition" value={l.condition || ''} onChange={e => setLines(p => p.map((x, j) => j === i ? { ...x, condition: e.target.value } : x))} />
                      {lines.length > 1 && (
                        <Button size="icon" variant="ghost" onClick={() => setLines(p => p.filter((_, j) => j !== i))}><Icon name="close" size={14} /></Button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Discrepancy notes</label>
                  <Textarea value={form.discrepancyNotes} onChange={e => setForm(p => ({ ...p, discrepancyNotes: e.target.value }))} rows={2} placeholder="Describe any discrepancies, damages or missing items…" />
                </div>
              </>
            )}

            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
            <Button disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save document'}</Button>
          </SectionCard>
        )}

        <SectionCard title="Documents" padded={false} collapsible={false}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No delivery documents yet.</div>
          ) : (
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Type', 'Customer', 'Shipment', 'Detail', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const cs = parseContainers(row.containers);
                  const isRelease = row.doc_type !== 'DELIVERY_NOTE';
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                        {DOC_TYPE_LABEL[row.doc_type]}
                        {row.doc_number && <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{row.doc_number}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{row.customer_name || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12.5 }}>
                        {row.subject_type === 'shipment' && row.subject_id
                          ? <Link to={`/clearance/${row.subject_id}`} style={{ color: 'var(--teal)', fontWeight: 600 }}>{shipmentLabel(row.subject_id) ?? 'View shipment'}</Link>
                          : <span style={{ color: 'var(--ink3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                        {isRelease
                          ? `${cs.length} container${cs.length === 1 ? '' : 's'}`
                          : (row.driver_name || row.vehicle_no ? `${row.driver_name || ''}${row.vehicle_no ? ` · ${row.vehicle_no}` : ''}` : '—')}
                      </td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[row.status] ?? 'gray'}>{row.status}</Badge></td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {isRelease && row.status === 'draft' && <Button size="xs" disabled={busyId === row.id} onClick={() => issue(row.id)}>Issue</Button>}
                          {isRelease && row.status === 'issued' && <Button size="xs" variant="outline" disabled={busyId === row.id} onClick={() => markUsed(row.id)}>Mark used</Button>}
                          {!isRelease && row.status === 'draft' && <Button size="xs" disabled={busyId === row.id} onClick={() => setStatus(row.id, 'dispatched')}>Dispatch</Button>}
                          {!isRelease && row.status === 'dispatched' && <Button size="xs" variant="outline" disabled={busyId === row.id} onClick={() => setStatus(row.id, 'delivered')}>Mark delivered</Button>}
                          <Button size="xs" variant="outline" onClick={() => openPdf(row.id)}>PDF</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
