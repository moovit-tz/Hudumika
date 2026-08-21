import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Doc {
  id: string; vehicle_id: string; doc_type: string; doc_number: string | null;
  issued_date: string | null; expiry_date: string | null; notes: string | null;
}

const DOC_TYPES = ['REGISTRATION', 'INSURANCE', 'INSPECTION', 'PERMIT', 'OTHER'];
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function AddDocModal({ vehicles, onClose, onAdded }: { vehicles: Vehicle[]; onClose: () => void; onAdded: () => void }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [docType, setDocType] = useState('REGISTRATION');
  const [docNumber, setDocNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/documents', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId, doc_type: docType, doc_number: docNumber,
          issued_date: issuedDate || undefined, expiry_date: expiryDate || undefined,
        }),
      });
      onAdded(); onClose();
    } catch (err: any) { setError(err.message || 'Failed to add document'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 440, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Add a document</div>
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
          <div><label style={labelStyle}>Document number</label><input value={docNumber} onChange={e => setDocNumber(e.target.value)} style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Issued date</label><DatePicker date={parseDateOnly(issuedDate)} onChange={d => setIssuedDate(toDateOnlyString(d))} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Expiry date</label><DatePicker date={parseDateOnly(expiryDate)} onChange={d => setExpiryDate(toDateOnlyString(d))} /></div>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving || !vehicleId} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Saving…' : 'Add document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const TrackingDocuments: React.FC = () => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/documents').then(setDocs).catch(() => setDocs([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, [reload]);

  const vehicleName = (id: string) => vehicles.find(v => v.id === id)?.name ?? '—';

  function expiryStatus(date: string | null): { label: string; bg: string; fg: string } | null {
    if (!date) return null;
    const days = (new Date(date).getTime() - Date.now()) / 86_400_000;
    if (days < 0) return { label: 'EXPIRED', bg: 'var(--red-l)', fg: '#dc2626' };
    if (days < 30) return { label: 'EXPIRING SOON', bg: 'var(--gold-l)', fg: '#ca8a04' };
    return { label: 'VALID', bg: 'var(--green-l)', fg: '#065f46' };
  }

  async function remove(id: string) {
    if (!(await showConfirm('Remove this document?', { confirmLabel: 'Remove' }))) return;
    await apiFetch(`/v1/tracking/documents/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
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
        <button type="button" onClick={() => setShowAdd(true)} disabled={vehicles.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: vehicles.length === 0 ? 'default' : 'pointer', opacity: vehicles.length === 0 ? 0.5 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="shield" size={15} /> Add document
        </button>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Vehicle', 'Type', 'Number', 'Expiry', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && docs.map(d => {
              const st = expiryStatus(d.expiry_date);
              return (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{vehicleName(d.vehicle_id)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{d.doc_type}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{d.doc_number || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {st && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: st.bg, color: st.fg }}>{st.label}</span>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button type="button" onClick={() => remove(d.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                      <Icon name="close" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && docs.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No documents added yet.</div>
        )}
      </div>
    </div>
  );
};
