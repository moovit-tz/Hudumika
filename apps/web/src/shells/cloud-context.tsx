import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiFetch, apiDownload } from '../lib/api.js';

// ── Shared types ───────────────────────────────────────────────────────────

export interface SharedPerson {
  name: string;
  role: 'Viewer' | 'Editor';
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

  previewItemId: string | null;
  setPreviewItemId: (id: string | null) => void;

  search: string;
  setSearch: (q: string) => void;

  createFolder: (name: string, parentId: string | null, color?: string) => Promise<void>;
  uploadFiles: (fileList: File[], parentId: string | null) => Promise<void>;
  uploadFolder: (fileList: File[], parentId: string | null) => Promise<void>;
  renameItem: (id: string, name: string) => Promise<void>;
  starItem: (id: string, starred: boolean) => Promise<void>;
  moveItem: (id: string, parentId: string | null) => Promise<void>;
  trashItem: (id: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;
  permanentlyDelete: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
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
  previewItemId: null,
  setPreviewItemId: noop,
  search: '',
  setSearch: noop,
  createFolder: noopAsync,
  uploadFiles: noopAsync,
  uploadFolder: noopAsync,
  renameItem: noopAsync,
  starItem: noopAsync,
  moveItem: noopAsync,
  trashItem: noopAsync,
  restoreItem: noopAsync,
  permanentlyDelete: noopAsync,
  emptyTrash: noopAsync,
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
    } catch (err: any) {
      setError(err.message || 'Action failed');
      throw err;
    }
  }

  const createFolder = useCallback((name: string, parentId: string | null, color?: string) =>
    run(() => apiFetch('/v1/files/folder', { method: 'POST', body: JSON.stringify({ name, parent_id: parentId, color, drive_id: currentDriveId }) })),
  [loadData, currentDriveId]);

  const uploadFiles = useCallback((fileList: File[], parentId: string | null) =>
    run(async () => {
      for (const f of fileList) {
        const form = new FormData();
        form.append('file', f);
        const qs = new URLSearchParams();
        if (parentId) qs.set('parent_id', parentId);
        if (currentDriveId) qs.set('drive_id', currentDriveId);
        await apiFetch(`/v1/files/upload?${qs.toString()}`, { method: 'POST', body: form });
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

      for (const f of fileList) {
        const rel = (f as any).webkitRelativePath as string | undefined;
        const parts = rel ? rel.split('/').filter(Boolean) : [f.name];
        const targetParentId = await ensureFolder(parts.slice(0, -1));
        const form = new FormData();
        form.append('file', f);
        const qs = new URLSearchParams();
        if (targetParentId) qs.set('parent_id', targetParentId);
        if (currentDriveId) qs.set('drive_id', currentDriveId);
        await apiFetch(`/v1/files/upload?${qs.toString()}`, { method: 'POST', body: form });
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
      currentView, currentFolderId, breadcrumb,
      goToView, openFolder, navToBreadcrumb,
      previewItemId, setPreviewItemId,
      search, setSearch,
      createFolder, uploadFiles, uploadFolder, renameItem, starItem, moveItem,
      trashItem, restoreItem, permanentlyDelete, emptyTrash, shareItem, downloadItem,
      connections, connectionsLoading, loadConnections, connectProvider, disconnectProvider, syncProvider,
    }}>
      {children}
    </CloudCtx.Provider>
  );
}
