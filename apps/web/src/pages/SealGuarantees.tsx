import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Guarantee {
  id: string; instrument_type: string; issuer: string | null; reference: string;
  face_value: number; currency: string; effective_from: string; expires_on: string;
  status: string; currently_at_risk: number; headroom: number;
}

const INSTRUMENT_TYPES = ['cash', 'bank_guarantee', 'insurance_bond', 'corporate_undertaking'];

export function SealGuarantees() {
  const isMobile = useIsMobile();
  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [reference, setReference] = useState('');
  const [instrumentType, setInstrumentType] = useState('bank_guarantee');
  const [issuer, setIssuer] = useState('');
  const [faceValue, setFaceValue] = useState('');
  const [currency, setCurrency] = useState('TZS');
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>(new Date());
  const [expiresOn, setExpiresOn] = useState<Date | undefined>(undefined);

  function reload() {
    setLoading(true);
    apiFetch('/v1/seal/guarantees').then(setGuarantees).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!reference.trim() || !faceValue || !expiresOn) return;
    setSaving(true);
    try {
      await apiFetch('/v1/seal/guarantees', {
        method: 'POST',
        body: JSON.stringify({
          reference: reference.trim(), instrumentType, issuer: issuer.trim() || null,
          faceValue: Number(faceValue), currency,
          effectiveFrom: effectiveFrom ? toDateOnlyString(effectiveFrom) : null,
          expiresOn: toDateOnlyString(expiresOn),
        }),
      });
      setReference(''); setIssuer(''); setFaceValue(''); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create guarantee.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Guarantees & Bond Headroom']}
        titlePlain="Guarantees & Bond"
        titleEm="headroom"
        subtitle="The financial instruments securing suspended duty — attach one to a compartment and every receipt into bond checks it in real time."
      />
      <div className="seal-page-hdr">
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} />
          <span>New Guarantee</span>
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Reference</label>
              <input type="text" className="input-field" value={reference} onChange={e => setReference(e.target.value)} placeholder="BG-2026-0041" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Instrument Type</label>
              <Select value={instrumentType} onValueChange={setInstrumentType}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{INSTRUMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Issuer</label>
              <input type="text" className="input-field" value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="CRDB Bank PLC" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Face Value</label>
              <input type="number" min="0" step="any" className="input-field" value={faceValue} onChange={e => setFaceValue(e.target.value)} placeholder="0.00" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Currency</label>
              <input type="text" className="input-field" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Effective From</label>
              <DatePicker date={effectiveFrom} onChange={setEffectiveFrom} />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Expires On</label>
              <DatePicker date={expiresOn} onChange={setExpiresOn} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <div className="seal-card"><SectionLoading /></div>
      ) : guarantees.length === 0 ? (
        <div className="seal-card"><div className="seal-empty">No guarantees yet — compartments without one skip the bond headroom check entirely.</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {guarantees.map(g => {
            const pctUsed = g.face_value > 0 ? Math.min(100, (g.currently_at_risk / g.face_value) * 100) : 0;
            const low = g.headroom < g.face_value * 0.15;
            const daysToExpiry = Math.ceil((new Date(g.expires_on).getTime() - Date.now()) / 86400000);
            return (
              <div className="seal-card" key={g.id}>
                <div className="seal-card-hdr">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FeaturedIcon variant={low ? 'warning' : 'brand'} size="md" shape="square"><Icon name="shield" size={16} /></FeaturedIcon>
                    <div>
                      <div className="seal-card-title">{g.reference}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{g.instrument_type.replace(/_/g, ' ')}{g.issuer ? ` · ${g.issuer}` : ''}</div>
                    </div>
                  </div>
                  <Badge variant={daysToExpiry <= 30 ? 'warning' : 'success'}>{g.status}</Badge>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--ink3)' }}>At risk</span>
                    <span className="seal-mono" style={{ fontWeight: 700 }}>{g.currently_at_risk.toLocaleString()} / {g.face_value.toLocaleString()} {g.currency}</span>
                  </div>
                  <div className="seal-runway">
                    <div className="seal-runway-fill" style={{ width: `${pctUsed}%`, background: low ? 'var(--red)' : 'var(--seal)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: low ? 'var(--red)' : 'var(--ink3)', fontWeight: low ? 700 : 400 }}>
                      Headroom: {g.headroom.toLocaleString()} {g.currency}
                    </span>
                    <span style={{ color: 'var(--ink3)' }}>Expires in {daysToExpiry}d</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
