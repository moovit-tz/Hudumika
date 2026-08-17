import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useCloud, CloudView, CloudDrive, DriveType } from './cloud-context.js';
import { ConnectedAppsModal, STORAGE_PROVIDERS } from './ConnectedAppsModal.js';
import { DriveMembersModal } from './DriveMembersModal.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../components/ui/dropdown-menu.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { fmtSize } from '../pages/cloud/lib/format.js';
import { CATEGORY_EXT, categorizeBytes } from '../pages/cloud/lib/categories.js';
import { CreateFolderModal } from '../pages/cloud/modals/CreateFolderModal.js';

/** Same colour-per-category mapping StorageOverviewCards uses on Home, so
 *  the sidebar widget and the Home dashboard never disagree about which
 *  colour means Documents/Images/Media. */
const CATEGORY_COLOR: Record<'documents' | 'images' | 'media' | 'other', string> = {
  documents: 'var(--green)', images: 'var(--teal)', media: 'var(--blue)', other: 'var(--ink3)',
};

export function CloudSidebarContent({ collapsed }: { collapsed: boolean }) {
  const {
    files, currentView, currentFolderId, goToView,
    createFolder, uploadFiles, uploadFolder, connections, loadConnections,
    drives, currentDriveId, currentDrive, switchDrive, createDrive, renameDrive, deleteDrive,
    storageQuota,
  } = useCloud();
  const navigate = useNavigate();

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showConnectedApps, setShowConnectedApps] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [showCreateDrive, setShowCreateDrive] = useState(false);
  const [newDriveName, setNewDriveName] = useState('');
  const [newDriveType, setNewDriveType] = useState<DriveType>('personal');
  const [renamingDrive, setRenamingDrive] = useState<CloudDrive | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [membersForDrive, setMembersForDrive] = useState<CloudDrive | null>(null);

  const personalDrives = drives.filter(d => d.type === 'personal');
  const sharedDrives = drives.filter(d => d.type === 'shared');

  function handleCreateDrive() {
    if (!newDriveName.trim()) return;
    createDrive(newDriveName.trim(), newDriveType);
    setNewDriveName('');
    setNewDriveType('personal');
    setShowCreateDrive(false);
  }

  function handleRenameDrive() {
    if (!renamingDrive || !renameValue.trim()) return;
    renameDrive(renamingDrive.id, renameValue.trim());
    setRenamingDrive(null);
  }

  async function handleDeleteDrive(drive: CloudDrive) {
    if (drives.length <= 1) { showAlert('You must keep at least one drive.'); return; }
    if ((await showConfirm(`Delete "${drive.name}" and everything in it? This can't be undone.`, { confirmLabel: 'Delete' }))) deleteDrive(drive.id);
  }

  const active  = files.filter(f => !f.is_trash);
  const trashed = files.filter(f => f.is_trash);

  const navItems: { view: CloudView; icon: IconName; label: string }[] = [
    { view: 'all',     icon: 'folder', label: 'My Files' },
    { view: 'recent',  icon: 'clock',  label: 'Recent' },
    { view: 'images',  icon: 'camera', label: 'Photos' },
    { view: 'shared',  icon: 'users',  label: 'Shared' },
    { view: 'trash',   icon: 'trash',  label: 'Recycle bin' },
  ];
  const catItems: { view: CloudView; icon: IconName; label: string; ext: readonly string[] }[] = [
    { view: 'documents', icon: 'fileText', label: 'Documents', ext: CATEGORY_EXT.documents },
    { view: 'images',    icon: 'camera',   label: 'Images',    ext: CATEGORY_EXT.images },
    { view: 'media',     icon: 'monitor',  label: 'Media',     ext: CATEGORY_EXT.media },
  ];

  const breakdown = categorizeBytes(active);
  const used = breakdown.documents.bytes + breakdown.images.bytes + breakdown.media.bytes + breakdown.other.bytes;
  const pct = (n: number) => used > 0 ? Math.round((n / used) * 100) : 0;
  const cats = [
    { label: 'Documents', pct: pct(breakdown.documents.bytes), color: CATEGORY_COLOR.documents },
    { label: 'Images',    pct: pct(breakdown.images.bytes),    color: CATEGORY_COLOR.images },
    { label: 'Media',     pct: pct(breakdown.media.bytes),     color: CATEGORY_COLOR.media },
    { label: 'Other',     pct: pct(breakdown.other.bytes),     color: CATEGORY_COLOR.other },
  ];
  // Real per-tenant quota (packages.storage_limit_bytes) — unlike `used`
  // above (this drive's own category breakdown), storageQuota.used_bytes is
  // computed server-side across every drive in the tenant.
  const quotaPct = storageQuota?.limit_bytes
    ? Math.min(100, Math.round((storageQuota.used_bytes / storageQuota.limit_bytes) * 100))
    : 0;

  // Spacing matches the platform's standard sidebar item (.app-sb-item, e.g. OnePI):
  // 44px row height, 2px vertical / 8px horizontal margin, 14px internal padding.
  const sidebarItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    height: 44, margin: '2px 8px', padding: '0 14px', boxSizing: 'border-box',
    borderRadius: 'var(--r)', cursor: 'pointer',
    color: isActive ? 'var(--teal)' : 'var(--ink2)', fontWeight: isActive ? 600 : 400,
    background: isActive ? 'var(--teal-l)' : 'transparent', fontSize: 'var(--text-base)', transition: 'background .1s, color .1s',
    userSelect: 'none',
  });

  return (
    <>
      {/* Drive / workspace picker */}
      <div style={{ padding: '16px 16px 0', position: 'relative' }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={collapsed ? (currentDrive?.name ?? 'Drives') : undefined}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                padding: collapsed ? '8px' : '8px 10px', cursor: 'pointer',
                fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--ink)',
              }}
            >
              <Icon name={currentDrive?.type === 'shared' ? 'users' : 'folder'} size={15} color="var(--teal)" />
              {!collapsed && <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentDrive?.name ?? 'My Drive'}</span>}
              {!collapsed && <Icon name="chevronDown" size={13} color="var(--ink3)" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-[360px] overflow-y-auto">
            <DropdownMenuLabel>My Drives</DropdownMenuLabel>
            {personalDrives.map(d => (
              <DropdownMenuItem key={d.id} onClick={() => switchDrive(d.id)}
                className={d.id === currentDriveId ? 'bg-accent text-accent-foreground' : ''}>
                <Icon name="folder" size={14} color={d.id === currentDriveId ? 'var(--teal)' : 'var(--ink3)'} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Drive actions"
                      onClick={e => e.stopPropagation()}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink3)' }}
                    ><Icon name="moreHorizontal" size={14} /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setRenamingDrive(d); setRenameValue(d.name); }}>
                      <Icon name="edit" size={14} color="var(--ink3)" /> Rename
                    </DropdownMenuItem>
                    {d.type === 'shared' && (
                      <DropdownMenuItem onClick={() => setMembersForDrive(d)}>
                        <Icon name="userPlus" size={14} color="var(--ink3)" /> Manage members
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDeleteDrive(d)} className="text-destructive focus:text-destructive">
                      <Icon name="trash" size={14} /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DropdownMenuItem>
            ))}

            <DropdownMenuLabel>Shared Drives</DropdownMenuLabel>
            {sharedDrives.length === 0 && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink3)', padding: '4px 14px 8px' }}>None yet</div>
            )}
            {sharedDrives.map(d => (
              <DropdownMenuItem key={d.id} onClick={() => switchDrive(d.id)}
                className={d.id === currentDriveId ? 'bg-accent text-accent-foreground' : ''}>
                <Icon name="users" size={14} color={d.id === currentDriveId ? 'var(--teal)' : 'var(--ink3)'} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Drive actions"
                      onClick={e => e.stopPropagation()}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink3)' }}
                    ><Icon name="moreHorizontal" size={14} /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setRenamingDrive(d); setRenameValue(d.name); }}>
                      <Icon name="edit" size={14} color="var(--ink3)" /> Rename
                    </DropdownMenuItem>
                    {d.type === 'shared' && (
                      <DropdownMenuItem onClick={() => setMembersForDrive(d)}>
                        <Icon name="userPlus" size={14} color="var(--ink3)" /> Manage members
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDeleteDrive(d)} className="text-destructive focus:text-destructive">
                      <Icon name="trash" size={14} /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowCreateDrive(true)} className="text-primary font-semibold">
              <Icon name="plus" size={14} color="var(--teal)" /> Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* "+ New" button */}
      <div style={{ padding: '12px 16px 8px', position: 'relative' }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={collapsed ? 'New' : undefined}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'var(--white)', border: '1px solid var(--border)', borderRadius:'var(--badge-radius)',
                padding: collapsed ? '10px' : '10px 20px', cursor: 'pointer', boxShadow: 'var(--elev-sm)',
                fontSize:'var(--text-md)', fontWeight: 600, color: 'var(--ink)',
              }}
            >
              <Icon name="plus" size={18} color="var(--teal)" /> {!collapsed && <>New <Icon name="chevronDown" size={13} color="var(--ink3)" /></>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setShowCreateFolder(true)}>
              <Icon name="folder" size={15} color="#f59e0b" /> New folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={15} color="var(--teal)" /> File upload
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
              <Icon name="folder" size={15} color="var(--teal)" /> Folder upload
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => {
            const fl = Array.from(e.target.files ?? []);
            if (fl.length) uploadFiles(fl, currentFolderId);
            e.target.value = '';
          }}
        />
        <input
          ref={folderInputRef} type="file" multiple style={{ display: 'none' }}
          // @ts-expect-error non-standard attributes needed for directory selection
          webkitdirectory="" directory=""
          onChange={e => {
            const fl = Array.from(e.target.files ?? []);
            if (fl.length) uploadFolder(fl, currentFolderId);
            e.target.value = '';
          }}
        />
      </div>

      {/* Main nav */}
      <div style={{ padding: '8px 0 0' }}>
        {navItems.map(n => (
          <div key={n.view}
            style={sidebarItemStyle(currentView === n.view)}
            title={collapsed ? n.label : undefined}
            onClick={() => { navigate('/cloud'); goToView(n.view); }}
            onMouseEnter={e => { if (currentView !== n.view) e.currentTarget.style.background = 'var(--bg)'; }}
            onMouseLeave={e => { if (currentView !== n.view) e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name={n.icon} size={15} color={currentView === n.view ? 'var(--teal)' : 'var(--ink3)'} />
            {!collapsed && <span>{n.label}</span>}
            {!collapsed && n.view === 'trash' && trashed.length > 0 && <span style={{ marginLeft: 'auto', fontSize:'var(--text-xs)', color: 'var(--ink3)' }}>{trashed.length}</span>}
          </div>
        ))}
      </div>

      {!collapsed && (
        <div style={{ fontSize:'var(--text-xs)', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 12px 6px' }}>Storage</div>
      )}
      <div style={{ padding: collapsed ? '8px 0 0' : 0 }}>
        {STORAGE_PROVIDERS.map(p => {
          const conn = connections.find(c => c.provider === p.id);
          const isConnected = conn?.status === 'connected';
          const isActive = currentView === p.id;
          return (
            <div key={p.id}
              style={sidebarItemStyle(isActive)}
              title={collapsed ? p.name : undefined}
              onClick={() => { navigate('/cloud'); goToView(p.id); }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name={p.icon} size={15} color={isActive ? 'var(--teal)' : p.color} />
              {!collapsed && <span>{p.name}</span>}
              {!collapsed && (
                <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius:'var(--badge-radius)', background: isConnected ? '#188038' : 'var(--border)' }} />
              )}
            </div>
          );
        })}
        <div
          style={sidebarItemStyle(false)}
          title={collapsed ? 'Connected Apps' : undefined}
          onClick={() => setShowConnectedApps(true)}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Icon name="puzzle" size={15} color="var(--ink3)" />
          {!collapsed && <span>Manage connections</span>}
        </div>
      </div>

      {showConnectedApps && <ConnectedAppsModal onClose={() => setShowConnectedApps(false)} />}

      {!collapsed && (
        <>
          {/* Categories */}
          <div style={{ padding: '16px 8px 0' }}>
            <div style={{ fontSize:'var(--text-xs)', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 4px', marginBottom: 6 }}>Categories</div>
            {catItems.map(c => (
              <div key={c.view}
                style={sidebarItemStyle(currentView === c.view)}
                onClick={() => { navigate('/cloud'); goToView(c.view); }}
                onMouseEnter={e => { if (currentView !== c.view) e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if (currentView !== c.view) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name={c.icon} size={15} color={currentView === c.view ? 'var(--teal)' : 'var(--ink3)'} />
                <span>{c.label}</span>
                <span style={{ marginLeft: 'auto', fontSize:'var(--text-xs)', color: 'var(--ink3)' }}>
                  {active.filter(i => c.ext.includes(i.type)).length}
                </span>
              </div>
            ))}
          </div>

          {/* Storage bar — real per-tenant quota, not a fabricated total */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
            <div style={{ fontSize:'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Storage Used</div>
            {storageQuota?.limit_bytes != null && (
              <div style={{ height: 6, borderRadius:'var(--badge-radius)', background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${quotaPct}%`, height: '100%', background: quotaPct >= 90 ? 'var(--red)' : 'var(--teal)', borderRadius:'var(--badge-radius)', transition: 'width .3s' }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize:'var(--text-xs)', color: 'var(--ink3)', marginBottom: 12 }}>
              <span>{storageQuota ? fmtSize(storageQuota.used_bytes) : '—'} used</span>
              <span>{storageQuota?.limit_bytes != null ? fmtSize(storageQuota.limit_bytes) : 'Unlimited'}</span>
            </div>
            {used > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cats.filter(c => c.pct > 0).map(c => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius:'var(--badge-radius)', background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize:'var(--text-xs)', color: 'var(--ink3)', flex: 1 }}>{c.label}</span>
                    <span style={{ fontSize:'var(--text-xs)', fontWeight: 600, color: 'var(--ink)' }}>{c.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreate={(name, color) => { createFolder(name, currentFolderId, color); setShowCreateFolder(false); }}
        />
      )}

      {/* Create Workspace (Drive) Modal */}
      {showCreateDrive && (
        <div className="modal-overlay" onClick={() => setShowCreateDrive(false)}>
          <div className="card" style={{ width: 400, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink)' }}>Create Workspace</span>
              <button onClick={() => setShowCreateDrive(false)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Name *</label>
              <input
                autoFocus
                value={newDriveName}
                onChange={e => setNewDriveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateDrive(); }}
                placeholder="e.g. Finance Team"
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setNewDriveType('personal')}
                  className={newDriveType === 'personal' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  style={{ flex: 1 }}
                ><Icon name="folder" size={13} /> Personal</button>
                <button
                  onClick={() => setNewDriveType('shared')}
                  className={newDriveType === 'shared' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  style={{ flex: 1 }}
                ><Icon name="users" size={13} /> Shared</button>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink3)', margin: '8px 0 0' }}>
                {newDriveType === 'shared'
                  ? 'A shared drive has its own member list with roles, separate from your personal drives.'
                  : 'A personal drive is your own — you can still share individual files or folders from it.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateDrive(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleCreateDrive} className="btn btn-primary btn-sm" disabled={!newDriveName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Drive Modal */}
      {renamingDrive && (
        <div className="modal-overlay" onClick={() => setRenamingDrive(null)}>
          <div className="card" style={{ width: 380, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink)' }}>Rename Drive</span>
              <button onClick={() => setRenamingDrive(null)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameDrive(); }}
              className="input-field"
              style={{ width: '100%', marginBottom: 20 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setRenamingDrive(null)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleRenameDrive} className="btn btn-primary btn-sm" disabled={!renameValue.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {membersForDrive && (
        <DriveMembersModal driveId={membersForDrive.id} driveName={membersForDrive.name} onClose={() => setMembersForDrive(null)} />
      )}
    </>
  );
}
