import React from 'react';
import { Icon } from '../../../components/Icon.js';
import type { IconName } from '../../../components/Icon.js';
import { useCloud, CloudFile } from '../../../shells/cloud-context.js';

/** Shared action list, rendered inside either a DropdownMenuContent
 *  (kebab-button trigger) or a ContextMenuContent (right-click trigger)
 *  depending on which wraps it — same items, same handlers, two triggers. */
export interface FileMenuHandlers {
  onOpen: (item: CloudFile) => void;
  onRename: (item: CloudFile) => void;
  onStar: (item: CloudFile) => void;
  onDelete: (item: CloudFile) => void;
  onDownload: (item: CloudFile) => void;
  onShare: (item: CloudFile) => void;
  onMove: (item: CloudFile) => void;
  onRestore: (item: CloudFile) => void;
  onPermanentDelete: (item: CloudFile) => void;
}

export function fileMenuEntries(item: CloudFile, isTrashed: boolean, h: FileMenuHandlers, canPermanentlyDelete: boolean) {
  return isTrashed
    ? [
        { icon: 'refresh' as IconName, label: 'Restore', action: () => h.onRestore(item) },
        ...(canPermanentlyDelete ? [null, { icon: 'trash2' as IconName, label: 'Delete forever', action: () => h.onPermanentDelete(item), danger: true }] : []),
      ]
    : [
        { icon: 'eye' as IconName, label: 'Preview', action: () => h.onOpen(item) },
        { icon: 'edit' as IconName, label: 'Rename', action: () => h.onRename(item) },
        ...(item.type !== 'folder' ? [{ icon: 'download' as IconName, label: 'Download', action: () => h.onDownload(item) }] : []),
        { icon: 'userPlus' as IconName, label: 'Share', action: () => h.onShare(item) },
        { icon: 'folderOpen' as IconName, label: 'Move to', action: () => h.onMove(item) },
        { icon: 'star' as IconName, label: item.starred ? 'Unstar' : 'Star', action: () => h.onStar(item) },
        null,
        { icon: 'trash' as IconName, label: 'Move to trash', action: () => h.onDelete(item), danger: true },
      ];
}

export function FileMenuItems({ item, isTrashed, handlers, ItemComp, SeparatorComp }: {
  item: CloudFile;
  isTrashed: boolean;
  handlers: FileMenuHandlers;
  ItemComp: React.ComponentType<any>;
  SeparatorComp: React.ComponentType<any>;
}) {
  const { canPermanentlyDelete } = useCloud();
  const entries = fileMenuEntries(item, isTrashed, handlers, canPermanentlyDelete);
  return (
    <>
      {entries.map((it, idx) =>
        it === null
          ? <SeparatorComp key={idx} />
          : (
            <ItemComp
              key={idx}
              onSelect={it.action}
              className={`gap-2.5 cursor-pointer${it.danger ? ' text-red-600 focus:text-red-600 focus:bg-red-50' : ''}`}
            >
              <Icon name={it.icon} size={14} color={it.danger ? 'var(--red)' : 'var(--ink3)'} />
              <span>{it.label}</span>
              {it.label === 'Star' && item.starred && <Icon name="star" size={12} color="var(--gold)" style={{ marginLeft: 'auto' }} />}
            </ItemComp>
          )
      )}
    </>
  );
}
