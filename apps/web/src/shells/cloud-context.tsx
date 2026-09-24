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
  /** A real users.id for every staff-created row (files.routes.ts) — null
   *  only for a customer-portal upload (no matching users row to point at).
   *  Lets an owner's card show their real uploaded photo instead of always
   *  falling back to initials from owner_name. */
  owner_id: string | null;
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

export type StorageLevel = 'ok' | 'warning' | 'high' | 'critical' | 'exceeded';
export interface StorageQuota { used_bytes: number; limit_bytes: number | null; level: StorageLevel }

export interface UploadingFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'completed' | 'error' | 'cancelled';
  /** Why it failed, shown next to the file. */
  error?: string;
}

/**
 * A chunked upload that survives a page reload: the server keeps the session and every chunk
 * already sent (cloud_upload_sessions), and this record — kept in localStorage, not in memory — is
 * what lets the UI find it again after a refresh. The browser drops the original `File` on reload
 * (no API can hand it back), so resuming still needs the person to reselect the same file; what this
 * buys is that reselecting it re-uploads only the chunks that never arrived, not the whole thing.
 */
export interface ResumableUpload { uploadId: string; name: string; size: number; parentId: string | null; driveId: string | null; createdAt: number }

export interface StorageConnection {
  provider: StorageProvider;
  status: 'connected' | 'disconnected';
  account_label: string | null;
  account_email?: string | null;
  auto_sync: boolean;
  connected_at: string | null;
  last_synced_at: string | null;
  last_sync_error?: string | null;
  /** true only for providers with a real integration (OneDrive today). */
  supported?: boolean;
  /** true once this tenant has stored a BYO OAuth Client ID + Secret. */
  oauth_configured?: boolean;
  oauth_client_id?: string | null;
  file_count: number;
  total_size: number;
}

export interface FileAccessLogEntry {
  id: string;
  file_id: string;
  version_id: string | null;
  user_id: string | null;
  actor_name: string;
  action: 'download' | 'preview' | 'version_download' | 'link_download';
  via: 'app' | 'public_link';
  ip: string | null;
  created_at: string;
}

// 'business' (migration 498) is the tenant-wide, system-managed records
// drive every automatic app folder (Customers/Shipments/Employees/SEAL/
// Meetings) lives in — visible to all staff, never user-creatable.
export type DriveType = 'personal' | 'shared' | 'business';
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
  principal_type: string | null;
  principal_id: string | null;
}

/** A real tenant staff account offered by GET /v1/drives/:id/member-candidates
 *  — what the "Add member" picker searches, replacing a free-text name. */
export interface DriveMemberCandidate {
  id: string;
  name: string | null;
  email: string | null;
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
  /** Always creates a 'shared' drive — Personal (one per user) and Business
   *  Records (one per tenant) are both system-managed and never user-created. */
  createDrive: (name: string) => Promise<void>;
  renameDrive: (id: string, name: string) => Promise<void>;
  deleteDrive: (id: string) => Promise<void>;

  driveMembers: DriveMember[];
  driveMembersLoading: boolean;
  loadDriveMembers: (driveId: string) => Promise<void>;
  /** Real tenant staff only, from GET /v1/drives/:id/member-candidates. */
  searchDriveMemberCandidates: (driveId: string, q: string) => Promise<DriveMemberCandidate[]>;
  addDriveMember: (driveId: string, principalId: string, role: DriveRole) => Promise<void>;
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
  /** Set when the search request itself failed — distinct from a search with zero matches. */
  searchError: string | null;

  createFolder: (name: string, parentId: string | null, color?: string) => Promise<void>;
  uploadFiles: (fileList: File[], parentId: string | null) => Promise<void>;
  uploadFolder: (fileList: File[], parentId: string | null) => Promise<void>;
  /** Real per-file byte progress (XMLHttpRequest upload.onprogress) for
   *  whichever uploadFiles/uploadFolder call is in flight — replaced at the
   *  start of each new batch, dismissible per-file via removeUploadingFile. */
  uploadingFiles: UploadingFile[];
  removeUploadingFile: (id: string) => void;
  /** Abort an in-flight upload (the server discards a partial upload; nothing is stored). */
  cancelUpload: (id: string) => void;
  /** Retry a failed or cancelled upload of the same file. */
  retryUpload: (id: string) => Promise<void>;
  /** Chunked uploads left incomplete by a page reload/crash — confirmed still open on the server. */
  resumableUploads: ResumableUpload[];
  /** Continue one, given the same file reselected by the person (name + size are checked to match). */
  resumeUpload: (upload: ResumableUpload, file: File) => Promise<void>;
  /** Give up on an interrupted upload — cancels the server-side session and forgets it locally. */
  discardResumableUpload: (uploadId: string) => Promise<void>;
  renameItem: (id: string, name: string) => Promise<void>;
  starItem: (id: string, starred: boolean) => Promise<void>;
  moveItem: (id: string, parentId: string | null) => Promise<void>;
  /** Moves several items and reports exactly which succeeded and which failed (never silently partial). */
  moveItems: (ids: string[], parentId: string | null) => Promise<{ moved: string[]; failed: { id: string; error: string }[] }>;
  trashItem: (id: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;
  permanentlyDelete: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  /** Only the platform SuperAdmin — real or currently impersonating (see
   *  isPlatformSuperAdmin() in the API's rbac.ts) — can forever-delete a
   *  file or empty Trash; everyone else can only move things to Trash. */
  canPermanentlyDelete: boolean;
  shareItem: (id: string, shared: SharedPerson[]) => Promise<{ share_token: string | null; public_url: string | null }>;
  /** Create (or rotate) the anonymous download link. Returns the absolute URL built by the API. */
  createPublicLink: (id: string, rotate?: boolean) => Promise<{ share_token: string | null; public_url: string | null }>;
  revokePublicLink: (id: string) => Promise<void>;
  /** Files a colleague shared with this user directly — may live in a drive this user cannot browse. */
  sharedWithMe: CloudFile[];
  loadSharedWithMe: () => Promise<void>;
  downloadItem: (item: CloudFile) => Promise<void>;

  connections: StorageConnection[];
  connectionsLoading: boolean;
  loadConnections: () => Promise<void>;
  connectProvider: (provider: StorageProvider, accountLabel: string) => Promise<void>;
  disconnectProvider: (provider: StorageProvider) => Promise<void>;
  syncProvider: (provider: StorageProvider) => Promise<void>;
  /** Store the tenant's BYO OAuth app credentials for a real connector (OneDrive). */
  configureConnectorOAuth: (provider: StorageProvider, clientId: string, clientSecret: string) => Promise<void>;
  /** Get the provider consent URL to redirect the browser to. */
  startConnectorOAuth: (provider: StorageProvider) => Promise<{ url: string; state: string }>;
  /** Exchange the `?code=` from the consent redirect for tokens + first sync. */
  completeConnectorOAuth: (provider: StorageProvider, code: string) => Promise<{ synced: number; email: string | null }>;

  /** Per-file read audit (download / preview / version / public link). */
  fetchAccessLog: (fileId: string) => Promise<FileAccessLogEntry[]>;
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
  searchDriveMemberCandidates: async () => [],
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
  searchError: null,
  createFolder: noopAsync,
  uploadFiles: noopAsync,
  uploadingFiles: [],
  removeUploadingFile: noop,
  cancelUpload: noop,
  retryUpload: noopAsync,
  resumableUploads: [],
  resumeUpload: noopAsync,
  discardResumableUpload: noopAsync,
  uploadFolder: noopAsync,
  renameItem: noopAsync,
  starItem: noopAsync,
  moveItem: noopAsync,
  moveItems: async () => ({ moved: [], failed: [] }),
  trashItem: noopAsync,
  restoreItem: noopAsync,
  permanentlyDelete: noopAsync,
  emptyTrash: noopAsync,
  canPermanentlyDelete: false,
  shareItem: async () => ({ share_token: null, public_url: null }),
  createPublicLink: async () => ({ share_token: null, public_url: null }),
  revokePublicLink: noopAsync,
  sharedWithMe: [],
  loadSharedWithMe: noopAsync,
  downloadItem: noopAsync,
  connections: [],
  connectionsLoading: false,
  loadConnections: noopAsync,
  connectProvider: noopAsync,
  disconnectProvider: noopAsync,
  syncProvider: noopAsync,
  configureConnectorOAuth: noopAsync,
  startConnectorOAuth: async () => ({ url: '', state: '' }),
  completeConnectorOAuth: async () => ({ synced: 0, email: null }),
  fetchAccessLog: async () => [],
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
  const [searchError, setSearchError] = useState<string | null>(null);
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults(null); setSearching(false); setSearchError(null); return; }
    setSearching(true); setSearchError(null);
    let live = true;
    const t = setTimeout(() => {
      apiFetch(`/v1/files?q=${encodeURIComponent(q)}`)
        .then(data => { if (live) setSearchResults(Array.isArray(data) ? data : []); })
        // A failed request is NOT "no results": keep the last results out of the way and say what happened.
        .catch((err: any) => { if (live) { setSearchResults(null); setSearchError(err?.status === 403 ? 'You do not have access to search here.' : (err?.message || 'Search failed — check your connection and try again.')); } })
        .finally(() => { if (live) setSearching(false); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [search]);

  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const removeUploadingFile = useCallback((id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);
  const loadStorageQuota = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/files/storage-usage');
      setStorageQuota({ used_bytes: Number(data.used_bytes) || 0, limit_bytes: data.limit_bytes != null ? Number(data.limit_bytes) : null, level: (data.level as StorageLevel) ?? 'ok' });
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

  const createDrive = useCallback(async (name: string) => {
    try {
      const drive = await apiFetch('/v1/drives', { method: 'POST', body: JSON.stringify({ name }) });
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

  const searchDriveMemberCandidates = useCallback(async (driveId: string, q: string): Promise<DriveMemberCandidate[]> => {
    try {
      const data = await apiFetch(`/v1/drives/${driveId}/member-candidates?q=${encodeURIComponent(q)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, []);

  const addDriveMember = useCallback(async (driveId: string, principalId: string, role: DriveRole) => {
    try {
      await apiFetch(`/v1/drives/${driveId}/members`, { method: 'POST', body: JSON.stringify({ principal_id: principalId, role }) });
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
  // In-flight uploads can be cancelled (XHR abort) and failed/cancelled ones retried. The File objects
  // are kept in memory only for the lifetime of the page — a browser refresh drops them, so an
  // interrupted upload has to be started again (uploads are not resumable across reloads).
  const uploadAborts = useRef(new Map<string, () => void>());
  const uploadSources = useRef(new Map<string, { file: File; parentId: string | null; driveId: string | null }>());

  // Files at or above this size go through the chunked/resumable path (POST /v1/files/uploads);
  // smaller ones keep using the single-request upload. 25MB keeps ordinary attachments on the
  // simple path and puts anything that would meaningfully suffer from a dropped connection on the
  // resumable one.
  const CHUNKED_THRESHOLD = 25 * 1024 * 1024;

  async function fingerprintOf(file: File): Promise<string> {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  // ── Cross-reload resumability ────────────────────────────────────────────────────────────────
  // Each open session's server-facing facts (nothing about the File object itself, which can't be
  // persisted) live in localStorage so they're still there after a refresh. Wrapped in try/catch
  // throughout: private browsing / blocked storage must never break uploading, only the "resume
  // after reload" convenience.
  const RESUMABLE_KEY = 'hudumika_cloud_resumable_uploads';
  const readResumable = (): ResumableUpload[] => {
    try { return JSON.parse(localStorage.getItem(RESUMABLE_KEY) ?? '[]'); } catch { return []; }
  };
  const writeResumable = (list: ResumableUpload[]) => {
    try { localStorage.setItem(RESUMABLE_KEY, JSON.stringify(list)); } catch { /* best-effort */ }
  };
  const rememberResumable = (u: ResumableUpload) => writeResumable([...readResumable().filter(r => r.uploadId !== u.uploadId), u]);
  const forgetResumable = (uploadId: string) => writeResumable(readResumable().filter(r => r.uploadId !== uploadId));

  const [resumableUploads, setResumableUploads] = useState<ResumableUpload[]>([]);
  // On mount: every locally-remembered session is re-confirmed against the server (still 'open'?
  // not expired?) before being offered — a stale or already-finished entry is just dropped, never
  // shown as something to resume.
  useEffect(() => {
    (async () => {
      const remembered = readResumable();
      if (!remembered.length) return;
      const survivors: ResumableUpload[] = [];
      for (const r of remembered) {
        try {
          const status = await apiFetch(`/v1/files/uploads/${r.uploadId}`);
          if (status.status === 'open') survivors.push(r); else forgetResumable(r.uploadId);
        } catch { forgetResumable(r.uploadId); }
      }
      setResumableUploads(survivors);
    })();
  }, []);

  const sendChunked = useCallback(async (id: string, file: File, parentId: string | null, driveId: string | null, signal: { cancelled: boolean }, resumeSessionId?: string) => {
    setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: 0, status: 'uploading', error: undefined } : u));
    let uploadId: string, chunk_bytes: number, total_chunks: number, received: number[];
    if (resumeSessionId) {
      const status = await apiFetch(`/v1/files/uploads/${resumeSessionId}`);
      ({ chunk_bytes, total_chunks, received } = status);
      uploadId = resumeSessionId;
    } else {
      const fingerprint = await fingerprintOf(file);
      const session = await apiFetch('/v1/files/uploads', {
        method: 'POST',
        body: JSON.stringify({ name: file.name, size: file.size, mime_type: file.type || 'application/octet-stream', parent_id: parentId, drive_id: driveId, fingerprint }),
      });
      ({ id: uploadId, chunk_bytes, total_chunks, received = [] } = session);
      rememberResumable({ uploadId, name: file.name, size: file.size, parentId, driveId, createdAt: Date.now() });
    }
    const already = new Set<number>(received ?? []);
    try {
      for (let i = 0; i < total_chunks; i++) {
        if (signal.cancelled) { const e: any = new Error('Upload cancelled'); throw e; }
        if (already.has(i)) { setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: Math.round(((i + 1) / total_chunks) * 100) } : u)); continue; }
        const start = i * chunk_bytes;
        const chunk = file.slice(start, Math.min(start + chunk_bytes, file.size));
        const buf = await chunk.arrayBuffer();
        // A chunk that fails after retries fails the whole upload — caught below and left resumable.
        await apiFetch(`/v1/files/uploads/${uploadId}/chunks/${i}`, { method: 'PUT', body: buf, headers: { 'Content-Type': 'application/octet-stream' } });
        setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: Math.round(((i + 1) / total_chunks) * 100) } : u));
      }
      const result = await apiFetch(`/v1/files/uploads/${uploadId}/complete`, { method: 'POST' });
      forgetResumable(uploadId);
      setResumableUploads(prev => prev.filter(r => r.uploadId !== uploadId));
      return result;
    } catch (err) {
      // Left in place on purpose — this is exactly the record that lets the upload survive a reload.
      throw err;
    }
  }, []);

  const sendOne = useCallback(async (id: string, file: File, parentId: string | null, driveId: string | null, resumeSessionId?: string) => {
    setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: 0, status: 'uploading', error: undefined } : u));
    if (file.size >= CHUNKED_THRESHOLD || resumeSessionId) {
      const signal = { cancelled: false };
      uploadAborts.current.set(id, () => { signal.cancelled = true; });
      try {
        await sendChunked(id, file, parentId, driveId, signal, resumeSessionId);
        setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: 100, status: 'completed' } : u));
        uploadSources.current.delete(id);
      } catch (err: any) {
        const cancelled = err?.message === 'Upload cancelled' || signal.cancelled;
        // A cancelled/failed chunked upload stays resumable — sendChunked re-asks the server which
        // chunks it already has, so retryUpload picks up where it left off rather than starting over.
        setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, status: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err?.message || 'Upload failed') } : u));
        if (!cancelled) throw err;
      } finally {
        uploadAborts.current.delete(id);
      }
      return;
    }
    const qs = new URLSearchParams();
    if (parentId) qs.set('parent_id', parentId);
    if (driveId) qs.set('drive_id', driveId);
    const form = new FormData();
    form.append('file', file);
    const { promise, abort } = apiUploadWithProgress(`/v1/files/upload?${qs.toString()}`, form, pct =>
      setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: pct } : u)));
    uploadAborts.current.set(id, abort);
    try {
      await promise;
      setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, progress: 100, status: 'completed' } : u));
      uploadSources.current.delete(id);
    } catch (err: any) {
      const cancelled = err?.message === 'Upload cancelled';
      setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, status: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err?.message || 'Upload failed') } : u));
      if (!cancelled) throw err;
    } finally {
      uploadAborts.current.delete(id);
    }
  }, [sendChunked]);

  const cancelUpload = useCallback((id: string) => { uploadAborts.current.get(id)?.(); }, []);

  const retryUpload = useCallback(async (id: string) => {
    const src = uploadSources.current.get(id);
    if (!src) { setError('This upload can no longer be retried — please add the file again.'); return; }
    await run(() => sendOne(id, src.file, src.parentId, src.driveId));
  }, [sendOne, loadData]);

  const resumeUpload = useCallback(async (upload: ResumableUpload, file: File) => {
    if (file.name !== upload.name || file.size !== upload.size) {
      setError(`That's not the same file — expected "${upload.name}" (${upload.size} bytes).`);
      return;
    }
    const localId = crypto.randomUUID();
    setUploadingFiles(prev => [...prev, { id: localId, name: file.name, size: file.size, progress: 0, status: 'uploading' }]);
    uploadSources.current.set(localId, { file, parentId: upload.parentId, driveId: upload.driveId });
    await run(() => sendOne(localId, file, upload.parentId, upload.driveId, upload.uploadId));
  }, [sendOne, loadData]);

  const discardResumableUpload = useCallback(async (uploadId: string) => {
    try { await apiFetch(`/v1/files/uploads/${uploadId}`, { method: 'DELETE' }); } catch { /* already gone server-side — still forget it locally */ }
    forgetResumable(uploadId);
    setResumableUploads(prev => prev.filter(r => r.uploadId !== uploadId));
  }, []);

  const uploadFiles = useCallback((fileList: File[], parentId: string | null) =>
    run(async () => {
      const batch = fileList.map(f => ({ id: crypto.randomUUID(), file: f }));
      setUploadingFiles(batch.map(({ id, file }) => ({ id, name: file.name, size: file.size, progress: 0, status: 'uploading' as const })));
      for (const { id, file } of batch) uploadSources.current.set(id, { file, parentId, driveId: currentDriveId });
      // One failure must not abandon the rest of the batch; report it once at the end.
      let firstError: unknown = null;
      for (const { id, file } of batch) {
        try { await sendOne(id, file, parentId, currentDriveId); }
        catch (err) { firstError = firstError ?? err; }
      }
      if (firstError) throw firstError;
    }),
  [loadData, currentDriveId, sendOne]);

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

  // Several moves at once: every request is attempted, and the caller gets an exact report so a
  // partial success is never shown as a full one.
  const moveItems = useCallback(async (ids: string[], parentId: string | null) => {
    const results = await Promise.allSettled(ids.map(id => apiFetch(`/v1/files/${id}/move`, { method: 'POST', body: JSON.stringify({ parent_id: parentId }) })));
    const moved: string[] = [];
    const failed: { id: string; error: string }[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') moved.push(ids[i]);
      else failed.push({ id: ids[i], error: (r.reason as any)?.message || 'Move failed' });
    });
    await loadData();
    return { moved, failed };
  }, [loadData]);

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
  const shareItem = useCallback(async (id: string, shared: SharedPerson[]): Promise<{ share_token: string | null; public_url: string | null }> => {
    let result: { share_token: string | null; public_url: string | null } = { share_token: null, public_url: null };
    await run(async () => {
      result = await apiFetch(`/v1/files/${id}/share`, { method: 'PUT', body: JSON.stringify({ shared }) });
    });
    return result;
  }, [loadData]);

  // The anonymous link is its own capability — never created as a side effect of sharing with a person.
  const createPublicLink = useCallback(async (id: string, rotate = false) => {
    let result: { share_token: string | null; public_url: string | null } = { share_token: null, public_url: null };
    await run(async () => { result = await apiFetch(`/v1/files/${id}/public-link`, { method: 'POST', body: JSON.stringify({ rotate }) }); });
    return result;
  }, [loadData]);

  const revokePublicLink = useCallback(async (id: string) => {
    await run(() => apiFetch(`/v1/files/${id}/public-link`, { method: 'DELETE' }));
  }, [loadData]);

  const [sharedWithMe, setSharedWithMe] = useState<CloudFile[]>([]);
  const loadSharedWithMe = useCallback(async () => {
    try { const res = await apiFetch('/v1/files/shared-with-me'); setSharedWithMe(Array.isArray(res.data) ? res.data : []); }
    catch { setSharedWithMe([]); }
  }, []);

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

  const configureConnectorOAuth = useCallback((provider: StorageProvider, clientId: string, clientSecret: string) =>
    (async () => {
      try {
        await apiFetch(`/v1/files/connections/${provider}/oauth-config`, {
          method: 'PUT', body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
        });
        await loadConnections();
      } catch (err: any) {
        setError(err.message || 'Could not save OAuth credentials');
        throw err;
      }
    })(),
  [loadConnections]);

  const startConnectorOAuth = useCallback(async (provider: StorageProvider) => {
    return apiFetch(`/v1/files/connections/${provider}/auth-url`) as Promise<{ url: string; state: string }>;
  }, []);

  const completeConnectorOAuth = useCallback((provider: StorageProvider, code: string) =>
    (async () => {
      try {
        const res = await apiFetch(`/v1/files/connections/${provider}/callback`, {
          method: 'POST', body: JSON.stringify({ code }),
        });
        await loadConnections();
        return { synced: res?.synced ?? 0, email: res?.email ?? null };
      } catch (err: any) {
        setError(err.message || 'Could not finish connecting the account');
        throw err;
      }
    })(),
  [loadConnections]);

  const fetchAccessLog = useCallback(async (fileId: string) => {
    const res = await apiFetch(`/v1/files/${fileId}/access-log`);
    return Array.isArray(res?.data) ? res.data as FileAccessLogEntry[] : [];
  }, []);

  return (
    <CloudCtx.Provider value={{
      files, loading, error, dismissError, loadData,
      drives, drivesLoading, currentDriveId, currentDrive, loadDrives, switchDrive, createDrive, renameDrive, deleteDrive,
      driveMembers, driveMembersLoading, loadDriveMembers, searchDriveMemberCandidates, addDriveMember, updateDriveMemberRole, removeDriveMember,
      storageQuota, loadStorageQuota,
      currentView, currentFolderId, breadcrumb,
      goToView, openFolder, navToBreadcrumb,
      previewItemId, setPreviewItemId,
      search, setSearch, searchResults, searching, searchError,
      createFolder, uploadFiles, uploadFolder, uploadingFiles, removeUploadingFile, cancelUpload, retryUpload, resumableUploads, resumeUpload, discardResumableUpload, renameItem, starItem, moveItem, moveItems,
      trashItem, restoreItem, permanentlyDelete, emptyTrash, shareItem, createPublicLink, revokePublicLink, sharedWithMe, loadSharedWithMe, downloadItem, canPermanentlyDelete,
      connections, connectionsLoading, loadConnections, connectProvider, disconnectProvider, syncProvider,
      configureConnectorOAuth, startConnectorOAuth, completeConnectorOAuth, fetchAccessLog,
    }}>
      {children}
    </CloudCtx.Provider>
  );
}
