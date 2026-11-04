import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

interface Office {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export function TumaOffices() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/tuma/offices')
      .then(r => setOffices(r.offices))
      .catch(e => showAlert(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Tuma', 'Network']}
        titlePlain="Booking"
        titleEm="offices"
        subtitle="Physical pick-up and drop-off points across the route network."
      />
      <SectionCard title="Offices" collapsible={false}>
        {loading ? <SectionLoading /> : offices.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--ink2)', textAlign: 'center' }}>No offices registered yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Name</th><th>Code</th><th>Address</th><th>Phone</th><th>Status</th>
              </tr></thead>
              <tbody>
                {offices.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500 }}>{o.name}</td>
                    <td>{o.code || '—'}</td>
                    <td>{o.address || '—'}</td>
                    <td>{o.phone || '—'}</td>
                    <td><Badge variant={o.is_active ? 'success' : 'gray'}>{o.is_active ? 'Active' : 'Inactive'}</Badge></td>
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
