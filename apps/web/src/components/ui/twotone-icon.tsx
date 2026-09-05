import React from 'react';

/**
 * Twotone Rounded Icons — Hugeicons Inspired
 * Precision 24×24 SVG vectors with dual-layer rendering:
 * 1. Primary stroke layer (crisp rounded geometry, strokeLinecap="round")
 * 2. Secondary accent layer (semi-transparent 0.20-0.25 opacity fill/stroke)
 */

export interface TwotoneIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  secondaryColor?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

type TwotoneRenderer = (props: { color: string; secondaryColor: string; strokeWidth: number }) => React.ReactNode;

export const TWOTONE_ICONS: Record<string, TwotoneRenderer> = {
  shield: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        fill={secondaryColor}
        fillOpacity="0.22"
      />
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),

  lock: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <rect
        x="3"
        y="11"
        width="18"
        height="11"
        rx="4"
        fill={secondaryColor}
        fillOpacity="0.22"
      />
      <path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        x="3"
        y="11"
        width="18"
        height="11"
        rx="4"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle cx="12" cy="16" r="1.5" fill={color} />
      <path d="M12 17.5v2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  key: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" fill={secondaryColor} fillOpacity="0.22" />
      <circle cx="7.5" cy="15.5" r="4.5" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <path
        d="M11 12l9.5-9.5M16 7l2.5 2.5M18.5 4.5L21 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="15.5" r="1.5" fill={color} />
    </>
  ),

  folder: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2V7z"
        fill={secondaryColor}
        fillOpacity="0.2"
      />
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2V7z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M3 10h18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  document: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        fill={secondaryColor}
        fillOpacity="0.2"
      />
      <path
        d="M14 2v6h6M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M8 13h8M8 17h5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  download: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M4 17v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2"
        fill={secondaryColor}
        fillOpacity="0.22"
      />
      <path
        d="M4 17v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 3v12m0 0l4-4m-4 4l-4-4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  upload: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M4 17v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2"
        fill={secondaryColor}
        fillOpacity="0.22"
      />
      <path
        d="M4 17v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 15V3m0 0l4 4m-4-4L8 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  smartphone: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <rect x="6" y="2" width="12" height="20" rx="4" fill={secondaryColor} fillOpacity="0.2" />
      <rect
        x="6"
        y="2"
        width="12"
        height="20"
        rx="4"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle cx="12" cy="18" r="1" fill={color} />
      <path d="M10 5h4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  laptop: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <rect x="4" y="4" width="16" height="11" rx="2" fill={secondaryColor} fillOpacity="0.2" />
      <rect
        x="4"
        y="4"
        width="16"
        height="11"
        rx="2"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <path
        d="M2 19h20a1 1 0 0 0 1-1v-1H1v1a1 1 0 0 0 1 1z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={secondaryColor}
        fillOpacity="0.22"
      />
    </>
  ),

  user: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="12" cy="7" r="4" fill={secondaryColor} fillOpacity="0.25" />
      <circle cx="12" cy="7" r="4" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <path
        d="M4 20a8 8 0 0 1 16 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  users: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="9" cy="7" r="3.5" fill={secondaryColor} fillOpacity="0.22" />
      <circle cx="9" cy="7" r="3.5" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <path
        d="M2 19a7 7 0 0 1 14 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 3.5a3.5 3.5 0 0 1 0 7M22 19a7 7 0 0 0-7-6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </>
  ),

  grid: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" fill={secondaryColor} fillOpacity="0.25" />
      <rect x="14" y="3" width="7" height="7" rx="2" fill={secondaryColor} fillOpacity="0.25" />
      <rect x="3" y="14" width="7" height="7" rx="2" fill={secondaryColor} fillOpacity="0.25" />
      <rect x="14" y="14" width="7" height="7" rx="2" fill={secondaryColor} fillOpacity="0.25" />
      <rect x="3" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <rect x="14" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <rect x="3" y="14" width="7" height="7" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <rect x="14" y="14" width="7" height="7" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
    </>
  ),

  trash: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13"
        fill={secondaryColor}
        fillOpacity="0.2"
      />
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path
        d="M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M10 11v6M14 11v6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  clock: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="12" cy="12" r="9" fill={secondaryColor} fillOpacity="0.2" />
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <path d="M12 7v5l3 3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  checkCircle: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="12" cy="12" r="9" fill={secondaryColor} fillOpacity="0.2" />
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <path d="M8.5 12.5l2.5 2.5 5-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  alertTriangle: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        fill={secondaryColor}
        fillOpacity="0.22"
      />
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M12 9v4M12 17h.01" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  fingerprint: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="12" cy="12" r="9" fill={secondaryColor} fillOpacity="0.15" />
      <path
        d="M12 2a10 10 0 0 0-10 10M12 6a6 6 0 0 0-6 6M12 10a2 2 0 0 0-2 2M22 12c0 5.52-4.48 10-10 10M18 12a6 6 0 0 1-6 6M14 12a2 2 0 0 1-2 2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </>
  ),

  database: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" fill={secondaryColor} fillOpacity="0.25" />
      <ellipse cx="12" cy="5" rx="9" ry="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" stroke={color} strokeWidth={strokeWidth} />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" stroke={color} strokeWidth={strokeWidth} />
    </>
  ),

  sparkle: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"
        fill={secondaryColor}
        fillOpacity="0.25"
      />
      <path
        d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),

  bell: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        fill={secondaryColor}
        fillOpacity="0.22"
      />
      <path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  settings: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="12" cy="12" r="3" fill={secondaryColor} fillOpacity="0.3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
    </>
  ),

  creditCard: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" fill={secondaryColor} fillOpacity="0.22" />
      <rect x="2" y="5" width="20" height="14" rx="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <path d="M2 10h20" stroke={color} strokeWidth={strokeWidth} />
      <path d="M6 15h4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),

  link: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        fill={secondaryColor}
        fillOpacity="0.2"
      />
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),

  activity: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <circle cx="12" cy="12" r="9" fill={secondaryColor} fillOpacity="0.15" />
      <path
        d="M22 12h-4l-3 9L9 3l-3 9H2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),

  building: ({ color, secondaryColor, strokeWidth }) => (
    <>
      <path d="M4 21V7l8-4 8 4v14" fill={secondaryColor} fillOpacity="0.2" />
      <path d="M3 21h18M4 21V7l8-4 8 4v14M9 21v-5h6v5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 10h2M14 10h2M8 14h2M14 14h2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ),
};

export type TwotoneIconName = keyof typeof TWOTONE_ICONS;

export interface TwotoneIconComponentProps extends React.SVGProps<SVGSVGElement> {
  name: TwotoneIconName;
  size?: number;
  color?: string;
  secondaryColor?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function TwotoneIcon({
  name,
  size = 20,
  color = 'currentColor',
  secondaryColor = 'currentColor',
  strokeWidth = 1.75,
  className,
  style,
  ...rest
}: TwotoneIconComponentProps) {
  const render = TWOTONE_ICONS[name];
  if (!render) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      {...rest}
    >
      {render({ color, secondaryColor, strokeWidth })}
    </svg>
  );
}
