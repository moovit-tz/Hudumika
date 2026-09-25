import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCloud, CloudView, CloudDrive } from './cloud-context.js';
import { useCloudStrings } from '../pages/cloud/locale/index.js';
import { ConnectedAppsModal, STORAGE_PROVIDERS } from './ConnectedAppsModal.js';
import { DriveMembersModal } from './DriveMembersModal.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../components/ui/dropdown-menu.js';
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

const COMPLIANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

export function CloudSidebarContent({ collapsed }: { collapsed: boolean }) {
  const t = useCloudStrings();
  const { user } = useAuth();
  const isAdmin = COMPLIANCE_ROLES.includes((user as any)?.role ?? '');
  const {
    files, currentView, currentFolderId, goToView,
    createFolder, uploadFiles, uploadFolder, connections, loadConnections,
    drives, currentDriveId, currentDrive, switchDrive, createDrive, renameDrive, deleteDrive,
    storageQuota,
  } = useCloud();
  const navigate = useNavigate();
  const location = useLocation();
  const onHome = location.pathname.replace(/\/$/, '') === '/cloud';

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showConnectedApps, setShowConnectedApps] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [showCreateDrive, setShowCreateDrive] = useState(false);
  const [newDriveName, setNewDriveName] = useState('');
  const [renamingDrive, setRenamingDrive] = useState<CloudDrive | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [membersForDrive, setMembersForDrive] = useState<CloudDrive | null>(null);

  const personalDrives = drives.filter(d => d.type === 'personal');
  const sharedDrives = drives.filter(d => d.type === 'shared');
  const businessDrives = drives.filter(d => d.type === 'business');

  function handleCreateDrive() {
    if (!newDriveName.trim()) return;
    createDrive(newDriveName.trim());
    setNewDriveName('');
    setShowCreateDrive(false);
  }

  function handleRenameDrive() {
    if (!renamingDrive || !renameValue.trim()) return;
    renameDrive(renamingDrive.id, renameValue.trim());
    setRenamingDrive(null);
  }

  // Personal and Business Records drives are system-managed and the API
  // flatly refuses to delete either — not offered as an option at all,
  // rather than letting someone click Delete and land on an error toast.
  async function handleDeleteDrive(drive: CloudDrive) {
    if ((await showConfirm(`Delete "${drive.name}" and everything in it? This can't be undone.`, { confirmLabel: 'Delete' }))) deleteDrive(drive.id);
  }

  const active  = files.filter(f => !f.is_trash);
  const trashed = files.filter(f => f.is_trash);

  // 'images'/'documents'/'media' deliberately live only in catItems below —
  // this used to also carry a "Photos" entry for the same 'images' view,
  // so two sidebar rows lit up together and did the exact same navigation.
  // 'starred' is a real CloudView (FileBrowser.tsx already filters on it)
  // that had no sidebar entry at all — reachable only from BrowserToolbar's
  // now-removed duplicate filter-chip row, i.e. not reachable from the
  // sidebar in its collapsed state. Added here so it has exactly one home.
  const navItems: { view: CloudView; icon: IconName; labelKey: string }[] = [
    { view: 'all',     icon: 'folder', labelKey: 'sidebar.myFiles' },
    { view: 'recent',  icon: 'clock',  labelKey: 'sidebar.recent' },
    { view: 'starred', icon: 'star',   labelKey: 'sidebar.starred' },
    { view: 'shared',  icon: 'users',  labelKey: 'sidebar.shared' },
    { view: 'trash',   icon: 'trash',  labelKey: 'sidebar.trash' },
  ];
  const catItems: { view: CloudView; icon: IconName; labelKey: string; ext: readonly string[] }[] = [
    { view: 'documents', icon: 'fileText', labelKey: 'sidebar.documents', ext: CATEGORY_EXT.documents },
    { view: 'images',    icon: 'camera',   labelKey: 'sidebar.images',    ext: CATEGORY_EXT.images },
    { view: 'media',     icon: 'monitor',  labelKey: 'sidebar.media',     ext: CATEGORY_EXT.media },
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

  const sbCls = (isActive: boolean) => `csb-item${isActive ? ' csb-item--active' : ''}`;

  return (
    <>
      {/* Drive / workspace picker */}
      <div className="csb-drive-picker">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`csb-drive-btn${collapsed ? ' csb-drive-btn--collapsed' : ''}`}
              title={collapsed ? (currentDrive?.name ?? t('sidebar.drives.myDrive')) : undefined}
            >
              <Icon name={currentDrive?.type === 'shared' ? 'users' : 'folder'} size={15} color="var(--teal)" />
              {!collapsed && <span className="csb-drive-btn-name">{currentDrive?.name ?? t('sidebar.drives.myDrive')}</span>}
              {!collapsed && <Icon name="chevronDown" size={13} color="var(--ink3)" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-[360px] overflow-y-auto">
            <DropdownMenuLabel>{t('sidebar.drives.myDrive')}</DropdownMenuLabel>
            {personalDrives.map(d => (
              <DropdownMenuItem key={d.id} onClick={() => switchDrive(d.id)}
                className={d.id === currentDriveId ? 'bg-accent text-accent-foreground' : ''}>
                <Icon name="folder" size={14} color={d.id === currentDriveId ? 'var(--teal)' : 'var(--ink3)'} />
                <span className="csb-drive-name">{d.name}</span>
                {/* Private — only its owner ever sees this entry at all
                    (GET /v1/drives scopes personal drives to owner_id), so
                    no rename/delete menu is needed beyond what's already
                    reachable elsewhere; system-managed, never deletable. */}
                <button
                  title={t('sidebar.drives.rename')}
                  onClick={e => { e.stopPropagation(); setRenamingDrive(d); setRenameValue(d.name); }}
                  className="csb-icon-btn"
                ><Icon name="edit" size={13} /></button>
              </DropdownMenuItem>
            ))}

            {businessDrives.length > 0 && (
              <>
                <DropdownMenuLabel>{t('sidebar.drives.biz')}</DropdownMenuLabel>
                {businessDrives.map(d => (
                  <DropdownMenuItem key={d.id} onClick={() => switchDrive(d.id)}
                    className={d.id === currentDriveId ? 'bg-accent text-accent-foreground' : ''}>
                    <Icon name="briefcase" size={14} color={d.id === currentDriveId ? 'var(--teal)' : 'var(--ink3)'} />
                    <span className="csb-drive-name">{d.name}</span>
                    <span className="csb-drive-meta">{t('sidebar.drives.sharedAll')}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}

            <DropdownMenuLabel>{t('sidebar.drives.shared')}</DropdownMenuLabel>
            {sharedDrives.length === 0 && (
              <div className="csb-drive-empty">{t('sidebar.drives.nonYet')}</div>
            )}
            {sharedDrives.map(d => (
              <DropdownMenuItem key={d.id} onClick={() => switchDrive(d.id)}
                className={d.id === currentDriveId ? 'bg-accent text-accent-foreground' : ''}>
                <Icon name="users" size={14} color={d.id === currentDriveId ? 'var(--teal)' : 'var(--ink3)'} />
                <span className="csb-drive-name">{d.name}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Drive actions"
                      onClick={e => e.stopPropagation()}
                      className="csb-icon-btn"
                    ><Icon name="moreHorizontal" size={14} /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setRenamingDrive(d); setRenameValue(d.name); }}>
                      <Icon name="edit" size={14} color="var(--ink3)" /> {t('sidebar.drives.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMembersForDrive(d)}>
                      <Icon name="userPlus" size={14} color="var(--ink3)" /> {t('sidebar.drives.members')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDeleteDrive(d)} className="text-destructive focus:text-destructive">
                      <Icon name="trash" size={14} /> {t('sidebar.drives.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowCreateDrive(true)} className="text-primary font-semibold">
              <Icon name="plus" size={14} color="var(--teal)" /> {t('sidebar.drives.create')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* "+ New" button */}
      <div className="csb-new-btn-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`csb-new-btn${collapsed ? ' csb-new-btn--collapsed' : ''}`}
              title={collapsed ? t('sidebar.newButton') : undefined}
            >
              <Icon name="plus" size={18} color="var(--teal)" />
              {!collapsed && <>{t('sidebar.newButton')} <Icon name="chevronDown" size={13} color="var(--ink3)" /></>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setShowCreateFolder(true)}>
              <Icon name="folder" size={15} color="#f59e0b" /> {t('sidebar.newFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={15} color="var(--teal)" /> {t('sidebar.fileUpload')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
              <Icon name="folder" size={15} color="var(--teal)" /> {t('sidebar.folderUpload')}
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
      <div className="csb-nav">
        <button
          type="button"
          className={`${sbCls(onHome)} csb-item--full`}
          title={collapsed ? t('sidebar.home') : undefined}
          onClick={() => navigate('/cloud')}
          aria-label={t('sidebar.home')}
          aria-current={onHome ? 'page' : undefined}
        >
          <Icon name="home" size={15} color={onHome ? 'var(--teal)' : 'var(--ink3)'} />
          {!collapsed && <span>{t('sidebar.home')}</span>}
        </button>
        {navItems.map(n => {
          const isActive = !onHome && currentView === n.view;
          const label = t(n.labelKey);
          const path = n.view === 'all' ? '/cloud/files' : `/cloud/${n.view}`;
          return (
            <button
              type="button"
              key={n.view}
              className={`${sbCls(isActive)} csb-item--full`}
              title={collapsed ? label : undefined}
              onClick={() => { navigate(path); goToView(n.view); }}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon name={n.icon} size={15} color={isActive ? 'var(--teal)' : 'var(--ink3)'} />
              {!collapsed && <span>{label}</span>}
              {!collapsed && n.view === 'trash' && trashed.length > 0 && <span className="csb-item-count">{trashed.length}</span>}
            </button>
          );
        })}
        {isAdmin && (() => {
          const isActive = location.pathname === '/cloud/compliance';
          const label = t('sidebar.compliance');
          return (
            <button
              type="button"
              key="compliance"
              className={`${sbCls(isActive)} csb-item--full`}
              title={collapsed ? label : undefined}
              onClick={() => navigate('/cloud/compliance')}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon name="shieldOff" size={15} color={isActive ? 'var(--teal)' : 'var(--ink3)'} />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })()}
      </div>

      {!collapsed && <div className="csb-section-hdr">{t('sidebar.storage')}</div>}
      <div className={collapsed ? 'csb-nav' : undefined}>
        {STORAGE_PROVIDERS.map(p => {
          const conn = connections.find(c => c.provider === p.id);
          const isConnected = conn?.status === 'connected';
          const isReal = conn?.supported === true;
          const isActive = !onHome && currentView === p.id;
          if (!isReal && !isConnected) return null;
          return (
            <button
              type="button"
              key={p.id}
              className={`${sbCls(isActive)} csb-item--full`}
              title={collapsed ? p.name : undefined}
              onClick={() => { navigate('/cloud/files'); goToView(p.id); }}
              aria-label={p.name}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon name={p.icon} size={15} color={isActive ? 'var(--teal)' : p.color} />
              {!collapsed && <span>{p.name}</span>}
              {!collapsed && <span className={`csb-conn-dot${isConnected ? ' csb-conn-dot--on' : ''}`} />}
            </button>
          );
        })}
        <button
          type="button"
          className={`${sbCls(false)} csb-item--full`}
          title={collapsed ? t('sidebar.connections') : undefined}
          onClick={() => setShowConnectedApps(true)}
          aria-label={t('sidebar.connections')}
        >
          <Icon name="puzzle" size={15} color="var(--ink3)" />
          {!collapsed && <span>{t('sidebar.connections')}</span>}
        </button>
      </div>

      {showConnectedApps && <ConnectedAppsModal onClose={() => setShowConnectedApps(false)} />}

      {!collapsed && (
        <>
          {/* Categories */}
          <div className="csb-categories">
            <div className="csb-section-hdr csb-section-hdr--inline">{t('sidebar.categories')}</div>
            {catItems.map(c => {
              const label = t(c.labelKey);
              return (
                <button
                  type="button"
                  key={c.view}
                  className={`${sbCls(currentView === c.view)} csb-item--full`}
                  onClick={() => { navigate('/cloud/files'); goToView(c.view); }}
                  aria-label={label}
                  aria-current={currentView === c.view ? 'page' : undefined}
                >
                  <Icon name={c.icon} size={15} color={currentView === c.view ? 'var(--teal)' : 'var(--ink3)'} />
                  <span>{label}</span>
                  <span className="csb-item-count">{active.filter(i => c.ext.includes(i.type)).length}</span>
                </button>
              );
            })}
          </div>

          {/* Storage bar — real per-tenant quota, not a fabricated total */}
          <div className="csb-storage-bar">
            <div className="csb-storage-bar-title">{t('sidebar.storageUsed')}</div>
            {storageQuota?.limit_bytes != null && (
              <div className="csb-storage-track">
                <div
                  className="csb-storage-fill"
                  style={{
                    width: `${quotaPct}%`,
                    background: storageQuota.level === 'high' || storageQuota.level === 'critical' || storageQuota.level === 'exceeded'
                      ? 'var(--red)' : storageQuota.level === 'warning' ? 'var(--gold)' : 'var(--teal)',
                  }}
                />
              </div>
            )}
            <div className="csb-storage-meta">
              <span>{t('sidebar.used', { used: storageQuota ? fmtSize(storageQuota.used_bytes) : '—' })}</span>
              <span>{storageQuota?.limit_bytes != null ? fmtSize(storageQuota.limit_bytes) : t('sidebar.unlimited')}</span>
            </div>
            {storageQuota && storageQuota.level !== 'ok' && (
              <div className={`csb-storage-warn${storageQuota.level === 'warning' ? '' : ' csb-storage-warn--crit'}`}>
                {storageQuota.level === 'exceeded'
                  ? 'Storage full — uploads are blocked. Free up space or upgrade.'
                  : `${quotaPct}% of your storage is used${storageQuota.level === 'warning' ? '.' : ' — running out soon.'}`}
                {' '}
                <button type="button" onClick={() => navigate('/workspace/billing')} className="csb-storage-buy-btn">
                  {t('sidebar.buyStorage')}
                </button>
              </div>
            )}
            {used > 0 && (
              <div className="csb-storage-legend">
                {cats.filter(c => c.pct > 0).map(c => (
                  <div key={c.label} className="csb-storage-legend-row">
                    <span className="csb-legend-dot" style={{ background: c.color }} />
                    <span className="csb-legend-label">{c.label}</span>
                    <span className="csb-legend-pct">{c.pct}%</span>
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
          onCreate={(name, color) => createFolder(name, currentFolderId, color)}
        />
      )}

      {/* Create Workspace (Drive) Modal */}
      {showCreateDrive && (
        <div className="modal-overlay" onClick={() => setShowCreateDrive(false)}>
          <div className="card" style={{ width: 400, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div className="csb-modal-hdr">
              <span className="csb-modal-title">Create Workspace</span>
              <button onClick={() => setShowCreateDrive(false)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <div className="csb-modal-field">
              <label className="csb-modal-label">Name *</label>
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
            <p className="csb-modal-hint">
              A shared drive has its own member list with roles, separate from your own Drive. Your personal
              drive and the tenant's Business Records are both created automatically — this always creates a
              new shared drive.
            </p>
            <div className="csb-modal-actions">
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
            <div className="csb-modal-hdr">
              <span className="csb-modal-title">Rename Drive</span>
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
            <div className="csb-modal-actions">
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
