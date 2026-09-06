import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { showAlert } from '../lib/alert.js';

interface Transporter {
  id: string; name: string; contact_name: string | null; phone: string | null; email: string | null;
  contract_ref: string | null; status: string;
}

const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12.5, background: 'var(--white)', color: 'var(--ink)' };

/**
 * A subcontracted transporter is now a first-class profile, distinct from
 * vehicle_vendors (workshop/maintenance vendors) — a vehicle or trailer
 * whose ownership is SUBCONTRACTED can point at one of these, which is what
 * actually makes it distinguishable from an owned one, not just a label.
 */
export const TrackingTransporters: React.FC = () => {
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/transporters')
      .then(res => setTransporters(Array.isArray(res) ? res : []))
      .catch(() => setTransporters([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/v1/tracking/transporters', {
        method: 'POST',
        body: JSON.stringify({
          name, contact_name: contactName || undefined, phone: phone || undefined,
          email: email || undefined, contract_ref: contractRef || undefined,
        }),
      });
      setName(''); setContactName(''); setPhone(''); setEmail(''); setContractRef(''); setAdding(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Could not add this transporter.');
    } finally { setSaving(false); }
  }

  async function toggleStatus(t: Transporter) {
    try {
      await apiFetch(`/v1/tracking/transporters/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this transporter.');
    }
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader
        crumbs={['HuduFreight', 'Transporters']}
        titlePlain="Subcontracted"
        titleEm="transporters"
        subtitle="Third-party haulage providers whose vehicles and trailers run in this fleet."
        actions={
          <button type="button" onClick={() => setAdding(a => !a)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)' }}>
            <Icon name={adding ? 'x' : 'plus'} size={15} /> {adding ? 'Cancel' : 'Add transporter'}
          </button>
        }
      />

      {adding && (
        <SectionCard>
          <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Company name</label><input required value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, width: 200 }} /></div>
            <div><label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Contact person</label><input value={contactName} onChange={e => setContactName(e.target.value)} style={{ ...inputStyle, width: 160 }} /></div>
            <div><label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={{ ...inputStyle, width: 140 }} /></div>
            <div><label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, width: 180 }} /></div>
            <div><label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Contract ref</label><input value={contractRef} onChange={e => setContractRef(e.target.value)} style={{ ...inputStyle, width: 140 }} /></div>
            <button type="submit" disabled={saving || !name}
              style={{ padding: '9px 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </SectionCard>
      )}

      <div style={{ marginTop: adding ? 16 : 0 }}>
        <SectionCard>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading transporters…</div>
          ) : transporters.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No subcontracted transporters registered yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {transporters.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                      {[t.contact_name, t.phone, t.email].filter(Boolean).join(' · ') || 'No contact details on file'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {t.contract_ref && <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Contract: {t.contract_ref}</span>}
                    <button type="button" onClick={() => toggleStatus(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <Badge variant={t.status === 'ACTIVE' ? 'success' : 'gray'}>{t.status}</Badge>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default TrackingTransporters;
