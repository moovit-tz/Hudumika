// Tenant theme variations (design principles §3 Colour, adoption plan §5).
// A tenant can pick any brand colour; these are the guarantees the design
// system makes regardless of the pick, checked over a deliberately hostile
// set of colours rather than the default theme only:
//  - the filled-action pair (--primary / --primary-foreground) reads at AA;
//  - the keyboard focus ring is visible (3:1) on both light and dark pages;
//  - tenant-edited helper text stays readable at AA on its surface.
import { describe, it, expect } from 'vitest';
import {
  enforceContrastFloor, focusRingHex, enforceTextContrast, contrastRatio,
  AA_NORMAL, AA_NON_TEXT,
} from './color';

const LIGHT_PAGE = '#f4f7fb'; // --bg, light (the darker light surface)
const DARK_PAGE = '#0d0d0d';  // --bg, dark

// Pale, saturated, mid-grey and near-black brands — the ones that break naive themes.
const HOSTILE = [
  '#ffffff', '#000000', '#808080', '#777777', '#ffff00', '#fde68a', '#f9a8d4', '#fbcfe8',
  '#22d3ee', '#7dd3fc', '#a3e635', '#86efac', '#ff0000', '#00ff00', '#0000ff', '#ff00ff',
  '#ea580c', '#f97316', '#0f766e', '#14b8a6', '#e11d48', '#7c3aed', '#c4b5fd', '#1e293b',
];
// Plus a sweep of hues at the lightness extremes.
for (let h = 0; h < 360; h += 30) {
  for (const l of [0.2, 0.5, 0.8, 0.92]) HOSTILE.push(hslToHex(h, 0.9, l));
}

describe('tenant brand colours keep the accessibility guarantees', () => {
  it.each(HOSTILE)('%s: filled actions read at AA', (brand) => {
    const { to } = enforceContrastFloor(brand);
    expect(to).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(HOSTILE)('%s: focus ring is visible on light and dark pages', (brand) => {
    expect(contrastRatio(focusRingHex(brand, LIGHT_PAGE), LIGHT_PAGE)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(focusRingHex(brand, DARK_PAGE), DARK_PAGE)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it.each(['#cbd5e1', '#e2e8f0', '#94a3b8', '#f1f5f9'])('%s helper text is floored to AA on white', (ink) => {
    expect(contrastRatio(enforceTextContrast(ink, '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the default destructive red is floored to AA (adoption plan §6)', () => {
    expect(enforceContrastFloor('#e11d48').to).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
