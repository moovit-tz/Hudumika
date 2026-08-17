import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, apiDownload, apiUploadWithProgress } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

// ── Shared types ───────────────────────────────────────────────────────────

export interface SharedPerson {
  name: string;
  role: 'Viewer' | 'Editor';
  // Real principal behind the share (migration 233) — absent for legacy/
  // free-text shares, which stay display-only. Only 'customer' and
  // 'organization' are ever enforced.
  principal_type?: string | null;
  principal_id?: string | null;
}

export interface CloudFile {
  id: string;
  name: string;
  type: string; // 'folder' or a file extension
  size: number | null;
  file_count: number;
  parent_id: string | null;
  color: string | null;
  description: string | null;
  owner_name: string;
  starred: boolean;
  is_trash: boolean;
  trashed_at: string | null;
  storage_key: string | null;
  mime_type: string | null;
  created_at: string;
  updated_at: string;
  shared: SharedPerson[];
  share_token: string | null;
}

export type StorageProvider = 'box' | 'dropbox' | 'mega' | 'onedrive';

export type CloudView = 'all' | 'recent' | 'starred' | 'shared' | 'trash' | 'documents' | 'images' | 'media' | StorageProvider;

export interface Crumb { id: string | null; name: string }

export interface StorageQuota { used_bytes: number; limit_bytes: number | null }

export interface UploadingFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
}

export interface StorageConnection {
  provider: StorageProvider;
  status: 'connected' | 'disconnected';
  account_label: string | null;
  auto_sync: boolean;
  connected_at: string | null;
  last_synced_at: string | null;
  file_count: number;
  total_size: number;
}

export type DriveType = 'personal' | 'shared';
export type DriveRole = 'manager' | 'content_manager' | 'contributor' | 'commenter' | 'viewer';

export interface CloudDrive {
  id: string;
  name: string;
  type: DriveType;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

export interface DriveMember {
  id: string;
  drive_id: string;
  person_name: string;
  role: DriveRole;
  created_at: string;
}

export interface CloudCtxValue {
  files: CloudFile[];
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  loadData: () => Promise<void>;

  drives: CloudDrive[];
  drivesLoading: boolean;
  currentDriveId: string | null;
  currentDrive: CloudDrive | null;
  loadDrives: () => Promise<void>;
  switchDrive: (driveId: string) => void;
  createDrive: (name: string, type: DriveType) => Promise<void>;
  renameDrive: (id: string, name: string) => Promise<void>;
  deleteDrive: (id: string) => Promise<void>;

  driveMembers: DriveMember[];
  driveMembersLoading: boolean;
  loadDriveMembers: (driveId: string) => Promise<void>;
  addDriveMember: (driveId: string, personName: string, role: DriveRole) => Promise<void>;
  updateDriveMemberRole: (driveId: string, memberId: string, role: DriveRole) => Promise<void>;
  removeDriveMember: (driveId: string, memberId: string) => Promise<void>;

  currentView: CloudView;
  currentFolderId: string | null;
  breadcrumb: Crumb[];
  goToView: (v: CloudView) => void;
  openFolder: (item: CloudFile) => void;
  navToBreadcrumb: (idx: number) => void;

  /** Real per-tenant Cloud storage quota (packages.storage_limit_bytes) —
   *  null while loading, limit_bytes: null within it means unlimited. */
  storageQuota: StorageQuota | null;
  loadStorageQuota: () => Promise<void>;

  previewItemId: string | null;
  setPreviewItemId: (id: string | null) => void;

  search: string;
  setSearch: (q: string) => void;
  /** Real server-side search (GET /v1/files?q=) across every non-trashed
   *  file in the tenant — not just whatever's already loaded for the
   *  current drive/folder. null when there's no active search term. */
  searchResults: CloudFile[] | null;
  searching: boolean;

  createFolder: (name: string, parentId: string | null, color?: string) => Promise<void>;
  uploadFiles: (fileList: File[], parentId: string | null) => Promise<void>;
  uploadFolder: (fileList: File[], parentId: string | null) => Promise<void>;
  /** Real per-file byte progress (XMLHttpRequest upload.onprogress) for
   *  whichever uploadFiles/uploadFolder call is in flight — replaced at the
   *  start of each new batch, dismissible per-file via removeUploadingFile. */
  uploadingFiles: UploadingFile[];
  removeUploadingFile: (id: string) => void;
  renameItem: (id: string, name: string) => Promise<void>;
  starItem: (id: string, starred: boolean) => Promise<void>;
  moveItem: (id: string, parentId: string | null) => Promise<void>;
  trashItem: (id: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;
  permanentlyDelete: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  /** Only the platform SuperAdmin — real or currently impersonating (see
   *  isPlatformSuperAdmin() in the API's rbac.ts) — can forever-delete a
   *  file or empty Trash; everyone else can only move things to Trash. */
  canPermanentlyDelete: boolean;
  shareItem: (id: string, shared: SharedPerson[]) => Promise<{ share_token: string | null }>;
  downloadItem: (item: CloudFile) => Promise<void>;

  connections: StorageConnection[];
  connectionsLoading: boolean;
  loadConnections: () => Promise<void>;
  connectProvider: (provider: StorageProvider, accountLabel: string) => Promise<void>;
  disconnectProvider: (provider: StorageProvider) => Promise<void>;
  syncProvider: (provider: StorageProvider) => Promise<void>;
}

// ── Default no-op context ─────────────────────────────────────────────────

const noop = () => {};
const noopAsync = async () => {};

export const CloudCtx = createContext<CloudCtxValue>({
  files: [],
  loading: false,
  error: null,
  dismissError: noop,
  loadData: noopAsync,
  drives: [],
  drivesLoading: false,
  currentDriveId: null,
  currentDrive: null,
  loadDrives: noopAsync,
  switchDrive: noop,
  createDrive: noopAsync,
  renameDrive: noopAsync,
  deleteDrive: noopAsync,
  driveMembers: [],
  driveMembersLoading: false,
  loadDriveMembers: noopAsync,
  addDriveMember: noopAsync,
  updateDriveMemberRole: noopAsync,
  removeDriveMember: noopAsync,
  currentView: 'all',
  currentFolderId: null,
  breadcrumb: [{ id: null, name: 'My Drive' }],
  goToView: noop,
  openFolder: noop,
  navToBreadcrumb: noop,
  storageQuota: null,
  loadStorageQuota: noopAsync,
  previewItemId: null,
  setPreviewItemId: noop,
  search: '',
  setSearch: noop,
  searchResults: null,
  searching: false,
  createFolder: noopAsync,
  uploadFiles: noopAsync,
  uploadingFiles: [],
  removeUploadingFile: noop,
  uploadFolder: noopAsync,
  renameItem: noopAsync,
  starItem: noopAsync,
  moveItem: noopAsync,
  trashItem: noopAsync,
  restoreItem: noopAsync,
  permanentlyDelete: noopAsync,
  emptyTrash: noopAsync,
  canPermanentlyDelete: false,
  shareItem: async () => ({ share_token: null }),
  downloadItem: noopAsync,
  connections: [],
  connectionsLoading: false,
  loadConnections: noopAsync,
  connectProvider: noopAsync,
  disconnectProvider: noopAsync,
  syncProvider: noopAsync,
});

export function useCloud() {
  return useContext(CloudCtx);
}

// ── Provider ───────────────────────────────────────────────────────────────

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const { user, isImpersonating } = useAuth();
  const canPermanentlyDelete = user?.role === 'SUPER_ADMIN' || isImpersonating;
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedDeepLinkRef = useRef(false);

  const [files, setFiles]         = useState<CloudFile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [drives, setDrives] = useState<CloudDrive[]>([]);
  const [drivesLoading, setDrivesLoading] = useState(true);
  const [currentDriveId, setCurrentDriveId] = useState<string | null>(null);
  const currentDrive = drives.find(d => d.id === currentDriveId) ?? null;

  const [driveMembers, setDriveMembers] = useState<DriveMember[]>([]);
  const [driveMembersLoading, setDriveMembersLoading] = useState(false);

  const [currentView, setCurrentView]     = useState<CloudView>('all');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([{ id: null, name: 'My Drive' }]);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Real cross-drive search (GET /v1/files?q=), debounced — replaces the
  // old client-side-only filter over whatever files happened to already be
  // loaded for the current drive/folder.
  const [searchResults, setSearchResults] = useState<CloudFile[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/files?q=${encodeURIComponent(q)}`)
        .then(data => setSearchResults(Array.isArray(data) ? data : []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const removeUploadingFile = useCallback((id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);
  const loadStorageQuota = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/files/storage-usage');
      setStorageQuota({ used_bytes: Number(data.used_bytes) || 0, limit_bytes: data.limit_bytes != null ? Number(data.limit_bytes) : null });
    } catch { /* quota is a nice-to-have display, never blocks the app */ }
  }, []);
  useEffect(() => { loadStorageQuota(); }, [loadStorageQuota]);

  const loadDrives = useCallback(async () => {
    try {
      setDrivesLoading(true);
      const data = await apiFetch('/v1/drives');
      const list: CloudDrive[] = Array.isArray(data) ? data : [];
      setDrives(list);
      setCurrentDriveId(prev => prev && list.some(d => d.id === prev) ? prev : (list[0]?.id ?? null));
    } catch (err: any) {
      setError(err.message || 'Failed to load drives');
    } finally {
      setDrivesLoading(false);
    }
  }, []);

  useEffect(() => { loadDrives(); }, [loadDrives]);

  // Deep-link support: a caller like the Customers profile page's "Open
  // Drive" button links here with ?folder=&drive=&name=(&parentId=&
  // parentName=) so it opens straight into a specific real folder — e.g. a
  // customer's own "Customers ▸ <name>" folder — instead of always landing
  // on the drive root. Applied once (appliedDeepLinkRef), overriding
  // loadDrives()'s own "pick the first drive" default, then the params are
  // cleared so normal in-app navigation (breadcrumb clicks, switching
  // drives) isn't fighting a stale URL on every render.
  useEffect(() => {
    if (appliedDeepLinkRef.current || drivesLoading || drives.length === 0) return;
    const folderParam = searchParams.get('folder');
    const driveParam = searchParams.get('drive');
    if (!folderParam || !driveParam) return;
    appliedDeepLinkRef.current = true;
    const drive = drives.find(d => d.id === driveParam);
    if (!drive) { setSearchParams({}, { replace: true }); return; }

    const nameParam = searchParams.get('name');
    const parentIdParam = searchParams.get('parentId');
    const parentNameParam = searchParams.get('parentName');

    setCurrentDriveId(driveParam);
    setCurrentView('all');
    setCurrentFolderId(folderParam);
    setPreviewItemId(null);
    setSearch('');
    setBreadcrumb([
      { id: null, name: drive.name },
      ...(parentIdParam ? [{ id: parentIdParam, name: parentNameParam || 'Folder' }] : []),
      { id: folderParam, name: nameParam || 'Folder' },
    ]);
    setSearchParams({}, { replace: true });
  }, [drives, drivesLoading, searchParams, setSearchParams]);

  const loadData = useCallback(async () => {
    if (!currentDriveId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(`/v1/files?drive_id=${encodeURIComponent(currentDriveId)}`);
      setFiles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [currentDriveId]);

  useEffect(() => { loadData(); }, [loadData]);

  const dismissError = useCallback(() => setError(null), []);

  function resetNav(rootName: string) {
    setPreviewItemId(null);
    setSearch('');
    setCurrentView('all');
    setCurrentFolderId(null);
    setBreadcrumb([{ id: null, name: rootName }]);
  }

  const switchDrive = useCallback((driveId: string) => {
    setCurrentDriveId(driveId);
    const drive = drives.find(d => d.id === driveId);
    resetNav(drive?.name ?? 'My Drive');
  }, [drives]);

  const createDrive = useCallback(async (name: string, type: DriveType) => {
    try {
      const drive = await apiFetch('/v1/drives', { method: 'POST', body: JSON.stringify({ name, type }) });
      await loadDrives();
      setCurrentDriveId(drive.id);
      resetNav(drive.name);
    } catch (err: any) {
      setError(err.message || 'Failed to create drive');
      throw err;
    }
  }, [loadDrives]);

  const renameDrive = useCallback(async (id: string, name: string) => {
    try {
      await apiFetch(`/v1/drives/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      await loadDrives();
    } catch (err: any) {
      setError(err.message || 'Failed to rename drive');
      throw err;
    }
  }, [loadDrives]);

  const deleteDrive = useCallback(async (id: string) => {
    try {
      await apiFetch(`/v1/drives/${id}`, { method: 'DELETE' });
      if (id === currentDriveId) setCurrentDriveId(null);
      await loadDrives();
    } catch (err: any) {
      setError(err.message || 'Failed to delete drive');
      throw err;
    }
  }, [loadDrives, currentDriveId]);

  const loadDriveMembers = useCallback(async (driveId: string) => {
    try {
      setDriveMembersLoading(true);
      const data = await apiFetch(`/v1/drives/${driveId}/members`);
      setDriveMembers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    } finally {
      setDriveMembersLoading(false);
    }
  }, []);

  const addDriveMember = useCallback(async (driveId: string, personName: string, role: DriveRole) => {
    try {
      await apiFetch(`/v1/drives/${driveId}/members`, { method: 'POST', body: JSON.stringify({ person_name: personName, role }) });
      await loadDriveMembers(driveId);
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
      throw err;
    }
  }, [loadDriveMembers]);

  const updateDriveMemberRole = useCallback(async (driveId: string, memberId: string, role: DriveRole) => {
    try {
      await apiFetch(`/v1/drives/${driveId}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      await loadDriveMembers(driveId);
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
      throw err;
    }
  }, [loadDriveMembers]);

  const removeDriveMember = useCallback(async (driveId: string, memberId: string) => {
    try {
      await apiFetch(`/v1/drives/${driveId}/members/${memberId}`, { method: 'DELETE' });
      await loadDriveMembers(driveId);
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
      throw err;
    }
  }, [loadDriveMembers]);

  const goToView = useCallback((v: CloudView) => {
    setCurrentView(v);
    setPreviewItemId(null);
    setSearch('');
    if (v === 'all') {
      setCurrentFolderId(null);
      setBreadcrumb([{ id: null, name: currentDrive?.name ?? 'My Drive' }]);
    }
  }, [currentDrive]);

  const openFolder = useCallback((item: CloudFile) => {
    setCurrentView('all');
    setCurrentFolderId(item.id);
    setBreadcrumb(prev => [...prev, { id: item.id, name: item.name }]);
    setPreviewItemId(null);
    setSearch('');
  }, []);

  const navToBreadcrumb = useCallback((idx: number) => {
    setBreadcrumb(prev => {
      const next = prev.slice(0, idx + 1);
      setCurrentFolderId(next[next.length - 1].id);
      return next;
    });
    setPreviewItemId(null);
  }, []);

  async function run(action: () => Promise<any>) {
    try {
      await action();
      await loadData();
      loadStorageQuota(); // fire-and-forget — a display refresh, never blocks the action itself
    } catch (err: any) {
      setError(err.message || 'Action failed');
      throw err;
    }
  }

  const createFolder = useCallback((name: string, parentId: string | null, color?: string) =>
    run(() => apiFetch('/v1/files/folder', { method: 'POST', body: JSON.stringify({ name, parent_id: parentId, color, drive_id: currentDriveId }) })),
  [loadData, currentDriveId]);

  // Real per-file byte progress via XMLHttpRequest — plain fetch() (used
  // everywhere else in this file) has no upload-progress event at all. The
  // uploadingFiles list is replaced (not appended) at the start of each
  // batch so a stale "completed" chip from a previous folder never bleeds
  // into a dropzone opened somewhere else in the app.
  const uploadFiles = useCallback((fileList: File[], parentId: string | null) =>
    run(async () => {
      const qs = new URLSearchParams();
      if (parentId) qs.set('parent_id', parentId);
      if (currentDriveId) qs.set('drive_id', currentDriveId);

      const batch = fileList.map(f => ({ id: crypto.randomUUID(), file: f }));
      setUploadingFiles(batch.map(({ id, file }) => ({ id, name: file.name, size: file.size, progress: 0, status: 'uploading' as const })));

      for (const { id, file } of batch) {
        const form = new FormData();
        form.append('file', file);
        const { promise } = apiUploadWithProgress(`/v1/files/upload?${qs.toString()}`, form, pct =>
          setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: pct } : u)));
        try {
          await promise;
          setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: 100, status: 'completed' } : u));
        } catch (err) {
          setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, status: 'error' } : u));
          throw err;
        }
      }
    }),
  [loadData, currentDriveId]);

  const uploadFolder = useCallback((fileList: File[], parentId: string | null) =>
    run(async () => {
      const folderIds = new Map<string, string | null>();
      folderIds.set('', parentId);

      async function ensureFolder(pathParts: string[]): Promise<string | null> {
        const key = pathParts.join('/');
        const cached = folderIds.get(key);
        if (cached !== undefined) return cached;
        const parent = await ensureFolder(pathParts.slice(0, -1));
        const folder = await apiFetch('/v1/files/folder', {
          method: 'POST',
          body: JSON.stringify({ name: pathParts[pathParts.length - 1], parent_id: parent, drive_id: currentDriveId }),
        });
        folderIds.set(key, folder.id);
        return folder.id;
      }

      const batch = fileList.map(f => ({ id: crypto.randomUUID(), file: f }));
      setUploadingFiles(batch.map(({ id, file }) => ({ id, name: file.name, size: file.size, progress: 0, status: 'uploading' as const })));

      for (const { id, file } of batch) {
        const rel = (file as any).webkitRelativePath as string | undefined;
        const parts = rel ? rel.split('/').filter(Boolean) : [file.name];
        const targetParentId = await ensureFolder(parts.slice(0, -1));
        const form = new FormData();
        form.append('file', file);
        const qs = new URLSearchParams();
        if (targetParentId) qs.set('parent_id', targetParentId);
        if (currentDriveId) qs.set('drive_id', currentDriveId);
        const { promise } = apiUploadWithProgress(`/v1/files/upload?${qs.toString()}`, form, pct =>
          setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: pct } : u)));
        try {
          await promise;
          setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: 100, status: 'completed' } : u));
        } catch (err) {
          setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, status: 'error' } : u));
          throw err;
        }
      }
    }),
  [loadData, currentDriveId]);

  const renameItem = useCallback((id: string, name: string) =>
    run(() => apiFetch(`/v1/files/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })),
  [loadData]);

  const starItem = useCallback((id: string, starred: boolean) =>
    run(() => apiFetch(`/v1/files/${id}`, { method: 'PATCH', body: JSON.stringify({ starred }) })),
  [loadData]);

  const moveItem = useCallback((id: string, parentId: string | null) =>
    run(() => apiFetch(`/v1/files/${id}/move`, { method: 'POST', body: JSON.stringify({ parent_id: parentId }) })),
  [loadData]);

  const trashItem = useCallback((id: string) =>
    run(() => apiFetch(`/v1/files/${id}/trash`, { method: 'POST' })),
  [loadData]);

  const restoreItem = useCallback((id: string) =>
    run(() => apiFetch(`/v1/files/${id}/restore`, { method: 'POST' })),
  [loadData]);

  const permanentlyDelete = useCallback((id: string) =>
    run(() => apiFetch(`/v1/files/${id}`, { method: 'DELETE' })),
  [loadData]);

  const emptyTrash = useCallback(() =>
    run(() => apiFetch('/v1/files/trash/empty', { method: 'POST', body: JSON.stringify({ drive_id: currentDriveId }) })),
  [loadData, currentDriveId]);

  // Returns the response (not just void, unlike the other actions) so the
  // caller can read back share_token immediately — the Share modal needs it
  // to build a real "Copy link" URL without waiting for a stale local
  // snapshot to catch up with the next loadData() refresh.
  const shareItem = useCallback(async (id: string, shared: SharedPerson[]): Promise<{ share_token: string | null }> => {
    let result: { share_token: string | null } = { share_token: null };
    await run(async () => {
      result = await apiFetch(`/v1/files/${id}/share`, { method: 'PUT', body: JSON.stringify({ shared }) });
    });
    return result;
  }, [loadData]);

  const downloadItem = useCallback(async (item: CloudFile) => {
    try {
      await apiDownload(`/v1/files/${item.id}/download`, item.name);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    }
  }, []);

  const [connections, setConnections] = useState<StorageConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      setConnectionsLoading(true);
      const data = await apiFetch('/v1/files/connections');
      setConnections(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load connected apps');
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  const connectProvider = useCallback((provider: StorageProvider, accountLabel: string) =>
    (async () => {
      try {
        await apiFetch(`/v1/files/connections/${provider}/connect`, { method: 'POST', body: JSON.stringify({ account_label: accountLabel }) });
        await loadConnections();
      } catch (err: any) {
        setError(err.message || 'Connect failed');
        throw err;
      }
    })(),
  [loadConnections]);

  const disconnectProvider = useCallback((provider: StorageProvider) =>
    (async () => {
      try {
        await apiFetch(`/v1/files/connections/${provider}/disconnect`, { method: 'POST' });
        await loadConnections();
      } catch (err: any) {
        setError(err.message || 'Disconnect failed');
        throw err;
      }
    })(),
  [loadConnections]);

  const syncProvider = useCallback((provider: StorageProvider) =>
    (async () => {
      try {
        await apiFetch(`/v1/files/connections/${provider}/sync`, { method: 'POST' });
        await loadConnections();
      } catch (err: any) {
        setError(err.message || 'Sync failed');
        throw err;
      }
    })(),
  [loadConnections]);

  return (
    <CloudCtx.Provider value={{
      files, loading, error, dismissError, loadData,
      drives, drivesLoading, currentDriveId, currentDrive, loadDrives, switchDrive, createDrive, renameDrive, deleteDrive,
      driveMembers, driveMembersLoading, loadDriveMembers, addDriveMember, updateDriveMemberRole, removeDriveMember,
      storageQuota, loadStorageQuota,
      currentView, currentFolderId, breadcrumb,
      goToView, openFolder, navToBreadcrumb,
      previewItemId, setPreviewItemId,
      search, setSearch, searchResults, searching,
      createFolder, uploadFiles, uploadFolder, uploadingFiles, removeUploadingFile, renameItem, starItem, moveItem,
      trashItem, restoreItem, permanentlyDelete, emptyTrash, shareItem, downloadItem, canPermanentlyDelete,
      connections, connectionsLoading, loadConnections, connectProvider, disconnectProvider, syncProvider,
    }}>
      {children}
    </CloudCtx.Provider>
  );
}
