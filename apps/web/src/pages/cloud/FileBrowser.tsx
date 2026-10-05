import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { useCloud, CloudFile, StorageProvider, type CloudView } from '../../shells/cloud-context.js';
import { ProviderFilesPanel } from '../ProviderFilesPanel.js';
import { CATEGORY_EXT } from './lib/categories.js';
import { UploadDropzone } from './components/UploadDropzone.js';
import { ResumableUploadsBanner } from './components/ResumableUploadsBanner.js';
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
import { useCloudStrings } from './locale/index.js';

const PROVIDER_VIEWS: StorageProvider[] = ['box', 'dropbox', 'mega', 'onedrive'];

const CAT_EXT: Record<string, readonly string[]> = CATEGORY_EXT;

// Map URL path → CloudView so deep-linking restores the correct view
const PATH_TO_VIEW: Record<string, CloudView> = {
  '/cloud/files':  'all',
  '/cloud/shared': 'shared',
  '/cloud/recent': 'recent',
  '/cloud/trash':  'trash',
};

export const FileBrowser: React.FC = () => {
  const location = useLocation();
  const deepLinkedFileRef = useRef<string | null>(new URLSearchParams(location.search).get('file'));
  const pathView = PATH_TO_VIEW[location.pathname] ?? null;
  const isFilesRoot = location.pathname === '/cloud/files';

  const {
    files, loading, error, dismissError,
    currentView, currentFolderId, currentDriveId, breadcrumb, openFolder, navToBreadcrumb, goToView,
    previewItemId, setPreviewItemId, search, searchResults, searching,
    uploadFiles, starItem, moveItem, moveItems, renameItem, searchError, sharedWithMe, loadSharedWithMe,
    trashItem, restoreItem, permanentlyDelete, emptyTrash, shareItem, downloadItem, canPermanentlyDelete,
    folderItems, folderLoading, folderNextCursor, loadFolderContents, loadMoreFolderContents,
  } = useCloud();

  const t = useCloudStrings();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => localStorage.getItem('hudumika_cloud_view') === 'list' ? 'list' : 'grid');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>(() => {
    const saved = localStorage.getItem('hudumika_cloud_sort');
    return saved === 'name' || saved === 'size' ? saved : 'modified';
  });

  useEffect(() => { localStorage.setItem('hudumika_cloud_view', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('hudumika_cloud_sort', sortBy); }, [sortBy]);

  // Sync the context view with the URL so that deep-linking (or refresh on
  // /cloud/shared, /cloud/recent, /cloud/trash) restores the correct view.
  useEffect(() => {
    if (pathView && pathView !== currentView) goToView(pathView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathView]);

  // Load the first page of folder contents whenever the drive, folder, or sort changes.
  useEffect(() => {
    if (currentView !== 'all' || !currentDriveId) return;
    void loadFolderContents(currentDriveId, currentFolderId, { sortBy, limit: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, currentDriveId, currentFolderId, sortBy]);

  // IntersectionObserver sentinel at bottom of file list → triggers loadMore.
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreCallback = useCallback(() => { void loadMoreFolderContents(); }, [loadMoreFolderContents]);
  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || !folderNextCursor) return;
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) loadMoreCallback(); }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [folderNextCursor, loadMoreCallback]);

  const allItems = files.filter(i => !i.is_trash);
  const trashedItems = files.filter(i => i.is_trash);
  const previewItem = files.find(f => f.id === previewItemId) ?? null;
  const currentFolderItem = currentFolderId ? files.find(f => f.id === currentFolderId) ?? null : null;

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

  useEffect(() => {
    const id = deepLinkedFileRef.current;
    if (!id || loading) return;
    const file = files.find(item => item.id === id);
    if (!file) return;
    deepLinkedFileRef.current = null;
    setSelectedIds(new Set([id]));
    setLastAnchorId(id);
    setPreviewItemId(id);
    window.history.replaceState(null, '', window.location.pathname);
  }, [files, loading, setPreviewItemId]);

  function clearSelection() { setSelectedIds(new Set()); setLastAnchorId(null); }

  const isTrashView = currentView === 'trash';

  // A real search term searches the whole tenant server-side (GET /v1/files
  // ?q=) — it replaces the current folder/view scope entirely rather than
  // filtering within it, same as Drive's own search behaves.
  const isSearching = search.trim().length > 0;
  useEffect(() => { if (currentView === 'shared') void loadSharedWithMe(); }, [currentView, loadSharedWithMe]);

  const displayItems = (() => {
    let items: CloudFile[];
    if (isSearching) {
      items = searchResults ?? [];
    } else if (currentView === 'all') {
      // Paginated: the context already fetched and sorted this page server-side.
      // We still keep the folder-first grouping from the server (the API sends
      // folders before files), so no client-side re-sort is needed for 'all'.
      return folderItems;
    } else {
      items = isTrashView ? trashedItems : allItems;
      if (currentView === 'recent') items = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20);
      else if (currentView === 'starred') items = items.filter(i => i.starred);
      else if (currentView === 'shared') {
        const mine = items.filter(i => (i.shared ?? []).length > 0);
        const others = sharedWithMe.filter(f => !mine.some(m => m.id === f.id));
        items = [...mine, ...others];
      }
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

  useEffect(() => { clearSelection(); }, [currentView, currentFolderId]);

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

  // Awaited: the dialog closes only once the server has actually deleted/trashed the item.
  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    if (isTrashView) await permanentlyDelete(target.id);
    else await trashItem(target.id);
    if (previewItemId === target.id) setPreviewItemId(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(target.id); return n; });
  }

  function handleRestore(item: CloudFile) { restoreItem(item.id); if (previewItemId === item.id) setPreviewItemId(null); }
  function handlePermanentDelete(item: CloudFile) { setDeleteTarget(item); }
  function handleDownload(item: CloudFile) { if (item.type !== 'folder') downloadItem(item); }
  function handleMoveHere(draggedId: string, targetFolderId: string) { moveItem(draggedId, targetFolderId).catch(() => { /* surfaced by the context error banner */ }); }

  function bulkAction(action: (item: CloudFile) => void) {
    const targets = ordered.filter(i => selectedIds.has(i.id));
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

  // At /cloud/files (the explicit file-browser route) always show the browser,
  // even at the drive root. Only bounce to CloudHome when navigating "up" to
  // root from within the browser while NOT on an explicit URL that demands the browser.
  if (!isFilesRoot && currentView === 'all' && currentFolderId === null && !isSearching) {
    return <CloudHome />;
  }

  return (
    <div className="fb-root">
      {error && <Banner variant="error" onDismiss={dismissError} className="rounded-none border-x-0 border-t-0">{error}</Banner>}
      <div className="fb-upload-banner-wrap"><ResumableUploadsBanner /></div>

      <div className="fb-body">
        <div
          className="fb-card"
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
            itemCount={displayItems.length}
            hasMore={Boolean(folderNextCursor)}
            onClearSelection={clearSelection}
            onBulkDownload={() => bulkAction(i => { if (i.type !== 'folder') downloadItem(i); })}
            onBulkShare={() => setShareTarget(ordered.find(i => selectedIds.has(i.id)) ?? null)}
            onBulkMove={() => setMoveTarget([...selectedIds])}
            onBulkStar={() => bulkAction(i => starItem(i.id, true))}
            onBulkTrash={() => bulkAction(i => trashItem(i.id))}
            onBulkRestore={() => bulkAction(i => restoreItem(i.id))}
            onBulkPermanentDelete={async () => {
              if (await showConfirm(`Permanently delete ${selectedIds.size} item(s)?`, { confirmLabel: 'Delete Forever' })) bulkAction(i => permanentlyDelete(i.id));
            }}
          />

          <div className="fb-scroll" onClick={e => { if (e.target === e.currentTarget) clearSelection(); }}>
            {dragOver && (
              <div className="fb-dropzone-overlay">
                <Icon name="upload" size={40} color="var(--teal)" />
                  <span className="fb-dropzone-label">{t('fb.drop.label')}</span>
              </div>
            )}

            {(loading && files.length === 0 && !isSearching) || (currentView === 'all' && folderLoading && folderItems.length === 0) ? (
              <div className="fb-state-center" role="status">
                <span className="fb-spinner" aria-hidden="true" />
                <span>{t('fb.loading')}</span>
              </div>
            ) : null}

            {isSearching && searching && (
              <div className="fb-state-center"><span>{t('fb.searching')}</span></div>
            )}

            {isSearching && !searching && searchError && (
              <div role="alert" className="fb-state-error">
                <Icon name="alertCircle" size={40} color="var(--red)" />
                <span className="fb-state-error-title">{t('fb.search.error.title')}</span>
                <span className="fb-state-error-body">{searchError}</span>
              </div>
            )}

            {!loading && !(isSearching && searching) && !(isSearching && searchError) && displayItems.length === 0 && (
              <div className="fb-empty">
                {isSearching ? (
                  <>
                    <span className="fb-empty-icon"><Icon name="search" size={24} /></span>
                    <strong>{t('fb.search.noResults', { query: search })}</strong>
                    <span>Try a shorter name or a different keyword.</span>
                  </>
                ) : isTrashView ? (
                  <>
                    <span className="fb-empty-icon"><Icon name="trash" size={24} /></span>
                    <strong>{t('fb.trash.empty')}</strong>
                    <span>Items moved to the recycle bin will appear here.</span>
                  </>
                ) : (
                  <div className="fb-dropzone-wrap">
                    <UploadDropzone onUpload={f => uploadFiles(f, currentFolderId)} />
                  </div>
                )}
              </div>
            )}

            {folders.length > 0 && (
              <div className="fb-section">
                <div className="fb-section-header">
                  <span className="fb-section-label">{t('fb.section.folders')}</span>
                  <span className="fb-section-count">({folders.length})</span>
                </div>
                {viewMode === 'grid' ? (
                  <div className="fb-grid fb-grid--folders">
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
              <div className="fb-section">
                <div className="fb-section-header">
                  <span className="fb-section-label">{t('fb.section.files')}</span>
                  <span className="fb-section-count">({filesOnly.length}{folderNextCursor ? '+' : ''})</span>
                </div>
                {viewMode === 'grid' ? (
                  <div className="fb-grid fb-grid--files">
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

            {/* Load-more sentinel: IntersectionObserver auto-triggers the next page,
                and the button is a fallback for reduced-motion / accessibility. */}
            {currentView === 'all' && (folderNextCursor || folderLoading) && (
              <div ref={loadMoreSentinelRef} className="fb-load-more">
                {folderLoading
                  ? <span className="fb-load-more-label">{t('fb.loadingMore')}</span>
                  : <button className="btn btn-secondary btn-sm" onClick={() => void loadMoreFolderContents()}>
                      {t('fb.loadMore')}
                    </button>
                }
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
        aria-label="Upload files"
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
          onRename={name => renameItem(renameTarget.id, name)}
        />
      )}

      {moveTarget && (
        <MoveToModal
          ids={moveTarget}
          allItems={allItems}
          onClose={() => setMoveTarget(null)}
          onMove={async dest => { const res = await moveItems(moveTarget, dest); if (!res.failed.length) clearSelection(); return res; }}
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
