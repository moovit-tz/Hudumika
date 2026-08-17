import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { FeaturedIcon } from '../../../components/ui/featured-icon.js';
import { Badge } from '../../../components/ui/badge.js';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../../../components/ui/context-menu.js';
import { fileTypeStyle, previewKind } from '../lib/fileTypeStyle.js';
import { fmtExpiresIn } from '../lib/format.js';
import { usePreviewBlob } from '../lib/usePreviewBlob.js';
import { DND_TYPE } from '../lib/dnd.js';
import { FileMenuItems } from './FileMenu.js';
import type { CardCommonProps } from './FolderCard.js';

export function FileCard({ item, selected, onClick, onDoubleClick, onContextMenuOpen, isTrashed, menuHandlers }: CardCommonProps) {
  const cfg = fileTypeStyle(item.type);
  // Real thumbnails are scoped to images only — the fetched blob IS the
  // thumbnail (CSS-scaled), no server-side processing needed. PDF/Office
  // thumbnails would need sharp + a system PDF-to-image dependency, a
  // materially bigger lift left as a follow-up.
  const isImage = previewKind(item.type) === 'image';
  const { url: thumbUrl } = usePreviewBlob(isImage ? item.id : null);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          draggable
          onDragStart={e => { e.dataTransfer.setData(DND_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenuOpen}
          className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
          style={{
            padding: 0,
            border: selected ? '1px solid var(--teal)' : 'var(--card-border)',
            boxShadow: selected ? '0 0 0 2px var(--teal-l)' : 'var(--card-shadow)',
            position: 'relative',
          }}
        >
          {item.starred && <Icon name="star" size={12} color="var(--gold)" style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }} />}

          <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', overflow: 'hidden' }}>
            {isImage && thumbUrl
              ? <img src={thumbUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <FeaturedIcon variant={cfg.variant} shape="square" size="xl"><Icon name={cfg.icon} size={26} /></FeaturedIcon>
            }
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
              {isTrashed && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtExpiresIn(item.trashed_at)}</div>}
            </div>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
          </div>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-47.5">
        <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={ContextMenuItem} SeparatorComp={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
