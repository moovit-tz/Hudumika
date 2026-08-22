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

/**
 * One card, not five stacked ones. The previous version repeated the exact
 * same {icon, label, count, bar, size%} card shape once for "Total Storage"
 * and again for each of the four categories — five identical boxes for what
 * is really one dataset (a quota and its own breakdown), so the page read as
 * visually monotonous and used five times the vertical space a segmented
 * usage bar (the standard shape for this exact kind of data — a whole used
 * against a capacity, broken into categories) needs.
 */
export function StorageOverviewCards({ files, quota }: { files: CloudFile[]; quota: StorageQuota | null }) {
  const breakdown = categorizeBytes(files);
  const totalBytes = Object.values(breakdown).reduce((t, c) => t + c.bytes, 0);
  const categories = Object.keys(CATEGORY_META) as Category[];

  const quotaPct = quota?.limit_bytes ? Math.min(100, (quota.used_bytes / quota.limit_bytes) * 100) : 0;
  const nearLimit = quota?.limit_bytes != null && quotaPct >= 90;

  return (
    <Card style={{ padding: 20, borderRadius: 'var(--r-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <FeaturedIcon variant={nearLimit ? 'error' : 'brand'} size="lg"><Icon name="package" size={20} /></FeaturedIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Total Storage</div>
          {quota && (
            <div style={{ fontSize: 12.5, color: nearLimit ? 'var(--red)' : 'var(--ink3)', fontWeight: nearLimit ? 700 : 400 }}>
              {quota.limit_bytes == null
                ? `${fmtSize(quota.used_bytes)} used · Unlimited plan`
                : `${fmtSize(quota.used_bytes)} of ${fmtSize(quota.limit_bytes)} used`}
            </div>
          )}
        </div>
      </div>

      {/* Segmented bar: each category's real share of what's actually used,
          not the tenant's quota ceiling — proportions among files that
          exist, same math the legend rows below state as numbers. */}
      <div style={{ display: 'flex', height: 10, borderRadius: 'var(--badge-radius)', overflow: 'hidden', background: 'var(--bg)', marginBottom: 4 }}>
        {totalBytes > 0 ? categories.map(cat => {
          const pct = (breakdown[cat].bytes / totalBytes) * 100;
          return pct > 0 ? <div key={cat} style={{ width: `${pct}%`, background: CATEGORY_META[cat].bar }} title={`${CATEGORY_META[cat].label}: ${fmtSize(breakdown[cat].bytes)}`} /> : null;
        }) : <div style={{ width: '100%' }} />}
      </div>
      {quota?.limit_bytes != null && (
        <div style={{ height: 4, borderRadius: 'var(--badge-radius)', background: 'var(--bg)', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ width: `${quotaPct}%`, height: '100%', background: nearLimit ? 'var(--red)' : 'var(--teal)', borderRadius: 'var(--badge-radius)' }} />
        </div>
      )}
      {quota?.limit_bytes == null && <div style={{ marginBottom: 16 }} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {categories.map(cat => {
          const meta = CATEGORY_META[cat];
          const stat = breakdown[cat];
          const pct = totalBytes > 0 ? Math.round((stat.bytes / totalBytes) * 100) : 0;
          return (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.bar, flexShrink: 0 }} />
              <Icon name={meta.icon} size={13} color="var(--ink3)" />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{meta.label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{stat.count} item{stat.count === 1 ? '' : 's'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)', minWidth: 40, textAlign: 'right' }}>{fmtSize(stat.bytes)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
