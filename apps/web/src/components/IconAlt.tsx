// ─── IconAlt.tsx — non-default icon-library rendering, loaded on demand ───
// Split out of Icon.tsx and pulled in via React.lazy() there so its imports
// (the Hugeicons React runtime + every mapped icon's SVG data) only enter a
// tenant's bundle the moment they actually pick 'twotone' or 'hugeicons' in
// the design system — everyone on the 'stroke' default (the vast majority)
// pays nothing for this file existing.
import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { TwotoneIcon, TWOTONE_ICONS, type TwotoneIconName } from './ui/twotone-icon.js';
import { HUGEICONS_MAP } from './hugeicons-map.js';
import type { IconName } from './Icon.js';
import type { IconLibraryId } from '../hooks/useDesignSystem.js';

export interface IconAltProps {
  name: IconName;
  library: Exclude<IconLibraryId, 'stroke'>;
  size: number;
  strokeWidth: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  role?: 'button';
  'aria-hidden'?: true;
  /** Icon.tsx's own already-rendered stroke SVG for this name — shown
   *  whenever the chosen library doesn't cover it, so a name outside a
   *  smaller library's coverage never goes blank, it just quietly reads as
   *  the platform default instead. */
  fallback: React.ReactNode;
}

export default function IconAlt({ name, library, size, strokeWidth, color, className, style, onClick, role, fallback, ...rest }: IconAltProps) {
  if (library === 'twotone' && name in TWOTONE_ICONS) {
    return (
      <TwotoneIcon
        name={name as TwotoneIconName}
        size={size}
        strokeWidth={strokeWidth}
        color={color ?? 'currentColor'}
        secondaryColor={color ?? 'currentColor'}
        className={className}
        style={style}
        onClick={onClick}
        role={role}
        {...rest}
      />
    );
  }

  if (library === 'hugeicons' && HUGEICONS_MAP[name]) {
    return (
      <HugeiconsIcon
        icon={HUGEICONS_MAP[name]!}
        size={size}
        strokeWidth={strokeWidth}
        color={color ?? 'currentColor'}
        className={className}
        style={style}
        onClick={onClick}
        role={role}
        {...rest}
      />
    );
  }

  return <>{fallback}</>;
}
