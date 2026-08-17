import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { FeaturedIcon } from '../../../components/ui/featured-icon.js';
import { Checkbox } from '../../../components/ui/checkbox.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/table.js';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../../../components/ui/context-menu.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/dropdown-menu.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { fmtSize, fmtDate, fmtExpiresIn } from '../lib/format.js';
import { fileTypeStyle } from '../lib/fileTypeStyle.js';
import { DND_TYPE } from '../lib/dnd.js';
import { FileMenuItems, type FileMenuHandlers } from './FileMenu.js';
import { PersonAvatar } from './PersonAvatar.js';

interface FileTableRowProps {
  item: CloudFile;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenuOpen?: () => void;
  onToggleSelect: (item: CloudFile) => void;
  onMoveHere?: (draggedId: string) => void;
  isTrashed: boolean;
  menuHandlers: FileMenuHandlers;
}

function FileTableRow({ item, selected, onClick, onDoubleClick, onContextMenuOpen, onToggleSelect, onMoveHere, isTrashed, menuHandlers }: FileTableRowProps) {
  const [dropHov, setDropHov] = useState(false);
  const cfg = fileTypeStyle(item.type);
  const folderColor = item.color ?? '#f59e0b';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          draggable
          onDragStart={e => { e.dataTransfer.setData(DND_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={e => { if (item.type === 'folder' && e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); setDropHov(true); } }}
          onDragLeave={() => setDropHov(false)}
          onDrop={e => {
            if (item.type !== 'folder' || !e.dataTransfer.types.includes(DND_TYPE)) return;
            e.preventDefault(); e.stopPropagation(); setDropHov(false);
            const id = e.dataTransfer.getData(DND_TYPE);
            if (id && id !== item.id) onMoveHere?.(id);
          }}
          onContextMenu={onContextMenuOpen}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          className="cursor-pointer"
          style={{
            background: dropHov ? 'var(--teal-l)' : selected ? 'var(--teal-l)' : undefined,
            outline: dropHov ? '2px solid var(--teal)' : 'none', outlineOffset: -2,
          }}
        >
          <TableCell onClick={e => e.stopPropagation()}>
            <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(item)} aria-label={`Select ${item.name}`} />
          </TableCell>
          <TableCell>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {item.type === 'folder'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--r)', background: `${folderColor}22`, flexShrink: 0 }}><Icon name="folder" size={16} color={folderColor} /></span>
                : <FeaturedIcon variant={cfg.variant} size="sm"><Icon name={cfg.icon} size={15} /></FeaturedIcon>
              }
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                {item.type === 'folder' && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{item.file_count} files</div>}
              </div>
              {item.starred && <Icon name="star" size={12} color="var(--gold)" style={{ flexShrink: 0 }} />}
            </div>
          </TableCell>
          <TableCell style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{item.owner_name}</TableCell>
          <TableCell style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
            {isTrashed ? (
              <>
                <div>{fmtDate(item.trashed_at)}</div>
                <div style={{ fontSize: 11 }}>{fmtExpiresIn(item.trashed_at)}</div>
              </>
            ) : fmtDate(item.updated_at)}
          </TableCell>
          <TableCell style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fmtSize(item.size)}</TableCell>
          <TableCell>
            <div style={{ display: 'flex' }}>
              {(item.shared ?? []).slice(0, 3).map((p, i) => <span key={i} style={{ marginLeft: i > 0 ? -6 : 0 }}><PersonAvatar name={p.name} size={20} /></span>)}
            </div>
          </TableCell>
          <TableCell onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center rounded-md p-1 text-[var(--ink3)] hover:bg-[var(--bg)]">
                  <Icon name="moreHorizontal" size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-47.5">
                <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={DropdownMenuItem} SeparatorComp={DropdownMenuSeparator} />
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-47.5">
        <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={ContextMenuItem} SeparatorComp={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FileTable({ items, selectedIds, isTrashed, menuHandlers, onItemClick, onItemDoubleClick, onContextMenuOpen, onToggleSelect, onMoveHere }: {
  items: CloudFile[];
  selectedIds: Set<string>;
  isTrashed: boolean;
  menuHandlers: FileMenuHandlers;
  onItemClick: (item: CloudFile, e: React.MouseEvent) => void;
  onItemDoubleClick: (item: CloudFile) => void;
  onContextMenuOpen: (item: CloudFile) => void;
  onToggleSelect: (item: CloudFile) => void;
  onMoveHere: (draggedId: string, targetFolderId: string) => void;
}) {
  return (
    <div style={{ border: 'var(--card-border)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--card-bg)' }}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead style={{ width: 36 }} />
            <TableHead>Name</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>{isTrashed ? 'Deleted' : 'Last modified'}</TableHead>
            <TableHead>File size</TableHead>
            <TableHead>Shared</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <FileTableRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              isTrashed={isTrashed}
              menuHandlers={menuHandlers}
              onClick={e => onItemClick(item, e)}
              onDoubleClick={() => onItemDoubleClick(item)}
              onContextMenuOpen={() => onContextMenuOpen(item)}
              onToggleSelect={onToggleSelect}
              onMoveHere={draggedId => onMoveHere(draggedId, item.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
