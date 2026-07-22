import { useState, useEffect } from 'react';

// Reads --mobile-breakpoint (set by useDesignSystem's applyDesignTokens, see
// the "Mobile" tab in /admin/design-system) instead of a hardcoded number —
// falls back to 768 (the platform's original static value) if the design
// system hasn't mounted yet, so this is never actually unset in practice.
function readBreakpoint(): number {
  if (typeof window === 'undefined') return 768;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--mobile-breakpoint').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 768;
}

export function useIsMobile(): boolean {
  const [breakpoint, setBreakpoint] = useState(readBreakpoint);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);

  // SuperAdmin can change the breakpoint live from the Design System panel —
  // 'hudumika-ds-updated' is the same event applyDesignTokens already fires
  // on every save, so this hook stays in sync without a page reload.
  useEffect(() => {
    const onDsUpdate = () => setBreakpoint(readBreakpoint());
    window.addEventListener('hudumika-ds-updated', onDsUpdate);
    return () => window.removeEventListener('hudumika-ds-updated', onDsUpdate);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
