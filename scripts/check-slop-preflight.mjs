#!/usr/bin/env node
/**
 * Mechanical slop pre-flight — a page-by-page scan for the four checkable
 * symptoms of "assembled from AI defaults, not designed": more than one
 * accent hue, corner radii outside the shape scale, gradients with no
 * stated reason, and more than one label for the same call-to-action
 * intent on one screen. Adapted from Appllama's app-design-skill
 * (https://github.com/Appllama/appllama-skills) — that skill's version is
 * written for native Expo/React Native apps; this one is Hudumika's own,
 * checked against THIS platform's actual tokens
 * (`--teal`/`--r`/`--r-sm`, docs/DESIGN_SYSTEM.md's token contract), not
 * copied from theirs.
 *
 * Static regex analysis over the .tsx source, not a real parser — it WILL
 * miss things and WILL flag legitimate cases (a deliberately-varied
 * initials/avatar palette, a chart's category-color series, a status
 * badge's semantic color set). It separates likely-palette arrays from
 * single accent-looking values for exactly that reason, but the output is
 * still a worklist for a human to triage, not an auto-fail gate — see
 * "A failed count is a fix, not a judgment call" in the source skill,
 * which assumes a single-accent consumer app; Hudumika genuinely has
 * legitimate multi-hue surfaces (avatars, charts, semantic badges) this
 * tool cannot always tell apart from real drift on its own.
 *
 * Report-only by default (exit 0 regardless of findings) — the platform
 * has real, pre-existing debt in all four categories; wiring this into the
 * mandatory `npm run typecheck` chain today would just fail every run.
 * Pass --fail-on-any once a page (or the whole app) is actually clean and
 * you want this to start gating regressions on it.
 *
 * Usage: node scripts/check-slop-preflight.mjs [--fail-on-any] [--json] [glob-root]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const args = process.argv.slice(2);
const failOnAny = args.includes('--fail-on-any');
const asJson = args.includes('--json');
const rootArg = args.find((a) => !a.startsWith('--'));
const root = new URL('..', import.meta.url);
const scanDir = new URL(rootArg ?? 'apps/web/src/pages', root);

// ── Walk every page file ────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (extname(entry) === '.tsx') out.push(p);
  }
  return out;
}
const files = walk(scanDir.pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// ── 1. Accent hues — raw hex/rgb literals, bucketed by hue ─────────────
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
const NEUTRAL_S_MAX = 12; // below this saturation, treat as grey/neutral — not an "accent"
const HUE_BUCKETS = [
  ['red', 345, 15], ['gold/orange', 15, 50], ['yellow', 50, 65],
  ['green', 65, 165], ['teal/cyan', 165, 195], ['blue', 195, 255],
  ['purple/indigo', 255, 290], ['pink/magenta', 290, 345],
];
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return null;
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}
function hueBucket(h) {
  for (const [name, lo, hi] of HUE_BUCKETS) {
    if (lo > hi) { if (h >= lo || h < hi) return name; } // wraps past 360 (red)
    else if (h >= lo && h < hi) return name;
  }
  return 'red';
}

// A line that looks like `const X_COLORS = [...]` / `const XPalette = [...]`
// — deliberately varied palettes (avatar initials, chart series, category
// tags) are the known false-positive class; still reported, just separated.
const PALETTE_DECL_RE = /const\s+\w*(COLORS?|PALETTE|SERIES|HUES|GATEWAYS|CATALOG|META|MARKETPLACE|BRANDS)\w*\s*[:=]/i;

// ── 2. Corner radii — raw px values outside the --r / --r-sm scale ─────
const RADIUS_RE = /border[Rr]adius:\s*['"]?(\d+(?:\.\d+)?)(px)?['"]?(?!\s*%)/g;
const CSS_RADIUS_RE = /border-radius:\s*(\d+(?:\.\d+)?)px/g;
const PILL_VALUES = new Set([999, 9999, 50, 100, 200, 500]); // full/half-pill shapes, not part of the corner-radius *scale* debate

// ── 3. Gradients ─────────────────────────────────────────────────────────
const GRADIENT_RE = /(linear|radial|conic)-gradient\(/g;

// ── 4. Duplicate CTA phrasing — same intent, different label, one file ──
const INTENT_GROUPS = {
  save: ['save', 'save changes', 'update', 'apply changes', 'apply', 'submit changes'],
  create: ['create', 'add', 'new', 'get started', 'start', 'begin'],
  cancel: ['cancel', 'close', 'dismiss', 'discard'],
  confirm: ['confirm', 'ok', 'continue', 'proceed', "let's go", 'next'],
};
const BUTTON_TEXT_RE = /<(?:Button|button)\b[^>]*>\s*\n?\s*([A-Z][a-zA-Z ,'’-]{1,30}?)\s*\n?\s*<\/(?:Button|button)>/g;

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const paletteRanges = [];
  for (let start = 0; start < lines.length; start++) {
    if (!PALETTE_DECL_RE.test(lines[start])) continue;
    let end = start;
    while (end < lines.length - 1 && !/^\s*\];?\s*$/.test(lines[end]) && !/^\s*};?\s*$/.test(lines[end])) end++;
    paletteRanges.push([start + 1, end + 1]);
  }
  const isInPaletteRange = (line) => paletteRanges.some(([start, end]) => line >= start && line <= end);

  // hues
  const accentHits = []; // { value, bucket, line, inPalette }
  for (const m of src.matchAll(HEX_RE)) {
    const rgb = hexToRgb(m[0]);
    if (!rgb) continue;
    const hsl = rgbToHsl(rgb);
    if (hsl.s < NEUTRAL_S_MAX || hsl.l < 8 || hsl.l > 96) continue; // near-grey/black/white
    const ln = lineOf(m.index);
    const inPalette = isInPaletteRange(ln) || PALETTE_DECL_RE.test(lines.slice(Math.max(0, ln - 4), ln).join('\n'));
    accentHits.push({ value: m[0], bucket: hueBucket(hsl.h), line: ln, inPalette });
  }
  for (const m of src.matchAll(RGB_RE)) {
    const hsl = rgbToHsl({ r: +m[1], g: +m[2], b: +m[3] });
    if (hsl.s < NEUTRAL_S_MAX || hsl.l < 8 || hsl.l > 96) continue;
    const ln = lineOf(m.index);
    const inPalette = isInPaletteRange(ln) || PALETTE_DECL_RE.test(lines.slice(Math.max(0, ln - 4), ln).join('\n'));
    accentHits.push({ value: m[0].split('(')[0] + `(${m[1]},${m[2]},${m[3]})`, bucket: hueBucket(hsl.h), line: ln, inPalette });
  }

  // radii
  const radiusHits = [];
  for (const re of [RADIUS_RE, CSS_RADIUS_RE]) {
    for (const m of src.matchAll(re)) {
      const v = Number(m[1]);
      if (PILL_VALUES.has(v)) continue;
      radiusHits.push({ value: v, line: lineOf(m.index) });
    }
  }

  // gradients
  const gradientHits = [...src.matchAll(GRADIENT_RE)].map((m) => ({ kind: m[1], line: lineOf(m.index) }));

  // duplicate CTA intent
  const labelsFound = new Set();
  for (const m of src.matchAll(BUTTON_TEXT_RE)) {
    const label = m[1].trim().replace(/\s+/g, ' ');
    if (label && label.length < 40) labelsFound.add(label.toLowerCase());
  }
  const intentDupes = [];
  for (const [intent, phrasings] of Object.entries(INTENT_GROUPS)) {
    const hit = phrasings.filter((p) => labelsFound.has(p));
    if (hit.length > 1) intentDupes.push({ intent, phrasings: hit });
  }

  return { path, accentHits, radiusHits, gradientHits, intentDupes };
}

const results = files.map(scanFile);

// ── Aggregate ────────────────────────────────────────────────────────────
const nonPaletteAccent = results.flatMap((r) => r.accentHits.filter((h) => !h.inPalette));
const paletteAccent = results.flatMap((r) => r.accentHits.filter((h) => h.inPalette));
const hueCounts = {};
for (const h of nonPaletteAccent) hueCounts[h.bucket] = (hueCounts[h.bucket] ?? 0) + 1;

const filesWithRawAccent = results.filter((r) => r.accentHits.some((h) => !h.inPalette));
const filesWithOffAccentHue = results.filter((r) => r.accentHits.some((h) => !h.inPalette && h.bucket !== 'teal/cyan' && h.bucket !== 'gold/orange'));
const filesWithRadii = results.filter((r) => r.radiusHits.length > 0);
const distinctRadiusValues = [...new Set(results.flatMap((r) => r.radiusHits.map((h) => h.value)))].sort((a, b) => a - b);
const filesWithGradients = results.filter((r) => r.gradientHits.length > 0);
const filesWithDupeCta = results.filter((r) => r.intentDupes.length > 0);

const summary = {
  scanned: files.length,
  clean: results.filter((r) => r.accentHits.filter(h=>!h.inPalette).length === 0 && r.radiusHits.length === 0 && r.gradientHits.length === 0 && r.intentDupes.length === 0).length,
  accent: {
    filesWithRawAccentColor: filesWithRawAccent.length,
    filesWithOffPaletteHue: filesWithOffAccentHue.length,
    totalRawInstances: nonPaletteAccent.length,
    totalPaletteInstances: paletteAccent.length,
    byHue: hueCounts,
  },
  radius: {
    filesWithRawRadius: filesWithRadii.length,
    totalInstances: results.reduce((n, r) => n + r.radiusHits.length, 0),
    distinctValues: distinctRadiusValues,
  },
  gradients: {
    files: filesWithGradients.length,
    totalInstances: results.reduce((n, r) => n + r.gradientHits.length, 0),
  },
  duplicateCtaLabels: {
    files: filesWithDupeCta.length,
  },
};

if (asJson) {
  writeFileSync(new URL('slop-preflight-report.json', root), JSON.stringify({ summary, results }, null, 2));
  console.log(`Wrote slop-preflight-report.json (${files.length} files scanned).`);
} else {
  const rel = (p) => relative(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'), p).replace(/\\/g, '/');
  console.log(`\n═══ Mechanical slop pre-flight — ${files.length} page files ═══\n`);
  console.log(`Clean (0 findings in all 4 categories): ${summary.clean}/${files.length}\n`);

  console.log(`── Accent hues ──`);
  console.log(`  ${summary.accent.totalRawInstances} raw (non-palette) color literals across ${summary.accent.filesWithRawAccentColor} files`);
  console.log(`  ${summary.accent.totalPaletteInstances} more sit in what look like deliberate palettes (avatar/chart/category colors) — not flagged`);
  console.log(`  By hue: ${Object.entries(summary.accent.byHue).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}=${n}`).join(', ') || '(none)'}`);
  console.log(`  ${summary.accent.filesWithOffPaletteHue} files use a hue outside teal/gold (the platform's own accent + semantic-warning family) at all\n`);

  console.log(`── Corner radii ──`);
  console.log(`  ${summary.radius.totalInstances} raw px border-radius values (excluding pill/circle shapes) across ${summary.radius.filesWithRawRadius} files`);
  console.log(`  Distinct values in use: ${summary.radius.distinctValues.join(', ') || '(none)'} — the token scale is --r-sm/--r/--r-lg only\n`);

  console.log(`── Gradients ──`);
  console.log(`  ${summary.gradients.totalInstances} linear/radial/conic-gradient() calls across ${summary.gradients.files} files (each needs a stated brand reason, not an audit failure by itself)\n`);

  console.log(`── Duplicate CTA phrasing (same intent, >1 label, same file) ──`);
  console.log(`  ${summary.duplicateCtaLabels.files} files`);
  for (const r of filesWithDupeCta) {
    console.log(`    ${rel(r.path)}: ${r.intentDupes.map((d) => `${d.intent}=[${d.phrasings.join(' / ')}]`).join(', ')}`);
  }

  console.log(`\nTop 15 files by raw (non-palette) accent-color count:`);
  for (const r of [...results].sort((a, b) => b.accentHits.filter(h=>!h.inPalette).length - a.accentHits.filter(h=>!h.inPalette).length).slice(0, 15)) {
    const n = r.accentHits.filter((h) => !h.inPalette).length;
    if (n > 0) console.log(`  ${String(n).padStart(3)}  ${rel(r.path)}`);
  }

  console.log(`\nTop 15 files by raw radius-value count:`);
  for (const r of [...results].sort((a, b) => b.radiusHits.length - a.radiusHits.length).slice(0, 15)) {
    if (r.radiusHits.length > 0) console.log(`  ${String(r.radiusHits.length).padStart(3)}  ${rel(r.path)}`);
  }
  console.log('\nRun with --json to write the full per-file, per-line report to slop-preflight-report.json.\n');
}

if (failOnAny && (summary.clean < files.length)) process.exit(1);
