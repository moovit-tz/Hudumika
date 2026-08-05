import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { MobileNavContext } from '../shells/WorkspaceApp.js';
import { showAlert } from '../lib/alert.js';
import { useEvents, addEvent, deleteEvent, useTodos, addTodo, updateTodo, deleteTodo, inboxListId } from '../data/calendarStore.js';
import { EmailRightToolMenu } from '../components/EmailRightToolMenu.js';
import './EmailApp.css';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'spam' | 'trash';
type Label  = 'Finance' | 'Shipments' | 'HR' | 'Urgent';
type Filter = 'all' | 'unread' | 'starred';

interface EmailAddress {
  name: string;
  email: string;
}

interface Email {
  id: string;
  folder: Folder;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  body: string;
  snippet: string;
  date: Date;
  read: boolean;
  starred: boolean;
  labels: Label[];
  hasAttachment?: boolean;
}

interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  showCc: boolean;
  showBcc: boolean;
}

const PAGE_SIZE = 15;

const AV_COLORS = [
  '#1a73e8', '#0b8043', '#d93025', '#e37400', '#ab47bc', '#00acc1',
  '#00838f', '#2e7d32', '#c62828', '#ad1457', '#6a1b9a', '#37474f',
];

function avColor(name: string): string {
  return AV_COLORS[((name ?? '?').charCodeAt(0)) % AV_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function fmtDate(d: Date): string {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const LABEL_COLORS: Record<Label, string> = {
  Finance:   'var(--blue)',
  Shipments: 'var(--teal)',
  HR:        'var(--green)',
  Urgent:    'var(--red)',
};

// ─── Avatar ─────────────────────────────────────────────────────────────────────

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 32 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: avColor(name), color: '#fff', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontWeight: 600, fontSize: size * 0.42, flexShrink: 0,
    userSelect: 'none',
  }}>
    {initials(name)}
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────────

export const EmailApp: React.FC = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { setMobileOpen } = useContext(MobileNavContext);

  // Derive active folder from URL path
  const folderFromPath = ((): Folder => {
    const p = location.pathname;
    if (p.endsWith('/starred')) return 'starred';
    if (p.endsWith('/sent'))    return 'sent';
    if (p.endsWith('/drafts'))  return 'drafts';
    if (p.endsWith('/spam'))    return 'spam';
    if (p.endsWith('/trash'))   return 'trash';
    return 'inbox';
  })();

  const [emails, setEmails] = useState<Email[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState<Folder>(folderFromPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterByLabel, setFilterByLabel] = useState<Label | null>(null);

  // Sync folder state when URL changes (sidebar nav click)
  useEffect(() => {
    setActiveFolder(folderFromPath);
    setSelectedId(null);
    setPage(0);
    setFilter('all');
    setFilterByLabel(null);
    setSearch('');
    setSelected(new Set());
  }, [folderFromPath]);

  // Reply composer
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');

  // Compose modal
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeData>({
    to: '', cc: '', bcc: '', subject: '', body: '', showCc: false, showBcc: false,
  });

  // Listen for compose trigger from sidebar button
  useEffect(() => {
    const handler = () => openCompose();
    window.addEventListener('hudumika:email-compose', handler);
    return () => window.removeEventListener('hudumika:email-compose', handler);
  }, []);

  // Mobile (for list/detail split only — sidebar handled by AppSidebar)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  // ── Draggable list/detail split ──────────────────────────────────────────────
  const [listWidth, setListWidth] = useState<number | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  // Reset width when email is deselected (list should fill full area)
  useEffect(() => {
    if (!selectedId) setListWidth(null);
  }, [selectedId]);

  function startDrag(e: React.MouseEvent) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = listWidth ?? 360;
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = ev.clientX - dragStartX.current;
      setListWidth(Math.max(260, Math.min(dragStartW.current + dx, 680)));
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // AI summary
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // Companion panel
  const [activeCompanion, setActiveCompanion] = useState<'calendar' | 'notes' | 'tasks' | 'contacts' | null>(null);

  // ── Calendar state — shared real store (same one Calendar/Tasks apps use) ─────
  const allEvents = useEvents();
  const todayStr = new Date().toISOString().slice(0, 10);
  const events = allEvents
    .filter(ev => ev.start.slice(0, 10) === todayStr)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(ev => ({ id: ev.id, time: ev.start.slice(11, 16), title: ev.title }));
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventTime, setNewEventTime] = useState('10:00');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const handleAddEvent = () => {
    if (!newEventTitle.trim()) return;
    const [h, m] = newEventTime.split(':');
    const startH = Number(h) || 0, startM = Number(m) || 0;
    const endH = (startH + 1) % 24;
    const pad = (n: number) => String(n).padStart(2, '0');
    addEvent({
      title: newEventTitle,
      start: `${todayStr}T${pad(startH)}:${pad(startM)}`,
      end: `${todayStr}T${pad(endH)}:${pad(startM)}`,
      category: 'work',
    });
    setNewEventTitle('');
    setShowAddEvent(false);
  };

  // ── Tasks state — shared real store (same one the Tasks app uses) ────────────
  const allTodos = useTodos();
  const tasks = allTodos.filter(t => !t.deletedAt).sort((a, b) => Number(a.completed) - Number(b.completed) || a.order - b.order);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const handleAddTask = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTaskTitle.trim()) {
      const listId = inboxListId();
      if (listId) addTodo({ title: newTaskTitle, listId });
      setNewTaskTitle('');
    }
  };
  const toggleTask = (id: string) => {
    const t = allTodos.find(x => x.id === id);
    if (t) updateTodo(id, { completed: !t.completed });
  };
  const deleteTask = (id: string, e: React.MouseEvent) => { e.stopPropagation(); deleteTodo(id); };

  // ── Contacts state ────────────────────────────────────────────────────────────
  const [contactTab, setContactTab] = useState<'thread' | 'all'>('thread');
  const [contactSearch, setContactSearch] = useState('');

  const [emailContacts, setEmailContacts] = useState<{ name: string; email: string }[]>([]);
  useEffect(() => {
    apiFetch('/v1/contacts')
      .then((rows: any[]) => {
        setEmailContacts(
          rows
            .filter(c => c.email)
            .map(c => ({ name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email, email: c.email }))
        );
      })
      .catch(() => {});
  }, []);

  // ── Notes state ───────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState([
    { id: 'n1', title: 'Namanga Border contact', body: 'Amani Korir: +254 712 345678', color: '#fff4e6' },
    { id: 'n2', title: 'Mikocheni Warehouse',    body: 'Gate entry code: 9912#',       color: '#e6fcf5' },
    { id: 'n3', title: 'MSC AMELIA Demurrage',   body: 'Rate is $120/day after free period.', color: '#f3f0ff' },
  ]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [newNoteColor, setNewNoteColor] = useState('#fff4e6');
  const [showAddNote, setShowAddNote] = useState(false);

  const handleAddNote = () => {
    if (!newNoteTitle.trim() && !newNoteBody.trim()) return;
    setNotes(prev => [...prev, { id: `n-${Date.now()}`, title: newNoteTitle, body: newNoteBody, color: newNoteColor }]);
    setNewNoteTitle('');
    setNewNoteBody('');
    setShowAddNote(false);
  };
  const deleteNote = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setNotes(prev => prev.filter(n => n.id !== id)); };

  // ── Email fetching ────────────────────────────────────────────────────────────

  const loadEmails = useCallback(async () => {
    setEmailsLoading(true);
    try {
      const data = await apiFetch(`/v1/emails?folder=${activeFolder}`);
      setEmails(Array.isArray(data) ? data.map((e: any) => ({
        id: String(e.id),
        folder: (e.folder ?? activeFolder) as Folder,
        from: e.from ?? { name: 'Unknown', email: '' },
        to: Array.isArray(e.to) ? e.to : [{ name: String(e.to ?? ''), email: String(e.to ?? '') }],
        cc: e.cc,
        subject: e.subject ?? '(no subject)',
        body: e.body ?? '',
        snippet: e.snippet ?? String(e.body ?? '').slice(0, 100),
        date: new Date(e.date ?? Date.now()),
        read: Boolean(e.read),
        starred: Boolean(e.starred),
        labels: Array.isArray(e.labels) ? e.labels : [],
        hasAttachment: Boolean(e.hasAttachment),
      })) : []);
    } catch (err: any) {
      showAlert(err.message || 'Failed to load emails');
    } finally {
      setEmailsLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => { loadEmails(); }, [loadEmails]);
  useEffect(() => {
    const id = setInterval(loadEmails, 30000);
    return () => clearInterval(id);
  }, [loadEmails]);

  // ── Derived list ──────────────────────────────────────────────────────────────

  const selectedEmail = emails.find(e => e.id === selectedId) ?? null;

  const allVisible = (() => {
    let list = emails.filter(e => {
      if (activeFolder === 'starred') return e.starred;
      return e.folder === activeFolder;
    });
    if (filterByLabel) list = list.filter(e => e.labels.includes(filterByLabel));
    if (filter === 'unread')  list = list.filter(e => !e.read);
    if (filter === 'starred') list = list.filter(e => e.starred);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.from.name.toLowerCase().includes(q) ||
        e.snippet.toLowerCase().includes(q),
      );
    }
    return list;
  })();

  const totalPages = Math.ceil(allVisible.length / PAGE_SIZE);
  const pageEmails = allVisible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function selectEmail(id: string) {
    setSelectedId(id);
    setReplyOpen(false);
    setAiSummary(null);
    setAiPanelOpen(false);
    const em = emails.find(e => e.id === id);
    if (em && !em.read) {
      setEmails(prev => prev.map(e => e.id === id ? { ...e, read: true } : e));
      apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) }).catch(() => {});
    }
    if (em) { setReplySubject(`Re: ${em.subject}`); setReplyBody(''); }
  }

  function toggleStar(id: string, evt: React.MouseEvent) {
    evt.stopPropagation();
    const em = emails.find(e => e.id === id);
    const next = !em?.starred;
    setEmails(prev => prev.map(e => e.id === id ? { ...e, starred: next } : e));
    apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ starred: next }) })
      .catch(() => { setEmails(prev => prev.map(e => e.id === id ? { ...e, starred: !next } : e)); showAlert('Failed to update star'); });
  }

  function toggleSelect(id: string, evt: React.MouseEvent) {
    evt.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function bulkDelete() {
    const ids = Array.from(selected);
    setEmails(prev => prev.map(e => selected.has(e.id) ? { ...e, folder: 'trash' } : e));
    if (selectedId && selected.has(selectedId)) setSelectedId(null);
    setSelected(new Set());
    Promise.all(ids.map(id => apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ folder: 'trash' }) })))
      .catch(() => showAlert('Some messages failed to move to Trash'));
  }

  function archiveEmail(id: string) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, folder: 'trash' } : e));
    setSelectedId(null);
    apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ folder: 'trash' }) }).catch(() => showAlert('Failed to move message to Trash'));
  }

  function markUnread(id: string) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, read: false } : e));
    setSelectedId(null);
    apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ read: false }) }).catch(() => showAlert('Failed to mark unread'));
  }

  function changeFolder(folder: Folder) {
    const path = folder === 'inbox' ? '/email' : `/email/${folder}`;
    navigate(path);
    // State reset is handled by the useEffect on folderFromPath
  }

  async function sendReply() {
    if (!replyBody.trim() || !selectedEmail) return;
    try {
      await apiFetch('/v1/email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: selectedEmail.from.email,
          subject: replySubject || `Re: ${selectedEmail.subject}`,
          body: replyBody,
        }),
      });
      setReplyOpen(false);
      setReplyBody('');
      if (activeFolder === 'sent') loadEmails();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send reply');
    }
  }

  function openCompose(prefill?: Partial<ComposeData>) {
    setCompose({ to: '', cc: '', bcc: '', subject: '', body: '', showCc: false, showBcc: false, ...prefill });
    setComposeOpen(true);
  }

  function forwardEmail() {
    if (!selectedEmail) return;
    openCompose({
      subject: `Fwd: ${selectedEmail.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${selectedEmail.from.name} <${selectedEmail.from.email}>\nDate: ${fmtDateLong(selectedEmail.date)}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.body}`,
    });
  }

  async function sendCompose() {
    if (!compose.to.trim() || !compose.subject.trim()) return;
    try {
      await apiFetch('/v1/email/send', {
        method: 'POST',
        body: JSON.stringify({ to: compose.to, cc: compose.cc || undefined, subject: compose.subject, body: compose.body }),
      });
      setComposeOpen(false);
      if (activeFolder === 'sent') loadEmails();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send email');
    }
  }

  async function aiSummarise() {
    if (!selectedEmail) return;
    setAiLoading(true);
    setAiPanelOpen(true);
    setAiSummary(null);
    try {
      const res = await apiFetch('/v1/ai/summarise', {
        method: 'POST',
        body: JSON.stringify({ text: selectedEmail.body, mode: 'brief' }),
      });
      const data = res as { summary?: string; result?: string };
      setAiSummary(data.summary ?? data.result ?? 'Summary not available.');
    } catch {
      setAiSummary('Unable to generate summary at this time. Please try again later.');
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => { setPage(0); }, [filter, search, filterByLabel]);

  // ── Companion render helpers ──────────────────────────────────────────────────

  const renderCalendar = () => {
    const now = new Date();
    const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthLabel = viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const firstWeekday = (viewMonth.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const eventDaysWithCount = new Map<number, number>();
    allEvents.forEach(ev => {
      const evDate = new Date(ev.start);
      if (evDate.getFullYear() === viewMonth.getFullYear() && evDate.getMonth() === viewMonth.getMonth()) {
        eventDaysWithCount.set(evDate.getDate(), (eventDaysWithCount.get(evDate.getDate()) || 0) + 1);
      }
    });
    const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 9, padding: 12, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{monthLabel}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={() => setMonthOffset(m => m - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><Icon name="chevronLeft" size={13} /></button>
              <button type="button" onClick={() => setMonthOffset(m => m + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><Icon name="chevronRight" size={13} /></button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--ink3)', marginBottom: 6 }}>
            <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((dd, i) => {
              if (dd === null) return <div key={`pad-${i}`} />;
              const isToday = monthOffset === 0 && dd === now.getDate();
              const hasEvents = eventDaysWithCount.has(dd);
              return (
                <div key={dd} style={{ position: 'relative', fontSize: 11, fontWeight: isToday ? 800 : 500, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: isToday ? '#0b57d0' : 'transparent', color: isToday ? '#fff' : 'var(--ink)', cursor: 'pointer' }}>
                  {dd}
                  {hasEvents && !isToday && <span style={{ position: 'absolute', bottom: 1, width: 3, height: 3, borderRadius: '50%', background: '#0b57d0' }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Today's Schedule</span>
            {!showAddEvent && (
              <button type="button" onClick={() => setShowAddEvent(true)} style={{ background: 'none', border: 'none', color: '#0b57d0', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Icon name="plus" size={12} color="#0b57d0" /> Add
              </button>
            )}
          </div>
          {showAddEvent && (
            <div style={{ border: '0.5px solid var(--border)', borderRadius: 9, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, background: 'var(--bg)' }}>
              <input type="text" placeholder="Event title" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} style={{ padding: '6px 10px', borderRadius: 9, border: '0.5px solid var(--border)', fontSize: 12, outline: 'none', background: 'var(--white)' }} />
              <input type="text" placeholder="Time (e.g. 10:00)" value={newEventTime} onChange={e => setNewEventTime(e.target.value)} style={{ padding: '6px 10px', borderRadius: 9, border: '0.5px solid var(--border)', fontSize: 12, outline: 'none', background: 'var(--white)' }} />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddEvent(false)} style={{ background: 'none', border: 'none', fontSize: 11, cursor: 'pointer', color: 'var(--ink3)' }}>Cancel</button>
                <button type="button" onClick={handleAddEvent} style={{ background: '#0b57d0', color: '#fff', border: 'none', padding: 'var(--ds-btn-py-sm) 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map(ev => (
              <div key={ev.id} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 9, border: '0.5px solid var(--border)', background: 'var(--white)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 45, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0b57d0' }}>{ev.time}</span>
                </div>
                <div style={{ flex: 1, fontSize: 12, color: 'var(--ink)', fontWeight: 500, display: 'flex', alignItems: 'center' }}>{ev.title}</div>
                <button type="button" onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, display: 'flex', alignSelf: 'center' }}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTasks = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '0.5px solid var(--border)', borderRadius: 9, padding: '8px 12px', background: 'var(--bg)' }}>
        <Icon name="plus" size={14} color="var(--ink3)" />
        <input type="text" placeholder="Add a task" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={handleAddTask} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'var(--font)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tasks.map(t => (
          <div key={t.id} onClick={() => toggleTask(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderRadius: 9, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {t.completed ? <Icon name="checkCircle" size={16} color="#0b57d0" /> : <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--ink3)', display: 'inline-block' }} />}
            </div>
            <span style={{ fontSize: 13, color: t.completed ? 'var(--ink3)' : 'var(--ink)', textDecoration: t.completed ? 'line-through' : 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
            <button type="button" onClick={e => deleteTask(t.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignSelf: 'center' }}>
              <Icon name="trash" size={12} color="var(--ink3)" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderContacts = () => {
    const threadContacts = (() => {
      if (!selectedEmail) return [];
      const list = [selectedEmail.from, ...selectedEmail.to, ...(selectedEmail.cc ?? [])];
      const seen = new Set<string>();
      return list.filter(c => { if (seen.has(c.email.toLowerCase())) return false; seen.add(c.email.toLowerCase()); return true; });
    })();
    const filtered = emailContacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.email.toLowerCase().includes(contactSearch.toLowerCase()));
    const contactRow = (name: string, email: string, bg?: string) => (
      <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg ?? avColor(name), color: '#fff', fontWeight: 600, fontSize: 13 }}>{initials(name)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
          <span style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
        </div>
      </div>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border)', margin: '0 -16px 10px', padding: '0 16px' }}>
          {(['thread', 'all'] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setContactTab(tab)} style={{ flex: 1, padding: 'var(--ds-btn-py-lg) 0', fontSize: 13, fontWeight: contactTab === tab ? 600 : 500, color: contactTab === tab ? '#0b57d0' : 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `2px solid ${contactTab === tab ? '#0b57d0' : 'transparent'}`, marginBottom: -1, fontFamily: 'var(--font)' }}>
              {tab === 'thread' ? 'In this thread' : 'Contacts'}
            </button>
          ))}
        </div>
        {contactTab === 'thread' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {threadContacts.length === 0
              ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink3)', fontSize: 12.5 }}>Select an email to view contacts.</div>
              : threadContacts.map(c => contactRow(c.name, c.email))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '0.5px solid var(--border)', borderRadius: 9, padding: '6px 12px', background: 'var(--bg)' }}>
              <Icon name="search" size={13} color="var(--ink3)" />
              <input type="text" placeholder="Search contacts" value={contactSearch} onChange={e => setContactSearch(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, fontFamily: 'var(--font)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              {filtered.map(c => contactRow(c.name, c.email))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderNotes = () => {
    const noteColors = [
      { code: '#fff4e6', name: 'Yellow' }, { code: '#e6fcf5', name: 'Green' },
      { code: '#f3f0ff', name: 'Purple' }, { code: '#e8f0fe', name: 'Blue' },
      { code: '#fff0f0', name: 'Red' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!showAddNote ? (
          <div onClick={() => setShowAddNote(true)} style={{ border: '0.5px solid var(--border)', borderRadius: 9, padding: '10px 14px', background: 'var(--bg)', color: 'var(--ink3)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="edit" size={13} /><span>Take a note…</span>
          </div>
        ) : (
          <div style={{ border: '0.5px solid var(--border)', borderRadius: 9, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: newNoteColor }}>
            <input type="text" placeholder="Title" value={newNoteTitle} onChange={e => setNewNoteTitle(e.target.value)} style={{ padding: '4px 0', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }} />
            <textarea placeholder="Take a note…" value={newNoteBody} onChange={e => setNewNoteBody(e.target.value)} rows={3} style={{ padding: '4px 0', border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, color: 'var(--ink)', resize: 'none', fontFamily: 'var(--font)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {noteColors.map(c => <button key={c.code} type="button" onClick={() => setNewNoteColor(c.code)} style={{ width: 16, height: 16, borderRadius: '50%', background: c.code, border: newNoteColor === c.code ? '1.5px solid var(--ink)' : '0.5px solid var(--border)', cursor: 'pointer', padding: 0 }} title={c.name} />)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setShowAddNote(false)} style={{ background: 'none', border: 'none', fontSize: 11, cursor: 'pointer', color: 'var(--ink3)' }}>Cancel</button>
                <button type="button" onClick={handleAddNote} style={{ background: '#0b57d0', color: '#fff', border: 'none', padding: 'var(--ds-btn-py-sm) 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Done</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map(n => (
            <div key={n.id} style={{ background: n.color, border: '0.5px solid rgba(0,0,0,.1)', borderRadius: 9, padding: 12, position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {n.title && <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{n.title}</div>}
              <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.body}</div>
              <button type="button" onClick={e => deleteNote(n.id, e)} style={{ position: 'absolute', bottom: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, display: 'flex' }} title="Delete note">
                <Icon name="trash" size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="em-root">

      {/* Body — no internal sidebar; AppSidebar (from EmailShell) handles the left panel */}
      <div className="em-body">

        {/* Area 3: Email list — full width when nothing selected; fixed+draggable when email open */}
        {(!isMobile || !selectedId) && (
          <div
            className={`em-list${selectedEmail ? ' em-list--has-detail' : ''}`}
            style={selectedEmail && !isMobile && listWidth != null ? { '--em-list-w': `${listWidth}px` } as React.CSSProperties : undefined}
          >

            <div className="em-search-bar">
              {isMobile && (
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setMobileOpen(true)}>
                  <Icon name="menu" size={20} />
                </button>
              )}
              <div className="em-search-wrap">
                <span className="em-search-icon"><Icon name="search" size={16} /></span>
                <input className="em-search-input" placeholder="Search in mail" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={loadEmails} title="Refresh">
                <Icon name="refresh" size={15} />
              </button>
            </div>

            <div className="em-filter-bar">
              {(['all', 'unread', 'starred'] as Filter[]).map(f => (
                <button key={f} type="button" className={`em-filter-tab${filter === f ? ' em-filter-tab--active' : ''}`} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              {selected.size > 0 && (
                <button type="button" className="em-bulk-delete" onClick={bulkDelete}>
                  <Icon name="trash" size={13} /> Delete {selected.size}
                </button>
              )}
            </div>

            {emailsLoading && (
              <div className="em-loading">
                <Icon name="refresh" size={18} /><span>Loading…</span>
              </div>
            )}

            <div className="em-rows">
              {pageEmails.length === 0 ? (
                <div className="em-rows-empty">
                  <Icon name="mail" size={36} color="var(--border)" />
                  <span>No emails</span>
                </div>
              ) : pageEmails.map(email => (
                <div
                  key={email.id}
                  className={`em-row${!email.read ? ' em-row--unread' : ''}${selectedId === email.id ? ' em-row--selected' : ''}`}
                  onClick={() => selectEmail(email.id)}
                >
                  <div className="em-row-check-wrap" onClick={ev => toggleSelect(email.id, ev)}>
                    <span className={`em-row-check${selected.has(email.id) ? ' em-row-check--on' : ''}`}>
                      {selected.has(email.id) && <Icon name="check" size={10} color="#fff" />}
                    </span>
                  </div>
                  <div className="em-row-star" onClick={ev => toggleStar(email.id, ev)}>
                    <Icon name="star" size={16} color={email.starred ? '#f4b400' : 'var(--border)'} />
                  </div>
                  <div className={`em-row-sender${!email.read ? ' em-row-sender--bold' : ''}`}>
                    {email.from.name}
                  </div>
                  <div className="em-row-mid">
                    <span className={`em-row-subject${!email.read ? ' em-row-subject--bold' : ''}`}>{email.subject}</span>
                    <span className="em-row-snip"> — {email.snippet}</span>
                  </div>
                  {email.labels.length > 0 && !isMobile && (
                    <span className="em-row-label" style={{ background: `color-mix(in srgb, ${LABEL_COLORS[email.labels[0]]} 14%, transparent)`, color: LABEL_COLORS[email.labels[0]] }}>
                      {email.labels[0]}
                    </span>
                  )}
                  {email.hasAttachment && <Icon name="paperclip" size={13} color="var(--ink3)" style={{ marginLeft: 6, flexShrink: 0 }} />}
                  <div className={`em-row-date${!email.read ? ' em-row-date--bold' : ''}`}>
                    {fmtDate(email.date)}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="em-pagination">
                <span className="em-pagination-info">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allVisible.length)} of {allVisible.length}</span>
                <div className="em-pagination-btns">
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                    <Icon name="chevronLeft" size={16} />
                  </button>
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                    <Icon name="chevronRight" size={16} />
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Draggable resizer — only visible when detail is open */}
        {selectedEmail && !isMobile && (
          <div className="em-resizer" onMouseDown={startDrag} />
        )}

        {/* Area 4: Email detail */}
        {selectedEmail && (!isMobile || selectedId) ? (
          <div className="em-detail">
            <div className="em-detail-toolbar">
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setSelectedId(null)} title="Back">
                <Icon name="arrowLeft" size={16} />
              </button>
              <div className="em-toolbar-sep" />
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => archiveEmail(selectedEmail.id)} title="Archive"><Icon name="folder" size={16} /></button>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => archiveEmail(selectedEmail.id)} title="Delete"><Icon name="trash" size={16} /></button>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => markUnread(selectedEmail.id)} title="Mark unread"><Icon name="mail" size={16} /></button>
              <button type="button" className={`em-icon-btn em-icon-btn--ghost${selectedEmail.starred ? ' em-icon-btn--starred' : ''}`} onClick={e => toggleStar(selectedEmail.id, e)} title={selectedEmail.starred ? 'Unstar' : 'Star'}>
                <Icon name="star" size={16} color={selectedEmail.starred ? '#f4b400' : undefined} />
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="em-icon-btn em-icon-btn--primary" onClick={aiSummarise} disabled={aiLoading}>
                {aiLoading ? <Icon name="refresh" size={14} color="#0b57d0" /> : <Icon name="zap" size={14} color="#0b57d0" />}
                AI Summary
              </button>
            </div>

            <div className="em-detail-content">
              <h2 className="em-detail-subject">
                {selectedEmail.subject}
                {selectedEmail.labels.map(l => (
                  <span key={l} className="em-label-chip" style={{ background: `color-mix(in srgb, ${LABEL_COLORS[l]} 12%, transparent)`, color: LABEL_COLORS[l] }}>{l}</span>
                ))}
              </h2>

              <div className="em-detail-from-row">
                <Avatar name={selectedEmail.from.name} size={44} />
                <div className="em-detail-from-meta">
                  <div className="em-detail-from-top">
                    <div>
                      <span className="em-detail-from-name">{selectedEmail.from.name}</span>
                      <span className="em-detail-from-email">&lt;{selectedEmail.from.email}&gt;</span>
                    </div>
                    <div className="em-detail-from-right">
                      <span className="em-detail-from-date">{fmtDateLong(selectedEmail.date)}</span>
                      <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={e => toggleStar(selectedEmail.id, e)}>
                        <Icon name="star" size={16} color={selectedEmail.starred ? '#f4b400' : 'var(--border)'} />
                      </button>
                    </div>
                  </div>
                  <div className="em-detail-to-line">
                    To: {selectedEmail.to.map(t => t.email).join(', ')}
                    {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                      <> &nbsp;·&nbsp; CC: {selectedEmail.cc.map(t => t.email).join(', ')}</>
                    )}
                  </div>
                </div>
              </div>

              <div className="em-divider" />
              <div className="em-detail-body-text">{selectedEmail.body}</div>

              {aiPanelOpen && (
                <div className="em-ai-panel">
                  <div className="em-ai-panel-hdr" onClick={() => setAiPanelOpen(v => !v)}>
                    <Icon name="zap" size={15} color="#0b57d0" />
                    <span>AI Summary</span>
                    <Icon name={aiPanelOpen ? 'chevronUp' : 'chevronDown'} size={13} color="#0b57d0" />
                  </div>
                  <div className="em-ai-panel-body">
                    {aiLoading
                      ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink3)', fontSize: 13 }}><Icon name="refresh" size={15} color="#0b57d0" /> Generating summary…</div>
                      : <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.65 }}>{aiSummary}</p>
                    }
                  </div>
                </div>
              )}

              {replyOpen && (
                <div className="em-reply-box">
                  <div className="em-reply-hdr">
                    <span>Reply to {selectedEmail.from.name}</span>
                    <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setReplyOpen(false)}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  <div className="em-reply-body">
                    <textarea className="em-reply-textarea" value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Reply…" rows={5} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20 }} onClick={sendReply}>
                        <Icon name="send" size={13} /> Send
                      </button>
                      <button type="button" className="em-text-btn" onClick={() => setReplyOpen(false)}>Discard</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!replyOpen && (
              <div className="em-detail-footer">
                <button type="button" className="em-icon-btn em-icon-btn--pill" onClick={() => setReplyOpen(true)}>
                  <Icon name="arrowLeft" size={14} /> Reply
                </button>
                <button type="button" className="em-icon-btn em-icon-btn--pill" onClick={forwardEmail}>
                  <Icon name="send" size={14} /> Forward
                </button>
              </div>
            )}
          </div>
        ) : null}

      </div>{/* /em-body */}

      {/* Area 5: Katalyst-style Right Tool Menu Rail & Expandable Drawers */}
      {!isMobile && (
        <EmailRightToolMenu
          selectedEmail={selectedEmail}
          onOpenEmail={id => setSelectedId(id)}
          emails={emails}
        />
      )}

      {/* Compose modal */}
      {composeOpen && (
        <div className={`em-compose-modal${isMobile ? ' em-compose-modal--mobile' : ''}`}>
          <div className="em-compose-hdr">
            <span className="em-compose-title">New Message</span>
            <button type="button" className="em-icon-btn em-icon-btn--ghost" style={{ color: '#fff' }} onClick={() => setComposeOpen(false)}>
              <Icon name="x" size={16} color="#fff" />
            </button>
          </div>
          <div className="em-compose-fields">
            <div className="em-compose-row">
              <span className="em-compose-label">To</span>
              <input className="em-compose-input" value={compose.to} onChange={e => setCompose(p => ({ ...p, to: e.target.value }))} placeholder="recipients@domain.com" />
              <button type="button" className="em-compose-cc-btn" onClick={() => setCompose(p => ({ ...p, showCc: !p.showCc }))}>Cc</button>
            </div>
            {compose.showCc && (
              <div className="em-compose-row">
                <span className="em-compose-label">Cc</span>
                <input className="em-compose-input" value={compose.cc} onChange={e => setCompose(p => ({ ...p, cc: e.target.value }))} />
              </div>
            )}
            <div className="em-compose-row">
              <span className="em-compose-label">Subject</span>
              <input className="em-compose-input" value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))} />
            </div>
            <textarea className="em-compose-body" value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))} placeholder="Write your email here…" />
            <div className="em-compose-footer">
              <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20, padding: 'var(--ds-btn-py) 24px' }} onClick={sendCompose}>
                <Icon name="send" size={14} /> Send
              </button>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setComposeOpen(false)} title="Discard">
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
