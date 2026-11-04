import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

interface Agent {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  office_id: string | null;
  commission_rate: number | null;
  status: string;
  created_at: string;
}

export function TumaAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/tuma/agents')
      .then(r => setAgents(r.agents))
      .catch(e => showAlert(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Tuma', 'People']}
        titlePlain="Field"
        titleEm="agents"
        subtitle="Agents, super-agents and trip-agents who handle parcels in the field."
      />
      <SectionCard title="Agents" collapsible={false}>
        {loading ? <SectionLoading /> : agents.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--ink2)', textAlign: 'center' }}>No agents registered yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Name</th><th>Phone</th><th>Email</th><th>Commission</th><th>Status</th>
              </tr></thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td>{a.phone || '—'}</td>
                    <td>{a.email || '—'}</td>
                    <td>{a.commission_rate != null ? `${a.commission_rate}%` : '—'}</td>
                    <td><Badge variant={a.status === 'active' ? 'success' : 'gray'}>{a.status}</Badge></td>
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
