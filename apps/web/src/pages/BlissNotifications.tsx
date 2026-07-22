import React, { useCallback, useEffect, useState } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { NotificationListItem } from '../components/NotificationListItem.js';
import '../components/NotificationCentre.css';
import './BlissNotifications.css';

const PAGE_SIZE = 25;

export function BlissNotifications() {
  usePageSEO('Notification Centre', 'Every notification across the platform, in one place.');
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (currentOffset: number, unreadOnly: boolean) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/v1/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}&unread_only=${unreadOnly}`);
      setNotifs(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
      setTotalCount(data.total_count ?? 0);
    } catch { /* silently ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(offset, tab === 'unread');
  }, [offset, tab, load]);

  function switchTab(next: 'all' | 'unread') {
    setTab(next);
    setOffset(0);
  }

  function handleMarkRead(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }

  function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    apiFetch('/v1/notifications/read-all', { method: 'PATCH' }).then(() => load(offset, tab === 'unread')).catch(() => {});
  }

  const shownCount = tab === 'unread' ? unreadCount : totalCount;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(shownCount / PAGE_SIZE));

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Bliss', 'Notification Centre']}
        titlePlain="Notification"
        titleEm="centre"
        subtitle="Every notification across the platform — not just the last 50 in the bell dropdown"
        actions={
          unreadCount > 0
            ? <button type="button" className="btn btn-secondary" onClick={handleMarkAllRead}><Icon name="checkCircle" size={14} /> Mark all read</button>
            : undefined
        }
      />

      <div className="bliss-notif-tabs">
        <button type="button" className={`bliss-notif-tab${tab === 'all' ? ' bliss-notif-tab--active' : ''}`} onClick={() => switchTab('all')}>
          All <span className="bliss-notif-tab-count">{totalCount}</span>
        </button>
        <button type="button" className={`bliss-notif-tab${tab === 'unread' ? ' bliss-notif-tab--active' : ''}`} onClick={() => switchTab('unread')}>
          Unread {unreadCount > 0 && <span className="bliss-notif-tab-count">{unreadCount}</span>}
        </button>
      </div>

      <div className="bliss-notif-list">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : notifs.length === 0 ? (
          <div className="notif-panel-empty">
            <div className="notif-panel-empty-icon"><Icon name="bell" size={26} color="var(--border2)" /></div>
            <span className="notif-panel-empty-text">{tab === 'unread' ? 'No unread notifications' : 'No notifications'}</span>
            <span className="notif-panel-empty-sub">You're all caught up!</span>
          </div>
        ) : notifs.map(n => (
          <NotificationListItem key={n.id} n={n} onMarkRead={handleMarkRead} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="bliss-notif-pagination">
          <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, shownCount)} of {shownCount}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}>‹ Prev</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setOffset(o => o + PAGE_SIZE)}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
