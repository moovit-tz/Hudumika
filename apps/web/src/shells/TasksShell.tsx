import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { TasksApp } from '../pages/TasksApp.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import {
  useTodos, useLists, addList, deleteList,
  useActiveTaskView, setActiveTaskView,
  inboxListId, TaskViewId,
  fetchListShares, shareListWith, unshareList, ListShare,
  useLinkedTasks,
} from '../data/calendarStore.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';

async function searchColleagues(q: string): Promise<PickerItem[]> {
  const rows = await apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []);
  return (rows || []).map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email, avatarUserId: u.id, avatarKind: 'people' as const }));
}

/** Manage who a list is shared with — real colleagues tagged via
 *  EntityPicker (migration 284), not an org-chart. Lives in its own
 *  popover per list rather than a dedicated page: it's a quick, single
 *  add/remove action on an existing object, the same category as the
 *  Cloud "Share" button, not a multi-step form. */
function SharePopover({ listId, listName }: { listId: string; listName: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ListShare[] | null>(null);
  const [picked, setPicked] = useState<PickerItem | null>(null);
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchListShares(listId).then(setShares).catch(() => setShares([]));
  }, [open, listId]);

  async function add() {
    if (!picked || saving) return;
    setSaving(true);
    try {
      const share = await shareListWith(listId, picked.id, role);
      setShares(prev => [...(prev ?? []).filter(s => s.userId !== share.userId), share]);
      setPicked(null);
    } finally {
      setSaving(false);
    }
  }

  async function remove(userId: string) {
    setShares(prev => (prev ?? []).filter(s => s.userId !== userId));
    await unshareList(listId, userId).catch(() => {});
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title={`Share "${listName}"`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, flexShrink: 0, display: 'flex' }}
          onClick={e => e.stopPropagation()}>
          <Icon name="userPlus" size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: 280 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Share "{listName}"</div>
        {shares === null ? (
          <SectionLoading />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {shares.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Not shared with anyone yet.</div>}
            {shares.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{s.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'capitalize' }}>{s.role}</span>
                <button type="button" onClick={() => remove(s.userId)} title="Remove access"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, display: 'flex' }}>
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <EntityPicker value={picked} onChange={setPicked} search={searchColleagues} placeholder="Add a colleague…" />
          <div style={{ display: 'flex', gap: 6 }}>
            <Select value={role} onValueChange={v => setRole(v as 'viewer' | 'editor')}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Can view</SelectItem>
                <SelectItem value="editor">Can edit</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="default" size="sm" onClick={add} disabled={!picked || saving}>Add</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SMART_VIEWS: { id: TaskViewId; label: string; icon: 'list' | 'star' | 'calendar' | 'clock' | 'folder' | 'trash' | 'userCheck' }[] = [
  { id: 'inbox',    label: 'Inbox',    icon: 'list' },
  { id: 'today',    label: 'Today',    icon: 'star' },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar' },
  { id: 'anytime',  label: 'Anytime',  icon: 'folder' },
  { id: 'someday',  label: 'Someday',  icon: 'clock' },
  { id: 'assigned', label: 'Assigned to me', icon: 'userCheck' },
  { id: 'trash',    label: 'Trash',    icon: 'trash' },
];

function TasksSidebarContent({ collapsed }: { collapsed: boolean }) {
  const todos = useTodos();
  const lists = useLists();
  const linked = useLinkedTasks();
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
    if (id === 'assigned') return active.filter(t => !t.isOwner && !t.completed).length;
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
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left w-full ${
              isActive
                ? 'bg-teal/10 text-teal font-bold shadow-xs'
                : 'text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 font-medium'
            }`}
            data-ui-native-button=""
          >
            <Icon name={v.icon} size={15} color={isActive ? 'var(--teal)' : 'var(--ink3)'} />
            <span className="flex-1 truncate">{v.label}</span>
            {count > 0 && (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isActive ? 'bg-teal text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}

      {linked.length > 0 && (() => {
        const bySource = new Map<string, number>();
        for (const l of linked) bySource.set(l.sourceApp, (bySource.get(l.sourceApp) || 0) + 1);
        return (
          <>
            <div className="mx-2.5 mt-5 mb-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">From other apps</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTaskView('linked')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left w-full ${
                view === 'linked'
                  ? 'bg-teal/10 text-teal font-bold shadow-xs'
                  : 'text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 font-medium'
              }`}
              data-ui-native-button=""
            >
              <Icon name="externalLink" size={15} color={view === 'linked' ? 'var(--teal)' : 'var(--ink3)'} />
              <span className="flex-1 truncate">All</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                view === 'linked' ? 'bg-teal text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {linked.length}
              </span>
            </button>
            {[...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sourceApp, count]) => {
              const isActive = view === `linked:${sourceApp}`;
              return (
                <button
                  key={sourceApp}
                  type="button"
                  onClick={() => setActiveTaskView(`linked:${sourceApp}` as TaskViewId)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-1.5 rounded-lg text-xs transition-all text-left w-full ${
                    isActive
                      ? 'bg-teal/10 text-teal font-bold'
                      : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 font-medium'
                  }`}
                  data-ui-native-button=""
                >
                  <span className="flex-1 truncate">{sourceApp}</span>
                  <span className="text-[10.5px] font-bold">{count}</span>
                </button>
              );
            })}
          </>
        );
      })()}

      <div className="flex items-center justify-between mx-2.5 mt-5 mb-1.5">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Lists</span>
        <button
          type="button"
          onClick={() => setAddingList(true)}
          title="New list"
          className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
        >
          <Icon name="plus" size={13} />
        </button>
      </div>

      {lists.map(l => {
        const isActive = view === `list:${l.id}`;
        const count = active.filter(t => t.listId === l.id && !t.completed).length;
        return (
          <div key={l.id} className="flex items-center group">
            <button
              type="button"
              onClick={() => setActiveTaskView(`list:${l.id}` as TaskViewId)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left flex-1 min-w-0 ${
                isActive
                  ? 'bg-teal/10 text-teal font-bold shadow-xs'
                  : 'text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 font-medium'
              }`}
              data-ui-native-button=""
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
              <span className="flex-1 truncate">{l.name}</span>
              {l.shared && (
                <Icon name="userCheck" size={11} color={isActive ? 'var(--teal)' : 'var(--ink3)'} className="shrink-0" />
              )}
              {count > 0 && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  isActive ? 'bg-teal text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {count}
                </span>
              )}
            </button>
            {l.shared ? (
              <span
                title={`Shared by ${l.ownerName ?? 'a colleague'} · ${l.role === 'editor' ? 'can edit' : 'can view'}`}
                className="p-1 shrink-0 text-muted-foreground"
              >
                <Icon name="info" size={12} />
              </span>
            ) : (
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <SharePopover listId={l.id} listName={l.name} />
                {l.id !== inboxListId() && (
                  <button
                    type="button"
                    onClick={() => { if (isActive) setActiveTaskView('inbox'); deleteList(l.id); }}
                    title="Delete list"
                    className="p-1 text-muted-foreground hover:text-red-500 rounded cursor-pointer"
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
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
          className="mx-2.5 my-1 px-2.5 py-1.5 border border-teal rounded-lg text-xs bg-background text-foreground focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingList(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
        >
          <Icon name="plus" size={13} />
          <span>New list</span>
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
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}
