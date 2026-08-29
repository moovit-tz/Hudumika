// Shared loading-skeleton primitive — a single pulsing placeholder block.
// Every dashboard page composes its own skeleton layout from this so the
// loading state previews the real page shape (reduces layout shift)
// instead of a bare spinner that gives no sense of what's coming.
export function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 rounded-lg ${className}`} />;
}
