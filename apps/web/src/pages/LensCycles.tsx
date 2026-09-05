import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import type { LensCycle } from '@hudumika/types';

export default function LensCycles() {
  const [cycles, setCycles] = useState<LensCycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/lens/cycles')
      .then(res => setCycles(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const cardStyle = {
    background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12,
    padding: '20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  };

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Lens', 'Cycles']}
        titlePlain="Planning"
        titleEm="cycles"
        subtitle="Time-boxed iterations for execution."
        actions={<button className="btn btn-primary" onClick={() => alert('New cycle modal')}>New Cycle</button>}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', paddingTop: 20 }}>
        {loading ? (
          <SectionLoading />
        ) : cycles.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', background: 'var(--white)', borderRadius: 12, border: '1px dashed var(--border)' }}>
            <Icon name="calendar" size={32} color="var(--ink3)" />
            <h3 style={{ marginTop: 16, color: 'var(--ink)' }}>No Cycles planned</h3>
            <p style={{ color: 'var(--ink2)', fontSize: 14 }}>Create a cycle to start assigning work.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {cycles.map(cycle => (
              <div key={cycle.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px 0' }}>
                      {cycle.name}
                    </h3>
                    <p style={{ color: 'var(--ink2)', fontSize: 14, margin: 0 }}>
                      {cycle.start_date && cycle.end_date 
                        ? `${cycle.start_date} to ${cycle.end_date}` 
                        : 'Dates pending'}
                    </p>
                  </div>
                  <div>
                    <span style={{ 
                      fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 12,
                      background: cycle.status === 'ACTIVE' ? 'var(--green-l)' : cycle.status === 'CLOSED' ? 'var(--bg)' : 'var(--teal-l)',
                      color: cycle.status === 'ACTIVE' ? 'var(--green)' : cycle.status === 'CLOSED' ? 'var(--ink2)' : 'var(--teal)',
                    }}>
                      {cycle.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
