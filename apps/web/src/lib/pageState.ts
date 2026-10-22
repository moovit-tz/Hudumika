/**
 * Global page-state preservation across 401 → login → returnTo round-trips.
 *
 * capturePageState() serializes scroll position + every form input on the
 * current page into sessionStorage, keyed by pathname.  restorePageState()
 * replays them after the destination page re-renders by setting native values
 * and dispatching input/change events so React's controlled onChange fires.
 *
 * This is a best-effort safety net that covers basic <input>/<textarea>
 * elements automatically for EVERY page.  Complex components (Radix Select,
 * Combobox, DatePicker) won't be captured at the DOM level — pages with those
 * should use useSessionDraft (hooks/useSessionDraft.ts) for reliable
 * React-level persistence.  The two systems coexist without conflict.
 */

interface InputSnap {
  t: string;          // type
  v: string;          // value
  c?: boolean;        // checked (checkbox/radio only)
}

interface PageSnap {
  sy: number;         // scrollY
  inp: Record<string, InputSnap>;
  ts: number;         // timestamp
}

const PFX = 'ps:';
const MAX_AGE = 30 * 60_000;

// ── Capture (called from handleUnauthorized before the redirect) ──────────

export function capturePageState() {
  const path = window.location.pathname;
  const snap: PageSnap = { sy: window.scrollY, inp: {}, ts: Date.now() };

  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select',
  ).forEach(el => {
    const key = el.id || el.getAttribute('name');
    if (!key) return;

    if (el instanceof HTMLInputElement) {
      if (el.type === 'password' || el.type === 'hidden' || el.type === 'file') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        snap.inp[key] = { t: el.type, v: el.value, c: el.checked };
      } else {
        if (!el.value) return;
        snap.inp[key] = { t: el.type, v: el.value };
      }
    } else if (el instanceof HTMLTextAreaElement) {
      if (!el.value) return;
      snap.inp[key] = { t: 'textarea', v: el.value };
    } else {
      if (!el.value) return;
      snap.inp[key] = { t: 'select', v: el.value };
    }
  });

  try { sessionStorage.setItem(PFX + path, JSON.stringify(snap)); } catch {}
}

// ── Restore (called after the destination page renders) ───────────────────

const inputSetter  = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
const textSetter   = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

function replayInputs(inp: Record<string, InputSnap>) {
  const keys = Object.keys(inp);
  let pending = 0;

  for (const key of keys) {
    const info = inp[key];
    const el = document.getElementById(key)
      ?? document.querySelector<HTMLElement>(`[name="${CSS.escape(key)}"]`);
    if (!el) { pending++; continue; }

    if (info.c !== undefined && el instanceof HTMLInputElement) {
      if (el.checked !== info.c) el.click();
    } else if (el instanceof HTMLInputElement && inputSetter) {
      if (el.value !== info.v) {
        inputSetter.call(el, info.v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (el instanceof HTMLTextAreaElement && textSetter) {
      if (el.value !== info.v) {
        textSetter.call(el, info.v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (el instanceof HTMLSelectElement) {
      if (el.value !== info.v) {
        el.value = info.v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    delete inp[key];
  }

  return pending;
}

export function restorePageState(): boolean {
  const path = window.location.pathname;
  let raw: string | null;
  try { raw = sessionStorage.getItem(PFX + path); } catch { return false; }
  if (!raw) return false;
  try { sessionStorage.removeItem(PFX + path); } catch {}

  let snap: PageSnap;
  try { snap = JSON.parse(raw); } catch { return false; }
  if (Date.now() - snap.ts > MAX_AGE) return false;

  // Scroll — double-rAF so layout is stable after React's first paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, snap.sy || 0);
    });
  });

  // Inputs — retry up to 5× at 200ms intervals (lazy-loaded routes, async data)
  let attempt = 0;
  function tick() {
    const pending = replayInputs(snap.inp);
    if (pending > 0 && ++attempt < 5) setTimeout(tick, 200);
  }
  setTimeout(tick, 150);

  return true;
}

/** True when a snapshot exists for the given pathname. */
export function hasSnapshot(pathname: string): boolean {
  try { return sessionStorage.getItem(PFX + pathname) !== null; } catch { return false; }
}
