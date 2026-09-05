import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { HugeiconsIconProps } from '@hugeicons/react';

export interface HugeIconProps extends Omit<HugeiconsIconProps, 'icon'> {
  icon: any;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function HugeIcon({
  icon,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.75,
  className,
  style,
  ...rest
}: HugeIconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      {...rest}
    />
  );
}

export { HugeiconsIcon };
export type { HugeiconsIconProps };
export { TwotoneIcon, TWOTONE_ICONS } from './ui/twotone-icon.js';
export type { TwotoneIconName, TwotoneIconComponentProps } from './ui/twotone-icon.js';
