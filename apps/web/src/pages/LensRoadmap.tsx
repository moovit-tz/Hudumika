import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import type { LensItem } from '@hudumika/types';

export default function LensRoadmap() {
  const [items, setItems] = useState<LensItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/lens/items?kind=EPIC')
      .then(res => setItems(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const cardStyle = {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
    padding: '20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  };

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Lens', 'Roadmap']}
        titlePlain="Product"
        titleEm="roadmap"
        subtitle="High-level Epics and their overall progression."
      />

      <div style={{ maxWidth: 900, margin: '0 auto', paddingTop: 20 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed var(--border)' }}>
            <Icon name="layers" size={32} color="var(--ink3)" />
            <h3 style={{ marginTop: 16, color: 'var(--ink)' }}>No Epics found</h3>
            <p style={{ color: 'var(--ink2)', fontSize: 14 }}>Create an item with kind=EPIC to see it here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.map(epic => (
              <div key={epic.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-l)', padding: '2px 8px', borderRadius: 12 }}>
                        {epic.ref}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Epic
                      </span>
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px 0' }}>
                      {epic.title}
                    </h3>
                    <p style={{ color: 'var(--ink2)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                      {epic.body || 'No description provided.'}
                    </p>
                  </div>
                  <div>
                    <span style={{ 
                      fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 12,
                      background: epic.status === 'DONE' ? 'var(--green-l)' : 'var(--bg)',
                      color: epic.status === 'DONE' ? 'var(--green)' : 'var(--ink2)',
                    }}>
                      {epic.status}
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
