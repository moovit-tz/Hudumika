import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';
import { FeaturedIcon, type FeaturedIconProps } from './ui/featured-icon.js';

type IconName = React.ComponentProps<typeof Icon>['name'];

// Mapped onto FeaturedIcon's 6 semantic variants (brand/gray/success/warning/
// error/info) instead of the hand-rolled hex bg/fg pairs this used to carry —
// those never actually themed for dark mode (no [data-theme="dark"] override
// existed for them), where FeaturedIcon's tokens already do, per CLAUDE.md's
// design-system rule that icon-in-a-tinted-chip patterns reuse the shared
// --teal-l/--green-l/etc. tokens rather than inventing their own colors.
export const NOTIF_TYPE_CFG: Record<string, { icon: IconName; variant: FeaturedIconProps['variant']; color: string }> = {
  tag:          { icon: 'tag',         variant: 'info',    color: 'var(--teal)' },
  support:      { icon: 'headphones',  variant: 'brand',   color: 'var(--blue)' },
  announcement: { icon: 'volume2',     variant: 'warning', color: 'var(--gold)' },
  security:     { icon: 'shield',      variant: 'error',   color: 'var(--red)'  },
  task:         { icon: 'checkCircle', variant: 'success', color: 'var(--green)'},
  info:         { icon: 'info',        variant: 'info',    color: 'var(--blue)' },
  chat:         { icon: 'chatBubble',  variant: 'brand',   color: 'var(--purple)'},
  mention:      { icon: 'atSign',      variant: 'warning', color: 'var(--gold)' },
};

export function notifRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) !== 1 ? 's' : ''} ago`;
}

/**
 * UBold / Coderthemes style Notification Row item
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
    'notif-item',
    n.read ? '' : 'notif-item--unread',
    isClickable ? 'notif-item--clickable' : '',
  ].filter(Boolean).join(' ');

  const initialLetter = (n.title || '?').trim()[0]?.toUpperCase() ?? '?';

  // No PersonAvatar here — a notification carries no actor id, only a
  // type/title/message (see notifications.routes.ts / migration
  // 014_notifications_mail.sql), so there's no "who" to fetch a picture
  // for. The `avatar_url` field this used to read was never actually sent
  // by the API; this always rendered initials in practice, just via a
  // branch that could never fire the other way.
  const content = (
    <>
      <div className="notif-item-avatar-wrap">
        <div className="notif-item-initials" style={{ background: cfg.color }}>
          {initialLetter}
        </div>
        <div className="notif-item-badge" style={{ color: cfg.color }}>
          <Icon name={cfg.icon} size={10} strokeWidth={2.2} />
        </div>
      </div>

      <div className="notif-item-body">
        <div className={`notif-item-title${n.read ? '' : ' notif-item-title--unread'}`}>
          {n.title}
        </div>
        {n.message && <div className="notif-item-msg">{n.message}</div>}
        <div className="notif-item-time">{notifRelTime(n.created_at)}</div>
      </div>

      {!n.read && <div className="notif-item-dot" />}
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
