import React from 'react';
import { cn } from '../../lib/utils.js';

export function Skeleton({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer animate-pulse rounded-md", className)}
      style={style}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5 w-full", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton style={{ width: 140, height: 12 }} />
          <Skeleton style={{ width: 280, height: 26 }} />
          <Skeleton style={{ width: 380, height: 14 }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton style={{ width: 100, height: 36, borderRadius: 8 }} />
          <Skeleton style={{ width: 120, height: 36, borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonMetrics({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`, gap: 16, marginBottom: 24 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Skeleton style={{ width: 110, height: 12 }} />
            <Skeleton style={{ width: 24, height: 24, borderRadius: '50%' }} />
          </div>
          <Skeleton style={{ width: 90, height: 28 }} />
          <div style={{ display: 'flex', gap: 16, paddingTop: 4 }}>
            <Skeleton style={{ width: 80, height: 12 }} />
            <Skeleton style={{ width: 80, height: 12 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Toolbar / Search placeholder */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Skeleton style={{ width: 240, height: 36, borderRadius: 8 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton style={{ width: 90, height: 36, borderRadius: 8 }} />
          <Skeleton style={{ width: 90, height: 36, borderRadius: 8 }} />
        </div>
      </div>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', gap: 16 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} style={{ height: 12, width: i === 0 ? '70%' : '50%' }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, padding: '16px 20px', borderBottom: r < rows - 1 ? '1px solid var(--border)' : 'none', gap: 16, alignItems: 'center' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} style={{ height: 14, width: c === 0 ? '85%' : c === cols - 1 ? '40%' : '65%' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardsGrid({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton style={{ width: 40, height: 40, borderRadius: 8 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton style={{ width: '70%', height: 14 }} />
              <Skeleton style={{ width: '40%', height: 12 }} />
            </div>
          </div>
          <SkeletonText lines={2} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Skeleton style={{ width: 70, height: 20, borderRadius: 12 }} />
            <Skeleton style={{ width: 80, height: 30, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonDetail() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton style={{ width: 200, height: 20 }} />
          <SkeletonText lines={4} />
        </div>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton style={{ width: 180, height: 18 }} />
          <SkeletonTable rows={3} cols={4} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton style={{ width: 140, height: 16 }} />
          <SkeletonText lines={3} />
          <Skeleton style={{ width: '100%', height: 36, borderRadius: 8, marginTop: 8 }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonPage({
  variant = 'table',
  showHeader = true,
  showMetrics = true,
}: {
  variant?: 'table' | 'dashboard' | 'detail' | 'cards';
  showHeader?: boolean;
  showMetrics?: boolean;
}) {
  return (
    <div style={{ width: '100%', minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {showHeader && <SkeletonHeader />}
      <div style={{ padding: '24px 28px' }}>
        {showMetrics && variant !== 'detail' && <SkeletonMetrics count={3} />}
        {variant === 'table' && <SkeletonTable rows={7} cols={5} />}
        {variant === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, height: 260 }}>
                <Skeleton style={{ width: 160, height: 16, marginBottom: 16 }} />
                <Skeleton style={{ width: '100%', height: 180, borderRadius: 8 }} />
              </div>
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, height: 260 }}>
                <Skeleton style={{ width: 160, height: 16, marginBottom: 16 }} />
                <Skeleton style={{ width: '100%', height: 180, borderRadius: 8 }} />
              </div>
            </div>
            <SkeletonTable rows={5} cols={5} />
          </div>
        )}
        {variant === 'detail' && <SkeletonDetail />}
        {variant === 'cards' && <SkeletonCardsGrid count={6} />}
      </div>
    </div>
  );
}
