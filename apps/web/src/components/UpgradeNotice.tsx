import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Button } from './ui/button.js';

interface UpgradeNoticeProps {
  icon?: IconName;
  title: string;
  message: string;
  /** Where "Upgrade" sends the admin — defaults to the add-ons section of Subscription. */
  href?: string;
}

/**
 * The inline counterpart to RequireAppEnabled's FullScreenNotice — that one
 * replaces a whole app shell (an app not on the plan at all); this one sits
 * inside an already-entitled page to gate one section/action that needs a
 * further add-on (e.g. SSO inside an already-accessible Ondi). No inline
 * paywall existed anywhere in the app before this — every prior "not on your
 * plan" moment was full-screen-or-nothing.
 */
export function UpgradeNotice({ icon = 'lock', title, message, href = '/subscription?v=plans' }: UpgradeNoticeProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '16px 18px', borderRadius: 'var(--r)',
      border: '1px solid var(--teal-m)', background: 'var(--teal-l)',
    }}>
      <FeaturedIcon variant="brand" size="md">
        <Icon name={icon} size={18} />
      </FeaturedIcon>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>{message}</div>
      </div>
      <Button asChild size="sm" variant="default" style={{ flexShrink: 0 }}>
        <Link to={href}>Upgrade</Link>
      </Button>
    </div>
  );
}
