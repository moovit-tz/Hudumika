import React, { useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useCloud, type CloudFile } from '../../shells/cloud-context.js';
import { QuickCreateTiles } from './home/QuickCreateTiles.js';
import { StorageOverviewCards } from './home/StorageOverviewCards.js';
import { ConnectedStorageCards } from './home/ConnectedStorageCards.js';
import { RecentlySharedCard } from './home/RecentlySharedCard.js';
import { SuggestedFilesStrip } from './home/SuggestedFilesStrip.js';
import { CreateFolderModal } from './modals/CreateFolderModal.js';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: 'var(--font)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>
      {children}
    </h2>
  );
}

export function CloudHome() {
  const {
    files, loading, currentDrive, currentFolderId, openFolder, setPreviewItemId,
    createFolder, uploadFiles, uploadFolder, storageQuota, connections, goToView,
  } = useCloud();
  const { user } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  function openItem(item: CloudFile) {
    if (item.type === 'folder') openFolder(item);
    else setPreviewItemId(item.id);
  }

  if (loading && files.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink3)', fontSize: 14.5, fontFamily: 'var(--font)' }}>
        Loading your drive…
      </div>
    );
  }

  const displayName = (user as { name?: string } | null)?.name ?? 'there';
  const activeFiles = files.filter(f => !f.is_trash);
  const suggested = [...activeFiles].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 44px', display: 'flex', flexDirection: 'column', gap: 30, background: 'var(--bg)', minHeight: '100%' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font)', fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          Welcome back, {displayName}
        </h1>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--text-md)', color: 'var(--ink3)', margin: 0 }}>
          {currentDrive?.name ?? 'My Drive'} · {activeFiles.length} item{activeFiles.length === 1 ? '' : 's'}
        </p>
      </div>

      <section>
        <SectionHeading>Quick create</SectionHeading>
        <QuickCreateTiles
          onNewFolder={() => setShowCreateFolder(true)}
          onUploadFiles={() => fileInputRef.current?.click()}
          onUploadFolder={() => folderInputRef.current?.click()}
        />
      </section>

      <section>
        <SectionHeading>Storage</SectionHeading>
        <StorageOverviewCards files={activeFiles} quota={storageQuota} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, alignItems: 'start' }}>
        <section>
          <SectionHeading>Connected storage</SectionHeading>
          <ConnectedStorageCards connections={connections} onOpen={p => goToView(p)} />
        </section>
        <RecentlySharedCard items={activeFiles} onOpen={openItem} />
      </div>

      {suggested.length > 0 && (
        <section>
          <SectionHeading>Suggested</SectionHeading>
          <SuggestedFilesStrip items={suggested} onOpen={openItem} />
        </section>
      )}

      {/* Hidden file inputs for the Quick Create tiles above */}
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

      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreate={(name, color) => { createFolder(name, currentFolderId, color); setShowCreateFolder(false); }}
        />
      )}
    </div>
  );
}
