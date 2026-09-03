import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon, type IconName } from './Icon.js';
import { SectionCard } from './SectionCard.js';

interface RelatedItem {
  id: string;
  label: string;
  sublabel?: string | null;
  status?: string | null;
  href: string;
}

interface RelatedGroup {
  appLabel: string;
  appIcon: IconName;
  appColor: string;
  appHref: string;
  items: RelatedItem[];
}

/**
 * The generalized "what's linked to this record across other apps" panel —
 * GET /v1/related/:entityType/:entityId (related-records.ts's registry).
 * Same card-grid look ShipmentDetail.tsx's LinkedAppsPanel already
 * established, now driven by any entity type the backend registry knows
 * about instead of being hardcoded to shipments. A relation with no rows
 * for this record simply isn't in the response — nothing here is ever
 * fabricated to fill an empty card.
 */
export function RelatedRecordsPanel({ entityType, entityId, title = 'Related', isMobile = false, emptyText = 'Nothing linked yet.' }: {
  entityType: string;
  entityId: string;
  title?: string;
  isMobile?: boolean;
  emptyText?: string;
}) {
  const [data, setData] = useState<Record<string, RelatedGroup> | null>(null);

  useEffect(() => {
    if (!entityId) return;
    setData(null);
    apiFetch(`/v1/related/${entityType}/${entityId}`)
      .then(setData)
      .catch(() => setData({}));
  }, [entityType, entityId]);

  if (data === null) return null; // still loading — no flash of an empty state

  const groups = Object.values(data);

  if (groups.length === 0) {
    return (
      <SectionCard title={title}>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{emptyText}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={title}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 10 }}>
        {groups.map(group => (
          <Link key={group.appLabel} to={group.appHref} style={{ display: 'block', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Icon name={group.appIcon} size={13} color={group.appColor} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: group.appColor }}>{group.appLabel}</span>
            </div>
            {group.items.slice(0, 3).map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0' }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                <span style={{ color: 'var(--ink3)', flexShrink: 0 }}>{[item.sublabel, item.status].filter(Boolean).join(' · ') || '—'}</span>
              </div>
            ))}
            {group.items.length > 3 && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>+{group.items.length - 3} more</div>
            )}
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
