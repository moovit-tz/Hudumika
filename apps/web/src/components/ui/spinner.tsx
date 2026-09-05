import React from 'react';
import { cn } from '../../lib/utils.js';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  color?: string;
  /** Color of the non-moving ring segment (the "track"). Defaults to the
   *  neutral border token; pass an explicit dark value on a dark surface
   *  (e.g. a full-screen video-call panel) so the ring reads correctly
   *  there instead of the near-invisible light-mode border color. */
  trackColor?: string;
  thickness?: number;
}

/**
 * The canonical loading ring. Every hand-rolled
 * `border: Npx solid var(--teal); border-top-color: transparent;` +
 * inline `<style>{'@keyframes spin{...}'}</style>` block — 17 separate
 * copies of the same thing across the app — should render this instead.
 *
 * For a spinner drawn ON a colored/primary button surface (not a light
 * background), use ButtonSpinner below instead — a tinted ring is invisible
 * against a matching-color fill.
 */
export function Spinner({ size = 20, color = 'var(--teal)', trackColor = 'var(--border)', thickness = 2, className, style, ...props }: SpinnerProps) {
  return (
    <div
      className={cn('ds-spinner', className)}
      style={{
        width: size,
        height: size,
        border: `${thickness}px solid ${trackColor}`,
        borderTopColor: color,
        borderRadius: '50%',
        flexShrink: 0,
        ...style,
      }}
      role="status"
      aria-label="Loading"
      {...props}
    />
  );
}

/** Drop-in replacement for a bare "Loading…" text div inside a card, panel,
 *  or section — the single most duplicated loading pattern in the app
 *  (191 plain-text instances across 135 files). */
export function SectionLoading({ label = 'Loading…', size = 22, style }: { label?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 20px', ...style }}>
      <Spinner size={size} />
      {label && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{label}</span>}
    </div>
  );
}

/** Same as SectionLoading but fills the available height — for a whole
 *  page's first load (the pattern several full-page detail/edit screens
 *  each reimplemented with their own inline spinner + keyframes). */
export function PageLoading({ label = 'Loading…', size = 32 }: { label?: string; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 320, gap: 12 }}>
      <Spinner size={size} thickness={3} />
      <span style={{ fontSize: 14, color: 'var(--ink3)' }}>{label}</span>
    </div>
  );
}

/** For inside a solid-fill button (primary, danger, etc.). Reuses the
 *  existing, already-adopted `.auth-spinner` CSS (index.css) — a white ring
 *  on translucent white — rather than the tinted Spinner above, which would
 *  be invisible against a matching-color button fill. Already used this way
 *  in 8 files (Login, ForgotPassword, ResetPassword, AcceptInvite, etc.);
 *  this just gives it a typed component instead of a bare class name. */
export function ButtonSpinner({ className }: { className?: string }) {
  return <span className={cn('auth-spinner', className)} />;
}
