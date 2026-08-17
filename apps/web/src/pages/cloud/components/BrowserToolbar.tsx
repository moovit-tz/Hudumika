import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/dropdown-menu.js';
import { showConfirm } from '../../../lib/confirm.js';
import type { CloudFile, Crumb, CloudView } from '../../../shells/cloud-context.js';
import { FileMenuItems, type FileMenuHandlers } from './FileMenu.js';

type SortBy = 'name' | 'size' | 'modified';
type ViewMode = 'grid' | 'list';

export function BrowserToolbar(props: {
  isTrashView: boolean;
  currentView: CloudView;
  searchTerm?: string;
  breadcrumb: Crumb[];
  currentFolderItem: CloudFile | null;
  navToBreadcrumb: (idx: number) => void;
  menuHandlers: FileMenuHandlers;
  onShareFolder: () => void;

  sortBy: SortBy; setSortBy: (v: SortBy) => void;
  viewMode: ViewMode; setViewMode: (v: ViewMode) => void;

  trashedCount: number;
  canPermanentlyDelete: boolean;
  onEmptyTrash: () => void;

  selectedCount: number;
  onClearSelection: () => void;
  onBulkDownload: () => void;
  onBulkShare: () => void;
  onBulkMove: () => void;
  onBulkStar: () => void;
  onBulkTrash: () => void;
  onBulkRestore: () => void;
  onBulkPermanentDelete: () => void;
}) {
  const {
    isTrashView, currentView, searchTerm, breadcrumb, currentFolderItem, navToBreadcrumb, menuHandlers, onShareFolder,
    sortBy, setSortBy, viewMode, setViewMode, trashedCount, canPermanentlyDelete, onEmptyTrash,
    selectedCount, onClearSelection, onBulkDownload, onBulkShare, onBulkMove, onBulkStar, onBulkTrash, onBulkRestore, onBulkPermanentDelete,
  } = props;

  if (selectedCount > 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', background: 'var(--teal-l)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={onClearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--teal)', display: 'flex' }}><Icon name="x" size={18} color="var(--teal)" /></button>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--teal)' }}>{selectedCount} selected</span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {isTrashView ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onBulkRestore}><Icon name="refresh" size={14} /> Restore</button>
              {canPermanentlyDelete && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={onBulkPermanentDelete}><Icon name="trash2" size={14} color="var(--red)" /> Delete forever</button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onBulkDownload}><Icon name="download" size={14} /> Download</button>
              {selectedCount === 1 && <button className="btn btn-ghost btn-sm" onClick={onBulkShare}><Icon name="userPlus" size={14} /> Share</button>}
              <button className="btn btn-ghost btn-sm" onClick={onBulkMove}><Icon name="folderOpen" size={14} /> Move to</button>
              <button className="btn btn-ghost btn-sm" onClick={onBulkStar}><Icon name="star" size={14} /> Star</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={onBulkTrash}><Icon name="trash" size={14} color="var(--red)" /> Move to trash</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid transparent', flexShrink: 0 }}>
      <div style={{ flex: '0 0 60%', maxWidth: '60%', minWidth: 0, fontSize: 17, fontWeight: 400, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        {searchTerm ? (
          <span style={{ fontWeight: 600 }}>Search results for "{searchTerm}"</span>
        ) : isTrashView ? (
          <span style={{ fontWeight: 600 }}>Trash</span>
        ) : currentView !== 'all' ? (
          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{currentView === 'shared' ? 'Shared with Me' : currentView}</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, overflow: 'hidden' }}>
            {breadcrumb.map((crumb, idx) => {
              const isLast = idx === breadcrumb.length - 1;
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <Icon name="chevronRight" size={16} color="var(--ink3)" className="shrink-0" />}
                  <button
                    onClick={() => !isLast && navToBreadcrumb(idx)}
                    className="hover:bg-(--bg)"
                    title={crumb.name}
                    style={{
                      background: 'none', border: 'none', padding: '5px 8px', borderRadius: 'var(--r-sm)', fontSize: 17,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                      ...(isLast
                        ? { color: 'var(--ink)', fontWeight: 500, cursor: 'default', maxWidth: 320, flexShrink: 1 }
                        : { color: 'var(--ink3)', fontWeight: 400, cursor: 'pointer', maxWidth: 160, flexShrink: 3 }),
                    }}
                  >
                    {crumb.name}
                  </button>
                  {isLast && currentFolderItem && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="hover:bg-(--bg)" title="Folder options" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                          <Icon name="chevronDown" size={16} color="var(--ink3)" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-47.5">
                        <FileMenuItems item={currentFolderItem} isTrashed={false} handlers={menuHandlers} ItemComp={DropdownMenuItem} SeparatorComp={DropdownMenuSeparator} />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </React.Fragment>
              );
            })}
            {currentFolderItem && (
              <button className="hover:bg-(--bg)" title="Share this folder" onClick={onShareFolder} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                <Icon name="users" size={15} color="var(--ink3)" />
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 40%', minWidth: 0, justifyContent: 'flex-end' }}>
        {isTrashView && trashedCount > 0 && canPermanentlyDelete && (
          <button
            onClick={async () => { if (await showConfirm('Empty trash? This permanently deletes all items in Trash.', { confirmLabel: 'Empty Trash' })) onEmptyTrash(); }}
            className="btn btn-secondary btn-sm" style={{ gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Icon name="trash2" size={13} /> Empty trash
          </button>
        )}

        <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
          <SelectTrigger className="input-field" aria-label="Sort by" style={{ width: 150, flexShrink: 0, fontSize: 13 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="modified">Last Modified</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="size">Size</SelectItem>
          </SelectContent>
        </Select>

        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', flexShrink: 0 }}>
          {(['grid', 'list'] as const).map(m => (
            <button
              key={m} onClick={() => setViewMode(m)} title={m === 'grid' ? 'Grid view' : 'List view'}
              style={{
                padding: 'var(--ds-btn-py) 12px', display: 'flex', alignItems: 'center', border: 'none', cursor: 'pointer',
                background: viewMode === m ? 'var(--teal)' : 'var(--white)', color: viewMode === m ? '#fff' : 'var(--ink3)',
                minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25,
              }}
            >
              <Icon name={m === 'grid' ? 'grid' : 'list'} size={14} color={viewMode === m ? '#fff' : 'var(--ink3)'} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
