import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';

interface Partner {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export function CrmChainPartners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // New Partner Form
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  function loadPartners() {
    setLoading(true);
    apiFetch('/v1/customers/partners')
      .then(res => setPartners(res.data || []))
      .catch(() => setPartners([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPartners(); }, []);

  async function handleCreatePartner(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/customers/partners', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), contactName: contactName.trim() || null, email: email.trim() || null, phone: phone.trim() || null }),
      });
      setName(''); setContactName(''); setEmail(''); setPhone('');
      setShowAddForm(false);
      loadPartners();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create partner');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <PageHeader
            crumbs={['CRM', 'Chain Partners']}
            titlePlain="Logistics & Warehousing Chain"
            titleEm="partners"
            subtitle="Registered ICDs, CFS operators, bonded warehouse providers, and logistics partners."
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: 'var(--ds-btn-py) 18px', fontWeight: 700, borderRadius: 'var(--r)', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
          onClick={() => setShowAddForm(v => !v)}
        >
          <Icon name="plus" size={14} />
          <span>Add Chain Partner</span>
        </button>
      </div>

      {/* New Partner Collapsible Form */}
      {showAddForm && (
        <form onSubmit={handleCreatePartner} className="crm-card" style={{ marginBottom: 20, padding: 20, borderRadius: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>Register Chain Partner</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="seal-field-label">Partner / Company Name</label>
              <input type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Dar es Salaam Container Freight Station Ltd" required />
            </div>
            <div>
              <label className="seal-field-label">Contact Person</label>
              <input type="text" className="input-field" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="John Doe" />
            </div>
            <div>
              <label className="seal-field-label">Email</label>
              <input type="email" className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="operations@cfs-dsm.co.tz" />
            </div>
            <div>
              <label className="seal-field-label">Phone</label>
              <input type="text" className="input-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255 700 000 000" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Register Partner'}</button>
          </div>
        </form>
      )}

      {/* Partners List Table */}
      <div className="crm-card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14 }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)' }}>Loading chain partners…</div>
        ) : partners.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)' }}>No chain partners registered yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 18px' }}>Partner Name</th>
                <th style={{ padding: '12px 18px' }}>Contact Person</th>
                <th style={{ padding: '12px 18px' }}>Email & Phone</th>
                <th style={{ padding: '12px 18px' }}>Registered</th>
              </tr>
            </thead>
            <tbody>
              {partners.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--ink)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="warehouse" size={14} /></FeaturedIcon>
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--ink)' }}>{p.contact_name || '—'}</td>
                  <td style={{ padding: '14px 18px', color: 'var(--ink3)' }}>
                    {p.email && <div>{p.email}</div>}
                    {p.phone && <div>{p.phone}</div>}
                    {!p.email && !p.phone && '—'}
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--ink3)' }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
