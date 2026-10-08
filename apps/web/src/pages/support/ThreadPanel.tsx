import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { IconName } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Badge } from '../../components/ui/badge.js';
import { Tip } from '../../components/ui/tooltip.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { showAlert } from '../../lib/alert.js';
import type { ChannelId, Ticket, Message, MessageAttachment } from './shared.js';
import { PRIORITY_CFG, STATUS_CFG, CHANNEL_CFG, COMPOSER_EMOJIS, cachedSupportDriveId, setCachedSupportDriveId, relTime, channelKey, fmtAttachmentSize, Av, PBadge, SBadge, ChPill } from './shared.js';

export function ThreadPanel({ ticket, authorName, onClose, onOpenDetails, aiSuggestionToUse }: {
  ticket: Ticket;
  authorName: string; onClose: () => void; onOpenDetails?: () => void; aiSuggestionToUse?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(ticket.messages || []);
  const [sending, setSending] = useState(false);
  const [broadcastChs, setBroadcastChs] = useState<Set<ChannelId>>(new Set(['inapp'] as ChannelId[]));
  const [isNote, setIsNote] = useState(false);
  const [compose, setCompose] = useState('');
  const [emailSubj, setEmailSubj] = useState(`Re: [${ticket.ref}] ${ticket.subject}`);
  const [broadcastResult, setBroadcastResult] = useState<{ ch: string; success: boolean }[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMacros, setShowMacros] = useState(false);
  const [macros, setMacros] = useState<{ id: string; title: string; content: string }[] | null>(null);
  const [newMacroOpen, setNewMacroOpen] = useState(false);
  const [newMacroTitle, setNewMacroTitle] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<{ id: string; name: string; size: number | null; mime_type: string | null }[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 899px)');

  function loadMacros() {
    if (macros !== null) return;
    apiFetch('/v1/support/macros').then((r: any) => setMacros(Array.isArray(r) ? r : [])).catch(() => setMacros([]));
  }

  async function saveMacro() {
    if (!newMacroTitle.trim() || !compose.trim()) return;
    try {
      const macro = await apiFetch('/v1/support/macros', { method: 'POST', body: JSON.stringify({ title: newMacroTitle.trim(), content: compose }) });
      setMacros(prev => [...(prev ?? []), macro].sort((a, b) => a.title.localeCompare(b.title)));
      setNewMacroTitle('');
      setNewMacroOpen(false);
    } catch (err: any) { showAlert(err.message || 'Could not save this macro.'); }
  }

  async function deleteMacro(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await apiFetch(`/v1/support/macros/${id}`, { method: 'DELETE' });
      setMacros(prev => (prev ?? []).filter(m => m.id !== id));
    } catch (err: any) { showAlert(err.message || 'Could not delete this macro.'); }
  }

  // Attachments only apply to internal notes (see support.routes.ts PATCH
  // /tickets/:id/messages and migration 410's own header comment for why —
  // no WhatsApp/Email/SMS media-delivery integration exists yet, so
  // offering this on a customer-facing broadcast would be a fake success).
  async function handleAttach(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingAttachment(true);
    try {
      let driveId = cachedSupportDriveId;
      if (!driveId) {
        const drives = await apiFetch('/v1/drives');
        const list = Array.isArray(drives) ? drives : (drives.data ?? []);
        if (!list.length) throw new Error('No drive available to attach files to.');
        driveId = list[0].id;
        setCachedSupportDriveId(driveId);
      }
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const uploaded = await apiFetch(`/v1/files/upload?drive_id=${driveId}&entity_type=support_ticket&entity_id=${ticket.id}`, { method: 'POST', body: fd });
        setPendingAttachments(prev => [...prev, { id: uploaded.id, name: uploaded.name, size: uploaded.size, mime_type: uploaded.mime_type }]);
      }
    } catch (err: any) {
      showAlert(err.message || 'Upload failed.');
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  useEffect(() => {
    setEmailSubj(`Re: [${ticket.ref}] ${ticket.subject}`);
    setCompose('');
    setBroadcastChs(new Set(['inapp'] as ChannelId[]));
    setIsNote(false);
    setBroadcastResult([]);
  }, [ticket.id]); // eslint-disable-line

  // Real fetched thread data arrives in two waves and can keep arriving:
  // openTicket()'s own `{ ...t, messages: [] }` optimistic placeholder,
  // then the real GET /tickets/:id response once it resolves, and again
  // whenever useWebSocket's support.message_received handler re-fetches
  // this same ticket. ticket.messages is a fresh array reference each of
  // those times even though ticket.id never changes, so it can't live in
  // the [ticket.id]-only effect above without also wiping the compose
  // draft/channel selection on every WS refetch — but leaving it out
  // entirely (the bug this replaces) meant the fetched thread never
  // reached the screen at all: messages state was seeded once from
  // openTicket's empty placeholder and then never updated again, so a
  // ticket's real history (older notes included) stayed invisible no
  // matter how long the fetch had to resolve, and a just-sent message
  // that genuinely persisted server-side looked lost on the next reload.
  // Never fires from handleSend's own local optimistic append, since that
  // only calls setMessages — the ticket prop and its .messages reference
  // are untouched until the server-authoritative refetch lands, which is
  // what should supersede the local optimistic entries with real ids.
  useEffect(() => {
    setMessages(ticket.messages || []);
  }, [ticket.id, ticket.messages]);

  useEffect(() => {
    if (aiSuggestionToUse) {
      setCompose(aiSuggestionToUse);
    }
  }, [aiSuggestionToUse]);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const toggleChannel = (ch: ChannelId) => {
    if (isNote) return;
    setBroadcastChs(prev => {
      const next = new Set(prev);
      if (next.has(ch)) { if (next.size > 1) next.delete(ch); }
      else next.add(ch);
      return next;
    });
  };

  const handleSend = async () => {
    const content = compose.trim();
    if (!content || sending) return;
    setSending(true);
    setBroadcastResult([]);
    try {
      if (isNote) {
        const res: any = await apiFetch(`/v1/support/tickets/${ticket.id}/messages`, {
          method: 'POST', body: JSON.stringify({ content, channel: 'NOTE', attachment_file_ids: pendingAttachments.map(a => a.id) }),
        });
        setMessages(prev => [...prev, {
          id: `local-${Date.now()}`, content, channel: 'note',
          author_type: 'OFFICER', author_name: authorName, created_at: new Date().toISOString(),
          ...(res || {}),
        }]);
        setPendingAttachments([]);
      } else {
        const channels = Array.from(broadcastChs).map(ch => ch.toUpperCase());
        const res: any = await apiFetch(`/v1/support/tickets/${ticket.id}/broadcast`, {
          method: 'POST',
          body: JSON.stringify({ content, channels, email_subject: emailSubj, attachment_file_ids: pendingAttachments.map(a => a.id) }),
        });

        if (res?.results) {
          setBroadcastResult(res.results.map((r: any) => ({ ch: r.channel, success: r.success })));
        } else {
          setBroadcastResult(channels.map(ch => ({ ch, success: true })));
        }
        const newMsgs: Message[] = Array.from(broadcastChs).map((ch, i) => ({
          id: `local-${Date.now()}-${i}`,
          content,
          channel: ch as ChannelId,
          author_type: 'OFFICER' as const,
          author_name: authorName,
          created_at: new Date().toISOString(),
          // Only the channels the backend actually links attachments to
          // (see /broadcast's own comment) — a WhatsApp/SMS bubble showing
          // an attachment chip would claim a delivery that never happened.
          attachments: (ch === 'email' || ch === 'inapp') ? pendingAttachments : undefined,
        }));
        setMessages(prev => [...prev, ...newMsgs]);
        setPendingAttachments([]);
      }
      setCompose('');
    } catch (err: any) {
      // Leave the draft in place on failure — clearing it here (the old
      // behaviour, regardless of success or failure) meant a failed send
      // silently discarded whatever the agent had just typed.
      showAlert(err.message || 'Could not send that.');
    } finally {
      setSending(false);
    }
    setTimeout(() => setBroadcastResult([]), 5000);
  };

  const visible = messages;

  // Broadcasting to N channels genuinely creates N support_messages rows —
  // one per channel, so each channel's own delivery status (WhatsApp sent,
  // Email failed, ...) can be tracked independently, on the backend and
  // even in this same optimistic append below. Rendering each of those rows
  // as its own bubble is what showed the same "Hellow" four times in a row:
  // real data, wrong presentation. This merges adjacent rows back into one
  // bubble per actual send when they're clearly the same broadcast — same
  // officer, same text, arriving within the same request — and shows which
  // channels it reached as a row of pills instead of repeating the bubble.
  // Never merges two customer replies or two notes that just happen to
  // share text; only an OFFICER broadcast ever fans out like this.
  const groupedVisible = useMemo(() => {
    const groups: { first: Message; channels: ChannelId[] }[] = [];
    for (const m of visible) {
      const chKey = (m.channel?.toLowerCase() || 'inapp') as ChannelId;
      const last = groups[groups.length - 1];
      const lastChKey = last ? (last.first.channel?.toLowerCase() || 'inapp') as ChannelId : null;
      const canMerge = !!last
        && m.author_type === 'OFFICER' && last.first.author_type === 'OFFICER'
        && chKey !== 'note' && lastChKey !== 'note'
        && m.content === last.first.content
        && m.author_name === last.first.author_name
        && Math.abs(new Date(m.created_at).getTime() - new Date(last.first.created_at).getTime()) < 10_000;
      if (canMerge && last) {
        if (!last.channels.includes(chKey)) last.channels.push(chKey);
      } else {
        groups.push({ first: m, channels: [chKey] });
      }
    }
    return groups;
  }, [visible]);

  const canSend = compose.trim().length > 0 && !sending;
  // Attach/Insert image are real (see support.routes.ts's /broadcast) for
  // EMAIL — a genuine MIME attachment — and IN_APP — just a row + link,
  // nothing external to fake. WhatsApp has no media-message support in
  // this integration and SMS isn't MMS, so the moment either is one of the
  // selected channels, attaching would either silently drop the file for
  // that channel or (worse) look attached on a bubble that never carried
  // it — the button stays off for the whole send rather than attach
  // "mostly".
  const canAttachToBroadcast = broadcastChs.size > 0 && Array.from(broadcastChs).every(ch => ch === 'email' || ch === 'inapp');
  const BROADCAST_ORDER: ChannelId[] = ['whatsapp', 'email', 'inapp', 'sms'];

  return (
    <div className="spt-thread">
      {/* ── Thread Header ── */}
      <div className="spt-thread-hdr">
        <div className="spt-thread-hdr-left">
          {isMobile && (
            <Tip label="Back to inbox">
              <button
                type="button"
                className="spt-bedesk-icon-btn"
                onClick={onClose}
                style={{ marginRight: 2 }}
               data-ui-native-button="">
                <Icon name="arrowLeft" size={16} />
              </button>
            </Tip>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="spt-thread-customer">{ticket.customer}</span>
            <ChPill ch={channelKey(ticket.channel)} />
            <span className="spt-thread-ref">#{ticket.ref}</span>
          </div>
        </div>

        <div className="spt-thread-hdr-right">
          {/* Assignee, status, "more" actions and tags all moved into the
              always-visible Details pane (desktop) / drawer (mobile) below —
              editing them from two places at once is what this replaces.
              The one thing kept here is a way to actually *reach* that pane
              on mobile, where it's a drawer rather than a fixed 3rd column. */}
          {isMobile && (
            <Tip label="View details">
              <button type="button" className="spt-bedesk-icon-btn" onClick={onOpenDetails} data-ui-native-button="">
                <Icon name="dockRight" size={16} />
              </button>
            </Tip>
          )}
        </div>
      </div>

      {/* ── Message Flow ── */}
      <div className="spt-msgs">
        <div className="spt-date-sep">
          <span>{new Date(ticket.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </div>

        {/* This only ever covers a ticket with truly zero messages (rare —
            a brand-new, unreplied ticket). It used to also be the ONLY
            place a customer's opening inquiry on any non-WhatsApp-origin
            ticket appeared at all, because createTicketRow() saved it only
            to this row's own `description` column, never as a real
            support_messages row — so the description silently disappeared
            the moment anyone replied and this condition went false. Fixed
            at the source instead of here: createTicketRow now inserts a
            real message for it (support.routes.ts), and a one-time backfill
            did the same for every ticket already affected — so this stays
            the simple, honestly-empty-thread fallback it looks like. */}
        {visible.length === 0 && (
          <div className="spt-bedesk-msg spt-bedesk-msg--customer">
            <Av name={ticket.customer} userId={ticket.customer_id} kind="customers" size={32} />
            <div className="spt-bedesk-msg-bubble-wrap">
              <div className="spt-bedesk-msg-bubble">
                {ticket.description || ticket.subject || 'No description provided.'}
              </div>
              <div className="spt-bedesk-msg-time">
                {new Date(ticket.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        )}

        {groupedVisible.map(({ first: m, channels: sentChannels }) => {
          const ch = (m.channel?.toLowerCase() || 'inapp') as ChannelId;
          const isNoteMsg = ch === 'note';
          const isOff = m.author_type === 'OFFICER';
          const mDate = new Date(m.created_at);
          const timeLbl = mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          if (isNoteMsg) {
            return (
              <div key={m.id} className="spt-bedesk-internal-note-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gold)', fontSize: 12, fontWeight: 800 }}>
                    <Icon name="lock" size={13} />
                    <span>Internal Note</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink3)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--ink2)' }}>{m.author_name}</span>
                    <span>{timeLbl}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
                  {m.content}
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {m.attachments.map(a => (
                      <button key={a.id} type="button"
                        onClick={() => apiDownload(`/v1/files/${a.id}/download`, a.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 'var(--r)', background: 'var(--white)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11.5, color: 'var(--ink2)' }} data-ui-native-button="">
                        <Icon name={(a.mime_type || '').startsWith('image/') ? 'image' : 'paperclip'} size={12} />
                        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        {a.size != null && <span style={{ color: 'var(--ink3)' }}>({fmtAttachmentSize(a.size)})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={m.id} className={`spt-bedesk-msg ${isOff ? 'spt-bedesk-msg--officer' : 'spt-bedesk-msg--customer'}`}>
              <Av name={m.author_name} userId={m.author_id} kind={isOff ? 'people' : 'customers'} size={32} />
              <div className="spt-bedesk-msg-bubble-wrap">
                <div className="spt-bedesk-msg-bubble">
                  {m.content}
                  {isOff && <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.8, verticalAlign: 'middle' }}>✓✓</span>}
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {m.attachments.map(a => (
                      <button key={a.id} type="button"
                        onClick={() => apiDownload(`/v1/files/${a.id}/download`, a.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 'var(--r)', background: 'var(--white)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11.5, color: 'var(--ink2)' }} data-ui-native-button="">
                        <Icon name={(a.mime_type || '').startsWith('image/') ? 'image' : 'paperclip'} size={12} />
                        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        {a.size != null && <span style={{ color: 'var(--ink3)' }}>({fmtAttachmentSize(a.size)})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {/* Only shows for an actual multi-channel broadcast (see
                    groupedVisible above) — a single-channel reply keeps the
                    plain timestamp-only footer it always had. */}
                {sentChannels.length > 1 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {sentChannels.map(c => <ChPill key={c} ch={c} />)}
                  </div>
                )}
                <div className="spt-bedesk-msg-time">{timeLbl}</div>
              </div>
            </div>
          );
        })}
        <div ref={msgEndRef} />
      </div>

      {/* ── Message Composer ── */}
      <div className="spt-bedesk-composer">
        {broadcastResult.length > 0 && (() => {
          const allOk = broadcastResult.every(r => r.success);
          const anyOk = broadcastResult.some(r => r.success);
          const state = allOk ? 'success' : anyOk ? 'partial' : 'fail';
          const failed = broadcastResult.filter(r => !r.success);
          return (
            // Floats above the composer instead of the old edge-to-edge
            // banner — a toast, not an inline alert row that permanently
            // shifted the toolbar down. Successful channels reuse ChPill
            // itself — same icon-only chip + hover tooltip the message
            // bubble's own channel row now shows — so this notification and
            // the bubble it's confirming read as one visual language. A
            // failed channel gets the same treatment in red rather than a
            // separate icon+text chip shape, which no longer fits ChPill's
            // icon-only sizing now that the label moved into the tooltip.
            <div key={broadcastResult.map(r => r.ch).join(',')} className="spt-broadcast-toast" data-state={state}>
              <div className="spt-broadcast-toast-icon">
                <Icon name={allOk ? 'checkCircle' : anyOk ? 'alertCircle' : 'xCircle'} size={18} strokeWidth={2} />
              </div>
              <div className="spt-broadcast-toast-body">
                <div className="spt-broadcast-toast-label">
                  {allOk ? 'Message sent' : anyOk ? 'Sent to some channels' : 'Message failed to send'}
                </div>
                <div className="spt-broadcast-toast-chips">
                  {broadcastResult.filter(r => r.success).map(r => <ChPill key={r.ch} ch={channelKey(r.ch)} />)}
                  {failed.map(r => (
                    <Tip key={r.ch} label={`${CHANNEL_CFG[channelKey(r.ch)].label} — failed to send`}>
                      <span className="spt-ch-pill-sm spt-ch-pill-sm--fail" aria-label={`${CHANNEL_CFG[channelKey(r.ch)].label} failed`}>
                        <Icon name="x" size={11} strokeWidth={2} />
                      </span>
                    </Tip>
                  ))}
                </div>
              </div>
              <div className="spt-broadcast-toast-progress" />
            </div>
          );
        })()}

        <div className="spt-bedesk-composer-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="spt-bedesk-mode-pill active"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                 data-ui-native-button="">
                  <Icon name={isNote ? 'lock' : 'mail'} size={12} />
                  <span>{isNote ? 'Internal Note' : 'Message'}</span>
                  <Icon name="chevronDown" size={11} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setIsNote(false); if (broadcastChs.size === 0) setBroadcastChs(new Set(['inapp'])); }}>
                  <Icon name="mail" size={13} style={{ marginRight: 8 }} />
                  Message (Customer reply)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setIsNote(true); setBroadcastChs(new Set()); }}>
                  <Icon name="lock" size={13} style={{ marginRight: 8 }} />
                  Internal Note (Staff only)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!isNote && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 4, flexWrap: 'wrap' }}>
                <Tip label="All channels">
                  <button
                    type="button"
                    onClick={() => setBroadcastChs(new Set(BROADCAST_ORDER))}
                    className={`spt-bedesk-ch-chip${broadcastChs.size === BROADCAST_ORDER.length ? ' active' : ''}`}
                    aria-label="All channels"
                   data-ui-native-button="">
                    <Icon name="layers" size={13} />
                  </button>
                </Tip>
                {BROADCAST_ORDER.map(ch => {
                  const active = broadcastChs.has(ch);
                  const cfg = CHANNEL_CFG[ch];
                  return (
                    <Tip key={ch} label={cfg.label}>
                      <button
                        type="button"
                        onClick={() => toggleChannel(ch)}
                        className={`spt-bedesk-ch-chip${active ? ' active' : ''}`}
                        style={active ? { color: cfg.color, borderColor: cfg.color } : undefined}
                        aria-label={cfg.label}
                       data-ui-native-button="">
                        <Icon name={cfg.icon} size={13} />
                      </button>
                    </Tip>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="spt-bedesk-ta-wrap">
          {isNote && (
            <div className="spt-bedesk-note-badge-banner">
              <Icon name="lock" size={12} /> Internal Note — only visible to team members
            </div>
          )}
          <textarea
            rows={3}
            value={compose}
            onChange={e => setCompose(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isNote) { e.preventDefault(); handleSend(); } }}
            placeholder={isNote ? 'Write an internal note…' : 'Type your message response…'}
            className={`spt-bedesk-ta${isNote ? ' note' : ''}`}
          />
        </div>

        <div className="spt-bedesk-composer-ft">
          {pendingAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {pendingAttachments.map(a => (
                <span key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px 4px 9px', borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--ink2)' }}>
                  <Icon name={(a.mime_type || '').startsWith('image/') ? 'image' : 'paperclip'} size={12} />
                  <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <button type="button" onClick={() => setPendingAttachments(prev => prev.filter(x => x.id !== a.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, display: 'flex' }} data-ui-native-button="">
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="spt-bedesk-toolbar-icons">
            <Popover open={showEmoji} onOpenChange={setShowEmoji}>
              <Tip label="Insert Emoji">
                <PopoverTrigger asChild>
                  <button type="button" className="spt-bedesk-tb-btn" data-ui-native-button="">
                    <Icon name="smile" size={15} />
                  </button>
                </PopoverTrigger>
              </Tip>
              <PopoverContent align="start" side="top" className="w-auto p-2">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4 }}>
                  {COMPOSER_EMOJIS.map(em => (
                    <button key={em} type="button" onClick={() => { setCompose(c => c + em); setShowEmoji(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }} data-ui-native-button="">
                      {em}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={showMacros} onOpenChange={o => { setShowMacros(o); if (o) loadMacros(); else setNewMacroOpen(false); }}>
              <Tip label="Canned responses / Macros">
                <PopoverTrigger asChild>
                  <button type="button" className="spt-bedesk-tb-btn" data-ui-native-button="">
                    <Icon name="cannedResponse" size={15} />
                  </button>
                </PopoverTrigger>
              </Tip>
              <PopoverContent align="start" side="top" className="w-72 p-2">
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {macros === null && <SectionLoading size={14} style={{ padding: 10 }} />}
                  {macros !== null && macros.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--ink3)' }}>No canned responses yet.</div>}
                  {macros?.map(m => (
                    <div key={m.id} role="button" tabIndex={0}
                      onClick={() => { setCompose(c => c ? `${c}\n${m.content}` : m.content); setShowMacros(false); }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{m.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</div>
                      </div>
                      <Tip label="Delete macro">
                        <button type="button" aria-label="Delete macro" onClick={e => deleteMacro(m.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex', flexShrink: 0 }} data-ui-native-button="">
                          <Icon name="trash2" size={12} />
                        </button>
                      </Tip>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                  {newMacroOpen ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input autoFocus value={newMacroTitle} onChange={e => setNewMacroTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveMacro(); if (e.key === 'Escape') setNewMacroOpen(false); }}
                        placeholder="Macro title…" style={{ flex: 1, fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--white)', color: 'var(--ink)' }} />
                      <button type="button" onClick={saveMacro} disabled={!newMacroTitle.trim() || !compose.trim()} className="btn btn-primary btn-sm" data-ui-native-button="">Save</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setNewMacroOpen(true)} disabled={!compose.trim()}
                      title={compose.trim() ? 'Save the current message as a new canned response' : 'Type a message first'}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: compose.trim() ? 'var(--teal)' : 'var(--ink3)', fontWeight: 600, fontSize: 12, cursor: compose.trim() ? 'pointer' : 'default', padding: '6px 8px' }} data-ui-native-button="">
                      <Icon name="plus" size={13} /> Save current message as macro
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleAttach(e.target.files)} />
            <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={e => handleAttach(e.target.files)} />
            {(() => {
              const canAttach = isNote || canAttachToBroadcast;
              const label = isNote
                ? 'Attach file'
                : canAttachToBroadcast
                  ? 'Attach file'
                  : 'Attach file (only Email and the in-app channel can deliver one — switch off WhatsApp/SMS to attach)';
              const imgLabel = isNote
                ? 'Insert image'
                : canAttachToBroadcast
                  ? 'Insert image'
                  : 'Insert image (only Email and the in-app channel can deliver one — switch off WhatsApp/SMS to attach)';
              return (
                <>
                  <Tip label={label}>
                    <button type="button" className="spt-bedesk-tb-btn" disabled={!canAttach || uploadingAttachment} onClick={() => fileInputRef.current?.click()} style={!canAttach ? { opacity: 0.4, cursor: 'default' } : undefined} data-ui-native-button="">
                      <Icon name="paperclip" size={15} />
                    </button>
                  </Tip>
                  <Tip label={imgLabel}>
                    <button type="button" className="spt-bedesk-tb-btn" disabled={!canAttach || uploadingAttachment} onClick={() => imageInputRef.current?.click()} style={!canAttach ? { opacity: 0.4, cursor: 'default' } : undefined} data-ui-native-button="">
                      <Icon name="image" size={15} />
                    </button>
                  </Tip>
                </>
              );
            })()}
            <Tip label="Hudumika AI">
              <button
                type="button"
                className="spt-bedesk-tb-btn"
                onClick={() => { if (aiSuggestionToUse) setCompose(aiSuggestionToUse); }}
                style={{ color: 'var(--teal)' }}
               data-ui-native-button="">
                <Icon name="sparkle" size={15} />
              </button>
            </Tip>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={`spt-bedesk-send-btn${canSend ? ' ready' : ''}${isNote ? ' note' : ''}`}
             data-ui-native-button="">
              <span>{sending ? 'Sending…' : isNote ? 'Save note' : 'Send reply'}</span>
              {!isNote && <Icon name="chevronDown" size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
