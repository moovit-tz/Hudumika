import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface Trailer {
  id: string; name: string; registration_number: string | null; vin: string | null;
  trailer_type: string; capacity_kg: number | null; axles: number | null;
  ownership: string; transporter_id: string | null; transporter_name: string | null;
  status: string; current_trip: { vehicle_id: string; destination: string | null } | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  ACTIVE: 'success', MAINTENANCE: 'warning', OUT_OF_SERVICE: 'error', DECOMMISSIONED: 'gray',
};

export const TrackingTrailers: React.FC = () => {
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    apiFetch('/v1/tracking/trailers')
      .then(res => setTrailers(Array.isArray(res) ? res : []))
      .catch(() => { setTrailers([]); setLoadError('Could not load trailers. Try refreshing.'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const stats = useMemo(() => ({
    all: trailers.length,
    active: trailers.filter(t => t.status === 'ACTIVE').length,
    inUse: trailers.filter(t => t.current_trip).length,
    maintenance: trailers.filter(t => t.status === 'MAINTENANCE' || t.status === 'OUT_OF_SERVICE').length,
  }), [trailers]);

  const filtered = trailers.filter(t => {
    if (filter === 'In use' && !t.current_trip) return false;
    if (filter === 'Maintenance' && t.status !== 'MAINTENANCE' && t.status !== 'OUT_OF_SERVICE') return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !(t.registration_number || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader
        crumbs={['HuduFreight', 'Trailers']}
        titlePlain="Fleet"
        titleEm="trailers"
        subtitle="Every trailer, its documents, and what it's currently coupled to."
        actions={
          <Link to="/tracking/trailers/new" className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 13, textDecoration: 'none', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            <Icon name="plus" size={15} /> Register trailer
          </Link>
        }
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Tabs value={filter} onValueChange={setFilter} variant="segmented">
          <TabsList>
            <TabsTrigger value="All">All ({stats.all})</TabsTrigger>
            <TabsTrigger value="In use">In use ({stats.inUse})</TabsTrigger>
            <TabsTrigger value="Maintenance">Maintenance ({stats.maintenance})</TabsTrigger>
          </TabsList>
        </Tabs>
        <input
          placeholder="Search by name or registration…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--white)', color: 'var(--ink)', minWidth: 240 }}
        />
      </div>

      {loadError && (
        <div style={{ padding: '10px 16px', marginBottom: 16, background: 'var(--red-l)', color: 'var(--red)', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600 }}>
          {loadError}
        </div>
      )}

      <SectionCard>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading trailers…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
            {trailers.length === 0 ? (
              <>No trailers registered yet. <Link to="/tracking/trailers/new" style={{ color: 'var(--teal)', fontWeight: 600 }}>Register your first trailer</Link>.</>
            ) : 'No trailers match the current filters.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 12px' }}>Trailer</th>
                  <th style={{ padding: '10px 12px' }}>Type</th>
                  <th style={{ padding: '10px 12px' }}>Capacity</th>
                  <th style={{ padding: '10px 12px' }}>Ownership</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Current trip</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px' }}>
                      <Link to={`/tracking/trailers/${t.id}`} style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'none' }}>{t.name}</Link>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{t.registration_number || 'No registration on file'}</div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--ink2)' }}>{t.trailer_type.replace(/_/g, ' ')}{t.axles ? ` · ${t.axles} axles` : ''}</td>
                    <td style={{ padding: '12px', color: 'var(--ink2)' }}>{t.capacity_kg != null ? `${t.capacity_kg.toLocaleString()} kg` : '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--ink2)' }}>
                      {t.ownership}
                      {t.transporter_name && <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{t.transporter_name}</div>}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Badge variant={STATUS_VARIANT[t.status] ?? 'gray'}>{t.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--ink2)' }}>
                      {t.current_trip ? `→ ${t.current_trip.destination || 'En route'}` : <span style={{ color: 'var(--ink3)' }}>Not coupled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default TrackingTrailers;
