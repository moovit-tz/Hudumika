import React from 'react';
import { cn } from '../../lib/utils.js';
import { Icon } from '../Icon.js';

// ── FilterBar compound component ──────────────────────────────────────────
// Pill-row filter bar for list and catalog pages.
//
// Usage:
//   <FilterBar>
//     <FilterBarLeft>
//       <FilterBarGroup label="Status">
//         <FilterBarPill active={…} onClick={…}>All</FilterBarPill>
//       </FilterBarGroup>
//       <FilterBarDivider />
//       <FilterBarClear onClick={…} />
//     </FilterBarLeft>
//     <FilterBarRight>
//       <FilterBarGroup label="Sort by">…</FilterBarGroup>
//     </FilterBarRight>
//   </FilterBar>

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('filter-bar', className)}>
      {children}
    </div>
  );
}

export function FilterBarLeft({ children }: { children: React.ReactNode }) {
  return (
    <div className="filter-bar-left">
      {children}
    </div>
  );
}

export function FilterBarRight({ children }: { children: React.ReactNode }) {
  return (
    <div className="filter-bar-right">
      {children}
    </div>
  );
}

// FilterBarGroup renders a label + pills inline (no extra wrapper div).
// Both elements go directly inside filter-bar-left / filter-bar-right.
export function FilterBarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="filter-bar-label">{label}</span>
      <div className="filter-bar-pills">{children}</div>
    </>
  );
}

export function FilterBarPill({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn('filter-bar-pill', active && 'filter-bar-pill--on', className)}
      aria-pressed={Boolean(active)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function FilterBarDivider() {
  return <span className="filter-bar-divider" />;
}

export function FilterBarClear({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="filter-bar-clear" onClick={onClick}>
      <Icon name="x" size={11} /> Clear filters
    </button>
  );
}
