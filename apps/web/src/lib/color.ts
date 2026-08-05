// ─── Shared hex color math ──────────────────────────────────────
// Used to derive accent tints/shades (e.g. per-app --teal-l/-m/-d,
// design-token semantic color tints) from a single source hex.

export function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  if (c.length !== 6) return [100, 116, 139];
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

export function darkenHex(hex: string, factor = 0.15): string {
  const [r, g, b] = parseHex(hex);
  const d = (x: number) => Math.max(0, Math.round(x * (1 - factor))).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

export function lightenHex(hex: string, factor = 0.15): string {
  const [r, g, b] = parseHex(hex);
  const l = (x: number) => Math.min(255, Math.round(x + (255 - x) * factor)).toString(16).padStart(2, '0');
  return `#${l(r)}${l(g)}${l(b)}`;
}

// Light-mode tint: a subtle rgba wash of the source color over a light background.
export function tintRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Converts a hex color to an "H S% L%" triplet — the format Tailwind's config
// expects for hsl(var(--x)) tokens (--primary, --ring, --sidebar-primary, ...).
export function hexToHslTriplet(hex: string): string {
  const [r, g, b] = parseHex(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

// ─── WCAG contrast ──────────────────────────────────────────────
//
// The two foregrounds the app puts on a brand-coloured surface. Kept as hex
// alongside their HSL form so contrast can actually be measured against them
// rather than guessed at.
const FG_DARK = { hex: '#0b1526', hsl: '216 68% 14%' };
const FG_LIGHT = { hex: '#f8fafc', hsl: '210 40% 98%' };

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two hex colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Picks the more readable of the app's two foregrounds for a background.
 *
 * The previous heuristic was YIQ brightness against a fixed threshold, which
 * is not a contrast measurement: it happily returned near-white for mid-tone
 * brand colours that only reached 3.4:1 behind it. This measures both
 * candidates and returns whichever actually wins.
 */
export function pickForegroundHsl(hex: string): string {
  return contrastRatio(hex, FG_DARK.hex) >= contrastRatio(hex, FG_LIGHT.hex)
    ? FG_DARK.hsl
    : FG_LIGHT.hsl;
}

/** WCAG AA for normal-size text. A button label is normal text, not large. */
export const AA_NORMAL = 4.5;

/**
 * Nudges a brand colour until its best foreground clears an AA floor.
 *
 * The brand colour is chosen by a tenant through /admin/design-system, so any
 * hex at all can arrive — including ones no foreground reads well on. Rather
 * than override the choice outright, this walks the colour toward whichever
 * end already has more headroom, in small steps, and stops the moment it
 * passes. A colour that already passes is returned untouched, so this is
 * invisible for every palette that was fine to begin with.
 *
 * Returns the adjusted hex plus what it started and ended at, so the design
 * system screen can tell the tenant their colour was altered and by how much
 * instead of silently showing them a different colour than they picked.
 */
export function enforceContrastFloor(hex: string, floor = AA_NORMAL): {
  hex: string; adjusted: boolean; from: number; to: number;
} {
  const best = (c: string) => Math.max(contrastRatio(c, FG_DARK.hex), contrastRatio(c, FG_LIGHT.hex));
  const from = best(hex);
  if (from >= floor) return { hex, adjusted: false, from, to: from };

  // Go toward whichever pole is nearer, so a light brand gets lighter and a
  // dark one darker — the smaller visual departure from what was picked.
  const goLighter = relativeLuminance(hex) > 0.18;
  let current = hex;
  for (let i = 0; i < 40; i++) {
    current = goLighter ? lightenHex(current, 0.05) : darkenHex(current, 0.05);
    if (best(current) >= floor) break;
  }
  return { hex: current, adjusted: true, from, to: best(current) };
}
