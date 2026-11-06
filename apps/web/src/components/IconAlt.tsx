// ─── IconAlt.tsx — non-default icon-library rendering, loaded on demand ───
// Split out of Icon.tsx and pulled in via React.lazy() there so its imports
// (every mapped icon's SVG data) only enter a tenant's bundle the moment
// they actually pick 'twotone' or 'hugeicons' in the design system —
// everyone on the 'stroke' default pays nothing for this file existing.
// 'hugeicons' used to render via the free @hugeicons/react npm package
// (partial coverage); it now renders real owned Hugeicons Pro artwork
// (raw SVG markup, see hugeicons-pro-map.ts's own header) inline, the same
// way the hand-drawn stroke set and 'twotone' already render.
import React from 'react';
import { TwotoneIcon, TWOTONE_ICONS, type TwotoneIconName } from './ui/twotone-icon.js';
import { HUGEICONS_PRO_MAP } from './hugeicons-pro-map.js';
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

  if (library === 'hugeicons' && HUGEICONS_PRO_MAP[name]) {
    // Raw markup, not individual <path> props — Pro's own paths mix fill-
    // only and stroke-only elements per icon (see hugeicons-pro-map.ts's
    // header), so each icon's authored attributes are preserved verbatim
    // rather than forced through one uniform stroke-only render path.
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ color: color ?? 'currentColor', ...style }}
        onClick={onClick}
        role={role}
        {...rest}
        dangerouslySetInnerHTML={{ __html: HUGEICONS_PRO_MAP[name]! }}
      />
    );
  }

  return <>{fallback}</>;
}
