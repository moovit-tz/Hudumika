import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useCloud, CloudView, CloudDrive, DriveType } from './cloud-context.js';
import { ConnectedAppsModal, STORAGE_PROVIDERS } from './ConnectedAppsModal.js';
import { DriveMembersModal } from './DriveMembersModal.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../components/ui/dropdown-menu.js';

const GD_BLUE  = '#1a73e8';
const GD_BLUE_L = '#e8f0fe';
const GD_HOVER  = '#f1f3f4';

const STORAGE_TOTAL = 100 * 1_073_741_824;

function fmtSize(b?: number | null): string {
  if (!b) return '0 GB';
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024)          return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

const DOC_EXT   = ['pdf','docx','doc','xlsx','xls','csv','pptx','txt','xml'];
const IMAGE_EXT = ['png','jpg','jpeg','gif','webp'];
const MEDIA_EXT = ['mp4','mp3','mov','avi','wav'];

const FOLDER_COLORS = ['#f59e0b','#3b82f6','#22c55e','#a855f7','#0891b2','#ef4444','#f97316','#6366f1'];

export function CloudSidebarContent({ collapsed }: { collapsed: boolean }) {
  const {
    files, currentView, currentFolderId, goToView,
    createFolder, uploadFiles, uploadFolder, connections, loadConnections,
    drives, currentDriveId, currentDrive, switchDrive, createDrive, renameDrive, deleteDrive,
  } = useCloud();

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showConnectedApps, setShowConnectedApps] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
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

  function handleDeleteDrive(drive: CloudDrive) {
    if (drives.length <= 1) { alert('You must keep at least one drive.'); return; }
    if (confirm(`Delete "${drive.name}" and everything in it? This can't be undone.`)) deleteDrive(drive.id);
  }

  const active  = files.filter(f => !f.is_trash);
  const trashed = files.filter(f => f.is_trash);

  const navItems: { view: CloudView; icon: IconName; label: string }[] = [
    { view: 'all',    icon: 'folder', label: currentDrive?.name ?? 'My Drive' },
    { view: 'recent', icon: 'clock',  label: 'Recent' },
    { view: 'starred', icon: 'star',  label: 'Starred' },
    { view: 'shared', icon: 'users',  label: 'Shared with Me' },
    { view: 'trash',  icon: 'trash',  label: 'Trash' },
  ];
  const catItems: { view: CloudView; icon: IconName; label: string; ext: string[] }[] = [
    { view: 'documents', icon: 'fileText', label: 'Documents', ext: DOC_EXT },
    { view: 'images',    icon: 'camera',   label: 'Images',    ext: IMAGE_EXT },
    { view: 'media',     icon: 'monitor',  label: 'Media',     ext: MEDIA_EXT },
  ];

  const used = active.filter(f => f.type !== 'folder').reduce((sum, f) => sum + (f.size || 0), 0);
  const docSize   = active.filter(f => DOC_EXT.includes(f.type)).reduce((s, f) => s + (f.size || 0), 0);
  const imgSize   = active.filter(f => IMAGE_EXT.includes(f.type)).reduce((s, f) => s + (f.size || 0), 0);
  const mediaSize = active.filter(f => MEDIA_EXT.includes(f.type)).reduce((s, f) => s + (f.size || 0), 0);
  const otherSize = Math.max(0, used - docSize - imgSize - mediaSize);
  const pct = (n: number) => used > 0 ? Math.round((n / used) * 100) : 0;
  const cats = [
    { label: 'Documents', pct: pct(docSize),   color: GD_BLUE },
    { label: 'Images',    pct: pct(imgSize),   color: '#a855f7' },
    { label: 'Media',     pct: pct(mediaSize), color: '#f97316' },
    { label: 'Other',     pct: pct(otherSize), color: 'var(--ink3)' },
  ];
  const usedPct = Math.min(100, Math.round((used / STORAGE_TOTAL) * 100));

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim(), currentFolderId, newFolderColor);
    setNewFolderName('');
    setNewFolderColor(FOLDER_COLORS[0]);
    setShowCreateFolder(false);
  }

  // Spacing matches the platform's standard sidebar item (.app-sb-item, e.g. OnePI):
  // 44px row height, 2px vertical / 8px horizontal margin, 14px internal padding.
  const sidebarItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    height: 44, margin: '2px 8px', padding: '0 14px', boxSizing: 'border-box',
    borderRadius: 'var(--r)', cursor: 'pointer',
    color: isActive ? GD_BLUE : 'var(--ink2)', fontWeight: isActive ? 600 : 400,
    background: isActive ? GD_BLUE_L : 'transparent', fontSize:'var(--text-base)', transition: 'background .1s, color .1s',
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
              <Icon name={currentDrive?.type === 'shared' ? 'users' : 'folder'} size={15} color={GD_BLUE} />
              {!collapsed && <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentDrive?.name ?? 'My Drive'}</span>}
              {!collapsed && <Icon name="chevronDown" size={13} color="var(--ink3)" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-[360px] overflow-y-auto">
            <DropdownMenuLabel>My Drives</DropdownMenuLabel>
            {personalDrives.map(d => (
              <DropdownMenuItem key={d.id} onClick={() => switchDrive(d.id)}
                className={d.id === currentDriveId ? 'bg-accent text-accent-foreground' : ''}>
                <Icon name="folder" size={14} color={d.id === currentDriveId ? GD_BLUE : 'var(--ink3)'} />
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
                <Icon name="users" size={14} color={d.id === currentDriveId ? GD_BLUE : 'var(--ink3)'} />
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
              <Icon name="plus" size={14} color={GD_BLUE} /> Create workspace
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
                padding: collapsed ? '10px' : '10px 20px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.12)',
                fontSize:'var(--text-md)', fontWeight: 600, color: 'var(--ink)',
              }}
            >
              <Icon name="plus" size={18} color={GD_BLUE} /> {!collapsed && <>New <Icon name="chevronDown" size={13} color="var(--ink3)" /></>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setShowCreateFolder(true)}>
              <Icon name="folder" size={15} color="#f59e0b" /> New folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={15} color={GD_BLUE} /> File upload
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
              <Icon name="folder" size={15} color={GD_BLUE} /> Folder upload
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
            onClick={() => goToView(n.view)}
            onMouseEnter={e => { if (currentView !== n.view) e.currentTarget.style.background = GD_HOVER; }}
            onMouseLeave={e => { if (currentView !== n.view) e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name={n.icon} size={15} color={currentView === n.view ? GD_BLUE : 'var(--ink3)'} />
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
              onClick={() => goToView(p.id)}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = GD_HOVER; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name={p.icon} size={15} color={isActive ? GD_BLUE : p.color} />
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
          onMouseEnter={e => (e.currentTarget.style.background = GD_HOVER)}
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
                onClick={() => goToView(c.view)}
                onMouseEnter={e => { if (currentView !== c.view) e.currentTarget.style.background = GD_HOVER; }}
                onMouseLeave={e => { if (currentView !== c.view) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name={c.icon} size={15} color={currentView === c.view ? GD_BLUE : 'var(--ink3)'} />
                <span>{c.label}</span>
                <span style={{ marginLeft: 'auto', fontSize:'var(--text-xs)', color: 'var(--ink3)' }}>
                  {active.filter(i => c.ext.includes(i.type)).length}
                </span>
              </div>
            ))}
          </div>

          {/* Storage bar */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
            <div style={{ fontSize:'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Storage Used</div>
            <div style={{ height: 6, borderRadius:'var(--badge-radius)', background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ width: `${usedPct}%`, height: '100%', background: GD_BLUE, borderRadius:'var(--badge-radius)', transition: 'width .3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize:'var(--text-xs)', color: 'var(--ink3)', marginBottom: 12 }}>
              <span>{fmtSize(used)} used</span>
              <span>{fmtSize(STORAGE_TOTAL)} total</span>
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
        <div className="modal-overlay" onClick={() => setShowCreateFolder(false)}>
          <div className="card" style={{ width: 400, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize:'var(--text-lg)', fontWeight: 700, color: 'var(--ink)' }}>New Folder</span>
              <button onClick={() => setShowCreateFolder(false)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize:'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Folder Name *</label>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
                placeholder="Enter folder name…"
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize:'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>Color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {FOLDER_COLORS.map(c => (
                  <button key={c} onClick={() => setNewFolderColor(c)} style={{ width: 26, height: 26, borderRadius:'var(--badge-radius)', background: c, border: newFolderColor === c ? '3px solid var(--ink)' : '2px solid transparent', cursor: 'pointer', transition: 'border .1s', outline: 'none' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateFolder(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleCreateFolder} className="btn btn-primary btn-sm" disabled={!newFolderName.trim()}>Create Folder</button>
            </div>
          </div>
        </div>
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
