import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';

interface Vendor {
  id: string; name: string; vendor_type: string; phone: string | null;
  email: string | null; address: string | null; active: boolean;
}

const VENDOR_TYPES = ['WORKSHOP', 'FUEL_STATION', 'PARTS_SUPPLIER', 'INSURANCE', 'OTHER'];
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function AddVendorModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [vendorType, setVendorType] = useState('WORKSHOP');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/vendors', {
        method: 'POST',
        body: JSON.stringify({ name, vendor_type: vendorType, phone, email, address }),
      });
      onAdded(); onClose();
    } catch (err: any) { setError(err.message || 'Failed to add vendor'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(440px,92vw)] gap-0" style={{ padding: 28 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Add a vendor</DialogTitle>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={labelStyle}>Name</label><Input required value={name} onChange={e => setName(e.target.value)} /></div>
          <div>
            <label style={labelStyle}>Type</label>
            <Select value={vendorType} onValueChange={setVendorType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENDOR_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Email</label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
          <div><label style={labelStyle}>Address</label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add vendor'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const TrackingVendors: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/vendors').then(setVendors).catch(() => setVendors([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function remove(id: string) {
    if (!(await showConfirm('Remove this vendor?', { confirmLabel: 'Remove' }))) return;
    await apiFetch(`/v1/tracking/vendors/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
      {showAdd && <AddVendorModal onClose={() => setShowAdd(false)} onAdded={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Vendors']}
            titlePlain="Service"
            titleEm="vendors"
            subtitle="Workshops, fuel stations, parts suppliers &amp; insurers"
          />
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
          <Icon name="plus" size={15} /> Add vendor
        </button>
      </div>

      <SectionCard>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Name', 'Type', 'Phone', 'Email', 'Address', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && vendors.map(v => (
              <tr key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{v.name}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{v.vendor_type.replace('_', ' ')}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{v.phone || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{v.email || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{v.address || '—'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button type="button" onClick={() => remove(v.id)} title="Remove vendor" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} data-ui-native-button="">
                    <Icon name="close" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && vendors.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No vendors added yet.</div>
        )}
      </SectionCard>
    </div>
  );
};
