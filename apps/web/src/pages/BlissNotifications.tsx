import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSEO } from "../hooks/usePageSEO.js";
import { Icon, type IconName } from "../components/Icon.js";
import { apiFetch } from "../lib/api.js";
import { NOTIF_TYPE_CFG, notifRelTime } from "../components/NotificationListItem.js";
import { PageHeader } from "../components/PageHeader.js";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { Spinner } from "../components/ui/spinner.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { Tip } from "../components/ui/tooltip.js";
import "./BlissNotifications.css";

const PAGE_SIZE = 30;

// 'mention' used to be a tab here too — no feature anywhere in the platform
// ever creates a mention-type notification (no @-mention concept exists in
// any composer/comment box yet), so it was permanently, structurally empty.
// Dropped rather than left as a dead tab; add it back once something real
// produces that type.
type FilterTab = "all" | "unread" | "task" | "support" | "announcement" | "security" | "chat";

const FILTER_TABS: { key: FilterTab; label: string; icon: IconName }[] = [
  { key: "all",          label: "All",           icon: "inbox" },
  { key: "unread",       label: "Unread",        icon: "bell" },
  { key: "task",         label: "Tasks",         icon: "checkCircle" },
  { key: "support",      label: "Support",       icon: "headphones" },
  { key: "announcement", label: "Announcements", icon: "volume2" },
  { key: "security",     label: "Security",      icon: "shield" },
  { key: "chat",         label: "Chat",          icon: "chatBubble" },
];

export function BlissNotifications() {
  usePageSEO("Notification Centre", "Every notification across the platform, in one place.");

  const [notifs, setNotifs]           = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount]   = useState(0);
  const [tab, setTab]                 = useState<FilterTab>("all");
  const [offset, setOffset]           = useState(0);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<any | null>(null);
  const [search, setSearch]           = useState("");

  const [listWidth, setListWidth] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const rootRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  useEffect(() => { if (!selected) setListWidth(null); }, [selected]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function startDrag(e: React.MouseEvent) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = leftRef.current?.getBoundingClientRect().width ?? 360;
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = ev.clientX - dragStartX.current;
      const rootWidth = rootRef.current?.getBoundingClientRect().width ?? 1200;
      const maxW = Math.max(300, rootWidth - 340);
      setListWidth(Math.max(300, Math.min(dragStartW.current + dx, maxW)));
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const load = useCallback(async (currentOffset: number, currentTab: FilterTab) => {
    setLoading(true);
    try {
      // Announcements are never rows in the notifications table (they live
      // in their own table — see AppHeader.tsx's header pill, the same
      // /active endpoint) — this is the one path in this page that isn't
      // /v1/notifications at all. It's also not paginated the same way:
      // /active only ever returns what's currently live and undismissed for
      // this person (same 5-item cap the pill itself uses), so this tab
      // gives someone a second chance at one they dismissed from the pill
      // by accident, or missed while they were away — not a full history,
      // since a dismissed announcement leaves no record anywhere.
      if (currentTab === "announcement") {
        const data = await apiFetch('/v1/announcements/active');
        const list: any[] = (data.data ?? []).map((a: any) => ({
          id: a.id, title: a.title, message: a.body, link: a.link,
          type: 'announcement', read: false, created_at: a.starts_at,
        }));
        setNotifs(list);
        setUnreadCount(list.length);
        setTotalCount(list.length);
        return;
      }

      const unreadOnly = currentTab === "unread";
      const typeParam = (currentTab === "all" || currentTab === "unread") ? "" : `&type=${currentTab}`;
      const data = await apiFetch(`/v1/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}&unread_only=${unreadOnly}${typeParam}`);
      setNotifs(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
      setTotalCount(data.total_count ?? 0);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(offset, tab); }, [offset, tab, load]);

  function switchTab(next: FilterTab) { setTab(next); setOffset(0); setSelected(null); }

  function handleMarkRead(n: any) {
    if (!n.read) {
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
      // An announcement isn't a notifications row — "read" here means
      // dismissed, via the same endpoint the header pill itself calls.
      if (n.type === 'announcement') {
        apiFetch(`/v1/announcements/${n.id}/dismiss`, { method: "POST" }).catch(() => {});
      } else {
        apiFetch(`/v1/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
      }
    }
    setSelected({ ...n, read: true });
  }

  function handleMarkAllRead() {
    setNotifs(prev => prev.map(x => ({ ...x, read: true })));
    const dismissedIds = tab === 'announcement' ? notifs.map(n => n.id) : [];
    setUnreadCount(0);
    if (tab === 'announcement') {
      Promise.allSettled(dismissedIds.map(id => apiFetch(`/v1/announcements/${id}/dismiss`, { method: 'POST' })))
        .then(() => load(offset, tab));
    } else {
      apiFetch("/v1/notifications/read-all", { method: "PATCH" }).then(() => load(offset, tab)).catch(() => {});
    }
  }

  const searchLower = search.toLowerCase();
  const displayed = search
    ? notifs.filter(n => n.title?.toLowerCase().includes(searchLower) || n.message?.toLowerCase().includes(searchLower))
    : notifs;

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const actionNotifsCount = notifs.filter(n => n.type === 'task' || n.type === 'security').length;
  const supportNotifsCount = notifs.filter(n => n.type === 'support' || n.type === 'chat').length;

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: '100%' }}>
      
      {/* Top Banner Header */}
      <div style={{ padding: '16px 24px 12px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <PageHeader
          crumbs={['Bliss', 'Notifications']}
          titlePlain="Notification"
          titleEm="Centre"
          subtitle={unreadCount > 0 ? `${unreadCount} unread alerts • every platform notification, organized in one place.` : 'Every notification across the platform, organized in real time.'}
          actions={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <Button variant="default" size="sm" onClick={handleMarkAllRead}>
                  <Icon name="checkCircle" size={14} /> Mark All Read
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => load(offset, tab)}>
                <Icon name="refresh" size={14} /> Refresh Feed
              </Button>
            </div>
          }
        />

        {/* Top Summary Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
              <Icon name="inbox" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{totalCount} Total</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Platform Alerts</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: unreadCount > 0 ? 'var(--red-l)' : 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: unreadCount > 0 ? 'var(--red)' : 'var(--green)' }}>
              <Icon name="bell" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{unreadCount} Unread</div>
              <div style={{ fontSize: 11, color: unreadCount > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: unreadCount > 0 ? 700 : 400 }}>Requires Attention</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--gold-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}>
              <Icon name="shield" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{actionNotifsCount} Action Items</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Tasks & Security</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
              <Icon name="headphones" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{supportNotifsCount} Support/Chats</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Customer Activity</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dual-Pane Master Detail Container */}
      <div className="bnc-root" ref={rootRef}>
        {(!isMobile || !selected) && (
          <div
            ref={leftRef}
            className={`bnc-left${selected ? " bnc-left--has-detail" : ""}`}
            style={selected && listWidth != null ? ({ "--bnc-list-w": `${listWidth}px` } as React.CSSProperties) : undefined}
          >
            <div className="bnc-left-hdr">
              <div className="bnc-search-wrap">
                <Icon name="search" size={14} className="bnc-search-icon" />
                <input
                  className="bnc-search"
                  placeholder="Filter notifications by title or message text…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="bnc-search-clear" onClick={() => setSearch("")}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>

              <Tabs value={tab} onValueChange={v => switchTab(v as typeof tab)} variant="segmented">
                <TabsList className="bnc-chips">
                  {FILTER_TABS.map(t => (
                    <TabsTrigger key={t.key} value={t.key}>
                      <Icon name={t.icon} size={12} />
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="bnc-list">
              {loading ? (
                <div className="bnc-empty">
                  <Spinner />
                  <span className="bnc-empty-label">Loading notifications…</span>
                </div>
              ) : displayed.length === 0 ? (
                <div className="bnc-empty">
                  <div className="bnc-empty-ico"><Icon name="bell" size={28} /></div>
                  <span className="bnc-empty-label">{search ? "No matching notifications" : "All caught up!"}</span>
                  <span className="bnc-empty-sub">{search ? "Try searching for a different keyword" : "No notifications available in this category."}</span>
                </div>
              ) : displayed.map(n => (
                <NotifRow key={n.id} n={n} isActive={selected?.id === n.id} onClick={() => handleMarkRead(n)} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="bnc-pagination">
                <button className="bnc-pg-btn" disabled={page === 1} onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}>
                  <Icon name="chevronLeft" size={14} />
                </button>
                <span className="bnc-pg-label">Page {page} of {totalPages}</span>
                <button className="bnc-pg-btn" disabled={page === totalPages} onClick={() => setOffset(o => o + PAGE_SIZE)}>
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {selected && !isMobile && <div className="bnc-resizer" onMouseDown={startDrag} />}

        {selected && (
          <div className="bnc-right">
            <NotifDetail n={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function NotifRow({ n, isActive, onClick }: { n: any; isActive: boolean; onClick: () => void }) {
  const cfg = NOTIF_TYPE_CFG[n.type] ?? NOTIF_TYPE_CFG.info;
  return (
    <div
      className={["bnc-row", !n.read ? "bnc-row--unread" : "", isActive ? "bnc-row--active" : ""].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {!n.read && <div className="bnc-row-bar" style={{ background: cfg.color }} />}
      <div className="bnc-row-avatar-wrap">
        <div className="bnc-row-initials" style={{ background: cfg.color }}>
          {(n.title || "?")[0]?.toUpperCase()}
        </div>
        <div className="bnc-row-type-badge" style={{ color: cfg.color }}>
          <Icon name={cfg.icon as IconName} size={9} strokeWidth={2.5} />
        </div>
      </div>
      <div className="bnc-row-body">
        <div className="bnc-row-top">
          <span className={`bnc-row-title${!n.read ? " bnc-row-title--bold" : ""}`}>{n.title}</span>
          <span className="bnc-row-time">{notifRelTime(n.created_at)}</span>
        </div>
        {n.message && <div className="bnc-row-msg">{n.message}</div>}
        <div className="bnc-row-tags">
          <span className="bnc-tag" style={{ background: `${cfg.color}18`, color: cfg.color }}>
            {n.type ?? "info"}
          </span>
          {!n.read && (
            <Badge variant="error" style={{ fontSize: 9, padding: '1px 5px' }}>NEW</Badge>
          )}
        </div>
      </div>
      {!n.read && <div className="bnc-row-dot" />}
    </div>
  );
}

function NotifDetail({ n, onClose }: { n: any; onClose: () => void }) {
  const cfg = NOTIF_TYPE_CFG[n.type] ?? NOTIF_TYPE_CFG.info;
  const date = new Date(n.created_at);
  return (
    <div className="bnc-detail">
      <div className="bnc-detail-hdr">
        <div className="bnc-detail-hdr-icon" style={{ background: `${cfg.color}18`, color: cfg.color }}>
          <Icon name={cfg.icon as IconName} size={20} />
        </div>
        <div className="bnc-detail-hdr-text">
          <h2 className="bnc-detail-headline">{n.title}</h2>
          <div className="bnc-detail-meta">
            <span>{date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
            <span className="bnc-detail-meta-dot">·</span>
            <span>{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="bnc-detail-meta-dot">·</span>
            <span className="bnc-tag" style={{ background: `${cfg.color}18`, color: cfg.color }}>{n.type ?? "info"}</span>
          </div>
        </div>
        <Tip label="Close">
          <button className="bnc-icon-btn" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </Tip>
      </div>

      {n.message && (
        <div className="bnc-detail-callout" style={{ borderLeftColor: cfg.color }}>
          <Icon name={cfg.icon as IconName} size={14} style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }} />
          <div className="bnc-detail-callout-text">{n.message}</div>
        </div>
      )}

      <div className="bnc-detail-section">
        <h3 className="bnc-detail-section-title">Notification Attributes</h3>
        <table className="bnc-detail-table">
          <tbody>
            <tr>
              <td className="bnc-detail-td-label">Category Type</td>
              <td><span className="bnc-tag" style={{ background: `${cfg.color}18`, color: cfg.color }}>{n.type ?? "info"}</span></td>
            </tr>
            <tr>
              <td className="bnc-detail-td-label">Received Timestamp</td>
              <td>{date.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="bnc-detail-td-label">Read Status</td>
              <td>
                <span className={`bnc-status-badge bnc-status-badge--${n.read ? "read" : "unread"}`}>
                  {n.read ? "Read" : "Unread"}
                </span>
              </td>
            </tr>
            {n.link && (
              <tr>
                <td className="bnc-detail-td-label">Linked Resource</td>
                <td>
                  {/* An internal route (every real link this page ever
                      renders) goes through the router, not a full reload —
                      same reason NotificationListItem.tsx (the header
                      dropdown's version of this same link) uses Link too. */}
                  {n.link.startsWith('/') ? (
                    <Link to={n.link} className="bnc-detail-link">{n.link} <Icon name="arrowUpRight" size={11} /></Link>
                  ) : (
                    <a href={n.link} target="_blank" rel="noreferrer" className="bnc-detail-link">{n.link} <Icon name="arrowUpRight" size={11} /></a>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {n.link && (n.link.startsWith('/') ? (
        <div className="bnc-detail-actions">
          <Link to={n.link} className="btn btn-primary bnc-detail-cta" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrowUpRight" size={14} /> Open Linked Resource
          </Link>
        </div>
      ) : (
        <div className="bnc-detail-actions">
          <a href={n.link} target="_blank" rel="noreferrer" className="btn btn-primary bnc-detail-cta" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrowUpRight" size={14} /> Open Linked Resource
          </a>
        </div>
      ))}
    </div>
  );
}
