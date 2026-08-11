import React, { useState } from 'react';
import { Icon } from './Icon.js';

/**
 * The platform's section card — one uniform shell for every panel on a page.
 * Header sits on the card's white; the descriptive body below sits on --bg (a
 * light grey) so the content area reads as distinct from its label. Foldable by
 * default (chevron in the header) — the activity/workflow cards set the pattern
 * and every card now follows it; pass collapsible={false} for something that
 * must never be hidden, padded={false} for a body that manages its own padding
 * (lists), and an `action` for a header-right control (Card stops the click
 * propagating so the action never toggles the fold).
 *
 * Extracted from ShipmentDetail so the same card is reusable across ClearOS
 * (and, later, every app) rather than re-implemented per page.
 */
export function SectionCard({ title, action, padded = true, collapsible = true, defaultOpen = true, children }: {
  title?: string;
  action?: React.ReactNode;
  padded?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {title && (
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: showBody ? '1px solid var(--border)' : 'none', gap: 8, cursor: collapsible ? 'pointer' : 'default', userSelect: collapsible ? 'none' : undefined, background: 'var(--white)' }}
          onClick={collapsible ? () => setOpen(o => !o) : undefined}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {collapsible && <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} color="var(--ink3)" />}
            {title}
          </span>
          {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
        </div>
      )}
      {showBody && <div style={{ padding: padded ? '18px' : 0, background: 'var(--card-sunken)' }}>{children}</div>}
    </div>
  );
}
