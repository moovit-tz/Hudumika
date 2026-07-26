import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';

type IconName = React.ComponentProps<typeof Icon>['name'];

export const NOTIF_TYPE_CFG: Record<string, { icon: IconName; bg: string; fg: string }> = {
  tag:          { icon: 'tag',         bg: '#e0f2fe', fg: '#0284c7' },
  support:      { icon: 'headphones',  bg: '#f3e8ff', fg: '#7c3aed' },
  announcement: { icon: 'volume2',   bg: '#fef9c3', fg: '#ca8a04' },
  security:     { icon: 'shield',      bg: '#fee2e2', fg: '#dc2626' },
  task:         { icon: 'checkCircle', bg: '#ecfdf5', fg: '#059669' },
  info:         { icon: 'info',        bg: '#f0f9ff', fg: '#0284c7' },
  chat:         { icon: 'chatBubble',  bg: '#f3e8ff', fg: '#7c3aed' },
  mention:      { icon: 'atSign',      bg: '#fef3c7', fg: '#d97706' },
};

export function notifRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * One notification row — shared by the header dropdown (NotificationCentre.tsx)
 * and the full-page Notification Centre (BlissNotifications.tsx), so both
 * stay visually identical and only ever need one place to change.
 */
export function NotificationListItem({ n, onMarkRead, onNavigate }: {
  n: any;
  onMarkRead: (id: string, link?: string) => void;
  onNavigate?: () => void;
}) {
  const cfg = NOTIF_TYPE_CFG[n.type] ?? NOTIF_TYPE_CFG.info;
  const link = n.link || (n.type === 'chat' ? '/chat' : undefined);
  const isClickable = !!link;
  const className = [
    'notif-panel-item',
    n.read ? '' : 'notif-panel-item--unread',
    isClickable ? 'notif-panel-item--clickable' : '',
  ].filter(Boolean).join(' ');

  const content = (
    <>
      <div className="notif-panel-item-icon" data-type={n.avatar_url ? undefined : (n.type ?? 'info')}>
        {n.avatar_url
          ? <img src={n.avatar_url} alt="" className="notif-panel-item-avatar" />
          : <Icon name={cfg.icon} size={17} color={cfg.fg} strokeWidth={2} />}
      </div>
      <div className="notif-panel-item-body">
        <div className={`notif-panel-item-title${n.read ? '' : ' notif-panel-item-title--bold'}`}>{n.title}</div>
        {n.message && <div className="notif-panel-item-msg">{n.message}</div>}
        <div className="notif-panel-item-meta">
          {n.entity_label && <span className="notif-panel-item-entity">{n.entity_label}</span>}
          <span className="notif-panel-item-time">{notifRelTime(n.created_at)}</span>
        </div>
      </div>
      {!n.read && <div className="notif-panel-item-dot" />}
    </>
  );

  return isClickable ? (
    <Link to={link} className={className} onClick={() => { onMarkRead(n.id, link); onNavigate?.(); }}>
      {content}
    </Link>
  ) : (
    <div className={className} onClick={() => onMarkRead(n.id, undefined)}>
      {content}
    </div>
  );
}
