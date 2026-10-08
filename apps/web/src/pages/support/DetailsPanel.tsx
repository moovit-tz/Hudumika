import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { OPS_ROLES } from '../../lib/permissions.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog.js';
import { Badge } from '../../components/ui/badge.js';
import { Tip } from '../../components/ui/tooltip.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { showAlert } from '../../lib/alert.js';
import type { ChannelId, StatusKey, PriorityKey, Ticket, SupportGroup } from './shared.js';
import { PRIORITY_CFG, STATUS_CFG, CHANNEL_CFG, CATEGORIES, COMPLYOS_AGENCIES, relTime, ticketOrigin, Av, PBadge, SBadge, ChPill, parseUserAgent } from './shared.js';

/** Bliss → ComplyOS bridge modal */
function SendToComplyOSModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const navigate = useNavigate();
  const [agencyCode, setAgencyCode] = useState(COMPLYOS_AGENCIES[0].code);
  const [certType, setCertType] = useState(ticket.subject);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    if (!certType.trim()) { setError('Please describe what certification/permit is needed.'); return; }
    setSending(true);
    setError('');
    try {
      const app = await apiFetch('/v1/comply/applications/from-ticket', {
        method: 'POST',
        body: JSON.stringify({ ticket_id: ticket.id, agency_code: agencyCode, cert_type: certType.trim() }),
      });
      navigate(`/complyos/applications?opened=${app.id}`);
    } catch (e: any) {
      setError(e.message || 'Could not open a ComplyOS application for this ticket.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-110 max-w-full p-0 gap-0">
        <DialogHeader style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
          <DialogTitle style={{ fontSize: 15 }}>Send to ComplyOS</DialogTitle>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Opens a draft compliance application pre-filled from this ticket — {ticket.ref}.</div>
        </DialogHeader>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Agency</label>
            <Select value={agencyCode} onValueChange={setAgencyCode}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPLYOS_AGENCIES.map(a => <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Certification / Permit Needed</label>
            <input className="input-field" value={certType} onChange={e => setCertType(e.target.value)} placeholder="e.g. Tax Compliance Certificate" />
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </div>
        <DialogFooter style={{ padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} data-ui-native-button="">Cancel</button>
          <button type="button" className="btn btn-primary" disabled={sending} onClick={handleSend} data-ui-native-button="">
            {sending ? 'Opening…' : 'Open Application'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════
   COL 4 — Details Panel (Contact Profile & Attributes)
══════════════════════════════════════════ */
function DetailsAccordion({ title, defaultOpen = true, headerAction, children }: { title: string; defaultOpen?: boolean; headerAction?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="spt-bedesk-accordion">
      {/* A <button> can't host another <button> (headerAction, when it's an
          edit icon) without invalid/nested-interactive-control markup, so
          this is a div with the same className/click-to-toggle behavior —
          headerAction's own wrapper stops the click from bubbling up to it,
          the same way the row's other click targets (Select triggers, tag
          removal) already have to. */}
      <div className="spt-bedesk-accordion-hdr" onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}>
        <span style={{ flex: 1 }}>{title}</span>
        {headerAction && (
          <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
            {headerAction}
          </span>
        )}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13} strokeWidth={2} />
      </div>
      {open && <div className="spt-bedesk-accordion-body">{children}</div>}
    </div>
  );
}

/** Every other open (or historical) ticket this same customer has raised,
 *  regardless of which app or channel created it — Support Center is meant
 *  to be the one place all of them get solved, so an agent working one
 *  ticket should immediately see the others. Real data: GET
 *  /v1/support/tickets already joins customers and supports ?customer_id=
 *  for exactly this. */
function RelatedTickets({ ticket }: { ticket: Ticket }) {
  const [related, setRelated] = useState<Ticket[] | null>(null);

  useEffect(() => {
    if (!ticket.customer_id) { setRelated([]); return; }
    let cancelled = false;
    setRelated(null);
    apiFetch(`/v1/support/tickets?customer_id=${ticket.customer_id}`)
      .then((res: any) => {
        if (cancelled) return;
        const all: Ticket[] = Array.isArray(res) ? res : (res?.data ?? []);
        setRelated(all.filter(t => t.id !== ticket.id));
      })
      .catch(() => { if (!cancelled) setRelated([]); });
    return () => { cancelled = true; };
  }, [ticket.customer_id, ticket.id]);

  if (!ticket.customer_id) return null;

  return (
    <DetailsAccordion title="Other tickets from this customer">
      {related === null ? (
        <SectionLoading size={14} style={{ padding: '4px 0' }} />
      ) : related.length === 0 ? (
        <div style={{ padding: '4px 0', fontSize: 12, color: 'var(--ink3)' }}>No other tickets from this customer yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {related.map(r => {
            const origin = ticketOrigin(r);
            const variant = r.status === 'OPEN' ? 'brand' : r.status === 'IN_PROGRESS' ? 'warning' : r.status === 'RESOLVED' ? 'success' : 'gray';
            return (
              <Link
                key={r.id}
                to={`/bliss/inbox?id=${r.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</span>
                  <Badge variant={variant}>{STATUS_CFG[r.status]?.label ?? 'Open'}</Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 11, color: 'var(--ink3)' }}>
                  <Icon name={origin.icon} size={11} strokeWidth={1.75} />
                  <span>{origin.label} · {relTime(r.updated_at || r.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DetailsAccordion>
  );
}

/** Backing the Conversation Attributes panel's "Edit" button — subject,
 *  category and priority, the three fields set at ticket-creation time that
 *  previously had no update path anywhere in the app (see
 *  support.routes.ts PATCH /tickets/:id/attributes). Status/assignee are
 *  edited inline elsewhere on this same page and aren't duplicated here. */
function EditAttributesDialog({ open, onClose, ticket, onSave }: {
  open: boolean; onClose: () => void; ticket: Ticket;
  onSave: (id: string, attrs: { subject?: string; category?: string; priority?: PriorityKey }) => Promise<void>;
}) {
  const [subject, setSubject] = useState(ticket.subject);
  const [category, setCategory] = useState(ticket.category);
  const [priority, setPriority] = useState<PriorityKey>(ticket.priority);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSubject(ticket.subject);
      setCategory(ticket.category);
      setPriority(ticket.priority);
      setError('');
    }
  }, [open, ticket.subject, ticket.category, ticket.priority]);

  async function handleSave() {
    if (!subject.trim()) { setError('Subject cannot be empty.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(ticket.id, { subject: subject.trim(), category, priority });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-105 max-w-full p-0 gap-0">
        <DialogHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
          <DialogTitle style={{ fontSize: 15 }}>Edit conversation attributes</DialogTitle>
        </DialogHeader>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Subject</label>
            <input
              className="input-field"
              value={subject}
              onChange={e => { setSubject(e.target.value); if (error) setError(''); }}
              maxLength={300}
              style={error ? { borderColor: 'var(--red)' } : undefined}
              aria-invalid={!!error}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>Priority</label>
            <Select value={priority === 'NORMAL' ? 'MEDIUM' : priority} onValueChange={v => setPriority(v as PriorityKey)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </div>
        <DialogFooter style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving} data-ui-native-button="">Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave} data-ui-native-button="">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DetailsPanel({ ticket, agents, onReassign, onStatusChange, onUpdateTags, onUpdateAttributes, groups, onUpdateGroup, onClose }: {
  ticket: Ticket; agents: { id: string; name: string }[]; onReassign: (id: string, assigneeId: string) => void;
  onStatusChange: (id: string, s: StatusKey) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onUpdateAttributes: (id: string, attrs: { subject?: string; category?: string; priority?: PriorityKey }) => Promise<void>;
  groups: SupportGroup[];
  onUpdateGroup: (id: string, groupId: string | null) => void;
  onClose?: () => void;
}) {
  const { user } = useAuth();
  // Assignee/status/group are day-to-day ticket-ops actions — gated to real
  // working staff (OPS_ROLES: SENIOR/JUNIOR/OFFICER and up), not blanket-open
  // to whoever can merely load this page. Tags stay ungated below; they're
  // not a workflow-control field the way ownership/state/queue are.
  const canEdit = OPS_ROLES.includes(user?.role as any);
  const [editOpen, setEditOpen] = useState(false);
  const [showComplyModal, setShowComplyModal] = useState(false);
  const currentAssigneeId = agents.find(a => a.name === ticket.assigned_to)?.id ?? '__unassigned__';
  const currentGroupId = ticket.group_id ?? '__none__';
  // Derived straight from the real ticket, not local state — this editor
  // used to only ever call setState, so every tag an agent added vanished
  // on the next load having never reached the database (see PATCH
  // /tickets/:id/tags). Deriving from the prop keeps it honestly in sync
  // with what's actually saved.
  const tags = ticket.tags ?? [];
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        onUpdateTags(ticket.id, [...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (t: string) => {
    onUpdateTags(ticket.id, tags.filter(item => item !== t));
  };

  return (
    <div className="spt-bedesk-details">
      <div className="spt-bedesk-details-hdr">
        <span className="spt-bedesk-details-title">Details</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <DropdownMenu>
            <Tip label="More options">
              <DropdownMenuTrigger asChild>
                <button type="button" className="spt-bedesk-icon-btn" data-ui-native-button="">
                  <Icon name="moreVertical" size={16} />
                </button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowComplyModal(true)}>
                <Icon name="shield" size={13} style={{ marginRight: 8 }} />
                Send to ComplyOS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(ticket.ref)}>
                <Icon name="copy" size={13} style={{ marginRight: 8 }} />
                Copy Reference
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onClose && (
            <Tip label="Close details">
              <button type="button" className="spt-bedesk-icon-btn" onClick={onClose} data-ui-native-button="">
                <Icon name="dockRight" size={15} />
              </button>
            </Tip>
          )}
        </div>
      </div>
      <div className="spt-details-scroll">
        {/* Profile Card */}
        <div className="spt-bedesk-profile-card">
          <div className="spt-bedesk-profile-av-wrap">
            <Av name={ticket.customer} userId={ticket.customer_id} kind="customers" size={48} />
          </div>
          <div className="spt-bedesk-profile-info">
            <div className="spt-bedesk-profile-name">{ticket.customer}</div>
            <div className="spt-bedesk-profile-sub">
              {ticket.customer_company || ticket.customer_email || ticket.customer_phone || 'gb, London'}
            </div>
            <div className="spt-bedesk-profile-time">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} local time
            </div>
          </div>
        </div>

        {/* Quick Selectors: Assignee, Status, Group, Tags — Assignee/Status/
            Group are real workflow-control actions (who owns this, what
            state it's in, which queue), so they render read-only for anyone
            below OPS_ROLES rather than an editable Select they could act on
            without the access to actually own the outcome. Tags stay open
            to anyone below — labeling a conversation isn't a control action
            the way reassigning or closing it is. */}
        <div className="spt-bedesk-quick-attrs">
          <div className="spt-bedesk-attr-row">
            <span className="spt-bedesk-attr-lbl">Assignee</span>
            <div className="spt-bedesk-attr-val">
              {canEdit ? (
                <Select value={currentAssigneeId} onValueChange={v => v !== '__unassigned__' && onReassign(ticket.id, v)}>
                  <SelectTrigger className="spt-bedesk-val-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="paw" size={13} /> Unassigned
                      </span>
                    </SelectItem>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Av name={a.name} userId={a.id} kind="people" size={16} /> {a.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="spt-bedesk-readonly-val">
                  {ticket.assigned_to ? <><Av name={ticket.assigned_to} userId={ticket.assigned_to_id} kind="people" size={16} /> {ticket.assigned_to}</> : <><Icon name="paw" size={13} /> Unassigned</>}
                </span>
              )}
            </div>
          </div>

          <div className="spt-bedesk-attr-row">
            <span className="spt-bedesk-attr-lbl">Status</span>
            <div className="spt-bedesk-attr-val">
              {canEdit ? (
                <Select value={ticket.status} onValueChange={v => onStatusChange(ticket.id, v as StatusKey)}>
                  <SelectTrigger className={`spt-status-select spt-status-select--${ticket.status.toLowerCase().replace('_', '-')}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CFG) as StatusKey[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="spt-bedesk-readonly-val">
                  <Badge style={{ background: STATUS_CFG[ticket.status]?.bg, color: STATUS_CFG[ticket.status]?.color }}>
                    {STATUS_CFG[ticket.status]?.label || ticket.status}
                  </Badge>
                </span>
              )}
            </div>
          </div>

          <div className="spt-bedesk-attr-row">
            <span className="spt-bedesk-attr-lbl">Group</span>
            <div className="spt-bedesk-attr-val">
              {canEdit ? (
                <Select value={currentGroupId} onValueChange={v => onUpdateGroup(ticket.id, v === '__none__' ? null : v)}>
                  <SelectTrigger className="spt-bedesk-val-select">
                    <SelectValue>
                      <span className="spt-bedesk-group-pill">
                        <span className="spt-bedesk-group-dot" style={{ background: ticket.group_color || '#06b6d4' }} />
                        <span>{ticket.group_name || 'General'}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} /> General
                      </span>
                    </SelectItem>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color || '#06b6d4' }} /> {g.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="spt-bedesk-readonly-val">
                  <span className="spt-bedesk-group-pill">
                    <span className="spt-bedesk-group-dot" style={{ background: ticket.group_color || '#06b6d4' }} />
                    <span>{ticket.group_name || 'General'}</span>
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="spt-bedesk-tags-block">
            <div className="spt-bedesk-tags-wrap">
              {tags.map(t => (
                <span key={t} className="spt-bedesk-tag-chip">
                  <span>{t}</span>
                  <button type="button" onClick={() => removeTag(t)} data-ui-native-button="">
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="+ add tag…"
              className="spt-bedesk-tag-input"
            />
          </div>
        </div>

        {/* 1. Conversation Attributes Accordion */}
        <DetailsAccordion
          title="Conversation attributes"
          headerAction={canEdit && (
            <Tip label="Edit subject, category & priority">
              <button type="button" onClick={() => setEditOpen(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, marginRight: 2 }} data-ui-native-button="">
                <Icon name="edit" size={13} />
              </button>
            </Tip>
          )}
        >
          <div className="spt-bedesk-kv-grid">
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Type:</span>
              <span className="spt-bedesk-v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="chatBubble" size={12} />
                <span>Chat</span>
              </span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">ID:</span>
              <span className="spt-bedesk-v spt-mono">{ticket.ref}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Started:</span>
              <span className="spt-bedesk-v">{relTime(ticket.created_at)}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Last activity:</span>
              <span className="spt-bedesk-v">{relTime(ticket.updated_at || ticket.created_at)}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Channel:</span>
              <span className="spt-bedesk-v">
                <Icon name={ticketOrigin(ticket).icon} size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                {ticketOrigin(ticket).label}
              </span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Category:</span>
              <span className="spt-bedesk-v">{ticket.category}</span>
            </div>
            <div className="spt-bedesk-kv-row">
              <span className="spt-bedesk-k">Priority:</span>
              <span className="spt-bedesk-v"><PBadge p={ticket.priority} /></span>
            </div>
          </div>
        </DetailsAccordion>

        <EditAttributesDialog open={editOpen} onClose={() => setEditOpen(false)} ticket={ticket} onSave={onUpdateAttributes} />
        {showComplyModal && (
          <SendToComplyOSModal ticket={ticket} onClose={() => setShowComplyModal(false)} />
        )}

        {/* 2. Other tickets from this customer — real, cross-app: whatever
            app raised them (SEAL, ClearOS, Workflow Studio, Onsite, or
            straight in Bliss), this is the one place they all surface, via
            the same ?customer_id= filter GET /v1/support/tickets already
            supports. This used to be a "Recent conversations" accordion
            showing the same hardcoded "Hi, I have a question..." text on
            every ticket — this is its real replacement, not a deletion. */}
        <RelatedTickets ticket={ticket} />

        {/* 3. Technology — the requester's real IP/User-Agent, captured at
            ticket-creation time (see migration 407 and createTicketRow).
            Only present for tickets raised through a live HTTP request —
            automation-raised tickets (SEAL/ClearOS/Studio) have no browser
            at all, and say so honestly instead of showing a fingerprint
            that was never real. */}
        <DetailsAccordion title="Technology">
          {ticket.origin_ip || ticket.origin_user_agent ? (
            <div className="spt-bedesk-kv-grid">
              {ticket.origin_ip && (
                <div className="spt-bedesk-kv-row">
                  <span className="spt-bedesk-k">IP address:</span>
                  <span className="spt-bedesk-v spt-mono">{ticket.origin_ip}</span>
                </div>
              )}
              {ticket.origin_user_agent && (() => {
                const { browser, os, device } = parseUserAgent(ticket.origin_user_agent);
                const isApple = os.toLowerCase().includes('ios') || os.toLowerCase().includes('mac');
                const isWindows = os.toLowerCase().includes('win');
                const isAndroid = os.toLowerCase().includes('android');
                const osIcon: IconName = isApple ? 'apple' : isWindows ? 'windows' : isAndroid ? 'android' : 'monitor';
                return (
                  <>
                    <div className="spt-bedesk-kv-row">
                      <span className="spt-bedesk-k">Platform:</span>
                      <span className="spt-bedesk-v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={osIcon} size={12} />
                        <span>{os}</span>
                      </span>
                    </div>
                    <div className="spt-bedesk-kv-row">
                      <span className="spt-bedesk-k">Browser:</span>
                      <span className="spt-bedesk-v">{browser}</span>
                    </div>
                    <div className="spt-bedesk-kv-row">
                      <span className="spt-bedesk-k">Device:</span>
                      <span className="spt-bedesk-v">{device}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div style={{ padding: '4px 0', fontSize: 12, color: 'var(--ink3)' }}>
              {(ticket.channel || '').toUpperCase() === 'SYSTEM'
                ? 'Not applicable — raised automatically, no browser involved.'
                : 'No device information captured for this ticket.'}
            </div>
          )}
        </DetailsAccordion>

        {/* Related Shipments */}
        {(ticket.related_shipments?.length ?? 0) > 0 && (
          <DetailsAccordion title="Related shipments">
            {ticket.related_shipments!.map(ref => (
              <Link key={ref} className="spt-shipment-btn" to={`/shipments?search=${ref}`}>
                <Icon name="package" size={12} strokeWidth={1.75} />
                <span className="spt-mono">{ref}</span>
                <Icon name="externalLink" size={11} strokeWidth={1.75} />
              </Link>
            ))}
          </DetailsAccordion>
        )}
      </div>
    </div>
  );
}
