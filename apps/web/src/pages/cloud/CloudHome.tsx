import React, { useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useCloud, type CloudFile } from '../../shells/cloud-context.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { StorageOverviewCards } from './home/StorageOverviewCards.js';
import { ConnectedStorageCards } from './home/ConnectedStorageCards.js';
import { RecentlySharedCard } from './home/RecentlySharedCard.js';
import { SuggestedFilesStrip } from './home/SuggestedFilesStrip.js';
import { CreateFolderModal } from './modals/CreateFolderModal.js';
import { RenameModal } from './modals/RenameModal.js';
import { ShareModal } from './modals/ShareModal.js';
import { MoveToModal } from './modals/MoveToModal.js';
import { DeleteConfirmModal } from './modals/DeleteConfirmModal.js';
import { FolderCard } from './components/FolderCard.js';
import { Lightbox } from './components/Lightbox.js';
import type { FileMenuHandlers } from './components/FileMenu.js';

// ── Greeting based on time of day ──────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {children}
      </span>
      {action}
    </div>
  );
}

// ── Quick-action pill button ───────────────────────────────────────────────
function QuickActionBtn({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="cloud-home-action-btn">
      <span className="cloud-home-action-icon"><Icon name={icon} size={16} /></span>
      <span className="cloud-home-action-label">{label}</span>
    </button>
  );
}

export function CloudHome() {
  const {
    files, loading, currentDrive, currentFolderId, openFolder,
    createFolder, uploadFiles, uploadFolder, storageQuota, connections, goToView,
    starItem, trashItem, renameItem, moveItem, shareItem, downloadItem,
  } = useCloud();
  const { user } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  const [lightboxItem, setLightboxItem] = useState<CloudFile | null>(null);
  const liveLightboxItem = lightboxItem ? files.find(f => f.id === lightboxItem.id) ?? lightboxItem : null;

  function openItem(item: CloudFile) {
    if (item.type === 'folder') openFolder(item);
    else setLightboxItem(item);
  }

  const [renameTarget, setRenameTarget] = useState<CloudFile | null>(null);
  const [shareTarget, setShareTarget] = useState<CloudFile | null>(null);
  const [moveTarget, setMoveTarget] = useState<string[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CloudFile | null>(null);

  const menuHandlers: FileMenuHandlers = {
    onOpen: openItem,
    onRename: item => setRenameTarget(item),
    onStar: item => starItem(item.id, !item.starred),
    onDelete: item => setDeleteTarget(item),
    onDownload: item => { if (item.type !== 'folder') downloadItem(item); },
    onShare: item => setShareTarget(item),
    onMove: item => setMoveTarget([item.id]),
    onRestore: () => {},
    onPermanentDelete: () => {},
  };

  if (loading && files.length === 0) {
    return (
      <div className="cloud-home-loading">
        <div className="cloud-home-loading-spinner" />
        <span>Loading your drive…</span>
      </div>
    );
  }

  const displayName = (user as { name?: string } | null)?.name?.split(' ')[0] ?? 'there';
  const activeFiles = files.filter(f => !f.is_trash);
  const recentFiles = [...activeFiles.filter(f => f.type !== 'folder')].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const suggested = recentFiles.slice(0, 10);
  const folders = activeFiles.filter(f => f.type === 'folder').slice(0, 8);

  return (
    <div className="cloud-home-root">

      {/* ── Hero banner ───────────────────────────────────────────────── */}
      <div className="cloud-home-hero">
        <div className="cloud-home-hero-content">
          <div className="cloud-home-hero-text">
            <h1 className="cloud-home-hero-title">
              {getGreeting()}, {displayName} 👋
            </h1>
            <p className="cloud-home-hero-sub">
              {currentDrive?.name ?? 'My Drive'} &nbsp;·&nbsp; {activeFiles.length} item{activeFiles.length === 1 ? '' : 's'}
            </p>
          </div>

          {/* Quick-action strip */}
          <div className="cloud-home-actions">
            <QuickActionBtn icon="upload" label="Upload file" onClick={() => fileInputRef.current?.click()} />
            <QuickActionBtn icon="folder" label="New folder" onClick={() => setShowCreateFolder(true)} />
            <QuickActionBtn icon="clock" label="Recent" onClick={() => goToView('recent')} />
            <QuickActionBtn icon="star" label="Starred" onClick={() => goToView('starred')} />
            <QuickActionBtn icon="users" label="Shared" onClick={() => goToView('shared')} />
          </div>
        </div>

        {/* Decorative blob */}
        <div className="cloud-home-hero-blob" aria-hidden />
      </div>

      {/* ── Main body ─────────────────────────────────────────────────── */}
      <div className="cloud-home-body">

        {/* Quick Access Folders */}
        {folders.length > 0 && (
          <section className="cloud-home-section">
            <SectionLabel
              action={
                <button onClick={() => goToView('all')} className="cloud-home-see-all">
                  See all <Icon name="arrowRight" size={12} />
                </button>
              }
            >
              Quick Access
            </SectionLabel>
            <div className="cloud-home-folders-grid">
              {folders.map(item => (
                <FolderCard
                  key={item.id}
                  item={item}
                  selected={false}
                  isTrashed={false}
                  menuHandlers={menuHandlers}
                  onClick={() => openFolder(item)}
                  onDoubleClick={() => openFolder(item)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Suggested Files */}
        {suggested.length > 0 && (
          <section className="cloud-home-section">
            <SectionLabel
              action={
                <button onClick={() => goToView('recent')} className="cloud-home-see-all">
                  View more <Icon name="arrowRight" size={12} />
                </button>
              }
            >
              Suggested files
            </SectionLabel>
            <SuggestedFilesStrip items={suggested} onOpen={openItem} menuHandlers={menuHandlers} />
          </section>
        )}

        {/* Bottom cards row */}
        <div className="cloud-home-bottom-grid">
          <section className="cloud-home-section">
            <SectionLabel>Storage</SectionLabel>
            <StorageOverviewCards files={activeFiles} quota={storageQuota} />
          </section>
          <section className="cloud-home-section">
            <SectionLabel>Connected storage</SectionLabel>
            <ConnectedStorageCards connections={connections} onOpen={p => goToView(p)} />
          </section>
          <section className="cloud-home-section">
            <SectionLabel>Recently shared</SectionLabel>
            <RecentlySharedCard items={activeFiles} onOpen={openItem} />
          </section>
        </div>
      </div>

      {/* ── Hidden inputs ─────────────────────────────────────────────── */}
      <input
        ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => { const fl = Array.from(e.target.files ?? []); if (fl.length) uploadFiles(fl, currentFolderId); e.target.value = ''; }}
      />
      <input
        ref={folderInputRef} type="file" multiple style={{ display: 'none' }}
        // @ts-expect-error non-standard directory selection attributes
        webkitdirectory="" directory=""
        onChange={e => { const fl = Array.from(e.target.files ?? []); if (fl.length) uploadFolder(fl, currentFolderId); e.target.value = ''; }}
      />

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreate={(name, color) => { createFolder(name, currentFolderId, color); setShowCreateFolder(false); }}
        />
      )}
      {renameTarget && (
        <RenameModal
          item={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={name => { renameItem(renameTarget.id, name); setRenameTarget(null); }}
        />
      )}
      {shareTarget && (
        <ShareModal
          item={shareTarget}
          onClose={() => setShareTarget(null)}
          onSave={shared => shareItem(shareTarget.id, shared)}
        />
      )}
      {moveTarget && (
        <MoveToModal
          ids={moveTarget}
          allItems={activeFiles}
          onClose={() => setMoveTarget(null)}
          onMove={dest => moveTarget.forEach(id => moveItem(id, dest))}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          isTrashView={false}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => { trashItem(deleteTarget.id); setDeleteTarget(null); }}
        />
      )}
      {liveLightboxItem && (
        <Lightbox
          item={liveLightboxItem}
          onClose={() => setLightboxItem(null)}
          onDownload={downloadItem}
          onShare={item => { setLightboxItem(null); setShareTarget(item); }}
          onStar={item => starItem(item.id, !item.starred)}
        />
      )}
    </div>
  );
}
