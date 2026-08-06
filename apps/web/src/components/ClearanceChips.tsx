import React from 'react';
import { Icon, type IconName } from './Icon.js';
import { FLAG_CFG, CH_CFG, type Flag, type Channel } from '../pages/clearanceData.js';

/**
 * The customs-lane flag and the comms-channel badge.
 *
 * These lived in `pages/ShipmentBoard.tsx`, which no route renders, and
 * `ShipmentDetail` imported them from there — so a live page depended on an
 * unrouted one, and deleting the board would have taken two chips the
 * shipment view needs with it. They are components, not a page, so they live
 * here; both files import them from this one now.
 *
 * FLAG_CFG and CH_CFG already lived in `clearanceData.ts`, so nothing about
 * the colours or labels moves — only where the markup is defined.
 */

/** Customs lane: green / yellow / red channel, plus the other job flags. */
export function FlagChip({ flag, hero }: { flag: Flag; hero?: boolean }) {
  const cfg = FLAG_CFG[flag];
  if (!cfg) return null;
  // `hero` is the variant that sits on the shipment cover photo: a translucent
  // dark pill, because a light tint would disappear against an arbitrary image.
  if (hero) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', whiteSpace: 'nowrap', letterSpacing: '0.04em', backdropFilter: 'blur(4px)' }}>
        <Icon name={cfg.icon as IconName} size={10} color={cfg.color} />{cfg.label}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}44`, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>
      <Icon name={cfg.icon as IconName} size={10} />{cfg.label}
    </span>
  );
}

/** Which channel an update arrived on — internal, WhatsApp, email, SMS, Teams. */
export function ChBadge({ ch }: { ch: Channel }) {
  const cfg = CH_CFG[ch];
  if (!cfg) return null;
  return (
    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}55` }}>
      {cfg.label}
    </span>
  );
}
