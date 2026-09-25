import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Spinner } from '../components/ui/spinner.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch, withRetry } from '../lib/api.js';
import { MobileNavContext } from '../shells/WorkspaceApp.js';
import { showAlert } from '../lib/alert.js';
import { addTodo } from '../data/calendarStore.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { Tip } from '../components/ui/tooltip.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { Button } from '../components/ui/button.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { CheckboxRow, SwitchRow } from '../components/ui/list-item-row.js';
import { RecipientChips, parseAddressList, formatAddressList, type RecipientChip } from '../components/RecipientChips.js';
import { MeetingTimeSuggestor } from '../components/MeetingTimeSuggestor.js';
import { DescribeMessageInput } from '../components/DescribeMessageInput.js';
import { SignatureManager, type EmailSignature } from '../components/SignatureManager.js';
import { IdentityManager, type EmailSendIdentity } from '../components/IdentityManager.js';
import { AdvancedEmailSearch, type AdvancedSearchQuery } from '../components/AdvancedEmailSearch.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../components/ui/hover-card.js';
import { FilterManager } from '../components/FilterManager.js';
import { DriveFilePicker, type DriveFile } from '../components/DriveFilePicker.js';
import { RichTextEditor } from '../components/RichTextEditor.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { useAuth } from '../hooks/useAuth.js';
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
  hidden?: boolean;
}

/** A per-user canned-reply/quick-response snippet (email_quick_templates) —
 *  distinct from the platform's own transactional email_templates (edited
 *  via EmailTemplates.tsx), which this compose window never reaches for. */
interface EmailQuickTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  body_html: string | null;
  is_html: boolean;
  category: string;
}

function escapeEmailHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function plainTextEmailHtml(value: string): string {
  return escapeEmailHtml(value).replace(/\r?\n/g, '<br>');
}

function templateContentHtml(template: EmailQuickTemplate): string {
  if (!template.is_html || !template.body_html) return plainTextEmailHtml(template.body);
  const parsed = new DOMParser().parseFromString(template.body_html, 'text/html');
  return parsed.body.innerHTML || template.body_html;
}

function appendEmailHtml(current: string, addition: string): string {
  return current.trim() ? `${current}<div><br></div>${addition}` : addition;
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
  /** True when this compose is a Forward — Gmail's signature defaults treat
   *  forward the same as reply (one "on reply/forward" default), even
   *  though forwarding otherwise reuses the plain Compose window/state. */
  isForward: boolean;
  /** Compose's "From" picker (email_send_identities) — null = whichever
   *  alias is marked default at send time, hidden entirely when the user
   *  has no additional aliases configured. */
  fromIdentityId: string | null;
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
  sendProtocol: 'platform' | 'smtp' | 'outlook' | 'gmail';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpEncryption: 'ssl' | 'tls' | 'none';
  fromName: string;
  fromEmail: string;
  outlookStatus: string | null;
  gmailStatus: string | null;
  vacationEnabled: boolean;
  vacationStart: string | null;
  vacationEnd: string | null;
  vacationSubject: string;
  vacationMessage: string;
  vacationContactsOnly: boolean;
  vacationDomainOnly: boolean;
  forwardToEmail: string | null;
  forwardKeepCopy: boolean;
  inboxSort: 'default' | 'unread_first' | 'starred_first';
  autoAdvance: 'list' | 'newer' | 'older';
}

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

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

// ─── Contact Hover Card ──────────────────────────────────────────────────────────

interface ContactHoverCardBodyProps {
  addr: EmailAddress;
  savedEmails: Set<string>;
  savingEmail: string | null;
  onCompose: (addr: EmailAddress) => void;
  onSave: (email: string, name: string) => void;
  onNavigate: (path: string) => void;
}

const ContactHoverCardBody: React.FC<ContactHoverCardBodyProps> = ({ addr, savedEmails, savingEmail, onCompose, onSave, onNavigate }) => {
  const isSaved = savedEmails.has(addr.email);
  const isSaving = savingEmail === addr.email;
  return (
    <div className="em-contact-card-inner">
      <div className="em-contact-card-top">
        <PersonAvatar userId={addr.userId} name={addr.name} size={48} />
        <div className="em-contact-card-info">
          <div className="em-contact-card-name">{addr.name || addr.email}</div>
          <div className="em-contact-card-email">{addr.email}</div>
        </div>
        {!addr.userId && (
          <Tip label={isSaved ? 'Saved to contacts' : 'Add to contacts'}>
            <button
              type="button"
              className={`em-contact-card-add-btn${isSaved ? ' em-contact-card-add-btn--saved' : ''}`}
              onClick={() => { if (!isSaved && !isSaving) onSave(addr.email, addr.name); }}
              disabled={isSaving}
            >
              <Icon name={isSaved ? 'check' : 'userPlus'} size={14} />
            </button>
          </Tip>
        )}
      </div>
      <div className="em-contact-card-actions">
        <Tip label="Compose email">
          <button type="button" className="em-contact-card-action-icon" onClick={() => onCompose(addr)}>
            <Icon name="mail" size={15} />
          </button>
        </Tip>
        {addr.userId && (
          <>
            <Tip label="Start chat">
              <button type="button" className="em-contact-card-action-icon" onClick={() => onNavigate(`/bliss?chat=${addr.userId}`)}>
                <Icon name="message" size={15} />
              </button>
            </Tip>
            <Tip label="Video call">
              <button type="button" className="em-contact-card-action-icon" onClick={() => onNavigate(`/bliss/calls?call=${addr.userId}&kind=VIDEO`)}>
                <Icon name="video" size={15} />
              </button>
            </Tip>
          </>
        )}
        <Tip label="Open calendar">
          <button type="button" className="em-contact-card-action-icon" onClick={() => onNavigate('/calendar')}>
            <Icon name="calendar" size={15} />
          </button>
        </Tip>
      </div>
    </div>
  );
};

// ─── Template Picker Panel ───────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES_ORDER = ['Transactional & Billing', 'Support & Service', 'Account & Staff', 'General'] as const;

interface TemplatePickerPanelProps {
  templates: EmailQuickTemplate[];
  target: 'compose' | 'reply';
  search: string;
  setSearch: (v: string) => void;
  openGroups: Set<string>;
  setOpenGroups: (fn: (prev: Set<string>) => Set<string>) => void;
  onApply: (t: EmailQuickTemplate) => void;
  onClose: () => void;
  onManage: () => void;
}

const TemplatePickerPanel: React.FC<TemplatePickerPanelProps> = ({ templates, search, setSearch, openGroups, setOpenGroups, onApply, onManage }) => {
  const filtered = search.trim()
    ? templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()))
    : templates;

  const grouped = TEMPLATE_CATEGORIES_ORDER.reduce<Record<string, EmailQuickTemplate[]>>((acc, cat) => {
    acc[cat] = filtered.filter(t => (t.category || 'General') === cat);
    return acc;
  }, {} as Record<string, EmailQuickTemplate[]>);
  // Any unlisted category falls into General
  filtered.forEach(t => {
    const cat = t.category || 'General';
    if (!TEMPLATE_CATEGORIES_ORDER.includes(cat as any) && !grouped['General'].includes(t)) {
      grouped['General'].push(t);
    }
  });

  const customised = templates.filter(t => t.is_html).length;

  const toggleGroup = (cat: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });

  return (
    <div className="em-tpl-panel">
      <div className="em-tpl-search-row">
        <Icon name="search" size={14} color="var(--ink3)" />
        <input
          className="em-tpl-search"
          placeholder="Search templates"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        {search && <button type="button" className="em-tpl-search-clear" onClick={() => setSearch('')}><Icon name="x" size={12} /></button>}
      </div>
      <div className="em-tpl-stats">
        <span className="em-tpl-stats-total">{templates.length} {templates.length === 1 ? 'template' : 'templates'}</span>
        {customised > 0 && <span className="em-tpl-stats-custom">{customised} customized</span>}
        <button type="button" className="em-tpl-manage-link" onClick={onManage}>Manage</button>
      </div>
      <div className="em-tpl-groups">
        {TEMPLATE_CATEGORIES_ORDER.map(cat => {
          const items = grouped[cat] ?? [];
          if (items.length === 0) return null;
          const open = openGroups.has(cat);
          return (
            <div key={cat} className="em-tpl-group">
              <button type="button" className="em-tpl-group-header" onClick={() => toggleGroup(cat)}>
                <span className="em-tpl-group-name">{cat}</span>
                <span className="em-tpl-group-count">{items.length}</span>
                <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} color="var(--ink3)" />
              </button>
              {open && (
                <div className="em-tpl-group-items">
                  {items.map(t => (
                    <button key={t.id} type="button" className="em-tpl-item" onClick={() => onApply(t)}>
                      <span className="em-tpl-item-name">{t.name}</span>
                      {t.is_html && <span className="em-tpl-item-badge">HTML</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="em-tpl-empty">No templates match "{search}"</div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────────

export const EmailApp: React.FC = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { setMobileOpen } = useContext(MobileNavContext);
  const { user } = useAuth();

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
  /** Total messages matching the current folder+search on the server —
   *  drives the pagination footer now that GET /v1/emails only returns one
   *  page at a time. */
  const [emailsTotal, setEmailsTotal] = useState(0);
  const [activeFolder, setActiveFolder] = useState<Folder>(folderFromPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterByLabel, setFilterByLabel] = useState<Label | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState('');

  // Folder/label counts live in EmailShell. Any optimistic mailbox change
  // schedules a server recount; the shell also polls as a recovery path for
  // new mail arriving in another process or browser tab.
  useEffect(() => {
    if (emailsLoading) return;
    window.dispatchEvent(new CustomEvent('hudumika:email-counts-changed'));
  }, [emails, emailsLoading]);

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

  // Arriving from EmailShell's "Labels" sidebar section (/email?label=Name)
  // — lands on Inbox pre-filtered to that label, via the same within-folder
  // filterByLabel mechanism the in-list Label dropdown above also drives.
  // Runs after the folder-reset effect above (which clears filterByLabel),
  // since a label link's pathname change fires that effect in the same commit.
  useEffect(() => {
    const label = new URLSearchParams(location.search).get('label');
    if (label) setFilterByLabel(label);
    const q = new URLSearchParams(location.search).get('q');
    setSearch(q ?? '');
  }, [location.search]);

  // Landing back from mail-oauth.routes.ts's authorize-personal/callback
  // round trip (connectPersonalMail below) — a one-time toast, then the
  // query params are stripped so a refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauth = params.get('oauth');
    if (!oauth) return;
    const provider = params.get('provider') === 'outlook' ? 'Microsoft' : 'Google';
    if (oauth === 'success') showAlert(`${provider} connected — you can now send from it in Email Settings.`, { variant: 'success' });
    else showAlert(params.get('msg') || `Could not connect to ${provider}.`);
    params.delete('oauth'); params.delete('provider'); params.delete('msg');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Reply composer
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  // Recipients are only ever populated by openReply() below (Reply vs Reply
  // All) — never defaulted in selectEmail(), since most opens are read-only
  // and never touch the reply box at all.
  const [replyTo, setReplyTo] = useState<RecipientChip[]>([]);
  const [replyCc, setReplyCc] = useState<RecipientChip[]>([]);
  const [replyBcc, setReplyBcc] = useState<RecipientChip[]>([]);
  // Feature parity with Compose: read receipt, schedule send, and
  // save-as-draft all exist there and were missing here for no real
  // reason — a reply is still a message someone might want to defer or
  // request a receipt on.
  const [replyRequestReadReceipt, setReplyRequestReadReceipt] = useState(false);
  const [replySendAt, setReplySendAt] = useState<string | null>(null);
  const [replyDraftId, setReplyDraftId] = useState<string | null>(null);
  const [replySaving, setReplySaving] = useState(false);
  const replyDraftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compose modal
  const [composeOpen, setComposeOpen] = useState(false);
  // Gmail-style compose chrome: minimized collapses to just the header
  // strip, full-screen expands to cover the viewport instead of the docked
  // corner popup — the popup itself (position/size) is unchanged from
  // before, these are two additional states layered on top of it.
  const [composeFullScreen, setComposeFullScreen] = useState(false);
  // Reply can pop out of the inline thread panel into its own floating
  // window — same chrome/behavior as Compose (minimize/full-screen/close),
  // reused rather than duplicated. Docked (false) is the default, matching
  // every reply before this feature existed.
  const [compose, setCompose] = useState<ComposeData>({
    to: '', cc: '', bcc: '', subject: '', body: '',
    requestReadReceipt: false, attachments: [], draftId: null, replyToId: null, sendAt: null, isForward: false, fromIdentityId: null,
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
  // Drive integration: which composer the "Attach from Drive" picker feeds, and
  // the writable drives offered by "Save to Drive" on a received attachment.
  const [drivePickerTarget, setDrivePickerTarget] = useState<'compose' | 'reply' | null>(null);
  const [drivePickerBusy, setDrivePickerBusy] = useState(false);
  const [writableDrives, setWritableDrives] = useState<{ id: string; name: string }[] | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const composeFileInputRef = useRef<HTMLInputElement>(null);

  // Email account settings (IMAP mailbox connection, signature, spam list)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EmailAccountSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [blocklistInput, setBlocklistInput] = useState('');
  // Which Settings tab is active — mirrors Gmail's own General / Labels /
  // Inbox / Accounts / Filters and blocked addresses / Forwarding and
  // POP-IMAP / Advanced strip. Settings outgrew a single-column dialog once
  // multi-signature/multi-identity/filters landed, so it's now size="full"
  // with real tabs instead of stacked sections in one scroll.
  const [settingsTab, setSettingsTab] = useState<'general' | 'labels' | 'inbox' | 'accounts' | 'filters' | 'forwarding' | 'advanced'>('general');
  // Fetched eagerly (not just when the Settings dialog opens) so a brand new
  // Compose/Reply can show the signature it's about to send with — the
  // dialog's own fetch still runs when opened, to guarantee freshness after
  // an edit.
  useEffect(() => { apiFetch('/v1/email/account').then(setSettings).catch(() => {}); }, []);
  // Multiple named, rich signatures (email_signatures) — fetched eagerly for
  // the same reason `settings` is: Compose/Reply need to resolve the right
  // default the moment they open, not only after Settings has been opened
  // once. SignatureManager's onChange keeps this in sync after any edit.
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  useEffect(() => { apiFetch('/v1/email/signatures').then(setSignatures).catch(() => {}); }, []);
  // "Send mail as" aliases (email_send_identities) — same eager-fetch
  // reasoning: Compose's From picker needs the list the moment it opens.
  const [identities, setIdentities] = useState<EmailSendIdentity[]>([]);
  useEffect(() => { apiFetch('/v1/email/identities').then(setIdentities).catch(() => {}); }, []);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // User-defined labels (email_labels) — replaces the old hardcoded set.
  const [labelDefs, setLabelDefs] = useState<EmailLabel[]>([]);
  const [newLabelName, setNewLabelName] = useState('');

  // Per-user quick-reply/canned-response templates (email_quick_templates).
  const [quickTemplates, setQuickTemplates] = useState<EmailQuickTemplate[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['General', 'Transactional & Billing', 'Support & Service', 'Account & Staff']));
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

  // Listen for compose trigger from sidebar button. Kept current via a ref
  // (not a raw closure) since openCompose is a new function every render —
  // a plain `() => openCompose()` captured only the mount-time version,
  // whose `settings` closure was still null (the eager fetch hadn't
  // resolved yet), so a sidebar-triggered compose could open without a
  // signature depending on exactly when it was clicked.
  const openComposeRef = useRef(openCompose);
  openComposeRef.current = openCompose;
  useEffect(() => {
    const handler = () => openComposeRef.current();
    window.addEventListener('hudumika:email-compose', handler);
    return () => window.removeEventListener('hudumika:email-compose', handler);
  }, []);

  // The right-sidebar's own "Compose" button isn't always on this page —
  // it links to /email?compose=1 so clicking it from another app lands
  // here and opens the real compose window, rather than duplicating a
  // second, thinner composer inline in that sidebar (see
  // GoogleWorkspaceRightSidebar.tsx's own note on why that was removed).
  useEffect(() => {
    const incoming = new URLSearchParams(location.search);
    if (incoming.get('compose') !== '1') return;
    const to = incoming.get('to') || '';
    const name = incoming.get('name') || '';
    openComposeRef.current(to ? { to: name ? `${name} <${to}>` : to } : undefined);
    const params = new URLSearchParams(location.search);
    params.delete('compose');
    params.delete('to');
    params.delete('name');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

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

  // AI overview — auto-triggers on email open, shows bullet points at top of detail
  const [aiOverviewBullets, setAiOverviewBullets] = useState<string[] | null>(null);
  const [aiOverviewLoading, setAiOverviewLoading] = useState(false);
  const [aiOverviewOpen, setAiOverviewOpen] = useState(true);
  const aiOverviewCache = useRef<Record<string, string[]>>({});

  // Contacts saved inline from hover cards this session
  const [savedContactEmails, setSavedContactEmails] = useState<Set<string>>(new Set());
  const [savingContactEmail, setSavingContactEmail] = useState<string | null>(null);

  // AI summary (manual, button-triggered)
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

  // Search debounced 250ms — GET /v1/emails now runs a real Postgres
  // full-text query (migration 461's search_vector/GIN index), not the old
  // in-memory substring filter, so this is a real network request per
  // change rather than a free client-side re-filter.
  const [searchDebounced, setSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  // Advanced Search's structured form (From/To/Subject/Has the words/
  // Doesn't have/Size/Date within/Scope/Has attachment) — independent of,
  // and combinable with, the plain search box above.
  const [advancedSearch, setAdvancedSearch] = useState<AdvancedSearchQuery | null>(null);
  const [searchBoundary, setSearchBoundary] = useState<HTMLDivElement | null>(null);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSearchError, setAiSearchError] = useState('');
  const [searchError, setSearchError] = useState('');
  const emailRequestRef = useRef<{ controller: AbortController; sequence: number } | null>(null);
  const emailRequestSequence = useRef(0);
  // A query is a new result set. Keeping the previous folder page offset can
  // otherwise request rows beyond the matches and make a working query look empty.
  useEffect(() => { setPage(0); }, [searchDebounced, advancedSearch]);
  // "Create filter" from the Advanced Search popover — opens Settings on
  // the Filters tab, pre-filled with exactly what was just searched.
  const [pendingFilterCriteria, setPendingFilterCriteria] = useState<AdvancedSearchQuery | null>(null);
  function createFilterFromSearch(q: AdvancedSearchQuery) {
    setPendingFilterCriteria(q);
    setSettingsTab('filters');
    setSettingsOpen(true);
  }

  async function runAiSearch() {
    const query = search.trim();
    if (!query || aiSearchLoading) return;
    setAiSearchLoading(true);
    setAiSearchError('');
    try {
      const response = await withRetry(() => apiFetch('/v1/ai/search', {
        method: 'POST',
        body: JSON.stringify({ query, context: 'emails' }),
      }));
      const f = response?.filters ?? {};
      const structured: AdvancedSearchQuery = {
        from: typeof f.from === 'string' ? f.from : undefined,
        to: typeof f.to === 'string' ? f.to : undefined,
        subject: typeof f.subject === 'string' ? f.subject : undefined,
        hasWords: typeof f.hasWords === 'string' ? f.hasWords : undefined,
        doesntHave: typeof f.doesntHave === 'string' ? f.doesntHave : undefined,
        hasAttachment: f.hasAttachment === true || undefined,
        dateWithin: typeof f.dateWithin === 'string' ? f.dateWithin : undefined,
        scope: typeof f.scope === 'string' ? f.scope : undefined,
      };
      setAdvancedSearch(Object.values(structured).some(v => v !== undefined && v !== '') ? structured : null);
      setFilter(f.unread === true ? 'unread' : 'all');
      setSearch(typeof f.search === 'string' ? f.search : '');
    } catch (err: any) {
      // Keep ordinary server-side search active and surface AI availability
      // beside the field; a modal makes a transient AI outage block email.
      setAiSearchError(err.message === 'Failed to fetch'
        ? 'AI could not reach the server. Standard search is still active.'
        : (err.message || 'AI search is unavailable.'));
    } finally {
      setAiSearchLoading(false);
    }
  }

  const loadEmails = useCallback(async () => {
    emailRequestRef.current?.controller.abort();
    const controller = new AbortController();
    const sequence = ++emailRequestSequence.current;
    emailRequestRef.current = { controller, sequence };
    setEmailsLoading(true);
    setSearchError('');
    try {
      const qs = new URLSearchParams({ folder: activeFolder, limit: String(pageSize), offset: String(page * pageSize) });
      if (searchDebounced) qs.set('search', searchDebounced);
      if (filterByLabel) qs.set('label', filterByLabel);
      if (advancedSearch) {
        if (advancedSearch.from) qs.set('advFrom', advancedSearch.from);
        if (advancedSearch.to) qs.set('advTo', advancedSearch.to);
        if (advancedSearch.subject) qs.set('advSubject', advancedSearch.subject);
        if (advancedSearch.hasWords) qs.set('advHasWords', advancedSearch.hasWords);
        if (advancedSearch.doesntHave) qs.set('advDoesntHave', advancedSearch.doesntHave);
        if (advancedSearch.hasAttachment) qs.set('advHasAttachment', '1');
        if (advancedSearch.sizeCmp) qs.set('advSizeCmp', advancedSearch.sizeCmp);
        if (advancedSearch.sizeMb != null) qs.set('advSizeMb', String(advancedSearch.sizeMb));
        if (advancedSearch.dateWithin) qs.set('advDateWithin', advancedSearch.dateWithin);
        if (advancedSearch.dateAfter) qs.set('advDateAfter', advancedSearch.dateAfter);
        if (advancedSearch.dateBefore) qs.set('advDateBefore', advancedSearch.dateBefore);
        if (advancedSearch.scope) qs.set('advScope', advancedSearch.scope);
      }
      const res = await apiFetch(`/v1/emails?${qs.toString()}`, { signal: controller.signal });
      if (sequence !== emailRequestSequence.current) return;
      // Real server pagination — this used to return the whole matched
      // folder as a bare array and get sliced into pages of 15 client-side,
      // which degrades badly for a real mailbox. `total` drives the
      // pagination footer; unread/starred/label filters below still apply
      // only within whatever page is currently loaded (a fetched page can
      // come back with fewer matching rows than PAGE_SIZE once filtered —
      // an accepted tradeoff, not a bug, since the fix this addresses is
      // fetch cost, not filter/pagination composition).
      const data = res?.items;
      setEmailsTotal(Number(res?.total ?? 0));
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
      if (err?.name === 'AbortError') return;
      // Search-as-you-type must never interrupt the mailbox with a modal.
      // Keep the previous results visible and place the recoverable error by
      // the field that initiated the request.
      if (searchDebounced || advancedSearch) {
        setSearchError(err?.message === 'Failed to fetch'
          ? 'Search could not reach the server. Check your connection and try again.'
          : (err?.message || 'Search is temporarily unavailable.'));
      } else {
        showAlert(err?.message || 'Failed to load emails');
      }
    } finally {
      if (sequence === emailRequestSequence.current) setEmailsLoading(false);
    }
  }, [activeFolder, searchDebounced, page, pageSize, advancedSearch, filterByLabel]);

  useEffect(() => { loadEmails(); }, [loadEmails]);
  useEffect(() => () => emailRequestRef.current?.controller.abort(), []);
  useEffect(() => {
    const id = setInterval(loadEmails, 30000);
    return () => clearInterval(id);
  }, [loadEmails]);

  // ── Derived list ──────────────────────────────────────────────────────────────

  const selectedEmail = emails.find(e => e.id === selectedId) ?? null;

  // Nested/stacked conversation view — auto-loads the rest of the thread
  // the moment a multi-message email opens (Gmail shows every message in a
  // conversation without a separate click), rather than the old manual
  // "View entire conversation" toggle. Keyed on selectedId, not the
  // selectedEmail object (a new reference every fetch), so this only
  // re-runs when the user actually navigates to a different message.
  useEffect(() => {
    if (selectedEmail?.threadId && (selectedEmail.threadCount ?? 1) > 1) {
      openThreadView(selectedEmail.threadId);
    } else {
      setThreadMessages(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  // Auto-trigger AI Overview on every email open (body >= 100 chars).
  // Uses mode:'overview' which asks for dashed bullet points.
  // Cached by email ID so re-opening skips the round-trip; silent on failure.
  useEffect(() => {
    if (!selectedEmail || selectedEmail.body.trim().length < 100) {
      setAiOverviewBullets(null);
      setAiOverviewOpen(true);
      return;
    }
    const cached = aiOverviewCache.current[selectedEmail.id];
    if (cached) { setAiOverviewBullets(cached.length ? cached : null); return; }

    setAiOverviewBullets(null);
    setAiOverviewOpen(true);
    setAiOverviewLoading(true);
    apiFetch('/v1/ai/summarise', {
      method: 'POST',
      body: JSON.stringify({ text: selectedEmail.body, mode: 'overview' }),
    }).then(res => {
      const raw: string = (res?.summary || '').trim();
      const bullets = raw.split('\n')
        .map((l: string) => l.replace(/^[-•*]\s*/, '').trim())
        .filter((l: string) => l.length > 0);
      aiOverviewCache.current[selectedEmail.id] = bullets;
      setAiOverviewBullets(bullets.length ? bullets : null);
    }).catch(() => {
      aiOverviewCache.current[selectedEmail.id] = [];
      setAiOverviewBullets(null);
    }).finally(() => setAiOverviewLoading(false));
  }, [selectedEmail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveContactFromEmail(email: string, name: string) {
    setSavingContactEmail(email);
    try {
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || email.split('@')[0];
      const lastName = parts.slice(1).join(' ');
      await apiFetch('/v1/contacts', {
        method: 'POST',
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email }),
      });
      setSavedContactEmails(prev => new Set([...prev, email]));
    } catch { /* silently skip — user can save via full Contacts UI */ }
    finally { setSavingContactEmail(null); }
  }

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

  // `allVisible` is now already just the current server page, filtered
  // client-side for unread/starred/label — pagination itself (page count,
  // "N–M of total") is driven by the server's own `emailsTotal`, not this
  // page's post-filter length.
  const totalPages = Math.max(1, Math.ceil(emailsTotal / pageSize));
  const pageEmails = allVisible;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  /** A Drafts-folder row reopens into Compose (there's nothing useful to
   *  "read" about your own unsent draft); every other folder opens the
   *  normal read-only detail view. */
  function rowClick(email: Email) {
    if (email.folder === 'drafts') { openDraft(email); return; }
    selectEmail(email.id);
  }

  /** Appends the signature exactly once, at send time — the one place a
   *  message's final body is actually assembled, so every send path
   *  (compose, reply, forward-via-compose) gets it in the same place
   *  (last) regardless of what was typed or inserted before it. */
  /** Resolves the right signature for the context (new-message vs
   *  reply/forward — see ComposeData.isForward) and appends its rich HTML
   *  once, at actual send time. The plain-text compose/reply body and the
   *  signature's HTML are simply concatenated — this app's message body has
   *  always been plain text end to end (search, snippets, quoting), so a
   *  rich signature renders correctly in the real outbound email (which
   *  wraps the whole body in one HTML shell at send time) at the cost of
   *  the signature's tags showing literally if this stored copy is ever
   *  re-displayed as plain text — the same trade a Sent-folder view of any
   *  HTML-signed message already makes elsewhere. */
  function defaultSignature(context: 'new' | 'reply'): EmailSignature | null {
    return signatures.find(s => context === 'new' ? s.is_default_new : s.is_default_reply) ?? null;
  }
  function signedBody(content: string, context: 'new' | 'reply'): string {
    const sig = defaultSignature(context);
    if (sig?.body_html?.trim()) return `${content}${content.trim() ? '\n\n' : ''}--\n${sig.body_html}`;
    return content;
  }

  /** Reply always addresses the sender; Reply All adds every other original
   *  To/Cc recipient (minus the current user, who doesn't need to CC
   *  themselves on their own reply) — standard mail-client semantics. */
  function openReply(mode: 'reply' | 'replyAll') {
    if (!selectedEmail) return;
    const selfEmail = user?.email?.toLowerCase();
    const toChips: RecipientChip[] = [{ email: selectedEmail.from.email, name: selectedEmail.from.name || undefined }];
    let ccChips: RecipientChip[] = [];
    if (mode === 'replyAll') {
      const seen = new Set([selectedEmail.from.email.toLowerCase()]);
      for (const a of selectedEmail.to) {
        const key = a.email.toLowerCase();
        if (key === selfEmail || seen.has(key)) continue;
        seen.add(key);
        toChips.push({ email: a.email, name: a.name || undefined });
      }
      for (const a of selectedEmail.cc ?? []) {
        const key = a.email.toLowerCase();
        if (key === selfEmail || seen.has(key)) continue;
        seen.add(key);
        ccChips.push({ email: a.email, name: a.name || undefined });
      }
    }
    setReplyTo(toChips);
    setReplyCc(ccChips);
    setReplyBcc([]);
    setReplyBody('');
    setReplyRequestReadReceipt(false);
    setReplySendAt(null);
    setReplyDraftId(null);
    setReplyOpen(true);
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

  /** Apply/remove one label on a single message — the "Labels" dropdown in
   *  the detail toolbar. */
  function toggleMessageLabel(id: string, labelName: string) {
    const em = emails.find(e => e.id === id);
    if (!em) return;
    const has = em.labels.includes(labelName);
    const nextLabels = has ? em.labels.filter(l => l !== labelName) : [...em.labels, labelName];
    setEmails(prev => prev.map(e => e.id === id ? { ...e, labels: nextLabels } : e));
    apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ labels: nextLabels }) })
      .catch(() => { setEmails(prev => prev.map(e => e.id === id ? { ...e, labels: em.labels } : e)); showAlert('Failed to update label'); });
  }

  /** Bulk-apply one label to every selected message. */
  function bulkLabelAction(labelName: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setEmails(prev => prev.map(e => selected.has(e.id) && !e.labels.includes(labelName) ? { ...e, labels: [...e.labels, labelName] } : e));
    setSelected(new Set());
    apiFetch('/v1/emails/bulk', { method: 'POST', body: JSON.stringify({ ids, action: 'label', label: labelName }) })
      .catch(() => { showAlert('Some messages failed to update'); loadEmails(); });
  }

  /** Dev-only affordance for a brand-new, empty mailbox — used to happen
   *  automatically on every GET / against an empty inbox, which meant an
   *  empty production mailbox got real (fake) correspondence written into
   *  it. Now it's this one explicit, non-production action instead. */
  const [seedingDemo, setSeedingDemo] = useState(false);
  function loadSampleMessages() {
    setSeedingDemo(true);
    apiFetch('/v1/emails/seed-demo', { method: 'POST' })
      .then(() => loadEmails())
      .catch((err: any) => showAlert(err?.message || 'Could not load sample messages.'))
      .finally(() => setSeedingDemo(false));
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
  /** After archiving/trashing the open message, what to show next — Settings
   *  ▸ Advanced ▸ Auto-advance. 'list' (default) matches every prior
   *  behavior here (always deselect back to the list); 'newer'/'older' step
   *  to the adjacent row in the currently displayed (newest-first) list
   *  instead, falling back to the list when there's no such neighbor. */
  function advanceSelectionAfterRemoving(id: string) {
    const mode = settings?.autoAdvance ?? 'list';
    if (mode === 'list') { setSelectedId(null); return; }
    const idx = emails.findIndex(e => e.id === id);
    const neighbor = mode === 'newer' ? emails[idx - 1] : emails[idx + 1];
    setSelectedId(neighbor && neighbor.id !== id ? neighbor.id : null);
  }

  function moveToFolder(id: string, folder: Folder) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, folder } : e));
    advanceSelectionAfterRemoving(id);
    apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ folder }) }).catch(() => showAlert('Failed to move message'));
  }

  function composeToAddress(addr: EmailAddress) {
    setCompose(p => ({ ...p, open: true, to: addr.email, subject: '', body: '', sendAt: null }));
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

  async function rescheduleScheduled(id: string, isoString: string) {
    const newAt = new Date(isoString);
    if (isNaN(newAt.getTime()) || newAt <= new Date()) {
      showAlert('Please pick a time in the future.');
      return;
    }
    setEmails(prev => prev.map(e => e.id === id ? { ...e, scheduledAt: newAt } : e));
    setRescheduleOpen(false);
    try {
      await apiFetch(`/v1/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ scheduledAt: newAt.toISOString() }) });
    } catch {
      showAlert('Failed to reschedule — the email may have already been sent.');
      loadEmails();
    }
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

  async function attachFromDrive(file: DriveFile) {
    const target = drivePickerTarget;
    if (!target) return;
    setDrivePickerBusy(true);
    try {
      const res = await apiFetch('/v1/emails/attachments/from-drive', { method: 'POST', body: JSON.stringify({ fileId: file.id }) });
      const pending = { uploading: false, localId: crypto.randomUUID(), storageKey: res.storageKey, filename: res.filename, size: res.size } as PendingAttachment;
      if (target === 'compose') setCompose(prev => ({ ...prev, attachments: [...prev.attachments, pending] }));
      else setReplyAttachments(prev => [...prev, pending]);
      setDrivePickerTarget(null);
    } catch (err: any) {
      showAlert(err.message || 'Could not attach that file.');
    } finally {
      setDrivePickerBusy(false);
    }
  }

  async function loadWritableDrives() {
    if (writableDrives) return;
    try {
      const drives = await apiFetch('/v1/drives');
      setWritableDrives((Array.isArray(drives) ? drives : []).filter((d: any) => d.can_write !== false).map((d: any) => ({ id: d.id, name: d.name })));
    } catch { setWritableDrives([]); }
  }

  async function saveAttachmentToDrive(messageId: string, storageKey: string, driveId?: string) {
    try {
      const res = await apiFetch(`/v1/emails/${messageId}/attachment/save-to-drive`, {
        method: 'POST', body: JSON.stringify({ key: storageKey, ...(driveId ? { driveId } : {}) }),
      });
      showAlert(`Saved "${res.filename}" to Drive.`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Could not save to Drive.');
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

  /** Reply's own save-as-draft — same POST-then-PATCH-the-same-row pattern
   *  as saveDraft above, just addressed with the reply's own recipient/
   *  subject/body state instead of ComposeData (Reply was never folded
   *  into the compose modal's own state, it's a separate always-open-
   *  inline surface — see the reply state's own declarations). */
  async function saveReplyDraft(silent = false) {
    if (!selectedEmail) return;
    if (replyTo.length === 0 && !replyBody.trim()) return;
    if (!silent) setReplySaving(true);
    const attachments = replyAttachments.filter(a => a.storageKey).map(a => ({ storageKey: a.storageKey!, filename: a.filename!, size: a.size }));
    const payload = {
      to: formatAddressList(replyTo), cc: formatAddressList(replyCc), bcc: formatAddressList(replyBcc),
      subject: replySubject || `Re: ${selectedEmail.subject}`, body: replyBody, attachments,
    };
    try {
      if (replyDraftId) {
        await apiFetch(`/v1/emails/${replyDraftId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        const res = await apiFetch('/v1/emails/drafts', { method: 'POST', body: JSON.stringify(payload) });
        setReplyDraftId(res.id);
      }
      if (activeFolder === 'drafts') loadEmails();
    } catch {
      if (!silent) showAlert('Failed to save draft');
    } finally {
      if (!silent) setReplySaving(false);
    }
  }

  useEffect(() => {
    if (!replyOpen) return;
    if (replyDraftTimer.current) clearTimeout(replyDraftTimer.current);
    replyDraftTimer.current = setTimeout(() => { saveReplyDraft(true); }, 2000);
    return () => { if (replyDraftTimer.current) clearTimeout(replyDraftTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTo, replyCc, replyBcc, replySubject, replyBody, replyOpen]);

  /** Mirrors discardCompose — deletes the autosaved draft row rather than
   *  leaving an abandoned reply sitting in Drafts with no way to tell it
   *  apart from one still in progress. */
  function discardReply() {
    if (replyDraftTimer.current) clearTimeout(replyDraftTimer.current);
    const draftId = replyDraftId;
    setReplyOpen(false);
    setReplyAttachments([]);
    if (draftId) {
      apiFetch(`/v1/emails/${draftId}`, { method: 'DELETE' })
        .then(() => { if (activeFolder === 'drafts') loadEmails(); })
        .catch(() => {});
    }
  }

  /** Opens an existing Drafts-folder row back into the compose modal,
   *  continuing the same draft row rather than starting a new one. */
  function openDraft(email: Email) {
    setCompose({
      to: email.to.map(t => t.email).join(', '),
      cc: (email.cc ?? []).map(c => c.email).join(', '),
      bcc: (email.bcc ?? []).map(c => c.email).join(', '),
      subject: email.subject,
      body: email.body,
      requestReadReceipt: false,
      attachments: email.attachments.map(a => ({
        localId: crypto.randomUUID(), uploading: false, storageKey: a.storageKey, filename: a.filename, size: a.size ?? undefined,
      })),
      draftId: email.id,
      replyToId: null,
      sendAt: null,
      isForward: email.subject.toLowerCase().startsWith('fwd:'),
      fromIdentityId: null,
    });
    setComposeFullScreen(false);
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
    if (!selectedEmail) return;
    if (replyTo.length === 0) return showAlert('Add at least one recipient before sending.');
    if (!replyBody.trim()) return showAlert('Write a reply before sending.');
    if (replyAttachments.some(a => a.uploading)) return showAlert('Wait for attachments to finish uploading before sending.');
    try {
      if (replyDraftTimer.current) clearTimeout(replyDraftTimer.current);
      const attachments = replyAttachments.filter(a => a.storageKey).map(a => ({ storageKey: a.storageKey!, filename: a.filename!, size: a.size }));
      const res = await apiFetch('/v1/email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: formatAddressList(replyTo),
          cc: replyCc.length > 0 ? formatAddressList(replyCc) : undefined,
          bcc: replyBcc.length > 0 ? formatAddressList(replyBcc) : undefined,
          subject: replySubject || `Re: ${selectedEmail.subject}`,
          body: signedBody(replyBody, 'reply'),
          inReplyTo: selectedEmail.id,
          draftId: replyDraftId ?? undefined,
          requestReadReceipt: replyRequestReadReceipt,
          attachments,
          sendAt: replySendAt ? new Date(replySendAt).toISOString() : undefined,
        }),
      });
      setReplyOpen(false);
      setReplyBody('');
      setReplyAttachments([]);
      setReplyDraftId(null);
      setReplySendAt(null);
      startUndoToast(res.id, res.undoWindowMs);
      if (activeFolder === 'sent' || activeFolder === 'drafts' || activeFolder === 'scheduled') loadEmails();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send reply');
    }
  }

  function openCompose(prefill?: Partial<ComposeData>) {
    // The signature is NOT folded into `body` here — it's rendered as its
    // own fixed block after the textarea (see em-compose-signature-preview
    // below) and appended once at actual send time. Baking it into `body`
    // used to mean anything added afterwards — typing, a meeting-time
    // insert, an AI draft — landed AFTER the signature instead of before
    // it, since both just appended to the same flat string.
    setCompose({
      to: '', cc: '', bcc: '', subject: '', body: prefill?.body ?? '',
      requestReadReceipt: false, attachments: [], draftId: null, replyToId: null, sendAt: null,
      isForward: false, fromIdentityId: null,
      ...prefill,
    });
    setComposeFullScreen(false);
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
      isForward: true,
    });
  }

  async function sendCompose() {
    if (!compose.to.trim()) return showAlert('Add at least one recipient before sending.');
    if (!compose.subject.trim()) return showAlert('Add a subject before sending.');
    if (compose.attachments.some(a => a.uploading)) return showAlert('Wait for attachments to finish uploading before sending.');
    try {
      if (composeDraftTimer.current) clearTimeout(composeDraftTimer.current);
      const attachments = compose.attachments.filter(a => a.storageKey).map(a => ({ storageKey: a.storageKey!, filename: a.filename!, size: a.size }));
      const res = await apiFetch('/v1/email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: compose.to, cc: compose.cc || undefined, bcc: compose.bcc || undefined,
          subject: compose.subject, body: signedBody(compose.body, compose.isForward ? 'reply' : 'new'),
          inReplyTo: compose.replyToId ?? undefined,
          draftId: compose.draftId ?? undefined,
          requestReadReceipt: compose.requestReadReceipt,
          attachments,
          fromIdentityId: compose.fromIdentityId ?? undefined,
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

  /** "Block sender" from the detail view's More menu — the Settings dialog
   *  isn't open here, so this persists straight to the account instead of
   *  waiting for a manual Save the user has no reason to know is needed. */
  async function blockSenderFromDetail(email: string) {
    if (!settings) return showAlert('Settings are still loading — try again in a moment.');
    if (settings.spamBlocklist.includes(email)) return showAlert(`${email} is already blocked.`);
    const next = { ...settings, spamBlocklist: [...settings.spamBlocklist, email] };
    try {
      await apiFetch('/v1/email/account', { method: 'PUT', body: JSON.stringify(next) });
      setSettings(next);
      showAlert(`Future mail from ${email} will go straight to Spam.`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Could not block this sender.');
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

  /** Same as testImapConnection, for the SMTP send-identity option. */
  async function testSmtpConnection() {
    if (!settings) return;
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const res = await apiFetch('/v1/email/account/test-smtp', {
        method: 'POST',
        body: JSON.stringify({
          smtpHost: settings.smtpHost, smtpPort: settings.smtpPort, smtpUser: settings.smtpUser,
          smtpPass: settings.smtpPass, smtpEncryption: settings.smtpEncryption,
        }),
      });
      setSmtpTestResult(res);
    } catch (err: any) {
      setSmtpTestResult({ success: false, error: err.message || 'Connection failed.' });
    } finally {
      setSmtpTesting(false);
    }
  }

  /** "Connect my own mailbox for sending" — mail-oauth.routes.ts's per-user
   *  authorize-personal route, same shape as the tenant-level connect button
   *  elsewhere in this codebase (Settings.tsx): fetch the provider's consent
   *  URL, then navigate the browser there directly. */
  function connectPersonalMail(provider: 'outlook' | 'gmail') {
    apiFetch(`/v1/settings/email/${provider}/authorize-personal`)
      .then((res: any) => { if (res?.url) window.location.href = res.url; })
      .catch((err: any) => showAlert(err?.message || `Could not start ${provider === 'outlook' ? 'Microsoft' : 'Google'} sign-in.`));
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

  async function toggleLabelHidden(id: string, hidden: boolean) {
    try {
      const row = await apiFetch(`/v1/email/labels/${id}`, { method: 'PATCH', body: JSON.stringify({ hidden }) });
      setLabelDefs(prev => prev.map(l => l.id === id ? row : l));
    } catch (err: any) {
      showAlert(err.message || 'Failed to update label');
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
   *  template's subject/body — used by the compose toolbar's picker.
   *  For HTML templates the html body is inserted as-is; for plain-text
   *  templates the existing append behaviour is preserved. */
  function applyTemplate(t: EmailQuickTemplate, target: 'compose' | 'reply') {
    const content = templateContentHtml(t);
    if (target === 'compose') {
      setCompose(prev => ({
        ...prev,
        subject: prev.subject || t.subject,
        body: appendEmailHtml(prev.body, content),
      }));
    } else {
      setReplyBody(prev => appendEmailHtml(prev, content));
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
  useEffect(() => { setPage(0); }, [pageSize]);

  // ── Render ────────────────────────────────────────────────────────────────────

  /** The reply form's fields — identical whether it's docked inline under
   *  the thread or popped out into its own floating window (see
   *  replyPoppedOut), so it's built once here rather than duplicated. */
  function renderReplyFields() {
    if (!selectedEmail) return null;
    return (
      <>
        <div className="em-reply-recipients">
          <RecipientChips label="To" value={replyTo} onChange={setReplyTo} />
          <RecipientChips label="Cc" value={replyCc} onChange={setReplyCc} />
          <RecipientChips label="Bcc" value={replyBcc} onChange={setReplyBcc} />
        </div>
        <div className="em-reply-body">
          <DescribeMessageInput
            subject={replySubject}
            replyContext={selectedEmail.body}
            onGenerated={result => { setReplyBody(result.body); if (result.subject) setReplySubject(result.subject); }}
          />
          <div className="em-compose-rich-editor em-compose-rich-editor--reply">
            <RichTextEditor value={replyBody} onChange={setReplyBody} placeholder="Reply…" />
          </div>
          {defaultSignature('reply')?.body_html?.trim() && (
            <div className="em-signature-preview" dangerouslySetInnerHTML={{ __html: defaultSignature('reply')!.body_html }} />
          )}
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
          <label className="em-compose-receipt-row">
            <input type="checkbox" checked={replyRequestReadReceipt} onChange={e => setReplyRequestReadReceipt(e.target.checked)} />
            Request read receipt <span className="em-receipt-disclaimer">— best-effort; many mail clients block tracking images by default</span>
          </label>
          {replySendAt !== null && (
            <div className="em-compose-row">
              <span className="em-compose-label">Send at</span>
              <input type="datetime-local" className="em-compose-input" value={replySendAt} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                onChange={e => setReplySendAt(e.target.value)} />
              <Tip label="Send now instead"><button type="button" className="em-attach-chip-remove" onClick={() => setReplySendAt(null)}><Icon name="x" size={11} /></button></Tip>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20 }} onClick={sendReply} disabled={replyAttachments.some(a => a.uploading)}>
              <Icon name="send" size={13} /> {replySendAt ? 'Schedule send' : 'Send'}
            </button>
            <Tip label="Schedule send for later">
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setReplySendAt(prev => prev !== null ? null : new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))}>
                <Icon name="clock" size={15} />
              </button>
            </Tip>
            <Tip label="Attach file">
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => replyFileInputRef.current?.click()}>
                <Icon name="paperclip" size={15} />
              </button>
            </Tip>
            <Tip label="Attach from Drive">
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setDrivePickerTarget('reply')}>
                <Icon name="folder" size={15} />
              </button>
            </Tip>
            <input ref={replyFileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) uploadAttachments(files, 'reply'); e.target.value = ''; }} />
            <MeetingTimeSuggestor onInsert={text => setReplyBody(prev => prev.trim() ? `${prev}\n\n${text}` : text)} />
            <Tip label={quickTemplates.length > 0 ? 'Insert template' : 'Manage templates'}>
              <button
                type="button"
                className="em-icon-btn em-icon-btn--ghost"
                onClick={() => quickTemplates.length > 0 ? setTemplatePickerOpen(v => !v) : navigate('/email/templates')}
              >
                <Icon name="layers" size={15} />
              </button>
            </Tip>
            {templatePickerOpen && quickTemplates.length > 0 && (
              <TemplatePickerPanel templates={quickTemplates} target="reply" search={templateSearch} setSearch={setTemplateSearch} openGroups={openGroups} setOpenGroups={setOpenGroups} onApply={t => applyTemplate(t, 'reply')} onClose={() => setTemplatePickerOpen(false)} onManage={() => { setTemplatePickerOpen(false); navigate('/email/templates'); }} />
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="em-text-btn" onClick={() => saveReplyDraft()}>{replySaving ? 'Saving…' : replyDraftId ? 'Saved to Drafts' : 'Save draft'}</button>
            <Tip label="Discard">
              <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={discardReply}>
                <Icon name="trash" size={16} />
              </button>
            </Tip>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="em-root">

      {/* Body — no internal sidebar; AppSidebar (from EmailShell) handles the left panel */}
      <div className="em-body">

        {/* Area 3: Email list — full width when nothing selected; fixed+draggable when email open */}
        {(!isMobile || !selectedId) && (
          <div
            ref={setSearchBoundary}
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
                <button
                  type="button"
                  className="em-search-ai-trigger"
                  onClick={runAiSearch}
                  disabled={!search.trim() || aiSearchLoading}
                  aria-label="Ask AI to search this mailbox"
                  title="Ask AI"
                >
                  {aiSearchLoading
                    ? <Spinner size={14} />
                    : emailsLoading && (search.trim() || advancedSearch)
                      ? <Spinner size={14} />
                      : <Icon name="sparkle" size={16} />}
                </button>
                <input
                  className="em-search-input"
                  aria-label="Search mail"
                  placeholder="Ask AI or search messages, senders and subjects"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setAiSearchError(''); setSearchError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') setSearchDebounced(search.trim()); }}
                />
                {search && (
                  <Tip label="Clear search">
                    <button type="button" className="em-search-clear" aria-label="Clear search" onClick={() => setSearch('')}>
                      <Icon name="x" size={14} />
                    </button>
                  </Tip>
                )}
              </div>
              <AdvancedEmailSearch
                labelDefs={labelDefs}
                collisionBoundary={searchBoundary}
                onSearch={q => setAdvancedSearch(Object.values(q).some(v => v !== undefined && v !== '') ? q : null)}
                onCreateFilter={createFilterFromSearch}
              />
              {(aiSearchError || searchError) && <span className="em-ai-search-error" role="status">{aiSearchError || searchError}</span>}
              <Tip label="Refresh">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={loadEmails}>
                  <Icon name="refresh" size={15} />
                </button>
              </Tip>
              <Tip label="Email settings">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={openSettingsPanel}>
                  <Icon name="settings" size={15} />
                </button>
              </Tip>
            </div>

            <div className="em-filter-bar">
              {activeFolder === 'inbox' && (
                <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
                  <TabsList aria-label="Message filter">
                    {(['all', 'unread', 'starred'] as Filter[]).map(f => (
                      <TabsTrigger key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
              {labelDefs.length > 0 && selected.size === 0 && (
                <SingleSelectFilter
                  label="Label"
                  icon={<Icon name="tag" size={12} />}
                  options={labelDefs.map(l => ({ value: l.name, label: l.name }))}
                  value={filterByLabel}
                  onChange={setFilterByLabel}
                />
              )}
              {selected.size > 0 && (
                <div className="em-bulk-actions">
                  <span className="em-bulk-count">{selected.size} selected</span>
                  <Tip label="Mark read"><button type="button" className="em-bulk-btn" onClick={() => bulkAction('read')}><Icon name="eye" size={13} /></button></Tip>
                  <Tip label="Mark unread"><button type="button" className="em-bulk-btn" onClick={() => bulkAction('unread')}><Icon name="eyeOff" size={13} /></button></Tip>
                  {labelDefs.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="em-bulk-btn" title="Apply label"><Icon name="tag" size={13} /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {labelDefs.map(l => (
                          <DropdownMenuItem key={l.id} onClick={() => bulkLabelAction(l.name)}>{l.name}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Tip label="Archive"><button type="button" className="em-bulk-btn" onClick={() => bulkAction('archive')}><Icon name="folder" size={13} /></button></Tip>
                  <Tip label="Report spam"><button type="button" className="em-bulk-btn" onClick={() => bulkAction('spam')}><Icon name="alertCircle" size={13} /></button></Tip>
                  <Tip label={activeFolder === 'trash' ? 'Delete permanently' : 'Move to Trash'}>
                    <button type="button" className="em-bulk-btn em-bulk-btn--danger" onClick={() => bulkAction(activeFolder === 'trash' ? 'delete' : 'trash')}>
                      <Icon name="trash" size={13} />
                    </button>
                  </Tip>
                </div>
              )}
              {selected.size === 0 && (
                <span className="em-filter-meta">
                  {emailsTotal === 1 ? '1 message' : `${emailsTotal.toLocaleString()} messages`}
                </span>
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
                  {import.meta.env.DEV && activeFolder === 'inbox' && !search && filter === 'all' && (
                    <button type="button" className="em-text-btn" onClick={loadSampleMessages} disabled={seedingDemo}>
                      {seedingDemo ? 'Loading…' : 'Load sample messages (dev only)'}
                    </button>
                  )}
                </div>
              ) : pageEmails.map(email => (
                <div
                  key={email.id}
                  className={`em-row${!email.read ? ' em-row--unread' : ''}${selectedId === email.id ? ' em-row--selected' : ''}`}
                  onClick={() => rowClick(email)}
                  role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rowClick(email); } }}
                >
                  <div className="em-row-select-area">
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
                  </div>
                  <div className="em-row-body">
                    <div className="em-row-header">
                      <HoverCard openDelay={500} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <div className="em-row-sender-wrap" onClick={ev => ev.stopPropagation()}>
                            <PersonAvatar userId={email.from.userId} name={email.from.name} size={22} style={{ flexShrink: 0 }} />
                            <div className={`em-row-sender${!email.read ? ' em-row-sender--bold' : ''}`}>
                              {email.from.name}
                            </div>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="em-contact-card" side="bottom" align="start">
                          <ContactHoverCardBody addr={email.from} savedEmails={savedContactEmails} savingEmail={savingContactEmail} onCompose={composeToAddress} onSave={saveContactFromEmail} onNavigate={navigate} />
                        </HoverCardContent>
                      </HoverCard>
                    </div>

                    <div className="em-row-mid">
                      <span className="em-row-subject-line">
                        <span className={`em-row-subject${!email.read ? ' em-row-subject--bold' : ''}`}>{email.subject}</span>
                        {(email.threadCount ?? 1) > 1 && (
                          <Tip label="Messages in this conversation"><span className="em-thread-badge">{email.threadCount}</span></Tip>
                        )}
                      </span>
                      <span className="em-row-snip"> — {email.snippet}</span>
                    </div>

                    {email.attachments.length > 0 && (
                      <div className="em-row-attachments">
                        {email.attachments.slice(0, 3).map((att, i) => {
                          const ext = att.filename.split('.').pop()?.toLowerCase() ?? '';
                          const isPdf = ext === 'pdf';
                          const isImg = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
                          return (
                            <span key={i} className={`em-row-att-chip${isPdf ? ' em-row-att-chip--pdf' : isImg ? ' em-row-att-chip--img' : ''}`}>
                              <span className="em-row-att-icon">{isPdf ? 'PDF' : isImg ? <Icon name="image" size={11} /> : <Icon name="file" size={11} />}</span>
                              <span className="em-row-att-name">{att.filename.length > 20 ? att.filename.slice(0, 18) + '…' : att.filename}</span>
                            </span>
                          );
                        })}
                        {email.attachments.length > 3 && (
                          <span className="em-row-att-chip em-row-att-chip--more">+{email.attachments.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div className="em-row-meta">
                      <div className="em-row-labels">
                      {email.labels.map((lbl, i) => {
                        const c = labelColors(lbl, labelDefs);
                        return (
                          <Badge
                            key={i}
                            variant="gray"
                            className="shrink-0 em-row-badge em-row-badge--clickable"
                            style={{ background: c.bg, color: c.fg }}
                            onClick={ev => { ev.stopPropagation(); setFilterByLabel(filterByLabel === lbl ? null : lbl); }}
                          >
                            {lbl}
                          </Badge>
                        );
                      })}
                      {email.folder === 'scheduled' && email.scheduledAt && (
                        <Tip label="Still cancellable">
                          <Badge variant="warning" className="shrink-0 em-row-badge inline-flex items-center gap-1">
                            <Icon name="clock" size={10} /> {fmtDate(email.scheduledAt)}
                          </Badge>
                        </Tip>
                      )}
                      {email.folder === 'drafts' && email.sendError && (
                        <Tip label={email.sendError}>
                          <Badge variant="error" className="shrink-0 em-row-badge">Send failed</Badge>
                        </Tip>
                      )}
                      {(email.deliveryStatus === 'pending' || email.deliveryStatus === 'sending' || email.deliveryStatus === 'failed') && (
                        <Tip label={email.deliveryStatus === 'failed' ? 'Delivery failed — will retry automatically' : 'Queued for delivery'}>
                          <Badge variant={email.deliveryStatus === 'failed' ? 'error' : 'warning'} className="shrink-0 em-row-badge">
                            {email.deliveryStatus === 'failed' ? 'Failed' : 'Pending'}
                          </Badge>
                        </Tip>
                      )}
                      </div>
                      <div className="em-row-end">
                      {email.hasAttachment && <Icon name="paperclip" size={12} color="var(--ink3)" className="em-row-clip shrink-0" />}
                      <div className={`em-row-date${!email.read ? ' em-row-date--bold' : ''}`}>
                        {fmtDate(email.date)}
                      </div>
                      {email.folder === 'scheduled' && (
                        <Tip label="Cancel">
                          <button type="button" className="em-icon-btn em-icon-btn--ghost em-row-cancel-btn" onClick={ev => { ev.stopPropagation(); cancelScheduled(email.id); }}>
                            <Icon name="x" size={14} />
                          </button>
                        </Tip>
                      )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {emailsTotal > 0 && (
              <PaginationBar
                page={page + 1}
                pageSize={pageSize}
                total={emailsTotal}
                onPageChange={p => setPage(p - 1)}
                onPageSizeChange={s => { setPageSize(s); setPage(0); }}
                pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
                itemLabel="message"
                bordered={true}
                compact={true}
              />
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
              <Tip label="Back">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setSelectedId(null)}>
                  <Icon name="arrowLeft" size={16} />
                </button>
              </Tip>
              <div className="em-toolbar-sep" />
              {selectedEmail.folder === 'scheduled' ? (
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => cancelScheduled(selectedEmail.id)}>
                  <Icon name="x" size={16} /> Cancel send
                </button>
              ) : (
                <>
                  <Tip label="Archive"><button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => moveToFolder(selectedEmail.id, 'archive')}><Icon name="folder" size={16} /></button></Tip>
                  <Tip label="Delete"><button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => moveToFolder(selectedEmail.id, 'trash')}><Icon name="trash" size={16} /></button></Tip>
                  <Tip label="Mark unread"><button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => markUnread(selectedEmail.id)}><Icon name="mail" size={16} /></button></Tip>
                  <Tip label={selectedEmail.starred ? 'Unstar' : 'Star'}>
                    <button type="button" className={`em-icon-btn em-icon-btn--ghost${selectedEmail.starred ? ' em-icon-btn--starred' : ''}`} onClick={e => toggleStar(selectedEmail.id, e)}>
                      <Icon name="star" size={16} color={selectedEmail.starred ? 'var(--gold)' : undefined} />
                    </button>
                  </Tip>
                </>
              )}
              {selectedEmail.folder === 'inbox' && (
                <Tip label="Report spam">
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => moveToFolder(selectedEmail.id, 'spam')}>
                    <Icon name="alertCircle" size={16} />
                  </button>
                </Tip>
              )}
              {selectedEmail.folder === 'spam' && (
                <Tip label="Not spam — move to Inbox">
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => moveToFolder(selectedEmail.id, 'inbox')}>
                    <Icon name="checkCircle" size={16} />
                  </button>
                </Tip>
              )}
              {labelDefs.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="em-icon-btn em-icon-btn--ghost" title="Labels"><Icon name="tag" size={16} /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {labelDefs.map(l => (
                      <DropdownMenuCheckboxItem key={l.id} checked={selectedEmail.labels.includes(l.name)} onCheckedChange={() => toggleMessageLabel(selectedEmail.id, l.name)}>
                        {l.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="em-icon-btn em-icon-btn--ghost" title="More"><Icon name="moreVertical" size={16} /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {selectedEmail.folder === 'scheduled' && (
                    <>
                      <DropdownMenuItem onClick={() => {
                        const cur = selectedEmail.scheduledAt;
                        const base = cur ? new Date(cur) : new Date(Date.now() + 60_000);
                        base.setSeconds(0, 0);
                        setRescheduleValue(new Date(base.getTime() - base.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
                        setRescheduleOpen(true);
                      }}>
                        <Icon name="clock" size={13} /> Reschedule
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => window.print()}>
                    <Icon name="printer" size={13} /> Print
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => blockSenderFromDetail(selectedEmail.from.email)} className="text-destructive focus:text-destructive">
                    <Icon name="alertCircle" size={13} /> Block {selectedEmail.from.name || selectedEmail.from.email}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              {/* AI Overview — auto-triggered, collapsible, appears above the email */}
              {(aiOverviewLoading || (aiOverviewBullets && aiOverviewBullets.length > 0)) && (
                <div className="em-ai-overview">
                  <button
                    type="button"
                    className="em-ai-overview-hdr"
                    onClick={() => setAiOverviewOpen(v => !v)}
                  >
                    <Icon name="zap" size={14} color="var(--blue)" />
                    <span className="em-ai-overview-title">AI Overview</span>
                    <Icon name={aiOverviewOpen ? 'chevronUp' : 'chevronDown'} size={13} color="var(--blue)" />
                  </button>
                  {aiOverviewOpen && (
                    <div className="em-ai-overview-body">
                      {aiOverviewLoading ? (
                        <div className="em-ai-overview-loading">
                          <Icon name="refresh" size={13} color="var(--blue)" /> Generating overview…
                        </div>
                      ) : (
                        <ul className="em-ai-overview-list">
                          {aiOverviewBullets!.map((b, i) => <li key={i}>{b}</li>)}
                        </ul>
                      )}
                      <div className="em-ai-overview-disclaimer">By AI · may contain errors</div>
                    </div>
                  )}
                </div>
              )}

              <h2 className="em-detail-subject">
                {selectedEmail.subject}
                {selectedEmail.labels.map(l => {
                  const c = labelColors(l, labelDefs);
                  return <Badge key={l} variant="gray" className="ml-2" style={{ background: c.bg, color: c.fg }}>{l}</Badge>;
                })}
              </h2>

              {(selectedEmail.threadCount ?? 1) > 1 && (
                <div className="em-thread-view">
                  {threadLoading && (
                    <div className="em-thread-loading"><Spinner size={13} /> Loading conversation…</div>
                  )}
                  {!threadLoading && threadMessages && threadMessages.filter(m => m.id !== selectedEmail.id).length > 0 && (
                    <div className="em-thread-stack">
                      {threadMessages.filter(m => m.id !== selectedEmail.id).map(m => (
                        <div
                          key={m.id}
                          className={`em-thread-row${!m.read ? ' em-thread-row--unread' : ''}`}
                          onClick={() => selectEmail(m.id)}
                          role="button" tabIndex={0}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEmail(m.id); } }}
                        >
                          <PersonAvatar userId={m.from.userId} name={m.from.name} size={26} hideStatus />
                          <div className="em-thread-row-main">
                            <div className="em-thread-row-top">
                              <span className="em-thread-row-from">{m.from.name}</span>
                              <span className="em-thread-row-date">{fmtDate(m.date)}</span>
                            </div>
                            <div className="em-thread-row-snip">{m.snippet}</div>
                          </div>
                          {m.hasAttachment && <Icon name="paperclip" size={13} color="var(--ink3)" />}
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
                    <Tip label="Dismiss">
                      <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setTaskDismissed(true)}>
                        <Icon name="x" size={14} />
                      </button>
                    </Tip>
                  </div>
                  <div className="em-task-banner-hint">AI-suggested from this email's content — double-check before relying on it.</div>
                </div>
              )}

              <div className="em-detail-from-row">
                <HoverCard openDelay={400} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <div className="em-detail-from-avatar-wrap">
                      <PersonAvatar userId={selectedEmail.from.userId} name={selectedEmail.from.name} size={44} />
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent className="em-contact-card" side="bottom" align="start">
                    <ContactHoverCardBody addr={selectedEmail.from} savedEmails={savedContactEmails} savingEmail={savingContactEmail} onCompose={composeToAddress} onSave={saveContactFromEmail} onNavigate={navigate} />
                  </HoverCardContent>
                </HoverCard>
                <div className="em-detail-from-meta">
                  <div className="em-detail-from-top">
                    <div>
                      <HoverCard openDelay={400} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <span className="em-detail-from-name em-detail-from-name--hoverable">{selectedEmail.from.name}</span>
                        </HoverCardTrigger>
                        <HoverCardContent className="em-contact-card" side="bottom" align="start">
                          <ContactHoverCardBody addr={selectedEmail.from} savedEmails={savedContactEmails} savingEmail={savingContactEmail} onCompose={composeToAddress} onSave={saveContactFromEmail} onNavigate={navigate} />
                        </HoverCardContent>
                      </HoverCard>
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
                      <Tip label="Most mail clients block remote images by default, so a confirmation only ever proves a best case — never treat 'not read yet' as certain.">
                        <span className="em-receipt-disclaimer">· best-effort</span>
                      </Tip>
                    </div>
                  )}
                </div>
              </div>

              <div className="em-divider" />
              <div className="em-detail-body-text">{selectedEmail.body}</div>

              {selectedEmail.attachments.length > 0 && (
                <div className="em-attach-list">
                  {selectedEmail.attachments.map(a => (
                    <span key={a.storageKey} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <button type="button" className="em-attach-chip em-attach-chip--download" onClick={() => downloadAttachment(selectedEmail.id, a.storageKey)}>
                        <Icon name="paperclip" size={13} />
                        <span>{a.filename}</span>
                        {a.size != null && <span className="em-attach-chip-size">{(a.size / 1024).toFixed(0)} KB</span>}
                        <Icon name="download" size={13} />
                      </button>
                      <DropdownMenu onOpenChange={open => { if (open) loadWritableDrives(); }}>
                        <Tip label="Save to Drive">
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="em-icon-btn" aria-label={`Save ${a.filename} to Drive`}><Icon name="folder" size={14} /></button>
                          </DropdownMenuTrigger>
                        </Tip>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onSelect={() => saveAttachmentToDrive(selectedEmail.id, a.storageKey)}>My Drive</DropdownMenuItem>
                          {(writableDrives ?? []).filter(d => d.name !== 'My Drive').map(d => (
                            <DropdownMenuItem key={d.id} onSelect={() => saveAttachmentToDrive(selectedEmail.id, a.storageKey, d.id)}>{d.name}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
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
                    <span>{replyCc.length > 0 ? 'Reply all' : 'Reply'}</span>
                    <div style={{ flex: 1 }} />
                    <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setReplyOpen(false)}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  {renderReplyFields()}
                </div>
              )}
            </div>

            {!replyOpen && selectedEmail.folder !== 'scheduled' && (
              <div className="em-detail-footer">
                <button type="button" className="em-icon-btn em-icon-btn--pill" onClick={() => openReply('reply')}>
                  <Icon name="arrowLeft" size={14} /> Reply
                </button>
                <button type="button" className="em-icon-btn em-icon-btn--pill" onClick={() => openReply('replyAll')}>
                  <Icon name="arrowLeft" size={14} /> Reply all
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
        <div className={`em-compose-modal${isMobile ? ' em-compose-modal--mobile' : ''}${composeFullScreen ? ' em-compose-modal--full' : ''}`}>
          <div className="em-compose-hdr">
            <span className="em-compose-title">New Message</span>
            {!isMobile && (
              <Tip label="Default size">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" style={{ color: '#fff' }} onClick={e => { e.stopPropagation(); setComposeFullScreen(false); }}>
                  <Icon name="minus" size={14} color="#fff" />
                </button>
              </Tip>
            )}
            {!isMobile && (
              <Tip label={composeFullScreen ? 'Exit full screen' : 'Full screen'}>
                <button type="button" className="em-icon-btn em-icon-btn--ghost" style={{ color: '#fff' }} onClick={e => { e.stopPropagation(); setComposeFullScreen(f => !f); }}>
                  <Icon name={composeFullScreen ? 'minimize' : 'maximize'} size={14} color="#fff" />
                </button>
              </Tip>
            )}
            <button type="button" className="em-icon-btn em-icon-btn--ghost" style={{ color: '#fff' }} onClick={e => { e.stopPropagation(); setComposeOpen(false); }}>
              <Icon name="x" size={16} color="#fff" />
            </button>
          </div>
          <div className="em-compose-fields">
            {identities.length > 0 && (
              <div className="em-compose-row">
                <span className="em-compose-label">From</span>
                <Select
                  value={compose.fromIdentityId ?? '__default__'}
                  onValueChange={v => setCompose(p => ({ ...p, fromIdentityId: v === '__default__' ? null : v }))}
                >
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">{settings?.fromEmail || user?.email || 'Workspace default'}</SelectItem>
                    {identities.map(id => (
                      <SelectItem key={id.id} value={id.id}>{id.fromName ? `${id.fromName} <${id.fromEmail}>` : id.fromEmail}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="em-compose-row em-compose-row--chips">
              <RecipientChips
                label="To"
                value={parseAddressList(compose.to)}
                onChange={chips => setCompose(p => ({ ...p, to: formatAddressList(chips) }))}
                placeholder="recipients@domain.com"
              />
            </div>
            <div className="em-compose-row em-compose-row--chips">
              <RecipientChips label="Cc" value={parseAddressList(compose.cc)} onChange={chips => setCompose(p => ({ ...p, cc: formatAddressList(chips) }))} />
            </div>
            <div className="em-compose-row em-compose-row--chips">
              <RecipientChips label="Bcc" value={parseAddressList(compose.bcc)} onChange={chips => setCompose(p => ({ ...p, bcc: formatAddressList(chips) }))} />
            </div>
            <div className="em-compose-row">
              <span className="em-compose-label">Subject</span>
              <input className="em-compose-input" value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))} />
            </div>
            <DescribeMessageInput
              subject={compose.subject}
              onGenerated={result => setCompose(p => ({ ...p, body: result.body, subject: result.subject && !p.subject.trim() ? result.subject : p.subject }))}
            />
            <div className="em-compose-rich-editor">
              <RichTextEditor value={compose.body} onChange={body => setCompose(p => ({ ...p, body }))} placeholder="Write your email here…" />
            </div>
            {defaultSignature(compose.isForward ? 'reply' : 'new')?.body_html?.trim() && (
              <div className="em-signature-preview" dangerouslySetInnerHTML={{ __html: defaultSignature(compose.isForward ? 'reply' : 'new')!.body_html }} />
            )}
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
                <Tip label="Send now instead"><button type="button" className="em-attach-chip-remove" onClick={() => setCompose(p => ({ ...p, sendAt: null }))}><Icon name="x" size={11} /></button></Tip>
              </div>
            )}
            <div className="em-compose-footer" style={{ position: 'relative' }}>
              <button type="button" className="em-compose-send-btn" onClick={sendCompose} disabled={compose.attachments.some(a => a.uploading)}>
                <Icon name="send" size={14} /> {compose.sendAt ? 'Schedule send' : 'Send'}
              </button>
              <div className="em-compose-footer-sep" />
              <Tip label="Schedule send for later">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setCompose(p => ({ ...p, sendAt: p.sendAt !== null ? null : new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) }))}>
                  <Icon name="clock" size={16} />
                </button>
              </Tip>
              <Tip label="Attach file">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => composeFileInputRef.current?.click()}>
                  <Icon name="paperclip" size={16} />
                </button>
              </Tip>
              <Tip label="Attach from Drive">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setDrivePickerTarget('compose')}>
                  <Icon name="folder" size={16} />
                </button>
              </Tip>
              <input ref={composeFileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) uploadAttachments(files, 'compose'); e.target.value = ''; }} />
              <MeetingTimeSuggestor onInsert={text => setCompose(p => ({ ...p, body: p.body.trim() ? `${p.body}\n\n${text}` : text }))} />
              <Tip label={quickTemplates.length > 0 ? 'Insert template' : 'Manage templates'}>
                <button
                  type="button"
                  className="em-icon-btn em-icon-btn--ghost"
                  onClick={() => quickTemplates.length > 0 ? setTemplatePickerOpen(v => !v) : navigate('/email/templates')}
                >
                  <Icon name="layers" size={16} />
                </button>
              </Tip>
              {templatePickerOpen && quickTemplates.length > 0 && (
                <TemplatePickerPanel templates={quickTemplates} target="compose" search={templateSearch} setSearch={setTemplateSearch} openGroups={openGroups} setOpenGroups={setOpenGroups} onApply={t => applyTemplate(t, 'compose')} onClose={() => setTemplatePickerOpen(false)} onManage={() => { setTemplatePickerOpen(false); navigate('/email/templates'); }} />
              )}
              <div style={{ flex: 1 }} />
              <button type="button" className="em-text-btn" onClick={() => saveDraft()}>
                {composeSaving ? 'Saving…' : compose.draftId ? 'Saved to Drafts' : 'Save draft'}
              </button>
              <Tip label="Discard">
                <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={discardCompose}>
                  <Icon name="trash" size={18} />
                </button>
              </Tip>
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

      {/* Email settings — a real tabbed page-in-a-dialog now (Gmail's own
          General/Labels/Inbox/Accounts/Filters/Forwarding/Advanced strip),
          not a single scrolling column — it outgrew that once multi-
          signature/multi-identity/filters/vacation-responder landed. */}
      {/* Email settings — Master-Detail vertical tabbed dialog following Hudumika Design System */}
      <Dialog open={settingsOpen} onOpenChange={o => { if (!o) setSettingsOpen(false); }}>
        <DialogContent size="full" className="em-settings-dialog">
          <DialogHeader className="em-settings-dialog-header">
            <DialogTitle>Email settings</DialogTitle>
            <DialogDescription>Manage your inbox, sending accounts, signatures, filters, and delivery preferences.</DialogDescription>
          </DialogHeader>
          {settingsLoading || !settings ? (
            <DialogBody className="em-loading"><Spinner size={18} /><span>Loading…</span></DialogBody>
          ) : (
            <>
              <DialogBody className="em-settings-body">
                <Tabs value={settingsTab} onValueChange={v => setSettingsTab(v as any)} className="em-settings-layout">
                  <aside className="em-settings-sidebar">
                    <div className="em-settings-nav-label">Settings Navigation</div>
                    <TabsList className="em-settings-nav" aria-label="Email settings sections">
                      <TabsTrigger value="general">
                        <Icon name="sliders" size={15} />
                        <span>General</span>
                      </TabsTrigger>
                      <TabsTrigger value="labels">
                        <Icon name="tag" size={15} />
                        <span>Labels</span>
                      </TabsTrigger>
                      <TabsTrigger value="inbox">
                        <Icon name="inbox" size={15} />
                        <span>Inbox</span>
                      </TabsTrigger>
                      <TabsTrigger value="accounts">
                        <Icon name="mail" size={15} />
                        <span>Accounts &amp; Sync</span>
                      </TabsTrigger>
                      <TabsTrigger value="filters">
                        <Icon name="shield" size={15} />
                        <span>Filters &amp; Blocked</span>
                      </TabsTrigger>
                      <TabsTrigger value="forwarding">
                        <Icon name="send" size={15} />
                        <span>Forwarding &amp; POP/IMAP</span>
                      </TabsTrigger>
                      <TabsTrigger value="advanced">
                        <Icon name="settings" size={15} />
                        <span>Advanced</span>
                      </TabsTrigger>
                    </TabsList>
                  </aside>

                  <div className="em-settings-content">
                    {/* ── General Tab ── */}
                    {settingsTab === 'general' && (
                      <div className="em-settings-pane">
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="edit" size={16} />
                            <span>Signatures</span>
                          </div>
                          <p className="em-settings-hint">Multiple signatures, each with its own rich text and images — pick which one is used for new messages and which for replies/forwards.</p>
                          <SignatureManager onChange={setSignatures} />
                        </div>

                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="messageSquare" size={16} />
                            <span>Quick Replies</span>
                          </div>
                          <p className="em-settings-hint">Canned-response snippets you can insert into any compose or reply window.</p>
                          <div className="em-label-manage-list">
                            {quickTemplates.map(t => (
                              <div key={t.id} className="em-label-manage-row">
                                <span className="em-label-name">{t.name}</span>
                                <div className="em-label-actions">
                                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTemplateEditing(t)}>Edit</button>
                                  <button type="button" className="em-icon-btn em-icon-btn--ghost em-btn-danger" onClick={() => deleteTemplate(t.id)} title="Delete template">
                                    <Icon name="trash" size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {quickTemplates.length === 0 && <p className="em-settings-hint">No quick replies yet.</p>}
                          </div>
                          {templateEditing ? (
                            <div className="em-settings-form-box">
                              <div className="em-settings-field">
                                <label className="em-field-label">Template Name</label>
                                <input className="em-settings-input" value={templateEditing.name} placeholder="e.g. Follow-up inquiry"
                                  onChange={e => setTemplateEditing(prev => prev ? { ...prev, name: e.target.value } : prev)} />
                              </div>
                              <div className="em-settings-field">
                                <label className="em-field-label">Subject (optional)</label>
                                <input className="em-settings-input" value={templateEditing.subject} placeholder="e.g. Following up on our meeting"
                                  onChange={e => setTemplateEditing(prev => prev ? { ...prev, subject: e.target.value } : prev)} />
                              </div>
                              <div className="em-settings-field">
                                <label className="em-field-label">Body</label>
                                <textarea className="em-settings-textarea" value={templateEditing.body} placeholder="Write template content here…" rows={4}
                                  onChange={e => setTemplateEditing(prev => prev ? { ...prev, body: e.target.value } : prev)} />
                              </div>
                              <div className="em-form-actions">
                                <button type="button" className="btn btn-primary btn-sm" onClick={saveTemplate}>Save Template</button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTemplateEditing(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTemplateEditing({ id: null, name: '', subject: '', body: '' })}>
                                <Icon name="plus" size={14} />
                                <span>New quick reply</span>
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="calendar" size={16} />
                            <span>Vacation Responder</span>
                          </div>
                          <SwitchRow
                            title="Vacation responder on"
                            description="Auto-reply once to each sender while it's active — never to yourself, and never twice to the same person during one vacation."
                            checked={settings.vacationEnabled}
                            onCheckedChange={v => setSettings({ ...settings, vacationEnabled: v })}
                          />
                          {settings.vacationEnabled && (
                            <div className="em-settings-subform">
                              <div className="em-settings-field">
                                <label className="em-field-label">Active Period</label>
                                <DateRangePicker
                                  range={{
                                    from: settings.vacationStart ? new Date(settings.vacationStart) : undefined,
                                    to: settings.vacationEnd ? new Date(settings.vacationEnd) : undefined,
                                  }}
                                  onChange={r => setSettings({
                                    ...settings,
                                    vacationStart: r?.from ? r.from.toISOString() : null,
                                    vacationEnd: r?.to ? r.to.toISOString() : null,
                                  })}
                                />
                              </div>
                              <div className="em-settings-field">
                                <label className="em-field-label">Subject</label>
                                <input className="em-settings-input" value={settings.vacationSubject}
                                  onChange={e => setSettings({ ...settings, vacationSubject: e.target.value })} placeholder="Out of office" />
                              </div>
                              <div className="em-settings-field">
                                <label className="em-field-label">Message</label>
                                <textarea className="em-settings-textarea" rows={4} value={settings.vacationMessage}
                                  onChange={e => setSettings({ ...settings, vacationMessage: e.target.value })} placeholder="I'm away and will respond when I'm back…" />
                              </div>
                              <div className="em-settings-checkbox-group">
                                <CheckboxRow
                                  title="Only send a response to people in my Contacts"
                                  checked={settings.vacationContactsOnly}
                                  onCheckedChange={v => setSettings({ ...settings, vacationContactsOnly: v })}
                                />
                                <CheckboxRow
                                  title="Only send a response to people in my organization"
                                  description="Anyone emailing from the same domain as your own address."
                                  checked={settings.vacationDomainOnly}
                                  onCheckedChange={v => setSettings({ ...settings, vacationDomainOnly: v })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Labels Tab ── */}
                    {settingsTab === 'labels' && (
                      <div className="em-settings-pane">
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="tag" size={16} />
                            <span>Labels</span>
                          </div>
                          <p className="em-settings-hint">Custom labels you can apply to any message — organized with distinct colors across your inbox.</p>
                          <div className="em-settings-row">
                            <input className="em-settings-input" value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createLabel(); } }}
                              placeholder="New label name" />
                            <button type="button" className="btn btn-primary btn-sm" onClick={createLabel} disabled={!newLabelName.trim()}>
                              <Icon name="plus" size={14} />
                              <span>Add Label</span>
                            </button>
                          </div>
                          <div className="em-label-manage-list">
                            {labelDefs.map(l => {
                              const c = labelColors(l.name, labelDefs);
                              return (
                                <div key={l.id} className="em-label-manage-row">
                                  <Badge variant="gray" style={{ background: c.bg, color: c.fg, flexShrink: 0 }}>{l.name}</Badge>
                                  <input className="em-settings-input" defaultValue={l.name}
                                    onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== l.name) renameLabel(l.id, e.target.value); }} />
                                  <div className="em-label-actions">
                                    <Tip label={l.hidden ? 'Show in label list' : 'Hide from label list'}>
                                      <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => toggleLabelHidden(l.id, !l.hidden)}>
                                        <Icon name={l.hidden ? 'eyeOff' : 'eye'} size={15} />
                                      </button>
                                    </Tip>
                                    <button type="button" className="em-icon-btn em-icon-btn--ghost em-btn-danger" onClick={() => deleteLabel(l.id)} title="Delete label">
                                      <Icon name="trash" size={15} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            {labelDefs.length === 0 && <p className="em-settings-hint">No labels yet.</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Inbox Tab ── */}
                    {settingsTab === 'inbox' && (
                      <div className="em-settings-pane">
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="inbox" size={16} />
                            <span>Inbox Type &amp; Sorting</span>
                          </div>
                          <p className="em-settings-hint">
                            Configure how your messages are sorted and grouped in the inbox view.
                          </p>
                          <div className="em-settings-row">
                            <span className="em-compose-label">Message list</span>
                            <Select value={settings.inboxSort} onValueChange={v => setSettings({ ...settings, inboxSort: v as any })}>
                              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">Default (newest first)</SelectItem>
                                <SelectItem value="unread_first">Unread first</SelectItem>
                                <SelectItem value="starred_first">Starred first</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Accounts & Sync Tab ── */}
                    {settingsTab === 'accounts' && (
                      <div className="em-settings-pane">
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="mail" size={16} />
                            <span>Inbound Mailbox (IMAP Sync)</span>
                          </div>
                          <SwitchRow
                            title="Connect my mailbox"
                            description="Real inbound mail via IMAP, fetched automatically every few minutes into your Inbox."
                            checked={settings.imapEnabled}
                            onCheckedChange={v => setSettings({ ...settings, imapEnabled: v })}
                          />
                          <div className="em-sync-status-box">
                            <span className="em-sync-status-text">
                              <Icon name="refresh" size={13} />
                              {settings.lastSyncedAt
                                ? `Last synced ${new Date(settings.lastSyncedAt).toLocaleString()}.`
                                : 'Not synced yet.'}
                            </span>
                            {settings.lastSyncError && <span className="em-settings-error">Last error: {settings.lastSyncError}</span>}
                          </div>
                          {settings.imapEnabled && (
                            <div className="em-settings-subform">
                              <div className="em-settings-grid-2">
                                <div className="em-settings-field">
                                  <label className="em-field-label">IMAP Host</label>
                                  <input className="em-settings-input" value={settings.imapHost} onChange={e => setSettings({ ...settings, imapHost: e.target.value })} placeholder="imap.example.com" />
                                </div>
                                <div className="em-settings-field">
                                  <label className="em-field-label">Port &amp; Encryption</label>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="em-settings-input" type="number" value={settings.imapPort} onChange={e => setSettings({ ...settings, imapPort: parseInt(e.target.value, 10) || 993 })} />
                                    <Select value={settings.imapEncryption} onValueChange={v => setSettings({ ...settings, imapEncryption: v as any })}>
                                      <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ssl">SSL</SelectItem>
                                        <SelectItem value="tls">TLS</SelectItem>
                                        <SelectItem value="none">None</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="em-settings-field">
                                  <label className="em-field-label">Username</label>
                                  <input className="em-settings-input" value={settings.imapUser} onChange={e => setSettings({ ...settings, imapUser: e.target.value })} placeholder="you@example.com" />
                                </div>
                                <div className="em-settings-field">
                                  <label className="em-field-label">Password</label>
                                  <input className="em-settings-input" type="password" value={settings.imapPass} onChange={e => setSettings({ ...settings, imapPass: e.target.value })} placeholder="••••••••" />
                                </div>
                              </div>
                              <CheckboxRow
                                title="Mark as read on server"
                                description="Applies once a message is fetched into your Inbox."
                                checked={settings.imapMarkAsRead}
                                onCheckedChange={v => setSettings({ ...settings, imapMarkAsRead: v })}
                              />
                              <div className="em-settings-action-row">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={testImapConnection} disabled={imapTesting || !settings.imapHost || !settings.imapUser}>
                                  {imapTesting ? <><Spinner size={13} /><span>Testing…</span></> : 'Test connection'}
                                </button>
                                {imapTestResult && (
                                  <Badge variant={imapTestResult.success ? 'success' : 'destructive'} className="em-test-result-badge">
                                    <Icon name={imapTestResult.success ? 'check' : 'alertCircle'} size={13} />
                                    <span>{imapTestResult.success ? 'Connected successfully.' : imapTestResult.error}</span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="send" size={16} />
                            <span>Send Mail As</span>
                          </div>
                          <p className="em-settings-hint">
                            Messages you send will show as: <strong>{settings.fromName || 'Hudumika'} &lt;{settings.fromEmail || (settings.sendProtocol === 'smtp' ? settings.smtpUser : 'your workspace address')}&gt;</strong>
                          </p>
                          <div className="em-settings-row">
                            <span className="em-compose-label">Send using</span>
                            <Select
                              value={settings.sendProtocol === 'platform' || settings.sendProtocol === 'smtp' ? settings.sendProtocol : 'platform'}
                              onValueChange={v => setSettings({ ...settings, sendProtocol: v as any })}
                            >
                              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="platform">Workspace default</SelectItem>
                                <SelectItem value="smtp">Custom SMTP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {settings.sendProtocol === 'smtp' && (
                            <div className="em-settings-subform">
                              <div className="em-settings-grid-2">
                                <div className="em-settings-field">
                                  <label className="em-field-label">SMTP Host</label>
                                  <input className="em-settings-input" value={settings.smtpHost} onChange={e => setSettings({ ...settings, smtpHost: e.target.value })} placeholder="smtp.example.com" />
                                </div>
                                <div className="em-settings-field">
                                  <label className="em-field-label">Port &amp; Encryption</label>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="em-settings-input" type="number" value={settings.smtpPort} onChange={e => setSettings({ ...settings, smtpPort: parseInt(e.target.value, 10) || 587 })} />
                                    <Select value={settings.smtpEncryption} onValueChange={v => setSettings({ ...settings, smtpEncryption: v as any })}>
                                      <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ssl">SSL</SelectItem>
                                        <SelectItem value="tls">TLS</SelectItem>
                                        <SelectItem value="none">None</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="em-settings-field">
                                  <label className="em-field-label">SMTP Username</label>
                                  <input className="em-settings-input" value={settings.smtpUser} onChange={e => setSettings({ ...settings, smtpUser: e.target.value })} placeholder="you@example.com" />
                                </div>
                                <div className="em-settings-field">
                                  <label className="em-field-label">SMTP Password</label>
                                  <input className="em-settings-input" type="password" value={settings.smtpPass} onChange={e => setSettings({ ...settings, smtpPass: e.target.value })} placeholder="••••••••" />
                                </div>
                              </div>
                              <div className="em-settings-action-row">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={testSmtpConnection} disabled={smtpTesting || !settings.smtpHost || !settings.smtpUser}>
                                  {smtpTesting ? <><Spinner size={13} /><span>Testing…</span></> : 'Test connection'}
                                </button>
                                {smtpTestResult && (
                                  <Badge variant={smtpTestResult.success ? 'success' : 'destructive'} className="em-test-result-badge">
                                    <Icon name={smtpTestResult.success ? 'check' : 'alertCircle'} size={13} />
                                    <span>{smtpTestResult.success ? 'Connected successfully.' : smtpTestResult.error}</span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                          {(settings.sendProtocol === 'smtp' || settings.sendProtocol === 'outlook' || settings.sendProtocol === 'gmail') && (
                            <div className="em-settings-grid-2" style={{ marginTop: 8 }}>
                              <div className="em-settings-field">
                                <label className="em-field-label">Display name</label>
                                <input className="em-settings-input" value={settings.fromName} onChange={e => setSettings({ ...settings, fromName: e.target.value })} placeholder="Your name" />
                              </div>
                              <div className="em-settings-field">
                                <label className="em-field-label">From address</label>
                                <input className="em-settings-input" value={settings.fromEmail} onChange={e => setSettings({ ...settings, fromEmail: e.target.value })} placeholder="you@example.com" />
                              </div>
                            </div>
                          )}
                          <div className="em-oauth-connect-box">
                            <div className="em-oauth-row">
                              <span className="em-oauth-label">External Mail:</span>
                              {settings.sendProtocol === 'outlook' ? (
                                <Badge variant="success" className="em-oauth-status"><Icon name="check" size={13} /> Connected — sending via Outlook</Badge>
                              ) : settings.outlookStatus === 'authorized' ? (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettings({ ...settings, sendProtocol: 'outlook' })}>Switch to Outlook (Connected)</button>
                              ) : (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => connectPersonalMail('outlook')}>Connect Outlook</button>
                              )}
                              {settings.sendProtocol === 'gmail' ? (
                                <Badge variant="success" className="em-oauth-status"><Icon name="check" size={13} /> Connected — sending via Gmail</Badge>
                              ) : settings.gmailStatus === 'authorized' ? (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettings({ ...settings, sendProtocol: 'gmail' })}>Switch to Gmail (Connected)</button>
                              ) : (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => connectPersonalMail('gmail')}>Connect Gmail</button>
                              )}
                              {(settings.sendProtocol === 'outlook' || settings.sendProtocol === 'gmail') && (
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => setSettings({ ...settings, sendProtocol: 'platform' })}>Use workspace default instead</button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="users" size={16} />
                            <span>Additional Identities</span>
                          </div>
                          <p className="em-settings-hint">Send as another address (e.g. a shared team inbox) via its own SMTP credentials — pick which one a message goes out from in Compose's From field.</p>
                          <IdentityManager onChange={setIdentities} />
                        </div>
                      </div>
                    )}

                    {/* ── Filters & Blocked Tab ── */}
                    {settingsTab === 'filters' && (
                      <div className="em-settings-pane">
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="filter" size={16} />
                            <span>Filters</span>
                          </div>
                          <p className="em-settings-hint">Rules that skip the inbox, label, star, or delete matching mail automatically — applied to new mail as it arrives, and optionally to what's already here.</p>
                          <FilterManager labelDefs={labelDefs} pendingCriteria={pendingFilterCriteria} onConsumePending={() => setPendingFilterCriteria(null)} />
                        </div>
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="shield" size={16} />
                            <span>Blocked Senders &amp; Addresses</span>
                          </div>
                          <p className="em-settings-hint">Sender address, domain, or a subject keyword — matching mail is routed straight to Spam instead of Inbox. Rule-based, not an AI filter.</p>
                          <div className="em-settings-row">
                            <input className="em-settings-input" value={blocklistInput} onChange={e => setBlocklistInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBlocklistEntry(); } }}
                              placeholder="spam@example.com, badomain.com, or a keyword" />
                            <button type="button" className="btn btn-primary btn-sm" onClick={addBlocklistEntry} disabled={!blocklistInput.trim()}>
                              <Icon name="plus" size={14} />
                              <span>Block</span>
                            </button>
                          </div>
                          <div className="em-blocklist-chips">
                            {settings.spamBlocklist.map(v => (
                              <span key={v} className="em-attach-chip">
                                <span>{v}</span>
                                <button type="button" className="em-attach-chip-remove" onClick={() => removeBlocklistEntry(v)} title="Unblock">
                                  <Icon name="x" size={12} />
                                </button>
                              </span>
                            ))}
                            {settings.spamBlocklist.length === 0 && <p className="em-settings-hint">No blocked senders or keywords.</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Forwarding & POP/IMAP Tab ── */}
                    {settingsTab === 'forwarding' && (
                      <div className="em-settings-pane">
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="send" size={16} />
                            <span>Forwarding</span>
                          </div>
                          <p className="em-settings-hint">Automatically forward every new incoming message to another address.</p>
                          <div className="em-settings-row">
                            <span className="em-compose-label">Forward to</span>
                            <input className="em-settings-input" value={settings.forwardToEmail ?? ''} placeholder="another@address.com"
                              onChange={e => setSettings({ ...settings, forwardToEmail: e.target.value || null })} />
                          </div>
                          {settings.forwardToEmail && (
                            <CheckboxRow
                              title="Keep a copy in this mailbox"
                              description="Off routes forwarded mail straight out without cluttering your Inbox."
                              checked={settings.forwardKeepCopy}
                              onCheckedChange={v => setSettings({ ...settings, forwardKeepCopy: v })}
                            />
                          )}
                        </div>
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="mail" size={16} />
                            <span>POP / IMAP Access</span>
                          </div>
                          <p className="em-settings-hint">
                            IMAP connection settings live under the Accounts &amp; Sync tab — this app's simple sync has no separate auto-expunge or per-folder size-limit behavior to configure. POP retrieval is not supported.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ── Advanced Tab ── */}
                    {settingsTab === 'advanced' && (
                      <div className="em-settings-pane">
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="arrowRight" size={16} />
                            <span>Auto-advance</span>
                          </div>
                          <p className="em-settings-hint">After you archive, delete, or mark a message done, show:</p>
                          <div className="em-settings-row">
                            <span className="em-compose-label">Next view</span>
                            <Select value={settings.autoAdvance} onValueChange={v => setSettings({ ...settings, autoAdvance: v as any })}>
                              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="list">The message list</SelectItem>
                                <SelectItem value="newer">The next (newer) message</SelectItem>
                                <SelectItem value="older">The previous (older) message</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="fileText" size={16} />
                            <span>Templates</span>
                          </div>
                          <p className="em-settings-hint">Quick replies (configured in the General tab) are this app's Templates — always on, accessible directly in Compose and Reply toolbars.</p>
                        </div>
                        <div className="em-settings-section">
                          <div className="em-settings-section-hdr">
                            <Icon name="settings" size={16} />
                            <span>Keyboard shortcuts</span>
                          </div>
                          <p className="em-settings-hint">Keyboard navigation is currently using workspace standard hotkeys.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </Tabs>
              </DialogBody>
              <DialogFooter className="em-settings-footer">
                <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveSettings} disabled={settingsSaving}>
                  {settingsSaving ? 'Saving…' : 'Save settings'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <DriveFilePicker
        open={drivePickerTarget !== null}
        onOpenChange={open => { if (!open) setDrivePickerTarget(null); }}
        onPick={attachFromDrive}
        busy={drivePickerBusy}
      />

      {/* Reschedule dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reschedule email</DialogTitle>
            <DialogDescription>Pick a new date and time to send this email.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="em-reschedule-label">
              Send at
              <input
                type="datetime-local"
                className="em-reschedule-input"
                value={rescheduleValue}
                min={new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
                onChange={e => setRescheduleValue(e.target.value)}
              />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (selectedEmail) {
                const local = new Date(rescheduleValue);
                rescheduleScheduled(selectedEmail.id, local.toISOString());
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
