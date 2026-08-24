import React, { useState, useEffect } from 'react';
import { Icon, type IconName } from './Icon.js';
import { useTodos, addTodo, updateTodo, deleteTodo, useEvents, useCurrentCalendarDate, setCurrentCalendarDate, useAppSettings, updateAppSettings } from '../data/calendarStore.js';
import { PersonAvatar } from './PersonAvatar.js';
import { Switch } from './ui/switch.js';
import { Button } from './ui/button.js';
import { showAlert } from '../lib/alert.js';
import { apiFetch } from '../lib/api.js';
import { isRightSidebarCollapsed, toggleRightSidebar, RIGHT_SIDEBAR_TOGGLE_EVENT } from '../lib/rightSidebarState.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from './ui/dropdown-menu.js';
import './GoogleWorkspaceRightSidebar.css';

export type CompanionPanelId = 'tasks' | 'calendar' | 'esign' | 'chat' | 'notifications' | 'analytics' | 'notes' | 'sms' | 'contacts' | 'ai' | 'starred' | 'settings' | null;

interface RailApp {
  id: Exclude<CompanionPanelId, null | 'starred' | 'settings'>;
  label: string;
  icon: IconName;
  color: string;
  /** Only offered/shown when this AppId is entitled for the tenant — apps
   *  that pull real tenant-scoped data (unlike Notes' local scratchpad or
   *  Calendar/Notifications, which are core platform features). */
  entitlementKey?: string;
}

const RAIL_APPS: RailApp[] = [
  { id: 'notes', label: 'Notes', icon: 'fileText', color: '#16a34a' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', color: '#0d9488' },
  { id: 'sms', label: 'SMS', icon: 'smartphone', color: '#dc2626', entitlementKey: 'sms' },
  { id: 'chat', label: 'Teams & Discussions', icon: 'messageSquare', color: '#7c3aed' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', color: '#ef4444' },
  { id: 'esign', label: 'eSign', icon: 'mail', color: '#0284c7', entitlementKey: 'sign' },
  { id: 'contacts', label: 'Contacts', icon: 'contact', color: '#2563eb', entitlementKey: 'contacts' },
  { id: 'ai', label: 'AI Assistant', icon: 'sparkle', color: 'var(--teal)', entitlementKey: 'ai' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', color: '#1a73e8' },
  { id: 'analytics', label: 'Analytics', icon: 'barChart', color: '#ea580c' },
];

const DEFAULT_PINNED: CompanionPanelId[] = ['notes', 'tasks', 'sms', 'chat', 'notifications', 'esign', 'contacts', 'ai'];

// Panels whose drawer shows a filterable list — the search button only
// appears for these, rather than on a scratchpad or a static toggle grid
// where "search" wouldn't do anything real.
const SEARCHABLE_PANELS = new Set<CompanionPanelId>(['tasks', 'calendar', 'esign', 'chat', 'notifications', 'sms', 'contacts']);

// Real full-page route for panels that have one — drives the "open in app"
// button. Panels without a dedicated page (notifications, analytics,
// starred, settings, ai has its own but is listed explicitly) are omitted
// rather than linking somewhere fake.
const PANEL_ROUTES: Partial<Record<Exclude<CompanionPanelId, null>, string>> = {
  notes: '/notes', tasks: '/tasks', calendar: '/calendar', esign: '/sign',
  chat: '/chat', sms: '/sms', contacts: '/contacts', ai: '/ai', analytics: '/hudubi',
};
const PINNED_KEY = 'hudumika_companion_rail_apps';

function loadPinned(): CompanionPanelId[] {
  try {
    const saved = localStorage.getItem(PINNED_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_PINNED;
  } catch {
    return DEFAULT_PINNED;
  }
}

export const GoogleWorkspaceRightSidebar: React.FC = () => {
  const [activePanel, setActivePanel] = useState<CompanionPanelId>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [scratchNote, setScratchNote] = useState(() => localStorage.getItem('hudumika_quick_note') || '');
  const [pinnedIds, setPinnedIds] = useState<CompanionPanelId[]>(loadPinned);

  const todos = useTodos();
  const events = useEvents();
  const appSettings = useAppSettings();
  const currentDate = useCurrentCalendarDate();
  const enabledApps = useEnabledApps();

  const activeTodos = todos.filter(t => !t.completed && !t.deletedAt);

  // Sync quick note to localStorage
  useEffect(() => {
    localStorage.setItem('hudumika_quick_note', scratchNote);
  }, [scratchNote]);

  useEffect(() => {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  function togglePinned(id: CompanionPanelId) {
    setPinnedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // ── eSign envelopes awaiting my signature — real, /v1/sign/envelopes ──
  const [envelopes, setEnvelopes] = useState<{ id: string; title: string; status: string }[]>([]);
  useEffect(() => {
    apiFetch('/v1/sign/envelopes?view=inbox')
      .then(rows => setEnvelopes(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  // ── Notifications — real, /v1/notifications ──
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  useEffect(() => {
    apiFetch('/v1/notifications')
      .then(res => {
        setNotifs(Array.isArray(res?.notifications) ? res.notifications : []);
        setUnreadNotifCount(typeof res?.unread_count === 'number' ? res.unread_count : 0);
      })
      .catch(() => {});
  }, []);
  async function markAllNotificationsRead() {
    try {
      await apiFetch('/v1/notifications/read-all', { method: 'PATCH' });
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadNotifCount(0);
    } catch (err: any) {
      showAlert(err?.message || 'Could not mark notifications as read.');
    }
  }

  // ── Team chat — real, /v1/chat/channels (same backend EmailRightToolMenu uses) ──
  const [channels, setChannels] = useState<{ id: string; name: string; unread: number; last_message: string | null; last_message_at: string | null }[]>([]);
  useEffect(() => {
    apiFetch('/v1/chat/channels')
      .then(res => setChannels(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }, []);
  const totalUnreadChats = channels.reduce((sum, c) => sum + (c.unread || 0), 0);

  // ── SMS — real, /v1/sms/messages (only fetched if the app is entitled) ──
  const smsEnabled = isAppEnabled('sms', enabledApps);
  const [smsMessages, setSmsMessages] = useState<{ id: string; to_number: string; contact_name: string | null; body: string; status: string; created_at: string }[]>([]);
  useEffect(() => {
    if (!smsEnabled) return;
    apiFetch('/v1/sms/messages?limit=6')
      .then(res => setSmsMessages(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }, [smsEnabled]);

  // ── Contacts — real, /v1/contacts (only fetched if the app is entitled) ──
  const contactsEnabled = isAppEnabled('contacts', enabledApps);
  const [contacts, setContacts] = useState<{ id: string; first_name: string; last_name: string | null; email: string | null; company: string | null }[]>([]);
  useEffect(() => {
    if (!contactsEnabled) return;
    apiFetch('/v1/contacts')
      .then(rows => setContacts(Array.isArray(rows) ? rows.slice(0, 8) : []))
      .catch(() => {});
  }, [contactsEnabled]);

  // ── AI Assistant — real, /v1/ai/chat (agentic chat, tenant memory + tools) ──
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);

  async function handleSendAiMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = aiInput.trim();
    if (!text || aiSending) return;
    setAiMessages(prev => [...prev, { role: 'user', content: text }]);
    setAiInput('');
    setAiSending(true);
    setAiError(null);
    try {
      const res = await apiFetch('/v1/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, conversation_id: aiConversationId }),
      });
      setAiConversationId(res.conversation_id ?? aiConversationId);
      setAiMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err: any) {
      setAiError(err?.message || 'Could not reach the AI assistant.');
    } finally {
      setAiSending(false);
    }
  }

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchTerm = searchOpen ? searchQuery.trim().toLowerCase() : '';
  function matches(...fields: (string | null | undefined)[]) {
    return !searchTerm || fields.some(f => f?.toLowerCase().includes(searchTerm));
  }

  function togglePanel(id: CompanionPanelId) {
    setActivePanel(prev => prev === id ? null : id);
    setSearchOpen(false);
    setSearchQuery('');
  }

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    addTodo({ title: newTaskTitle.trim() });
    setNewTaskTitle('');
  }

  const [collapsed, setCollapsed] = useState(isRightSidebarCollapsed);

  useEffect(() => {
    function handleToggle(e: Event) {
      setCollapsed((e as CustomEvent<boolean>).detail);
    }
    window.addEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  function badgeFor(id: CompanionPanelId): { count: number; color: 'teal' | 'blue' | 'red' } | null {
    if (id === 'tasks' && activeTodos.length > 0) return { count: activeTodos.length, color: 'teal' };
    if (id === 'esign' && envelopes.length > 0) return { count: envelopes.length, color: 'blue' };
    if (id === 'chat' && totalUnreadChats > 0) return { count: totalUnreadChats, color: 'blue' };
    if (id === 'notifications' && unreadNotifCount > 0) return { count: unreadNotifCount, color: 'red' };
    return null;
  }

  // Available apps this tenant can actually use — entitlement-gated ones
  // (sms, esign, contacts) drop out entirely, rather than pinning a rail icon
  // that would only ever render an empty/permission-denied panel.
  const availableApps = RAIL_APPS.filter(app => !app.entitlementKey || isAppEnabled(app.entitlementKey, enabledApps));

  // The rail shows every pinned, available app — except whichever one is
  // currently open, since its content already fills the drawer.
  const railApps = availableApps.filter(app => pinnedIds.includes(app.id) && app.id !== activePanel);

  return (
    <div className="gws-right-sidebar-root">
      {/* ── 320px Companion Side Drawer ── */}
      {activePanel && (
        <div className="gws-drawer">
          {/* Header */}
          <div className="gws-drawer-header">
            <div className="gws-drawer-title">
              {activePanel === 'tasks' && <><Icon name="tasks" size={17} style={{ color: '#0d9488' }} /> Tasks</>}
              {activePanel === 'calendar' && <><Icon name="calendar" size={17} style={{ color: '#1a73e8' }} /> Schedule Agenda</>}
              {activePanel === 'esign' && <><Icon name="fileText" size={17} style={{ color: '#0284c7' }} /> eSign</>}
              {activePanel === 'chat' && <><Icon name="messageSquare" size={17} style={{ color: '#7c3aed' }} /> Team Chat &amp; Mentions</>}
              {activePanel === 'notifications' && <><Icon name="bell" size={17} style={{ color: '#ef4444' }} /> Notifications</>}
              {activePanel === 'analytics' && <><Icon name="barChart" size={17} style={{ color: '#ea580c' }} /> Workspace Stats</>}
              {activePanel === 'notes' && <><Icon name="fileText" size={17} style={{ color: '#16a34a' }} /> Quick Notepad</>}
              {activePanel === 'sms' && <><Icon name="smartphone" size={17} style={{ color: '#dc2626' }} /> SMS</>}
              {activePanel === 'contacts' && <><Icon name="contact" size={17} style={{ color: '#2563eb' }} /> Contacts</>}
              {activePanel === 'ai' && <><Icon name="sparkle" size={17} style={{ color: 'var(--teal)' }} /> AI Assistant</>}
              {activePanel === 'starred' && <><Icon name="star" size={17} style={{ color: '#0d9488' }} /> Starred Shortcuts</>}
              {activePanel === 'settings' && <><Icon name="settings" size={17} style={{ color: 'var(--ink2)' }} /> Quick Settings</>}
            </div>
            <div className="gws-drawer-actions">
              {SEARCHABLE_PANELS.has(activePanel) && (
                <button
                  className={`gws-drawer-action ${searchOpen ? 'active' : ''}`}
                  onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
                  title="Search"
                >
                  <Icon name="search" size={15} />
                </button>
              )}
              {PANEL_ROUTES[activePanel] && (
                <a className="gws-drawer-action" href={PANEL_ROUTES[activePanel]} target="_blank" rel="noreferrer" title="Open full app">
                  <Icon name="externalLink" size={15} />
                </a>
              )}
              <button className="gws-drawer-action" onClick={() => setActivePanel(null)} title="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="gws-drawer-search-row">
              <Icon name="search" size={14} style={{ color: 'var(--ink3)' }} />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="gws-drawer-search-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="gws-drawer-search-clear">
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          )}

          {/* Drawer Body Content */}
          <div className="gws-drawer-body">
            {/* TASKS PANEL */}
            {activePanel === 'tasks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <form onSubmit={handleCreateTask} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="+ Add a task"
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--ink)' }}
                  />
                  <Button type="submit" size="xs" style={{ background: 'var(--teal)', color: '#fff' }}>Add</Button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {todos.filter(t => matches(t.title)).map(todo => (
                    <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => updateTodo(todo.id, { completed: !todo.completed })}
                        style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${todo.completed ? 'var(--teal)' : 'var(--border2)'}`, background: todo.completed ? 'var(--teal)' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {todo.completed && <Icon name="check" size={10} style={{ color: '#fff' }} />}
                      </button>
                      <span style={{ flex: 1, fontSize: 13, color: todo.completed ? 'var(--ink3)' : 'var(--ink)', textDecoration: todo.completed ? 'line-through' : 'none' }}>
                        {todo.title}
                      </span>
                      <button type="button" onClick={() => deleteTodo(todo.id)} style={{ background: 'none', border: 'none', color: 'var(--ink4)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                  {todos.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No tasks. Add one above!</div>
                  )}
                </div>
              </div>
            )}

            {/* CALENDAR PANEL */}
            {activePanel === 'calendar' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Upcoming Events</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {events.filter(ev => matches(ev.title)).slice(0, 6).map(ev => (
                    <div key={ev.id} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{ev.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                        {new Date(ev.start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No events scheduled</div>
                  )}
                </div>
              </div>
            )}

            {/* ESIGN PANEL — real, /v1/sign/envelopes?view=inbox */}
            {activePanel === 'esign' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>
                  {envelopes.length} Envelope Request{envelopes.length === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {envelopes.filter(env => matches(env.title)).map(env => (
                    <a key={env.id} href="/sign" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Icon name="fileText" size={16} style={{ color: 'var(--teal)' }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{env.title}</span>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', textTransform: 'capitalize' }}>
                        {env.status}
                      </span>
                    </a>
                  ))}
                  {envelopes.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>Nothing waiting on your signature.</div>
                  )}
                </div>
              </div>
            )}

            {/* CHAT PANEL — real, /v1/chat/channels (same backend EmailRightToolMenu uses) */}
            {activePanel === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Team Activity &amp; Discussions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {channels.filter(c => matches(c.name, c.last_message)).map(c => (
                    <a key={c.id} href="/chat" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', gap: 10, textDecoration: 'none' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(124,58,237,0.12)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="messageSquare" size={13} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                          {c.unread > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', flexShrink: 0 }}>{c.unread}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message || 'No messages yet'}</div>
                      </div>
                    </a>
                  ))}
                  {channels.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No conversations yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* NOTIFICATIONS PANEL — real, /v1/notifications */}
            {activePanel === 'notifications' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>{notifs.length} Notifications</span>
                  {unreadNotifCount > 0 && (
                    <button type="button" onClick={markAllNotificationsRead} style={{ fontSize: 11.5, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark read</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notifs.filter(n => matches(n.title)).map(n => (
                    <div key={n.id} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', marginTop: 4, flexShrink: 0 }} />}
                      <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: n.read ? 500 : 700 }}>{n.title}</div>
                    </div>
                  ))}
                  {notifs.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No notifications.</div>
                  )}
                </div>
              </div>
            )}

            {/* ANALYTICS PANEL */}
            {activePanel === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Live KPI Metrics</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)' }}>{activeTodos.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Active Tasks</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1a73e8' }}>{events.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Scheduled Meetings</div>
                  </div>
                </div>
              </div>
            )}

            {/* NOTES PANEL */}
            {activePanel === 'notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Instant Scratchpad</div>
                <textarea
                  value={scratchNote}
                  onChange={e => setScratchNote(e.target.value)}
                  placeholder="Type quick notes here... automatically saved"
                  rows={12}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--ink)', resize: 'vertical' }}
                />
              </div>
            )}

            {/* SMS PANEL — real, /v1/sms/messages */}
            {activePanel === 'sms' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Messages</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {smsMessages.filter(m => matches(m.contact_name, m.to_number, m.body)).map(m => (
                    <a key={m.id} href="/sms/reports" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.contact_name || m.to_number}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', textTransform: 'capitalize', flexShrink: 0 }}>{m.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</div>
                    </a>
                  ))}
                  {smsMessages.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No messages sent yet.</div>
                  )}
                </div>
                <a href="/sms/compose" style={{ textAlign: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--teal)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>Quick send</a>
              </div>
            )}

            {/* CONTACTS PANEL — real, /v1/contacts */}
            {activePanel === 'contacts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Contacts ({contacts.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contacts.filter(c => matches(c.first_name, c.last_name, c.email, c.company)).map(c => (
                    <a key={c.id} href="/contacts" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(37,99,235,0.12)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700 }}>
                        {c.first_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name || ''}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || c.company || ''}</div>
                      </div>
                    </a>
                  ))}
                  {contacts.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No contacts yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* AI ASSISTANT PANEL — real, /v1/ai/chat (agentic chat, tenant memory + tools) */}
            {activePanel === 'ai' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                  {aiMessages.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>Ask anything about this workspace.</div>
                  )}
                  {aiMessages.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '8px 12px',
                        borderRadius: 10,
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        background: m.role === 'user' ? 'var(--teal)' : 'var(--card-bg)',
                        color: m.role === 'user' ? '#fff' : 'var(--ink)',
                        border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      {m.content}
                    </div>
                  ))}
                  {aiSending && (
                    <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--ink3)', padding: '8px 12px' }}>Thinking…</div>
                  )}
                  {aiError && (
                    <div style={{ fontSize: 12.5, color: '#dc2626', padding: '8px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)' }}>{aiError}</div>
                  )}
                </div>
                <form onSubmit={handleSendAiMessage} style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <input
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    placeholder="Ask the AI assistant…"
                    disabled={aiSending}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--ink)' }}
                  />
                  <Button type="submit" size="xs" disabled={aiSending || !aiInput.trim()} style={{ background: 'var(--teal)', color: '#fff' }}>Send</Button>
                </form>
              </div>
            )}

            {/* STARRED / STUDIO PANEL */}
            {activePanel === 'starred' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Quick Launchers</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a href="/studio" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
                    <Icon name="sparkle" size={16} style={{ color: 'var(--teal)' }} /> Workflow Studio
                  </a>
                  <a href="/sign" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
                    <Icon name="fileText" size={16} style={{ color: '#0284c7' }} /> eSign Dashboard
                  </a>
                  <a href="/calendar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
                    <Icon name="calendar" size={16} style={{ color: '#1a73e8' }} /> Calendar App
                  </a>
                </div>
              </div>
            )}

            {/* SETTINGS PANEL */}
            {activePanel === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Week starts Monday</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Calendar grid setting</div>
                  </div>
                  <Switch checked={appSettings.weekStartsMonday} onCheckedChange={v => updateAppSettings({ weekStartsMonday: v })} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 56px Vertical Rail ── */}
      <div className="gws-rail">
        {/* Continues the header's border-bottom line across this column —
            same 57px band as AppHeader and AppSidebar's .app-sb-brand. */}
        <div className="gws-rail-header" />

        {/* Collapse / expand toggle — floats on the left edge, mirroring
            AppSidebar's own .app-sb-toggle on the opposite side. */}
        <button
          type="button"
          className="gws-rail-toggle"
          onClick={toggleRightSidebar}
          title={collapsed ? "Show apps" : "Hide apps"}
        >
          <Icon name={collapsed ? "chevronLeft" : "chevronRight"} size={11} strokeWidth={2.5} />
        </button>

        {/* The pinned-app list — hidden while collapsed, but the rail itself
            (toggle, star, +, settings) always stays visible, never the whole
            component vanishing behind an unstyled floating pill. */}
        {!collapsed && (
          <div className="gws-rail-top">
            {/* Every pinned, entitled app — except whichever one is currently open */}
            {railApps.map(app => {
              const badge = badgeFor(app.id);
              return (
                <button
                  key={app.id}
                  className="gws-rail-btn"
                  onClick={() => togglePanel(app.id)}
                  title={app.label}
                >
                  <Icon name={app.icon} size={19} />
                  {badge && <span className={`gws-badge gws-badge-${badge.color}`}>{badge.count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Bottom Action Items */}
        <div className="gws-rail-bottom">
          {/* Starred / Add-ons Teal Button */}
          <button
            className="gws-starred-btn"
            onClick={() => togglePanel('starred')}
            title="Starred Apps & Add-ons"
          >
            <Icon name="star" size={18} />
          </button>

          {/* Add / remove which apps show in this rail — same idea as Google's own "+" add-ons picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="gws-rail-btn" title="Add apps to this panel">
                <Icon name="plus" size={19} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="left">
              <DropdownMenuLabel>Show in side panel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableApps.map(app => (
                <DropdownMenuCheckboxItem
                  key={app.id}
                  checked={pinnedIds.includes(app.id)}
                  onCheckedChange={() => togglePinned(app.id)}
                >
                  <Icon name={app.icon} size={14} style={{ marginRight: 6 }} /> {app.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="gws-divider" />

          {/* Settings */}
          <button
            className={`gws-rail-btn ${activePanel === 'settings' ? 'active' : ''}`}
            onClick={() => togglePanel('settings')}
            title="Quick Settings"
          >
            <Icon name="settings" size={19} />
          </button>
        </div>
      </div>
    </div>
  );
};
