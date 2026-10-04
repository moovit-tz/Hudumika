import React from 'react';
import { Icon, IconName } from './Icon.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Tip } from './ui/tooltip.js';

/* ── Deterministic sparkline data generator ── */
// spark() is gone. It produced a 15-point curve from sin(seed) and was
// passed to `bars` on 49 metric cards, where it read as a fortnight of
// history. A card with no real series now simply has no chart.

/* ── Smooth catmull-rom → cubic bezier path ── */
function smoothLinePath(pts: [number, number][], tension = 0.3): string {
  if (pts.length < 2) return '';
  const d: string[] = [`M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d.push(`C${cp1x.toFixed(2)},${cp1y.toFixed(2)},${cp2x.toFixed(2)},${cp2y.toFixed(2)},${p2[0].toFixed(2)},${p2[1].toFixed(2)}`);
  }
  return d.join(' ');
}

/* ── Area Sparkline ── */
export function AreaSparkline({
  data, color = 'var(--teal)', id,
}: { data: number[]; color: string; id: string }) {
  const W = 120, H = 44, py = 4, px = 2;
  const max = Math.max(...data, 0.01);
  const pts: [number, number][] = data.map((v, i) => [
    px + (data.length === 1 ? 0.5 : i / (data.length - 1)) * (W - px * 2),
    py + (1 - v / max) * (H - py * 2),
  ]);
  const linePath = smoothLinePath(pts);
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(2)},${H} L${pts[0][0].toFixed(2)},${H} Z`;
  const last = pts[pts.length - 1];
  const gradId = `sg-${id}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mc-sparkline-svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--white)" stroke={color} strokeWidth="2" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
}

/* ── MiniBar — kept for direct usage in FinanceDashboard ── */
export function MiniBar({
  bars, color = 'var(--teal)', highlight = 'var(--teal)',
}: { bars: number[]; color?: string; highlight?: string }) {
  const max = Math.max(...bars);
  const w = 6, gap = 3, h = 48;
  const totalW = bars.length * (w + gap) - gap;
  return (
    <svg width={totalW} height={h} viewBox={`0 0 ${totalW} ${h}`} className="mc-minibar-svg">
      {bars.map((v, i) => {
        const barH = Math.max(4, (v / max) * h);
        const isLast = i === bars.length - 1;
        return (
          <rect key={i}
            x={i * (w + gap)} y={h - barH} width={w} height={barH}
            rx={2} fill={isLast ? highlight : color} opacity={isLast ? 1 : 0.32}
          />
        );
      })}
    </svg>
  );
}

/* ── Trend pill badge ── */
export function Trend({ val, invert = false }: { val: number; invert?: boolean }) {
  const directionUp = val >= 0;
  const favorable = invert ? val <= 0 : val >= 0;
  return (
    <span className="mc-trend" data-sentiment={favorable ? 'positive' : 'negative'}>
      <Icon name={directionUp ? 'arrowUp' : 'arrowDown'} size={10} strokeWidth={2.5}
        color={favorable ? 'var(--green)' : 'var(--red)'} duotone={false} />
      {Math.abs(val).toFixed(1)}%
    </span>
  );
}

/* ── MetricCard ── */
export interface MetricCardProps {
  title: string;
  value: string;
  /** Percentage change. Omit entirely when nothing measured it — the badge
   *  is then not rendered at all. 62 of the 69 call sites used to pass a
   *  literal like `trend: 5.2`, a number nobody computed, sitting next to a
   *  sparkline drawn from sin(seed). Both are gone. */
  trend?: number;
  sub1Label?: string;
  sub1Value?: string;
  sub2Label?: string;
  sub2Value?: string;
  /** Omit (or pass an empty array) when there's no real trend data to back a
      sparkline — the card renders without one rather than fabricating a
      trend line, per the design system's "honest gap over fake data" rule. */
  bars?: number[];
  barColor?: string;
  barHighlight?: string;
  invertTrend?: boolean;
  /** Plain-language anchor for the delta, e.g. "vs previous 30 days". */
  comparisonLabel?: string;
  /** Optional data-freshness note, e.g. "Updated 2 minutes ago". */
  updatedLabel?: string;
  /** Optional benchmark progress, normalized from 0–100. */
  progress?: number;
  progressLabel?: string;
  /** Distinguishes "no observations yet" from a measured value of zero. */
  empty?: boolean;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Reserve primary emphasis for the one or two metrics that answer the page's main question. */
  emphasis?: 'default' | 'primary' | 'subtle';
  icon?: IconName;
  /** Optional action for the header's "more" button. Omit to leave it non-interactive. */
  onMenuClick?: () => void;
  menuTitle?: string;
  /** Makes the summary a discoverable drill-down control. */
  onClick?: () => void;
  /** Holds the card footprint while its query resolves. */
  loading?: boolean;
  /** An honest in-card failure state; pass onRetry to expose recovery. */
  error?: string;
  onRetry?: () => void;
}

const COLOR_ICON: Record<string, { icon: IconName }> = {
  'var(--teal)':   { icon: 'trendingUp'   },
  'var(--blue)':   { icon: 'barChart2'    },
  'var(--green)':  { icon: 'checkCircle'  },
  'var(--red)':    { icon: 'alertTriangle' },
  'var(--gold)':   { icon: 'zap'          },
  'var(--purple)': { icon: 'pieChart'     },
};

// FeaturedIcon only has 6 variants (no dedicated "purple") — map the CSS var
// straight through to the matching semantic variant, folding purple into brand.
const COLOR_VARIANT: Record<string, 'brand' | 'info' | 'success' | 'error' | 'warning'> = {
  'var(--teal)':   'brand',
  'var(--blue)':   'info',
  'var(--green)':  'success',
  'var(--red)':    'error',
  'var(--gold)':   'warning',
  'var(--purple)': 'brand',
};

let _sparkId = 0;

export function MetricCard({
  title, value, trend,
  sub1Label = 'THIS MONTH', sub1Value,
  sub2Label = 'THIS WEEK',  sub2Value,
  bars, barColor, barHighlight, invertTrend = false,
  comparisonLabel, updatedLabel, progress, progressLabel,
  empty = false, emptyMessage = 'No data for this period', emptyActionLabel, onEmptyAction,
  emphasis = 'default', icon, onMenuClick, menuTitle, onClick, loading = false, error, onRetry,
}: MetricCardProps) {
  const sparkId = React.useRef(`mc${++_sparkId}`).current;
  const color    = barHighlight ?? 'var(--teal)';
  const cfg      = COLOR_ICON[color] ?? { icon: 'barChart' as IconName };
  const iconName: IconName = icon ?? cfg.icon;
  const variant  = COLOR_VARIANT[color] ?? 'brand';
  const hasBars  = !!bars && bars.length > 0;
  const chipClass = variant === 'brand' ? 'is-primary' : variant === 'info' ? 'is-info' : variant === 'success' ? 'is-success' : variant === 'warning' ? 'is-warning' : 'is-danger';

  const interactiveProps = onClick ? {
    role: 'button', tabIndex: 0,
    onClick,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    },
  } : {};

  return (
    <div className="mc-card" data-interactive={onClick ? 'true' : undefined} data-emphasis={emphasis} aria-busy={loading || undefined} {...interactiveProps}>
      <div className="mc-head">
        <div className="mc-head-left">
          <span className={`icon-chip ${chipClass}`}>
            <Icon name={iconName} size={18} strokeWidth={1.8} />
          </span>
          <span className="mc-title">{title}</span>
        </div>
        <div className="mc-head-right" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onMenuClick && (
            <Tip label={menuTitle ?? 'Refresh'}>
              <button type="button" className="mc-refresh-btn" aria-label={menuTitle ?? 'Refresh'} onClick={(event) => { event.stopPropagation(); onMenuClick(); }}>
                <Icon name="refresh" size={13} strokeWidth={1.75} duotone={false} />
              </button>
            </Tip>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mc-state" aria-label={`Loading ${title}`}>
          <span className="mc-skeleton mc-skeleton-value" />
          <span className="mc-skeleton mc-skeleton-meta" />
        </div>
      ) : error ? (
        <div className="mc-state mc-error" role="status">
          <span>{error}</span>
          {onRetry && <button type="button" onClick={(event) => { event.stopPropagation(); onRetry(); }}>Try again</button>}
        </div>
      ) : empty ? (
        <div className="mc-state mc-empty" role="status">
          <span>{emptyMessage}</span>
          {emptyActionLabel && onEmptyAction && <button type="button" onClick={(event) => { event.stopPropagation(); onEmptyAction(); }}>{emptyActionLabel}</button>}
        </div>
      ) : (
        <>
          <div className="mc-value-row">
            <span className="mc-value">{value}</span>
          </div>

          {(typeof trend === 'number' && trend !== 0 || comparisonLabel) && (
            <div className="mc-comparison">
              {typeof trend === 'number' && trend !== 0 && <Trend val={trend} invert={invertTrend} />}
              {comparisonLabel && <span className="mc-comparison-label">{comparisonLabel}</span>}
            </div>
          )}

          {typeof progress === 'number' && (
            <div className="mc-progress">
              <div className="mc-progress-meta"><span>{progressLabel ?? 'Target progress'}</span><strong>{Math.round(Math.max(0, Math.min(100, progress)))}%</strong></div>
              <div className="mc-progress-track" role="progressbar" aria-label={progressLabel ?? `${title} target progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(100, progress)))}>
                <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
            </div>
          )}

          {(sub1Value || sub2Value) && (
            <div className="mc-sub-row">
              {sub1Value && <div><div className="mc-sub-label">{sub1Label}</div><div className="mc-sub-value">{sub1Value}</div></div>}
              {sub2Value && <div><div className="mc-sub-label">{sub2Label}</div><div className="mc-sub-value">{sub2Value}</div></div>}
            </div>
          )}

          {hasBars && <div className="mc-spark-wrap"><AreaSparkline data={bars!} color={color} id={sparkId} /></div>}
          {updatedLabel && <div className="mc-updated">{updatedLabel}</div>}
        </>
      )}
    </div>
  );
}

/* ── MetricsRow ── */
export function MetricsRow({ cards }: { cards: MetricCardProps[] }) {
  return (
    <div className="mc-row" data-cols={cards.length}>
      {cards.map(c => <MetricCard key={c.title} {...c} />)}
    </div>
  );
}
