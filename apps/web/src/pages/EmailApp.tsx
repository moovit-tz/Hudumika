import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Spinner } from '../components/ui/spinner.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch } from '../lib/api.js';
import { MobileNavContext } from '../shells/WorkspaceApp.js';
import { showAlert } from '../lib/alert.js';
import { addTodo } from '../data/calendarStore.js';
import './EmailApp.css';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'spam' | 'trash' | 'scheduled' | 'archive';
/** Labels are user-defined now (email_labels) — any string a label row or
 *  an older message carries, not a fixed set. */
type Label  = string;
type Filter = 'all' | 'unread' | 'starred';

/** A user-defined label (GET/POST/PATCH/DELETE /v1/email/labels). `color`
 *  is one of the platform's semantic tokens (teal/blue/green/gold/red/
 *  purple) — see labelPalette() below for how it's rendered. */
interface EmailLabel {
  id: string;
  name: string;
  color: string;
}

/** A per-user canned-reply/quick-response snippet (email_quick_templates) —
 *  distinct from the platform's own transactional email_templates (edited
 *  via EmailTemplates.tsx), which this compose window never reaches for. */
interface EmailQuickTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

interface EmailAddress {
  name: string;
  email: string;
  /** Set only when this address is the mailbox owner (every Sent message) —
   *  a real, known account, unlike an external inbox sender. */
  userId?: string;
}

interface EmailAttachment {
  filename: string;
  size: number | null;
}

interface Email {
  id: string;
  folder: Folder;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string;
  snippet: string;
  date: Date;
  read: boolean;
  starred: boolean;
  labels: Label[];
  hasAttachment?: boolean;
  /** First attachment, kept for back-compat call sites — prefer `attachments`. */
  attachment?: EmailAttachment | null;
  attachments: (EmailAttachment & { storageKey: string })[];
  threadId?: string;
  threadCount?: number;
  inReplyTo?: string | null;
  readReceiptRequested?: boolean;
  readReceiptConfirmedAt?: Date | null;
  /** Real delivery status for a Sent-folder row, joined from email_outbox —
   *  null for every other folder and for rows sent before this existed. */
  deliveryStatus?: 'pending' | 'sending' | 'sent' | 'failed' | null;
  /** Set only in the 'scheduled' folder — when the real deferred send will
   *  actually go out (the undo-send window, or a caller-chosen future
   *  schedule-send time). */
  scheduledAt?: Date | null;
  /** Set when a deferred send failed and bounced this message back to
   *  Drafts — scheduled-email-send.job.ts's own error, surfaced. */
  sendError?: string | null;
}

/** An attachment picked in Compose/Reply — `file` while only chosen
 *  locally, replaced by the real storageKey/filename/size once
 *  POST /v1/emails/attachments has actually uploaded it (send is disabled
 *  mid-upload so a message can never claim an attachment that never made
 *  it to storage). */
interface PendingAttachment {
  /** Unset for an attachment carried over from Forward — it's already
   *  uploaded (same storage key as the original), so there's no local File
   *  to re-upload. */
  file?: File;
  uploading: boolean;
  storageKey?: string;
  filename?: string;
  size?: number;
  error?: string;
  /** Local-only key so React can key/remove a specific chip in the array
   *  before it has a real storageKey. */
  localId: string;
}

interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  showCc: boolean;
  showBcc: boolean;
  requestReadReceipt: boolean;
  attachments: PendingAttachment[];
  /** Set once this compose has been saved as a draft at least once, so
   *  further autosaves PATCH the same row instead of creating a new one
   *  on every keystroke pause. */
  draftId: string | null;
  /** The message this compose is a reply to, for threading — unset for a
   *  fresh compose or a forward (a forward is conceptually a new thread). */
  replyToId: string | null;
  /** ISO datetime from the "Schedule send" picker — unset = send now
   *  (still goes through the short undo-send window, just not a caller-
   *  chosen future time). */
  sendAt: string | null;
}

interface EmailAccountSettings {
  imapEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapEncryption: 'ssl' | 'tls' | 'none';
  imapMarkAsRead: boolean;
  signature: string;
  spamBlocklist: string[];
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

const PAGE_SIZE = 15;

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

// Every color a label can be saved with (email_labels.color) — the same
// semantic tokens Badge/FeaturedIcon draw from platform-wide, not a new
// palette invented for this one feature.
const LABEL_PALETTE = ['teal', 'blue', 'green', 'gold', 'red', 'purple'] as const;
type LabelColorToken = typeof LABEL_PALETTE[number];

function hashLabelName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** Resolves a label's fg/bg pair — from its saved email_labels row when one
 *  exists, or a deterministic hash-based pick from LABEL_PALETTE for a
 *  message carrying a label string with no (or a since-deleted) row, so
 *  rendering never breaks on an unrecognized label. */
function labelColors(name: string, defs: EmailLabel[]): { fg: string; bg: string } {
  const def = defs.find(d => d.name === name);
  const token = (def?.color && (LABEL_PALETTE as readonly string[]).includes(def.color) ? def.color : LABEL_PALETTE[hashLabelName(name) % LABEL_PALETTE.length]) as LabelColorToken;
  return { fg: `var(--${token})`, bg: `var(--${token}-l)` };
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export const EmailApp: React.FC = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { setMobileOpen } = useContext(MobileNavContext);

  // Derive active folder from URL path
  const folderFromPath = ((): Folder => {
    const p = location.pathname;
    if (p.endsWith('/starred'))   return 'starred';
    if (p.endsWith('/sent'))      return 'sent';
    if (p.endsWith('/scheduled')) return 'scheduled';
    if (p.endsWith('/drafts'))    return 'drafts';
    if (p.endsWith('/archive'))   return 'archive';
    if (p.endsWith('/spam'))      return 'spam';
    if (p.endsWith('/trash'))     return 'trash';
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
    requestReadReceipt: false, attachments: [], draftId: null, replyToId: null, sendAt: null,
  });
  const [composeSaving, setComposeSaving] = useState(false);
  const composeDraftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest compose snapshot for the debounced autosave closure below —
  // avoids re-registering the timeout effect (and losing an in-flight
  // debounce) on every keystroke.
  const composeRef = useRef(compose);
  composeRef.current = compose;

  // Reply composer's own attachments — kept separate from ComposeData since
  // the reply box is a different, always-open-inline surface, not a modal.
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const composeFileInputRef = useRef<HTMLInputElement>(null);

  // Email account settings (IMAP mailbox connection, signature, spam list)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EmailAccountSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [blocklistInput, setBlocklistInput] = useState('');
  const [imapTesting, setImapTesting] = useState(false);
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // User-defined labels (email_labels) — replaces the old hardcoded set.
  const [labelDefs, setLabelDefs] = useState<EmailLabel[]>([]);
  const [newLabelName, setNewLabelName] = useState('');

  // Per-user quick-reply/canned-response templates (email_quick_templates).
  const [quickTemplates, setQuickTemplates] = useState<EmailQuickTemplate[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateEditing, setTemplateEditing] = useState<EmailQuickTemplate | { id: null; name: string; subject: string; body: string } | null>(null);

  // Undo-send toast — shown after a send whose undo window hasn't elapsed
  // yet; Cancel just deletes the still-'scheduled' row before the sweep job
  // performs the real delivery.
  const [undoToast, setUndoToast] = useState<{ id: string; deadline: number } | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  // Merged cross-folder conversation view for a thread with more than one message.
  const [threadMessages, setThreadMessages] = useState<Email[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  // Loaded once per mount — both the labels list (rows + row-driven colors)
  // and quick templates are cheap, small, per-user lists reused across the
  // compose modal, reply box, and Settings' management sections.
  useEffect(() => {
    apiFetch('/v1/email/labels').then(res => setLabelDefs(Array.isArray(res) ? res : [])).catch(() => {});
    apiFetch('/v1/email/quick-templates').then(res => setQuickTemplates(Array.isArray(res) ? res : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!undoToast) return;
    const tick = () => setUndoSecondsLeft(Math.max(0, Math.ceil((undoToast.deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    const hideTimer = setTimeout(() => setUndoToast(null), Math.max(0, undoToast.deadline - Date.now()) + 400);
    return () => { clearInterval(id); clearTimeout(hideTimer); };
  }, [undoToast]);

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

  // AI suggested task — same idea as Gmail's Gemini "Suggested task" banner.
  // Runs automatically per email (Inbox only — a suggested task on something
  // you sent or discarded makes no sense), cached per email id for the
  // session so re-opening an already-checked email doesn't re-call the model.
  interface TaskSuggestion { hasTask: boolean; title: string; dueDate: string | null }
  const taskCache = useRef<Record<string, TaskSuggestion>>({});
  const [taskSuggestion, setTaskSuggestion] = useState<TaskSuggestion | null>(null);
  const [taskChecking, setTaskChecking] = useState(false);
  const [taskAdded, setTaskAdded] = useState(false);
  const [taskDismissed, setTaskDismissed] = useState(false);

  // ── Email fetching ────────────────────────────────────────────────────────────

  // Search debounced 350ms — GET /v1/emails now runs a real Postgres
  // full-text query (migration 461's search_vector/GIN index), not the old
  // in-memory substring filter, so this is a real network request per
  // change rather than a free client-side re-filter.
  const [searchDebounced, setSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadEmails = useCallback(async () => {
    setEmailsLoading(true);
    try {
      const qs = new URLSearchParams({ folder: activeFolder });
      if (searchDebounced) qs.set('search', searchDebounced);
      const data = await apiFetch(`/v1/emails?${qs.toString()}`);
      setEmails(Array.isArray(data) ? data.map((e: any) => ({
        id: String(e.id),
        folder: (e.folder ?? activeFolder) as Folder,
        from: e.from ?? { name: 'Unknown', email: '' },
        to: Array.isArray(e.to) ? e.to : [{ name: String(e.to ?? ''), email: String(e.to ?? '') }],
        cc: e.cc,
        bcc: e.bcc,
        subject: e.subject ?? '(no subject)',
        body: e.body ?? '',
        snippet: e.snippet ?? String(e.body ?? '').slice(0, 100),
        date: new Date(e.date ?? Date.now()),
        read: Boolean(e.read),
        starred: Boolean(e.starred),
        labels: Array.isArray(e.labels) ? e.labels : [],
        hasAttachment: Boolean(e.hasAttachment),
        attachment: e.attachment ?? null,
        attachments: Array.isArray(e.attachments) ? e.attachments : [],
        threadId: e.threadId,
        threadCount: e.threadCount ?? 1,
        inReplyTo: e.inReplyTo ?? null,
        readReceiptRequested: Boolean(e.readReceiptRequested),
        readReceiptConfirmedAt: e.readReceiptConfirmedAt ? new Date(e.readReceiptConfirmedAt) : null,
        deliveryStatus: e.deliveryStatus ?? null,
        scheduledAt: e.scheduledAt ? new Date(e.scheduledAt) : null,
        sendError: e.sendError ?? null,
      })) : []);
    } catch (err: any) {
      showAlert(err.message || 'Failed to load emails');
    } finally {
      setEmailsLoading(false);
    }
  }, [activeFolder, searchDebounced]);

  useEffect(() => { loadEmails(); }, [loadEmails]);
  useEffect(() => {
    const id = setInterval(loadEmails, 30000);
    return () => clearInterval(id);
  }, [loadEmails]);

  // ── Derived list ──────────────────────────────────────────────────────────────

  const selectedEmail = emails.find(e => e.id === selectedId) ?? null;

  // Inbox only — a "suggested task" on a message you sent or discarded
  // doesn't make sense. Skips near-empty bodies too (nothing for the model
  // to genuinely find an action item in). Silent no-op if AI isn't
  // configured for this tenant (400) or the call otherwise fails — this
  // runs automatically on every open, so it must never surface an error the
  // way a user-triggered action (AI Summary) can.
  useEffect(() => {
    if (!selectedEmail || selectedEmail.folder !== 'inbox' || selectedEmail.body.trim().length < 20) {
      setTaskSuggestion(null);
      setTaskChecking(false);
      return;
    }
    const cached = taskCache.current[selectedEmail.id];
    if (cached) { setTaskSuggestion(cached); return; }

    setTaskSuggestion(null);
    setTaskChecking(true);
    apiFetch('/v1/ai/extract-task', {
      method: 'POST',
      body: JSON.stringify({ subject: selectedEmail.subject, body: selectedEmail.body }),
    }).then(res => {
      const result: TaskSuggestion = res?.hasTask
        ? { hasTask: true, title: res.title, dueDate: res.dueDate ?? null }
        : { hasTask: false, title: '', dueDate: null };
      taskCache.current[selectedEmail.id] = result;
      setTaskSuggestion(result);
    }).catch(() => {
      // AI not configured, or the call failed — no banner, no error shown.
      taskCache.current[selectedEmail.id] = { hasTask: false, title: '', dueDate: null };
      setTaskSuggestion(null);
    }).finally(() => setTaskChecking(false));
  }, [selectedEmail]);

  function addSuggestedTask() {
    if (!taskSuggestion?.hasTask || !selectedEmail) return;
    addTodo({
      title: taskSuggestion.title,
      due: taskSuggestion.dueDate ?? undefined,
      subjectType: 'email',
      subjectId: selectedEmail.id,
    });
    setTaskAdded(true);
  }

  const allVisible = (() => {
    let list = emails.filter(e => {
      if (activeFolder === 'starred') return e.starred;
      return e.folder === activeFolder;
    });
    if (filterByLabel) list = list.filter(e => e.labels.includes(filterByLabel));
    if (filter === 'unread')  list = list.filter(e => !e.read);
    if (filter === 'starred') list = list.filter(e => e.starred);
    // Search itself is a real server-side full-text query (searchDebounced,
    // above) — `emails` here already only contains matches.
    return list;
  })();

  const totalPages = Math.ceil(allVisible.length / PAGE_SIZE);
  const pageEmails = allVisible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  /** A Drafts-folder row reopens into Compose (there's nothing useful to
   *  "read" about your own unsent draft); every other folder opens the
   *  normal read-only detail view. */
  function rowClick(email: Email) {
    if (email.folder === 'drafts') { openDraft(email); return; }
    selectEmail(email.id);
  }

  function selectEmail(id: string) {
    setSelectedId(id);
    setReplyOpen(false);
    setAiSummary(null);
    setAiPanelOpen(false);
    setTaskAdded(false);
    setTaskDismissed(false);
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

  /** The bulk-select toolbar's actions — one call to POST /v1/emails/bulk
   *  instead of a PATCH-per-id loop, for every action beyond single-delete
   *  (archive, mark read/unread, spam, trash, permanent delete). */
  function bulkAction(action: 'read' | 'unread' | 'archive' | 'trash' | 'spam' | 'delete') {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === 'delete') {
      setEmails(prev => prev.filter(e => !selected.has(e.id)));
    } else if (action === 'read' || action === 'unread') {
      setEmails(prev => prev.map(e => selected.has(e.id) ? { ...e, read: action === 'read' } : e));
    } else {
      setEmails(prev => prev.map(e => selected.has(e.id) ? { ...e, folder: action } : e));
    }
    if (selectedId && selected.has(selectedId)) setSelectedId(null);
    setSelected(new Set());
    apiFetch('/v1/emails/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) })
      .catch(() => { showAlert('Some messages failed to update'); loadEmails(); });
  }

  function markUnread(id: string) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, read: false } : e));
    setSelectedId(null);
    apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ read: false }) }).catch(() => showAlert('Failed to mark unread'));
  }

  /** "Archive", "Delete" (→ Trash — a permanent delete only ever happens
   *  from within Trash itself), "Report spam" (Inbox → Spam) and "Not
   *  spam" (Spam → Inbox) all share this: a plain folder move. */
  function moveToFolder(id: string, folder: Folder) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, folder } : e));
    setSelectedId(null);
    apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ folder }) }).catch(() => showAlert('Failed to move message'));
  }

  /** Cancels a still-'scheduled' send (the undo-send window, or a
   *  schedule-send for later) — the same permanent-delete endpoint Trash
   *  uses, since deleting the row before scheduled-email-send.job.ts's next
   *  sweep IS the cancellation; no separate cancel endpoint exists. */
  function cancelScheduled(id: string) {
    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (undoToast?.id === id) setUndoToast(null);
    apiFetch(`/v1/emails/${id}`, { method: 'DELETE' }).catch(() => { showAlert('Failed to cancel — it may have already been sent.'); loadEmails(); });
  }

  function changeFolder(folder: Folder) {
    const path = folder === 'inbox' ? '/email' : `/email/${folder}`;
    navigate(path);
    // State reset is handled by the useEffect on folderFromPath
  }

  // ── Conversation (merged, cross-folder thread) view ─────────────────────────

  async function openThreadView(threadId: string) {
    setThreadLoading(true);
    setThreadMessages(null);
    try {
      const res = await apiFetch(`/v1/emails/thread/${threadId}`);
      setThreadMessages(Array.isArray(res) ? res.map((e: any) => ({
        id: String(e.id), folder: e.folder, from: e.from ?? { name: 'Unknown', email: '' },
        to: Array.isArray(e.to) ? e.to : [], cc: e.cc, bcc: e.bcc,
        subject: e.subject ?? '(no subject)', body: e.body ?? '', snippet: e.snippet ?? '',
        date: new Date(e.date ?? Date.now()), read: Boolean(e.read), starred: Boolean(e.starred),
        labels: Array.isArray(e.labels) ? e.labels : [], hasAttachment: Boolean(e.hasAttachment),
        attachment: e.attachment ?? null, attachments: Array.isArray(e.attachments) ? e.attachments : [],
        threadId: e.threadId, threadCount: e.threadCount ?? 1,
      })) : []);
    } catch {
      setThreadMessages([]);
    } finally {
      setThreadLoading(false);
    }
  }

  // ── Attachments ───────────────────────────────────────────────────────────────

  async function uploadAttachments(files: File[], target: 'compose' | 'reply') {
    const setList = target === 'compose'
      ? (fn: (prev: PendingAttachment[]) => PendingAttachment[]) => setCompose(prev => ({ ...prev, attachments: fn(prev.attachments) }))
      : (fn: (prev: PendingAttachment[]) => PendingAttachment[]) => setReplyAttachments(fn);

    for (const file of files) {
      const localId = crypto.randomUUID();
      setList(prev => [...prev, { file, uploading: true, localId }]);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await apiFetch('/v1/emails/attachments', { method: 'POST', body: form });
        setList(prev => prev.map(a => a.localId === localId ? { ...a, uploading: false, storageKey: res.storageKey, filename: res.filename, size: res.size } : a));
      } catch (err: any) {
        setList(prev => prev.map(a => a.localId === localId ? { ...a, uploading: false, error: err.message || 'Upload failed' } : a));
      }
    }
  }

  function removeAttachment(localId: string, target: 'compose' | 'reply') {
    if (target === 'compose') setCompose(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.localId !== localId) }));
    else setReplyAttachments(prev => prev.filter(a => a.localId !== localId));
  }

  // ── Drafts ────────────────────────────────────────────────────────────────────

  /** Explicit "Save draft" and the debounced autosave below share this —
   *  POSTs a new drafts-folder row the first time, PATCHes the same one on
   *  every save after (compose.draftId set from the first response). */
  const saveDraft = useCallback(async (silent = false) => {
    const c = composeRef.current;
    if (!c.to.trim() && !c.cc.trim() && !c.subject.trim() && !c.body.trim()) return;
    if (!silent) setComposeSaving(true);
    const attachments = c.attachments.filter(a => a.storageKey).map(a => ({ storageKey: a.storageKey!, filename: a.filename!, size: a.size }));
    try {
      if (c.draftId) {
        await apiFetch(`/v1/emails/${c.draftId}`, {
          method: 'PATCH',
          body: JSON.stringify({ to: c.to, cc: c.cc, bcc: c.bcc, subject: c.subject, body: c.body, attachments }),
        });
      } else {
        const res = await apiFetch('/v1/emails/drafts', {
          method: 'POST',
          body: JSON.stringify({ to: c.to, cc: c.cc, bcc: c.bcc, subject: c.subject, body: c.body, attachments }),
        });
        setCompose(prev => ({ ...prev, draftId: res.id }));
      }
      if (activeFolder === 'drafts') loadEmails();
    } catch {
      if (!silent) showAlert('Failed to save draft');
    } finally {
      if (!silent) setComposeSaving(false);
    }
  }, [activeFolder, loadEmails]);

  // Debounced autosave — 2s after the user stops typing, so a browser
  // crash or an accidental tab close doesn't lose an in-progress message
  // the way a Send-or-lose-it compose modal used to.
  useEffect(() => {
    if (!composeOpen) return;
    if (composeDraftTimer.current) clearTimeout(composeDraftTimer.current);
    composeDraftTimer.current = setTimeout(() => { saveDraft(true); }, 2000);
    return () => { if (composeDraftTimer.current) clearTimeout(composeDraftTimer.current); };
  }, [compose.to, compose.cc, compose.bcc, compose.subject, compose.body, composeOpen, saveDraft]);

  /** Opens an existing Drafts-folder row back into the compose modal,
   *  continuing the same draft row rather than starting a new one. */
  function openDraft(email: Email) {
    setCompose({
      to: email.to.map(t => t.email).join(', '),
      cc: (email.cc ?? []).map(c => c.email).join(', '),
      bcc: (email.bcc ?? []).map(c => c.email).join(', '),
      subject: email.subject,
      body: email.body,
      showCc: (email.cc ?? []).length > 0,
      showBcc: (email.bcc ?? []).length > 0,
      requestReadReceipt: false,
      attachments: email.attachments.map(a => ({
        localId: crypto.randomUUID(), uploading: false, storageKey: a.storageKey, filename: a.filename, size: a.size ?? undefined,
      })),
      draftId: email.id,
      replyToId: null,
      sendAt: null,
    });
    setComposeOpen(true);
  }

  /** Explicit Discard — unlike just closing the modal, this actually
   *  deletes the autosaved draft row rather than leaving it sitting in
   *  Drafts forever with no way to tell "abandoned" from "still working
   *  on it" apart. */
  function discardCompose() {
    if (composeDraftTimer.current) clearTimeout(composeDraftTimer.current);
    const draftId = compose.draftId;
    setComposeOpen(false);
    if (draftId) {
      apiFetch(`/v1/emails/${draftId}`, { method: 'DELETE' })
        .then(() => { if (activeFolder === 'drafts') loadEmails(); })
        .catch(() => {});
    }
  }

  /** Shows the Undo-send countdown toast — skipped for an explicit
   *  schedule-send (undoWindowMs comes back null), since "Undo" doesn't
   *  make sense for something the sender deliberately deferred. */
  function startUndoToast(id: string, undoWindowMs: number | null) {
    if (!undoWindowMs) return;
    setUndoToast({ id, deadline: Date.now() + undoWindowMs });
  }

  async function sendReply() {
    if (!replyBody.trim() || !selectedEmail) return;
    if (replyAttachments.some(a => a.uploading)) return;
    try {
      const attachments = replyAttachments.filter(a => a.storageKey).map(a => ({ storageKey: a.storageKey!, filename: a.filename!, size: a.size }));
      const res = await apiFetch('/v1/email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: selectedEmail.from.email,
          subject: replySubject || `Re: ${selectedEmail.subject}`,
          body: replyBody,
          inReplyTo: selectedEmail.id,
          attachments,
        }),
      });
      setReplyOpen(false);
      setReplyBody('');
      setReplyAttachments([]);
      startUndoToast(res.id, res.undoWindowMs);
      if (activeFolder === 'sent' || activeFolder === 'scheduled') loadEmails();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send reply');
    }
  }

  function openCompose(prefill?: Partial<ComposeData>) {
    setCompose({
      to: '', cc: '', bcc: '', subject: '', body: '', showCc: false, showBcc: false,
      requestReadReceipt: false, attachments: [], draftId: null, replyToId: null, sendAt: null,
      ...prefill,
    });
    setComposeOpen(true);
  }

  function forwardEmail() {
    if (!selectedEmail) return;
    openCompose({
      subject: `Fwd: ${selectedEmail.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${selectedEmail.from.name} <${selectedEmail.from.email}>\nDate: ${fmtDateLong(selectedEmail.date)}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.body}`,
      // Carries the original message's attachment(s) by reference — same
      // storage key, no re-upload needed, since forwarding doesn't change
      // the file itself.
      attachments: selectedEmail.attachments.map(a => ({
        localId: crypto.randomUUID(), uploading: false, storageKey: a.storageKey, filename: a.filename, size: a.size ?? undefined,
      })),
    });
  }

  async function sendCompose() {
    if (!compose.to.trim() || !compose.subject.trim()) return;
    if (compose.attachments.some(a => a.uploading)) return;
    try {
      if (composeDraftTimer.current) clearTimeout(composeDraftTimer.current);
      const attachments = compose.attachments.filter(a => a.storageKey).map(a => ({ storageKey: a.storageKey!, filename: a.filename!, size: a.size }));
      const res = await apiFetch('/v1/email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: compose.to, cc: compose.cc || undefined, bcc: compose.bcc || undefined,
          subject: compose.subject, body: compose.body,
          inReplyTo: compose.replyToId ?? undefined,
          draftId: compose.draftId ?? undefined,
          requestReadReceipt: compose.requestReadReceipt,
          attachments,
          sendAt: compose.sendAt ? new Date(compose.sendAt).toISOString() : undefined,
        }),
      });
      setComposeOpen(false);
      startUndoToast(res.id, res.undoWindowMs);
      if (activeFolder === 'sent' || activeFolder === 'drafts' || activeFolder === 'scheduled') loadEmails();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send email');
    }
  }

  async function downloadAttachment(id: string, storageKey?: string) {
    try {
      const qs = storageKey ? `?key=${encodeURIComponent(storageKey)}` : '';
      const res = await apiFetch(`/v1/emails/${id}/attachment${qs}`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err: any) {
      showAlert(err.message || 'Failed to download attachment');
    }
  }

  // ── Account settings (IMAP mailbox, signature, spam blocklist) ─────────────────

  async function openSettingsPanel() {
    setSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const res = await apiFetch('/v1/email/account');
      setSettings(res);
    } catch {
      showAlert('Failed to load Email settings');
      setSettingsOpen(false);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      await apiFetch('/v1/email/account', { method: 'PUT', body: JSON.stringify(settings) });
      setSettingsOpen(false);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save Email settings');
    } finally {
      setSettingsSaving(false);
    }
  }

  function addBlocklistEntry() {
    const v = blocklistInput.trim();
    if (!v || !settings) return;
    if (settings.spamBlocklist.includes(v)) { setBlocklistInput(''); return; }
    setSettings({ ...settings, spamBlocklist: [...settings.spamBlocklist, v] });
    setBlocklistInput('');
  }

  function removeBlocklistEntry(v: string) {
    if (!settings) return;
    setSettings({ ...settings, spamBlocklist: settings.spamBlocklist.filter(e => e !== v) });
  }

  /** A real IMAP connection attempt against whatever's currently in the
   *  form (not yet saved) — so a bad host/port/password is caught before
   *  Save, not discovered a few minutes later from a silent sync failure. */
  async function testImapConnection() {
    if (!settings) return;
    setImapTesting(true);
    setImapTestResult(null);
    try {
      const res = await apiFetch('/v1/email/account/test', {
        method: 'POST',
        body: JSON.stringify({
          imapHost: settings.imapHost, imapPort: settings.imapPort, imapUser: settings.imapUser,
          imapPass: settings.imapPass, imapEncryption: settings.imapEncryption,
        }),
      });
      setImapTestResult(res);
    } catch (err: any) {
      setImapTestResult({ success: false, error: err.message || 'Connection failed.' });
    } finally {
      setImapTesting(false);
    }
  }

  // ── Labels (email_labels) ────────────────────────────────────────────────────

  async function createLabel() {
    const name = newLabelName.trim();
    if (!name) return;
    try {
      const row = await apiFetch('/v1/email/labels', { method: 'POST', body: JSON.stringify({ name }) });
      setLabelDefs(prev => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLabelName('');
    } catch (err: any) {
      showAlert(err.message || 'Failed to create label');
    }
  }

  async function renameLabel(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const old = labelDefs.find(l => l.id === id);
    try {
      const row = await apiFetch(`/v1/email/labels/${id}`, { method: 'PATCH', body: JSON.stringify({ name: trimmed }) });
      setLabelDefs(prev => prev.map(l => l.id === id ? row : l).sort((a, b) => a.name.localeCompare(b.name)));
      // Every message carrying the old name was relabeled server-side —
      // reflect that locally instead of waiting on the next loadEmails poll.
      if (old && old.name !== trimmed) {
        setEmails(prev => prev.map(e => e.labels.includes(old.name) ? { ...e, labels: e.labels.map(l => l === old.name ? trimmed : l) } : e));
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to rename label');
    }
  }

  async function deleteLabel(id: string) {
    const label = labelDefs.find(l => l.id === id);
    if (!label) return;
    setLabelDefs(prev => prev.filter(l => l.id !== id));
    setEmails(prev => prev.map(e => e.labels.includes(label.name) ? { ...e, labels: e.labels.filter(l => l !== label.name) } : e));
    apiFetch(`/v1/email/labels/${id}`, { method: 'DELETE' }).catch(() => showAlert('Failed to delete label'));
  }

  // ── Quick-reply / canned-response templates (email_quick_templates) ─────────

  async function saveTemplate() {
    if (!templateEditing || !templateEditing.name.trim()) return;
    try {
      if (templateEditing.id) {
        const row = await apiFetch(`/v1/email/quick-templates/${templateEditing.id}`, {
          method: 'PATCH', body: JSON.stringify({ name: templateEditing.name, subject: templateEditing.subject, body: templateEditing.body }),
        });
        setQuickTemplates(prev => prev.map(t => t.id === row.id ? row : t));
      } else {
        const row = await apiFetch('/v1/email/quick-templates', {
          method: 'POST', body: JSON.stringify({ name: templateEditing.name, subject: templateEditing.subject, body: templateEditing.body }),
        });
        setQuickTemplates(prev => [...prev, row]);
      }
      setTemplateEditing(null);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save template');
    }
  }

  function deleteTemplate(id: string) {
    setQuickTemplates(prev => prev.filter(t => t.id !== id));
    if (templateEditing?.id === id) setTemplateEditing(null);
    apiFetch(`/v1/email/quick-templates/${id}`, { method: 'DELETE' }).catch(() => showAlert('Failed to delete template'));
  }

  /** Fills the currently-open composer (modal or inline reply) with a saved
   *  template's subject/body — used by the compose toolbar's picker. */
  function applyTemplate(t: EmailQuickTemplate, target: 'compose' | 'reply') {
    if (target === 'compose') {
      setCompose(prev => ({ ...prev, subject: prev.subject || t.subject, body: prev.body ? `${prev.body}\n\n${t.body}` : t.body }));
    } else {
      setReplyBody(prev => prev ? `${prev}\n\n${t.body}` : t.body);
    }
    setTemplatePickerOpen(false);
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
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={openSettingsPanel} title="Email settings">
                <Icon name="settings" size={15} />
              </button>
            </div>

            <div className="em-filter-bar">
              {(['all', 'unread', 'starred'] as Filter[]).map(f => (
                <button key={f} type="button" className={`em-filter-tab${filter === f ? ' em-filter-tab--active' : ''}`} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              {selected.size > 0 && (
                <div className="em-bulk-actions">
                  <span className="em-bulk-count">{selected.size} selected</span>
                  <button type="button" className="em-bulk-btn" onClick={() => bulkAction('read')} title="Mark read"><Icon name="eye" size={13} /></button>
                  <button type="button" className="em-bulk-btn" onClick={() => bulkAction('unread')} title="Mark unread"><Icon name="eyeOff" size={13} /></button>
                  <button type="button" className="em-bulk-btn" onClick={() => bulkAction('archive')} title="Archive"><Icon name="folder" size={13} /></button>
                  <button type="button" className="em-bulk-btn" onClick={() => bulkAction('spam')} title="Report spam"><Icon name="alertCircle" size={13} /></button>
                  <button type="button" className="em-bulk-btn em-bulk-btn--danger" onClick={() => bulkAction(activeFolder === 'trash' ? 'delete' : 'trash')} title={activeFolder === 'trash' ? 'Delete permanently' : 'Move to Trash'}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              )}
            </div>

            {emailsLoading && (
              <div className="em-loading">
                <Spinner size={18} /><span>Loading…</span>
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
                  onClick={() => rowClick(email)}
                  role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rowClick(email); } }}
                >
                  <div className="em-row-check-wrap" onClick={ev => toggleSelect(email.id, ev)}
                    role="button" tabIndex={0} aria-label="Select email"
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSelect(email.id, e as any); } }}>
                    <span className={`em-row-check${selected.has(email.id) ? ' em-row-check--on' : ''}`}>
                      {selected.has(email.id) && <Icon name="check" size={10} color="#fff" />}
                    </span>
                  </div>
                  <div className="em-row-star" onClick={ev => toggleStar(email.id, ev)}
                    role="button" tabIndex={0} aria-label={email.starred ? 'Unstar' : 'Star'}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleStar(email.id, e as any); } }}>
                    <Icon name="star" size={16} color={email.starred ? 'var(--gold)' : 'var(--border)'} />
                  </div>
                  <PersonAvatar userId={email.from.userId} name={email.from.name} size={24} style={{ marginRight: 8, flexShrink: 0 }} />
                  <div className={`em-row-sender${!email.read ? ' em-row-sender--bold' : ''}`}>
                    {email.from.name}
                  </div>
                  <div className="em-row-mid">
                    <span className={`em-row-subject${!email.read ? ' em-row-subject--bold' : ''}`}>{email.subject}</span>
                    {(email.threadCount ?? 1) > 1 && (
                      <span className="em-thread-badge" title="Messages in this conversation">{email.threadCount}</span>
                    )}
                    <span className="em-row-snip"> — {email.snippet}</span>
                  </div>
                  {email.labels.length > 0 && !isMobile && (() => {
                    const c = labelColors(email.labels[0], labelDefs);
                    return <span className="em-row-label" style={{ background: c.bg, color: c.fg }}>{email.labels[0]}</span>;
                  })()}
                  {email.folder === 'scheduled' && email.scheduledAt && (
                    <span className="em-row-label em-row-label--scheduled" title="Still cancellable">
                      <Icon name="clock" size={11} /> {fmtDate(email.scheduledAt)}
                    </span>
                  )}
                  {email.folder === 'drafts' && email.sendError && (
                    <span className="em-row-label" title={email.sendError} style={{ background: 'var(--red-l)', color: 'var(--red)' }}>
                      Send failed
                    </span>
                  )}
                  {(email.deliveryStatus === 'pending' || email.deliveryStatus === 'sending' || email.deliveryStatus === 'failed') && (
                    <span
                      className="em-row-label"
                      title={email.deliveryStatus === 'failed' ? 'Delivery failed — will retry automatically' : 'Queued for delivery'}
                      style={{
                        background: email.deliveryStatus === 'failed' ? 'var(--red-l)' : 'var(--gold-l)',
                        color: email.deliveryStatus === 'failed' ? 'var(--red)' : 'var(--gold)',
                      }}
                    >
                      {email.deliveryStatus === 'failed' ? 'Failed' : 'Pending'}
                    </span>
                  )}
                  {email.hasAttachment && <Icon name="paperclip" size={13} color="var(--ink3)" style={{ marginLeft: 6, flexShrink: 0 }} />}
                  <div className={`em-row-date${!email.read ? ' em-row-date--bold' : ''}`}>
                    {fmtDate(email.date)}
                  </div>
                  {email.folder === 'scheduled' && (
                    <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Cancel" onClick={ev => { ev.stopPropagation(); cancelScheduled(email.id); }}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
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
              {selectedEmail.folder === 'scheduled' ? (
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => cancelScheduled(selectedEmail.id)} title="Cancel send">
                  <Icon name="x" size={16} /> Cancel send
                </button>
              ) : (
                <>
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => moveToFolder(selectedEmail.id, 'archive')} title="Archive"><Icon name="folder" size={16} /></button>
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => moveToFolder(selectedEmail.id, 'trash')} title="Delete"><Icon name="trash" size={16} /></button>
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => markUnread(selectedEmail.id)} title="Mark unread"><Icon name="mail" size={16} /></button>
                  <button type="button" className={`em-icon-btn em-icon-btn--ghost${selectedEmail.starred ? ' em-icon-btn--starred' : ''}`} onClick={e => toggleStar(selectedEmail.id, e)} title={selectedEmail.starred ? 'Unstar' : 'Star'}>
                    <Icon name="star" size={16} color={selectedEmail.starred ? 'var(--gold)' : undefined} />
                  </button>
                </>
              )}
              {selectedEmail.folder === 'inbox' && (
                <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Report spam" onClick={() => moveToFolder(selectedEmail.id, 'spam')}>
                  <Icon name="alertCircle" size={16} />
                </button>
              )}
              {selectedEmail.folder === 'spam' && (
                <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Not spam — move to Inbox" onClick={() => moveToFolder(selectedEmail.id, 'inbox')}>
                  <Icon name="checkCircle" size={16} />
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button type="button" className="em-icon-btn em-icon-btn--primary" onClick={aiSummarise} disabled={aiLoading}>
                {aiLoading ? <Icon name="refresh" size={14} color="var(--teal)" /> : <Icon name="zap" size={14} color="var(--teal)" />}
                AI Summary
              </button>
            </div>

            {selectedEmail.folder === 'scheduled' && selectedEmail.scheduledAt && (
              <div className="em-scheduled-banner">
                <Icon name="clock" size={14} color="var(--gold)" />
                Sending {fmtDateLong(selectedEmail.scheduledAt)} — Cancel any time before then.
              </div>
            )}

            <div className="em-detail-content">
              <h2 className="em-detail-subject">
                {selectedEmail.subject}
                {selectedEmail.labels.map(l => {
                  const c = labelColors(l, labelDefs);
                  return <span key={l} className="em-label-chip" style={{ background: c.bg, color: c.fg }}>{l}</span>;
                })}
              </h2>

              {(selectedEmail.threadCount ?? 1) > 1 && (
                <div className="em-thread-view">
                  <button
                    type="button"
                    className="em-text-btn"
                    onClick={() => { if (threadMessages) setThreadMessages(null); else if (selectedEmail.threadId) openThreadView(selectedEmail.threadId); }}
                  >
                    {threadMessages ? 'Hide' : 'View'} entire conversation ({selectedEmail.threadCount})
                  </button>
                  {threadLoading && <Spinner size={14} />}
                  {threadMessages && (
                    <div className="em-thread-list">
                      {threadMessages.map(m => (
                        <div key={m.id} className={`em-thread-item${m.id === selectedEmail.id ? ' em-thread-item--active' : ''}`} onClick={() => selectEmail(m.id)} role="button" tabIndex={0}>
                          <span className="em-thread-item-folder">{m.folder}</span>
                          <span className="em-thread-item-from">{m.from.name}</span>
                          <span className="em-thread-item-snip">{m.snippet}</span>
                          <span className="em-thread-item-date">{fmtDate(m.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {taskSuggestion?.hasTask && !taskDismissed && (
                <div className="em-task-banner">
                  <div className="em-task-banner-row">
                    <div className="em-task-banner-icon">
                      <Icon name="checkCircle" size={16} color="var(--teal)" />
                    </div>
                    <div className="em-task-banner-body">
                      <div className="em-task-banner-lbl">Suggested task</div>
                      <div className="em-task-banner-title">
                        {taskSuggestion.title}
                        {taskSuggestion.dueDate && (
                          <span className="em-task-banner-due"> · Due {new Date(taskSuggestion.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        )}
                      </div>
                    </div>
                    {taskAdded ? (
                      <span className="em-task-banner-added"><Icon name="check" size={13} /> Added to Tasks</span>
                    ) : (
                      <button type="button" className="em-task-banner-btn" onClick={addSuggestedTask}>Remind me</button>
                    )}
                    <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Dismiss" onClick={() => setTaskDismissed(true)}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  <div className="em-task-banner-hint">AI-suggested from this email's content — double-check before relying on it.</div>
                </div>
              )}

              <div className="em-detail-from-row">
                <PersonAvatar userId={selectedEmail.from.userId} name={selectedEmail.from.name} size={44} />
                <div className="em-detail-from-meta">
                  <div className="em-detail-from-top">
                    <div>
                      <span className="em-detail-from-name">{selectedEmail.from.name}</span>
                      <span className="em-detail-from-email">&lt;{selectedEmail.from.email}&gt;</span>
                    </div>
                    <div className="em-detail-from-right">
                      <span className="em-detail-from-date">{fmtDateLong(selectedEmail.date)}</span>
                      <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={e => toggleStar(selectedEmail.id, e)}>
                        <Icon name="star" size={16} color={selectedEmail.starred ? 'var(--gold)' : 'var(--border)'} />
                      </button>
                    </div>
                  </div>
                  <div className="em-detail-to-line">
                    To: {selectedEmail.to.map(t => t.email).join(', ')}
                    {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                      <> &nbsp;·&nbsp; CC: {selectedEmail.cc.map(t => t.email).join(', ')}</>
                    )}
                    {selectedEmail.folder === 'sent' && selectedEmail.bcc && selectedEmail.bcc.length > 0 && (
                      <> &nbsp;·&nbsp; BCC: {selectedEmail.bcc.map(t => t.email).join(', ')}</>
                    )}
                  </div>
                  {selectedEmail.folder === 'sent' && selectedEmail.readReceiptRequested && (
                    <div className="em-receipt-status">
                      <Icon name={selectedEmail.readReceiptConfirmedAt ? 'checkCircle' : 'clock'} size={12} color={selectedEmail.readReceiptConfirmedAt ? 'var(--green)' : 'var(--ink3)'} />
                      {selectedEmail.readReceiptConfirmedAt
                        ? `Read ${fmtDateLong(selectedEmail.readReceiptConfirmedAt)}`
                        : 'Not read yet'}
                      <span className="em-receipt-disclaimer" title="Most mail clients block remote images by default, so a confirmation only ever proves a best case — never treat 'not read yet' as certain.">
                        · best-effort
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="em-divider" />
              <div className="em-detail-body-text">{selectedEmail.body}</div>

              {selectedEmail.attachments.length > 0 && (
                <div className="em-attach-list">
                  {selectedEmail.attachments.map(a => (
                    <button key={a.storageKey} type="button" className="em-attach-chip em-attach-chip--download" onClick={() => downloadAttachment(selectedEmail.id, a.storageKey)}>
                      <Icon name="paperclip" size={13} />
                      <span>{a.filename}</span>
                      {a.size != null && <span className="em-attach-chip-size">{(a.size / 1024).toFixed(0)} KB</span>}
                      <Icon name="download" size={13} />
                    </button>
                  ))}
                </div>
              )}

              {aiPanelOpen && (
                <div className="em-ai-panel">
                  <div className="em-ai-panel-hdr" onClick={() => setAiPanelOpen(v => !v)}
                    role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAiPanelOpen(v => !v); } }}>
                    <Icon name="zap" size={15} color="var(--teal)" />
                    <span>AI Summary</span>
                    <Icon name={aiPanelOpen ? 'chevronUp' : 'chevronDown'} size={13} color="var(--teal)" />
                  </div>
                  <div className="em-ai-panel-body">
                    {aiLoading
                      ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink3)', fontSize: 13 }}><Icon name="refresh" size={15} color="var(--teal)" /> Generating summary…</div>
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
                    {replyAttachments.length > 0 && (
                      <div className="em-attach-list">
                        {replyAttachments.map(a => (
                          <div key={a.localId} className="em-attach-chip">
                            <Icon name="paperclip" size={12} />
                            <span>{a.uploading ? 'Uploading…' : a.filename}</span>
                            {a.error && <span className="em-attach-chip-error">{a.error}</span>}
                            <button type="button" className="em-attach-chip-remove" onClick={() => removeAttachment(a.localId, 'reply')}><Icon name="x" size={11} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                      <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20 }} onClick={sendReply} disabled={replyAttachments.some(a => a.uploading)}>
                        <Icon name="send" size={13} /> Send
                      </button>
                      <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Attach file" onClick={() => replyFileInputRef.current?.click()}>
                        <Icon name="paperclip" size={15} />
                      </button>
                      <input ref={replyFileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) uploadAttachments(files, 'reply'); e.target.value = ''; }} />
                      {quickTemplates.length > 0 && (
                        <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Insert quick reply" onClick={() => setTemplatePickerOpen(v => !v)}>
                          <Icon name="layers" size={15} />
                        </button>
                      )}
                      {templatePickerOpen && (
                        <div className="em-template-picker">
                          {quickTemplates.map(t => (
                            <button key={t.id} type="button" className="em-template-picker-item" onClick={() => applyTemplate(t, 'reply')}>{t.name}</button>
                          ))}
                        </div>
                      )}
                      <button type="button" className="em-text-btn" onClick={() => { setReplyOpen(false); setReplyAttachments([]); }}>Discard</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!replyOpen && selectedEmail.folder !== 'scheduled' && (
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
              <button type="button" className="em-compose-cc-btn" onClick={() => setCompose(p => ({ ...p, showBcc: !p.showBcc }))}>Bcc</button>
            </div>
            {compose.showCc && (
              <div className="em-compose-row">
                <span className="em-compose-label">Cc</span>
                <input className="em-compose-input" value={compose.cc} onChange={e => setCompose(p => ({ ...p, cc: e.target.value }))} />
              </div>
            )}
            {compose.showBcc && (
              <div className="em-compose-row">
                <span className="em-compose-label">Bcc</span>
                <input className="em-compose-input" value={compose.bcc} onChange={e => setCompose(p => ({ ...p, bcc: e.target.value }))} />
              </div>
            )}
            <div className="em-compose-row">
              <span className="em-compose-label">Subject</span>
              <input className="em-compose-input" value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))} />
            </div>
            <textarea className="em-compose-body" value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))} placeholder="Write your email here…" />
            {compose.attachments.length > 0 && (
              <div className="em-attach-list">
                {compose.attachments.map(a => (
                  <div key={a.localId} className="em-attach-chip">
                    <Icon name="paperclip" size={12} />
                    <span>{a.uploading ? 'Uploading…' : a.filename}</span>
                    {a.size != null && !a.uploading && <span className="em-attach-chip-size">{(a.size / 1024).toFixed(0)} KB</span>}
                    {a.error && <span className="em-attach-chip-error">{a.error}</span>}
                    <button type="button" className="em-attach-chip-remove" onClick={() => removeAttachment(a.localId, 'compose')}><Icon name="x" size={11} /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="em-compose-receipt-row">
              <input type="checkbox" checked={compose.requestReadReceipt} onChange={e => setCompose(p => ({ ...p, requestReadReceipt: e.target.checked }))} />
              Request read receipt <span className="em-receipt-disclaimer">— best-effort; many mail clients block tracking images by default</span>
            </label>
            {compose.sendAt !== null && (
              <div className="em-compose-row">
                <span className="em-compose-label">Send at</span>
                <input type="datetime-local" className="em-compose-input" value={compose.sendAt} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={e => setCompose(p => ({ ...p, sendAt: e.target.value }))} />
                <button type="button" className="em-attach-chip-remove" title="Send now instead" onClick={() => setCompose(p => ({ ...p, sendAt: null }))}><Icon name="x" size={11} /></button>
              </div>
            )}
            <div className="em-compose-footer" style={{ position: 'relative' }}>
              <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20, padding: 'var(--ds-btn-py) 24px', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} onClick={sendCompose} disabled={compose.attachments.some(a => a.uploading)}>
                <Icon name="send" size={14} /> {compose.sendAt ? 'Schedule send' : 'Send'}
              </button>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Schedule send for later" onClick={() => setCompose(p => ({ ...p, sendAt: p.sendAt !== null ? null : new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) }))}>
                <Icon name="clock" size={16} />
              </button>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Attach file" onClick={() => composeFileInputRef.current?.click()}>
                <Icon name="paperclip" size={16} />
              </button>
              <input ref={composeFileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) uploadAttachments(files, 'compose'); e.target.value = ''; }} />
              {quickTemplates.length > 0 && (
                <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Insert quick reply" onClick={() => setTemplatePickerOpen(v => !v)}>
                  <Icon name="layers" size={16} />
                </button>
              )}
              {templatePickerOpen && (
                <div className="em-template-picker">
                  {quickTemplates.map(t => (
                    <button key={t.id} type="button" className="em-template-picker-item" onClick={() => applyTemplate(t, 'compose')}>{t.name}</button>
                  ))}
                </div>
              )}
              <span className="em-compose-savestate">{composeSaving ? 'Saving…' : compose.draftId ? 'Saved to Drafts' : ''}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="em-text-btn" onClick={() => saveDraft()}>Save draft</button>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={discardCompose} title="Discard">
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo-send toast */}
      {undoToast && (
        <div className="em-undo-toast">
          <Icon name="send" size={14} color="var(--teal)" />
          <span>Message sending in {undoSecondsLeft}s…</span>
          <button type="button" className="em-text-btn" onClick={() => cancelScheduled(undoToast.id)}>Undo</button>
        </div>
      )}

      {/* Email account settings — IMAP mailbox connection, signature, spam blocklist */}
      {settingsOpen && (
        <div className="em-settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="em-settings-modal" onClick={e => e.stopPropagation()}>
            <div className="em-settings-hdr">
              <span className="em-compose-title" style={{ color: 'var(--ink)' }}>Email settings</span>
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setSettingsOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>
            {settingsLoading || !settings ? (
              <div className="em-loading"><Spinner size={18} /><span>Loading…</span></div>
            ) : (
              <div className="em-settings-body">
                <div className="em-settings-section">
                  <div className="em-settings-section-hdr">
                    <label className="em-compose-receipt-row">
                      <input type="checkbox" checked={settings.imapEnabled} onChange={e => setSettings({ ...settings, imapEnabled: e.target.checked })} />
                      Connect my mailbox (real inbound mail via IMAP)
                    </label>
                  </div>
                  <p className="em-settings-hint">
                    Fetched automatically every few minutes into your Inbox. {settings.lastSyncedAt
                      ? `Last synced ${new Date(settings.lastSyncedAt).toLocaleString()}.`
                      : 'Not synced yet.'}
                    {settings.lastSyncError && <span className="em-settings-error"> Last error: {settings.lastSyncError}</span>}
                  </p>
                  {settings.imapEnabled && (
                    <>
                      <div className="em-settings-row">
                        <span className="em-compose-label">Host</span>
                        <input className="em-compose-input em-settings-input" value={settings.imapHost} onChange={e => setSettings({ ...settings, imapHost: e.target.value })} placeholder="imap.example.com" />
                      </div>
                      <div className="em-settings-row">
                        <span className="em-compose-label">Port</span>
                        <input className="em-compose-input em-settings-input" type="number" value={settings.imapPort} onChange={e => setSettings({ ...settings, imapPort: parseInt(e.target.value, 10) || 993 })} />
                        <select className="em-settings-select" value={settings.imapEncryption} onChange={e => setSettings({ ...settings, imapEncryption: e.target.value as any })}>
                          <option value="ssl">SSL</option>
                          <option value="tls">TLS</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div className="em-settings-row">
                        <span className="em-compose-label">User</span>
                        <input className="em-compose-input em-settings-input" value={settings.imapUser} onChange={e => setSettings({ ...settings, imapUser: e.target.value })} placeholder="you@example.com" />
                      </div>
                      <div className="em-settings-row">
                        <span className="em-compose-label">Password</span>
                        <input className="em-compose-input em-settings-input" type="password" value={settings.imapPass} onChange={e => setSettings({ ...settings, imapPass: e.target.value })} placeholder="••••••••" />
                      </div>
                      <label className="em-compose-receipt-row">
                        <input type="checkbox" checked={settings.imapMarkAsRead} onChange={e => setSettings({ ...settings, imapMarkAsRead: e.target.checked })} />
                        Mark messages as read on the mail server once fetched
                      </label>
                      <div className="em-settings-row">
                        <button type="button" className="em-text-btn" onClick={testImapConnection} disabled={imapTesting || !settings.imapHost || !settings.imapUser}>
                          {imapTesting ? 'Testing…' : 'Test connection'}
                        </button>
                        {imapTestResult && (
                          <span className={imapTestResult.success ? 'em-settings-success' : 'em-settings-error'}>
                            {imapTestResult.success ? 'Connected successfully.' : imapTestResult.error}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="em-settings-section">
                  <div className="em-settings-section-hdr">Labels</div>
                  <p className="em-settings-hint">Custom labels you can apply to any message — replaces any fixed set.</p>
                  <div className="em-settings-row">
                    <input className="em-compose-input em-settings-input" value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createLabel(); } }}
                      placeholder="New label name" />
                    <button type="button" className="em-text-btn" onClick={createLabel}>Add</button>
                  </div>
                  <div className="em-label-manage-list">
                    {labelDefs.map(l => {
                      const c = labelColors(l.name, labelDefs);
                      return (
                        <div key={l.id} className="em-label-manage-row">
                          <span className="em-label-chip" style={{ background: c.bg, color: c.fg }}>{l.name}</span>
                          <input className="em-compose-input em-settings-input" defaultValue={l.name}
                            onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== l.name) renameLabel(l.id, e.target.value); }} />
                          <button type="button" className="em-attach-chip-remove" onClick={() => deleteLabel(l.id)}><Icon name="trash" size={13} /></button>
                        </div>
                      );
                    })}
                    {labelDefs.length === 0 && <p className="em-settings-hint">No labels yet.</p>}
                  </div>
                </div>

                <div className="em-settings-section">
                  <div className="em-settings-section-hdr">Quick replies</div>
                  <p className="em-settings-hint">Canned-response snippets you can insert into any compose or reply window.</p>
                  <div className="em-label-manage-list">
                    {quickTemplates.map(t => (
                      <div key={t.id} className="em-label-manage-row">
                        <span>{t.name}</span>
                        <button type="button" className="em-text-btn" onClick={() => setTemplateEditing(t)}>Edit</button>
                        <button type="button" className="em-attach-chip-remove" onClick={() => deleteTemplate(t.id)}><Icon name="trash" size={13} /></button>
                      </div>
                    ))}
                    {quickTemplates.length === 0 && <p className="em-settings-hint">No quick replies yet.</p>}
                  </div>
                  {templateEditing ? (
                    <div className="em-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      <input className="em-compose-input em-settings-input" value={templateEditing.name} placeholder="Template name"
                        onChange={e => setTemplateEditing(prev => prev ? { ...prev, name: e.target.value } : prev)} />
                      <input className="em-compose-input em-settings-input" value={templateEditing.subject} placeholder="Subject (optional)"
                        onChange={e => setTemplateEditing(prev => prev ? { ...prev, subject: e.target.value } : prev)} />
                      <textarea className="em-settings-textarea" value={templateEditing.body} placeholder="Body" rows={3}
                        onChange={e => setTemplateEditing(prev => prev ? { ...prev, body: e.target.value } : prev)} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-primary" onClick={saveTemplate}>Save</button>
                        <button type="button" className="em-text-btn" onClick={() => setTemplateEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="em-text-btn" onClick={() => setTemplateEditing({ id: null, name: '', subject: '', body: '' })}>+ New quick reply</button>
                  )}
                </div>

                <div className="em-settings-section">
                  <div className="em-settings-section-hdr">Signature</div>
                  <textarea className="em-settings-textarea" value={settings.signature} onChange={e => setSettings({ ...settings, signature: e.target.value })} placeholder="Appended to every message you send…" rows={3} />
                </div>

                <div className="em-settings-section">
                  <div className="em-settings-section-hdr">Spam blocklist</div>
                  <p className="em-settings-hint">Sender address, domain, or a subject keyword — matching mail is routed straight to Spam instead of Inbox. Rule-based, not an AI filter.</p>
                  <div className="em-settings-row">
                    <input className="em-compose-input em-settings-input" value={blocklistInput} onChange={e => setBlocklistInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBlocklistEntry(); } }}
                      placeholder="spam@example.com, badomain.com, or a keyword" />
                    <button type="button" className="em-text-btn" onClick={addBlocklistEntry}>Add</button>
                  </div>
                  <div className="em-blocklist-chips">
                    {settings.spamBlocklist.map(v => (
                      <span key={v} className="em-attach-chip">
                        <span>{v}</span>
                        <button type="button" className="em-attach-chip-remove" onClick={() => removeBlocklistEntry(v)}><Icon name="x" size={11} /></button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="em-settings-footer">
                  <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={settingsSaving}>
                    {settingsSaving ? 'Saving…' : 'Save settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
