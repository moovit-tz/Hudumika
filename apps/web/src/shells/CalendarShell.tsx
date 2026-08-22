import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { CalendarApp } from '../pages/CalendarApp.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { fetchPeople, type Person } from '../lib/identity.js';
import {
  useTodos, useLists, updateTodo, Todo,
  useEvents, useCurrentCalendarDate, setCurrentCalendarDate,
  useMeetWithPeople, addMeetWithPerson, removeMeetWithPerson, MEET_WITH_COLORS,
} from '../data/calendarStore.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';

const NAV: SidebarSection[] = [];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const formatISODay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Compact date-picker for quick navigation — the main grid (CalendarApp)
 *  and this both read/write the same shared currentCalendarDate
 *  (calendarStore.ts), so picking a day here jumps the main view straight
 *  to it without either component needing to know about the other. */
function MiniMonthPicker() {
  const selected = useCurrentCalendarDate();
  const events = useEvents();
  const [displayMonth, setDisplayMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = new Date();

  const eventDays = React.useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) set.add(ev.start.slice(0, 10));
    return set;
  }, [events]);

  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function jump(delta: number) {
    setDisplayMonth(new Date(year, month + delta, 1));
  }
  function pick(d: Date) {
    setDisplayMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setCurrentCalendarDate(d);
  }

  return (
    <div style={{ padding: '12px 12px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{MONTH_NAMES[month]} {year}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" onClick={() => jump(-1)} title="Previous month" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', borderRadius: 6, color: 'var(--ink3)' }}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button type="button" onClick={() => jump(1)} title="Next month" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', borderRadius: 6, color: 'var(--ink3)' }}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink4)', padding: '2px 0' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isSel = isSameDay(d, selected);
          const isToday = isSameDay(d, today);
          const hasEvents = eventDays.has(formatISODay(d));
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(d)}
              title={d.toDateString()}
              style={{
                width: '100%', aspectRatio: '1', border: 'none', borderRadius: '50%', cursor: 'pointer',
                fontSize: 11, fontWeight: isToday ? 700 : 500, position: 'relative',
                background: isSel ? 'var(--teal)' : 'transparent',
                color: isSel ? '#fff' : isToday ? 'var(--teal)' : 'var(--ink2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
            >
              {d.getDate()}
              {hasEvents && !isSel && (
                <span style={{ position: 'absolute', bottom: 2, width: 3, height: 3, borderRadius: '50%', background: 'var(--teal)' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Meet with…" — search colleagues and see their busy/free blocks overlaid
 *  on the main week/day grid (CalendarApp reads the same shared
 *  useMeetWithPeople() list and does the fetching/rendering). This panel
 *  only owns who's selected, never the busy data itself. */
function MeetWithPanel() {
  const people = useMeetWithPeople();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      fetchPeople({ q: query.trim(), limit: 8 }).then(found => {
        if (alive) setResults(found.filter(p => !people.some(x => x.userId === p.id)));
      }).finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div style={{ padding: '0 12px 8px' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}
      >
        <Icon name="users" size={14} color="var(--ink3)" />
        Meet with…
        {people.length > 0 && (
          <span style={{ background: 'var(--teal-l)', color: 'var(--teal)', padding: '1px 7px', borderRadius: 10, fontSize: 10.5, fontWeight: 700 }}>{people.length}</span>
        )}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13} color="var(--ink4)" style={{ marginLeft: 'auto' }} />
      </button>
      {open && (
        <div style={{ paddingTop: 4 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search people…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5 }}
            />
            {(results.length > 0 || searching) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--elev)', zIndex: 20, maxHeight: 200, overflowY: 'auto' }}>
                {searching && <div style={{ padding: 8, fontSize: 12, color: 'var(--ink3)' }}>Searching…</div>}
                {!searching && results.map(p => (
                  <button
                    key={p.id} type="button"
                    onClick={() => { addMeetWithPerson({ userId: p.id, name: p.name, email: p.email }); setQuery(''); setResults([]); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <PersonAvatar userId={p.id} name={p.name} size={18} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                  </button>
                ))}
                {!searching && results.length === 0 && <div style={{ padding: 8, fontSize: 12, color: 'var(--ink3)' }}>No matches.</div>}
              </div>
            )}
          </div>
          {people.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {people.map((p, i) => (
                <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '3px 0' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: MEET_WITH_COLORS[i % MEET_WITH_COLORS.length], flexShrink: 0 }} />
                  <PersonAvatar userId={p.userId} name={p.name} size={18} />
                  <span style={{ flex: 1, color: 'var(--ink2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <button type="button" onClick={() => removeMeetWithPerson(p.userId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex', padding: 2 }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {people.length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', padding: '8px 2px 2px' }}>
              Add colleagues to see their busy times over the week/day grid.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodoSidebarContent({ collapsed }: { collapsed: boolean }) {
  const allTodos = useTodos();
  const lists = useLists();

  function handleDragStart(e: React.DragEvent, todo: Todo) {
    e.dataTransfer.setData('todoId', todo.id);
    e.dataTransfer.effectAllowed = 'copy';
  }

  if (collapsed) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
      {/* Google Calendar style "+ Create" pill button */}
      <div style={{ padding: '16px 12px 8px' }}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('calendar:open-create'))}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '10px 18px', borderRadius: 24, background: 'var(--card-bg, #fff)',
            border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
            cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--ink)', transition: 'box-shadow .2s, background .15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)'; e.currentTarget.style.background = 'var(--bg)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)'; e.currentTarget.style.background = 'var(--card-bg, #fff)'; }}
        >
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={16} />
          </div>
          Create Event
        </button>
      </div>

      <MiniMonthPicker />
      <MeetWithPanel />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 12px 16px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '0 12px 24px' }}>
      {lists.map(list => {
        const listTodos = allTodos.filter(t => t.listId === list.id && !t.completed && !t.deletedAt);
        if (listTodos.length === 0) return null;
        return (
          <div key={list.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--ink3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: list.color }} />
                {list.name}
              </span>
              <span style={{ background: 'var(--border)', padding: '1px 6px', borderRadius: 10, fontSize: 10, color: 'var(--ink2)', fontWeight: 600 }}>{listTodos.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {listTodos.map(todo => (
                <div
                  key={todo.id}
                  draggable
                  onDragStart={e => handleDragStart(e, todo)}
                  style={{
                    background: 'var(--white)', padding: '8px 10px', borderRadius: 7,
                    fontSize: 12.5, color: 'var(--ink)', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8,
                    border: '1px solid var(--border)', transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <button
                    onClick={() => updateTodo(todo.id, { completed: true })}
                    style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border2)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 500 }}>{todo.title}</span>
                  <Icon name="moreVertical" size={13} color="var(--ink4)" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'center', padding: '4px 0', opacity: 0.8 }}>
        Drag a task onto the calendar to schedule it
      </div>
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
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}
