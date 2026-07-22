import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { CalendarApp } from '../pages/CalendarApp.js';
import { Icon } from '../components/Icon.js';
import { useTodos, useLists, updateTodo, Todo } from '../data/calendarStore.js';

const NAV: SidebarSection[] = [];

function TodoSidebarContent({ collapsed }: { collapsed: boolean }) {
  const allTodos = useTodos();
  const lists = useLists();

  function handleDragStart(e: React.DragEvent, todo: Todo) {
    e.dataTransfer.setData('todoId', todo.id);
    e.dataTransfer.effectAllowed = 'copy';
  }

  if (collapsed) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 12px 24px', flex: 1, overflowY: 'auto' }}>
      {lists.map(list => {
        const listTodos = allTodos.filter(t => t.listId === list.id && !t.completed && !t.deletedAt);
        if (listTodos.length === 0) return null;
        return (
          <div key={list.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--ink3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: list.color }} />
                {list.name}
              </span>
              <span style={{ background: 'var(--border)', padding: '2px 7px', borderRadius: 12, fontSize: 10, color: 'var(--ink2)', fontWeight: 600 }}>{listTodos.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {listTodos.map(todo => (
                <div
                  key={todo.id}
                  draggable
                  onDragStart={e => handleDragStart(e, todo)}
                  style={{
                    background: 'var(--white)', padding: '10px 12px', borderRadius: 8,
                    fontSize: 13, color: 'var(--ink)', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 10,
                    border: '1px solid var(--border)', transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <button
                    onClick={() => updateTodo(todo.id, { completed: true })}
                    style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border2)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 500 }}>{todo.title}</span>
                  <Icon name="moreVertical" size={14} color="var(--ink4)" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'center', padding: '8px 0', opacity: 0.8 }}>
        Drag a task onto the calendar to schedule it
      </div>
    </div>
  );
}

export function CalendarShell() {
  return (
    <WorkspaceApp appId="calendar">
      <div className="app-shell">
        <AppSidebar
          appId="calendar"
          sections={NAV}
          fillNav={({ collapsed }) => <TodoSidebarContent collapsed={collapsed} />}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route index element={<CalendarApp />} />
              <Route path="*" element={<Navigate to="/calendar" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}
