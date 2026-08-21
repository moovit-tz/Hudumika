import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { fileTypeStyle } from '../lib/fileTypeStyle.js';
import { fmtRelative } from '../lib/format.js';
import { DocThumbnail } from '../components/DocThumbnail.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

export function SuggestedFilesStrip({ items, onOpen }: { items: CloudFile[]; onOpen: (item: CloudFile) => void }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
      {items.map(item => {
        const isPdf = item.type === 'pdf' || item.name.endsWith('.pdf');
        const isSheet = ['xlsx', 'xls', 'csv'].includes(item.type) || item.name.endsWith('.xlsx');
        const isDoc = ['doc', 'docx'].includes(item.type) || item.name.endsWith('.docx');
        const badgeColor = isPdf ? '#ef4444' : isSheet ? '#10b981' : isDoc ? '#2563eb' : 'var(--teal)';
        const badgeLabel = isPdf ? 'PDF' : isSheet ? 'SHEET' : isDoc ? 'DOC' : item.type.toUpperCase();

        return (
          <Card
            key={item.id}
            onClick={() => onOpen(item)}
            className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              padding: 0,
            }}
          >
            {/* Card Header Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ background: badgeColor, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                  {badgeLabel}
                </span>
                <span title={item.name} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </span>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}>
                <Icon name="moreVertical" size={15} />
              </button>
            </div>

            {/* Document Thumbnail Body Frame */}
            <div style={{ height: 120, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', overflow: 'hidden', background: '#f8fafc' }}>
              <DocThumbnail type={item.type} name={item.name} />
            </div>

            {/* Card Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 11.5, color: 'var(--ink3)' }}>
              <PersonAvatar name={item.owner_name} size={18} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                You opened · {fmtRelative(item.updated_at)}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

