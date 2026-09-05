import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../../../components/ui/context-menu.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/dropdown-menu.js';
import { fileTypeStyle, previewKind } from '../lib/fileTypeStyle.js';
import { fmtRelative } from '../lib/format.js';
import { usePreviewBlob } from '../lib/usePreviewBlob.js';
import { DND_TYPE } from '../lib/dnd.js';
import { FileMenuItems } from './FileMenu.js';
import { DocThumbnail } from './DocThumbnail.js';
import { PersonAvatar } from './PersonAvatar.js';
import type { CardCommonProps } from './FolderCard.js';

export function FileCard({ item, selected, onClick, onDoubleClick, onContextMenuOpen, isTrashed, menuHandlers }: CardCommonProps) {
  const cfg = fileTypeStyle(item.type);
  const isImage = previewKind(item.type) === 'image';
  const { url: thumbUrl } = usePreviewBlob(isImage ? item.id : null);

  const isPdf = item.type === 'pdf' || item.name.endsWith('.pdf');
  const isSheet = ['xlsx', 'xls', 'csv'].includes(item.type) || item.name.endsWith('.xlsx');
  const isDoc = ['doc', 'docx'].includes(item.type) || item.name.endsWith('.docx');

  const badgeColor = isPdf ? '#ef4444' : isSheet ? '#10b981' : isDoc ? '#2563eb' : 'var(--teal)';
  const badgeLabel = isPdf ? 'PDF' : isSheet ? 'SHEET' : isDoc ? 'DOC' : cfg.label.toUpperCase();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          draggable
          onDragStart={e => { e.dataTransfer.setData(DND_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenuOpen}
          className={`drive-file-card ${selected ? 'selected' : ''}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 14,
            border: selected ? '2px solid #1a73e8' : '1px solid var(--border)',
            background: selected ? 'rgba(26, 115, 232, 0.08)' : 'var(--card-bg)',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {/* Header Bar inside card */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 'var(--r-sm)', background: badgeColor, color: '#fff', flexShrink: 0 }}>
                <Icon name={cfg.icon} size={13} />
              </span>
              <span title={item.name} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.name}
              </span>
            </div>
            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: '50%', display: 'flex' }}>
                    <Icon name="moreVertical" size={15} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-47.5">
                  <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={DropdownMenuItem} SeparatorComp={DropdownMenuSeparator} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Document Preview Body Frame */}
          <div style={{ height: 130, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
            <DocThumbnail type={item.type} name={item.name} url={thumbUrl} />
            {item.starred && <Icon name="star" size={14} color="var(--gold)" style={{ position: 'absolute', top: 8, right: 8, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />}
          </div>

          {/* Card Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 11.5, color: 'var(--ink3)' }}>
            <PersonAvatar name={item.owner_name} userId={item.owner_id} size={18} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Updated {fmtRelative(item.updated_at)}
            </span>
          </div>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-47.5">
        <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={ContextMenuItem} SeparatorComp={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

