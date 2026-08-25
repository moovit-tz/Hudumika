import React, { useState, useEffect } from 'react';
import { Icon, type IconName } from './Icon.js';
import { useTodos, addTodo, updateTodo, deleteTodo, useEvents, addEvent, useCurrentCalendarDate, setCurrentCalendarDate, useAppSettings, updateAppSettings } from '../data/calendarStore.js';
import { PersonAvatar } from './PersonAvatar.js';
import { Switch } from './ui/switch.js';
import { Button } from './ui/button.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { isRightSidebarCollapsed, toggleRightSidebar, RIGHT_SIDEBAR_TOGGLE_EVENT } from '../lib/rightSidebarState.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from './ui/dropdown-menu.js';
import { NotificationListItem } from './NotificationListItem.js';
import { ReminderPicker } from './ReminderPicker.js';
import { EntityPicker, type PickerItem } from './EntityPicker.js';
import './NotificationCentre.css';
import './GoogleWorkspaceRightSidebar.css';

export type CompanionPanelId = 'tasks' | 'calendar' | 'esign' | 'chat' | 'notifications' | 'analytics' | 'notes' | 'sms' | 'email' | 'contacts' | 'ai' | 'clearos' | 'finops' | 'petti' | 'nexushr' | 'seal' | 'cargotracker' | 'cloud' | 'complyos' | 'store' | 'settings' | null;

interface RailApp {
  id: Exclude<CompanionPanelId, null | 'settings'>;
  label: string;
  icon: IconName;
  color: string;
  /** Only offered/shown when this AppId is entitled for the tenant — apps
   *  that pull real tenant-scoped data (unlike Notes' local scratchpad or
   *  Calendar/Notifications, which are core platform features). */
  entitlementKey?: string;
}

const RAIL_APPS: RailApp[] = [
  { id: 'notes', label: 'Notes', icon: 'fileText', color: '#16a34a' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', color: '#0d9488' },
  { id: 'sms', label: 'SMS', icon: 'smartphone', color: '#dc2626', entitlementKey: 'sms' },
  { id: 'email', label: 'Email', icon: 'mail', color: '#ea4335', entitlementKey: 'email' },
  { id: 'chat', label: 'Teams & Discussions', icon: 'messageSquare', color: '#7c3aed' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', color: '#ef4444' },
  // 'stamp' matches AppSidebar's own nav icon for this app (not 'mail' —
  // that glyph is now Email's, above).
  { id: 'esign', label: 'eSign', icon: 'stamp', color: '#0284c7', entitlementKey: 'sign' },
  { id: 'contacts', label: 'Contacts', icon: 'contact', color: '#2563eb', entitlementKey: 'contacts' },
  { id: 'ai', label: 'AI Assistant', icon: 'sparkle', color: 'var(--teal)', entitlementKey: 'ai' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', color: '#1a73e8' },
  { id: 'analytics', label: 'Analytics', icon: 'barChart', color: '#ea580c' },
  { id: 'clearos', label: 'ClearOS', icon: 'ship', color: '#f97316', entitlementKey: 'clearos' },
  { id: 'finops', label: 'FinOps', icon: 'bankNote', color: '#059669', entitlementKey: 'finops' },
  { id: 'petti', label: 'Petti', icon: 'wallet', color: '#0d9488', entitlementKey: 'petti' },
  { id: 'nexushr', label: 'NexusHR', icon: 'users', color: '#db2777', entitlementKey: 'nexushr' },
  { id: 'seal', label: 'SEAL', icon: 'warehouse', color: '#7c3aed', entitlementKey: 'seal' },
  { id: 'cargotracker', label: 'CargoTracker', icon: 'truck', color: '#0284c7', entitlementKey: 'cargotracker' },
  { id: 'cloud', label: 'Cloud', icon: 'folder', color: '#2563eb', entitlementKey: 'cloud' },
  { id: 'complyos', label: 'ComplyOS', icon: 'shield', color: '#b45309', entitlementKey: 'complyos' },
  { id: 'store', label: 'Store', icon: 'shoppingCart', color: '#7c3aed', entitlementKey: 'store' },
];

// 'ai' isn't in the default pinned list — it has its own dedicated button
// (below the pinned-app list) with the real Hudumika AI brand glyph, so
// pinning it here too would just duplicate the same trigger.
const DEFAULT_PINNED: CompanionPanelId[] = ['notes', 'tasks', 'sms', 'email', 'chat', 'notifications', 'esign', 'contacts'];

// Panels whose drawer shows a filterable list — the search button only
// appears for these, rather than on a scratchpad or a static toggle grid
// where "search" wouldn't do anything real.
const SEARCHABLE_PANELS = new Set<CompanionPanelId>(['tasks', 'calendar', 'esign', 'chat', 'notifications', 'sms', 'email', 'contacts', 'clearos', 'finops', 'petti', 'nexushr', 'seal', 'cargotracker', 'cloud', 'complyos', 'store']);

// Real full-page route for panels that have one — drives the "open in app"
// button. Panels without a dedicated page (settings) are omitted rather than
// linking somewhere fake. notifications → the same notification centre
// AppHeader's own bell dropdown links out to (NotificationCentre.tsx's
// footer), not a page built just for this drawer.
const PANEL_ROUTES: Partial<Record<Exclude<CompanionPanelId, null>, string>> = {
  notes: '/notes', tasks: '/tasks', calendar: '/calendar', esign: '/sign',
  chat: '/chat', sms: '/sms', email: '/email', contacts: '/contacts', ai: '/ai', analytics: '/hudubi',
  notifications: '/bliss/notifications',
  clearos: '/shipments', finops: '/finance/invoices', petti: '/petti/wallets',
  nexushr: '/nexushr', seal: '/seal/consignments', cargotracker: '/cargotracker/bookings',
  cloud: '/cloud', complyos: '/complyos/obligations', store: '/store',
};
const PINNED_KEY = 'hudumika_companion_rail_apps';

// Shared look for every panel's inline "quick create" composer — one input
// style and one collapsed-state toggle button, reused by Calendar/Notes/
// SMS/Email/Contacts/Chat rather than each panel inventing its own.
const composerInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--ink)',
};
const composerToggleStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
  border: '1px dashed var(--border2)', background: 'none', color: 'var(--ink2)',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
};

function loadPinned(): CompanionPanelId[] {
  try {
    const saved = localStorage.getItem(PINNED_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_PINNED;
  } catch {
    return DEFAULT_PINNED;
  }
}

export const GoogleWorkspaceRightSidebar: React.FC = () => {
  const [activePanel, setActivePanel] = useState<CompanionPanelId>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [openReminderTodoId, setOpenReminderTodoId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<CompanionPanelId[]>(loadPinned);

  const todos = useTodos();
  const events = useEvents();
  const appSettings = useAppSettings();
  const currentDate = useCurrentCalendarDate();
  const enabledApps = useEnabledApps();
  const { user } = useAuth();

  const activeTodos = todos.filter(t => !t.completed && !t.deletedAt);

  useEffect(() => {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  function togglePinned(id: CompanionPanelId) {
    setPinnedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // ── Notes — real, /v1/notes ──
  const [notesList, setNotesList] = useState<{ id: string; title: string; content: string; updatedAt: string; isTrashed: boolean; isArchived: boolean }[]>([]);
  const [noteComposerText, setNoteComposerText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  function loadNotes() {
    apiFetch('/v1/notes?limit=8')
      .then(res => setNotesList(Array.isArray(res?.notes) ? res.notes : []))
      .catch(() => {});
  }
  useEffect(() => { loadNotes(); }, []);
  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    const text = noteComposerText.trim();
    if (!text || noteSaving) return;
    setNoteSaving(true);
    try {
      await apiFetch('/v1/notes', { method: 'POST', body: JSON.stringify({ content: text }) });
      setNoteComposerText('');
      loadNotes();
    } catch (err: any) {
      showAlert(err?.message || 'Could not save note.');
    } finally {
      setNoteSaving(false);
    }
  }
  function handleDeleteNote(id: string) {
    setNotesList(prev => prev.filter(n => n.id !== id));
    apiFetch(`/v1/notes/${id}/trash`, { method: 'PATCH' }).catch(() => {});
  }

  // ── Calendar — quick "+ New event" composer, real via addEvent() (POST /v1/tasks/events) ──
  const [eventComposerOpen, setEventComposerOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventRemind, setNewEventRemind] = useState(true);
  function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventDate) return;
    const start = `${newEventDate}T${newEventTime || '09:00'}`;
    const startDate = new Date(start);
    const end = new Date(startDate.getTime() + 30 * 60000);
    addEvent({
      title: newEventTitle.trim(),
      start,
      end: end.toISOString().slice(0, 16),
      category: 'work',
      reminderOffsets: newEventRemind ? [10] : [],
    });
    setNewEventTitle(''); setNewEventDate(''); setNewEventTime(''); setEventComposerOpen(false);
  }

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
  // Same shape as AppHeader's own handleMarkRead — one row read, on click.
  function markNotificationRead(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadNotifCount(prev => Math.max(0, prev - 1));
    apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }

  // ── Team chat — real, /v1/chat/channels. Channel rows expand inline into a
  // real reply thread (GET/POST .../messages) — there is no message edit or
  // delete anywhere in this app yet (not even the full Chat page), so this
  // panel doesn't fabricate those actions either. Leaving/deleting the
  // conversation itself is real (DELETE /v1/chat/channels/:id), same as the
  // full Chat page's own kebab menu. ──
  const [channels, setChannels] = useState<{ id: string; type: 'channel' | 'dm' | 'group'; name: string; created_by: string; unread: number; last_message: string | null; last_message_at: string | null }[]>([]);
  function loadChannels() {
    apiFetch('/v1/chat/channels')
      .then(res => setChannels(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }
  useEffect(() => { loadChannels(); }, []);
  const totalUnreadChats = channels.reduce((sum, c) => sum + (c.unread || 0), 0);

  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    const name = newChannelName.trim();
    if (!name) return;
    try {
      await apiFetch('/v1/chat/channels', { method: 'POST', body: JSON.stringify({ type: 'channel', name }) });
      setNewChannelName(''); setNewChannelOpen(false);
      loadChannels();
    } catch (err: any) {
      showAlert(err?.message || 'Could not start the chat.');
    }
  }

  const [openThreadChannelId, setOpenThreadChannelId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<{ id: string; author_name: string; content: string; created_at: string }[]>([]);
  const [threadReply, setThreadReply] = useState('');
  function openThread(channelId: string) {
    setOpenThreadChannelId(prev => prev === channelId ? null : channelId);
    setThreadReply('');
    if (channelId !== openThreadChannelId) {
      apiFetch(`/v1/chat/channels/${channelId}/messages`)
        .then(res => setThreadMessages(Array.isArray(res?.data) ? res.data.slice(-8) : []))
        .catch(() => setThreadMessages([]));
      apiFetch(`/v1/chat/channels/${channelId}/read`, { method: 'PATCH' }).catch(() => {});
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, unread: 0 } : c));
    }
  }
  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    const content = threadReply.trim();
    if (!content || !openThreadChannelId) return;
    setThreadReply('');
    try {
      const msg = await apiFetch(`/v1/chat/channels/${openThreadChannelId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
      setThreadMessages(prev => [...prev, msg]);
      loadChannels();
    } catch (err: any) {
      showAlert(err?.message || 'Could not send reply.');
    }
  }
  async function handleLeaveOrDeleteChannel(e: React.MouseEvent, ch: typeof channels[number]) {
    e.preventDefault();
    e.stopPropagation();
    const isOwner = ch.type !== 'dm' && ch.created_by === user?.id;
    const message = ch.type === 'dm'
      ? `Remove your conversation with ${ch.name}? It stays in their inbox — this only clears it from yours.`
      : isOwner
        ? `Delete #${ch.name} for everyone? Every message in it is gone for good.`
        : `Leave ${ch.name}? You can be re-added by another member later.`;
    const ok = await showConfirm(message, { title: isOwner && ch.type !== 'dm' ? 'Delete channel' : 'Leave conversation', confirmLabel: isOwner && ch.type !== 'dm' ? 'Delete' : 'Leave' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/chat/channels/${ch.id}`, { method: 'DELETE' });
      setChannels(prev => prev.filter(c => c.id !== ch.id));
      if (openThreadChannelId === ch.id) setOpenThreadChannelId(null);
      setBrowseChannels(null);
    } catch (err: any) {
      showAlert(err?.message || 'Could not leave this conversation.');
    }
  }

  // Channels/groups in this tenant the user hasn't joined yet — shown behind
  // a "Browse" toggle so "Start a chat" isn't the only way in (that always
  // creates something new; this joins something that already exists).
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseChannels, setBrowseChannels] = useState<{ id: string; type: 'channel' | 'group'; name: string; member_count: number }[] | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  function toggleBrowse() {
    setBrowseOpen(o => {
      const next = !o;
      if (next && browseChannels === null) {
        setBrowseLoading(true);
        apiFetch('/v1/chat/channels/browse')
          .then(res => setBrowseChannels(Array.isArray(res?.data) ? res.data : []))
          .catch(() => setBrowseChannels([]))
          .finally(() => setBrowseLoading(false));
      }
      return next;
    });
  }
  async function handleJoinChannel(ch: { id: string }) {
    setJoiningChannelId(ch.id);
    try {
      await apiFetch(`/v1/chat/channels/${ch.id}/join`, { method: 'POST' });
      setBrowseChannels(prev => (prev ?? []).filter(c => c.id !== ch.id));
      loadChannels();
    } catch (err: any) {
      showAlert(err?.message || 'Could not join this conversation.');
    } finally {
      setJoiningChannelId(null);
    }
  }

  // ── SMS — real, /v1/sms/messages (only fetched if the app is entitled) ──
  const smsEnabled = isAppEnabled('sms', enabledApps);
  const [smsMessages, setSmsMessages] = useState<{ id: string; to_number: string; contact_name: string | null; body: string; status: string; created_at: string }[]>([]);
  function loadSmsMessages() {
    if (!smsEnabled) return;
    apiFetch('/v1/sms/messages?limit=6')
      .then(res => setSmsMessages(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }
  useEffect(() => { loadSmsMessages(); }, [smsEnabled]);

  const [smsComposerOpen, setSmsComposerOpen] = useState(false);
  // Picker's id doubles as the phone number itself — there's nothing else to
  // key it by once a hand-typed number (no contact record) is in play.
  const [smsToItem, setSmsToItem] = useState<PickerItem | null>(null);
  const [smsBody, setSmsBody] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const SMS_SOURCE_LABEL: Record<string, string> = { contact: 'Contact', lead: 'Lead', customer: 'Customer', user: 'Staff' };
  async function searchSmsRecipients(query: string): Promise<PickerItem[]> {
    if (query.trim().length < 2) return [];
    const res = await apiFetch(`/v1/sms/recipients/search?q=${encodeURIComponent(query.trim())}`);
    const rows: { id: string; name: string; phone: string; source: string }[] = Array.isArray(res?.data) ? res.data : [];
    return rows.map(r => ({ id: r.phone, label: r.name, sublabel: `${r.phone} · ${SMS_SOURCE_LABEL[r.source] || r.source}` }));
  }
  async function handleSendSms(e: React.FormEvent) {
    e.preventDefault();
    const to = smsToItem?.id.trim();
    if (!to || !smsBody.trim() || smsSending) return;
    setSmsSending(true);
    try {
      await apiFetch('/v1/sms/send', { method: 'POST', body: JSON.stringify({ to: [to], body: smsBody.trim() }) });
      setSmsToItem(null); setSmsBody(''); setSmsComposerOpen(false);
      loadSmsMessages();
    } catch (err: any) {
      showAlert(err?.message || 'Could not send SMS.');
    } finally {
      setSmsSending(false);
    }
  }

  // ── Contacts — real, /v1/contacts (only fetched if the app is entitled) ──
  const contactsEnabled = isAppEnabled('contacts', enabledApps);
  const [contacts, setContacts] = useState<{ id: string; first_name: string; last_name: string | null; email: string | null; company: string | null }[]>([]);
  function loadContacts() {
    if (!contactsEnabled) return;
    apiFetch('/v1/contacts')
      .then(rows => setContacts(Array.isArray(rows) ? rows.slice(0, 8) : []))
      .catch(() => {});
  }
  useEffect(() => { loadContacts(); }, [contactsEnabled]);

  const [contactComposerOpen, setContactComposerOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newContactName.trim() || contactSaving) return;
    setContactSaving(true);
    try {
      await apiFetch('/v1/contacts', { method: 'POST', body: JSON.stringify({ first_name: newContactName.trim(), phone: newContactPhone.trim() || undefined }) });
      setNewContactName(''); setNewContactPhone(''); setContactComposerOpen(false);
      loadContacts();
    } catch (err: any) {
      showAlert(err?.message || 'Could not add contact.');
    } finally {
      setContactSaving(false);
    }
  }

  // ── Email — real, /v1/emails?folder=inbox (only fetched if the app is entitled) ──
  const emailEnabled = isAppEnabled('email', enabledApps);
  const [inboxEmails, setInboxEmails] = useState<{ id: string; from: { name: string; email: string }; subject: string; snippet: string; read: boolean; date: string }[]>([]);
  function loadInboxEmails() {
    if (!emailEnabled) return;
    apiFetch('/v1/emails?folder=inbox')
      .then(rows => setInboxEmails(Array.isArray(rows) ? rows.slice(0, 6) : []))
      .catch(() => {});
  }
  useEffect(() => { loadInboxEmails(); }, [emailEnabled]);

  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim() || emailSending) return;
    setEmailSending(true);
    try {
      await apiFetch('/v1/email/send', { method: 'POST', body: JSON.stringify({ to: emailTo.trim(), subject: emailSubject.trim(), body: emailBody.trim() }) });
      setEmailTo(''); setEmailSubject(''); setEmailBody(''); setEmailComposerOpen(false);
    } catch (err: any) {
      showAlert(err?.message || 'Could not send email.');
    } finally {
      setEmailSending(false);
    }
  }

  // ── AI Assistant — real, /v1/ai/chat (agentic chat, tenant memory + tools) ──
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);

  async function handleSendAiMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = aiInput.trim();
    if (!text || aiSending) return;
    setAiMessages(prev => [...prev, { role: 'user', content: text }]);
    setAiInput('');
    setAiSending(true);
    setAiError(null);
    try {
      const res = await apiFetch('/v1/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, conversation_id: aiConversationId }),
      });
      setAiConversationId(res.conversation_id ?? aiConversationId);
      setAiMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err: any) {
      setAiError(err?.message || 'Could not reach the AI assistant.');
    } finally {
      setAiSending(false);
    }
  }

  // ── ClearOS — real, /v1/shipments. No inline create composer — a shipment
  // needs customs-relevant fields (customer, mode, ports) a rail form
  // shouldn't dumb down, so this links out to the real intake page instead,
  // same call the eSign panel makes for "+ New envelope". ──
  const clearosEnabled = isAppEnabled('clearos', enabledApps);
  const [shipments, setShipments] = useState<{ id: string; bl_number: string | null; ref_number: string | null; goods_desc: string | null; status: string; type: string | null }[]>([]);
  function loadShipments() {
    if (!clearosEnabled) return;
    apiFetch('/v1/shipments')
      .then((res: any) => setShipments((Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []).slice(0, 6)))
      .catch(() => {});
  }
  useEffect(() => { loadShipments(); }, [clearosEnabled]);

  // ── FinOps — real, /v1/invoices (GET) + POST for a minimal quick invoice
  // (client name + a single line item) — the full form has line items, tax
  // codes, shipment linking etc. that belong on the real Billing page. ──
  const finopsEnabled = isAppEnabled('finops', enabledApps);
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; client_name: string | null; status: string; items: { rate?: number; qty?: number }[] }[]>([]);
  function loadInvoices() {
    if (!finopsEnabled) return;
    apiFetch('/v1/invoices')
      .then((res: any) => setInvoices((Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []).slice(0, 6)))
      .catch(() => {});
  }
  useEffect(() => { loadInvoices(); }, [finopsEnabled]);

  const [invoiceComposerOpen, setInvoiceComposerOpen] = useState(false);
  const [invoiceClientName, setInvoiceClientName] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDesc, setInvoiceDesc] = useState('');
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceClientName.trim() || !invoiceAmount || Number(invoiceAmount) <= 0 || invoiceSaving) return;
    setInvoiceSaving(true);
    try {
      await apiFetch('/v1/invoices', {
        method: 'POST',
        body: JSON.stringify({
          client_name: invoiceClientName.trim(),
          items: [{ name: invoiceDesc.trim() || 'Services rendered', rate: Number(invoiceAmount), qty: 1 }],
        }),
      });
      setInvoiceClientName(''); setInvoiceAmount(''); setInvoiceDesc(''); setInvoiceComposerOpen(false);
      loadInvoices();
    } catch (err: any) {
      showAlert(err?.message || 'Could not create invoice.');
    } finally {
      setInvoiceSaving(false);
    }
  }

  // ── Petti — real, /v1/petti/wallets (GET) + /v1/petti/wallets/:id/deposits
  // (POST) for a quick manual top-up against the first wallet. ──
  const pettiEnabled = isAppEnabled('petti', enabledApps);
  const [pettiWallets, setPettiWallets] = useState<{ id: string; name: string; currency: string; balance: number }[]>([]);
  function loadPettiWallets() {
    if (!pettiEnabled) return;
    apiFetch('/v1/petti/wallets')
      .then((res: any) => setPettiWallets(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }
  useEffect(() => { loadPettiWallets(); }, [pettiEnabled]);

  const [depositComposerOpen, setDepositComposerOpen] = useState(false);
  const [depositWalletId, setDepositWalletId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositSaving, setDepositSaving] = useState(false);
  useEffect(() => {
    if (pettiWallets.length > 0 && !depositWalletId) setDepositWalletId(pettiWallets[0].id);
  }, [pettiWallets]); // eslint-disable-line react-hooks/exhaustive-deps
  async function handleQuickDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositWalletId || !depositAmount || Number(depositAmount) <= 0 || depositSaving) return;
    setDepositSaving(true);
    try {
      await apiFetch(`/v1/petti/wallets/${depositWalletId}/deposits`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(depositAmount), method: 'manual' }),
      });
      setDepositAmount(''); setDepositComposerOpen(false);
      loadPettiWallets();
    } catch (err: any) {
      showAlert(err?.message || 'Could not record deposit.');
    } finally {
      setDepositSaving(false);
    }
  }

  // ── NexusHR — real, /v1/hr/staff (GET). Quick-create sends a real invite
  // (/v1/hr/invitations, email+role) — this app doesn't insert a staff row
  // directly, a person joins via that same invite everywhere else too. ──
  const nexushrEnabled = isAppEnabled('nexushr', enabledApps);
  const [staffList, setStaffList] = useState<{ id: string; name: string; email: string; role: string; active: boolean }[]>([]);
  function loadStaff() {
    if (!nexushrEnabled) return;
    apiFetch('/v1/hr/staff')
      .then((res: any) => setStaffList((Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []).slice(0, 8)))
      .catch(() => {});
  }
  useEffect(() => { loadStaff(); }, [nexushrEnabled]);

  const [inviteComposerOpen, setInviteComposerOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('OFFICER');
  const [inviteSaving, setInviteSaving] = useState(false);
  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || inviteSaving) return;
    setInviteSaving(true);
    try {
      await apiFetch('/v1/hr/invitations', { method: 'POST', body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) });
      setInviteEmail(''); setInviteComposerOpen(false);
    } catch (err: any) {
      showAlert(err?.message || 'Could not send invitation.');
    } finally {
      setInviteSaving(false);
    }
  }

  // ── SEAL — real, /v1/seal/consignments (GET). No inline create — a
  // consignment needs a compartment + owner picker (same reasoning as
  // ClearOS above), so this links out to the real intake page instead. ──
  const sealEnabled = isAppEnabled('seal', enabledApps);
  const [consignments, setConsignments] = useState<{ id: string; owner_name?: string; transport_doc_number: string | null; status: string; goods_description: string | null }[]>([]);
  function loadConsignments() {
    if (!sealEnabled) return;
    apiFetch('/v1/seal/consignments')
      .then((res: any) => setConsignments((Array.isArray(res) ? res : res?.data || []).slice(0, 6)))
      .catch(() => {});
  }
  useEffect(() => { loadConsignments(); }, [sealEnabled]);

  // ── CargoTracker — real, /v1/freight-booking/bookings (GET only — booking
  // requests originate elsewhere; this app quotes/confirms them, it doesn't
  // create new ones, so there's no quick-create composer here). ──
  const cargotrackerEnabled = isAppEnabled('cargotracker', enabledApps);
  const [bookings, setBookings] = useState<{ id: string; booking_number: string; customer_name: string | null; origin_port: string; destination_port: string; status: string }[]>([]);
  function loadBookings() {
    if (!cargotrackerEnabled) return;
    apiFetch('/v1/freight-booking/bookings')
      .then((res: any) => setBookings((Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []).slice(0, 6)))
      .catch(() => {});
  }
  useEffect(() => { loadBookings(); }, [cargotrackerEnabled]);

  // ── Cloud/Drive — real, /v1/drives (to find the default drive) then
  // /v1/files?drive_id=... for its recent files. No inline upload — file
  // upload here is a real multipart request, a different shape from every
  // other composer in this file, so it links out to the real Drive UI. ──
  const cloudEnabled = isAppEnabled('cloud', enabledApps);
  const [driveFiles, setDriveFiles] = useState<{ id: string; name: string; type: string; size: number | null; owner_name: string }[]>([]);
  function loadDriveFiles() {
    if (!cloudEnabled) return;
    apiFetch('/v1/drives')
      .then((res: any) => {
        const drives = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const driveId = drives[0]?.id;
        if (!driveId) return [];
        return apiFetch(`/v1/files?drive_id=${driveId}`);
      })
      .then((res: any) => {
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setDriveFiles(rows.filter((f: any) => f.type !== 'folder').slice(0, 8));
      })
      .catch(() => {});
  }
  useEffect(() => { loadDriveFiles(); }, [cloudEnabled]);

  // ── ComplyOS — real, /v1/comply/obligations. No inline create — an
  // obligation is picked from a licence/agency catalog, not typed freehand,
  // same reasoning as ClearOS/SEAL above. ──
  const complyosEnabled = isAppEnabled('complyos', enabledApps);
  const [obligations, setObligations] = useState<{ id: string; name: string; status: string; due_date: string | null; customer_name: string | null }[]>([]);
  function loadObligations() {
    if (!complyosEnabled) return;
    apiFetch('/v1/comply/obligations')
      .then((res: any) => setObligations((Array.isArray(res) ? res : res?.data || []).slice(0, 8)))
      .catch(() => {});
  }
  useEffect(() => { loadObligations(); }, [complyosEnabled]);

  // ── Store — real, /v1/store/apps catalog. Installing an add-on is a
  // bigger decision (permissions consent) than a rail quick-action, so this
  // is a browse-only view — no install button here. ──
  const storeEnabled = isAppEnabled('store', enabledApps);
  const [storeApps, setStoreApps] = useState<{ id: string; name: string; category: string; shortDesc: string; rating: number }[]>([]);
  function loadStoreApps() {
    if (!storeEnabled) return;
    apiFetch('/v1/store/apps')
      .then((res: any) => setStoreApps((Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []).slice(0, 8)))
      .catch(() => {});
  }
  useEffect(() => { loadStoreApps(); }, [storeEnabled]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchTerm = searchOpen ? searchQuery.trim().toLowerCase() : '';
  function matches(...fields: (string | null | undefined)[]) {
    return !searchTerm || fields.some(f => f?.toLowerCase().includes(searchTerm));
  }

  function togglePanel(id: CompanionPanelId) {
    setActivePanel(prev => prev === id ? null : id);
    setSearchOpen(false);
    setSearchQuery('');
  }

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    addTodo({ title: newTaskTitle.trim() });
    setNewTaskTitle('');
  }

  const [collapsed, setCollapsed] = useState(isRightSidebarCollapsed);

  useEffect(() => {
    function handleToggle(e: Event) {
      setCollapsed((e as CustomEvent<boolean>).detail);
    }
    window.addEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  function badgeFor(id: CompanionPanelId): { count: number; color: 'teal' | 'blue' | 'red' } | null {
    if (id === 'tasks' && activeTodos.length > 0) return { count: activeTodos.length, color: 'teal' };
    if (id === 'esign' && envelopes.length > 0) return { count: envelopes.length, color: 'blue' };
    if (id === 'chat' && totalUnreadChats > 0) return { count: totalUnreadChats, color: 'blue' };
    if (id === 'notifications' && unreadNotifCount > 0) return { count: unreadNotifCount, color: 'red' };
    if (id === 'email') {
      const unread = inboxEmails.filter(m => !m.read).length;
      if (unread > 0) return { count: unread, color: 'red' };
    }
    return null;
  }

  // Available apps this tenant can actually use — entitlement-gated ones
  // (sms, esign, contacts) drop out entirely, rather than pinning a rail icon
  // that would only ever render an empty/permission-denied panel.
  const availableApps = RAIL_APPS.filter(app => !app.entitlementKey || isAppEnabled(app.entitlementKey, enabledApps));

  // The rail shows every pinned, available app, including whichever one is
  // currently open — it used to drop out of this list the moment its drawer
  // opened, which meant there was nothing left on the rail to click to close
  // it again, and every icon below it jumped up to fill the gap. It now stays
  // put and just picks up '.active' (className below) instead.
  const railApps = availableApps.filter(app => pinnedIds.includes(app.id));

  // The drawer un-mounts a beat after activePanel clears, so it can play a
  // real close transition instead of just vanishing — renderedPanel is what
  // actually stays in the DOM (and what the drawer's own content reads,
  // shadowing activePanel by that same name inside the block below) while
  // `closing` drives the reverse of .gws-drawer's own open keyframes.
  const [renderedPanel, setRenderedPanel] = useState<CompanionPanelId>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (activePanel) {
      setRenderedPanel(activePanel);
      setClosing(false);
      return;
    }
    if (renderedPanel) {
      setClosing(true);
      const t = setTimeout(() => { setRenderedPanel(null); setClosing(false); }, 180);
      return () => clearTimeout(t);
    }
  }, [activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="gws-right-sidebar-root">
      {/* ── 320px Companion Side Drawer ── */}
      {renderedPanel && (
        <div className={`gws-drawer${closing ? ' gws-drawer-closing' : ''}`}>
        {(() => { const activePanel = renderedPanel; return (
        <>
          {/* Header */}
          <div className="gws-drawer-header">
            <div className="gws-drawer-title">
              {activePanel === 'tasks' && <><Icon name="tasks" size={17} style={{ color: '#0d9488' }} /> Tasks</>}
              {activePanel === 'calendar' && <><Icon name="calendar" size={17} style={{ color: '#1a73e8' }} /> Schedule Agenda</>}
              {activePanel === 'esign' && <><Icon name="stamp" size={17} style={{ color: '#0284c7' }} /> eSign</>}
              {activePanel === 'chat' && <><Icon name="messageSquare" size={17} style={{ color: '#7c3aed' }} /> Team Chat &amp; Mentions</>}
              {activePanel === 'notifications' && <><Icon name="bell" size={17} style={{ color: '#ef4444' }} /> Notifications</>}
              {activePanel === 'analytics' && <><Icon name="barChart" size={17} style={{ color: '#ea580c' }} /> Workspace Stats</>}
              {activePanel === 'notes' && <><Icon name="fileText" size={17} style={{ color: '#16a34a' }} /> Notes</>}
              {activePanel === 'sms' && <><Icon name="smartphone" size={17} style={{ color: '#dc2626' }} /> SMS</>}
              {activePanel === 'email' && <><Icon name="mail" size={17} style={{ color: '#ea4335' }} /> Email</>}
              {activePanel === 'contacts' && <><Icon name="contact" size={17} style={{ color: '#2563eb' }} /> Contacts</>}
              {activePanel === 'ai' && <><Icon name="sparkle" size={17} style={{ color: 'var(--teal)' }} /> AI Assistant</>}
              {activePanel === 'clearos' && <><Icon name="ship" size={17} style={{ color: '#f97316' }} /> ClearOS</>}
              {activePanel === 'finops' && <><Icon name="bankNote" size={17} style={{ color: '#059669' }} /> FinOps</>}
              {activePanel === 'petti' && <><Icon name="wallet" size={17} style={{ color: '#0d9488' }} /> Petti</>}
              {activePanel === 'nexushr' && <><Icon name="users" size={17} style={{ color: '#db2777' }} /> NexusHR</>}
              {activePanel === 'seal' && <><Icon name="warehouse" size={17} style={{ color: '#7c3aed' }} /> SEAL</>}
              {activePanel === 'cargotracker' && <><Icon name="truck" size={17} style={{ color: '#0284c7' }} /> CargoTracker</>}
              {activePanel === 'cloud' && <><Icon name="folder" size={17} style={{ color: '#2563eb' }} /> Cloud</>}
              {activePanel === 'complyos' && <><Icon name="shield" size={17} style={{ color: '#b45309' }} /> ComplyOS</>}
              {activePanel === 'store' && <><Icon name="shoppingCart" size={17} style={{ color: '#7c3aed' }} /> Store</>}
              {activePanel === 'settings' && <><Icon name="settings" size={17} style={{ color: 'var(--ink2)' }} /> Quick Settings</>}
            </div>
            <div className="gws-drawer-actions">
              {SEARCHABLE_PANELS.has(activePanel) && (
                <button
                  className={`gws-drawer-action ${searchOpen ? 'active' : ''}`}
                  onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
                  title="Search"
                >
                  <Icon name="search" size={15} />
                </button>
              )}
              {PANEL_ROUTES[activePanel] && (
                <a className="gws-drawer-action" href={PANEL_ROUTES[activePanel]} target="_blank" rel="noreferrer" title="Open full app">
                  <Icon name="externalLink" size={15} />
                </a>
              )}
              <button className="gws-drawer-action" onClick={() => setActivePanel(null)} title="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="gws-drawer-search-row">
              <Icon name="search" size={14} style={{ color: 'var(--ink3)' }} />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="gws-drawer-search-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="gws-drawer-search-clear">
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          )}

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
                  {todos.filter(t => matches(t.title)).map(todo => (
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
                      <ReminderPicker
                        value={todo.reminder ?? null}
                        onChange={v => updateTodo(todo.id, { reminder: v })}
                        open={openReminderTodoId === todo.id}
                        onOpenChange={o => setOpenReminderTodoId(o ? todo.id : null)}
                        triggerStyle={{ background: 'none', border: 'none', cursor: 'pointer', color: todo.reminder ? 'var(--teal)' : 'var(--ink4)', display: 'flex', padding: 2 }}
                      />
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

            {/* CALENDAR PANEL — real, addEvent() posts to /v1/tasks/events */}
            {activePanel === 'calendar' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {eventComposerOpen ? (
                  <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <input autoFocus value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} placeholder="Event title" style={composerInputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="date" required value={newEventDate} onChange={e => setNewEventDate(e.target.value)} style={{ ...composerInputStyle, flex: 1 }} />
                      <input type="time" value={newEventTime} onChange={e => setNewEventTime(e.target.value)} style={{ ...composerInputStyle, flex: 1 }} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newEventRemind} onChange={e => setNewEventRemind(e.target.checked)} />
                      <Icon name="bell" size={12} /> Remind me 10 min before
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" size="xs" style={{ background: 'var(--teal)', color: '#fff', flex: 1 }}>Create event</Button>
                      <Button type="button" size="xs" variant="outline" onClick={() => setEventComposerOpen(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setEventComposerOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> New event
                  </button>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Upcoming Events</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {events.filter(ev => matches(ev.title)).slice(0, 6).map(ev => (
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
                <a href="/sign/editor" style={composerToggleStyle}>
                  <Icon name="plus" size={14} /> New envelope
                </a>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>
                  {envelopes.length} Envelope Request{envelopes.length === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {envelopes.filter(env => matches(env.title)).map(env => (
                    <a key={env.id} href={`/sign/envelope/${env.id}`} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Icon name="stamp" size={16} style={{ color: 'var(--teal)' }} />
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

            {/* CHAT PANEL — real, /v1/chat/channels. Each row expands inline
                into a real reply thread (GET/POST .../messages). Editing or
                deleting a message isn't offered — no route for either exists
                anywhere in the Chat API today, not just in this panel. */}
            {activePanel === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {newChannelOpen ? (
                  <form onSubmit={handleCreateChannel} style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <input autoFocus value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="Chat / channel name" style={{ ...composerInputStyle, flex: 1 }} />
                    <Button type="submit" size="xs" style={{ background: 'var(--teal)', color: '#fff' }}>Start</Button>
                  </form>
                ) : (
                  <button type="button" onClick={() => setNewChannelOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> Start a chat
                  </button>
                )}

                <button type="button" onClick={toggleBrowse} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 12, fontWeight: 600, padding: '2px 2px' }}>
                  <Icon name={browseOpen ? 'chevronDown' : 'chevronRight'} size={12} /> Browse channels &amp; groups
                </button>
                {browseOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {browseLoading && <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '4px 2px' }}>Loading…</div>}
                    {!browseLoading && (browseChannels?.length ?? 0) === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '4px 2px' }}>You've already joined everything here.</div>
                    )}
                    {!browseLoading && browseChannels?.map(bc => (
                      <div key={bc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                        {bc.type === 'channel'
                          ? <span style={{ color: 'var(--ink3)', fontSize: 13, width: 14, textAlign: 'center', flexShrink: 0, fontWeight: 800 }}>#</span>
                          : <Icon name="messageSquare" size={12} style={{ color: 'var(--ink3)' }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bc.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{bc.member_count} member{bc.member_count === 1 ? '' : 's'}</div>
                        </div>
                        <button type="button" onClick={() => handleJoinChannel(bc)} disabled={joiningChannelId === bc.id}
                          style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--teal-m)', background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 11, fontWeight: 700, cursor: joiningChannelId === bc.id ? 'default' : 'pointer' }}>
                          {joiningChannelId === bc.id ? '…' : 'Join'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Team Activity &amp; Discussions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {channels.filter(c => matches(c.name, c.last_message)).map(c => {
                    const isOpen = openThreadChannelId === c.id;
                    return (
                      <div key={c.id} data-channel-id={c.id} style={{ borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'stretch' }}>
                          <button type="button" onClick={() => openThread(c.id)} style={{ flex: 1, minWidth: 0, padding: 10, display: 'flex', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
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
                          </button>
                          <button type="button" onClick={e => handleLeaveOrDeleteChannel(e, c)} title={c.type === 'dm' ? 'Remove conversation' : 'Leave / delete channel'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', display: 'flex', alignItems: 'center', padding: '0 10px', flexShrink: 0 }}>
                            <Icon name="moreVertical" size={14} />
                          </button>
                        </div>
                        {isOpen && (
                          <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                              {threadMessages.map(m => (
                                <div key={m.id} style={{ fontSize: 12, lineHeight: 1.4 }}>
                                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{m.author_name}: </span>
                                  <span style={{ color: 'var(--ink2)' }}>{m.content}</span>
                                </div>
                              ))}
                              {threadMessages.length === 0 && (
                                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>No messages yet — say hello.</div>
                              )}
                            </div>
                            <form onSubmit={handleSendReply} style={{ display: 'flex', gap: 6 }}>
                              <input autoFocus value={threadReply} onChange={e => setThreadReply(e.target.value)} placeholder="Reply…" style={{ ...composerInputStyle, flex: 1, padding: '6px 10px' }} />
                              <Button type="submit" size="xs" disabled={!threadReply.trim()} style={{ background: 'var(--teal)', color: '#fff' }}>Reply</Button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {channels.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No conversations yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* NOTIFICATIONS PANEL — real, /v1/notifications, same row component
                and mark-read/deep-link behavior as AppHeader's own bell dropdown */}
            {activePanel === 'notifications' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 -16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>{notifs.length} Notifications</span>
                  {unreadNotifCount > 0 && (
                    <button type="button" onClick={markAllNotificationsRead} style={{ fontSize: 11.5, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark all read</button>
                  )}
                </div>
                <div>
                  {notifs.filter(n => matches(n.title)).map(n => (
                    <NotificationListItem key={n.id} n={n} onMarkRead={markNotificationRead} onNavigate={() => setActivePanel(null)} />
                  ))}
                  {notifs.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 16px' }}>No notifications.</div>
                  )}
                </div>
                <a href="/bliss/notifications" style={{ textAlign: 'center', padding: '10px 16px 0', margin: '0 16px', borderTop: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                  View all in Notification Centre
                </a>
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

            {/* NOTES PANEL — real, /v1/notes */}
            {activePanel === 'notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <form onSubmit={handleCreateNote} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={noteComposerText}
                    onChange={e => setNoteComposerText(e.target.value)}
                    placeholder="Take a note…"
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--ink)', resize: 'vertical' }}
                  />
                  {noteComposerText.trim() && (
                    <Button type="submit" size="xs" disabled={noteSaving} style={{ background: 'var(--teal)', color: '#fff', alignSelf: 'flex-end' }}>
                      {noteSaving ? 'Saving…' : 'Save note'}
                    </Button>
                  )}
                </form>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Notes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notesList.filter(n => !n.isTrashed && !n.isArchived).filter(n => matches(n.title, n.content)).map(n => (
                    <a key={n.id} href="/notes" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8, textDecoration: 'none' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {n.title && <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>}
                        <div style={{ fontSize: 12, color: 'var(--ink2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.content || 'Empty note'}</div>
                      </div>
                      <button type="button" onClick={e => { e.preventDefault(); handleDeleteNote(n.id); }} style={{ background: 'none', border: 'none', color: 'var(--ink4)', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </a>
                  ))}
                  {notesList.filter(n => !n.isTrashed && !n.isArchived).length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No notes yet. Take one above!</div>
                  )}
                </div>
              </div>
            )}

            {/* SMS PANEL — real, /v1/sms/messages + /v1/sms/send */}
            {activePanel === 'sms' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {smsComposerOpen ? (
                  <form onSubmit={handleSendSms} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <EntityPicker
                      value={smsToItem}
                      onChange={setSmsToItem}
                      search={searchSmsRecipients}
                      onCreate={async q => ({ id: q.trim(), label: q.trim(), sublabel: 'Send to this number' })}
                      createLabel={q => `Send to "${q}"`}
                      placeholder="Search contacts or type a number"
                    />
                    <textarea value={smsBody} onChange={e => setSmsBody(e.target.value)} placeholder="Message" rows={2} style={{ ...composerInputStyle, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" size="xs" disabled={smsSending} style={{ background: 'var(--teal)', color: '#fff', flex: 1 }}>{smsSending ? 'Sending…' : 'Send'}</Button>
                      <Button type="button" size="xs" variant="outline" onClick={() => setSmsComposerOpen(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setSmsComposerOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> Quick send
                  </button>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Messages</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {smsMessages.filter(m => matches(m.contact_name, m.to_number, m.body)).map(m => (
                    <a key={m.id} href="/sms/reports" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.contact_name || m.to_number}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', textTransform: 'capitalize', flexShrink: 0 }}>{m.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</div>
                    </a>
                  ))}
                  {smsMessages.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No messages sent yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* EMAIL PANEL — real, /v1/emails?folder=inbox + /v1/emails/send */}
            {activePanel === 'email' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {emailComposerOpen ? (
                  <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <input autoFocus type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="To" style={composerInputStyle} />
                    <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject" style={composerInputStyle} />
                    <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Write your message…" rows={4} style={{ ...composerInputStyle, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" size="xs" disabled={emailSending} style={{ background: 'var(--teal)', color: '#fff', flex: 1 }}>{emailSending ? 'Sending…' : 'Send'}</Button>
                      <Button type="button" size="xs" variant="outline" onClick={() => setEmailComposerOpen(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setEmailComposerOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> Compose
                  </button>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Inbox</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inboxEmails.filter(m => matches(m.from?.name, m.subject, m.snippet)).map(m => (
                    <a key={m.id} href="/email" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: m.read ? 600 : 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.from?.name}</span>
                        {!m.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ea4335', flexShrink: 0, marginTop: 3 }} />}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: m.read ? 400 : 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.snippet}</div>
                    </a>
                  ))}
                  {inboxEmails.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No emails yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* CONTACTS PANEL — real, /v1/contacts */}
            {activePanel === 'contacts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {contactComposerOpen ? (
                  <form onSubmit={handleCreateContact} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <input autoFocus value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Name" style={composerInputStyle} />
                    <input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Phone (optional)" style={composerInputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" size="xs" disabled={contactSaving} style={{ background: 'var(--teal)', color: '#fff', flex: 1 }}>{contactSaving ? 'Saving…' : 'Add contact'}</Button>
                      <Button type="button" size="xs" variant="outline" onClick={() => setContactComposerOpen(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setContactComposerOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> Add contact
                  </button>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Contacts ({contacts.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contacts.filter(c => matches(c.first_name, c.last_name, c.email, c.company)).map(c => (
                    <a key={c.id} href="/contacts" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(37,99,235,0.12)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700 }}>
                        {c.first_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name || ''}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || c.company || ''}</div>
                      </div>
                    </a>
                  ))}
                  {contacts.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No contacts yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* CLEAROS PANEL — real, /v1/shipments */}
            {activePanel === 'clearos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <a href="/clearos/ops/new" style={composerToggleStyle}>
                  <Icon name="plus" size={14} /> New shipment
                </a>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Shipments</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shipments.filter(s => matches(s.bl_number, s.ref_number, s.goods_desc)).map(s => (
                    <a key={s.id} href={`/clearos/clearance/${s.id}`} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.bl_number || s.ref_number || 'Shipment'}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', textTransform: 'capitalize', flexShrink: 0 }}>{s.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.goods_desc || s.type || ''}</div>
                    </a>
                  ))}
                  {shipments.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No shipments yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* FINOPS PANEL — real, /v1/invoices */}
            {activePanel === 'finops' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {invoiceComposerOpen ? (
                  <form onSubmit={handleCreateInvoice} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <input autoFocus value={invoiceClientName} onChange={e => setInvoiceClientName(e.target.value)} placeholder="Client name" style={composerInputStyle} />
                    <input value={invoiceDesc} onChange={e => setInvoiceDesc(e.target.value)} placeholder="Description" style={composerInputStyle} />
                    <input type="number" min="1" step="any" value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} placeholder="Amount" style={composerInputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" size="xs" disabled={invoiceSaving} style={{ background: 'var(--teal)', color: '#fff', flex: 1 }}>{invoiceSaving ? 'Creating…' : 'Create invoice'}</Button>
                      <Button type="button" size="xs" variant="outline" onClick={() => setInvoiceComposerOpen(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setInvoiceComposerOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> Quick invoice
                  </button>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Invoices</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {invoices.filter(inv => matches(inv.invoice_number, inv.client_name)).map(inv => {
                    const total = (inv.items || []).reduce((sum, it) => sum + (Number(it.rate) || 0) * (Number(it.qty) || 1), 0);
                    return (
                      <a key={inv.id} href={`/finance/invoices?id=${inv.id}`} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.client_name || inv.invoice_number}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', textTransform: 'capitalize', flexShrink: 0 }}>{inv.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{total.toLocaleString()}</div>
                      </a>
                    );
                  })}
                  {invoices.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No invoices yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* PETTI PANEL — real, /v1/petti/wallets + quick manual deposit */}
            {activePanel === 'petti' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {depositComposerOpen ? (
                  <form onSubmit={handleQuickDeposit} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <select value={depositWalletId} onChange={e => setDepositWalletId(e.target.value)} style={{ ...composerInputStyle }}>
                      {pettiWallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                    </select>
                    <input type="number" min="1" step="any" autoFocus value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount" style={composerInputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" size="xs" disabled={depositSaving} style={{ background: 'var(--teal)', color: '#fff', flex: 1 }}>{depositSaving ? 'Depositing…' : 'Deposit'}</Button>
                      <Button type="button" size="xs" variant="outline" onClick={() => setDepositComposerOpen(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setDepositComposerOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> Quick deposit
                  </button>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Wallets</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pettiWallets.filter(w => matches(w.name)).map(w => (
                    <a key={w.id} href={`/petti/wallets/${w.id}`} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{w.balance.toLocaleString()} {w.currency}</span>
                    </a>
                  ))}
                  {pettiWallets.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No wallets yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* NEXUSHR PANEL — real, /v1/hr/staff + /v1/hr/invitations */}
            {activePanel === 'nexushr' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {inviteComposerOpen ? (
                  <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <input autoFocus type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email to invite" style={composerInputStyle} />
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={composerInputStyle}>
                      <option value="OFFICER">Officer</option>
                      <option value="MANAGER">Manager</option>
                      <option value="FINANCE">Finance</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" size="xs" disabled={inviteSaving} style={{ background: 'var(--teal)', color: '#fff', flex: 1 }}>{inviteSaving ? 'Sending…' : 'Send invite'}</Button>
                      <Button type="button" size="xs" variant="outline" onClick={() => setInviteComposerOpen(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setInviteComposerOpen(true)} style={composerToggleStyle}>
                    <Icon name="plus" size={14} /> Invite staff
                  </button>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Staff ({staffList.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {staffList.filter(s => matches(s.name, s.email, s.role)).map(s => (
                    <a key={s.id} href={`/nexushr/staff/${s.id}`} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(219,39,119,0.12)', color: '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700 }}>
                        {s.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.role}</div>
                      </div>
                      {!s.active && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', flexShrink: 0 }}>Inactive</span>}
                    </a>
                  ))}
                  {staffList.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No staff yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* SEAL PANEL — real, /v1/seal/consignments */}
            {activePanel === 'seal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <a href="/seal/consignments" style={composerToggleStyle}>
                  <Icon name="plus" size={14} /> New consignment
                </a>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Consignments</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {consignments.filter(c => matches(c.owner_name, c.transport_doc_number, c.goods_description)).map(c => (
                    <a key={c.id} href={`/seal/consignments/${c.id}`} style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.owner_name || c.transport_doc_number || 'Consignment'}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', textTransform: 'capitalize', flexShrink: 0 }}>{c.status?.replace(/_/g, ' ').toLowerCase()}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.goods_description || ''}</div>
                    </a>
                  ))}
                  {consignments.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No consignments yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* CARGOTRACKER PANEL — real, /v1/freight-booking/bookings (GET);
                create lives on its own page (CreateFreightBookingPage, needs
                a customer picker) so this links out rather than duplicating
                that form inline, same reasoning as ClearOS/SEAL above. */}
            {activePanel === 'cargotracker' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <a href="/cargotracker/bookings/new" style={composerToggleStyle}>
                  <Icon name="plus" size={14} /> New booking
                </a>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Bookings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {bookings.filter(b => matches(b.booking_number, b.customer_name, b.origin_port, b.destination_port)).map(b => (
                    <a key={b.id} href="/cargotracker/bookings" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.booking_number}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', flexShrink: 0 }}>{b.status?.replace(/_/g, ' ')}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.customer_name || ''} · {b.origin_port} → {b.destination_port}</div>
                    </a>
                  ))}
                  {bookings.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No bookings yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* CLOUD PANEL — real, /v1/drives + /v1/files */}
            {activePanel === 'cloud' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <a href="/cloud" style={composerToggleStyle}>
                  <Icon name="plus" size={14} /> Upload file
                </a>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Recent Files</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {driveFiles.filter(f => matches(f.name, f.owner_name)).map(f => (
                    <a key={f.id} href="/cloud" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <Icon name="fileText" size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{f.owner_name}</div>
                      </div>
                    </a>
                  ))}
                  {driveFiles.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No files yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* COMPLYOS PANEL — real, /v1/comply/obligations */}
            {activePanel === 'complyos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <a href="/complyos/obligations" style={composerToggleStyle}>
                  <Icon name="plus" size={14} /> New obligation
                </a>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Obligations</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {obligations.filter(o => matches(o.name, o.customer_name)).map(o => (
                    <a key={o.id} href="/complyos/obligations" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', textTransform: 'capitalize', flexShrink: 0 }}>{o.status}</span>
                      </div>
                      {o.due_date && <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Due {new Date(o.due_date).toLocaleDateString()}</div>}
                    </a>
                  ))}
                  {obligations.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>No obligations tracked yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* STORE PANEL — real, /v1/store/apps (browse-only — installing is a
                bigger, permissions-consent decision than a rail quick-action) */}
            {activePanel === 'store' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Marketplace</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {storeApps.filter(a => matches(a.name, a.category, a.shortDesc)).map(a => (
                    <a key={a.id} href="/store" style={{ padding: 10, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', flexShrink: 0 }}>★ {a.rating}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.shortDesc}</div>
                    </a>
                  ))}
                  {storeApps.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>Nothing in the marketplace yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* AI ASSISTANT PANEL — real, /v1/ai/chat (agentic chat, tenant memory + tools) */}
            {activePanel === 'ai' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                  {aiMessages.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '24px 0' }}>Ask anything about this workspace.</div>
                  )}
                  {aiMessages.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '8px 12px',
                        borderRadius: 10,
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        background: m.role === 'user' ? 'var(--teal)' : 'var(--card-bg)',
                        color: m.role === 'user' ? '#fff' : 'var(--ink)',
                        border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      {m.content}
                    </div>
                  ))}
                  {aiSending && (
                    <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--ink3)', padding: '8px 12px' }}>Thinking…</div>
                  )}
                  {aiError && (
                    <div style={{ fontSize: 12.5, color: '#dc2626', padding: '8px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)' }}>{aiError}</div>
                  )}
                </div>
                <form onSubmit={handleSendAiMessage} style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <input
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    placeholder="Ask the AI assistant…"
                    disabled={aiSending}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--ink)' }}
                  />
                  <Button type="submit" size="xs" disabled={aiSending || !aiInput.trim()} style={{ background: 'var(--teal)', color: '#fff' }}>Send</Button>
                </form>
              </div>
            )}


            {/* SETTINGS PANEL */}
            {activePanel === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        </>
        ); })()}
        </div>
      )}

      {/* ── 56px Vertical Rail ── */}
      <div className="gws-rail">
        {/* Continues the header's border-bottom line across this column —
            same 57px band as AppHeader and AppSidebar's .app-sb-brand. */}
        <div className="gws-rail-header" />

        {/* Collapse / expand toggle — floats on the left edge, mirroring
            AppSidebar's own .app-sb-toggle on the opposite side. */}
        <button
          type="button"
          className="gws-rail-toggle"
          onClick={toggleRightSidebar}
          title={collapsed ? "Show apps" : "Hide apps"}
        >
          <Icon name={collapsed ? "chevronLeft" : "chevronRight"} size={11} strokeWidth={2.5} />
        </button>

        {/* The pinned-app list — hidden while collapsed, but the rail itself
            (toggle, star, +, settings) always stays visible, never the whole
            component vanishing behind an unstyled floating pill. */}
        {!collapsed && (
          <div className="gws-rail-top">
            {/* Every pinned, entitled app — except whichever one is currently open */}
            {railApps.map(app => {
              const badge = badgeFor(app.id);
              const isActive = activePanel === app.id;
              return (
                <button
                  key={app.id}
                  className={`gws-rail-btn${isActive ? ' active' : ''}`}
                  onClick={() => togglePanel(app.id)}
                  title={app.label}
                  aria-pressed={isActive}
                >
                  <Icon name={app.icon} size={19} />
                  {badge && <span className={`gws-badge gws-badge-${badge.color}`}>{badge.count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Bottom Action Items */}
        <div className="gws-rail-bottom">
          {/* AI Assistant — a flat sparkle glyph on this app's own accent
              (var(--teal)), matching the icon already used for "AI" in the
              drawer header/AI Digest buttons rather than the launcher grid's
              separate multi-point glyph (LAUNCHER_SVG_ICONS.ai), which is
              shared platform-wide and not this button's to redraw. */}
          <button
            className={`gws-ai-btn${activePanel === 'ai' ? ' active' : ''}`}
            onClick={() => togglePanel('ai')}
            title="AI Assistant"
            aria-pressed={activePanel === 'ai'}
          >
            <div className="gws-ai-btn-tile">
              <Icon name="sparkle" size={19} color="#fff" />
            </div>
          </button>

          {/* Add / remove which apps show in this rail — same idea as Google's own "+" add-ons picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="gws-rail-btn" title="Add apps to this panel">
                <Icon name="plus" size={19} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="left">
              <DropdownMenuLabel>Show in side panel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableApps.map(app => (
                <DropdownMenuCheckboxItem
                  key={app.id}
                  checked={pinnedIds.includes(app.id)}
                  onCheckedChange={() => togglePinned(app.id)}
                >
                  <Icon name={app.icon} size={14} style={{ marginRight: 6 }} /> {app.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
