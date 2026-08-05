import React from 'react';
import { Icon, IconName } from './Icon.js';
import { FeaturedIcon } from './ui/featured-icon.js';

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
    px + (i / (data.length - 1)) * (W - px * 2),
    py + (1 - v / max) * (H - py * 2),
  ]);
  const linePath = smoothLinePath(pts);
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(2)},${H} L${pts[0][0].toFixed(2)},${H} Z`;
  const last = pts[pts.length - 1];
  const gradId = `sg-${id}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mc-sparkline-svg">
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
  const up = invert ? val < 0 : val >= 0;
  return (
    <span className="mc-trend" data-up={String(up)}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} size={10} strokeWidth={2.5}
        color={up ? 'var(--green)' : 'var(--red)'} duotone={false} />
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
  icon?: IconName;
  /** Optional action for the header's "more" button. Omit to leave it non-interactive. */
  onMenuClick?: () => void;
  menuTitle?: string;
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
  icon, onMenuClick, menuTitle,
}: MetricCardProps) {
  const sparkId = React.useRef(`mc${++_sparkId}`).current;
  const color    = barHighlight ?? 'var(--teal)'; // pass the CSS var straight through — it resolves live, so cards stay theme-reactive in dark mode
  const cfg      = COLOR_ICON[color] ?? { icon: 'barChart' as IconName };
  const iconName: IconName = icon ?? cfg.icon;
  const variant  = COLOR_VARIANT[color] ?? 'brand';
  const hasBars  = !!bars && bars.length > 0;

  return (
    <div className="mc-card">
      <div className="mc-head">
        <div className="mc-head-left">
          <FeaturedIcon variant={variant} size="sm" shape="square">
            <Icon name={iconName} size={18} strokeWidth={1.75} />
          </FeaturedIcon>
          <span className="mc-title">{title}</span>
        </div>
        {/* A single, honestly-labeled refresh action — not a fake "more
            options" menu that never opens anything (the old three-dot icon
            implied an overflow menu but every real usage only ever wired up
            one action). */}
        {onMenuClick && (
          <button type="button" className="mc-refresh-btn" onClick={onMenuClick} title={menuTitle ?? 'Refresh'}>
            <Icon name="refresh" size={14} strokeWidth={1.75} duotone={false} />
          </button>
        )}
      </div>

      <div className="mc-value-row">
        <span className="mc-value">{value}</span>
        {typeof trend === 'number' && trend !== 0 && <Trend val={trend} invert={invertTrend} />}
      </div>

      {(sub1Value || sub2Value) && (
        <div className="mc-sub-row">
          {sub1Value && (
            <div>
              <div className="mc-sub-label">{sub1Label}</div>
              <div className="mc-sub-value">{sub1Value}</div>
            </div>
          )}
          {sub2Value && (
            <div>
              <div className="mc-sub-label">{sub2Label}</div>
              <div className="mc-sub-value">{sub2Value}</div>
            </div>
          )}
        </div>
      )}

      {hasBars && (
        <div className="mc-spark-wrap">
          <AreaSparkline data={bars!} color={color} id={sparkId} />
        </div>
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
