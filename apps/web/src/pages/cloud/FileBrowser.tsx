import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import { showConfirm } from '../../lib/confirm.js';
import { useCloud, CloudFile, StorageProvider } from '../../shells/cloud-context.js';
import { ProviderFilesPanel } from '../ProviderFilesPanel.js';
import { CATEGORY_EXT } from './lib/categories.js';
import { UploadDropzone } from './components/UploadDropzone.js';
import { BrowserToolbar } from './components/BrowserToolbar.js';
import { FolderCard } from './components/FolderCard.js';
import { FileCard } from './components/FileCard.js';
import { FileTable } from './components/FileTable.js';
import { PreviewPanel } from './PreviewPanel.js';
import { Lightbox } from './components/Lightbox.js';
import { ShareModal } from './modals/ShareModal.js';
import { MoveToModal } from './modals/MoveToModal.js';
import { RenameModal } from './modals/RenameModal.js';
import { DeleteConfirmModal } from './modals/DeleteConfirmModal.js';
import { previewKind } from './lib/fileTypeStyle.js';
import type { FileMenuHandlers } from './components/FileMenu.js';

import { CloudHome } from './CloudHome.js';

const PROVIDER_VIEWS: StorageProvider[] = ['box', 'dropbox', 'mega', 'onedrive'];

const CAT_EXT: Record<string, readonly string[]> = CATEGORY_EXT;

export const FileBrowser: React.FC = () => {
  const {
    files, loading, error, dismissError,
    currentView, currentFolderId, breadcrumb, openFolder, navToBreadcrumb,
    previewItemId, setPreviewItemId, search, searchResults, searching,
    uploadFiles, starItem, moveItem, renameItem,
    trashItem, restoreItem, permanentlyDelete, emptyTrash, shareItem, downloadItem, canPermanentlyDelete,
  } = useCloud();

  const allItems = files.filter(i => !i.is_trash);
  const trashedItems = files.filter(i => i.is_trash);
  const previewItem = files.find(f => f.id === previewItemId) ?? null;
  const currentFolderItem = currentFolderId ? files.find(f => f.id === currentFolderId) ?? null : null;

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('modified');
  const [deleteTarget, setDeleteTarget] = useState<CloudFile | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastAnchorId, setLastAnchorId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<CloudFile | null>(null);
  const [moveTarget, setMoveTarget] = useState<string[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<CloudFile | null>(null);
  const [lightboxItem, setLightboxItem] = useState<CloudFile | null>(null);
  // Re-derived from the live files list (not the stale object captured when
  // the lightbox opened) so its own Star button reflects the toggle it just
  // made, same reasoning as previewItem above.
  const liveLightboxItem = lightboxItem ? files.find(f => f.id === lightboxItem.id) ?? lightboxItem : null;

  function clearSelection() { setSelectedIds(new Set()); setLastAnchorId(null); }

  const isTrashView = currentView === 'trash';

  // A real search term searches the whole tenant server-side (GET /v1/files
  // ?q=) — it replaces the current folder/view scope entirely rather than
  // filtering within it, same as Drive's own search behaves.
  const isSearching = search.trim().length > 0;

  const displayItems = (() => {
    let items: CloudFile[];
    if (isSearching) {
      items = searchResults ?? [];
    } else {
      items = isTrashView ? trashedItems : allItems;
      if (currentView === 'all') items = items.filter(i => i.parent_id === currentFolderId);
      else if (currentView === 'recent') items = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20);
      else if (currentView === 'starred') items = items.filter(i => i.starred);
      else if (currentView === 'shared') items = items.filter(i => (i.shared ?? []).length > 0);
      else if (CAT_EXT[currentView]) items = items.filter(i => CAT_EXT[currentView].includes(i.type));
    }

    items = [...items].sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return (b.size ?? 0) - (a.size ?? 0);
      return b.updated_at.localeCompare(a.updated_at);
    });
    return items;
  })();

  const folders = displayItems.filter(i => i.type === 'folder');
  const filesOnly = displayItems.filter(i => i.type !== 'folder');
  const ordered = [...folders, ...filesOnly];

  function selectItem(item: CloudFile, e: React.MouseEvent) {
    if (e.shiftKey && lastAnchorId) {
      const ai = ordered.findIndex(i => i.id === lastAnchorId);
      const bi = ordered.findIndex(i => i.id === item.id);
      if (ai !== -1 && bi !== -1) {
        const [lo, hi] = ai < bi ? [ai, bi] : [bi, ai];
        setSelectedIds(new Set(ordered.slice(lo, hi + 1).map(i => i.id)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(item);
      return;
    }
    setSelectedIds(new Set([item.id]));
    setLastAnchorId(item.id);
    setPreviewItemId(item.id);
  }

  function toggleSelect(item: CloudFile) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(item.id) ? n.delete(item.id) : n.add(item.id);
      return n;
    });
    setLastAnchorId(item.id);
  }

  function handleSelectAll(itemsToSelect: CloudFile[], select: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const item of itemsToSelect) {
        if (select) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }



  function openItem(item: CloudFile) {
    if (item.type === 'folder' && !isTrashView) { openFolder(item); clearSelection(); }
    else if (!isTrashView && previewKind(item.type)) setLightboxItem(item);
    else setPreviewItemId(item.id);
  }

  function handleStar(item: CloudFile) { starItem(item.id, !item.starred); }
  function handleDelete(item: CloudFile) { setDeleteTarget(item); }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (isTrashView) permanentlyDelete(deleteTarget.id);
    else trashItem(deleteTarget.id);
    if (previewItemId === deleteTarget.id) setPreviewItemId(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
    setDeleteTarget(null);
  }

  function handleRestore(item: CloudFile) { restoreItem(item.id); if (previewItemId === item.id) setPreviewItemId(null); }
  function handlePermanentDelete(item: CloudFile) { setDeleteTarget(item); }
  function handleDownload(item: CloudFile) { if (item.type !== 'folder') downloadItem(item); }
  function handleMoveHere(draggedId: string, targetFolderId: string) { moveItem(draggedId, targetFolderId); }

  function bulkAction(action: (item: CloudFile) => void) {
    const targets = files.filter(i => selectedIds.has(i.id));
    targets.forEach(action);
    clearSelection();
  }

  function selectForContextMenu(item: CloudFile) {
    setSelectedIds(prev => prev.has(item.id) ? prev : new Set([item.id]));
  }

  function openRename(item: CloudFile) { setRenameTarget(item); }

  const menuHandlers: FileMenuHandlers = {
    onOpen: openItem, onRename: openRename,
    onStar: handleStar, onDelete: handleDelete, onDownload: handleDownload,
    onShare: setShareTarget, onMove: i => setMoveTarget([i.id]),
    onRestore: handleRestore, onPermanentDelete: handlePermanentDelete,
  };

  function handleDrop(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/x-fileitem')) return; // internal move, handled by the target row/card
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length) uploadFiles(droppedFiles, currentFolderId);
  }

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPreviewItemId(null); clearSelection(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  if (PROVIDER_VIEWS.includes(currentView as StorageProvider)) {
    return <ProviderFilesPanel provider={currentView as StorageProvider} />;
  }

  if (currentView === 'all' && currentFolderId === null && !isSearching) {
    return <CloudHome />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 20px', background: 'var(--red-l)', borderBottom: '1px solid var(--red)', color: 'var(--red)', fontSize: 13 }}>
          <span>{error}</span>
          <button onClick={dismissError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}><Icon name="close" size={14} color="var(--red)" /></button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--card-bg)', border: 'var(--card-border)', borderRadius: 'var(--r)', boxShadow: 'var(--card-shadow)', position: 'relative' }}
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <BrowserToolbar
            isTrashView={isTrashView}
            currentView={currentView}
            searchTerm={isSearching ? search.trim() : undefined}
            breadcrumb={breadcrumb}
            currentFolderItem={currentFolderItem}
            navToBreadcrumb={navToBreadcrumb}
            menuHandlers={menuHandlers}
            onShareFolder={() => currentFolderItem && setShareTarget(currentFolderItem)}
            sortBy={sortBy} setSortBy={setSortBy}
            viewMode={viewMode} setViewMode={setViewMode}
            trashedCount={trashedItems.length}
            canPermanentlyDelete={canPermanentlyDelete}
            onEmptyTrash={emptyTrash}
            selectedCount={selectedIds.size}
            onClearSelection={clearSelection}
            onBulkDownload={() => bulkAction(i => { if (i.type !== 'folder') downloadItem(i); })}
            onBulkShare={() => setShareTarget(files.find(i => selectedIds.has(i.id))!)}
            onBulkMove={() => setMoveTarget([...selectedIds])}
            onBulkStar={() => bulkAction(i => starItem(i.id, true))}
            onBulkTrash={() => bulkAction(i => trashItem(i.id))}
            onBulkRestore={() => bulkAction(i => restoreItem(i.id))}
            onBulkPermanentDelete={async () => {
              if (await showConfirm(`Permanently delete ${selectedIds.size} item(s)?`, { confirmLabel: 'Delete Forever' })) bulkAction(i => permanentlyDelete(i.id));
            }}
          />

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', position: 'relative' }} onClick={e => { if (e.target === e.currentTarget) clearSelection(); }}>
            {dragOver && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--teal-l)', opacity: 0.9, border: '2px dashed var(--teal)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
                <Icon name="upload" size={40} color="var(--teal)" />
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--teal)' }}>Drop files here to upload</span>
              </div>
            )}

            {loading && files.length === 0 && !isSearching && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink3)', fontSize: 14.5 }}>Loading your Drive…</div>
            )}

            {isSearching && searching && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink3)', fontSize: 14.5 }}>Searching…</div>
            )}

            {!loading && !(isSearching && searching) && displayItems.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--ink3)' }}>
                {isSearching ? (
                  <>
                    <Icon name="search" size={48} color="var(--border)" />
                    <span style={{ fontSize: 14.5 }}>No results for "{search}"</span>
                  </>
                ) : isTrashView ? (
                  <>
                    <Icon name="trash" size={48} color="var(--border)" />
                    <span style={{ fontSize: 14.5 }}>Trash is empty</span>
                  </>
                ) : (
                  <div style={{ width: '100%', maxWidth: 420 }}>
                    <UploadDropzone onUpload={f => uploadFiles(f, currentFolderId)} />
                  </div>
                )}
              </div>
            )}

            {folders.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink3)', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>Folders</span>
                  <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>({folders.length})</span>
                </div>
                {viewMode === 'grid' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                    {folders.map(item => (
                      <FolderCard key={item.id} item={item} selected={selectedIds.has(item.id)} isTrashed={isTrashView} menuHandlers={menuHandlers}
                        onClick={e => selectItem(item, e)}
                        onDoubleClick={() => openItem(item)}
                        onContextMenuOpen={() => selectForContextMenu(item)}
                        onMoveHere={draggedId => handleMoveHere(draggedId, item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <FileTable
                    items={folders} selectedIds={selectedIds} isTrashed={isTrashView} menuHandlers={menuHandlers}
                    onItemClick={selectItem} onItemDoubleClick={openItem} onContextMenuOpen={selectForContextMenu}
                    onToggleSelect={toggleSelect} onSelectAll={handleSelectAll} onMoveHere={handleMoveHere}
                  />
                )}
              </div>
            )}

            {filesOnly.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink3)', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>Files</span>
                  <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>({filesOnly.length})</span>
                </div>
                {viewMode === 'grid' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 }}>
                    {filesOnly.map(item => (
                      <FileCard key={item.id} item={item} selected={selectedIds.has(item.id)} isTrashed={isTrashView} menuHandlers={menuHandlers}
                        onClick={e => selectItem(item, e)}
                        onDoubleClick={() => openItem(item)}
                        onContextMenuOpen={() => selectForContextMenu(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <FileTable
                    items={filesOnly} selectedIds={selectedIds} isTrashed={isTrashView} menuHandlers={menuHandlers}
                    onItemClick={selectItem} onItemDoubleClick={openItem} onContextMenuOpen={selectForContextMenu}
                    onToggleSelect={toggleSelect} onSelectAll={handleSelectAll} onMoveHere={handleMoveHere}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {previewItem && (
          <PreviewPanel
            item={previewItem}
            onClose={() => setPreviewItemId(null)}
            onStar={handleStar}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onShare={setShareTarget}
            onExpand={setLightboxItem}
          />
        )}
      </div>

      {/* Mobile Floating Action Button (+ FAB) */}
      <button
        className="cloud-fab-btn"
        title="Upload or create"
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.onchange = e => {
            const fl = Array.from((e.target as HTMLInputElement).files ?? []);
            if (fl.length) uploadFiles(fl, currentFolderId);
          };
          input.click();
        }}
      >
        <Icon name="plus" size={24} color="#ffffff" />
      </button>

      {liveLightboxItem && (
        <Lightbox
          item={liveLightboxItem}
          onClose={() => setLightboxItem(null)}
          onDownload={handleDownload}
          // ShareModal is a plain .modal-overlay (z-index: 200); Lightbox is
          // a Radix Dialog (z-[9999]). Opening Share while the Lightbox
          // stayed open rendered the modal genuinely mounted, just entirely
          // behind the still-open viewer — clicking it did nothing visible,
          // which is exactly what "the button doesn't work" looks like.
          // Closing the Lightbox first makes the modal the only overlay.
          onShare={item => { setLightboxItem(null); setShareTarget(item); }}
          onStar={handleStar}
        />
      )}

      {shareTarget && (
        <ShareModal
          item={shareTarget}
          onClose={() => setShareTarget(null)}
          onSave={shared => shareItem(shareTarget.id, shared)}
        />
      )}

      {renameTarget && (
        <RenameModal
          item={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={name => { renameItem(renameTarget.id, name); setRenameTarget(null); }}
        />
      )}

      {moveTarget && (
        <MoveToModal
          ids={moveTarget}
          allItems={allItems}
          onClose={() => setMoveTarget(null)}
          onMove={dest => { moveTarget.forEach(id => moveItem(id, dest)); clearSelection(); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          isTrashView={isTrashView}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};
