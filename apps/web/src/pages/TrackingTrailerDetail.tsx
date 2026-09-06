import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { BackButton } from '../components/ui/BackButton.js';
import { showAlert } from '../lib/alert.js';

interface Trailer {
  id: string; name: string; registration_number: string | null; vin: string | null;
  trailer_type: string; capacity_kg: number | null; axles: number | null;
  ownership: string; status: string; notes: string | null; transporter_name: string | null;
}
interface TrailerDoc {
  id: string; doc_type: string; doc_number: string | null; expiry_date: string | null; issued_date: string | null;
}
interface Trip {
  id: string; origin: string | null; destination: string | null; status: string; created_at: string;
  distance_km: number | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  ACTIVE: 'success', MAINTENANCE: 'warning', OUT_OF_SERVICE: 'error', DECOMMISSIONED: 'gray',
};
const DOC_TYPES = ['REGISTRATION', 'INSURANCE', 'INSPECTION', 'PERMIT', 'OTHER'];

export const TrackingTrailerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [documents, setDocuments] = useState<TrailerDoc[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingDoc, setAddingDoc] = useState(false);
  const [docType, setDocType] = useState('REGISTRATION');
  const [docNumber, setDocNumber] = useState('');
  const [docExpiry, setDocExpiry] = useState('');

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/tracking/trailers/${id}`)
      .then(data => { setTrailer(data.trailer); setDocuments(data.documents); setTrips(data.trips); })
      .catch(err => showAlert(err.message || 'Could not load this trailer.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  async function addDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      await apiFetch(`/v1/tracking/trailers/${id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ doc_type: docType, doc_number: docNumber || undefined, expiry_date: docExpiry || undefined }),
      });
      setAddingDoc(false); setDocNumber(''); setDocExpiry('');
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Could not add this document.');
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--ink3)' }}>Loading trailer…</div>;
  if (!trailer) return <div style={{ padding: 40, color: 'var(--ink3)' }}>Trailer not found.</div>;

  const now = Date.now();

  return (
    <div style={{ padding: '0 0 24px' }}>
      <BackButton to="/tracking/trailers" label="Trailers" />
      <PageHeader
        crumbs={['HuduFreight', 'Trailer']}
        titlePlain="Trailer"
        titleEm={trailer.name}
        subtitle={trailer.registration_number || 'No registration on file'}
        actions={<Badge variant={STATUS_VARIANT[trailer.status] ?? 'gray'}>{trailer.status.replace(/_/g, ' ')}</Badge>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <SectionCard title="Trailer information">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <div><div style={{ color: 'var(--ink3)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Type</div><div style={{ marginTop: 2 }}>{trailer.trailer_type.replace(/_/g, ' ')}</div></div>
            <div><div style={{ color: 'var(--ink3)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Axles</div><div style={{ marginTop: 2 }}>{trailer.axles ?? '—'}</div></div>
            <div><div style={{ color: 'var(--ink3)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Capacity</div><div style={{ marginTop: 2 }}>{trailer.capacity_kg != null ? `${trailer.capacity_kg.toLocaleString()} kg` : '—'}</div></div>
            <div><div style={{ color: 'var(--ink3)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>VIN</div><div style={{ marginTop: 2 }}>{trailer.vin || '—'}</div></div>
            <div><div style={{ color: 'var(--ink3)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Ownership</div><div style={{ marginTop: 2 }}>{trailer.ownership}</div></div>
            <div><div style={{ color: 'var(--ink3)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Transporter</div><div style={{ marginTop: 2 }}>{trailer.transporter_name || '—'}</div></div>
          </div>
          {trailer.notes && <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--ink2)' }}>{trailer.notes}</div>}
        </SectionCard>

        <SectionCard
          title="Documents"
          action={
            <button type="button" onClick={() => setAddingDoc(a => !a)}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Icon name={addingDoc ? 'x' : 'plus'} size={13} /> {addingDoc ? 'Cancel' : 'Add document'}
            </button>
          }
        >
          {addingDoc && (
            <form onSubmit={addDocument} style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <select value={docType} onChange={e => setDocType(e.target.value)} style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12.5 }}>
                {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input placeholder="Document number" value={docNumber} onChange={e => setDocNumber(e.target.value)} style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12.5, flex: 1, minWidth: 120 }} />
              <input type="date" value={docExpiry} onChange={e => setDocExpiry(e.target.value)} style={{ padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12.5 }} />
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' }}>Save</button>
            </form>
          )}
          {documents.length === 0 ? (
            <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No documents on file yet — this trailer cannot be dispatched with a document type that later gets an expiry date in the past, but with none recorded, nothing blocks it today.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {documents.map(d => {
                const expired = d.expiry_date && new Date(d.expiry_date).getTime() < now;
                return (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{d.doc_type.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{d.doc_number || 'No number on file'}</div>
                    </div>
                    <Badge variant={expired ? 'error' : 'success'}>
                      {d.expiry_date ? `${expired ? 'Expired' : 'Valid until'} ${new Date(d.expiry_date).toLocaleDateString()}` : 'No expiry set'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Trip history">
        {trips.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13 }}>This trailer hasn't been coupled to a trip yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trips.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13 }}>
                <div>{t.origin || 'Unknown'} → {t.destination || 'Unknown'}</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--ink3)', fontSize: 12 }}>
                  {t.distance_km != null && <span>{t.distance_km} km</span>}
                  <Badge variant={t.status === 'COMPLETED' ? 'success' : t.status === 'IN_PROGRESS' ? 'info' : 'gray'}>{t.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default TrackingTrailerDetail;
