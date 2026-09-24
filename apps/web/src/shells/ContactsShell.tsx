import { Fragment, useRef, useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import '../pages/Contacts.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { PageLayout } from '../components/PageLayout.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Contacts } from '../pages/Contacts.js';
import { ContactsGoogleCallback } from '../pages/ContactsGoogleCallback.js';
import { ContactsOutlookCallback } from '../pages/ContactsOutlookCallback.js';
import { ContactsProvider, useContacts } from './contacts-context.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showPrompt } from '../lib/prompt.js';
import { buildLabelForest, flattenForest, invalidParentIds, type LabelNode } from '../pages/contacts/labelTree.js';

const GOOGLE_OAUTH_STATE_KEY = 'hudumika_google_contacts_oauth_state';
const MICROSOFT_OAUTH_STATE_KEY = 'hudumika_outlook_contacts_oauth_state';

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  contacts_synced_count: number;
}

/** Sidebar "Import from Google" control — real Google OAuth + People API
 * connection, not a decorative toggle. Manual, inbound-only: it fetches
 * Google's contacts into Hudumika on connect or on demand, on request —
 * there's no periodic background sync and no outbound write-back, which is
 * why the UI says "import"/"refresh" rather than "sync". See
 * contacts-sync.routes.ts for the backend half. */
function GoogleSyncItem({ collapsed, onSynced }: { collapsed: boolean; onSynced: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadStatus() {
    setLoading(true);
    apiFetch('/v1/contacts/google/status').then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false));
  }

  useEffect(() => { if (open) loadStatus(); }, [open]);

  async function handleConnect() {
    setBusy(true);
    try {
      const res = await apiFetch('/v1/contacts/google/auth-url');
      sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, res.state);
      window.location.href = res.url;
    } catch (err: any) {
      showAlert(err.message || 'Could not start Google sign-in.');
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      const res = await apiFetch('/v1/contacts/google/sync', { method: 'POST' });
      showAlert(`Imported ${res.synced} contact${res.synced === 1 ? '' : 's'} from Google.`);
      loadStatus();
      onSynced();
    } catch (err: any) {
      showAlert(err.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await apiFetch('/v1/contacts/google/connection', { method: 'DELETE' });
      loadStatus();
    } catch (err: any) {
      showAlert(err.message || 'Failed to disconnect.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`csb-sys-item${collapsed ? ' csb-sys-item--icon' : ''}`}
          title={collapsed ? 'Import from Google' : undefined}
        >
          <span className="csb-nav-icon"><Icon name="refresh" size={15} /></span>
          {!collapsed && <span>Import from Google</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-72 p-3">
        <div className="text-sm font-semibold text-foreground mb-2">Google Contacts</div>
        {loading || !status ? (
          <SectionLoading />
        ) : !status.configured ? (
          <div className="text-xs text-muted-foreground leading-relaxed">
            Not set up yet — add a Google OAuth Client ID/Secret in
            {' '}<a href="/workspace/settings?s=int-google" className="text-primary font-semibold">Settings ▸ Integrations ▸ Google</a>{' '}
            first.
          </div>
        ) : !status.connected ? (
          <>
            <div className="text-xs text-muted-foreground mb-3">Import your contacts from your real Google account. This is a one-time or on-demand import — it doesn't keep running in the background.</div>
            <button type="button" className="btn btn-primary btn-sm w-full" disabled={busy} onClick={handleConnect}>
              {busy ? 'Redirecting…' : 'Connect Google Account'}
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-foreground font-medium">{status.email}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {status.last_synced_at
                ? `Last imported ${new Date(status.last_synced_at).toLocaleString()} · ${status.contacts_synced_count} contacts`
                : 'Not imported yet'}
            </div>
            {status.last_sync_status === 'failed' && status.last_sync_error && (
              <div className="text-xs text-destructive mt-1">{status.last_sync_error}</div>
            )}
            <div className="text-xs text-muted-foreground mt-2">Fetches the latest from Google right now — this doesn't run automatically.</div>
            <div className="flex gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={handleSync}>
                {busy ? 'Importing…' : 'Refresh Imported Contacts'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface MicrosoftStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  contacts_synced_count: number;
}

/** Same shape and same manual, inbound-only import semantics as
 * GoogleSyncItem above — real Microsoft 365/Outlook OAuth + Graph API
 * connection, kept as its own component rather than a shared
 * "ProviderSyncItem" for the same reason contacts-sync.routes.ts keeps
 * ensureFreshMicrosoftToken separate from Google's: two providers'
 * copy-pasted UI is safer to touch than one genericized version risking
 * both. */
function OutlookSyncItem({ collapsed, onSynced }: { collapsed: boolean; onSynced: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MicrosoftStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadStatus() {
    setLoading(true);
    apiFetch('/v1/contacts/outlook/status').then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false));
  }

  useEffect(() => { if (open) loadStatus(); }, [open]);

  async function handleConnect() {
    setBusy(true);
    try {
      const res = await apiFetch('/v1/contacts/outlook/auth-url');
      sessionStorage.setItem(MICROSOFT_OAUTH_STATE_KEY, res.state);
      window.location.href = res.url;
    } catch (err: any) {
      showAlert(err.message || 'Could not start Outlook sign-in.');
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      const res = await apiFetch('/v1/contacts/outlook/sync', { method: 'POST' });
      showAlert(`Imported ${res.synced} contact${res.synced === 1 ? '' : 's'} from Outlook.`);
      loadStatus();
      onSynced();
    } catch (err: any) {
      showAlert(err.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await apiFetch('/v1/contacts/outlook/connection', { method: 'DELETE' });
      loadStatus();
    } catch (err: any) {
      showAlert(err.message || 'Failed to disconnect.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`csb-sys-item${collapsed ? ' csb-sys-item--icon' : ''}`}
          title={collapsed ? 'Import from Outlook' : undefined}
        >
          <span className="csb-nav-icon"><Icon name="mail" size={15} /></span>
          {!collapsed && <span>Import from Outlook</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-72 p-3">
        <div className="text-sm font-semibold text-foreground mb-2">Outlook Contacts</div>
        {loading || !status ? (
          <SectionLoading />
        ) : !status.configured ? (
          <div className="text-xs text-muted-foreground leading-relaxed">
            Not set up yet — add a Microsoft OAuth Client ID/Secret in
            {' '}<a href="/workspace/settings?s=int-microsoft" className="text-primary font-semibold">Settings ▸ Integrations ▸ Microsoft</a>{' '}
            first.
          </div>
        ) : !status.connected ? (
          <>
            <div className="text-xs text-muted-foreground mb-3">Import your contacts from your real Microsoft 365/Outlook account. This is a one-time or on-demand import — it doesn't keep running in the background.</div>
            <button type="button" className="btn btn-primary btn-sm w-full" disabled={busy} onClick={handleConnect}>
              {busy ? 'Redirecting…' : 'Connect Outlook Account'}
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-foreground font-medium">{status.email}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {status.last_synced_at
                ? `Last imported ${new Date(status.last_synced_at).toLocaleString()} · ${status.contacts_synced_count} contacts`
                : 'Not imported yet'}
            </div>
            {status.last_sync_status === 'failed' && status.last_sync_error && (
              <div className="text-xs text-destructive mt-1">{status.last_sync_error}</div>
            )}
            <div className="text-xs text-muted-foreground mt-2">Fetches the latest from Outlook right now — this doesn't run automatically.</div>
            <div className="flex gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={handleSync}>
                {busy ? 'Importing…' : 'Refresh Imported Contacts'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Sidebar content rendered inside AppSidebar via fillNav ─────────────────

// Keeps `currentView`/`selectedLabelId` in sync with the URL, both ways —
// so a direct visit to /contacts/favorites (or the browser back/forward
// buttons) actually lands on the right view instead of always showing the
// default list, and so the URL reflects whatever the sidebar switches to.
const VIEW_PATH: Record<string, string> = { contacts: '', directory: 'directory', frequent: 'frequent', other: 'other', favorites: 'favorites', merge: 'merge', trash: 'trash' };

function useContactsUrlSync() {
  const { setCurrentView, setSelectedLabelId, setSelectedSmartGroupId } = useContacts();
  const location = useLocation();

  useEffect(() => {
    const parts = location.pathname.replace(/^\/contacts\/?/, '').split('/').filter(Boolean);
    const seg = parts[0];
    if (seg === 'label' && parts[1]) {
      setCurrentView('label');
      setSelectedLabelId(parts[1]);
      setSelectedSmartGroupId(null);
    } else if (seg === 'smart') {
      // /contacts/smart/new  or  /contacts/smart/:id
      setCurrentView('smartgroup');
      setSelectedLabelId(null);
      setSelectedSmartGroupId(parts[1] && parts[1] !== 'new' ? parts[1] : null);
    } else if (seg === 'contact' && parts[1]) {
      setCurrentView('contacts');
      setSelectedLabelId(null);
      setSelectedSmartGroupId(null);
    } else if (seg === 'directory' || seg === 'frequent' || seg === 'other') {
      setCurrentView(seg);
      setSelectedLabelId(null);
      setSelectedSmartGroupId(null);
    } else if (seg === 'favorites' || seg === 'starred') {
      setCurrentView('favorites');
      setSelectedLabelId(null);
      setSelectedSmartGroupId(null);
    } else if (seg === 'merge') {
      setCurrentView('merge');
      setSelectedLabelId(null);
      setSelectedSmartGroupId(null);
    } else if (seg === 'trash') {
      setCurrentView('trash');
      setSelectedLabelId(null);
      setSelectedSmartGroupId(null);
    } else if (!seg) {
      setCurrentView('contacts');
      setSelectedLabelId(null);
      setSelectedSmartGroupId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}

function ContactsSidebarContent({ collapsed }: { collapsed: boolean }) {
  const {
    contacts, labels, smartGroups, duplicates,
    currentView, setCurrentView,
    selectedLabelId, setSelectedLabelId,
    selectedSmartGroupId, setSelectedSmartGroupId,
    activeContact, setActiveContact,
    handleDeleteLabel, handleUpdateLabel, handleDeleteSmartGroup,
    handleImportCSV, handleExportCSV, handleExportVCard, loadData,
    showNewLabelModal, setShowNewLabelModal,
    newLabelName, setNewLabelName, newLabelParentId, setNewLabelParentId, handleCreateLabel,
    openContactModalRef,
  } = useContacts();

  // Which parent labels are collapsed in the sidebar tree (persisted only
  // for the session; a small convenience, not state worth storing).
  const [collapsedLabels, setCollapsedLabels] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) => setCollapsedLabels(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const navigate = useNavigate();
  useContactsUrlSync();
  const importRef = useRef<HTMLInputElement>(null);

  // Landed back here from ContactsGoogleCallback after a successful connect —
  // show what actually happened (real count from the sync, not a guess),
  // then strip the params so a refresh doesn't repeat the message.
  const location = useLocation();
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('googleConnected') === '1') {
      showAlert(`Google account connected — imported ${p.get('synced') ?? 0} contacts.`);
      navigate('/contacts', { replace: true });
      loadData();
    }
    if (p.get('outlookConnected') === '1') {
      showAlert(`Outlook account connected — imported ${p.get('synced') ?? 0} contacts.`);
      navigate('/contacts', { replace: true });
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const activeCount = contacts.filter(c => c.status === 'ACTIVE').length;
  const favCount    = contacts.filter(c => c.is_favorite && c.status === 'ACTIVE').length;
  const mergeCount  = duplicates.length;

  const nav = (view: string, labelId?: string) => {
    setCurrentView(view as any);
    setSelectedLabelId(labelId ?? null);
    setSelectedSmartGroupId(null);
    setActiveContact(null);
    const path = view === 'label' ? `label/${labelId}` : (VIEW_PATH[view] ?? '');
    navigate(path ? `/contacts/${path}` : '/contacts');
  };

  const navSmart = (groupId: string | null) => {
    setCurrentView('smartgroup');
    setSelectedLabelId(null);
    setSelectedSmartGroupId(groupId);
    setActiveContact(null);
    navigate(groupId ? `/contacts/smart/${groupId}` : '/contacts/smart/new');
  };

  const labelForest = buildLabelForest(labels);
  const flatLabels = flattenForest(labelForest);

  const renderLabelNode = (node: LabelNode): ReactNode => {
    const { label, depth, children } = node;
    const hasKids = children.length > 0;
    const isCollapsed = collapsedLabels.has(label.id);
    const active = currentView === 'label' && selectedLabelId === label.id && !activeContact;
    const blocked = invalidParentIds(labels, label.id); // self + descendants — illegal as a new parent

    return (
      <Fragment key={label.id}>
        <div className={`csb-label-row${active ? ' csb-label-row--on' : ''}`} style={{ paddingLeft: depth * 14 }}>
          {hasKids ? (
            <button
              type="button"
              className="csb-label-twist"
              onClick={() => toggleCollapse(label.id)}
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={12} />
            </button>
          ) : (
            <span className="csb-label-twist csb-label-twist--leaf" />
          )}
          <button type="button" className="csb-label-btn" onClick={() => nav('label', label.id)}>
            <Icon name={hasKids ? (isCollapsed ? 'folder' : 'folderOpen') : 'tag'} size={14} />
            <span className="csb-label-name">{label.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="csb-label-del" title="Label options">
                <Icon name="moreVertical" size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right">
              <DropdownMenuItem
                onClick={async () => {
                  const next = await showPrompt('Rename label', {
                    title: 'Rename label', defaultValue: label.name, confirmLabel: 'Rename', required: true,
                  });
                  if (next && next !== label.name) handleUpdateLabel(label.id, { name: next });
                }}
              >
                Rename…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNewLabelParentId(label.id); setShowNewLabelModal(true); }}>
                Add sub-label…
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    disabled={!label.parent_id}
                    onClick={() => handleUpdateLabel(label.id, { parent_id: null })}
                  >
                    Top level
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {flatLabels
                    .filter(n => !blocked.has(n.label.id) && n.label.id !== label.parent_id)
                    .map(n => (
                      <DropdownMenuItem
                        key={n.label.id}
                        onClick={() => handleUpdateLabel(label.id, { parent_id: n.label.id })}
                      >
                        {' '.repeat(n.depth * 2)}{n.label.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-[var(--red)]" onClick={() => handleDeleteLabel(label.id)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasKids && !isCollapsed && children.map(c => renderLabelNode(c))}
      </Fragment>
    );
  };

  const mainItems: { key: string; label: string; icon: IconName; count: number; badge: boolean }[] = [
    { key: 'contacts',  label: 'Contacts',    icon: 'user',     count: activeCount, badge: false },
    { key: 'directory', label: 'Directory',   icon: 'building', count: 0,           badge: false },
    { key: 'frequent',  label: 'Frequent',    icon: 'clock',    count: 0,           badge: false },
    { key: 'other',     label: 'Other contacts', icon: 'users', count: 0,           badge: false },
    { key: 'favorites', label: 'Favourites',  icon: 'star',     count: favCount,    badge: false },
    { key: 'merge',     label: 'Merge & fix', icon: 'gitMerge', count: mergeCount,  badge: mergeCount > 0 },
  ];

  return (
    <>
      {/* Create contact button */}
      <div className={`app-sidebar-create-action-wrap${collapsed ? ' app-sidebar-create-action-wrap--collapsed' : ''}`}>
        <button
          type="button"
          className="app-sidebar-create-action"
          onClick={() => openContactModalRef.current(null)}
          title={collapsed ? 'Create contact' : undefined}
        >
          <span className="app-sidebar-create-action-icon"><Icon name="plus" size={16} strokeWidth={2.5} /></span>
          {!collapsed && <span>Create contact</span>}
        </button>
      </div>

      {/* Main nav */}
      <nav className="csb-nav">
        {mainItems.map(item => {
          const active = currentView === item.key && !activeContact;
          return (
            <button
              key={item.key}
              type="button"
              className={`csb-nav-item${active ? ' csb-nav-item--on' : ''}`}
              onClick={() => nav(item.key)}
              title={collapsed ? item.label : undefined}
            >
              <span className="csb-nav-icon">
                <Icon name={item.icon} size={16} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              {!collapsed && (
                <>
                  <span className="csb-nav-label">{item.label}</span>
                  {item.count > 0 && (
                    <span className={`csb-nav-count${item.badge ? ' csb-nav-count--red' : ''}`}>
                      {item.count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Labels — nested tree (migration 441) */}
      {!collapsed && (
        <div className="csb-labels">
          <div className="csb-labels-hdr">
            <span className="csb-labels-title">Labels</span>
            <button
              type="button"
              className="csb-labels-add"
              onClick={() => { setNewLabelParentId(null); setShowNewLabelModal(true); }}
              title="Create label"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>
          <div className="csb-labels-list">
            {labelForest.map(node => renderLabelNode(node))}
            {labels.length === 0 && <div className="csb-smart-empty">No labels yet</div>}
          </div>
        </div>
      )}

      {/* Smart groups — saved filters with live membership (migration 442) */}
      {!collapsed && (
        <div className="csb-labels">
          <div className="csb-labels-hdr">
            <span className="csb-labels-title">Smart groups</span>
            <button
              type="button"
              className="csb-labels-add"
              onClick={() => navSmart(null)}
              title="New smart group"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>
          <div className="csb-labels-list">
            {smartGroups.map(g => {
              const active = currentView === 'smartgroup' && selectedSmartGroupId === g.id && !activeContact;
              return (
                <div key={g.id} className={`csb-label-row${active ? ' csb-label-row--on' : ''}`}>
                  <span className="csb-label-twist csb-label-twist--leaf" />
                  <button type="button" className="csb-label-btn" onClick={() => navSmart(g.id)}>
                    <Icon name="wand" size={14} />
                    <span className="csb-label-name">{g.name}</span>
                    {typeof g.count === 'number' && <span className="csb-nav-count">{g.count}</span>}
                  </button>
                  <button
                    type="button"
                    className="csb-label-del"
                    onClick={async () => {
                      await handleDeleteSmartGroup(g.id);
                      if (selectedSmartGroupId === g.id) navigate('/contacts');
                    }}
                    title="Delete smart group"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              );
            })}
            {smartGroups.length === 0 && <div className="csb-smart-empty">No smart groups yet</div>}
          </div>
        </div>
      )}

      {/* System links — pushed to bottom */}
      <div className="csb-sys">
        <label
          className={`csb-sys-item${collapsed ? ' csb-sys-item--icon' : ''}`}
          title={collapsed ? 'Import' : undefined}
        >
          <span className="csb-nav-icon"><Icon name="upload" size={15} /></span>
          {!collapsed && <span>Import</span>}
          <input
            ref={importRef}
            type="file"
            accept=".csv,.vcf"
            onChange={handleImportCSV}
            className="csb-file-input"
          />
        </label>
        <GoogleSyncItem collapsed={collapsed} onSynced={loadData} />
        <OutlookSyncItem collapsed={collapsed} onSynced={loadData} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`csb-sys-item${collapsed ? ' csb-sys-item--icon' : ''}`}
              title={collapsed ? 'Export' : undefined}
            >
              <span className="csb-nav-icon"><Icon name="download" size={15} /></span>
              {!collapsed && <span>Export</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right">
            <DropdownMenuItem onClick={handleExportCSV}>Export as CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportVCard}>Export as vCard (.vcf)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className={`csb-sys-item${currentView === 'trash' && !activeContact ? ' csb-sys-item--on' : ''}${collapsed ? ' csb-sys-item--icon' : ''}`}
          onClick={() => nav('trash')}
          title={collapsed ? 'Trash' : undefined}
        >
          <span className="csb-nav-icon"><Icon name="trash" size={15} /></span>
          {!collapsed && <span>Bin (Trash)</span>}
        </button>
      </div>

      {/* New label modal */}
      {showNewLabelModal && (
        <div className="csb-modal-overlay">
          <form onSubmit={handleCreateLabel} className="csb-modal">
            <h3 className="csb-modal-title">Create label</h3>
            <input
              className="input-field"
              required
              value={newLabelName}
              onChange={e => setNewLabelName(e.target.value)}
              placeholder="Label name"
              autoFocus
            />
            <label className="csb-modal-label">Parent label</label>
            <Select
              value={newLabelParentId ?? '__root__'}
              onValueChange={v => setNewLabelParentId(v === '__root__' ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">No parent (top level)</SelectItem>
                {flatLabels.map(n => (
                  <SelectItem key={n.label.id} value={n.label.id}>
                    {' '.repeat(n.depth * 2)}{n.label.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="csb-modal-btns">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setShowNewLabelModal(false); setNewLabelParentId(null); }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ── Header wired to contacts search ───────────────────────────────────────

function ContactsHeader() {
  const { searchQuery, setSearchQuery, filterOpen, setFilterOpen, filterLabelIds, sortBy } = useContacts();
  const hasActive = filterLabelIds.length > 0 || sortBy !== 'name-asc';
  return (
    <AppHeader
      appSearch={searchQuery}
      onAppSearchChange={setSearchQuery}
      appSearchPlaceholder="Search contacts by name, email, or phone…"
      filterControl={{ open: filterOpen, onToggle: () => setFilterOpen(!filterOpen), hasActive }}
    />
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────

export function ContactsShell() {
  return (
    <ContactsProvider>
      <WorkspaceApp appId="contacts">
        <div className="app-shell" data-contacts="true">
          <AppSidebar
            appId="contacts"
            sections={[]}
            fillNav={({ collapsed }) => <ContactsSidebarContent collapsed={collapsed} />}
          />
          <div className="app-main">
            <ContactsHeader />
            <div className="app-shell-content">
              <Routes>
                <Route element={<PageLayout />}>
                  <Route index element={<Contacts />} />
                  <Route path="contact/:contactId" element={<Contacts />} />
                  <Route path="directory"     element={<Contacts />} />
                  <Route path="frequent"      element={<Contacts />} />
                  <Route path="other"         element={<Contacts />} />
                  <Route path="favorites"     element={<Contacts />} />
                  <Route path="starred"       element={<Contacts />} />{/* legacy alias for favorites, kept so any existing link/bookmark still resolves */}
                  <Route path="merge"         element={<Contacts />} />
                  <Route path="trash"         element={<Contacts />} />
                  <Route path="label/:labelId" element={<Contacts />} />
                  <Route path="smart/new"      element={<Contacts />} />
                  <Route path="smart/:groupId" element={<Contacts />} />
                </Route>
                <Route path="google/callback" element={<ContactsGoogleCallback />} />
                <Route path="outlook/callback" element={<ContactsOutlookCallback />} />
                <Route path="*" element={<Navigate to="/contacts" replace />} />
              </Routes>
            </div>
          </div>
          <GoogleWorkspaceRightSidebar />
        </div>
      </WorkspaceApp>
    </ContactsProvider>
  );
}
