import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { FeaturedIcon } from '../../../components/ui/featured-icon.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { fileTypeStyle } from '../lib/fileTypeStyle.js';
import { fmtRelative } from '../lib/format.js';

export function SuggestedFilesStrip({ items, onOpen }: { items: CloudFile[]; onOpen: (item: CloudFile) => void }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
      {items.map(item => {
        const cfg = item.type === 'folder' ? { icon: 'folder' as const, variant: 'warning' as const, label: 'Folder' } : fileTypeStyle(item.type);
        const folderColor = item.color ?? '#f59e0b';
        return (
          <Card
            key={item.id}
            onClick={() => onOpen(item)}
            className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
            style={{ flex: '0 0 auto', width: 168, padding: 0 }}
          >
            <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
              {item.type === 'folder'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--r)', background: `${folderColor}22` }}><Icon name="folder" size={18} color={folderColor} /></span>
                : <FeaturedIcon variant={cfg.variant} size="lg"><Icon name={cfg.icon} size={20} /></FeaturedIcon>
              }
            </div>
            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{fmtRelative(item.updated_at)}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
