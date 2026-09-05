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
  return (rows || []).map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', padding: 4, flexShrink: 0, display: 'flex' }}
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', padding: 2, display: 'flex' }}>
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
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 10px', borderRadius: 'var(--r)',
              border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              background: isActive ? 'var(--teal-l)' : 'transparent',
              color: isActive ? 'var(--teal)' : 'var(--ink2)',
              fontWeight: isActive ? 700 : 500, fontSize: 14, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
          >
            <Icon name={v.icon} size={15} color={isActive ? 'var(--teal)' : 'var(--ink3)'} />
            <span style={{ flex: 1 }}>{v.label}</span>
            {count > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--teal)' : 'var(--ink3)', background: isActive ? 'rgba(255,255,255,0.5)' : 'var(--bg)', padding: '1px 7px', borderRadius: 10 }}>{count}</span>
            )}
          </button>
        );
      })}

      {linked.length > 0 && (() => {
        const bySource = new Map<string, number>();
        for (const l of linked) bySource.set(l.sourceApp, (bySource.get(l.sourceApp) || 0) + 1);
        return (
          <>
            <div style={{ margin: '18px 10px 6px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From other apps</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTaskView('linked')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 10px', borderRadius: 'var(--r)',
                border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                background: view === 'linked' ? 'var(--teal-l)' : 'transparent',
                color: view === 'linked' ? 'var(--teal)' : 'var(--ink2)',
                fontWeight: view === 'linked' ? 700 : 500, fontSize: 14, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}
            >
              <Icon name="externalLink" size={15} color={view === 'linked' ? 'var(--teal)' : 'var(--ink3)'} />
              <span style={{ flex: 1 }}>All</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: view === 'linked' ? 'var(--teal)' : 'var(--ink3)', background: view === 'linked' ? 'rgba(255,255,255,0.5)' : 'var(--bg)', padding: '1px 7px', borderRadius: 10 }}>{linked.length}</span>
            </button>
            {[...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sourceApp, count]) => {
              const isActive = view === `linked:${sourceApp}`;
              return (
                <button
                  key={sourceApp}
                  type="button"
                  onClick={() => setActiveTaskView(`linked:${sourceApp}` as TaskViewId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 10px var(--ds-btn-py) 25px', borderRadius: 'var(--r)',
                    border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                    background: isActive ? 'var(--teal-l)' : 'transparent',
                    color: isActive ? 'var(--teal)' : 'var(--ink2)',
                    fontWeight: isActive ? 700 : 500, fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceApp}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--teal)' : 'var(--ink3)' }}>{count}</span>
                </button>
              );
            })}
          </>
        );
      })()}

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
                fontWeight: isActive ? 700 : 500, fontSize: 14, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
              {l.shared && (
                <Icon name="userCheck" size={11} color={isActive ? 'var(--teal)' : 'var(--ink4)'} style={{ flexShrink: 0 }} />
              )}
              {count > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--teal)' : 'var(--ink3)', flexShrink: 0 }}>{count}</span>
              )}
            </button>
            {/* A shared-with-me list isn't mine to manage sharing on or
                delete — shown with whose it is instead. */}
            {l.shared ? (
              <span title={`Shared by ${l.ownerName ?? 'a colleague'} · ${l.role === 'editor' ? 'can edit' : 'can view'}`}
                style={{ padding: 4, flexShrink: 0, display: 'flex', color: 'var(--ink4)' }}>
                <Icon name="info" size={12} />
              </span>
            ) : (
              <>
                <SharePopover listId={l.id} listName={l.name} />
                {l.id !== inboxListId() && (
                  <button type="button" onClick={() => { if (isActive) setActiveTaskView('inbox'); deleteList(l.id); }} title="Delete list"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', padding: 4, flexShrink: 0 }}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </>
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
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 10px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--ink3)', fontSize: 13, textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}
