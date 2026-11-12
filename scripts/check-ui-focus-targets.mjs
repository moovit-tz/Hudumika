// Browser guard for two WCAG 2.2 AA properties of the shared primitives that
// source inspection cannot prove: a visible keyboard focus indicator (2.4.7,
// 1.4.11 — at least 3:1 against the surface it sits on) and a pointer target
// of at least 24x24 CSS px (2.5.8). Mounts the real components from
// apps/web/src/components/ui against the running dev server, the same way
// check-ui-control-rendering.mjs does, so no session or seeded data is needed.
//
//   node scripts/check-ui-focus-targets.mjs            # exits 1 on failure
//   node scripts/check-ui-focus-targets.mjs --report   # print, never fail
import { chromium } from 'playwright';

const reportOnly = process.argv.includes('--report');
const base = process.env.CONTROL_TEST_URL || 'http://localhost:5173/';
const MIN_TARGET = 24;
const MIN_RING_CONTRAST = 3;

// The bundled browser build can lag the installed playwright package (the
// download is a separate step); an installed Chrome or Edge renders the same
// CSS, so fall back to it instead of failing before any check has run.
async function launch() {
  const channels = process.env.PW_CHANNEL ? [process.env.PW_CHANNEL] : [undefined, 'chrome', 'msedge'];
  let lastError;
  for (const channel of channels) {
    try { return await chromium.launch(channel ? { channel } : {}); } catch (error) { lastError = error; }
  }
  throw lastError;
}
const browser = await launch();
const failures = [];
const rows = [];
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/__focus-targets', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><link rel="stylesheet" href="/src/index.css"></head><body></body></html>',
  }));
  await page.goto(new URL('/__focus-targets', base).href, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { default: RefreshRuntime } = await import('/@react-refresh');
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const R = await import('/node_modules/.vite/deps/react.js');
    const React = R.default || R;
    const D = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { Button } = await import('/src/components/ui/button.tsx');
    const { Input } = await import('/src/components/ui/input.tsx');
    const { Textarea } = await import('/src/components/ui/textarea.tsx');
    const { Checkbox } = await import('/src/components/ui/checkbox.tsx');
    const { Switch } = await import('/src/components/ui/switch.tsx');
    const { RadioGroup, RadioGroupItem } = await import('/src/components/ui/radio-group.tsx');
    const { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } = await import('/src/components/ui/select.tsx');
    const { Dialog, DialogContent, DialogTitle, DialogDescription } = await import('/src/components/ui/dialog.tsx');
    const h = React.createElement;
    const host = document.createElement('div');
    host.style.cssText = 'padding:32px;display:grid;gap:28px;justify-items:start;background:var(--white);color:var(--ink)';
    document.body.append(host);
    function Catalog() {
      const [open, setOpen] = React.useState(false);
      const [on, setOn] = React.useState(false);
      return h(React.Fragment, null,
        h(Button, { type: 'button', 'data-probe': 'button-default' }, 'Primary'),
        h(Button, { type: 'button', variant: 'outline', 'data-probe': 'button-outline' }, 'Outline'),
        h(Button, { type: 'button', variant: 'ghost', 'data-probe': 'button-ghost' }, 'Ghost'),
        h(Button, { type: 'button', variant: 'destructive', 'data-probe': 'button-destructive' }, 'Delete'),
        h(Button, { type: 'button', variant: 'link', 'data-probe': 'button-link' }, 'Link'),
        h(Button, { type: 'button', size: 'xs', variant: 'outline', 'data-probe': 'button-xs' }, 'Row'),
        h(Button, { type: 'button', iconOnly: true, variant: 'outline', 'aria-label': 'Settings', 'data-probe': 'button-icon' }, '⚙'),
        h(Button, { type: 'button', loading: true, onClick: () => { window.__loadingClicks = (window.__loadingClicks || 0) + 1; }, 'data-probe': 'button-loading' }, 'Saving'),
        h(Input, { 'aria-label': 'Name', 'data-probe': 'input' }),
        h(Textarea, { 'aria-label': 'Notes', 'data-probe': 'textarea' }),
        h(Select, { defaultValue: 'a' }, h(SelectTrigger, { 'aria-label': 'Status', 'data-probe': 'select', style: { width: 200 } }, h(SelectValue)), h(SelectContent, null, h(SelectItem, { value: 'a' }, 'A'))),
        h(Checkbox, { 'aria-label': 'Agree', 'data-probe': 'checkbox' }),
        h(Switch, { 'aria-label': 'Enabled', checked: on, onCheckedChange: setOn, 'data-probe': 'switch' }),
        h(Switch, { 'aria-label': 'Compact', labeled: false, 'data-probe': 'switch-compact' }),
        h(RadioGroup, { defaultValue: 'x', 'aria-label': 'Choice' }, h(RadioGroupItem, { value: 'x', 'aria-label': 'X', 'data-probe': 'radio' })),
        h(Button, { type: 'button', variant: 'outline', onClick: () => setOpen(true), 'data-probe': 'open-dialog' }, 'Open dialog'),
        h(Dialog, { open, onOpenChange: setOpen }, h(DialogContent, null, h(DialogTitle, null, 'Title'), h(DialogDescription, null, 'Body'), h(Button, { type: 'button', 'data-probe': 'dialog-action' }, 'OK'))),
      );
    }
    (D.createRoot || D.default.createRoot)(host).render(h(Catalog));
  });
  await page.locator('[data-probe="button-default"]').waitFor();

  // Runs in the page: what does keyboard focus actually paint on `el`, and
  // how big is the area that receives its clicks?
  const measure = (selector) => page.evaluate(({ selector, minTarget }) => {
    const el = document.querySelector(selector);
    if (!el) return { missing: true };
    const parse = (value) => {
      const m = /rgba?\(([^)]+)\)/.exec(value || '');
      if (m) {
        const p = m[1].split(/[ ,/]+/).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
      }
      // Chromium serialises color-mix()/oklab results as color(srgb r g b / a).
      const s = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(value || '');
      if (s) return { r: s[1] * 255, g: s[2] * 255, b: s[3] * 255, a: s[4] === undefined ? 1 : Number(s[4]) };
      return null;
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    // The surface the indicator is drawn against is the nearest opaque
    // ancestor background, not the control's own fill (the ring sits outside).
    let surface = { r: 255, g: 255, b: 255, a: 1 };
    for (let node = el.parentElement; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.99) { surface = bg; break; }
    }
    const cs = getComputedStyle(el);
    let ring = null;
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) {
      const c = parse(cs.outlineColor);
      if (c && c.a > 0) ring = { kind: 'outline', width: parseFloat(cs.outlineWidth), color: over(c, surface) };
    }
    if (!ring && cs.boxShadow && cs.boxShadow !== 'none') {
      // Only a spread/ring shadow counts; Tailwind emits transparent
      // placeholders and soft elevation shadows that are not indicators.
      const parts = cs.boxShadow.split(/,(?![^(]*\))/).map(s => s.trim());
      for (const part of parts) {
        const c = parse(part);
        const nums = part.replace(/rgba?\([^)]+\)|color\([^)]+\)/, '').trim().split(/\s+/).map(parseFloat);
        const [, , blur = 0, spread = 0] = nums;
        if (c && c.a > 0.5 && blur === 0 && spread >= 1 && !part.includes('inset')) { ring = { kind: 'ring', width: spread, color: over(c, surface) }; break; }
      }
    }
    // elementFromPoint only answers inside the viewport; a control further
    // down the catalog would otherwise read as having no hit area at all.
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    const cx =rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const hits = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    const half = minTarget / 2 - 0.5;
    const target = hits(cx - half, cy) && hits(cx + half, cy) && hits(cx, cy - half) && hits(cx, cy + half);
    return {
      focused: document.activeElement === el,
      ring: ring ? { kind: ring.kind, width: ring.width, contrast: Number(contrast(ring.color, surface).toFixed(2)) } : null,
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      target,
    };
  }, { selector, minTarget: MIN_TARGET });

  const probes = ['button-default', 'button-outline', 'button-ghost', 'button-destructive', 'button-link', 'button-xs', 'button-icon', 'button-loading', 'input', 'textarea', 'select', 'checkbox', 'switch', 'switch-compact', 'radio', 'open-dialog'];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; document.documentElement.classList.toggle('dark', t === 'dark'); }, theme);
    // Focus must arrive from the keyboard or :focus-visible does not match
    // on a button; start before the first control and Tab through in order.
    await page.evaluate(() => { document.activeElement?.blur?.(); window.getSelection()?.removeAllRanges(); });
    await page.mouse.click(2, 2);
    for (const probe of probes) {
      await page.keyboard.press('Tab');
      // transition-colors animates outline-color from currentColor; measuring
      // immediately reads a mid-transition colour, not the indicator.
      await page.waitForTimeout(260);
      const result = await measure(`[data-probe="${probe}"]`);
      rows.push({ theme, probe, ...result });
      if (result.missing) { failures.push(`${theme} ${probe}: not rendered`); continue; }
      if (!result.focused) failures.push(`${theme} ${probe}: Tab order skipped it`);
      if (!result.ring) failures.push(`${theme} ${probe}: no visible focus indicator`);
      else if (result.ring.contrast < MIN_RING_CONTRAST) failures.push(`${theme} ${probe}: focus indicator contrast ${result.ring.contrast}:1 is under ${MIN_RING_CONTRAST}:1`);
      if (!result.target) failures.push(`${theme} ${probe}: pointer target under ${MIN_TARGET}px (${result.size})`);
    }
  }

  // A loading button must stay in the Tab order (measured above) and keep
  // focus, but neither the keyboard nor the pointer may fire its action.
  const loadingButton = page.locator('[data-probe="button-loading"]');
  await loadingButton.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  // force: Playwright itself refuses to click an aria-disabled element, which
  // would test its actionability wait instead of the component's guard.
  await loadingButton.click({ force: true });
  const busy = await page.evaluate(() => {
    const el = document.querySelector('[data-probe="button-loading"]');
    return {
      clicks: window.__loadingClicks || 0,
      focused: document.activeElement === el,
      ariaBusy: el.getAttribute('aria-busy'),
      ariaDisabled: el.getAttribute('aria-disabled'),
      spinner: !!el.querySelector('.ds-spinner[aria-hidden="true"]'),
    };
  });
  if (busy.clicks) failures.push(`button-loading: action fired ${busy.clicks} time(s) while loading`);
  if (!busy.focused) failures.push('button-loading: lost keyboard focus');
  if (busy.ariaBusy !== 'true' || busy.ariaDisabled !== 'true') failures.push(`button-loading: aria-busy=${busy.ariaBusy} aria-disabled=${busy.ariaDisabled}`);
  if (!busy.spinner) failures.push('button-loading: no spinner rendered');

  // The dialog's close control only exists while it is open; Radix moves
  // focus inside, so Tab from there until the close button has it.
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.classList.remove('dark'); });
  await page.locator('[data-probe="open-dialog"]').click();
  await page.locator('[role="dialog"]').waitFor();
  await page.evaluate(() => document.querySelector('[role="dialog"] button:has(.sr-only)')?.setAttribute('data-probe', 'dialog-close'));
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.getAttribute('data-probe') === 'dialog-close')) break;
  }
  await page.waitForTimeout(260);
  const close = await measure('[data-probe="dialog-close"]');
  rows.push({ theme: 'light', probe: 'dialog-close', ...close });
  if (!close.focused) failures.push('light dialog-close: not reachable with Tab');
  if (!close.ring) failures.push('light dialog-close: no visible focus indicator');
  else if (close.ring.contrast < MIN_RING_CONTRAST) failures.push(`light dialog-close: focus indicator contrast ${close.ring.contrast}:1 is under ${MIN_RING_CONTRAST}:1`);
  if (!close.target) failures.push(`light dialog-close: pointer target under ${MIN_TARGET}px (${close.size})`);
  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 2000 }).catch(() => failures.push('dialog: Escape did not close it'));

  if (pageErrors.length) failures.push(...pageErrors.map(e => `page error: ${e}`));
} finally {
  await browser.close();
}

for (const row of rows) {
  const ring = row.ring ? `${row.ring.kind} ${row.ring.width}px ${row.ring.contrast}:1` : 'NONE';
  console.log(`${row.theme.padEnd(5)} ${String(row.probe).padEnd(20)} focus=${ring.padEnd(22)} size=${String(row.size).padEnd(9)} target>=${MIN_TARGET}px=${row.target ? 'yes' : 'NO'}`);
}
if (failures.length) {
  console.error(`\n${failures.length} focus/target finding(s):\n` + failures.map(f => `- ${f}`).join('\n'));
  if (!reportOnly) process.exit(1);
} else {
  console.log(`\nFocus and target-size check passed (${rows.length} measurements).`);
}
