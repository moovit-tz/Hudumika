import React, { useEffect } from 'react';
import { useDesignSystem } from '../hooks/useDesignSystem.js';

// Mounted once at the app root (App.tsx) so every page — not just the
// SuperAdmin builder — hydrates from the backend, applies the injected
// stylesheet, and stays in sync via same-tab/cross-tab events.
export function DesignSystemProvider({ children }: { children: React.ReactNode }) {
  useDesignSystem();
  useEffect(() => {
    const moveFocus = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      if (!(event.target instanceof HTMLElement)) return;
      const strip = event.target.closest<HTMLElement>('[data-ds-tabstrip], [role="tablist"]');
      // Radix owns its roving focus; customer navigation is deliberately local.
      if (!strip || strip.classList.contains('ds-tabs-list') || strip.hasAttribute('data-ds-tabs-exempt')) return;
      const controls = Array.from(strip.querySelectorAll<HTMLElement>(':scope > button, :scope > [role="tab"]'))
        .filter(el => !el.matches(':disabled, [aria-disabled="true"]') && el.getClientRects().length > 0);
      const index = controls.indexOf(event.target);
      if (index < 0 || controls.length < 2) return;
      const rtl = getComputedStyle(strip).direction === 'rtl';
      const direction = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + direction + controls.length) % controls.length;
      event.preventDefault();
      controls[next].focus();
    };
    document.addEventListener('keydown', moveFocus);
    return () => document.removeEventListener('keydown', moveFocus);
  }, []);
  return <>{children}</>;
}
