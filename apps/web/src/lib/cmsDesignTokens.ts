import type { CmsFontId, CmsRadiusPreset } from '@hudumika/types';

/** §10 — Design tokens (content-facing). The same real, already-vetted font
 *  set the platform's own internal SuperAdmin design system offers
 *  (`useDesignSystem.ts`'s FontId/FONT_STACKS/FONT_URLS) — 'inter' and
 *  'dm-sans' are literally that system's own entries; 'cormorant' adds the
 *  platform's own serif-display identity (the same Cormorant Garamond every
 *  PageHeader's em-accent word already uses); 'system'/'georgia' need no
 *  network fetch at all. Kept deliberately separate from useDesignSystem's
 *  own maps rather than importing them directly — that hook governs the
 *  authenticated app shell's own typography, a different, unrelated surface
 *  from a tenant's public CMS site, even though the underlying font list
 *  happens to overlap. */
export const CMS_FONT_LABELS: Record<CmsFontId, string> = {
  system: 'System default',
  georgia: 'Georgia (serif)',
  'dm-sans': 'DM Sans',
  inter: 'Inter',
  cormorant: 'Cormorant Garamond (serif)',
};

export const CMS_FONT_STACKS: Record<CmsFontId, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  georgia: "Georgia, 'Iowan Old Style', serif",
  'dm-sans': "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  cormorant: "'Cormorant Garamond', Georgia, serif",
};

/** Only the CDN fonts need a stylesheet fetched — system/georgia are always
 *  available with no network round-trip. */
export const CMS_FONT_URLS: Partial<Record<CmsFontId, string>> = {
  'dm-sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,700;1,9..40,400&display=swap',
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
  cormorant: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&display=swap',
};

export const CMS_RADIUS_LABELS: Record<CmsRadiusPreset, string> = {
  sharp: 'Sharp',
  rounded: 'Rounded',
  pill: 'Pill',
};

/** 'rounded' at 8px matches the ~8px every button/input/card on the public
 *  site already hardcoded before this row existed — the real default, not
 *  an arbitrary middle value. */
export const CMS_RADIUS_PX: Record<CmsRadiusPreset, string> = {
  sharp: '2px',
  rounded: '8px',
  pill: '999px',
};
