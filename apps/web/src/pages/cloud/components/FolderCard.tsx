import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../../../components/ui/context-menu.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { FileMenuItems, type FileMenuHandlers } from './FileMenu.js';
import { DND_TYPE } from '../lib/dnd.js';
import { fmtExpiresIn } from '../lib/format.js';

export interface CardCommonProps {
  item: CloudFile;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenuOpen?: () => void;
  onMoveHere?: (draggedId: string) => void;
  isTrashed: boolean;
  menuHandlers: FileMenuHandlers;
}

export function FolderCard({ item, selected, onClick, onDoubleClick, onContextMenuOpen, onMoveHere, isTrashed, menuHandlers }: CardCommonProps) {
  const [dropHov, setDropHov] = useState(false);
  // The `${color}22` alpha trick below needs a literal hex, not a var()
  // reference — matches --gold's own value, same fallback the old code used.
  const color = item.color ?? '#f59e0b';
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          draggable
          onDragStart={e => { e.dataTransfer.setData(DND_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={e => { if (e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); setDropHov(true); } }}
          onDragLeave={() => setDropHov(false)}
          onDrop={e => {
            if (!e.dataTransfer.types.includes(DND_TYPE)) return;
            e.preventDefault(); e.stopPropagation(); setDropHov(false);
            const id = e.dataTransfer.getData(DND_TYPE);
            if (id && id !== item.id) onMoveHere?.(id);
          }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenuOpen}
          className="hover:shadow-md transition-shadow cursor-pointer"
          style={{
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
            border: dropHov ? '1px solid var(--teal)' : selected ? '1px solid var(--teal)' : 'var(--card-border)',
            boxShadow: dropHov ? '0 0 0 2px var(--teal-l)' : selected ? '0 0 0 2px var(--teal-l)' : 'var(--card-shadow)',
          }}
        >
          {/* A folder's colour is an arbitrary hex the user picked (FOLDER_COLORS),
              not one of the six semantic FeaturedIcon variants — bg tint and icon
              colour both need to track that exact hex, which the fixed enum can't
              express, so this stays the same inline composition FeaturedIcon
              itself uses under the hood, just parameterised by a real colour. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 'var(--r)', background: `${color}22`, flexShrink: 0 }}>
            <Icon name="folder" size={20} color={color} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{isTrashed ? fmtExpiresIn(item.trashed_at) : `${item.file_count} files`}</div>
          </div>
          {item.starred && <Icon name="star" size={13} color="var(--gold)" style={{ flexShrink: 0 }} />}
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-47.5">
        <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={ContextMenuItem} SeparatorComp={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
