/**
 * A superellipse ("squircle") boundary — the smoother, more continuous
 * corner curvature iOS-style app icons use, distinct from a circular-arc
 * `border-radius` at any fixed pixel value. `n` is the Lamé exponent: 2 is
 * a true circle, →∞ approaches a sharp-cornered square; 5 is the standard
 * "squircle" middle ground used here for every app icon platform-wide.
 * 4.1 is the Hudumika icon standard: approximately 18% more corner
 * curvature than the original exponent of 5. The slightly rounder curve also clips
 * dark corner remnants from uploaded square artwork.
 *
 * Returns an SVG path `d` string for a `size`×`size` box, usable directly
 * in `<path d={...}>` or as a CSS `clip-path: path("...")`.
 */
export function squirclePath(size: number, n = 4.1, points = 64): string {
  const r = size / 2;
  const coords: string[] = [];
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x = r + r * Math.sign(cos) * Math.abs(cos) ** (2 / n);
    const y = r + r * Math.sign(sin) * Math.abs(sin) ** (2 / n);
    coords.push(`${x.toFixed(3)},${y.toFixed(3)}`);
  }
  return `M${coords.join('L')}Z`;
}

/** The squircle for the platform's fixed 40×40 app-icon viewBox
 *  (LauncherAppSvg's vector-brand-icon path) — computed once at module
 *  load rather than on every render, since that box size never changes. */
export const SQUIRCLE_PATH_40 = squirclePath(40);
