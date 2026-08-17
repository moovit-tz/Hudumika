import React from 'react';
import { Icon } from '../../../components/Icon.js';
import type { IconName } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { FeaturedIcon } from '../../../components/ui/featured-icon.js';
import type { CloudFile, StorageQuota } from '../../../shells/cloud-context.js';
import { categorizeBytes, type Category } from '../lib/categories.js';
import { fmtSize } from '../lib/format.js';

const CATEGORY_META: Record<Category, { label: string; icon: IconName; variant: 'success' | 'brand' | 'info' | 'gray'; bar: string }> = {
  documents: { label: 'Documents', icon: 'fileText', variant: 'success', bar: 'var(--green)' },
  images: { label: 'Images', icon: 'camera', variant: 'brand', bar: 'var(--teal)' },
  media: { label: 'Media', icon: 'monitor', variant: 'info', bar: 'var(--blue)' },
  other: { label: 'Other Files', icon: 'file', variant: 'gray', bar: 'var(--ink3)' },
};

/** Real per-tenant quota (packages.storage_limit_bytes) against real usage —
 *  "X of Y used", not a fabricated ceiling. Unlimited tiers (limit_bytes:
 *  null) show total used with no ceiling framing at all, since there is
 *  genuinely nothing to be "out of". */
function TotalStorageCard({ quota }: { quota: StorageQuota | null }) {
  if (!quota) return null;
  const pct = quota.limit_bytes ? Math.min(100, Math.round((quota.used_bytes / quota.limit_bytes) * 100)) : 0;
  const nearLimit = quota.limit_bytes != null && pct >= 90;
  return (
    <Card style={{ padding: 20, marginBottom: 14, borderRadius: 'var(--r-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: quota.limit_bytes != null ? 14 : 0 }}>
        <FeaturedIcon variant={nearLimit ? 'error' : 'brand'} size="lg"><Icon name="package" size={20} /></FeaturedIcon>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Total Storage</div>
          <div style={{ fontSize: 12.5, color: nearLimit ? 'var(--red)' : 'var(--ink3)', fontWeight: nearLimit ? 700 : 400 }}>
            {quota.limit_bytes == null
              ? `${fmtSize(quota.used_bytes)} used · Unlimited plan`
              : `${fmtSize(quota.used_bytes)} of ${fmtSize(quota.limit_bytes)} used`}
          </div>
        </div>
      </div>
      {quota.limit_bytes != null && (
        <div style={{ height: 8, borderRadius: 'var(--badge-radius)', background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: nearLimit ? 'var(--red)' : 'var(--teal)', borderRadius: 'var(--badge-radius)' }} />
        </div>
      )}
    </Card>
  );
}

export function StorageOverviewCards({ files, quota }: { files: CloudFile[]; quota: StorageQuota | null }) {
  const breakdown = categorizeBytes(files);
  const totalBytes = Object.values(breakdown).reduce((t, c) => t + c.bytes, 0);

  return (
    <div>
      <TotalStorageCard quota={quota} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {(Object.keys(CATEGORY_META) as Category[]).map(cat => {
          const meta = CATEGORY_META[cat];
          const stat = breakdown[cat];
          const pct = totalBytes > 0 ? Math.round((stat.bytes / totalBytes) * 100) : 0;
          return (
            <Card key={cat} style={{ padding: 18, borderRadius: 'var(--r-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <FeaturedIcon variant={meta.variant} size="lg"><Icon name={meta.icon} size={18} /></FeaturedIcon>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{meta.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{stat.count} item{stat.count === 1 ? '' : 's'}</div>
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 'var(--badge-radius)', background: 'var(--bg)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: meta.bar, borderRadius: 'var(--badge-radius)' }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{fmtSize(stat.bytes)} · {pct}% of used storage</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
