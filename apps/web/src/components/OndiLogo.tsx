import React, { useState } from 'react';

/**
 * Ondi's real brand mark. `/ondi-icon.svg` (full gradient badge) and
 * `/ondi-icon-white.svg` (glyph only, for use directly on a dark/colored
 * surface with no badge of its own) are the exact source files, not a
 * hand-traced approximation — same convention as the platform's own
 * logo-light.svg/logo-dark.svg in apps/web/public, referenced by <img>
 * with inline SVG vector fallback so it can never break under any conditions.
 */
export function OndiLogo({
  size = 28,
  variant = 'full',
  className,
  style,
}: {
  size?: number;
  variant?: 'full' | 'white';
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const src = variant === 'white' ? '/ondi-icon-white.svg' : '/ondi-icon.svg';

  if (failed) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 3000 3000"
        className={className}
        style={{ display: 'block', flexShrink: 0, ...style }}
        aria-label="Ondi"
        fill="none"
      >
        <path fill="#4253d1" d="M3000,1500c0,1235.25-264.75,1500-1500,1500-752.42,0-1144.76-98.23-1336.51-454.2,17.14.44,34.31.66,51.53.66,1188.76,0,2152.42-1030.63,2152.42-2301.99,0-52.37-1.63-104.33-4.86-155.82,506.63,154.38,637.42,543.16,637.42,1411.36Z" />
        <path fill="#4e76e5" d="M2367.44,244.46c0,1271.36-963.66,2301.99-2152.42,2301.99-17.22,0-34.4-.22-51.53-.66C40.45,2317.38,0,1982.83,0,1500,0,264.75,264.75,0,1500,0,1867.05,0,2148.41,23.37,2362.58,88.64c3.23,51.49,4.86,103.45,4.86,155.82Z" />
      </svg>
    );
  }

  return (
    <img
      src={src}
      alt="Ondi"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      onError={() => setFailed(true)}
    />
  );
}

export default OndiLogo;
