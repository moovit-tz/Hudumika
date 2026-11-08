import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { Icon, type IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { NOTIF_TYPE_CFG, notifRelTime } from '../components/NotificationListItem.js';
import { PageHeader } from '../components/PageHeader.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Spinner } from '../components/ui/spinner.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Tip } from '../components/ui/tooltip.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../components/ui/sheet.js';
import './BlissNotifications.css';

const PAGE_SIZE = 30;

type FilterTab = 'all' | 'unread' | 'task' | 'support' | 'announcement' | 'security' | 'chat';

const FILTER_TABS: { key: FilterTab; label: string; icon: IconName }[] = [
  { key: 'all',          label: 'All Alerts',    icon: 'inbox' },
  { key: 'unread',       label: 'Unread',        icon: 'bell' },
  { key: 'task',         label: 'Tasks',         icon: 'checkCircle' },
  { key: 'support',      label: 'Support',       icon: 'headphones' },
  { key: 'announcement', label: 'Announcements', icon: 'volume2' },
  { key: 'security',     label: 'Security',      icon: 'shield' },
  { key: 'chat',         label: 'Chat',          icon: 'chatBubble' },
];

export function BlissNotifications() {
  usePageSEO('Notification Centre', 'Every notification across the platform, organized in real time.');

  const [notifs, setNotifs]           = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount]   = useState(0);
  const [tab, setTab]                 = useState<FilterTab>('all');
  const [offset, setOffset]           = useState(0);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [selected, setSelected]       = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [search, setSearch]           = useState('');

  const load = useCallback(async (currentOffset: number, currentTab: FilterTab, isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      if (currentTab === 'announcement') {
        const data = await apiFetch('/v1/announcements/active');
        const list: any[] = (data.data ?? []).map((a: any) => ({
          id: a.id,
          title: a.title,
          message: a.body,
          link: a.link,
          type: 'announcement',
          read: false,
          created_at: a.starts_at,
        }));
        setNotifs(list);
        setUnreadCount(list.length);
        setTotalCount(list.length);
        return;
      }

      const unreadOnly = currentTab === 'unread';
      const typeParam = (currentTab === 'all' || currentTab === 'unread') ? '' : `&type=${currentTab}`;
      const data = await apiFetch(`/v1/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}&unread_only=${unreadOnly}${typeParam}`);
      setNotifs(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
      setTotalCount(data.total_count ?? 0);
    } catch {
      // Ignore network errors
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(offset, tab);
  }, [offset, tab, load]);

  function switchTab(next: FilterTab) {
    setTab(next);
    setOffset(0);
    setSelected(null);
    setDrawerOpen(false);
  }

  function handleOpenDetail(n: any) {
    if (!n.read) {
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (n.type === 'announcement') {
        apiFetch(`/v1/announcements/${n.id}/dismiss`, { method: 'POST' }).catch(() => {});
      } else {
        apiFetch(`/v1/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
      }
    }
    setSelected({ ...n, read: true });
    setDrawerOpen(true);
  }

  function toggleItemRead(n: any, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const nextRead = !n.read;
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: nextRead } : x));
    setUnreadCount(prev => Math.max(0, prev + (nextRead ? -1 : 1)));

    if (selected?.id === n.id) {
      setSelected((curr: any) => curr ? { ...curr, read: nextRead } : null);
    }

    if (n.type === 'announcement') {
      if (nextRead) {
        apiFetch(`/v1/announcements/${n.id}/dismiss`, { method: 'POST' }).catch(() => {});
      }
    } else {
      if (nextRead) {
        apiFetch(`/v1/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
      }
    }
  }

  function handleMarkAllRead() {
    setNotifs(prev => prev.map(x => ({ ...x, read: true })));
    const dismissedIds = tab === 'announcement' ? notifs.map(n => n.id) : [];
    setUnreadCount(0);
    if (tab === 'announcement') {
      Promise.allSettled(dismissedIds.map(id => apiFetch(`/v1/announcements/${id}/dismiss`, { method: 'POST' })))
        .then(() => load(offset, tab, true));
    } else {
      apiFetch('/v1/notifications/read-all', { method: 'PATCH' })
        .then(() => load(offset, tab, true))
        .catch(() => {});
    }
  }

  // Filtered notifications by search
  const displayed = useMemo(() => {
    if (!search.trim()) return notifs;
    const q = search.trim().toLowerCase();
    return notifs.filter(n =>
      (n.title ?? '').toLowerCase().includes(q) ||
      (n.message ?? '').toLowerCase().includes(q) ||
      (n.type ?? '').toLowerCase().includes(q)
    );
  }, [notifs, search]);

  // Date Grouping (Today, Yesterday, Earlier this week, Older)
  const groupedNotifs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const groups: { label: string; items: any[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Earlier this week', items: [] },
      { label: 'Previous', items: [] },
    ];

    for (const item of displayed) {
      const itemDate = new Date(item.created_at);
      if (itemDate >= today) {
        groups[0].items.push(item);
      } else if (itemDate >= yesterday) {
        groups[1].items.push(item);
      } else if (itemDate >= thisWeek) {
        groups[2].items.push(item);
      } else {
        groups[3].items.push(item);
      }
    }

    return groups.filter(g => g.items.length > 0);
  }, [displayed]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const actionNotifsCount = useMemo(() => notifs.filter(n => n.type === 'task' || n.type === 'security').length, [notifs]);
  const supportNotifsCount = useMemo(() => notifs.filter(n => n.type === 'support' || n.type === 'chat').length, [notifs]);

  return (
    <div className="bnc-page">
      {/* ── Executive Page Header ── */}
      <PageHeader
        crumbs={['Bliss', 'Notification Centre']}
        titlePlain="Platform"
        titleEm="Notifications"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''} require attention • Real-time event feed across all platform modules.`
            : 'All caught up! Real-time alerts across logistics, finance, support, and platform operations.'
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {unreadCount > 0 && (
              <Button variant="default" size="sm" onClick={handleMarkAllRead}>
                <Icon name="checkCircle" size={14} />
                <span>Mark All Read</span>
              </Button>
            )}
            <Tip label="Refresh notification feed" side="bottom">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load(offset, tab, true)}
                disabled={refreshing}
              >
                <Icon name="refresh" size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </Button>
            </Tip>
          </div>
        }
      />

      {/* ── 4 Executive KPI Metric Overview Cards ── */}
      <div className="bnc-kpi-grid">
        {/* Total Alerts */}
        <div
          className={`bnc-kpi-card${tab === 'all' ? ' active' : ''}`}
          onClick={() => switchTab('all')}
        >
          <div className="bnc-kpi-icon-wrap" style={{ background: 'var(--teal-l)', color: 'var(--teal)' }}>
            <Icon name="inbox" size={20} />
          </div>
          <div className="bnc-kpi-info">
            <span className="bnc-kpi-num">{totalCount}</span>
            <span className="bnc-kpi-label">Total Alerts</span>
            <span className="bnc-kpi-sub">All platform modules</span>
          </div>
        </div>

        {/* Unread Alerts */}
        <div
          className={`bnc-kpi-card${tab === 'unread' ? ' active' : ''}`}
          onClick={() => switchTab('unread')}
        >
          <div
            className="bnc-kpi-icon-wrap"
            style={{
              background: unreadCount > 0 ? '#fee2e2' : 'var(--green-l)',
              color: unreadCount > 0 ? '#dc2626' : 'var(--green)',
            }}
          >
            <Icon name="bell" size={20} />
          </div>
          <div className="bnc-kpi-info">
            <div className="bnc-kpi-num-row">
              <span className={`bnc-kpi-num ${unreadCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {unreadCount}
              </span>
              {unreadCount > 0 && <span className="bnc-alert-pulse-dot" />}
            </div>
            <span className="bnc-kpi-label">Unread Alerts</span>
            <span className="bnc-kpi-sub">{unreadCount > 0 ? 'Requires attention' : 'Zero pending items'}</span>
          </div>
        </div>

        {/* Tasks & Security */}
        <div
          className={`bnc-kpi-card${tab === 'task' || tab === 'security' ? ' active' : ''}`}
          onClick={() => switchTab('task')}
        >
          <div className="bnc-kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Icon name="shield" size={20} />
          </div>
          <div className="bnc-kpi-info">
            <span className="bnc-kpi-num text-amber-600">{actionNotifsCount}</span>
            <span className="bnc-kpi-label">Tasks &amp; Security</span>
            <span className="bnc-kpi-sub">Actionable system events</span>
          </div>
        </div>

        {/* Support & Chats */}
        <div
          className={`bnc-kpi-card${tab === 'support' || tab === 'chat' ? ' active' : ''}`}
          onClick={() => switchTab('support')}
        >
          <div className="bnc-kpi-icon-wrap" style={{ background: 'var(--blue-l)', color: 'var(--blue)' }}>
            <Icon name="headphones" size={20} />
          </div>
          <div className="bnc-kpi-info">
            <span className="bnc-kpi-num text-blue-600">{supportNotifsCount}</span>
            <span className="bnc-kpi-label">Support &amp; Chats</span>
            <span className="bnc-kpi-sub">Customer tickets &amp; messages</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar & Category Tabs Card ── */}
      <div className="bnc-control-card">
        {/* Top: Category Tabs */}
        <div className="bnc-control-top">
          <Tabs value={tab} onValueChange={v => switchTab(v as FilterTab)}>
            <TabsList>
              {FILTER_TABS.map(t => {
                const count = t.key === 'unread' ? unreadCount : t.key === 'all' ? totalCount : null;
                return (
                  <TabsTrigger key={t.key} value={t.key}>
                    <Icon name={t.icon} size={13} />
                    <span>{t.label}</span>
                    {count !== null && (
                      <span
                        style={{
                          fontSize: 10.5,
                          padding: '1px 6px',
                          borderRadius: 99,
                          fontWeight: 700,
                          background: t.key === 'unread' && unreadCount > 0 ? '#fee2e2' : 'var(--bg)',
                          color: t.key === 'unread' && unreadCount > 0 ? '#dc2626' : 'var(--ink2)',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {/* Bottom: Search & Filtering Bar */}
        <div className="bnc-control-bottom">
          <div className="bnc-search-field">
            <Icon name="search" size={14} className="bnc-search-icon" />
            <input
              className="bnc-search-input"
              placeholder="Search notifications by title, content, or category…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="bnc-search-clear-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              Showing <strong style={{ color: 'var(--ink)' }}>{displayed.length}</strong> alerts
            </span>
          </div>
        </div>
      </div>

      {/* ── Notification Feed Stream ── */}
      {loading ? (
        <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--ink3)' }}>
          <Spinner />
          <p style={{ marginTop: 12, fontSize: 13, fontWeight: 500 }}>Loading notifications feed…</p>
        </div>
      ) : displayed.length === 0 ? (
        /* Empty State */
        <div className="bnc-empty-box">
          <div className="bnc-empty-icon-wrap">
            <Icon name={search ? 'search' : 'bell'} size={24} />
          </div>
          <h3 className="bnc-empty-title">
            {search ? 'No Matching Notifications Found' : 'All Caught Up!'}
          </h3>
          <p className="bnc-empty-desc">
            {search
              ? 'Try adjusting your search query or switching to another category tab to find your notifications.'
              : 'You have zero pending notifications in this category. New system alerts, mentions, and updates will appear here automatically.'}
          </p>
          {search ? (
            <Button variant="outline" size="sm" onClick={() => setSearch('')}>
              Clear Search Filter
            </Button>
          ) : (
            tab !== 'all' && (
              <Button variant="outline" size="sm" onClick={() => switchTab('all')}>
                View All Notifications
              </Button>
            )
          )}
        </div>
      ) : (
        /* Feed Stream with Date Groups */
        <div className="bnc-feed-stream">
          {groupedNotifs.map(group => (
            <div key={group.label} className="bnc-date-group">
              <div className="bnc-date-divider">
                <span>{group.label}</span>
                <span className="bnc-date-badge">{group.items.length}</span>
              </div>

              {group.items.map(n => {
                const cfg = NOTIF_TYPE_CFG[n.type] ?? NOTIF_TYPE_CFG.info;
                const isUnread = !n.read;

                return (
                  <div
                    key={n.id}
                    className={`bnc-item-row${isUnread ? ' unread' : ''}`}
                    onClick={() => handleOpenDetail(n)}
                  >
                    {isUnread && <div className="bnc-item-left-accent" />}

                    {/* Squircle Icon with Semantic Tint */}
                    <div
                      className="bnc-item-icon-squircle"
                      style={{ background: `${cfg.color}15`, color: cfg.color }}
                    >
                      <Icon name={cfg.icon as IconName} size={18} />
                      {isUnread && <div className="bnc-item-unread-pip" />}
                    </div>

                    {/* Body Content */}
                    <div className="bnc-item-content">
                      <div className="bnc-item-header">
                        <div className="bnc-item-title-row">
                          <span
                            className="bnc-item-type-pill"
                            style={{ background: `${cfg.color}18`, color: cfg.color }}
                          >
                            {n.type ?? 'Alert'}
                          </span>
                          <span className={`bnc-item-title${isUnread ? ' bold' : ''}`}>
                            {n.title}
                          </span>
                          {isUnread && (
                            <Badge variant="error" style={{ fontSize: 9, padding: '1px 5px', height: 18 }}>
                              NEW
                            </Badge>
                          )}
                        </div>
                        <span className="bnc-item-time">{notifRelTime(n.created_at)}</span>
                      </div>

                      {n.message && (
                        <div className="bnc-item-message">{n.message}</div>
                      )}

                      {/* Actions & Links */}
                      <div className="bnc-item-actions-row">
                        {n.link && (
                          n.link.startsWith('/') ? (
                            <Link
                              to={n.link}
                              className="bnc-item-link-btn"
                              onClick={e => e.stopPropagation()}
                            >
                              <span>Open Resource</span>
                              <Icon name="arrowUpRight" size={11} />
                            </Link>
                          ) : (
                            <a
                              href={n.link}
                              target="_blank"
                              rel="noreferrer"
                              className="bnc-item-link-btn"
                              onClick={e => e.stopPropagation()}
                            >
                              <span>External Link</span>
                              <Icon name="arrowUpRight" size={11} />
                            </a>
                          )
                        )}

                        <Tip label={isUnread ? 'Mark as read' : 'Mark as unread'}>
                          <button
                            type="button"
                            className="bnc-item-action-icon-btn"
                            onClick={e => toggleItemRead(n, e)}
                          >
                            <Icon name={isUnread ? 'check' : 'bell'} size={13} />
                          </button>
                        </Tip>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bnc-pagination-bar">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              >
                <Icon name="chevronLeft" size={13} />
                <span>Previous Page</span>
              </Button>
              <span>
                Page <strong style={{ color: 'var(--ink)' }}>{page}</strong> of{' '}
                <strong style={{ color: 'var(--ink)' }}>{totalPages}</strong>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setOffset(o => o + PAGE_SIZE)}
              >
                <span>Next Page</span>
                <Icon name="chevronRight" size={13} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Slide-Over Detail Drawer (Sheet) ── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `${(NOTIF_TYPE_CFG[selected.type] ?? NOTIF_TYPE_CFG.info).color}18`,
                      color: (NOTIF_TYPE_CFG[selected.type] ?? NOTIF_TYPE_CFG.info).color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={(NOTIF_TYPE_CFG[selected.type] ?? NOTIF_TYPE_CFG.info).icon as IconName} size={18} />
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: (NOTIF_TYPE_CFG[selected.type] ?? NOTIF_TYPE_CFG.info).color,
                      }}
                    >
                      {selected.type ?? 'Alert'}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                      {notifRelTime(selected.created_at)}
                    </div>
                  </div>
                </div>
                <SheetTitle style={{ fontSize: 17, lineHeight: 1.35 }}>
                  {selected.title}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Notification details and actions.
                </SheetDescription>
              </SheetHeader>

              <div className="bnc-drawer-content">
                {/* Message Body Callout */}
                {selected.message && (
                  <div
                    className="bnc-drawer-callout"
                    style={{ borderLeftColor: (NOTIF_TYPE_CFG[selected.type] ?? NOTIF_TYPE_CFG.info).color }}
                  >
                    {selected.message}
                  </div>
                )}

                {/* Attributes Table */}
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink3)', margin: '0 0 10px' }}>
                    Notification Metadata
                  </h4>
                  <table className="bnc-drawer-meta-table">
                    <tbody>
                      <tr>
                        <td className="bnc-drawer-td-label">Status</td>
                        <td className="bnc-drawer-td-value">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Badge variant={selected.read ? 'success' : 'error'}>
                              {selected.read ? 'Read' : 'Unread'}
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleItemRead(selected)}
                              style={{ height: 26, fontSize: 11 }}
                            >
                              Mark as {selected.read ? 'Unread' : 'Read'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="bnc-drawer-td-label">Received Date</td>
                        <td className="bnc-drawer-td-value">
                          {new Date(selected.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </td>
                      </tr>
                      <tr>
                        <td className="bnc-drawer-td-label">Received Time</td>
                        <td className="bnc-drawer-td-value">
                          {new Date(selected.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                      {selected.link && (
                        <tr>
                          <td className="bnc-drawer-td-label">Linked Resource</td>
                          <td className="bnc-drawer-td-value">
                            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, wordBreak: 'break-all' }}>
                              {selected.link}
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Action CTA Button */}
                {selected.link && (
                  <div style={{ marginTop: 12 }}>
                    {selected.link.startsWith('/') ? (
                      <Link
                        to={selected.link}
                        className="btn btn-primary"
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          textDecoration: 'none',
                          height: 40,
                          borderRadius: 'var(--r-sm, 8px)',
                        }}
                      >
                        <Icon name="arrowUpRight" size={14} />
                        <span>Navigate to Linked Resource</span>
                      </Link>
                    ) : (
                      <a
                        href={selected.link}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-primary"
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          textDecoration: 'none',
                          height: 40,
                          borderRadius: 'var(--r-sm, 8px)',
                        }}
                      >
                        <Icon name="arrowUpRight" size={14} />
                        <span>Open External Link</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
