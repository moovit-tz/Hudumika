import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePageSEO } from "../hooks/usePageSEO.js";
import { Icon } from "../components/Icon.js";
import { apiFetch } from "../lib/api.js";
import { NOTIF_TYPE_CFG, notifRelTime } from "../components/NotificationListItem.js";
import "./BlissNotifications.css";

const PAGE_SIZE = 30;

type FilterTab = "all" | "unread" | "task" | "support" | "announcement" | "security" | "chat" | "mention";

const FILTER_TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: "all",          label: "All",           icon: "inbox" },
  { key: "unread",       label: "Unread",        icon: "bell" },
  { key: "task",         label: "Tasks",         icon: "checkCircle" },
  { key: "support",      label: "Support",       icon: "headphones" },
  { key: "announcement", label: "Announcements", icon: "volume2" },
  { key: "security",     label: "Security",      icon: "shield" },
  { key: "chat",         label: "Chat",          icon: "chatBubble" },
  { key: "mention",      label: "Mentions",      icon: "atSign" },
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

  const load = useCallback(async (currentOffset: number, currentTab: FilterTab) => {
    setLoading(true);
    try {
      const unreadOnly = currentTab === "unread";
      const data = await apiFetch(`/v1/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}&unread_only=${unreadOnly}`);
      const list: any[] = data.notifications ?? [];
      const filtered = (currentTab === "all" || currentTab === "unread")
        ? list
        : list.filter((n: any) => n.type === currentTab);
      setNotifs(filtered);
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
      apiFetch(`/v1/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    }
    setSelected({ ...n, read: true });
  }

  function handleMarkAllRead() {
    setNotifs(prev => prev.map(x => ({ ...x, read: true })));
    setUnreadCount(0);
    apiFetch("/v1/notifications/read-all", { method: "PATCH" }).then(() => load(offset, tab)).catch(() => {});
  }

  const searchLower = search.toLowerCase();
  const displayed = search
    ? notifs.filter(n => n.title?.toLowerCase().includes(searchLower) || n.message?.toLowerCase().includes(searchLower))
    : notifs;

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="bnc-root">
      {/* LEFT PANEL */}
      <div className="bnc-left">
        <div className="bnc-left-hdr">
          <div className="bnc-left-hdr-top">
            <div className="bnc-title-block">
              <span className="bnc-title">Notifications</span>
              {unreadCount > 0 && <span className="bnc-badge">{unreadCount}</span>}
            </div>
            <div className="bnc-hdr-actions">
              {unreadCount > 0 && (
                <button type="button" className="bnc-icon-btn" title="Mark all read" onClick={handleMarkAllRead}>
                  <Icon name="checkCircle" size={15} />
                </button>
              )}
              <button type="button" className="bnc-icon-btn" title="Refresh" onClick={() => load(offset, tab)}>
                <Icon name="refreshCw" size={15} />
              </button>
            </div>
          </div>
          <div className="bnc-search-wrap">
            <Icon name="search" size={14} className="bnc-search-icon" />
            <input
              className="bnc-search"
              placeholder="Search notifications…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="bnc-search-clear" onClick={() => setSearch("")}>
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
          <div className="bnc-chips">
            {FILTER_TABS.map(t => (
              <button key={t.key} type="button" className={`bnc-chip${tab === t.key ? " bnc-chip--active" : ""}`} onClick={() => switchTab(t.key)}>
                <Icon name={t.icon as any} size={12} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bnc-list">
          {loading ? (
            <div className="bnc-empty">
              <div className="bnc-empty-spin" />
              <span className="bnc-empty-label">Loading…</span>
            </div>
          ) : displayed.length === 0 ? (
            <div className="bnc-empty">
              <div className="bnc-empty-ico"><Icon name="bell" size={28} /></div>
              <span className="bnc-empty-label">{search ? "No matches" : "All caught up!"}</span>
              <span className="bnc-empty-sub">{search ? "Try a different search term" : "No notifications here yet"}</span>
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

      {/* RIGHT PANEL */}
      <div className="bnc-right">
        {selected ? (
          <NotifDetail n={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="bnc-detail-empty">
            <div className="bnc-detail-empty-ico"><Icon name="mail" size={36} /></div>
            <span className="bnc-detail-empty-label">Select a notification</span>
            <span className="bnc-detail-empty-sub">Click any item on the left to view its full details here</span>
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
        {n.avatar_url ? (
          <img src={n.avatar_url} alt="" className="bnc-row-avatar" />
        ) : (
          <div className="bnc-row-initials" style={{ background: cfg.color }}>
            {(n.title || "?")[0]?.toUpperCase()}
          </div>
        )}
        <div className="bnc-row-type-badge" style={{ color: cfg.color }}>
          <Icon name={cfg.icon as any} size={9} strokeWidth={2.5} />
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
          <Icon name={cfg.icon as any} size={20} />
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
        <button className="bnc-icon-btn" title="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {n.message && (
        <div className="bnc-detail-callout" style={{ borderLeftColor: cfg.color }}>
          <Icon name={cfg.icon as any} size={14} style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }} />
          <div className="bnc-detail-callout-text">{n.message}</div>
        </div>
      )}

      <div className="bnc-detail-section">
        <h3 className="bnc-detail-section-title">Details</h3>
        <table className="bnc-detail-table">
          <tbody>
            <tr>
              <td className="bnc-detail-td-label">Type</td>
              <td><span className="bnc-tag" style={{ background: `${cfg.color}18`, color: cfg.color }}>{n.type ?? "info"}</span></td>
            </tr>
            <tr>
              <td className="bnc-detail-td-label">Received</td>
              <td>{date.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="bnc-detail-td-label">Status</td>
              <td>
                <span className={`bnc-status-badge bnc-status-badge--${n.read ? "read" : "unread"}`}>
                  {n.read ? "Read" : "Unread"}
                </span>
              </td>
            </tr>
            {n.link && (
              <tr>
                <td className="bnc-detail-td-label">Link</td>
                <td><a href={n.link} className="bnc-detail-link">{n.link} <Icon name="arrowUpRight" size={11} /></a></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {n.link && (
        <div className="bnc-detail-actions">
          <a href={n.link} className="btn btn-primary bnc-detail-cta">
            <Icon name="arrowUpRight" size={14} /> Open linked page
          </a>
        </div>
      )}
    </div>
  );
}
