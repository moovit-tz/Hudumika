import React, { useState, useMemo } from 'react';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import {
  useTodos, useLists, addTodo, updateTodo, deleteTodo, restoreTodo, purgeTodo,
  addSubtask, updateSubtask, deleteSubtask,
  useActiveTaskView, setActiveTaskView, useEvents, useLinkedTasks, inboxListId,
  Todo, TaskStatus,
} from '../data/calendarStore.js';
import { Link } from 'react-router-dom';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Badge } from '../components/ui/badge.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';

const STATUS_META: Record<TaskStatus, { label: string; variant: 'gray' | 'brand' | 'warning' | 'info' | 'success' }> = {
  none:        { label: 'No status', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'brand' },
  in_review:   { label: 'In Review',   variant: 'warning' },
  waiting:     { label: 'Waiting',     variant: 'info' },
  completed:   { label: 'Completed',   variant: 'success' },
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function isOverdue(due?: string) { return !!due && due < todayStr(); }

function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(todayStr() + 'T00:00:00');
  const diffDays = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' (overdue)';
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

const VIEW_TITLES: Record<string, string> = {
  inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', anytime: 'Anytime', someday: 'Someday', trash: 'Trash',
};

export const TasksApp: React.FC = () => {
  const allTodos = useTodos();
  const lists = useLists();
  const linked = useLinkedTasks();
  const view = useActiveTaskView();
  const isMobile = useIsMobile();

  const [newTitle, setNewTitle] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const listMap = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l])), [lists]);
  const active = allTodos.filter(t => !t.deletedAt);

  const currentListId = view.startsWith('list:') ? view.slice(5) : null;
  const viewTitle = currentListId ? (listMap[currentListId]?.name || 'List') : (VIEW_TITLES[view] || 'Tasks');

  const rows: Todo[] = (() => {
    if (view === 'trash') return allTodos.filter(t => t.deletedAt);
    if (view === 'inbox') return active.filter(t => t.listId === inboxListId());
    if (view === 'today') return active.filter(t => t.due === todayStr() || (isOverdue(t.due) && !t.completed));
    if (view === 'upcoming') return active.filter(t => !!t.due);
    if (view === 'anytime') return active.filter(t => !t.due && !t.someday);
    if (view === 'someday') return active.filter(t => !!t.someday);
    if (currentListId) return active.filter(t => t.listId === currentListId);
    return active;
  })();

  const incomplete = [...rows.filter(t => !t.completed)].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.order - b.order);
  const completed = rows.filter(t => t.completed);

  const linkedShown = view === 'inbox' ? linked
    : view === 'today' ? linked.filter(l => l.due === todayStr() || (l.due && l.due < todayStr()))
    : view === 'upcoming' ? linked.filter(l => !!l.due)
    : [];

  function handleAdd() {
    if (!newTitle.trim()) return;
    const patch: Partial<Todo> & { title: string } = { title: newTitle.trim(), listId: currentListId || inboxListId() };
    if (view === 'today') patch.due = todayStr();
    if (view === 'someday') patch.someday = true;
    addTodo(patch);
    setNewTitle('');
  }

  function toggleExpand(id: string) { setExpandedId(prev => prev === id ? null : id); setNewSubtaskTitle(''); }

  const canAdd = view !== 'trash';

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: isMobile ? '16px 16px 0' : '32px 40px 0' }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{viewTitle}</h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink3)', marginBottom: 20 }}>
          {view === 'trash' ? 'Deleted tasks — restore or remove permanently.' : `${incomplete.length} task${incomplete.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 16px 24px' : '0 40px 40px' }}>

        {/* Quick add */}
        {canAdd && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, background: 'var(--white)', padding: 10, borderRadius: 12, border: '1px solid var(--border)' }}>
            <button type="button" onClick={handleAdd} title="Add task"
              style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--teal-l)', color: 'var(--teal)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="plus" size={16} />
            </button>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={currentListId ? `Add a task to ${listMap[currentListId]?.name || 'this list'}…` : 'Add a task…'}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14.5, background: 'transparent', color: 'var(--ink)' }}
            />
          </div>
        )}

        {linkedShown.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From other apps</div>
            {linkedShown.map(l => <LinkedTaskRow key={l.id} task={l} />)}
          </div>
        )}

        {rows.length === 0 && linkedShown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', fontSize: 14 }}>
            {view === 'trash' ? 'Trash is empty.' : 'Nothing here yet.'}
          </div>
        ) : view === 'upcoming' ? (
          <UpcomingGrouped todos={incomplete} listMap={listMap} expandedId={expandedId} onToggleExpand={toggleExpand}
            newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incomplete.map(t => (
              <TaskRow key={t.id} todo={t} list={listMap[t.listId]} expanded={expandedId === t.id} onToggleExpand={() => toggleExpand(t.id)}
                newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} trashed={view === 'trash'} />
            ))}
          </div>
        )}

        {completed.length > 0 && view !== 'trash' && (
          <div style={{ marginTop: 24 }}>
            <button type="button" onClick={() => setShowCompleted(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 12.5, fontWeight: 600, padding: '6px 0' }}>
              <Icon name={showCompleted ? 'chevronDown' : 'chevronRight'} size={13} />
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {completed.map(t => (
                  <TaskRow key={t.id} todo={t} list={listMap[t.listId]} expanded={expandedId === t.id} onToggleExpand={() => toggleExpand(t.id)}
                    newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} trashed={false} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    {!isMobile && <MeetingsPanel />}
    </div>
  );
};

function LinkedTaskRow({ task }: { task: import('../data/calendarStore.js').LinkedTask }) {
  return (
    <Link to={task.path} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textDecoration: 'none',
      background: 'var(--white)', borderRadius: 10, border: '1px dashed var(--border)',
    }}>
      <Icon name="externalLink" size={14} color="var(--ink3)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
          {task.sourceApp} · {task.sourceLabel}{task.due ? ` · Due ${task.due}` : ''}
        </div>
      </div>
    </Link>
  );
}

const EVENT_CATEGORY_COLOR: Record<string, string> = {
  work: '#1a73e8', personal: '#0f9d58', customs: '#ea580c', todo: 'var(--purple)',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function AvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, 4);
  const extra = names.length - shown.length;
  return (
    <div style={{ display: 'flex' }}>
      {shown.map((n, i) => (
        <div key={i} title={n} style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700,
          border: '2px solid var(--white)', marginLeft: i === 0 ? 0 : -8,
        }}>
          {initials(n)}
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--bg)', color: 'var(--ink3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
          border: '2px solid var(--white)', marginLeft: -8,
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function MeetingsPanel() {
  const events = useEvents();
  const today = new Date().toISOString().slice(0, 10);
  const todays = [...events].filter(e => e.start.startsWith(today)).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--white)', overflowY: 'auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="calendar" size={17} color="var(--teal)" /> Meetings Schedule
        </h2>
        <Link to="/calendar" title="Open Calendar" style={{ color: 'var(--ink3)', display: 'flex' }}>
          <Icon name="arrowUpRight" size={15} />
        </Link>
      </div>

      {todays.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink3)', fontSize: 13 }}>No meetings today.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {todays.map(ev => (
            <div key={ev.id} style={{ background: 'var(--bg)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: EVENT_CATEGORY_COLOR[ev.category] || 'var(--teal)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: EVENT_CATEGORY_COLOR[ev.category] || 'var(--teal)' }} />
                  {fmtTime(ev.start)} – {fmtTime(ev.end)}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{ev.title}</div>
              {ev.guests && ev.guests.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.guests.join(', ')}
                </div>
              )}
              {ev.guests && ev.guests.length > 0 && <AvatarStack names={ev.guests} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UpcomingGrouped({ todos, listMap, expandedId, onToggleExpand, newSubtaskTitle, setNewSubtaskTitle }: {
  todos: Todo[]; listMap: Record<string, { id: string; name: string; color: string }>;
  expandedId: string | null; onToggleExpand: (id: string) => void;
  newSubtaskTitle: string; setNewSubtaskTitle: (v: string) => void;
}) {
  const groups = new Map<string, Todo[]>();
  for (const t of todos) {
    const key = t.due!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const sortedKeys = [...groups.keys()].sort();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {sortedKeys.map(key => (
        <div key={key}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{new Date(key + 'T00:00:00').getDate()}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{dateGroupLabel(key)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.get(key)!.map(t => (
              <TaskRow key={t.id} todo={t} list={listMap[t.listId]} expanded={expandedId === t.id} onToggleExpand={() => onToggleExpand(t.id)}
                newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle} trashed={false} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskRow({ todo, list, expanded, onToggleExpand, newSubtaskTitle, setNewSubtaskTitle, trashed }: {
  todo: Todo; list?: { id: string; name: string; color: string };
  expanded: boolean; onToggleExpand: () => void;
  newSubtaskTitle: string; setNewSubtaskTitle: (v: string) => void;
  trashed: boolean;
}) {
  const statusMeta = STATUS_META[todo.status];
  const doneSubtasks = todo.subtasks.filter(s => s.completed).length;
  const [newTag, setNewTag] = useState('');

  function addTag() {
    const tag = newTag.trim().replace(/^#/, '');
    if (tag && !todo.tags.includes(tag)) updateTodo(todo.id, { tags: [...todo.tags, tag] });
    setNewTag('');
  }
  function removeTag(tag: string) {
    updateTodo(todo.id, { tags: todo.tags.filter(t => t !== tag) });
  }

  return (
    <div className="list-row-accent" data-variant={!trashed && todo.status !== 'none' ? statusMeta.variant : undefined}
      style={{
        background: 'var(--white)', borderRadius: 10, overflow: 'hidden',
        borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', opacity: todo.completed ? 0.6 : 1 }}>
        {trashed ? (
          <Icon name="trash" size={16} color="var(--ink3)" />
        ) : (
          <button
            type="button"
            onClick={() => updateTodo(todo.id, { completed: !todo.completed })}
            style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              border: todo.completed ? 'none' : '2px solid var(--border2)',
              background: todo.completed ? 'var(--teal)' : 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {todo.completed && <Icon name="check" size={12} color="#fff" />}
          </button>
        )}

        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onToggleExpand}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 14, fontWeight: 500, color: todo.completed ? 'var(--ink3)' : 'var(--ink)',
              textDecoration: todo.completed ? 'line-through' : 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {todo.title}
            </span>
            {todo.starred && <Icon name="star" size={13} color="var(--gold)" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            {list && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink3)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: list.color }} />
                {list.name}
              </span>
            )}
            {todo.due && <span style={{ fontSize: 11, color: isOverdue(todo.due) && !todo.completed ? 'var(--red)' : 'var(--ink3)' }}>{todo.due}</span>}
            {todo.subtasks.length > 0 && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{doneSubtasks}/{todo.subtasks.length} subtasks</span>}
            {todo.notes && <Icon name="fileText" size={11} color="var(--ink3)" />}
            {todo.tags.map(tag => (
              <span key={tag} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 7px', borderRadius: 10 }}>#{tag}</span>
            ))}
          </div>
        </div>

        {!trashed && todo.status !== 'none' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              </button>
            </DropdownMenuTrigger>
            <StatusMenuItems todoId={todo.id} />
          </DropdownMenu>
        )}
        {!trashed && todo.status === 'none' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title="Set status" style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 20, cursor: 'pointer', padding: '3px 9px', fontSize: 11, color: 'var(--ink3)' }}>+ Status</button>
            </DropdownMenuTrigger>
            <StatusMenuItems todoId={todo.id} />
          </DropdownMenu>
        )}

        {trashed ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" title="Restore" onClick={() => restoreTodo(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}><Icon name="refresh" size={15} /></button>
            <button type="button" title="Delete forever" onClick={() => purgeTodo(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6 }}><Icon name="trash" size={15} /></button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title="More" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}><Icon name="moreVertical" size={16} /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => updateTodo(todo.id, { starred: !todo.starred })}>
                <Icon name="star" size={13} className="text-muted-foreground" /> {todo.starred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateTodo(todo.id, { someday: !todo.someday, due: todo.someday ? todo.due : undefined })}>
                <Icon name="clock" size={13} className="text-muted-foreground" /> {todo.someday ? 'Remove from Someday' : 'Move to Someday'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => deleteTodo(todo.id)} className="text-destructive">
                <Icon name="trash" size={13} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={14} color="var(--ink3)" onClick={onToggleExpand} style={{ cursor: 'pointer' }} />
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <DatePicker
              date={parseDateOnly(todo.due)}
              onChange={d => updateTodo(todo.id, { due: toDateOnlyString(d) || undefined, someday: d ? false : todo.someday })}
              placeholder="Set due date"
              triggerClassName="w-auto h-8 text-xs"
              disabled={trashed}
            />
          </div>
          <textarea
            value={todo.notes || ''}
            onChange={e => updateTodo(todo.id, { notes: e.target.value })}
            placeholder="Notes…"
            rows={2}
            disabled={trashed}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, resize: 'none', background: 'var(--white)', color: 'var(--ink)', fontFamily: 'var(--font)' }}
          />

          {/* Tags */}
          {!trashed && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {todo.tags.map(tag => (
                <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-l)', padding: '3px 8px', borderRadius: 10 }}>
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', display: 'flex', padding: 0 }}><Icon name="x" size={10} /></button>
                </span>
              ))}
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTag(); }}
                onBlur={() => newTag.trim() && addTag()}
                placeholder="+ tag"
                style={{ width: 70, border: '1px dashed var(--border)', borderRadius: 10, padding: '3px 8px', fontSize: 11, background: 'transparent', color: 'var(--ink)', outline: 'none' }}
              />
            </div>
          )}

          {/* Subtasks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todo.subtasks.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => updateSubtask(todo.id, s.id, { completed: !s.completed })}
                  style={{ width: 16, height: 16, borderRadius: '50%', border: s.completed ? 'none' : '2px solid var(--border2)', background: s.completed ? 'var(--teal)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.completed && <Icon name="check" size={10} color="#fff" />}
                </button>
                <span style={{ flex: 1, fontSize: 13, color: s.completed ? 'var(--ink3)' : 'var(--ink)', textDecoration: s.completed ? 'line-through' : 'none' }}>{s.title}</span>
                <button type="button" onClick={() => deleteSubtask(todo.id, s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={12} /></button>
              </div>
            ))}
            {!trashed && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="plus" size={12} color="var(--ink3)" />
                <input
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                      addSubtask(todo.id, newSubtaskTitle.trim());
                      setNewSubtaskTitle('');
                    }
                  }}
                  placeholder="Add subtask…"
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent', color: 'var(--ink)' }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusMenuItems({ todoId }: { todoId: string }) {
  return (
    <DropdownMenuContent align="end">
      {(Object.keys(STATUS_META) as TaskStatus[]).map(s => (
        <DropdownMenuItem key={s} onClick={() => updateTodo(todoId, s === 'completed' ? { status: s, completed: true } : { status: s })}>
          <Badge variant={STATUS_META[s].variant}>{STATUS_META[s].label}</Badge>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}
