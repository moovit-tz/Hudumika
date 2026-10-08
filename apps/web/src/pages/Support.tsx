import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { apiFetch, apiDownload } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { OPS_ROLES } from '../lib/permissions.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { Icon } from '../components/Icon.js';
import { PageLoading, SectionLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import '../pages/Bliss.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Badge } from '../components/ui/badge.js';
import { Tip } from '../components/ui/tooltip.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuCheckboxItem } from '../components/ui/dropdown-menu.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { showAlert } from '../lib/alert.js';

// -- group file imports -------------------------------------------------------
import type { ChannelId, StatusKey, PriorityKey, Ticket, SupportGroup, SupportView, Message, MessageAttachment, ViewMode, SysCustomer } from './support/shared.js';
import { PRIORITY_CFG, STATUS_CFG, CHANNEL_CFG, relTime, channelKey, ticketOrigin, Av, PBadge, SBadge, ChPill, CATEGORIES, sortTickets, sortByPriority } from './support/shared.js';
import { ConvList } from './support/ConvList.js';
import { ThreadPanel } from './support/ThreadPanel.js';
import { DetailsPanel } from './support/DetailsPanel.js';
// -- re-exports for external callers ------------------------------------------
export type { ViewMode } from './support/shared.js';

/* ══════════════════════════════════════════
   Main Support Component
══════════════════════════════════════════ */
export const Support: React.FC<{
  initialChannelFilter?: 'all' | ChannelId; queueMode?: boolean;
  viewMode?: ViewMode; onViewModeChange?: (v: ViewMode) => void;
}> = ({ initialChannelFilter, queueMode, viewMode: viewModeProp, onViewModeChange }) => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const [aiSuggestionToUse, setAiSuggestionToUse] = useState('');
  const [custMap, setCustMap] = useState<Map<string, SysCustomer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({ subject: '', customer: '', customer_id: '', category: '', priority: 'MEDIUM', description: '' });
  const [groups, setGroups] = useState<SupportGroup[]>([]);
  const [views, setViews] = useState<SupportView[]>([]);

  const loadGroups = useCallback(() => {
    apiFetch('/v1/support/groups').then((r: any) => setGroups(r || [])).catch(() => { });
  }, []);
  const loadViews = useCallback(() => {
    apiFetch('/v1/support/views').then((r: any) => setViews(r || [])).catch(() => { });
  }, []);
  useEffect(() => { loadGroups(); loadViews(); }, [loadGroups, loadViews]);

  const createGroup = useCallback(async (name: string) => {
    try { await apiFetch('/v1/support/groups', { method: 'POST', body: JSON.stringify({ name }) }); loadGroups(); }
    catch (err: any) { showAlert(err.message || 'Could not create that group.'); }
  }, [loadGroups]);
  const createView = useCallback(async (name: string, filters: Record<string, any>) => {
    try { await apiFetch('/v1/support/views', { method: 'POST', body: JSON.stringify({ name, filters }) }); loadViews(); }
    catch (err: any) { showAlert(err.message || 'Could not create that view.'); }
  }, [loadViews]);
  const deleteView = useCallback(async (id: string) => {
    try { await apiFetch(`/v1/support/views/${id}`, { method: 'DELETE' }); loadViews(); }
    catch (err: any) { showAlert(err.message || 'Could not delete that view.'); }
  }, [loadViews]);

  useEffect(() => {
    apiFetch('/v1/customers')
      .then((r: any) => {
        const list: SysCustomer[] = r.data ?? r ?? [];
        const m = new Map<string, SysCustomer>();
        list.forEach(c => { m.set(c.id, c); m.set(c.name.toLowerCase(), c); });
        setCustMap(m);
      })
      .catch(() => { });
  }, []);

  // This used to paper over any blank field on a real ticket with specific,
  // realistic-looking fabricated content — a subject ("Website slow loading
  // times issue"), a description and customer name (SEAL/Kilimanjaro
  // Builders, copied from one real automation-raised ticket seen once
  // during testing), an assignee ("Asha Mwinyi"), and default tags/group.
  // A ticket missing one of these fields now shows an honest empty value —
  // every other cell already renders those correctly ("Unassigned", no tag
  // pills, etc.) — rather than a fake value indistinguishable from real data.
  const buildTickets = useCallback((data: any[]): Ticket[] => {
    return data.map((s: any) => ({
      id: s.id,
      ref: s.ref || s.ref_number || `TKT-${s.id?.slice(0, 4)}`,
      subject: s.subject || '(No subject)',
      description: s.description ?? undefined,
      customer: s.customer ?? 'Unknown customer',
      customer_id: s.customer_id,
      customer_email: s.customer_email,
      customer_phone: s.customer_phone,
      customer_company: s.customer_company,
      category: s.category || 'General Query',
      status: (s.status as StatusKey) || 'OPEN',
      priority: (s.priority as PriorityKey) || 'NORMAL',
      assigned_to: s.assigned_to || undefined,
      created_at: s.created_at || new Date().toISOString(),
      updated_at: s.updated_at || s.created_at || new Date().toISOString(),
      message_count: s.message_count || 0,
      tags: s.tags ?? [],
      group_id: s.group_id ?? null,
      group_name: s.group_name ?? null,
      group_color: s.group_color ?? null,
      source_app: s.source_app ?? null,
      sla_deadline: s.sla_deadline ?? null,
      channel: s.channel ?? 'IN_APP',
    }));
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshTickets = useCallback(() => {
    return apiFetch('/v1/support/tickets')
      .then((r: any) => {
        const data = r.data ?? r ?? [];
        setTickets(Array.isArray(data) ? buildTickets(data) : []);
        setLoadError(null);
      })
      .catch((err: any) => {
        setTickets([]);
        setLoadError(err?.message || 'Could not load tickets');
      })
      .finally(() => setLoading(false));
  }, [buildTickets]);

  useEffect(() => { refreshTickets(); }, [refreshTickets]);

  const [feedbackTicketId, setFeedbackTicketId] = useState<string | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const openTicket = (t: Ticket) => {
    setAiSuggestionToUse('');
    setDetailsOpen(false);

    setSelected({ ...t, messages: [] });
    apiFetch(`/v1/support/tickets/${t.id}`)
      .then((res: any) => {
        if (res) {
          setSelected(prev => prev?.id === t.id ? { ...prev, messages: res.messages, origin_ip: res.origin_ip, origin_user_agent: res.origin_user_agent } : prev);
        }
      })
      .catch(() => { });
  };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || tickets.length === 0) return;
    const match = tickets.find(t => t.id === id);
    if (match) openTicket(match);
    setSearchParams(prev => { prev.delete('id'); return prev; }, { replace: true });
  }, [searchParams, tickets]);

  useWebSocket((event) => {
    if (event.type !== 'support.message_received') return;
    refreshTickets();
    setSelected(prev => {
      if (!prev || prev.id !== event.ticketId) return prev;
      apiFetch(`/v1/support/tickets/${event.ticketId}`)
        .then((res: any) => {
          if (res) setSelected(cur => cur?.id === event.ticketId ? { ...cur, messages: res.messages } : cur);
        })
        .catch(() => { });
      return prev;
    });
  });

  const updateStatus = async (id: string, status: StatusKey) => {
    if (status === 'RESOLVED' || status === 'CLOSED') {
      setFeedbackTicketId(id);
    } else {
      try {
        await apiFetch(`/v1/support/tickets/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
      } catch (err: any) {
        // Applying the new status locally regardless of whether the PATCH
        // actually succeeded (the old behaviour) left the UI showing a
        // status the database never had — a real desync, not a cosmetic one,
        // since the next full reload would silently snap it back.
        showAlert(err.message || 'Could not update this ticket\'s status.');
        return;
      }
      setTickets(ts => ts.map(t => t.id === id ? { ...t, status } : t));
      setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
    }
  };

  // No fabricated fallback roster — assigning a ticket to a fake agent id
  // (e.g. 'admin-3') would silently write a broken reference into
  // assigned_to. An empty/failed load just means the Assignee dropdown
  // offers "Unassigned" only, which is the honest state.
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    apiFetch('/v1/support/agents')
      .then((r: any) => setAgents(Array.isArray(r) ? r : []))
      .catch(() => setAgents([]));
  }, []);

  const reassignTicket = async (id: string, assigneeId: string) => {
    const current = tickets.find(t => t.id === id);
    if (!current) return;
    const agentName = agents.find(a => a.id === assigneeId)?.name;
    try {
      await apiFetch(`/v1/support/tickets/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: current.status, assigned_to: assigneeId }),
      });
    } catch (err: any) { showAlert(err.message || 'Could not reassign this ticket.'); return; }
    setTickets(ts => ts.map(t => t.id === id ? { ...t, assigned_to: agentName } : t));
    setSelected(prev => prev?.id === id ? { ...prev, assigned_to: agentName } : prev);
  };

  const updateTicketTags = async (id: string, tags: string[]) => {
    try {
      await apiFetch(`/v1/support/tickets/${id}/tags`, { method: 'PATCH', body: JSON.stringify({ tags }) });
    } catch (err: any) { showAlert(err.message || 'Could not update tags.'); return; }
    setTickets(ts => ts.map(t => t.id === id ? { ...t, tags } : t));
    setSelected(prev => prev?.id === id ? { ...prev, tags } : prev);
  };

  // Category/priority/subject — previously nowhere to save this, see
  // support.routes.ts PATCH /tickets/:id/attributes.
  const updateTicketAttributes = async (id: string, attrs: { subject?: string; category?: string; priority?: PriorityKey }) => {
    await apiFetch(`/v1/support/tickets/${id}/attributes`, { method: 'PATCH', body: JSON.stringify(attrs) });
    setTickets(ts => ts.map(t => t.id === id ? { ...t, ...attrs } : t));
    setSelected(prev => prev?.id === id ? { ...prev, ...attrs } : prev);
  };

  // Group had a real backend endpoint (PATCH /tickets/:id/group) with no
  // frontend caller anywhere — the Details panel showed it as a read-only
  // pill next to an Assignee row that was already a real, editable Select.
  const updateTicketGroup = async (id: string, groupId: string | null) => {
    try {
      await apiFetch(`/v1/support/tickets/${id}/group`, { method: 'PATCH', body: JSON.stringify({ group_id: groupId }) });
    } catch (err: any) { showAlert(err.message || 'Could not update this ticket\'s group.'); return; }
    const g = groupId ? groups.find(x => x.id === groupId) : null;
    const patch = { group_id: groupId, group_name: g?.name ?? null, group_color: g?.color ?? null };
    setTickets(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    setSelected(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  };

  // Bulk versions for ConvList's own selection bar — loop the same
  // per-ticket endpoints rather than a new bulk API. Deliberately call
  // apiFetch directly instead of reassignTicket/updateTicketGroup/
  // updateStatus: those already show their own alert (and, for status,
  // updateStatus special-cases RESOLVED/CLOSED into opening the single-
  // ticket NPS/CSAT modal, which makes no sense fired N times over a bulk
  // selection) — running them under Promise.allSettled would both
  // double-alert on failure and hide real per-item failures behind their
  // own internal catch. One combined success/failure summary here instead,
  // then a single refreshTickets() to resync whatever actually changed.
  async function bulkApply(ids: string[], run: (id: string) => Promise<unknown>, verb: string) {
    const results = await Promise.allSettled(ids.map(run));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) showAlert(`${verb}: ${ids.length - failed} of ${ids.length} succeeded, ${failed} failed.`);
    refreshTickets();
  }
  const bulkUpdateStatus = (ids: string[], status: StatusKey) =>
    bulkApply(ids, id => apiFetch(`/v1/support/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }), 'Bulk status update');
  const bulkReassign = (ids: string[], assigneeId: string) =>
    bulkApply(ids, id => apiFetch(`/v1/support/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: tickets.find(t => t.id === id)?.status ?? 'OPEN', assigned_to: assigneeId }) }), 'Bulk assign');
  const bulkUpdateGroup = (ids: string[], groupId: string | null) =>
    bulkApply(ids, id => apiFetch(`/v1/support/tickets/${id}/group`, { method: 'PATCH', body: JSON.stringify({ group_id: groupId }) }), 'Bulk group update');

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackTicketId || npsScore === null || csatScore === null || submittingFeedback) return;
    setSubmittingFeedback(true);
    try {
      await apiFetch(`/v1/support/tickets/${feedbackTicketId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({
          nps_score: npsScore,
          csat_score: csatScore,
          feedback_text: feedbackText,
        }),
      });

      setTickets(ts => ts.map(t => t.id === feedbackTicketId ? { ...t, status: 'CLOSED' } : t));
      setSelected(prev => prev?.id === feedbackTicketId ? { ...prev, status: 'CLOSED' } : prev);

      setFeedbackTicketId(null);
      setNpsScore(null);
      setCsatScore(null);
      setFeedbackText('');
    } catch (err: any) {
      // This modal is deliberately non-dismissible (see its own comment
      // below) — a console-only failure used to leave an agent staring at
      // an unresponsive Submit button with no idea why.
      showAlert(err.message || 'Could not submit this feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleCancelFeedback = async () => {
    if (!feedbackTicketId) return;
    try {
      await apiFetch(`/v1/support/tickets/${feedbackTicketId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setTickets(ts => ts.map(t => t.id === feedbackTicketId ? { ...t, status: 'CLOSED' } : t));
      setSelected(prev => prev?.id === feedbackTicketId ? { ...prev, status: 'CLOSED' } : prev);
    } catch (err: any) {
      // Used to close the modal regardless — the ticket stayed OPEN/
      // IN_PROGRESS in the database while the UI acted as if "Skip &
      // Resolve" had worked.
      showAlert(err.message || 'Could not close this ticket. Please try again.');
      return;
    }
    setFeedbackTicketId(null);
  };

  const [creating, setCreating] = useState(false);
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res: any = await apiFetch('/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: newForm.customer_id || undefined,
          subject: newForm.subject,
          description: newForm.description,
          channel: 'IN_APP',
          priority: newForm.priority,
          category: newForm.category || 'General Query',
        })
      });
      // POST returns the raw support_tickets row (no customer join), so the
      // display name comes from what the agent actually typed — real data
      // from the create form, not a fabricated default like buildTickets'
      // own fallback would otherwise substitute for a still-empty response.
      const [created] = buildTickets([{ ...res, customer: newForm.customer, messages: [] }]);
      setTickets(prev => [created, ...prev]);
      setShowCreate(false);
      setNewForm({ subject: '', customer: '', customer_id: '', category: '', priority: 'MEDIUM', description: '' });
    } catch (err: any) {
      showAlert(err?.message || 'Could not create this ticket — please try again.');
    } finally {
      setCreating(false);
    }
  };

  const [localViewMode, setLocalViewMode] = useState<ViewMode>(() => (localStorage.getItem('bliss_tix_view') as ViewMode) || 'chat');
  const viewMode = viewModeProp ?? localViewMode;
  const setViewMode = (v: ViewMode) => {
    localStorage.setItem('bliss_tix_view', v);
    setLocalViewMode(v);
    onViewModeChange?.(v);
  };
  const custNames = Array.from(new Set(tickets.map(t => t.customer))).sort();

  if (loading) return (
    <div className="spt-shell spt-shell--loading"><PageLoading /></div>
  );

  return (
    <div className={`spt-shell ${selected ? 'spt-shell--has-selection' : ''}`}>
      {loadError && (
        <div style={{ padding: '10px 16px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alertTriangle" size={16} />
          Couldn't load tickets from the server: {loadError}
        </div>
      )}

      {isDesktop ? (
        <PanelGroup direction="horizontal" className="spt-shell-panels">
          <ConvList
            tickets={tickets} selected={selected}
            onSelect={(t) => { openTicket(t); if (viewMode === 'table') setViewMode('chat'); }}
            onNew={() => setShowCreate(true)}
            groups={groups} views={views}
            onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
            isDesktop={true}
            initialChannelFilter={initialChannelFilter} queueMode={queueMode}
            agents={agents}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onBulkStatus={bulkUpdateStatus} onBulkAssign={bulkReassign} onBulkGroup={bulkUpdateGroup}
          />

          {viewMode === 'chat' && (
            <>
              <PanelResizeHandle className="spt-resize-handle" />

              <Panel minSize={32} className="spt-thread-panel">
                {selected ? (
                  <ThreadPanel ticket={selected}
                    authorName={user?.name || 'Support Agent'} onClose={() => setSelected(null)}
                    onOpenDetails={() => setDetailsOpen(o => !o)}
                    aiSuggestionToUse={aiSuggestionToUse} />
                ) : (
                  <div className="spt-thread" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <Icon name="inbox" size={48} strokeWidth={1} color="var(--border)" />
                      <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>No conversation selected</div>
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink3)' }}>Select a conversation from the left to view details and reply.</div>
                    </div>
                  </div>
                )}
              </Panel>

              {selected && (
                <>
                  <PanelResizeHandle className="spt-resize-handle" />
                  <Panel defaultSize={26} minSize={20} maxSize={38} className="spt-details-panel">
                    <div className="spt-rcol" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <DetailsPanel ticket={selected} agents={agents} onReassign={reassignTicket} onStatusChange={updateStatus} onUpdateTags={updateTicketTags} onUpdateAttributes={updateTicketAttributes} groups={groups} onUpdateGroup={updateTicketGroup} onClose={() => setSelected(null)} />
                    </div>
                  </Panel>
                </>
              )}
            </>
          )}
        </PanelGroup>
      ) : (
        <>
          {viewMode === 'table' ? (
            <ConvList
              tickets={tickets} selected={selected}
              onSelect={(t) => { openTicket(t); setViewMode('chat'); }} onNew={() => setShowCreate(true)}
              groups={groups} views={views}
              onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
              initialChannelFilter={initialChannelFilter} queueMode={queueMode}
              agents={agents}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBulkStatus={bulkUpdateStatus} onBulkAssign={bulkReassign} onBulkGroup={bulkUpdateGroup}
            />
          ) : !selected ? (
            <ConvList
              tickets={tickets} selected={selected}
              onSelect={openTicket} onNew={() => setShowCreate(true)}
              groups={groups} views={views}
              onCreateGroup={createGroup} onCreateView={createView} onDeleteView={deleteView}
              initialChannelFilter={initialChannelFilter} queueMode={queueMode}
              agents={agents}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBulkStatus={bulkUpdateStatus} onBulkAssign={bulkReassign} onBulkGroup={bulkUpdateGroup}
            />
          ) : (
            <ThreadPanel ticket={selected}
              authorName={user?.name || 'Support Agent'} onClose={() => setSelected(null)}
              onOpenDetails={() => setDetailsOpen(true)}
              aiSuggestionToUse={aiSuggestionToUse} />
          )}
          {selected && detailsOpen && createPortal(
            <>
              <div className="spt-details-backdrop" onClick={() => setDetailsOpen(false)} />
              <div className="spt-details-drawer">
                <Tip label="Close">
                  <button type="button" className="spt-icon-btn spt-details-drawer-close" onClick={() => setDetailsOpen(false)} data-ui-native-button="">
                    <Icon name="x" size={16} strokeWidth={2} />
                  </button>
                </Tip>
                <DetailsPanel ticket={selected} agents={agents} onReassign={reassignTicket} onStatusChange={updateStatus} onUpdateTags={updateTicketTags} onUpdateAttributes={updateTicketAttributes} groups={groups} onUpdateGroup={updateTicketGroup} onClose={() => setDetailsOpen(false)} />
              </div>
            </>,
            document.body
          )}
        </>
      )}

      {/* New ticket modal */}
      {showCreate && (
        <Dialog open onOpenChange={o => { if (!o) setShowCreate(false); }}>
          <DialogContent className="spt-modal">
            <DialogHeader className="spt-modal-hdr">
              <DialogTitle className="spt-modal-title">New Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="spt-modal-form">
              <div className="spt-modal-field">
                <label className="spt-modal-label">Subject *</label>
                <input required className="spt-modal-input" value={newForm.subject}
                  onChange={e => setNewForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief summary of the issue" />
              </div>
              <div className="spt-modal-grid">
                <div className="spt-modal-field">
                  <label className="spt-modal-label">Customer *</label>
                  <input required list="cust-list" className="spt-modal-input" value={newForm.customer}
                    onChange={e => { const v = e.target.value; const m = custMap.get(v.toLowerCase()); setNewForm(p => ({ ...p, customer: v, customer_id: m?.id || '' })); }}
                    placeholder="Customer name" />
                  <datalist id="cust-list">{custNames.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="spt-modal-field">
                  <label className="spt-modal-label">Priority</label>
                  <Select value={newForm.priority} onValueChange={v => setNewForm(p => ({ ...p, priority: v }))}>
                    <SelectTrigger aria-label="Priority" className="spt-modal-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="spt-modal-field">
                <label className="spt-modal-label">Category</label>
                <Select value={newForm.category || '__none__'} onValueChange={v => setNewForm(p => ({ ...p, category: v === '__none__' ? '' : v }))}>
                  <SelectTrigger aria-label="Category" className="spt-modal-select"><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select category…</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="spt-modal-field">
                <label className="spt-modal-label">Description</label>
                <textarea rows={3} className="spt-modal-textarea" value={newForm.description}
                  onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Detailed message or initial inquiry…" />
              </div>
              <div className="spt-modal-actions">
                <button type="button" className="spt-modal-cancel" onClick={() => setShowCreate(false)} disabled={creating} data-ui-native-button="">Cancel</button>
                <button type="submit" className="spt-modal-submit" disabled={creating} data-ui-native-button="">{creating ? 'Creating…' : 'Create Ticket'}</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* NPS & CSAT Feedback Modal — deliberately not dismissible by outside
          click or Escape; the header's own close button and "Skip & Resolve"
          are the two sanctioned ways out, not an oversight. */}
      {feedbackTicketId && (
        <Dialog open>
          <DialogContent
            hideClose
            className="spt-modal max-w-[480px] w-full"
            onInteractOutside={e => e.preventDefault()}
            onEscapeKeyDown={e => e.preventDefault()}
          >
            <DialogHeader className="spt-modal-hdr" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
              <DialogTitle className="spt-modal-title" style={{ fontSize: 17 }}>Rate Your Experience</DialogTitle>
              <Tip label="Close">
                <button type="button" className="spt-icon-btn" onClick={handleCancelFeedback} data-ui-native-button="">
                  <Icon name="x" size={16} strokeWidth={2} />
                </button>
              </Tip>
            </DialogHeader>

            <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ textAlign: 'center' }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, display: 'block' }}>
                  How satisfied are you with our support? *
                </label>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '8px 0' }}>
                  {[1, 2, 3, 4, 5].map(star => {
                    const active = csatScore !== null && star <= csatScore;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setCsatScore(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: 28,
                          color: active ? 'var(--gold)' : 'var(--border)',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease',
                          transform: csatScore === star ? 'scale(1.2)' : 'none',
                        }}
                        title={`${star} Star${star > 1 ? 's' : ''}`}
                       data-ui-native-button="">
                        ★
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, display: 'block' }}>
                  How likely are you to recommend us? *
                </label>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => {
                    const active = npsScore === score;
                    return (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setNpsScore(score)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: active ? 'none' : '1px solid var(--border)',
                          background: active ? 'var(--teal)' : 'var(--white)',
                          color: active ? 'hsl(var(--primary-foreground))' : 'var(--ink)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                       data-ui-native-button="">
                        {score}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="spt-modal-field">
                <label className="spt-modal-label">Additional Comments (Optional)</label>
                <textarea
                  rows={2}
                  className="spt-modal-textarea"
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Share details of your experience…"
                />
              </div>

              <div className="spt-modal-actions">
                <button type="button" className="spt-modal-cancel" onClick={handleCancelFeedback} data-ui-native-button="">Skip & Resolve</button>
                <button type="submit" className="spt-modal-submit" disabled={npsScore === null || csatScore === null || submittingFeedback} data-ui-native-button="">
                  {submittingFeedback ? 'Submitting…' : 'Submit & Close'}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
