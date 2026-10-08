import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Panel, PanelResizeHandle } from 'react-resizable-panels';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Badge } from '../../components/ui/badge.js';
import { Tip } from '../../components/ui/tooltip.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuCheckboxItem } from '../../components/ui/dropdown-menu.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { showAlert } from '../../lib/alert.js';
import type { IconName } from '../../components/Icon.js';
import type { ChannelId, StatusKey, PriorityKey, Ticket, SupportGroup, SupportView, ViewMode, InboxFilter, FilterSel, SortKey, ColumnId } from './shared.js';
import { PRIORITY_CFG, STATUS_CFG, CHANNEL_CFG, CATEGORIES, relTime, channelKey, ticketOrigin, Av, PBadge, SBadge, ChPill, CONV_PAGE_SIZE, DEFAULT_COLUMN_ORDER, COLUMN_LABELS, COLUMN_SORT_KEY, COLUMN_WIDTHS, SOURCE_APP_LABELS, loadColumnOrder, loadHiddenColumns, sortByPriority, sortTickets } from './shared.js';

export function ConvList({ tickets, selected, onSelect, onNew, groups, views, onCreateGroup, onCreateView, onDeleteView, isDesktop, initialChannelFilter, queueMode, agents = [], viewMode = 'chat', onViewModeChange, onBulkStatus, onBulkAssign, onBulkGroup }: {
  tickets: Ticket[]; selected: Ticket | null;
  onSelect: (t: Ticket) => void; onNew: () => void;
  groups: SupportGroup[]; views: SupportView[];
  onCreateGroup: (name: string) => void;
  onCreateView: (name: string, filters: Record<string, any>) => void;
  onDeleteView: (id: string) => void;
  isDesktop?: boolean;
  initialChannelFilter?: 'all' | ChannelId;
  queueMode?: boolean;
  agents?: { id: string; name: string }[];
  viewMode?: ViewMode;
  onViewModeChange?: (v: ViewMode) => void;
  onBulkStatus: (ids: string[], status: StatusKey) => Promise<void>;
  onBulkAssign: (ids: string[], assigneeId: string) => Promise<void>;
  onBulkGroup: (ids: string[], groupId: string | null) => Promise<void>;
}) {
  const [convPage, setConvPage] = useState(1);
  const [sel, setSel] = useState<FilterSel>({ kind: 'fixed', key: 'inbox' });
  const activeViewMode = viewMode;

  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewCategory, setNewViewCategory] = useState(CATEGORIES[0]);
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelId>(initialChannelFilter ?? 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusTabFilter, setStatusTabFilter] = useState<'all' | 'open' | 'pending' | 'resolved'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [colOrder, setColOrder] = useState<ColumnId[]>(loadColumnOrder);
  const [hiddenCols, setHiddenCols] = useState<Set<ColumnId>>(loadHiddenColumns);
  const [dragCol, setDragCol] = useState<ColumnId | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);

  const [viewsOpen, setViewsOpen] = useState(true);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { localStorage.setItem('bliss_tix_col_order', JSON.stringify(colOrder)); }, [colOrder]);
  useEffect(() => { localStorage.setItem('bliss_tix_col_hidden', JSON.stringify([...hiddenCols])); }, [hiddenCols]);

  function reorderColumn(from: ColumnId, to: ColumnId) {
    if (from === to) return;
    setColOrder(order => {
      const next = order.filter(c => c !== from);
      next.splice(next.indexOf(to), 0, from);
      return next;
    });
  }
  function toggleColumnVisible(id: ColumnId) {
    setHiddenCols(hidden => {
      const next = new Set(hidden);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (colOrder.length - next.size <= 1) return next;
        next.add(id);
      }
      return next;
    });
  }
  const visibleColOrder = colOrder.filter(c => !hiddenCols.has(c));

  const inboxCount = (k: InboxFilter) => {
    if (k === 'inbox') return tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
    if (k === 'unassigned') return tickets.filter(t => !t.assigned_to).length;
    if (k === 'closed') return tickets.filter(t => t.status === 'CLOSED').length;
    if (k === 'onsite') return tickets.filter(t => t.source_app === 'onsite' && t.status !== 'CLOSED').length;
    return tickets.length;
  };

  const visible = tickets.filter(t => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCust = t.customer.toLowerCase().includes(q);
      const matchSubj = t.subject.toLowerCase().includes(q);
      const matchRef = t.ref.toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchEmail = (t.customer_email || '').toLowerCase().includes(q);
      const matchPhone = (t.customer_phone || '').toLowerCase().includes(q);
      if (!matchCust && !matchSubj && !matchRef && !matchDesc && !matchEmail && !matchPhone) return false;
    }
    if (statusTabFilter !== 'all') {
      if (statusTabFilter === 'open' && t.status !== 'OPEN') return false;
      if (statusTabFilter === 'pending' && t.status !== 'IN_PROGRESS') return false;
      if (statusTabFilter === 'resolved' && t.status !== 'RESOLVED' && t.status !== 'CLOSED') return false;
    }
    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'unassigned' && t.assigned_to) return false;
      if (assigneeFilter !== 'unassigned' && t.assigned_to !== assigneeFilter) return false;
    }
    if (channelFilter !== 'all' && channelKey(t.channel) !== channelFilter) return false;
    if (sel.kind === 'fixed') {
      return sel.key === 'all' ? true :
        sel.key === 'inbox' ? (t.status === 'OPEN' || t.status === 'IN_PROGRESS') :
          sel.key === 'unassigned' ? !t.assigned_to :
            sel.key === 'onsite' ? t.source_app === 'onsite' && t.status !== 'CLOSED' :
              t.status === 'CLOSED';
    }
    if (sel.kind === 'group') return t.group_id === sel.id || t.group_name === sel.id;
    const view = views.find(v => v.id === sel.id);
    if (!view) return true;
    const f = view.filters || {};
    if (f.category && t.category !== f.category) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    return true;
  }).sort((a, b) => {
    if (queueMode && channelFilter === 'inapp') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sel.kind === 'fixed' && sel.key === 'onsite') return sortByPriority(a, b);
    if (activeViewMode === 'chat') return sortTickets(a, b);
    let av: string, bv: string;
    switch (sortKey) {
      case 'customer': av = a.customer; bv = b.customer; break;
      case 'status': av = a.status; bv = b.status; break;
      case 'assigned_to': av = a.assigned_to || ''; bv = b.assigned_to || ''; break;
      case 'group_name': av = a.group_name || 'General'; bv = b.group_name || 'General'; break;
      case 'updated_at': av = a.updated_at || a.created_at; bv = b.updated_at || b.created_at; break;
      default: return 0;
    }
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalConvPages = Math.max(1, Math.ceil(visible.length / CONV_PAGE_SIZE));
  const safePage = Math.min(convPage, totalConvPages);
  const paged = visible.slice((safePage - 1) * CONV_PAGE_SIZE, safePage * CONV_PAGE_SIZE);

  useEffect(() => { setConvPage(1); }, [sel, searchQuery, statusTabFilter, assigneeFilter]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paged.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paged.map(t => t.id)));
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const INBOX_ITEMS: { key: InboxFilter; label: string; icon: IconName }[] = [
    { key: 'inbox', label: 'Your inbox', icon: 'inbox' },
    { key: 'unassigned', label: 'Unassigned', icon: 'paw' },
    { key: 'closed', label: 'Closed', icon: 'archive' },
    { key: 'all', label: 'All', icon: 'users' },
  ];


  const renderColumnCell = (colId: ColumnId, t: Ticket) => {
    switch (colId) {
      case 'status': {
        return <span className={`spt-bedesk-status-pill spt-bedesk-status-pill--${t.status.toLowerCase().replace('_', '-')}`}>{STATUS_CFG[t.status]?.label ?? 'Open'}</span>;
      }
      case 'source': {
        const origin = ticketOrigin(t);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }} title={origin.label}>
            <Icon name={origin.icon} size={13} strokeWidth={1.75} color="var(--ink3)" />
            <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {origin.label}
            </span>
          </div>
        );
      }
      case 'customer':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
            <Av name={t.customer} userId={t.customer_id} kind="customers" size={24} />
            <span style={{ fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
              {t.customer}
            </span>
          </div>
        );
      case 'summary': {
        const lastMsg = t.messages?.[t.messages.length - 1];
        const preview = lastMsg ? lastMsg.content : (t.description || t.subject || 'Customer inquiry');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {(t.tags ?? []).slice(0, 3).map(tag => (
              <span key={tag} className="spt-bedesk-tag-pill">{tag}</span>
            ))}
            <span style={{ fontSize: 12.5, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </span>
          </div>
        );
      }
      case 'assigned_to':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.assigned_to ? (
              <>
                <Av name={t.assigned_to} userId={t.assigned_to_id} kind="people" size={20} />
                <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.assigned_to}
                </span>
              </>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink3)' }}>
                <Icon name="paw" size={13} strokeWidth={1.5} />
                <span>Unassigned</span>
              </span>
            )}
          </div>
        );
      case 'group_name':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: t.group_color || '#06b6d4',
                color: '#ffffff', fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {(t.group_name || 'General').charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.group_name || 'General'}
            </span>
          </div>
        );
      case 'updated_at':
        return <span style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', display: 'block' }}>{relTime(t.updated_at || t.created_at)}</span>;
    }
  };

  const navContent = (
    <div className="spt-inbox-nav-pane">
      {/* ── Top BeDesk Inbox Title & Header Actions ── */}
      <div className="spt-bedesk-nav-hdr">
        <span className="spt-bedesk-nav-title">Inbox</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tip label="Search">
            <button
              type="button"
              className="spt-bedesk-icon-btn"
              aria-label="Search conversations"
              onClick={() => setSearchOpen(o => !o)}
             data-ui-native-button="">
              <Icon name="search" size={15} />
            </button>
          </Tip>
          <Tip label="New Ticket">
            <button
              type="button"
              className="spt-bedesk-icon-btn"
              onClick={onNew}
              aria-label="New ticket"
             data-ui-native-button="">
              <Icon name="plus" size={16} />
            </button>
          </Tip>
        </div>
      </div>

      {searchOpen && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div className="spt-bedesk-search-input-wrap">
            <Icon name="search" size={13} color="var(--ink3)" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations…"
              autoFocus
            />
            {searchQuery && (
              <button type="button" aria-label="Clear conversation search" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 0 }} data-ui-native-button="">
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="spt-nav-scroll">
        {/* Primary BeDesk items */}
        <nav className="spt-inbox-nav">
          {INBOX_ITEMS.map(item => {
            const count = inboxCount(item.key);
            const active = sel.kind === 'fixed' && sel.key === item.key;
            return (
              <button key={item.key} type="button"
                className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                onClick={() => setSel({ kind: 'fixed', key: item.key })} data-ui-native-button="">
                <Icon name={item.icon} size={15} strokeWidth={active ? 2.2 : 1.75} />
                <span className="spt-inbox-label">{item.label}</span>
                {count > 0 && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{count}</span>}
              </button>
            );
          })}
        </nav>

        {/* Views Section */}
        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr" onClick={() => setViewsOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <span>Views</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tip label="New view">
                <button type="button" aria-label="New view" className="spt-nav-add" onClick={e => { e.stopPropagation(); setNewViewOpen(o => !o); }} data-ui-native-button="">
                  <Icon name="plus" size={12} />
                </button>
              </Tip>
              <Icon name={viewsOpen ? 'chevronDown' : 'chevronRight'} size={12} />
            </div>
          </div>
          {viewsOpen && (
            <>
              {newViewOpen && (
                <div className="spt-nav-new-form">
                  <input className="input-field" placeholder="View name" value={newViewName} onChange={e => setNewViewName(e.target.value)} />
                  <Select value={newViewCategory} onValueChange={setNewViewCategory}>
                    <SelectTrigger aria-label="View category" className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="spt-nav-new-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewViewOpen(false)} data-ui-native-button="">Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!newViewName.trim()} onClick={() => {
                      onCreateView(newViewName.trim(), { category: newViewCategory });
                      setNewViewName(''); setNewViewOpen(false);
                    }} data-ui-native-button="">Save</button>
                  </div>
                </div>
              )}
              <nav className="spt-inbox-nav">
                {views.map(v => {
                  const active = sel.kind === 'view' && sel.id === v.id;
                  return (
                    <button key={v.id} type="button"
                      className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                      onClick={() => setSel({ kind: 'view', id: v.id })} data-ui-native-button="">
                      <Icon name="filter" size={13} strokeWidth={active ? 2.2 : 1.75} />
                      <span className="spt-inbox-label">{v.name}</span>
                      <span className="spt-nav-item-remove" onClick={e => { e.stopPropagation(); onDeleteView(v.id); if (active) setSel({ kind: 'fixed', key: 'all' }); }}>
                        <Icon name="x" size={11} strokeWidth={2} />
                      </span>
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </div>

        {/* Groups Section */}
        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr" onClick={() => setGroupsOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <span>Groups</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tip label="New group">
                <button type="button" aria-label="New group" className="spt-nav-add" onClick={e => { e.stopPropagation(); setNewGroupOpen(o => !o); }} data-ui-native-button="">
                  <Icon name="plus" size={12} />
                </button>
              </Tip>
              <Icon name={groupsOpen ? 'chevronDown' : 'chevronRight'} size={12} />
            </div>
          </div>
          {groupsOpen && (
            <>
              {newGroupOpen && (
                <div className="spt-nav-new-form">
                  <input className="input-field" placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                  <div className="spt-nav-new-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewGroupOpen(false)} data-ui-native-button="">Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!newGroupName.trim()} onClick={() => {
                      onCreateGroup(newGroupName.trim());
                      setNewGroupName(''); setNewGroupOpen(false);
                    }} data-ui-native-button="">Save</button>
                  </div>
                </div>
              )}
              {groups.length === 0 ? (
                <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--ink3)' }}>No groups yet — create one above.</div>
              ) : (
                <nav className="spt-inbox-nav">
                  {groups.map(g => {
                    const active = sel.kind === 'group' && (sel.id === g.id || sel.id === g.name);
                    return (
                      <button key={g.id} type="button"
                        className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                        onClick={() => setSel({ kind: 'group', id: g.id })} data-ui-native-button="">
                        <span className="spt-bedesk-group-dot" style={{ background: g.color || '#06b6d4' }} />
                        <span className="spt-inbox-label">{g.name}</span>
                        {!!g.ticket_count && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{g.ticket_count}</span>}
                      </button>
                    );
                  })}
                </nav>
              )}
            </>
          )}
        </div>

        {/* ── Social Channels Section ── */}
        <div className="spt-nav-section">
          <div className="spt-nav-section-hdr" onClick={() => setChannelsOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <span>Channels</span>
            <Icon name={channelsOpen ? 'chevronDown' : 'chevronRight'} size={12} />
          </div>
          {channelsOpen && (
            <nav className="spt-inbox-nav">
              {(['all', 'whatsapp', 'email', 'inapp', 'sms'] as const).map(ch => {
                const active = channelFilter === ch;
                const cfg = ch === 'all' ? null : CHANNEL_CFG[ch];
                const count = ch === 'all' ? tickets.length : tickets.filter(t => channelKey(t.channel) === ch).length;
                return (
                  <button key={ch} type="button"
                    className={`spt-inbox-item${active ? ' spt-inbox-item--active' : ''}`}
                    onClick={() => setChannelFilter(ch)} data-ui-native-button="">
                    <Icon name={cfg?.icon ?? 'globe'} size={14} strokeWidth={active ? 2.2 : 1.75} style={cfg ? { color: cfg.color } : undefined} />
                    <span className="spt-inbox-label">{cfg?.label ?? 'All channels'}</span>
                    {count > 0 && <span className={`spt-inbox-count${active ? ' spt-inbox-count--active' : ''}`}>{count}</span>}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Bottom Pinned: Assignee Filter — moved down from the toolbar row
          above the ticket list, which only ever had room for it alongside
          the status Tabs by scrolling. "Manage views" that lived in this
          slot linked to Operational Mode, itself always reachable from
          Bliss's own main nav — a real destination, just a redundant third
          path to it once the header's own Settings button already covered
          the same ground. */}
      <div className="spt-bedesk-nav-ft">
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="spt-bedesk-val-select" style={{ width: '100%' }}>
            <SelectValue placeholder="All assignees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  // statusTabFilter/assigneeFilter already drove the real filtering logic
  // above (visible = tickets.filter(...)) with no control anywhere that
  // ever changed either away from its initial value — a finer cut within
  // the sidebar's own broader buckets (e.g. "Pending" here is IN_PROGRESS
  // only, distinct from the sidebar's "Inbox" which lumps OPEN+IN_PROGRESS
  // together; the sidebar has no per-agent filter at all).
  const STATUS_TABS: { key: typeof statusTabFilter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'open', label: 'Open' },
    { key: 'pending', label: 'Pending' }, { key: 'resolved', label: 'Resolved' },
  ];
  const filterBar = (
    // Always exactly one row, never wrapped and never shrunk to invisible.
    // The conversation-list panel is a resizable react-resizable-panels
    // column (minSize 20%) that at its default size gives this row less
    // room than the tabs + select need at their natural, fully-legible
    // width — flexWrap broke it into two lines, and shrinking the select
    // with no real floor let it collapse toward 0 width instead. Neither
    // is "a single row" in any useful sense. The one thing that keeps
    // BOTH controls fully readable at every panel width is the same
    // visible-scrollbar overflow ds-tabs.css already uses for a tab row
    // that doesn't fit — scroll the row itself rather than hide anything.
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 14px',
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      height: 50,
      minHeight: 50,
      maxHeight: 50,
      background: 'var(--card-bg, var(--white))',
      flexShrink: 0,
      boxSizing: 'border-box',
    }}>
      <Tabs value={statusTabFilter} onValueChange={v => setStatusTabFilter(v as any)} variant="segmented" style={{ flexShrink: 0 }}>
        <TabsList>
          {STATUS_TABS.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key} style={{ fontSize: 11.5, padding: '0 8px' }}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );

  // The row/table checkboxes and "select all" already existed with real
  // selection state (selectedIds) — nothing consumed it (see Bliss.css's own
  // "nobody's using yet" comment on .spt-row-checkbox). This is that
  // consumer: bulk status/assignee/group changes over whatever's selected,
  // reusing the same per-ticket endpoints the Details panel's own Select
  // rows call, not a new bulk API.
  const bulkBar = selectedIds.size > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--teal-l)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--teal)', marginRight: 4 }}>{selectedIds.size} selected</span>
      <Select value="__" onValueChange={v => { onBulkStatus(Array.from(selectedIds), v as StatusKey).then(() => setSelectedIds(new Set())); }}>
        <SelectTrigger className="spt-bedesk-val-select" style={{ width: 130 }}><span style={{ fontSize: 12 }}>Set status…</span></SelectTrigger>
        <SelectContent>
          <SelectItem value="OPEN">Open</SelectItem>
          <SelectItem value="IN_PROGRESS">Pending</SelectItem>
          <SelectItem value="RESOLVED">Resolved</SelectItem>
          <SelectItem value="CLOSED">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Select value="__" onValueChange={v => { onBulkAssign(Array.from(selectedIds), v).then(() => setSelectedIds(new Set())); }}>
        <SelectTrigger className="spt-bedesk-val-select" style={{ width: 130 }}><span style={{ fontSize: 12 }}>Assign to…</span></SelectTrigger>
        <SelectContent>
          {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value="__" onValueChange={v => { onBulkGroup(Array.from(selectedIds), v === '__none__' ? null : v).then(() => setSelectedIds(new Set())); }}>
        <SelectTrigger className="spt-bedesk-val-select" style={{ width: 130 }}><span style={{ fontSize: 12 }}>Add to group…</span></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">General</SelectItem>
          {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <button type="button" onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} data-ui-native-button="">
        Clear selection
      </button>
    </div>
  );

  const listContent = (
    <div className="spt-tix-list-pane">
      {filterBar}
      {bulkBar}

      {activeViewMode === 'chat' ? (
        <div className={`spt-conv-rows${selectedIds.size > 0 ? ' spt-conv-rows--selecting' : ''}`}>
          {paged.length === 0 && (
            <div className="spt-conv-empty">No conversations found</div>
          )}
          {paged.map(t => {
            const isSel = selected?.id === t.id;
            const isChecked = selectedIds.has(t.id);
            const lastMsg = t.messages?.[t.messages.length - 1];
            const preview = lastMsg ? lastMsg.content : (t.description?.slice(0, 80) || t.subject || 'No description provided.');

            return (
              <div
                key={t.id}
                className={`spt-bedesk-conv-card${isSel ? ' spt-bedesk-conv-card--active' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <Checkbox
                    aria-label={`Select conversation with ${t.customer}`}
                    className="spt-row-checkbox"
                    checked={isChecked}
                    onClick={e => toggleSelectOne(t.id, e)}
                    onCheckedChange={() => { }}
                  />
                  <div className="spt-conv-row-av" style={{ position: 'relative' }}>
                    <Av name={t.customer} userId={t.customer_id} kind="customers" size={36} />
                    {t.status === 'OPEN' && <span className="spt-conv-unread-dot" />}
                  </div>
                </div>

                <button type="button" aria-label={`Open conversation with ${t.customer}`} onClick={() => onSelect(t)} className="spt-conv-row-body" style={{ minWidth: 0, flex: 1, overflow: 'hidden', border: 0, background: 'transparent', textAlign: 'left', color: 'inherit', cursor: 'pointer' }} data-ui-native-button="">
                  <div className="spt-conv-row-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                    <span className="spt-conv-row-name" title={t.customer}>
                      {t.customer}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {channelKey(t.channel) === 'note' && (
                        <Tip label="Internal Note">
                          <Icon name="lock" size={11} color="var(--gold)" />
                        </Tip>
                      )}
                      <span className="spt-conv-row-time">
                        {relTime(t.updated_at || t.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="spt-conv-row-preview" title={preview}>
                    {preview}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Full Table View Mode (Image 1) ── */
        <div className="spt-tix-table-wrap">
          <table className={`spt-bedesk-table${selectedIds.size > 0 ? ' spt-bedesk-table--selecting' : ''}`}>
            <thead>
              <tr>
                <th style={{ width: 38, minWidth: 38, textAlign: 'center', padding: '8px 6px' }}>
                  <Checkbox
                    className="mx-auto"
                    aria-label="Select all conversations on this page"
                    checked={paged.length > 0 && selectedIds.size === paged.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                {visibleColOrder.map(colId => {
                  const sortK = COLUMN_SORT_KEY[colId];
                  const active = sortK && sortKey === sortK;
                  const colStyle = {
                    width: COLUMN_WIDTHS[colId]?.width,
                    minWidth: COLUMN_WIDTHS[colId]?.minWidth,
                  };
                  return (
                    <th
                      key={colId}
                      style={colStyle}
                      className={`spt-tix-th spt-tix-th--${colId} spt-tix-th--draggable${active ? ' spt-tix-th--active' : ''}${dragOverCol === colId ? ' spt-tix-th--dragover' : ''}`}
                      draggable
                      onDragStart={() => setDragCol(colId)}
                      onDragOver={e => { e.preventDefault(); if (dragOverCol !== colId) setDragOverCol(colId); }}
                      onDragLeave={() => setDragOverCol(cur => cur === colId ? null : cur)}
                      onDrop={e => { e.preventDefault(); if (dragCol) reorderColumn(dragCol, colId); setDragCol(null); setDragOverCol(null); }}
                      onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                      onClick={() => sortK && toggleSort(sortK)}
                      title="Click to sort, drag to reorder"
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Icon name="moreVertical" size={10} strokeWidth={2} className="spt-tix-th-grip" />
                        {COLUMN_LABELS[colId]}
                        {active && <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} strokeWidth={2} />}
                      </span>
                    </th>
                  );
                })}
                <th style={{ width: 32, minWidth: 32, textAlign: 'center', padding: '8px 4px' }}>
                  <DropdownMenu>
                    <Tip label="Show/hide columns">
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Show or hide columns" onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex' }} data-ui-native-button="">
                          <Icon name="settings" size={13} />
                        </button>
                      </DropdownMenuTrigger>
                    </Tip>
                    <DropdownMenuContent align="end">
                      {colOrder.map(colId => (
                        <DropdownMenuCheckboxItem
                          key={colId}
                          checked={!hiddenCols.has(colId)}
                          onCheckedChange={() => toggleColumnVisible(colId)}
                          onSelect={e => e.preventDefault()}
                        >
                          {COLUMN_LABELS[colId]}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={visibleColOrder.length + 2} className="spt-conv-empty">No conversations found</td></tr>
              )}
              {paged.map(t => {
                const isSel = selected?.id === t.id;
                const isChecked = selectedIds.has(t.id);
                return (
                  <tr key={t.id} className={isSel ? 'spt-bedesk-row--active' : ''} onClick={() => onSelect(t)}>
                    <td style={{ width: 38, minWidth: 38, textAlign: 'center', padding: '7px 6px' }}>
                      <Checkbox
                        className="mx-auto spt-row-checkbox"
                        checked={isChecked}
                        onClick={e => toggleSelectOne(t.id, e)}
                        onCheckedChange={() => { }}
                      />
                    </td>
                    {visibleColOrder.map(colId => (
                      <td
                        key={colId}
                        style={{ width: COLUMN_WIDTHS[colId]?.width, minWidth: COLUMN_WIDTHS[colId]?.minWidth }}
                        className={`spt-tix-td spt-tix-td--${colId}`}
                      >
                        {renderColumnCell(colId, t)}
                      </td>
                    ))}
                    <td style={{ width: 32, minWidth: 32 }} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalConvPages > 1 && (
        <div className="spt-conv-pager">
          <Tip label="Previous page">
            <button type="button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setConvPage(p => p - 1)} data-ui-native-button="">
              <Icon name="arrowLeft" size={11} strokeWidth={2} />
            </button>
          </Tip>
          <span>{safePage} / {totalConvPages}</span>
          <Tip label="Next page">
            <button type="button" aria-label="Next page" disabled={safePage >= totalConvPages} onClick={() => setConvPage(p => p + 1)} data-ui-native-button="">
              <Icon name="arrowRight" size={11} strokeWidth={2} />
            </button>
          </Tip>
        </div>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <Panel defaultSize={activeViewMode === 'table' ? 15 : 15} minSize={12} maxSize={22} className="spt-inbox-nav-panel">
          {navContent}
        </Panel>
        <PanelResizeHandle className="spt-resize-handle" />
        <Panel defaultSize={activeViewMode === 'table' ? 85 : 27} minSize={20} className="spt-conv-list-panel">
          {listContent}
        </Panel>
      </>
    );
  }

  return (
    <div className="spt-conv-list">
      {navContent}
      {listContent}
    </div>
  );
}
