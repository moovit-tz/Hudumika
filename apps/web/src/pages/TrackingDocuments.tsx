import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { matchesRecordSearch } from '../lib/record-search.js';
import { Banner } from '../components/ui/alert.js';
import './FreightOperations.css';
import { ResponsiveTable } from '../components/ui/responsive-table.js';
import React, { useState, useEffect, useCallback } from 'react';
import { DriveFilePicker } from '../components/DriveFilePicker.js';
import { apiFetch, apiViewBlob } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Doc {
  id: string; vehicle_id: string; doc_type: string; doc_number: string | null;
  issued_date: string | null; expiry_date: string | null; notes: string | null; source_status: string | null; file_url: string | null; comply_certificate_id: string | null;
}

const DOC_TYPES = ['REGISTRATION', 'INSURANCE', 'INSPECTION', 'PERMIT', 'OTHER'];
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function AddDocModal({ vehicles, onClose, onAdded }: { vehicles: Vehicle[]; onClose: () => void; onAdded: () => void }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [docType, setDocType] = useState('REGISTRATION');
  const [docNumber, setDocNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [certificateId, setCertificateId] = useState('');
  const [certificates, setCertificates] = useState<{id:string;name:string;cert_number:string;issued_date:string|null;expiry_date:string|null;document_url:string|null}[]>([]);
  const [certificateError, setCertificateError] = useState('');
  useEffect(() => { apiFetch('/v1/comply/certificates').then(setCertificates).catch(e => setCertificateError(e.message)); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/documents', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId, doc_type: docType, doc_number: docNumber,
          issued_date: issuedDate || undefined, expiry_date: expiryDate || undefined, file_url: fileUrl || undefined, comply_certificate_id: certificateId || undefined,
        }),
      });
      onAdded(); onClose();
    } catch (err: any) { setError(err.message || 'Failed to add document'); }
    finally { setSaving(false); }
  }

  return (
    <>
    <DriveFilePicker description="Link a saved file. Access remains governed by its Drive permissions." open={pickerOpen} onOpenChange={setPickerOpen} onPick={file => { setFileUrl(`/v1/files/${file.id}/download`); setPickerOpen(false); }} />
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(440px,92vw)] gap-0" style={{ padding: 28 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Add a document</DialogTitle>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Vehicle</label>
              <Combobox
                options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
                value={vehicleId} onChange={setVehicleId} placeholder="Select vehicle…"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="freight-field">ComplyOS certificate (optional)<Combobox value={certificateId} onChange={value => { setCertificateId(value); const c = certificates.find(c => c.id === value); if(c) { setDocNumber(c.cert_number); setIssuedDate(c.issued_date || ''); setExpiryDate(c.expiry_date || ''); setFileUrl(c.document_url || ''); } }} options={[{value:'',label:'No linked certificate'},...certificates.map(c => ({value:c.id,label:c.name,sublabel:c.cert_number}))]} /></label>{certificateError && <p className="freight-note">ComplyOS certificates unavailable: {certificateError}</p>}<label className="freight-field">Document link<Input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://…" /></label><Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>Attach from Drive</Button>
          <div><label htmlFor="trackingdocuments-field-1" style={labelStyle}>Document number</label><Input id="trackingdocuments-field-1" value={docNumber} onChange={e => setDocNumber(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Issued date</label><DatePicker date={parseDateOnly(issuedDate)} onChange={d => setIssuedDate(toDateOnlyString(d))} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Expiry date</label><DatePicker date={parseDateOnly(expiryDate)} onChange={d => setExpiryDate(toDateOnlyString(d))} /></div>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !vehicleId}>{saving ? 'Saving…' : 'Add document'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog></>
  );
}

export const TrackingDocuments: React.FC = () => {
  const [query, setQuery] = useState('');
  const [pageError, setPageError] = useState('');
  const reportError = (e: unknown) => setPageError(e instanceof Error ? e.message : 'Unable to load records.');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(() => {
    setPageError('');
    setLoading(true);
    apiFetch('/v1/tracking/documents').then(setDocs).catch(reportError).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(reportError);
  }, [reload]);

  const vehicleName = (id: string) => vehicles.find(v => v.id === id)?.name ?? '—';

  function expiryStatus(date: string | null): { label: string; variant: 'error' | 'warning' | 'success' } | null {
    if (!date) return null;
    const days = (new Date(date).getTime() - Date.now()) / 86_400_000;
    if (days < 0) return { label: 'EXPIRED', variant: 'error' };
    if (days < 30) return { label: 'EXPIRING SOON', variant: 'warning' };
    return { label: 'IN DATE (UNVERIFIED)', variant: 'success' };
  }

  async function remove(id: string) {
    if (!(await showConfirm('Remove this document?', { confirmLabel: 'Remove' }))) return;
    await apiFetch(`/v1/tracking/documents/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="freight-workspace">{pageError && <Banner variant="error">{pageError}</Banner>}
      {showAdd && <AddDocModal vehicles={vehicles} onClose={() => setShowAdd(false)} onAdded={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Documents']}
            titlePlain="Fleet"
            titleEm="documents"
            subtitle="Registration, insurance, inspection &amp; permit expiry tracking"
          />
        </div>
        <Button type="button" onClick={() => setShowAdd(true)} disabled={vehicles.length === 0}>
          <Icon name="shield" size={15} /> Add document
        </Button>
      </div>

      <SearchToolbar search={query} onSearch={setQuery} placeholder="Search records…" />
      <SectionCard>
        <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Vehicle', 'Type', 'Number', 'Expiry', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && docs.filter(record => matchesRecordSearch(record, query)).map(d => {
              const st = d.source_status === 'revoked' ? {label:'REVOKED',variant:'error' as const} : expiryStatus(d.expiry_date);
              return (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{vehicleName(d.vehicle_id)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{d.doc_type}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{d.doc_number || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {st && <Badge variant={st.variant}>{st.label}</Badge>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{d.file_url && <Button variant="ghost" size="icon" aria-label="View document" title="View document" onClick={() => { if (d.file_url?.startsWith('/v1/files/')) void apiViewBlob(d.file_url).catch(reportError); else if (d.file_url && /^https?:\/\//i.test(d.file_url)) window.open(d.file_url, '_blank', 'noopener,noreferrer'); }}><Icon name="fileText" size={16} /></Button>}{d.comply_certificate_id && <Button variant="ghost" asChild><a href="/complyos/vault">ComplyOS</a></Button>}
                    <Button type="button" onClick={() => { void remove(d.id).catch(reportError); }} title="Remove" aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} data-ui-native-button="">
                      <Icon name="close" size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ResponsiveTable>
        {!loading && docs.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No matching documents.</div>
        )}
      </SectionCard>
    </div>
  );
};
