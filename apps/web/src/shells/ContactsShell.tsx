import { useRef, useEffect, useState } from 'react';
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
import { ContactsProvider, useContacts } from './contacts-context.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

const GOOGLE_OAUTH_STATE_KEY = 'hudumika_google_contacts_oauth_state';

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  contacts_synced_count: number;
}

/** Sidebar "Sync" control — real Google OAuth + People API connection, not a
 * decorative toggle. See contacts-sync.routes.ts for the backend half. */
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
      showAlert(`Synced ${res.synced} contact${res.synced === 1 ? '' : 's'} from Google.`);
      loadStatus();
      onSynced();
    } catch (err: any) {
      showAlert(err.message || 'Sync failed.');
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
          title={collapsed ? 'Sync' : undefined}
        >
          <span className="csb-nav-icon"><Icon name="refresh" size={15} /></span>
          {!collapsed && <span>Sync</span>}
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
            <div className="text-xs text-muted-foreground mb-3">Import and keep your contacts in sync with your real Google account.</div>
            <button type="button" className="btn btn-primary btn-sm w-full" disabled={busy} onClick={handleConnect}>
              {busy ? 'Redirecting…' : 'Connect Google Account'}
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-foreground font-medium">{status.email}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {status.last_synced_at
                ? `Last synced ${new Date(status.last_synced_at).toLocaleString()} · ${status.contacts_synced_count} contacts`
                : 'Not synced yet'}
            </div>
            {status.last_sync_status === 'failed' && status.last_sync_error && (
              <div className="text-xs text-destructive mt-1">{status.last_sync_error}</div>
            )}
            <div className="flex gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={handleSync}>
                {busy ? 'Syncing…' : 'Sync Now'}
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
const VIEW_PATH: Record<string, string> = { contacts: '', favorites: 'favorites', merge: 'merge', trash: 'trash' };

function useContactsUrlSync() {
  const { setCurrentView, setSelectedLabelId } = useContacts();
  const location = useLocation();

  useEffect(() => {
    const parts = location.pathname.replace(/^\/contacts\/?/, '').split('/').filter(Boolean);
    const seg = parts[0];
    if (seg === 'label' && parts[1]) {
      setCurrentView('label');
      setSelectedLabelId(parts[1]);
    } else if (seg === 'favorites' || seg === 'starred') {
      setCurrentView('favorites');
      setSelectedLabelId(null);
    } else if (seg === 'merge') {
      setCurrentView('merge');
      setSelectedLabelId(null);
    } else if (seg === 'trash') {
      setCurrentView('trash');
      setSelectedLabelId(null);
    } else if (!seg) {
      setCurrentView('contacts');
      setSelectedLabelId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}

function ContactsSidebarContent({ collapsed }: { collapsed: boolean }) {
  const {
    contacts, labels, duplicates,
    currentView, setCurrentView,
    selectedLabelId, setSelectedLabelId,
    activeContact, setActiveContact,
    handleDeleteLabel, handleImportCSV, handleExportCSV, loadData,
    showNewLabelModal, setShowNewLabelModal,
    newLabelName, setNewLabelName, handleCreateLabel,
    openContactModalRef,
  } = useContacts();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const activeCount = contacts.filter(c => c.status === 'ACTIVE').length;
  const favCount    = contacts.filter(c => c.is_favorite && c.status === 'ACTIVE').length;
  const mergeCount  = duplicates.length;

  const nav = (view: string, labelId?: string) => {
    setCurrentView(view as any);
    setSelectedLabelId(labelId ?? null);
    setActiveContact(null);
    const path = view === 'label' ? `label/${labelId}` : (VIEW_PATH[view] ?? '');
    navigate(path ? `/contacts/${path}` : '/contacts');
  };

  const mainItems: { key: string; label: string; icon: IconName; count: number; badge: boolean }[] = [
    { key: 'contacts',  label: 'Contacts',    icon: 'user',     count: activeCount, badge: false },
    { key: 'favorites', label: 'Favourites',  icon: 'star',     count: favCount,    badge: false },
    { key: 'merge',     label: 'Merge & fix', icon: 'gitMerge', count: mergeCount,  badge: mergeCount > 0 },
  ];

  return (
    <>
      {/* Create contact button */}
      <div className="csb-create-wrap">
        <button
          type="button"
          className="csb-create-btn"
          onClick={() => openContactModalRef.current(null)}
          title="Create contact"
        >
          <svg width="22" height="22" viewBox="0 0 36 36" aria-hidden="true">
            <path fill="#34A853" d="M16 16v14h4V20z"/>
            <path fill="#4285F4" d="M30 16H20v4h14z"/>
            <path fill="#FBBC05" d="M6 16v4h10v-4z"/>
            <path fill="#EA4335" d="M20 16V6h-4v10z"/>
          </svg>
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

      {/* Labels */}
      {!collapsed && (
        <div className="csb-labels">
          <div className="csb-labels-hdr">
            <span className="csb-labels-title">Labels</span>
            <button
              type="button"
              className="csb-labels-add"
              onClick={() => setShowNewLabelModal(true)}
              title="Create label"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>
          <div className="csb-labels-list">
            {labels.map(label => {
              const active = currentView === 'label' && selectedLabelId === label.id && !activeContact;
              return (
                <div key={label.id} className={`csb-label-row${active ? ' csb-label-row--on' : ''}`}>
                  <button
                    type="button"
                    className="csb-label-btn"
                    onClick={() => nav('label', label.id)}
                  >
                    <Icon name="tag" size={14} />
                    <span className="csb-label-name">{label.name}</span>
                  </button>
                  <button
                    type="button"
                    className="csb-label-del"
                    onClick={() => handleDeleteLabel(label.id)}
                    title="Delete label"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              );
            })}
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
        <button
          type="button"
          className={`csb-sys-item${collapsed ? ' csb-sys-item--icon' : ''}`}
          onClick={handleExportCSV}
          title={collapsed ? 'Export' : undefined}
        >
          <span className="csb-nav-icon"><Icon name="download" size={15} /></span>
          {!collapsed && <span>Export</span>}
        </button>
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
            <div className="csb-modal-btns">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewLabelModal(false)}
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
                  <Route path="favorites"     element={<Contacts />} />
                  <Route path="starred"       element={<Contacts />} />{/* legacy alias for favorites, kept so any existing link/bookmark still resolves */}
                  <Route path="merge"         element={<Contacts />} />
                  <Route path="trash"         element={<Contacts />} />
                  <Route path="label/:labelId" element={<Contacts />} />
                </Route>
                <Route path="google/callback" element={<ContactsGoogleCallback />} />
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
