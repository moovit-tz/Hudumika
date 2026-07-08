import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import { NotificationCentre } from './NotificationCentre.js';
import { AppLauncher } from './AppLauncher.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranding } from '../hooks/useBranding.js';
import { apiFetch } from '../lib/api.js';
import { APP_COLORS } from '../shells/WorkspaceApp.js';
import './BlissRail.css';

// Bedesk-style vertical icon rail — Bliss-only chrome, replacing the
// shared AppHeader (top bar) + AppSidebar (240px labeled sidebar) that
// every other app still uses unchanged. See AppLauncher.tsx for the
// (shared, unmodified) app-switcher this reuses.

const NAV: Array<{ label: string; icon: IconName; path: string; exact?: boolean }> = [
  { label: 'Overview',       icon: 'activity',       path: '/bliss', exact: true },
  { label: 'All Tickets',    icon: 'headphones',      path: '/bliss/tickets' },
  { label: 'Live Chat',      icon: 'messageSquare',   path: '/bliss/chat' },
  { label: 'Knowledge Base', icon: 'fileText',        path: '/bliss/kb' },
  { label: 'Escalations',    icon: 'arrowUpRight',    path: '/bliss/escalations' },
  { label: 'Settings',       icon: 'settings',        path: '/bliss/settings' },
];

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, onClose]);
}

export function BlissRail() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const { pathname } = useLocation();
  const blissColor = branding.getAppColor('bliss', APP_COLORS.bliss);

  // ── Theme toggle ──
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  // ── Notifications ──
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifs = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/notifications');
      const list: any[] = Array.isArray(data) ? data : (data?.notifications ?? []);
      setNotifs(list);
      setUnreadCount(list.filter((n: any) => !n.read).length);
    } catch { /* silently ignore */ }
  }, []);
  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  function handleMarkRead(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }
  function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    apiFetch('/v1/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  }

  // ── User dropdown ──
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  useClickOutside(userRef, () => setUserOpen(false));

  return (
    <>
      <nav className="bliss-rail">
        <Link to="/bliss" className="bliss-rail-brand" style={{ '--bliss-brand': blissColor } as React.CSSProperties} title="Bliss">
          <Icon name="chatBubble" size={18} />
        </Link>

        <AppLauncher
          renderTrigger={({ open, onClick }) => (
            <button type="button" className={`bliss-rail-icon-btn${open ? ' bliss-rail-icon-btn--open' : ''}`} onClick={onClick} title="All apps">
              <Icon name="grid" size={18} />
            </button>
          )}
        />

        <div className="bliss-rail-divider" />

        <div className="bliss-rail-nav">
          {NAV.map(item => {
            const active = item.exact ? pathname === item.path : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`bliss-rail-icon-btn${active ? ' bliss-rail-icon-btn--active' : ''}`}
                title={item.label}
              >
                <Icon name={item.icon} size={18} />
              </Link>
            );
          })}
        </div>

        <div className="bliss-rail-spacer" />

        <button type="button" className="bliss-rail-icon-btn" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>

        <div className="bliss-rail-rel">
          <button
            type="button"
            className={`bliss-rail-icon-btn${notifOpen ? ' bliss-rail-icon-btn--open' : ''}`}
            onClick={() => setNotifOpen(d => !d)}
            title="Notifications"
          >
            <Icon name="bell" size={18} />
            {unreadCount > 0 && (
              <span className="bliss-rail-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
        </div>

        <div className="bliss-rail-rel" ref={userRef}>
          <button
            type="button"
            className="bliss-rail-avatar"
            onClick={() => setUserOpen(d => !d)}
            title={user?.name ?? 'Account'}
          >
            {getInitials(user?.name)}
          </button>
          {userOpen && (
            <div className="bliss-rail-user-dropdown">
              <div className="bliss-rail-user-info">
                <span className="bliss-rail-user-name">{user?.name ?? '—'}</span>
                <span className="bliss-rail-user-email">{user?.email ?? '—'}</span>
                <span className="bliss-rail-user-role">{user?.role ?? '—'}</span>
              </div>
              <div className="bliss-rail-user-actions">
                <Link to="/profile" className="bliss-rail-user-action" onClick={() => setUserOpen(false)}>
                  <Icon name="user" size={14} /><span>My profile</span>
                </Link>
                <button type="button" className="bliss-rail-user-action bliss-rail-user-action--signout" onClick={() => logout()}>
                  <Icon name="arrowRight" size={14} /><span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {notifOpen && (
        <NotificationCentre
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          notifs={notifs}
          unreadCount={unreadCount}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onReload={loadNotifs}
        />
      )}
    </>
  );
}
