import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/dropdown-menu.js';
import { showConfirm } from '../../../lib/confirm.js';
import type { CloudFile, Crumb, CloudView } from '../../../shells/cloud-context.js';
import { FileMenuItems, type FileMenuHandlers } from './FileMenu.js';
import { Tip } from '../../../components/ui/tooltip.js';

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
  itemCount: number;
  hasMore: boolean;
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
    selectedCount, itemCount, hasMore, onClearSelection, onBulkDownload, onBulkShare, onBulkMove, onBulkStar, onBulkTrash, onBulkRestore, onBulkPermanentDelete,
  } = props;

  if (selectedCount > 0) {
    return (
      <div className="fb-selection-bar">
        <button onClick={onClearSelection} className="fb-toolbar-icon-btn" aria-label="Clear selection"><Icon name="x" size={18} /></button>
        <span className="fb-selection-count">{selectedCount} selected</span>
        <div className="fb-selection-actions">
          {isTrashView ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onBulkRestore}><Icon name="refresh" size={14} /> Restore</button>
              {canPermanentlyDelete && (
                <button className="btn btn-ghost btn-sm fb-danger-action" onClick={onBulkPermanentDelete}><Icon name="trash2" size={14} /> Delete forever</button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onBulkDownload}><Icon name="download" size={14} /> Download</button>
              {selectedCount === 1 && <button className="btn btn-ghost btn-sm" onClick={onBulkShare}><Icon name="userPlus" size={14} /> Share</button>}
              <button className="btn btn-ghost btn-sm" onClick={onBulkMove}><Icon name="folderOpen" size={14} /> Move to</button>
              <button className="btn btn-ghost btn-sm" onClick={onBulkStar}><Icon name="star" size={14} /> Star</button>
              <button className="btn btn-ghost btn-sm fb-danger-action" onClick={onBulkTrash}><Icon name="trash" size={14} /> Move to trash</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fb-toolbar">
      {/* Top Header & View Mode Toolbar */}
      <div className="fb-toolbar-main">
        <div className="fb-toolbar-title-wrap">
          {searchTerm ? (
            <div className="fb-toolbar-heading"><span className="fb-toolbar-heading-icon"><Icon name="search" size={16} /></span><div><strong>Search results</strong><small>For “{searchTerm}”</small></div></div>
          ) : isTrashView ? (
            <div className="fb-toolbar-heading"><span className="fb-toolbar-heading-icon"><Icon name="trash" size={16} /></span><div><strong>Recycle bin</strong><small>{trashedCount} {trashedCount === 1 ? 'item' : 'items'}</small></div></div>
          ) : currentView !== 'all' ? (
            <div className="fb-toolbar-heading"><span className="fb-toolbar-heading-icon"><Icon name={currentView === 'shared' ? 'users' : currentView === 'recent' ? 'clock' : currentView === 'starred' ? 'star' : 'folder'} size={16} /></span><div><strong>{currentView === 'shared' ? 'Shared with me' : currentView}</strong><small>{itemCount}{hasMore ? '+' : ''} {itemCount === 1 ? 'item' : 'items'}</small></div></div>
          ) : (
            <div className="fb-breadcrumbs">
              {breadcrumb.map((crumb, idx) => {
                const isLast = idx === breadcrumb.length - 1;
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && <Icon name="chevronRight" size={14} color="var(--ink3)" className="shrink-0" />}
                    <button
                      onClick={() => !isLast && navToBreadcrumb(idx)}
                      className={`fb-breadcrumb${isLast ? ' fb-breadcrumb--current' : ''}`}
                    >
                      {crumb.name}
                    </button>
                    {isLast && currentFolderItem && (
                      <DropdownMenu>
                        <Tip label="Folder options">
                          <DropdownMenuTrigger asChild>
                          <button aria-label="Folder options" className="fb-toolbar-icon-btn">
                            <Icon name="chevronDown" size={16} color="var(--ink3)" />
                          </button>
                          </DropdownMenuTrigger>
                        </Tip>
                        <DropdownMenuContent align="start" className="w-47.5">
                          <FileMenuItems item={currentFolderItem} isTrashed={false} handlers={menuHandlers} ItemComp={DropdownMenuItem} SeparatorComp={DropdownMenuSeparator} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </React.Fragment>
                );
              })}
              {currentFolderItem && (
                <Tip label="Share this folder"><button aria-label="Share this folder" onClick={onShareFolder} className="fb-toolbar-icon-btn"><Icon name="users" size={15} color="var(--ink3)" /></button></Tip>
              )}
            </div>
          )}
        </div>

        <div className="fb-toolbar-actions">
          {isTrashView && trashedCount > 0 && canPermanentlyDelete && (
            <button
              onClick={async () => { if (await showConfirm('Empty trash? This permanently deletes all items in Trash.', { confirmLabel: 'Empty Trash' })) onEmptyTrash(); }}
              className="btn btn-secondary btn-sm fb-empty-trash-btn"
            >
              <Icon name="trash2" size={13} /> Empty trash
            </button>
          )}

          <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
            <SelectTrigger className="input-field fb-sort-select" aria-label="Sort by"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="modified">Last Modified</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="size">Size</SelectItem>
            </SelectContent>
          </Select>

          <div className="fb-view-toggle" role="group" aria-label="Display mode">
            {(['grid', 'list'] as const).map(m => (
              <button
                key={m} onClick={() => setViewMode(m)} title={m === 'grid' ? 'Grid view' : 'List view'}
                className={`fb-view-btn${viewMode === m ? ' fb-view-btn--active' : ''}`}
                aria-pressed={viewMode === m}
              >
                <Icon name={m === 'grid' ? 'grid' : 'list'} size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
