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

// Picks a readable near-white or near-black HSL foreground for a hex background,
// via the same simple luminance heuristic used across the app's badge/card code.
export function pickForegroundHsl(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 150 ? '216 68% 14%' : '210 40% 98%';
}
