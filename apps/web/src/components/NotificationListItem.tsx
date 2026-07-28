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
export const NOTIF_TYPE_CFG: Record<string, { icon: IconName; variant: FeaturedIconProps['variant'] }> = {
  tag:          { icon: 'tag',         variant: 'info'    },
  support:      { icon: 'headphones',  variant: 'brand'   },
  announcement: { icon: 'volume2',     variant: 'warning' },
  security:     { icon: 'shield',      variant: 'error'   },
  task:         { icon: 'checkCircle', variant: 'success' },
  info:         { icon: 'info',        variant: 'info'    },
  chat:         { icon: 'chatBubble',  variant: 'brand'   },
  mention:      { icon: 'atSign',      variant: 'warning' },
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
      {n.avatar_url ? (
        <img src={n.avatar_url} alt="" className="notif-panel-item-avatar" />
      ) : (
        <FeaturedIcon variant={cfg.variant} size="sm" shape="square" className="h-9 w-9">
          <Icon name={cfg.icon} size={17} strokeWidth={2} />
        </FeaturedIcon>
      )}
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
