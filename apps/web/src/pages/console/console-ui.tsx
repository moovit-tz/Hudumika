/**
 * Console visual building blocks.
 *
 * The console's own pages sit beside the former SuperAdmin pages (now console
 * tools), so they are built from the same parts — KPICard, the rtbl
 * DataTable/TR/TD, the coloured status Badge and `.card` panels from
 * superadmin/shared.tsx — instead of a second, plainer style. Colours come
 * from tokens only.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { APP_REGISTRY } from '../../lib/appRegistry.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Badge as SABadge, DataTable, KPICard, TD, TR } from '../superadmin/shared.js';

export { DataTable, KPICard, TD, TR };

type Cfg = { label: string; color: string; bg: string };
const tone = {
  green: { color: 'var(--green)', bg: 'var(--green-l)' },
  gold: { color: 'var(--gold)', bg: 'var(--gold-l)' },
  red: { color: 'var(--red)', bg: 'var(--red-l)' },
  blue: { color: 'var(--blue)', bg: 'var(--blue-l)' },
  teal: { color: 'var(--teal)', bg: 'var(--teal-l)' },
  gray: { color: 'var(--ink3)', bg: 'var(--bg)' },
};
const cfg = (label: string, t: keyof typeof tone): Cfg => ({ label, ...tone[t] });

/** Human labels + colours for every status the console shows. */
export const PILL: Record<string, Record<string, Cfg>> = {
  status: { OPEN: cfg('Open', 'blue'), IN_PROGRESS: cfg('In progress', 'gold'), RESOLVED: cfg('Resolved', 'green'), CLOSED: cfg('Closed', 'gray') },
  priority: { URGENT: cfg('Urgent', 'red'), HIGH: cfg('High', 'gold'), NORMAL: cfg('Normal', 'gray'), LOW: cfg('Low', 'gray') },
  severity: { S1: cfg('S1 · Critical', 'red'), S2: cfg('S2 · Major', 'gold'), S3: cfg('S3 · Minor', 'blue'), S4: cfg('S4 · Low', 'gray') },
  sla: { breached: cfg('Breached', 'red'), at_risk: cfg('At risk', 'gold'), on_track: cfg('On track', 'green'), paused: cfg('Paused', 'gray'), met: cfg('Met', 'green'), none: cfg('No SLA', 'gray') },
  outcome: { pending: cfg('Outcome pending', 'gold'), confirmed: cfg('Outcome confirmed', 'green'), not_resolved: cfg('Not resolved', 'red') },
  health: { healthy: cfg('Healthy', 'green'), degraded: cfg('Degraded', 'gold'), unavailable: cfg('Unavailable', 'red'), maintenance: cfg('Maintenance', 'blue'), unknown: cfg('Unknown', 'gray') },
  session: { pending_approval: cfg('Awaiting approval', 'gold'), active: cfg('Active', 'green'), ended: cfg('Ended', 'gray'), revoked: cfg('Revoked', 'red'), expired: cfg('Expired', 'gray'), denied: cfg('Denied', 'red') },
  incident: { investigating: cfg('Investigating', 'red'), identified: cfg('Identified', 'gold'), monitoring: cfg('Monitoring', 'blue'), resolved: cfg('Resolved', 'green') },
  active: { true: cfg('Active', 'green'), false: cfg('Inactive', 'gray') },
};

const humanise = (v: string) => v.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** A coloured status pill; unknown values still render, in grey. */
export function Pill({ kind, value }: { kind: keyof typeof PILL; value: string | null | undefined | boolean }) {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--ink3)' }}>—</span>;
  const key = String(value);
  return <SABadge cfg={PILL[kind]?.[key] ?? cfg(humanise(key.toLowerCase()), 'gray')} />;
}

const APP_NAMES = new Map(APP_REGISTRY.map(a => [a.id as string, a.name]));
/** Product display name for an app id ('clearos' → 'ClearOS'). */
export const appName = (id: string | null | undefined) => (id ? APP_NAMES.get(id) ?? humanise(id) : 'Any product');

/** KPI row that wraps to two columns on phones and one at the narrowest. */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="console-kpis">{children}</div>;
}

/** A KPI card that is also a link into the list behind the number. */
export function KpiLink({ to, ...p }: { to?: string } & React.ComponentProps<typeof KPICard>) {
  const card = <KPICard {...p} />;
  return to ? <Link to={to} className="console-kpi-link" aria-label={`${p.title}: ${p.value}`}>{card}</Link> : card;
}

/** The `.card` panel used across the SuperAdmin pages, with a titled header. */
export function Panel({ title, sub, icon, action, children, flush, className }: {
  title: React.ReactNode; sub?: React.ReactNode; icon?: IconName; action?: React.ReactNode; children: React.ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section className={`card console-panel${className ? ` ${className}` : ''}`}>
      <header className="console-panel-hdr">
        {icon && <span className="console-panel-icon"><Icon name={icon} size={15} color="var(--teal)" /></span>}
        <div className="console-panel-titles">
          <h2 className="console-panel-title">{title}</h2>
          {sub && <div className="console-panel-sub">{sub}</div>}
        </div>
        {action && <div className="console-panel-action">{action}</div>}
      </header>
      <div className={flush ? 'console-panel-body console-panel-flush' : 'console-panel-body'}>{children}</div>
    </section>
  );
}

/** Empty state inside a panel or table. */
export function Empty({ icon = 'inbox', title, children }: { icon?: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="console-empty" role="status">
      <span className="console-empty-icon"><Icon name={icon} size={20} color="var(--ink3)" /></span>
      <div className="console-empty-title">{title}</div>
      {children && <div className="console-empty-text">{children}</div>}
    </div>
  );
}

/** Label/value pairs, two columns on wide screens. */
export function Facts({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="console-facts">
      {items.map(([k, v], i) => <div key={i} className="console-fact"><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}
    </dl>
  );
}

/** Inline result message after an action. */
export function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div role={msg.ok ? 'status' : 'alert'} className={`console-notice ${msg.ok ? 'console-notice-ok' : 'console-notice-err'}`}>
      <Icon name={msg.ok ? 'checkCircle' : 'alertCircle'} size={14} color={msg.ok ? 'var(--green)' : 'var(--red)'} />
      <span>{msg.text}</span>
    </div>
  );
}
