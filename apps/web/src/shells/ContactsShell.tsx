import { useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/Contacts.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { Contacts } from '../pages/Contacts.js';
import { ContactsProvider, useContacts } from './contacts-context.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';

// ── Sidebar content rendered inside AppSidebar via fillNav ─────────────────

function ContactsSidebarContent({ collapsed }: { collapsed: boolean }) {
  const {
    contacts, labels, duplicates,
    currentView, setCurrentView,
    selectedLabelId, setSelectedLabelId,
    activeContact, setActiveContact,
    handleDeleteLabel, handleImportCSV, handleExportCSV,
    showNewLabelModal, setShowNewLabelModal,
    newLabelName, setNewLabelName, handleCreateLabel,
    openContactModalRef,
  } = useContacts();

  const importRef = useRef<HTMLInputElement>(null);

  const activeCount = contacts.filter(c => c.status === 'ACTIVE').length;
  const favCount    = contacts.filter(c => c.is_favorite && c.status === 'ACTIVE').length;
  const mergeCount  = duplicates.length;

  const nav = (view: string, labelId?: string) => {
    setCurrentView(view as any);
    setSelectedLabelId(labelId ?? null);
    setActiveContact(null);
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
            accept=".csv"
            onChange={handleImportCSV}
            className="csb-file-input"
          />
        </label>
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
                  <Route path="starred" element={<Contacts />} />
                  <Route path="recent"  element={<Contacts />} />
                </Route>
                <Route path="*" element={<Navigate to="/contacts" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </WorkspaceApp>
    </ContactsProvider>
  );
}
