import React, { useState, useEffect } from 'react';
import { Icon, type IconName } from './Icon.js';
import { useTodos, addTodo, updateTodo, deleteTodo, useEvents, useCurrentCalendarDate, setCurrentCalendarDate, useAppSettings, updateAppSettings } from '../data/calendarStore.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { PersonAvatar } from './PersonAvatar.js';
import { Switch } from './ui/switch.js';
import { Button } from './ui/button.js';
import { showAlert } from '../lib/alert.js';
import { apiFetch } from '../lib/api.js';
import { isRightSidebarCollapsed, toggleRightSidebar, RIGHT_SIDEBAR_TOGGLE_EVENT } from '../lib/rightSidebarState.js';
import './GoogleWorkspaceRightSidebar.css';

export type CompanionPanelId = 'tasks' | 'calendar' | 'esign' | 'chat' | 'notifications' | 'analytics' | 'notes' | 'starred' | 'settings' | null;

export const GoogleWorkspaceRightSidebar: React.FC = () => {
  const [activePanel, setActivePanel] = useState<CompanionPanelId>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [scratchNote, setScratchNote] = useState(() => localStorage.getItem('hudumika_quick_note') || '');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  const todos = useTodos();
  const events = useEvents();
  const appSettings = useAppSettings();
  const currentDate = useCurrentCalendarDate();

  const activeTodos = todos.filter(t => !t.completed && !t.deletedAt);

  // Sync quick note to localStorage
  useEffect(() => {
    localStorage.setItem('hudumika_quick_note', scratchNote);
  }, [scratchNote]);

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

  function togglePanel(id: CompanionPanelId) {
    setActivePanel(prev => prev === id ? null : id);
  }

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    addTodo({ title: newTaskTitle.trim() });
    setNewTaskTitle('');
  }

  function handleToggleTheme() {
    toggleThemeWithAnimation();
    setThemeMode(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }

  const [collapsed, setCollapsed] = useState(isRightSidebarCollapsed);

  useEffect(() => {
    function handleToggle(e: Event) {
      setCollapsed((e as CustomEvent<boolean>).detail);
    }
    window.addEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  if (collapsed && !activePanel) {
    return (
      <button
        type="button"
        className="gws-floating-expand-btn"
        onClick={toggleRightSidebar}
        title="Show side panel"
      >
        <Icon name="chevronLeft" size={17} />
      </button>
    );
  }

  return (
    <div className={`gws-right-sidebar-root ${collapsed ? 'collapsed' : ''}`}>
      {/* ── 320px Companion Side Drawer ── */}
      {activePanel && (
        <div className="gws-drawer">
          {/* Header */}
          <div className="gws-drawer-header">
            <div className="gws-drawer-title">
              {activePanel === 'tasks' && <><Icon name="tasks" size={17} style={{ color: '#0d9488' }} /> Tasks</>}
              {activePanel === 'calendar' && <><Icon name="calendar" size={17} style={{ color: '#1a73e8' }} /> Schedule Agenda</>}
              {activePanel === 'esign' && <><Icon name="fileText" size={17} style={{ color: '#0284c7' }} /> eSign Documents</>}
              {activePanel === 'chat' && <><Icon name="messageSquare" size={17} style={{ color: '#7c3aed' }} /> Team Chat &amp; Mentions</>}
              {activePanel === 'notifications' && <><Icon name="bell" size={17} style={{ color: '#ef4444' }} /> Notifications</>}
              {activePanel === 'analytics' && <><Icon name="barChart" size={17} style={{ color: '#ea580c' }} /> Workspace Stats</>}
              {activePanel === 'notes' && <><Icon name="fileText" size={17} style={{ color: '#16a34a' }} /> Quick Notepad</>}
              {activePanel === 'starred' && <><Icon name="star" size={17} style={{ color: '#0d9488' }} /> Starred Shortcuts</>}
              {activePanel === 'settings' && <><Icon name="settings" size={17} style={{ color: 'var(--ink2)' }} /> Quick Settings</>}
            </div>
            <button className="gws-drawer-close" onClick={() => setActivePanel(null)} title="Collapse companion panel">
              <Icon name="chevronRight" size={16} />
            </button>
          </div>

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
                  {todos.map(todo => (
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
                  {events.slice(0, 6).map(ev => (
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
                  {envelopes.map(env => (
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
                  {channels.map(c => (
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
                  {notifs.map(n => (
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Dark Theme</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Toggle dark mode UI</div>
                  </div>
                  <Switch checked={themeMode === 'dark'} onCheckedChange={handleToggleTheme} />
                </div>
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
        {/* Top Action Items */}
        <div className="gws-rail-top">
          {/* 1. Tasks / Keep */}
          <button
            className={`gws-rail-btn ${activePanel === 'tasks' ? 'active' : ''}`}
            onClick={() => togglePanel('tasks')}
            title="Tasks / Keep"
          >
            <Icon name="tasks" size={19} />
            {activeTodos.length > 0 && <span className="gws-badge gws-badge-teal">{activeTodos.length}</span>}
          </button>

          {/* 2. Calendar */}
          <button
            className={`gws-rail-btn ${activePanel === 'calendar' ? 'active' : ''}`}
            onClick={() => togglePanel('calendar')}
            title="Calendar Schedule"
          >
            <Icon name="calendar" size={19} />
          </button>

          {/* 3. eSign / Mail */}
          <button
            className={`gws-rail-btn ${activePanel === 'esign' ? 'active' : ''}`}
            onClick={() => togglePanel('esign')}
            title="eSign Documents / Mail"
          >
            <Icon name="mail" size={19} />
            {envelopes.length > 0 && <span className="gws-badge gws-badge-blue">{envelopes.length}</span>}
          </button>

          {/* 4. Chat / Comments */}
          <button
            className={`gws-rail-btn ${activePanel === 'chat' ? 'active' : ''}`}
            onClick={() => togglePanel('chat')}
            title="Team Discussions & Chat"
          >
            <Icon name="messageSquare" size={19} />
            {totalUnreadChats > 0 && <span className="gws-badge gws-badge-blue">{totalUnreadChats}</span>}
          </button>

          {/* 5. Notifications */}
          <button
            className={`gws-rail-btn ${activePanel === 'notifications' ? 'active' : ''}`}
            onClick={() => togglePanel('notifications')}
            title="Notifications"
          >
            <Icon name="bell" size={19} />
            {unreadNotifCount > 0 && <span className="gws-badge gws-badge-red">{unreadNotifCount}</span>}
          </button>

          {/* 6. Analytics / HuduBI */}
          <button
            className={`gws-rail-btn ${activePanel === 'analytics' ? 'active' : ''}`}
            onClick={() => togglePanel('analytics')}
            title="Workspace Analytics"
          >
            <Icon name="barChart" size={19} />
          </button>

          {/* 7. Notes / Scratchpad */}
          <button
            className={`gws-rail-btn ${activePanel === 'notes' ? 'active' : ''}`}
            onClick={() => togglePanel('notes')}
            title="Quick Notes"
          >
            <Icon name="fileText" size={19} />
          </button>
        </div>

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

          <div className="gws-divider" />

          {/* Settings */}
          <button
            className={`gws-rail-btn ${activePanel === 'settings' ? 'active' : ''}`}
            onClick={() => togglePanel('settings')}
            title="Quick Settings"
          >
            <Icon name="settings" size={19} />
          </button>

          {/* Bottom Right Collapse / Expand Side Panel Button (Google Calendar Style) */}
          <button
            className="gws-rail-btn"
            onClick={toggleRightSidebar}
            title={collapsed ? "Show side panel" : "Hide side panel"}
            style={{ marginTop: 4 }}
          >
            <Icon name={collapsed ? "chevronLeft" : "chevronRight"} size={17} />
          </button>
        </div>
      </div>
    </div>
  );
};
