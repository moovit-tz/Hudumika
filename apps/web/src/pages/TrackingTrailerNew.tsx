import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

const TRAILER_TYPES = ['FLATBED', 'CONTAINER_CHASSIS', 'TANKER', 'REEFER', 'LOWBED', 'CURTAIN_SIDE', 'OTHER'];
const OWNERSHIP_TYPES = ['OWNED', 'LEASED', 'RENTED', 'SUBCONTRACTED'];

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };
const sectionStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 6, marginBottom: -2 };

interface Transporter { id: string; name: string }

export const TrackingTrailerNew: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [registration, setRegistration] = useState('');
  const [vin, setVin] = useState('');
  const [trailerType, setTrailerType] = useState('FLATBED');
  const [capacityKg, setCapacityKg] = useState('');
  const [axles, setAxles] = useState('');
  const [ownership, setOwnership] = useState('OWNED');
  const [transporterId, setTransporterId] = useState('');
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/transporters').then(setTransporters).catch(() => setTransporters([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiFetch('/v1/tracking/trailers', {
        method: 'POST',
        body: JSON.stringify({
          name, registration_number: registration || undefined, vin: vin || undefined,
          trailer_type: trailerType, capacity_kg: capacityKg ? Number(capacityKg) : undefined,
          axles: axles ? Number(axles) : undefined, ownership,
          transporter_id: ownership === 'SUBCONTRACTED' && transporterId ? transporterId : undefined,
          notes: notes || undefined,
        }),
      });
      navigate(`/tracking/trailers/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to register trailer');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader
        crumbs={['HuduFreight', 'Register Trailer']}
        title="Register a trailer"
        subtitle="Add a trailer and its operating details to your fleet."
        variant="create"
        backTo="/tracking/trailers"
      />

      <SectionCard>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={sectionStyle}>Basics</div>
          <div><label style={labelStyle}>Name</label><input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Trailer 04" style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Registration number</label><input value={registration} onChange={e => setRegistration(e.target.value)} placeholder="e.g. T-778-TRL" style={inputStyle} /></div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Trailer type</label>
              <Select value={trailerType} onValueChange={setTrailerType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRAILER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>VIN / chassis number</label><input value={vin} onChange={e => setVin(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Axles</label><input type="number" min="1" max="12" value={axles} onChange={e => setAxles(e.target.value)} style={inputStyle} /></div>
          </div>
          <div><label style={labelStyle}>Capacity (kg)</label><input type="number" min="0" value={capacityKg} onChange={e => setCapacityKg(e.target.value)} placeholder="e.g. 30000" style={inputStyle} /></div>

          <div style={sectionStyle}>Ownership</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Ownership</label>
              <Select value={ownership} onValueChange={setOwnership}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIP_TYPES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {ownership === 'SUBCONTRACTED' && (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Transporter</label>
                <Select value={transporterId || '__none__'} onValueChange={v => setTransporterId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select transporter" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Not set —</SelectItem>
                    {transporters.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div><label style={labelStyle}>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} /></div>

          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <button type="submit" disabled={saving || !name}
            style={{ marginTop: 8, padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 700, cursor: 'pointer', fontSize: 13.5, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box' as const, lineHeight: 1.25 }}>
            {saving ? 'Saving…' : 'Register trailer'}
          </button>
        </form>
      </SectionCard>
    </div>
  );
};

export default TrackingTrailerNew;
