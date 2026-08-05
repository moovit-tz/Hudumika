import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { Icon } from '../components/Icon.js';
import { TasksApp } from '../pages/TasksApp.js';
import {
  useTodos, useLists, addList, deleteList,
  useActiveTaskView, setActiveTaskView,
  inboxListId, TaskViewId,
} from '../data/calendarStore.js';

const SMART_VIEWS: { id: TaskViewId; label: string; icon: 'list' | 'star' | 'calendar' | 'clock' | 'folder' | 'trash' }[] = [
  { id: 'inbox',    label: 'Inbox',    icon: 'list' },
  { id: 'today',    label: 'Today',    icon: 'star' },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar' },
  { id: 'anytime',  label: 'Anytime',  icon: 'folder' },
  { id: 'someday',  label: 'Someday',  icon: 'clock' },
  { id: 'trash',    label: 'Trash',    icon: 'trash' },
];

function TasksSidebarContent({ collapsed }: { collapsed: boolean }) {
  const todos = useTodos();
  const lists = useLists();
  const view = useActiveTaskView();
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  const active = todos.filter(t => !t.deletedAt);
  const today = new Date().toISOString().slice(0, 10);

  function countFor(id: TaskViewId): number {
    if (id === 'trash') return todos.filter(t => t.deletedAt).length;
    if (id === 'inbox') return active.filter(t => t.listId === inboxListId() && !t.completed).length;
    if (id === 'today') return active.filter(t => (t.due === today || (!!t.due && t.due < today)) && !t.completed).length;
    if (id === 'upcoming') return active.filter(t => !!t.due && !t.completed).length;
    if (id === 'anytime') return active.filter(t => !t.due && !t.someday && !t.completed).length;
    if (id === 'someday') return active.filter(t => !!t.someday && !t.completed).length;
    return 0;
  }

  function commitNewList() {
    if (newListName.trim()) {
      const list = addList(newListName.trim());
      setActiveTaskView(`list:${list.id}`);
    }
    setNewListName('');
    setAddingList(false);
  }

  if (collapsed) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 8px 24px', flex: 1, overflowY: 'auto' }}>
      {SMART_VIEWS.map(v => {
        const count = countFor(v.id);
        const isActive = view === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => setActiveTaskView(v.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 10px', borderRadius: 'var(--r)',
              border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              background: isActive ? 'var(--teal-l)' : 'transparent',
              color: isActive ? 'var(--teal)' : 'var(--ink2)',
              fontWeight: isActive ? 700 : 500, fontSize: 14,
            }}
          >
            <Icon name={v.icon} size={15} color={isActive ? 'var(--teal)' : 'var(--ink3)'} />
            <span style={{ flex: 1 }}>{v.label}</span>
            {count > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--teal)' : 'var(--ink3)', background: isActive ? 'rgba(255,255,255,0.5)' : 'var(--bg)', padding: '1px 7px', borderRadius: 10 }}>{count}</span>
            )}
          </button>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 10px 6px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lists</span>
        <button type="button" onClick={() => setAddingList(true)} title="New list" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex' }}>
          <Icon name="plus" size={13} />
        </button>
      </div>

      {lists.map(l => {
        const isActive = view === `list:${l.id}`;
        const count = active.filter(t => t.listId === l.id && !t.completed).length;
        return (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveTaskView(`list:${l.id}` as TaskViewId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 10px', borderRadius: 'var(--r)',
                border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0,
                background: isActive ? 'var(--teal-l)' : 'transparent',
                color: isActive ? 'var(--teal)' : 'var(--ink2)',
                fontWeight: isActive ? 700 : 500, fontSize: 14,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
              {count > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--teal)' : 'var(--ink3)', flexShrink: 0 }}>{count}</span>
              )}
            </button>
            {l.id !== inboxListId() && (
              <button type="button" onClick={() => { if (isActive) setActiveTaskView('inbox'); deleteList(l.id); }} title="Delete list"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', padding: 4, flexShrink: 0 }}>
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        );
      })}

      {addingList ? (
        <input
          autoFocus
          value={newListName}
          onChange={e => setNewListName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitNewList(); if (e.key === 'Escape') { setAddingList(false); setNewListName(''); } }}
          onBlur={commitNewList}
          placeholder="List name…"
          style={{ margin: '2px 10px', padding: '6px 8px', border: '1px solid var(--teal)', borderRadius: 6, fontSize: 13, background: 'var(--white)', color: 'var(--ink)' }}
        />
      ) : (
        <button type="button" onClick={() => setAddingList(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 10px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--ink3)', fontSize: 13, textAlign: 'left' }}>
          <Icon name="plus" size={13} /> New list
        </button>
      )}
    </div>
  );
}

export function TasksShell() {
  return (
    <WorkspaceApp appId="tasks">
      <div className="app-shell">
        <AppSidebar
          appId="tasks"
          sections={[]}
          fillNav={({ collapsed }) => <TasksSidebarContent collapsed={collapsed} />}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route index element={<TasksApp />} />
              <Route path="*" element={<Navigate to="/tasks" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}
