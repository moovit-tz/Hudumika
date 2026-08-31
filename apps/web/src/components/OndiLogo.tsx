import React from 'react';

/**
 * Ondi's real brand mark. `/ondi-icon.svg` (full gradient badge) and
 * `/ondi-icon-white.svg` (glyph only, for use directly on a dark/colored
 * surface with no badge of its own) are the exact source files, not a
 * hand-traced approximation — same convention as the platform's own
 * logo-light.svg/logo-dark.svg in apps/web/public, referenced by <img>
 * rather than inlined, since both are non-trivial vector artwork.
 */
export function OndiLogo({ size = 28, variant = 'full' }: { size?: number; variant?: 'full' | 'white' }) {
  const src = variant === 'white' ? '/ondi-icon-white.svg' : '/ondi-icon.svg';
  return <img src={src} alt="Ondi" width={size} height={size} style={{ display: 'block', flexShrink: 0 }} />;
}

export default OndiLogo;
