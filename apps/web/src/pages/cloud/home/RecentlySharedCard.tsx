import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { FeaturedIcon } from '../../../components/ui/featured-icon.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { fileTypeStyle } from '../lib/fileTypeStyle.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

/**
 * Mirrors the existing "Shared with Me" view's own definition — anyone this
 * item has been shared with, not specifically the logged-in viewer, since
 * SharedPerson is a free-text/principal list with no per-account recipient
 * match. Not a new simplification introduced here; it's the same one that
 * view already runs on, made honest by not implying a truer per-user filter.
 */
export function RecentlySharedCard({ items, onOpen }: { items: CloudFile[]; onOpen: (item: CloudFile) => void }) {
  const shared = [...items].filter(i => (i.shared ?? []).length > 0).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
  if (shared.length === 0) return null;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Recently Shared</div>
      <div>
        {shared.map((item, i) => {
          const cfg = item.type === 'folder' ? { icon: 'folder' as const, variant: 'warning' as const } : fileTypeStyle(item.type);
          return (
            <button
              key={item.id}
              onClick={() => onOpen(item)}
              className="hover:bg-(--bg)"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}
            >
              <FeaturedIcon variant={cfg.variant} size="sm"><Icon name={cfg.icon} size={15} /></FeaturedIcon>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {(item.shared ?? []).slice(0, 3).map((p, j) => <span key={j} style={{ marginLeft: j > 0 ? -6 : 0 }}><PersonAvatar name={p.name} size={20} /></span>)}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
