import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { MobileNavContext } from '../shells/WorkspaceApp.js';
import { showAlert } from '../lib/alert.js';
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
  /** Real delivery status for a Sent-folder row, joined from email_outbox —
   *  null for every other folder and for rows sent before this existed. */
  deliveryStatus?: 'pending' | 'sending' | 'sent' | 'failed' | null;
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
        deliveryStatus: e.deliveryStatus ?? null,
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
                  {(email.deliveryStatus === 'pending' || email.deliveryStatus === 'sending' || email.deliveryStatus === 'failed') && (
                    <span
                      className="em-row-label"
                      title={email.deliveryStatus === 'failed' ? 'Delivery failed — will retry automatically' : 'Queued for delivery'}
                      style={{
                        background: email.deliveryStatus === 'failed' ? 'var(--red-l, #fef2f2)' : 'var(--gold-l, #fffbeb)',
                        color: email.deliveryStatus === 'failed' ? 'var(--red, #dc2626)' : 'var(--gold, #b45309)',
                      }}
                    >
                      {email.deliveryStatus === 'failed' ? 'Failed' : 'Pending'}
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
                {aiLoading ? <Icon name="refresh" size={14} color="var(--teal)" /> : <Icon name="zap" size={14} color="var(--teal)" />}
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
              <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20, padding: 'var(--ds-btn-py) 24px', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} onClick={sendCompose}>
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
