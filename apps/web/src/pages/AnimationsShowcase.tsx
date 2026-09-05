import React, { useState, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import { TwotoneIcon } from '../components/ui/twotone-icon.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function AnimBox({
  label,
  animClass,
  children,
  triggerKey,
}: {
  label: string;
  animClass: string;
  children?: React.ReactNode;
  triggerKey: number;
}) {
  return (
    <div
      className="anim-demo-box"
      title={`Click to retrigger ${label}`}
    >
      <div
        key={triggerKey}
        className={`anim-demo-target ${animClass}`}
      >
        {children ?? <Icon name="sparkle" size={22} />}
      </div>
      <span className="anim-demo-label">{label}</span>
    </div>
  );
}

function AnimSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="anim-section">
      <div className="anim-section-header">
        <h4 className="anim-section-title">{title}</h4>
        {desc && <p className="anim-section-desc">{desc}</p>}
      </div>
      <div className="anim-section-body">{children}</div>
    </div>
  );
}

// ── Keyframe Animations Grid ───────────────────────────────────────────────

const KEYFRAME_ANIMS: { label: string; cls: string; content?: React.ReactNode }[] = [
  { label: 'Fade In',      cls: 'anim-fade-in'      },
  { label: 'Fade Out',     cls: 'anim-fade-out'     },
  { label: 'Slide Up',     cls: 'anim-slide-up'     },
  { label: 'Slide Down',   cls: 'anim-slide-down'   },
  { label: 'Slide Left',   cls: 'anim-slide-left'   },
  { label: 'Slide Right',  cls: 'anim-slide-right'  },
  { label: 'Scale In',     cls: 'anim-scale-in'     },
  { label: 'Scale Out',    cls: 'anim-scale-out'    },
  { label: 'Bounce',       cls: 'anim-bounce'       },
  { label: 'Pulse',        cls: 'anim-pulse'        },
  { label: 'Spin',         cls: 'anim-spin'         },
  { label: 'Ping',         cls: 'anim-ping', content: <div className="relative w-6 h-6"><div className="absolute inset-0 rounded-full bg-primary" /><div className="absolute inset-0 rounded-full bg-primary opacity-70 anim-ping-inner" /></div> },
  { label: 'Shimmer',      cls: 'anim-shimmer', content: <div className="anim-shimmer-bar" /> },
  { label: 'Shake',        cls: 'anim-shake'        },
  { label: 'Wobble',       cls: 'anim-wobble'       },
  { label: 'Flip X',       cls: 'anim-flip-x'       },
  { label: 'Rubber Band',  cls: 'anim-rubber'       },
  { label: 'Heart Beat',   cls: 'anim-heartbeat'    },
];

// ── Transition Duration Demo ───────────────────────────────────────────────

const DURATIONS = [75, 100, 150, 200, 300, 500, 700, 1000];

// ── Easing Demo ───────────────────────────────────────────────────────────

const EASINGS: { label: string; value: string }[] = [
  { label: 'linear',         value: 'linear' },
  { label: 'ease',           value: 'ease' },
  { label: 'ease-in',        value: 'ease-in' },
  { label: 'ease-out',       value: 'ease-out' },
  { label: 'ease-in-out',    value: 'ease-in-out' },
  { label: 'ease-in-back',   value: 'cubic-bezier(0.36,0,0.66,-0.56)' },
  { label: 'ease-out-back',  value: 'cubic-bezier(0.34,1.56,0.64,1)' },
  { label: 'ease-in-out-back',value: 'cubic-bezier(0.68,-0.55,0.27,1.55)' },
  { label: 'ease-in-circ',   value: 'cubic-bezier(0.55,0,1,0.45)' },
  { label: 'ease-out-circ',  value: 'cubic-bezier(0,0.55,0.45,1)' },
  { label: 'spring',         value: 'cubic-bezier(0.175,0.885,0.32,1.275)' },
];

// ── Micro-interaction demos ────────────────────────────────────────────────

function MicroInteractionsDemo() {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Hover scale */}
      <div className="anim-micro-card group cursor-pointer">
        <div className="p-4 rounded-xl border border-border bg-card transition-transform duration-200 group-hover:scale-105 group-hover:shadow-md text-center">
          <Icon name="star" size={20} />
          <p className="text-xs mt-2 text-muted-foreground font-medium">Hover Scale</p>
        </div>
      </div>
      {/* Focus ring */}
      <div className="flex flex-col gap-1">
        <input className="px-3 py-2 rounded-lg border border-border bg-card text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary" placeholder="Click to see focus ring…" />
        <span className="text-xs text-muted-foreground font-medium">Focus Ring</span>
      </div>
      {/* Button press */}
      <div className="flex flex-col items-center gap-1">
        <button type="button" className="btn btn-primary transition-transform active:scale-95">
          Press me
        </button>
        <span className="text-xs text-muted-foreground font-medium">Active:scale-95</span>
      </div>
      {/* Card lift */}
      <div className="flex flex-col items-center gap-1">
        <div className="p-4 rounded-xl border border-border bg-card cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" style={{ width: 100, textAlign: 'center' }}>
          <TwotoneIcon name="folder" size={20} color="var(--teal)" secondaryColor="var(--teal)" />
          <p className="text-xs mt-1 text-muted-foreground">Hover me</p>
        </div>
        <span className="text-xs text-muted-foreground font-medium">Card Lift</span>
      </div>
      {/* Shimmer loading */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-col gap-1.5">
          <div className="anim-shimmer h-3 rounded w-32" />
          <div className="anim-shimmer h-3 rounded w-24" />
          <div className="anim-shimmer h-3 rounded w-28" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Shimmer Skeleton</span>
      </div>
    </div>
  );
}

// ── Loading States ────────────────────────────────────────────────────────

function LoadingStatesDemo() {
  const [loading, setLoading] = useState(false);
  const trigger = () => { setLoading(true); setTimeout(() => setLoading(false), 2200); };

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <button type="button" className="oscar-btn oscar-btn-primary" onClick={trigger} disabled={loading}>
        {loading ? <><span className="oscar-spinner-sm oscar-spinner-white" /> Loading…</> : 'Submit Form'}
      </button>
      <button type="button" className="oscar-btn oscar-btn-soft-primary" onClick={trigger} disabled={loading}>
        {loading ? <><span className="oscar-spinner-sm" style={{ borderTopColor: 'var(--teal)' }} /> Processing…</> : 'Process Data'}
      </button>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="oscar-dots-spinner" style={{ '--dot-size': '7px' } as any}><div /><div /><div /></div>
          Working…
        </div>
      )}
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────

export default function AnimationsShowcase() {
  const [trigger, setTrigger] = useState(0);
  const retrigger = useCallback(() => setTrigger(k => k + 1), []);

  const [durAnim, setDurAnim] = useState(false);
  const [activeDur, setActiveDur] = useState(300);
  const [activeEasing, setActiveEasing] = useState('ease-out-back');
  const [easingActive, setEasingActive] = useState(false);

  const triggerDur = (ms: number) => {
    setActiveDur(ms);
    setDurAnim(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDurAnim(true));
    });
  };

  const triggerEase = (easing: string) => {
    setActiveEasing(easing);
    setEasingActive(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setEasingActive(true)));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="ds-section-header-block">
        <h3 className="ds-section-heading">Animations & Transitions</h3>
        <p className="ds-section-sub">
          CSS keyframe animations, Tailwind transition utilities, easing curves and micro-interactions used across the platform.
          Click any animation cell to retrigger it.
        </p>
      </div>

      {/* Retrigger hint */}
      <div className="flex items-center gap-2">
        <button type="button" className="oscar-btn oscar-btn-soft-primary" onClick={retrigger}>
          <Icon name="refresh" size={14} />
          Retrigger all animations
        </button>
        <span className="text-xs text-muted-foreground">Or click individual cells</span>
      </div>

      {/* Keyframe animations grid */}
      <AnimSection
        title="Keyframe Animations"
        desc="Platform-defined @keyframe animations — use via CSS class or inline style."
      >
        <div className="anim-grid">
          {KEYFRAME_ANIMS.map(a => (
            <div key={a.label} onClick={retrigger} className="cursor-pointer">
              <AnimBox label={a.label} animClass={a.cls} triggerKey={trigger}>
                {a.content}
              </AnimBox>
            </div>
          ))}
        </div>
      </AnimSection>

      {/* Transition durations */}
      <AnimSection
        title="Transition Durations"
        desc="Click a duration to preview a translate-Y transition at that speed."
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {DURATIONS.map(ms => (
            <button
              key={ms}
              type="button"
              onClick={() => triggerDur(ms)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                activeDur === ms
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {ms}ms
            </button>
          ))}
        </div>
        <div className="relative h-20 flex items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md"
            style={{
              transform: durAnim ? 'translateY(0)' : 'translateY(40px)',
              opacity: durAnim ? 1 : 0,
              transition: `transform ${activeDur}ms ease, opacity ${activeDur}ms ease`,
            }}
          >
            <Icon name="zap" size={14} />
            {activeDur}ms transition
          </div>
        </div>
      </AnimSection>

      {/* Easing curves */}
      <AnimSection
        title="Easing Curves"
        desc="Click an easing to preview scale(0.5 → 1) with that curve."
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {EASINGS.map(e => (
            <button
              key={e.label}
              type="button"
              onClick={() => triggerEase(e.label)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                activeEasing === e.label
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <div className="relative h-24 flex items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground shadow-lg"
            style={{
              transform: easingActive ? 'scale(1)' : 'scale(0.45)',
              opacity: easingActive ? 1 : 0.4,
              transition: `transform 600ms ${EASINGS.find(e => e.label === activeEasing)?.value ?? 'ease'}, opacity 400ms ease`,
            }}
          >
            <Icon name="sparkle" size={22} />
          </div>
        </div>
        {activeEasing && (
          <p className="text-xs font-mono text-muted-foreground mt-2">
            cubic-bezier: <span className="text-foreground">{EASINGS.find(e => e.label === activeEasing)?.value}</span>
          </p>
        )}
      </AnimSection>

      {/* Micro-interactions */}
      <AnimSection
        title="Micro-interactions"
        desc="Hover/focus/active states and skeleton loaders — the details that make UI feel alive."
      >
        <MicroInteractionsDemo />
      </AnimSection>

      {/* Loading states */}
      <AnimSection
        title="Loading States"
        desc="Triggered button loading with spinners and text feedback."
      >
        <LoadingStatesDemo />
      </AnimSection>

      {/* CSS reference table */}
      <AnimSection
        title="CSS Reference"
        desc="Class → animation mapping for copy-paste use in any component."
      >
        <div className="anim-ref-table">
          {KEYFRAME_ANIMS.map(a => (
            <div key={a.label} className="anim-ref-row">
              <code className="anim-ref-cls">.{a.cls}</code>
              <span className="anim-ref-desc">{a.label}</span>
              <button
                type="button"
                className="anim-ref-copy"
                onClick={() => navigator.clipboard?.writeText(a.cls)}
                title="Copy class name"
              >
                <Icon name="copy" size={12} />
              </button>
            </div>
          ))}
        </div>
      </AnimSection>
    </div>
  );
}
