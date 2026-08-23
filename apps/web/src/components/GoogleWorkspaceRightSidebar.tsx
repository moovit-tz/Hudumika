import React, { useState, useEffect } from 'react';
import { Icon, type IconName } from './Icon.js';
import { useTodos, addTodo, updateTodo, deleteTodo, useEvents, useCurrentCalendarDate, setCurrentCalendarDate, useAppSettings, updateAppSettings } from '../data/calendarStore.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { PersonAvatar } from './PersonAvatar.js';
import { Switch } from './ui/switch.js';
import { Button } from './ui/button.js';
import { showAlert } from '../lib/alert.js';
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

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('gws_right_sidebar_collapsed') === 'true');

  useEffect(() => {
    function handleToggle() {
      setCollapsed(prev => {
        const next = !prev;
        localStorage.setItem('gws_right_sidebar_collapsed', String(next));
        return next;
      });
    }
    window.addEventListener('gws-sidebar:toggle', handleToggle);
    return () => window.removeEventListener('gws-sidebar:toggle', handleToggle);
  }, []);

  return (
    <div className={`gws-right-sidebar-root ${collapsed ? 'collapsed' : ''}`} style={{ display: collapsed && !activePanel ? 'none' : 'flex' }}>
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

            {/* ESIGN PANEL */}
            {activePanel === 'esign' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>12 Envelope Requests</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['MOU Agreement - Port Operations.pdf', 'Customs Declaration #8921.pdf', 'Carrier Transit Authorization.pdf'].map((doc, i) => (
                    <div key={i} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Icon name="fileText" size={16} style={{ color: 'var(--teal)' }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc}</span>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)' }}>
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CHAT PANEL */}
            {activePanel === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Team Activity &amp; Discussions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', gap: 10 }}>
                    <PersonAvatar userId="1" name="Robert Ndekeye" size={24} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>Robert Ndekeye</div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>"Updated the shipping tariff schedule for Q3."</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 4 }}>12 mins ago</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NOTIFICATIONS PANEL */}
            {activePanel === 'notifications' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>36 Notifications</span>
                  <button type="button" onClick={() => showAlert('All notifications marked as read')} style={{ fontSize: 11.5, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark read</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['New declaration approved', 'Container #TZ-9921 arrived at ICD', 'Invoice #INV-2026 paid'].map((note, i) => (
                    <div key={i} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', marginTop: 4, flexShrink: 0 }} />
                      <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{note}</div>
                    </div>
                  ))}
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
          {/* Collapse/Hide Rail Button */}
          <button
            className="gws-rail-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('gws-sidebar:toggle'))}
            title="Collapse companion panel"
            style={{ marginBottom: 4 }}
          >
            <Icon name="chevronRight" size={17} />
          </button>

          {/* 1. Tasks / Keep */}
          <button
            className={`gws-rail-btn ${activePanel === 'tasks' ? 'active' : ''}`}
            onClick={() => togglePanel('tasks')}
            title="Tasks / Keep"
          >
            <Icon name="tasks" size={19} />
            <span className="gws-badge gws-badge-teal">1</span>
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
            <span className="gws-badge gws-badge-blue">12</span>
          </button>

          {/* 4. Chat / Comments */}
          <button
            className={`gws-rail-btn ${activePanel === 'chat' ? 'active' : ''}`}
            onClick={() => togglePanel('chat')}
            title="Team Discussions & Chat"
          >
            <Icon name="messageSquare" size={19} />
          </button>

          {/* 5. Notifications */}
          <button
            className={`gws-rail-btn ${activePanel === 'notifications' ? 'active' : ''}`}
            onClick={() => togglePanel('notifications')}
            title="Notifications"
          >
            <Icon name="bell" size={19} />
            <span className="gws-badge gws-badge-red">36</span>
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
        </div>
      </div>
    </div>
  );
};
