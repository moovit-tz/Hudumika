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
