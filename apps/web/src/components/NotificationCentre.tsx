import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';
import { useLocale } from '../hooks/useLocale.js';
import { NotificationListItem } from './NotificationListItem.js';
import './NotificationCentre.css';

// ── Props ─────────────────────────────────────────────────────

interface NotificationCentreProps {
  onClose: () => void;
  notifs: any[];
  unreadCount: number;
  onMarkRead: (id: string, link?: string) => void;
  onMarkAllRead: () => void;
  onReload: () => void;
}

// ── Component ─────────────────────────────────────────────────
// Rendered as the arbitrary-JSX child of a DropdownMenuContent by AppHeader —
// Radix owns the open/close, positioning, portal and outside-click/Escape
// handling; this component only owns the tab filter + list rendering.

export const NotificationCentre: React.FC<NotificationCentreProps> = ({
  onClose, notifs, unreadCount,
  onMarkRead, onMarkAllRead, onReload,
}) => {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  useEffect(() => { onReload(); }, []);

  const filtered = activeTab === 'all'
    ? notifs
    : notifs.filter(n => !n.read);

  return (
      <div className="notif-panel notif-panel--open">

        {/* ── Header (navy) ── */}
        <div className="notif-panel-hdr">
          <div className="notif-panel-hdr-top">
            <div className="notif-panel-hdr-left">
              <span className="notif-panel-title">{t('notif.title')}</span>
              {unreadCount > 0 && (
                <span className="notif-panel-badge">{unreadCount}</span>
              )}
            </div>
            <div className="notif-panel-hdr-right">
              {unreadCount > 0 && (
                <button type="button" className="notif-panel-mark-all" onClick={onMarkAllRead}>
                  {t('notif.markAllRead')}
                </button>
              )}
              <button
                type="button"
                className="notif-panel-close"
                onClick={onClose}
                title={t('notif.title')}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="notif-panel-tabs">
            <button
              type="button"
              className={`notif-panel-tab${activeTab === 'all' ? ' notif-panel-tab--active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              {t('notif.all')}
              <span className="notif-panel-tab-count">{notifs.length}</span>
            </button>
            <button
              type="button"
              className={`notif-panel-tab${activeTab === 'unread' ? ' notif-panel-tab--active' : ''}`}
              onClick={() => setActiveTab('unread')}
            >
              {t('notif.unread')}
              {unreadCount > 0 && (
                <span className="notif-panel-tab-count">{unreadCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* ── Notification list ── */}
        <div className="notif-panel-scroll">
          {filtered.length === 0 ? (
            <div className="notif-panel-empty">
              <div className="notif-panel-empty-icon">
                <Icon name="bell" size={26} color="var(--border2)" />
              </div>
              <span className="notif-panel-empty-text">{activeTab === 'unread' ? t('notif.noUnread') : t('notif.noNotifications')}</span>
              <span className="notif-panel-empty-sub">{t('notif.caughtUp')}</span>
            </div>
          ) : filtered.map((n: any) => (
            <NotificationListItem key={n.id} n={n} onMarkRead={onMarkRead} onNavigate={onClose} />
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="notif-panel-footer">
          <Link
            to="/bliss/notifications"
            className="notif-panel-view-all"
            onClick={() => onClose()}
          >
            {t('notif.openChat')}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>
      </div>
  );
};
