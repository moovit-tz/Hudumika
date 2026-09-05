import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';
import { TwotoneIcon } from '../components/ui/twotone-icon.js';

// ── Style switcher (Hudumika ↔ Oscar) ─────────────────────────────────────
function StyleSwitcher({
  style,
  onChange,
}: {
  style: 'hudumika' | 'oscar';
  onChange: (s: 'hudumika' | 'oscar') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 border border-border text-xs font-semibold">
      <button
        type="button"
        onClick={() => onChange('hudumika')}
        className={`px-3 py-1.5 rounded-md transition-all ${
          style === 'hudumika'
            ? 'bg-card shadow-sm text-foreground border border-border'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Hudumika
      </button>
      <button
        type="button"
        onClick={() => onChange('oscar')}
        className={`px-3 py-1.5 rounded-md transition-all ${
          style === 'oscar'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Oscar
      </button>
    </div>
  );
}

// ── Catalog section wrapper ────────────────────────────────────────────────
function CatalogSection({
  title,
  desc,
  badge,
  switcher,
  children,
}: {
  title: string;
  desc?: string;
  badge?: string;
  switcher?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="oscar-catalog-section">
      <div className="oscar-catalog-section-header">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="oscar-catalog-section-title">{title}</h4>
            {badge && <span className="oscar-catalog-badge-new">{badge}</span>}
          </div>
          {desc && <p className="oscar-catalog-section-desc">{desc}</p>}
        </div>
        {switcher && <div className="shrink-0">{switcher}</div>}
      </div>
      <div className="oscar-catalog-section-body">{children}</div>
    </div>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────
function AlertsDemo({ style }: { style: 'hudumika' | 'oscar' }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const dismiss = (id: string) => setDismissed(d => [...d, id]);

  if (style === 'oscar') {
    return (
      <div className="flex flex-col gap-3">
        {[
          { id: 'success', label: 'Success', icon: 'checkCircle' as const, cls: 'oscar-alert-success' },
          { id: 'warning', label: 'Warning', icon: 'warning'     as const, cls: 'oscar-alert-warning' },
          { id: 'danger',  label: 'Danger',  icon: 'xCircle'    as const, cls: 'oscar-alert-danger'  },
          { id: 'info',    label: 'Info',    icon: 'info'       as const, cls: 'oscar-alert-info'    },
        ].filter(v => !dismissed.includes(v.id)).map(v => (
          <div key={v.id} className={`oscar-alert ${v.cls}`}>
            <Icon name={v.icon} size={17} />
            <div className="flex-1 min-w-0 text-sm">
              <span className="font-semibold">{v.label}!</span>
              {' '}This is a {v.label.toLowerCase()} alert — check it out.
            </div>
            <button type="button" className="oscar-alert-close" onClick={() => dismiss(v.id)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        {dismissed.length > 0 && (
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setDismissed([])}>
            ↺ Reset alerts
          </button>
        )}
      </div>
    );
  }

  // Hudumika style
  return (
    <div className="flex flex-col gap-3">
      {[
        { label: 'Success', icon: 'checkCircle' as const, bg: 'var(--green-l)', border: 'var(--green)', color: 'var(--green)' },
        { label: 'Warning', icon: 'warning'     as const, bg: 'var(--gold-l)',  border: 'var(--gold)',  color: 'var(--gold)'  },
        { label: 'Danger',  icon: 'xCircle'    as const, bg: 'var(--red-l)',   border: 'var(--red)',   color: 'var(--red)'   },
        { label: 'Info',    icon: 'info'       as const, bg: 'var(--blue-l)',  border: 'var(--blue)',  color: 'var(--blue)'  },
      ].map(v => (
        <div key={v.label}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
          style={{ background: v.bg, borderColor: v.border, color: v.color }}
        >
          <Icon name={v.icon} size={16} />
          <span className="font-semibold">{v.label}!</span>
          <span className="opacity-80">This is a {v.label.toLowerCase()} alert.</span>
        </div>
      ))}
    </div>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────
function ButtonsDemo({ style }: { style: 'hudumika' | 'oscar' }) {
  const [loading, setLoading] = useState(false);
  const triggerLoad = () => { setLoading(true); setTimeout(() => setLoading(false), 1800); };

  if (style === 'oscar') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="oscar-btn oscar-btn-primary">Primary</button>
          <button type="button" className="oscar-btn oscar-btn-secondary">Secondary</button>
          <button type="button" className="oscar-btn oscar-btn-success">Success</button>
          <button type="button" className="oscar-btn oscar-btn-warning">Warning</button>
          <button type="button" className="oscar-btn oscar-btn-danger">Danger</button>
          <button type="button" className="oscar-btn oscar-btn-ghost">Ghost</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="oscar-btn oscar-btn-soft-primary">Soft Primary</button>
          <button type="button" className="oscar-btn oscar-btn-soft-success">Soft Success</button>
          <button type="button" className="oscar-btn oscar-btn-soft-warning">Soft Warning</button>
          <button type="button" className="oscar-btn oscar-btn-soft-danger">Soft Danger</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className="oscar-btn oscar-btn-primary oscar-btn-sm">Small</button>
          <button type="button" className="oscar-btn oscar-btn-primary">Medium</button>
          <button type="button" className="oscar-btn oscar-btn-primary oscar-btn-lg">Large</button>
          <button type="button" className="oscar-btn oscar-btn-outline-primary">Outline</button>
          <button type="button" className="oscar-btn oscar-btn-primary oscar-btn-icon" onClick={triggerLoad}>
            {loading
              ? <span className="oscar-spinner-sm oscar-spinner-white" />
              : <Icon name="plus" size={16} />}
          </button>
          <button type="button" className="oscar-btn oscar-btn-primary" disabled>Disabled</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary">Primary</button>
        <button type="button" className="btn btn-secondary">Secondary</button>
        <button type="button" className="btn btn-ghost">Ghost</button>
        <button type="button" className="btn btn-danger">Danger</button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className="btn btn-secondary" onClick={triggerLoad}>
          {loading ? <span className="oscar-spinner-sm" style={{ borderTopColor: 'var(--teal)' }} /> : 'Click me'}
        </button>
        <button type="button" className="btn btn-primary" disabled>Disabled</button>
      </div>
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────
function BadgesDemo({ style }: { style: 'hudumika' | 'oscar' }) {
  if (style === 'oscar') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="oscar-badge oscar-badge-solid-primary">Primary</span>
          <span className="oscar-badge oscar-badge-solid-success">Success</span>
          <span className="oscar-badge oscar-badge-solid-warning">Warning</span>
          <span className="oscar-badge oscar-badge-solid-danger">Danger</span>
          <span className="oscar-badge oscar-badge-solid-info">Info</span>
          <span className="oscar-badge oscar-badge-solid-purple">Accent</span>
          <span className="text-xs text-muted-foreground font-medium ml-1">Solid fill</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="oscar-badge oscar-badge-outline-primary">Primary</span>
          <span className="oscar-badge oscar-badge-outline-success">Success</span>
          <span className="oscar-badge oscar-badge-outline-warning">Warning</span>
          <span className="oscar-badge oscar-badge-outline-danger">Danger</span>
          <span className="text-xs text-muted-foreground font-medium ml-1">Outline</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="oscar-badge oscar-badge-soft-primary">Primary</span>
          <span className="oscar-badge oscar-badge-soft-success">Success</span>
          <span className="oscar-badge oscar-badge-soft-warning">Warning</span>
          <span className="oscar-badge oscar-badge-soft-danger">Danger</span>
          <span className="text-xs text-muted-foreground font-medium ml-1">Soft (Hudumika default)</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="oscar-badge oscar-badge-solid-primary oscar-badge-sm">Small</span>
          <span className="oscar-badge oscar-badge-solid-primary">Medium</span>
          <span className="oscar-badge oscar-badge-solid-primary oscar-badge-lg">Large</span>
          <span className="oscar-badge oscar-badge-soft-success flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Online
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="badge badge-teal">Brand</span>
        <span className="badge badge-green">Success</span>
        <span className="badge badge-gold">Warning</span>
        <span className="badge badge-red">Danger</span>
        <span className="badge badge-blue">Info</span>
        <span className="badge badge-purple">Accent</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="status-pill spl-teal">Active</span>
        <span className="status-pill spl-amber">Pending</span>
        <span className="status-pill spl-red">Overdue</span>
        <span className="status-pill spl-green">Cleared</span>
      </div>
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────────
function CardsDemo({ style }: { style: 'hudumika' | 'oscar' }) {
  if (style === 'oscar') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="oscar-card oscar-card-lift">
          <div className="oscar-card-body">
            <TwotoneIcon name="building" size={28} color="var(--teal)" secondaryColor="var(--teal)" />
            <h5 className="oscar-card-title mt-3">Lift on Hover</h5>
            <p className="oscar-card-desc">Shadow deepens and card rises on hover — Oscar's signature card interaction.</p>
            <button type="button" className="oscar-btn oscar-btn-soft-primary mt-4">Learn more</button>
          </div>
        </div>
        <div className="oscar-card oscar-card-accent">
          <div className="oscar-card-body">
            <h5 className="oscar-card-title">Accent Top Stripe</h5>
            <p className="oscar-card-desc">A 3px brand-color top border instantly communicates importance or category.</p>
            <div className="flex items-center gap-2 mt-4">
              <span className="oscar-badge oscar-badge-soft-primary">Featured</span>
              <span className="oscar-badge oscar-badge-soft-success">Live</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="card p-5">
        <TwotoneIcon name="building" size={28} color="var(--teal)" secondaryColor="var(--teal)" />
        <h5 className="font-semibold text-sm mt-3 mb-1">Standard Card</h5>
        <p className="text-xs text-muted-foreground">Hudumika default card surface with border and subtle shadow.</p>
        <button type="button" className="btn btn-primary mt-4" style={{ fontSize: 12, padding: '5px 14px' }}>Learn more</button>
      </div>
      <div className="card p-5 border-t-2" style={{ borderTopColor: 'var(--teal)' }}>
        <h5 className="font-semibold text-sm mb-1">Accent Card</h5>
        <p className="text-xs text-muted-foreground">Emphasised with a coloured top border in the active brand hue.</p>
        <div className="flex gap-2 mt-4">
          <span className="badge badge-teal">Featured</span>
          <span className="badge badge-green">Live</span>
        </div>
      </div>
    </div>
  );
}

// ── Stat Cards ────────────────────────────────────────────────────────────
function StatCardsDemo() {
  const stats = [
    { label: 'Total Revenue', value: 'KES 4.2M', trend: '+12.5%', up: true,  icon: 'dollarSign' as const, color: 'var(--teal)'   },
    { label: 'Active Users',  value: '2,847',    trend: '+8.2%',  up: true,  icon: 'users'      as const, color: 'var(--blue)'   },
    { label: 'Shipments',     value: '1,429',    trend: '-3.1%',  up: false, icon: 'package'    as const, color: 'var(--gold)'   },
    { label: 'Compliance',    value: '98.6%',    trend: '+0.4%',  up: true,  icon: 'shield'     as const, color: 'var(--green)'  },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="oscar-stat-card">
          <div className="oscar-stat-icon" style={{ background: s.color + '22', color: s.color }}>
            <Icon name={s.icon} size={18} />
          </div>
          <div className="oscar-stat-value">{s.value}</div>
          <div className="oscar-stat-label">{s.label}</div>
          <div className={`oscar-stat-trend ${s.up ? 'oscar-stat-up' : 'oscar-stat-down'}`}>
            <Icon name={s.up ? 'trendingUp' : 'trendingDown'} size={12} />
            {s.trend} vs last month
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Progress Bars ─────────────────────────────────────────────────────────
function ProgressDemo({ style }: { style: 'hudumika' | 'oscar' }) {
  if (style === 'oscar') {
    return (
      <div className="flex flex-col gap-4">
        {[
          { label: 'Default',   pct: 65, cls: 'oscar-progress-primary'   },
          { label: 'Striped',   pct: 45, cls: 'oscar-progress-success oscar-progress-striped' },
          { label: 'Animated',  pct: 80, cls: 'oscar-progress-warning oscar-progress-striped oscar-progress-animated' },
          { label: 'Pill',      pct: 30, cls: 'oscar-progress-danger oscar-progress-pill' },
        ].map(p => (
          <div key={p.label}>
            <div className="flex justify-between text-xs text-muted-foreground font-medium mb-1.5">
              <span>{p.label}</span><span>{p.pct}%</span>
            </div>
            <div className="oscar-progress">
              <div className={`oscar-progress-bar ${p.cls}`} style={{ width: `${p.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {[65, 45, 80, 30].map((pct, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Progress {i + 1}</span><span>{pct}%</span></div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--teal)', transition: 'width 0.6s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonDemo() {
  return (
    <div className="oscar-skeleton-card">
      <div className="flex items-start gap-3">
        <div className="oscar-skel oscar-skel-circle" style={{ width: 40, height: 40 }} />
        <div className="flex-1 space-y-2">
          <div className="oscar-skel h-4 rounded" style={{ width: '60%' }} />
          <div className="oscar-skel h-3 rounded" style={{ width: '100%' }} />
          <div className="oscar-skel h-3 rounded" style={{ width: '80%' }} />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="oscar-skel h-3 rounded" style={{ width: '100%' }} />
        <div className="oscar-skel h-3 rounded" style={{ width: '100%' }} />
        <div className="oscar-skel h-3 rounded" style={{ width: '70%' }} />
      </div>
      <div className="flex gap-2 mt-5">
        <div className="oscar-skel rounded-lg" style={{ height: 34, width: 96 }} />
        <div className="oscar-skel rounded-lg" style={{ height: 34, width: 80 }} />
      </div>
    </div>
  );
}

// ── Spinners ──────────────────────────────────────────────────────────────
function SpinnersDemo() {
  return (
    <div className="flex flex-wrap gap-10 items-end">
      {[
        { label: 'Ring SM',   el: <div className="oscar-spinner oscar-spinner-primary" style={{ width: 20, height: 20 }} /> },
        { label: 'Ring MD',   el: <div className="oscar-spinner oscar-spinner-primary" /> },
        { label: 'Ring LG',   el: <div className="oscar-spinner oscar-spinner-success" style={{ width: 36, height: 36, borderWidth: 3 }} /> },
        { label: 'Dots',      el: <div className="oscar-dots-spinner"><div /><div /><div /></div> },
        { label: 'Pulse',     el: <div className="oscar-pulse-spinner" style={{ background: 'var(--teal)' }} /> },
        { label: 'Ping',      el: <div className="relative w-4 h-4"><div className="absolute inset-0 rounded-full bg-primary" /><div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-70" /></div> },
        { label: 'Grow',      el: <div className="oscar-grow-spinner" /> },
      ].map(s => (
        <div key={s.label} className="flex flex-col items-center gap-2">
          {s.el}
          <span className="text-[10px] text-muted-foreground font-medium">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Lists ─────────────────────────────────────────────────────────────────
function ListsDemo() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="oscar-list">
        {['ClearOS Customs', 'NexusHR Payroll', 'ComplyOS Risk', 'HuduFreight', 'FinOps Billing'].map((item, i) => (
          <div key={i} className="oscar-list-item">
            <span className="oscar-list-index">{i + 1}</span>
            <span className="text-sm flex-1">{item}</span>
            <Icon name="chevronRight" size={14} style={{ color: 'var(--ink3)' }} />
          </div>
        ))}
      </div>
      <div className="oscar-list">
        {[
          { icon: 'ship'    as const, label: 'Sea Freight',    desc: '42 active shipments' },
          { icon: 'plane'   as const, label: 'Air Cargo',       desc: '18 active shipments' },
          { icon: 'truck'   as const, label: 'Road Transport',  desc: '67 active deliveries' },
          { icon: 'package' as const, label: 'Warehousing',     desc: '203 stored items' },
        ].map(item => (
          <div key={item.label} className="oscar-list-item">
            <div className="oscar-list-icon"><Icon name={item.icon} size={15} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs" style={{ color: 'var(--ink3)' }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function TabsDemo({ style }: { style: 'hudumika' | 'oscar' }) {
  const [tab, setTab] = useState(0);
  const labels = ['Overview', 'Analytics', 'Reports', 'Settings'];

  if (style === 'oscar') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Underline</p>
          <div className="oscar-tabs-underline">
            {labels.map((l, i) => (
              <button key={i} type="button" className={`oscar-tab-ul${tab === i ? ' oscar-tab-ul--active' : ''}`} onClick={() => setTab(i)}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Pill</p>
          <div className="oscar-tabs-pill">
            {labels.map((l, i) => (
              <button key={i} type="button" className={`oscar-tab-pill${tab === i ? ' oscar-tab-pill--active' : ''}`} onClick={() => setTab(i)}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Boxed</p>
          <div className="oscar-tabs-boxed">
            {labels.map((l, i) => (
              <button key={i} type="button" className={`oscar-tab-box${tab === i ? ' oscar-tab-box--active' : ''}`} onClick={() => setTab(i)}>{l}</button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Active: <strong>{labels[tab]}</strong></p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 border-b border-border">
        {labels.map((l, i) => (
          <button key={i} type="button" onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === i ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {l}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground p-2">Content for <strong>{labels[tab]}</strong> tab.</p>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────
function ToastDemo() {
  const [toasts, setToasts] = useState<{ id: number; type: string; msg: string }[]>([]);
  let uid = 0;

  const show = (type: string, msg: string) => {
    const id = ++uid;
    setToasts(t => [...t.slice(-3), { id, type, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  const iconMap: Record<string, 'checkCircle' | 'warning' | 'xCircle' | 'info'> = {
    success: 'checkCircle', warning: 'warning', danger: 'xCircle', info: 'info',
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="oscar-btn oscar-btn-soft-success" onClick={() => show('success', 'Operation completed successfully!')}>Success</button>
        <button type="button" className="oscar-btn oscar-btn-soft-warning" onClick={() => show('warning', 'Please review the configuration.')}>Warning</button>
        <button type="button" className="oscar-btn oscar-btn-soft-danger"  onClick={() => show('danger',  'Action could not be completed.')}>Danger</button>
        <button type="button" className="oscar-btn oscar-btn-soft-primary" onClick={() => show('info',    'Your changes are saved.')}>Info</button>
      </div>
      <div className="flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`oscar-toast oscar-toast-${t.type}`}>
            <Icon name={iconMap[t.type]} size={16} />
            <span className="text-sm flex-1">{t.msg}</span>
            <button type="button" className="opacity-50 hover:opacity-100" onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────
function PaginationDemo({ style }: { style: 'hudumika' | 'oscar' }) {
  const [page, setPage] = useState(3);
  const pages = [1, 2, 3, 4, 5];
  const go = (p: number) => setPage(Math.max(1, Math.min(5, p)));

  if (style === 'oscar') {
    return (
      <div className="oscar-pagination">
        <button type="button" className="oscar-page-btn" onClick={() => go(page - 1)} disabled={page === 1}><Icon name="chevronLeft" size={15} /></button>
        {pages.map(p => (
          <button key={p} type="button" className={`oscar-page-btn${page === p ? ' oscar-page-btn--active' : ''}`} onClick={() => go(p)}>{p}</button>
        ))}
        <button type="button" className="oscar-page-btn" onClick={() => go(page + 1)} disabled={page === 5}><Icon name="chevronRight" size={15} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn btn-secondary" style={{ padding: '5px 10px' }} onClick={() => go(page - 1)} disabled={page === 1}><Icon name="chevronLeft" size={14} /></button>
      {pages.map(p => (
        <button key={p} type="button" className={`btn ${page === p ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '5px 10px', minWidth: 34 }} onClick={() => go(p)}>{p}</button>
      ))}
      <button type="button" className="btn btn-secondary" style={{ padding: '5px 10px' }} onClick={() => go(page + 1)} disabled={page === 5}><Icon name="chevronRight" size={14} /></button>
    </div>
  );
}

// ── FAB ───────────────────────────────────────────────────────────────────
function FabDemo() {
  const [open, setOpen] = useState(false);
  const actions = [
    { icon: 'plus'   as const, label: 'New Record' },
    { icon: 'upload' as const, label: 'Import File' },
    { icon: 'send'   as const, label: 'Send Report' },
  ];
  return (
    <div className="relative flex items-center justify-end" style={{ minHeight: 130 }}>
      {open && (
        <div className="absolute flex flex-col-reverse gap-2" style={{ right: 58, bottom: 4, animation: 'oscarFadeIn 0.2s ease' }}>
          {actions.map(a => (
            <div key={a.label} className="flex items-center gap-2 justify-end">
              <span className="oscar-fab-label">{a.label}</span>
              <button type="button" className="oscar-fab oscar-fab-mini" onClick={() => setOpen(false)}>
                <Icon name={a.icon} size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className={`oscar-fab oscar-fab-primary${open ? ' oscar-fab-open' : ''}`} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'close' : 'plus'} size={20} />
      </button>
    </div>
  );
}

// ── Accordion ─────────────────────────────────────────────────────────────
function AccordionDemo() {
  const [open, setOpen] = useState<number | null>(0);
  const items = [
    { q: 'What is the Design System?',  a: 'A collection of reusable design tokens, components and patterns that ensure visual consistency across all Hudumika applications.' },
    { q: 'How do I switch icon sets?',  a: 'Navigate to Design Studio → Components → Icon System. Select your preferred library (Stroke, Twotone, or Hugeicons) and click "Use platform-wide".' },
    { q: 'Can tenants customise their brand?', a: 'Yes — SuperAdmins can configure per-tenant primary colour, logos, app names and slogans from the Identity & Brand section.' },
  ];
  return (
    <div className="oscar-accordion">
      {items.map((item, i) => (
        <div key={i} className={`oscar-accordion-item${open === i ? ' oscar-accordion-item--open' : ''}`}>
          <button type="button" className="oscar-accordion-trigger" onClick={() => setOpen(open === i ? null : i)}>
            <span className="text-sm font-semibold">{item.q}</span>
            <Icon name={open === i ? 'chevronUp' : 'chevronDown'} size={16} style={{ color: 'var(--ink3)', flexShrink: 0 }} />
          </button>
          {open === i && (
            <div className="oscar-accordion-body" style={{ animation: 'oscarFadeIn 0.18s ease' }}>
              <p className="text-sm text-muted-foreground">{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Forms: Inputs ──────────────────────────────────────────────────────────
function InputsDemo() {
  return (
    <div className="flex flex-col gap-4">
      <div className="oscar-input-group">
        <label className="oscar-label">Standard input</label>
        <input type="text" className="oscar-input" placeholder="Enter value..." />
      </div>
      <div className="oscar-input-group">
        <label className="oscar-label">With icon prefix</label>
        <div className="oscar-input-wrap">
          <Icon name="search" size={16} className="oscar-input-icon-left" />
          <input type="text" className="oscar-input oscar-input-pl" placeholder="Search..." />
        </div>
      </div>
      <div className="oscar-input-group">
        <label className="oscar-label">With addon</label>
        <div className="oscar-input-addon-row">
          <span className="oscar-input-addon">https://</span>
          <input type="text" className="oscar-input oscar-input-addon-right" placeholder="yoursite.com" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="oscar-input-group">
          <label className="oscar-label" style={{ color: 'var(--green)' }}>Valid input</label>
          <input type="text" className="oscar-input oscar-input-success" defaultValue="valid@email.com" />
          <span className="text-xs mt-1" style={{ color: 'var(--green)' }}>✓ Looks good!</span>
        </div>
        <div className="oscar-input-group">
          <label className="oscar-label" style={{ color: 'var(--red)' }}>Error input</label>
          <input type="text" className="oscar-input oscar-input-error" defaultValue="invalid value" />
          <span className="text-xs mt-1" style={{ color: 'var(--red)' }}>✗ Please enter a valid value</span>
        </div>
      </div>
    </div>
  );
}

// ── Forms: Checks & Radios ────────────────────────────────────────────────
function ChecksDemo() {
  const [checks, setChecks] = useState([true, false, false]);
  const [radio, setRadio] = useState(0);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Checkboxes</p>
        <div className="flex flex-col gap-3">
          {['Design System', 'Component Library', 'Theme Engine'].map((l, i) => (
            <label key={l} className="oscar-check-row">
              <input type="checkbox" className="oscar-check" checked={checks[i]} onChange={() => setChecks(c => c.map((v, j) => j === i ? !v : v))} />
              <span className="oscar-check-label">{l}</span>
            </label>
          ))}
          <label className="oscar-check-row opacity-50">
            <input type="checkbox" className="oscar-check" disabled />
            <span className="oscar-check-label">Disabled option</span>
          </label>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Radio Group</p>
        <div className="flex flex-col gap-3">
          {['Monthly', 'Quarterly', 'Annually'].map((l, i) => (
            <label key={l} className="oscar-check-row">
              <input type="radio" className="oscar-radio" name="billing-demo" checked={radio === i} onChange={() => setRadio(i)} />
              <span className="oscar-check-label">{l}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Forms: Range ──────────────────────────────────────────────────────────
function RangeDemo() {
  const [val, setVal] = useState(65);
  return (
    <div className="oscar-input-group">
      <div className="flex justify-between mb-2">
        <label className="oscar-label">Compliance threshold</label>
        <span className="text-sm font-bold" style={{ color: 'var(--teal)' }}>{val}%</span>
      </div>
      <input type="range" min={0} max={100} value={val} onChange={e => setVal(+e.target.value)} className="oscar-range" />
      <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>0%</span><span>100%</span></div>
    </div>
  );
}

// ── Forms: File Upload ────────────────────────────────────────────────────
function FileUploadDemo() {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  return (
    <label
      className={`oscar-dropzone${drag ? ' oscar-dropzone-active' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]?.name ?? null); }}
    >
      <TwotoneIcon name="upload" size={32} color="var(--teal)" secondaryColor="var(--teal)" />
      <p className="text-sm font-semibold mt-2">{file ?? 'Drop files here or click to upload'}</p>
      <p className="text-xs text-muted-foreground mt-1">PDF, XLSX, PNG — up to 20MB</p>
      <span className="oscar-btn oscar-btn-soft-primary mt-3 pointer-events-none">Browse Files</span>
      <input type="file" className="sr-only" onChange={e => setFile(e.target.files?.[0]?.name ?? null)} />
    </label>
  );
}

// ── Forms: Rating ─────────────────────────────────────────────────────────
function RatingDemo() {
  const [rating, setRating] = useState(3);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <label className="oscar-label">Rate your experience</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} type="button" className="oscar-star"
            style={{ color: (hover ?? rating) >= s ? 'var(--gold)' : 'var(--border)' }}
            onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} onClick={() => setRating(s)}>
            <Icon name="star" size={26} />
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{rating} / 5 stars selected</span>
    </div>
  );
}

// ── 1. Timeline & Activity Flow Demo (Oscar & Vuexy System) ─────────────────
function TimelineDemo() {
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [replied, setReplied] = useState<string[]>([]);
  const [accepted, setAccepted] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      {/* Smooth Animated Notification Card (Image 1) */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-sm max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-base text-foreground">Notifications</h4>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary">22 new</span>
          </div>
          {/* Animated Tab Filter */}
          <div className="flex items-center p-1 rounded-xl bg-muted/50 border border-border text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'all' ? 'bg-card shadow-xs text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All <span className="ml-1 text-[10px] px-1 rounded-full bg-muted text-muted-foreground">22</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'unread' ? 'bg-card shadow-xs text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unread <span className="ml-1 text-[10px] px-1 rounded-full bg-emerald-500/15 text-emerald-600">12</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'archived' ? 'bg-card shadow-xs text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Archived <span className="ml-1 text-[10px] px-1 rounded-full bg-muted text-muted-foreground">10</span>
            </button>
          </div>
        </div>

        {/* Item 1: Deja Brady Request */}
        <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-muted/30 border border-border/60 hover:bg-muted/50 transition-colors">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-600 font-bold flex items-center justify-center text-sm border border-teal-500/30">
              DB
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-foreground leading-snug">
                <span className="font-bold">Deja Brady</span> sent you a friend request
              </p>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">2 hours ago</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-card border border-border text-muted-foreground">
                iPod
              </span>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-card border border-border text-muted-foreground">
                Apple Watch
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAccepted((a) => [...a, 'deja'])}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  accepted.includes('deja')
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-primary text-primary-foreground hover:opacity-90 shadow-xs'
                }`}
              >
                {accepted.includes('deja') ? '✓ Accepted' : 'Accept'}
              </button>
              <button
                type="button"
                className="px-3 py-1 text-xs font-medium rounded-lg bg-card border border-border text-foreground hover:bg-muted"
              >
                Decline
              </button>
            </div>
          </div>
        </div>

        {/* Item 2: Jayvon Hull Mention */}
        <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-muted/30 border border-border/60 hover:bg-muted/50 transition-colors">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-600 font-bold flex items-center justify-center text-sm border border-purple-500/30">
              JH
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-card" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-foreground leading-snug">
                <span className="font-bold">Jayvon Hull</span> mentioned you in <span className="text-primary font-medium">Minimal UI</span>
              </p>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">a day ago</span>
            </div>

            <div className="p-2.5 rounded-lg bg-card border border-border text-xs text-muted-foreground italic">
              "@Jaydon Frankie feedback by asking questions or just leave a note of appreciation."
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-card border border-border text-muted-foreground">
                iMac
              </span>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-card border border-border text-muted-foreground">
                iPhone
              </span>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setReplied((r) => [...r, 'jayvon'])}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  replied.includes('jayvon')
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {replied.includes('jayvon') ? '✓ Replied' : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Oscar Timeline Flow Component (Image 1 Process Timeline) */}
      <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
        <h4 className="font-bold text-sm text-foreground uppercase tracking-wider">Vertical Activity Audit Track</h4>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-teal-500/40">
          <div className="relative flex items-start gap-4 group">
            <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
              ✓
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">User Onboarding Initialized</span>
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-emerald-500/15 text-emerald-600">Completed</span>
              </div>
              <p className="text-xs text-muted-foreground">Identity & KYC credentials cryptographically verified on hardware node.</p>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground">iMac Pro</span>
                <span className="text-[10px] text-muted-foreground">• 10:42 AM</span>
              </div>
            </div>
          </div>

          <div className="relative flex items-start gap-4 group">
            <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
              ✓
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Security Token & Passkey Issued</span>
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-emerald-500/15 text-emerald-600">Active</span>
              </div>
              <p className="text-xs text-muted-foreground">Hardware security key registered to tenant auth domain.</p>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground">Apple Watch</span>
                <span className="text-[10px] text-muted-foreground">• 11:15 AM</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 2. Vuexy Advanced DataTables Showcase (Image 2) ──────────────────────────
function AdvancedDataTablesDemo() {
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(5);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  const sampleData = [
    { id: 1, name: 'Deja Brady', email: 'deja.brady@hudumika.co.ke', role: 'SuperAdmin', status: 'Active', avatar: 'DB', color: 'bg-teal-500/20 text-teal-600' },
    { id: 2, name: 'Jayvon Hull', email: 'jayvon.h@clearos.app', role: 'Security Lead', status: 'Active', avatar: 'JH', color: 'bg-purple-500/20 text-purple-600' },
    { id: 3, name: 'Lainey Davidson', email: 'lainey.d@gov.ke', role: 'Auditor', status: 'Pending', avatar: 'LD', color: 'bg-amber-500/20 text-amber-600' },
    { id: 4, name: 'Jaydon Frankie', email: 'jaydon.f@hudumika.co.ke', role: 'Developer', status: 'Active', avatar: 'JF', color: 'bg-blue-500/20 text-blue-600' },
    { id: 5, name: 'Angelica Ramos', email: 'angelica.r@clearos.app', role: 'Customs Officer', status: 'Inactive', avatar: 'AR', color: 'bg-rose-500/20 text-rose-600' },
  ];

  const toggleSelect = (id: number) => {
    setSelectedRows((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const filtered = sampleData.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.email.toLowerCase().includes(search.toLowerCase()) ||
      d.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Show</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-8 px-2 rounded-lg bg-background border border-border text-xs font-medium text-foreground outline-none"
          >
            <option value={5}>5 entries</option>
            <option value={10}>10 entries</option>
            <option value={25}>25 entries</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-48">
            <input
              type="text"
              placeholder="Search table..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-border text-xs text-foreground outline-none focus:border-primary"
            />
            <Icon name="search" size={13} className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
          </div>
          <button type="button" className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 shadow-xs">
            + Add New User
          </button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedRows.length === sampleData.length}
                  onChange={(e) => setSelectedRows(e.target.checked ? sampleData.map((d) => d.id) : [])}
                  className="rounded border-border"
                />
              </th>
              <th className="p-3">User & Identity</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedRows.includes(row.id)}
                    onChange={() => toggleSelect(row.id)}
                    className="rounded border-border"
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center ${row.color}`}>
                      {row.avatar}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{row.name}</span>
                      <span className="text-[11px] text-muted-foreground">{row.email}</span>
                    </div>
                  </div>
                </td>
                <td className="p-3 font-medium text-foreground">{row.role}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                      row.status === 'Active'
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : row.status === 'Pending'
                        ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-slate-500/15 text-slate-600'
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Icon name="edit" size={13} />
                    </button>
                    <button type="button" className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 3. Avatar Switchers & Stacked Groups Showcase ───────────────────────────
function AvatarSwitcherDemo() {
  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
        <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider">Avatar Size Ladder & Online Indicators</h4>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-600 font-bold text-[10px] flex items-center justify-center border border-teal-500/30">
                DB
              </div>
              <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-card" />
            </div>
            <span className="text-[10px] text-muted-foreground">XS (24px)</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-600 font-bold text-xs flex items-center justify-center border border-purple-500/30">
                JH
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-card" />
            </div>
            <span className="text-[10px] text-muted-foreground">SM (32px)</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-600 font-bold text-sm flex items-center justify-center border border-blue-500/30">
                LD
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-card" />
            </div>
            <span className="text-[10px] text-muted-foreground">MD (40px)</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-600 font-bold text-base flex items-center justify-center border border-rose-500/30">
                JF
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-card" />
            </div>
            <span className="text-[10px] text-muted-foreground">LG (48px)</span>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
        <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider">Stacked Avatar Group Overlays</h4>
        <div className="flex items-center -space-x-3">
          <div className="w-10 h-10 rounded-full bg-teal-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-card">
            DB
          </div>
          <div className="w-10 h-10 rounded-full bg-purple-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-card">
            JH
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-card">
            LD
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-card">
            JF
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center ring-2 ring-card">
            +4
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 4. Multi-Variant Tab Strips & Stacked Cards Showcase (Image 3) ───────────
function StackedCardsAndTabsDemo() {
  const [activeTab1, setActiveTab1] = useState('basic');
  const [activeTab2, setActiveTab2] = useState('basic');
  const [activeTab3, setActiveTab3] = useState('basic');
  const [activeTab4, setActiveTab4] = useState('basic');
  const [activeTab5, setActiveTab5] = useState('basic');

  const tabs = ['Basic', 'Integrations', 'Team', 'Billing', 'Advanced'];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-card border border-border space-y-6">
        <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider">Vuexy Multi-Variant Tab Strip Ladder</h4>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground">1. Minimalist Plain Text Tabs</span>
          <div className="flex items-center gap-6 border-b border-border/40 pb-2">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab1(t.toLowerCase())}
                className={`text-sm font-semibold transition-colors ${
                  activeTab1 === t.toLowerCase() ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground">2. Solid Active Pill Tabs</span>
          <div className="flex items-center gap-3">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab2(t.toLowerCase())}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab2 === t.toLowerCase()
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground">3. Underlined Active Bar Tabs</span>
          <div className="flex items-center gap-6 border-b border-border">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab3(t.toLowerCase())}
                className={`pb-2 text-xs font-bold transition-all relative ${
                  activeTab3 === t.toLowerCase()
                    ? 'text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground">4. Segmented Boxed Track Tabs</span>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border w-fit">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab4(t.toLowerCase())}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab4 === t.toLowerCase()
                    ? 'bg-card shadow-xs text-primary border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground">5. Soft Tint Highlight Tabs</span>
          <div className="flex items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab5(t.toLowerCase())}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab5 === t.toLowerCase()
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
const OSCAR_TABS = [
  { id: 'ui'        as const, label: 'UI Components',        icon: 'layers'   as const },
  { id: 'timeline'  as const, label: 'Timeline & Activity',  icon: 'activity' as const },
  { id: 'tables'    as const, label: 'DataTables & Avatars', icon: 'grid'     as const },
  { id: 'forms'     as const, label: 'Forms',                icon: 'fileText' as const },
];

export default function OscarCatalog() {
  const [activeTab, setActiveTab] = useState<'ui' | 'timeline' | 'tables' | 'forms'>('ui');
  const [btnStyle,      setBtnStyle]      = useState<'hudumika' | 'oscar'>('oscar');
  const [alertStyle,    setAlertStyle]    = useState<'hudumika' | 'oscar'>('oscar');
  const [badgeStyle,    setBadgeStyle]    = useState<'hudumika' | 'oscar'>('oscar');
  const [cardStyle,     setCardStyle]     = useState<'hudumika' | 'oscar'>('oscar');
  const [progressStyle, setProgressStyle] = useState<'hudumika' | 'oscar'>('oscar');
  const [tabStyle,      setTabStyle]      = useState<'hudumika' | 'oscar'>('oscar');
  const [paginStyle,    setPaginStyle]    = useState<'hudumika' | 'oscar'>('oscar');

  return (
    <div className="space-y-8">
      <div className="ds-section-header-block">
        <div className="flex items-start gap-4">
          <div className="oscar-catalog-logo">
            <TwotoneIcon name="sparkle" size={22} color="var(--teal)" secondaryColor="var(--teal)" />
          </div>
          <div>
            <h3 className="ds-section-heading">Oscar & Vuexy System Catalog</h3>
            <p className="ds-section-sub">
              Oscar, DaisyUI & Vuexy-inspired component variants adapted to Hudumika's system.
              Includes <strong>Timeline audit tracks</strong>, <strong>Notification Cards with animated tabs</strong>,
              <strong>Advanced Vuexy DataTables</strong>, <strong>Stacked Avatar Groups</strong>, and <strong>6 Tab Strip Variants</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border w-fit flex-wrap">
        {OSCAR_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === t.id
                ? 'bg-card shadow-sm text-foreground border border-border font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'ui' && (
        <div className="flex flex-col gap-6">
          <CatalogSection title="Alerts" desc="Dismissible feedback banners." switcher={<StyleSwitcher style={alertStyle} onChange={setAlertStyle} />}>
            <AlertsDemo style={alertStyle} />
          </CatalogSection>

          <CatalogSection title="Buttons" desc="Solid, outline, ghost, and soft (Oscar-exclusive) variants." switcher={<StyleSwitcher style={btnStyle} onChange={setBtnStyle} />}>
            <ButtonsDemo style={btnStyle} />
          </CatalogSection>

          <CatalogSection title="Badges" desc="Solid fill, outline, and soft tint." badge="Oscar adds solid + outline" switcher={<StyleSwitcher style={badgeStyle} onChange={setBadgeStyle} />}>
            <BadgesDemo style={badgeStyle} />
          </CatalogSection>

          <CatalogSection title="Cards" desc="Standard, lift-on-hover, and accent stripe." switcher={<StyleSwitcher style={cardStyle} onChange={setCardStyle} />}>
            <CardsDemo style={cardStyle} />
          </CatalogSection>

          <CatalogSection title="Stat Cards" desc="KPI metric grid — icon, value, label, trend indicator.">
            <StatCardsDemo />
          </CatalogSection>

          <CatalogSection title="Progress Bars" desc="Determinate, striped, animated, and pill." badge="Oscar adds striped + animated" switcher={<StyleSwitcher style={progressStyle} onChange={setProgressStyle} />}>
            <ProgressDemo style={progressStyle} />
          </CatalogSection>

          <CatalogSection title="Skeleton Loaders" desc="Shimmer skeleton for async content — card, avatar, lines.">
            <SkeletonDemo />
          </CatalogSection>

          <CatalogSection title="Spinners" desc="Ring, dots, pulse, ping, and grow loading indicators.">
            <SpinnersDemo />
          </CatalogSection>

          <CatalogSection title="Lists" desc="Numbered divided and icon-leading description lists.">
            <ListsDemo />
          </CatalogSection>

          <CatalogSection title="Accordion" desc="Smooth collapsible Q&A and content sections.">
            <AccordionDemo />
          </CatalogSection>

          <CatalogSection title="Tabs" desc="Underline, pill, and boxed variants." badge="Oscar adds boxed tabs" switcher={<StyleSwitcher style={tabStyle} onChange={setTabStyle} />}>
            <TabsDemo style={tabStyle} />
          </CatalogSection>

          <CatalogSection title="Toast Notifications" desc="Triggered alerts with auto-dismiss and manual close.">
            <ToastDemo />
          </CatalogSection>

          <CatalogSection title="Pagination" desc="Numbered pages with prev/next arrows." switcher={<StyleSwitcher style={paginStyle} onChange={setPaginStyle} />}>
            <PaginationDemo style={paginStyle} />
          </CatalogSection>

          <CatalogSection title="FAB — Floating Action Button" desc="Speed-dial FAB with expandable action set.">
            <FabDemo />
          </CatalogSection>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="flex flex-col gap-6">
          <CatalogSection title="Notifications & Timelines" desc="Animated notification card with filter tabs, device tags, action responses, and vertical audit timeline.">
            <TimelineDemo />
          </CatalogSection>
        </div>
      )}

      {activeTab === 'tables' && (
        <div className="flex flex-col gap-6">
          <CatalogSection title="Vuexy Advanced DataTables" desc="Interactive DataTable with pagination, page size selector, sorting, search filter, and select checkboxes.">
            <AdvancedDataTablesDemo />
          </CatalogSection>

          <CatalogSection title="Avatar System & Stacked Overlays" desc="Avatar size ladder (XS to XL), status dots (Online/Busy/Away), and overlapping avatar stacks.">
            <AvatarSwitcherDemo />
          </CatalogSection>

          <CatalogSection title="Multi-Variant Tab Strip Ladder" desc="6 distinct tab variants (Plain, Solid Pill, Underlined Bar, Segmented Boxed Track, Soft Tint).">
            <StackedCardsAndTabsDemo />
          </CatalogSection>
        </div>
      )}

      {activeTab === 'forms' && (
        <div className="flex flex-col gap-6">
          <CatalogSection title="Text Inputs" desc="Standard, icon-prefixed, addon, valid and error states.">
            <InputsDemo />
          </CatalogSection>

          <CatalogSection title="Checks & Radios" desc="Styled checkboxes and radio groups.">
            <ChecksDemo />
          </CatalogSection>

          <CatalogSection title="Range Slider" desc="Branded range input with live value readout.">
            <RangeDemo />
          </CatalogSection>

          <CatalogSection title="File Upload" desc="Drag-and-drop zone with click-to-browse fallback.">
            <FileUploadDemo />
          </CatalogSection>

          <CatalogSection title="Star Rating" desc="Interactive star picker with hover preview.">
            <RatingDemo />
          </CatalogSection>
        </div>
      )}
    </div>
  );
}
