import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

interface Vehicle {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  capacity: number | null;
  status: string;
  created_at: string;
}

export function TumaFleet() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/tuma/fleet')
      .then(r => setVehicles(r.vehicles))
      .catch(e => showAlert(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Tuma', 'Fleet']}
        titlePlain="Vehicle"
        titleEm="fleet"
        subtitle="Vehicles, brands, models and seat layouts assigned to routes."
      />
      <SectionCard title="Vehicles" collapsible={false}>
        {loading ? <SectionLoading /> : vehicles.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--ink2)', textAlign: 'center' }}>No vehicles registered yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Registration</th><th>Make</th><th>Model</th><th>Capacity</th><th>Status</th>
              </tr></thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 500 }}>{v.registration_number}</td>
                    <td>{v.make || '—'}</td>
                    <td>{v.model || '—'}</td>
                    <td>{v.capacity ?? '—'}</td>
                    <td><Badge variant={v.status === 'active' ? 'success' : 'gray'}>{v.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
