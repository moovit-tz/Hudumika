/**
 * Shared pieces of the staff console: the signed-in staff context, the
 * section guard, scope and access-session banners, and the standard
 * loading / empty / error / denied states.
 *
 * Every guard here is presentation only — the API re-checks every request.
 * Navigation and guards both read STAFF_SECTIONS, STAFF_TOOLS from @hudumika/types, so a
 * section the sidebar hides is also refused by its route.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STAFF_SECTIONS, STAFF_TOOLS, type StaffMe } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Icon } from '../../components/Icon.js';

interface StaffState { me: StaffMe | null; loading: boolean; error: string | null; notStaff: boolean; reload: () => Promise<void> }
const Ctx = createContext<StaffState>({ me: null, loading: true, error: null, notStaff: false, reload: async () => {} });
export const useStaff = () => useContext(Ctx);

/**
 * Platform SuperAdmin for UI gating: a SUPER_ADMIN account, or — inside the
 * console — the SuperAdmin staff role. Outside the console the staff context
 * is empty, so only the account role counts there. The API decides either way.
 */
export function useIsPlatformSuperAdmin(role: string | null | undefined): boolean {
  const { me } = useContext(Ctx);
  return role === 'SUPER_ADMIN' || !!me?.isSuperAdmin;
}

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<StaffMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notStaff, setNotStaff] = useState(false);
  const reload = useCallback(async () => {
    setError(null);
    try { setMe(await apiFetch('/v1/staff/me')); setNotStaff(false); }
    catch (e: any) {
      const msg = String(e?.message ?? '');
      if (/staff console access|own staff sign-in/i.test(msg)) { setNotStaff(true); setMe(null); } else setError(msg || 'Could not load your staff access.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  // Grants can change at any time; re-read them when the tab regains focus.
  useEffect(() => { const f = () => { if (document.visibilityState === 'visible') reload(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, [reload]);
  return <Ctx.Provider value={{ me, loading, error, notStaff, reload }}>{children}</Ctx.Provider>;
}

export const hasPerm = (me: StaffMe | null, ...anyOf: string[]) => !!me && anyOf.some(p => (me.permissions as string[]).includes(p));

/** Renders children only when the viewer may open this section. */
export function SectionGuard({ id, children }: { id: string; children: React.ReactNode }) {
  const { me } = useStaff();
  if (!me) return null;
  if (!me.sections.includes(id)) {
    const section = STAFF_SECTIONS.find(s => s.id === id);
    return <AccessDenied what={section?.label ?? 'this section'} />;
  }
  return <>{children}</>;
}

/** Guards a platform tool (a former /admin page). Mirrors the API's rule. */
export function ToolGuard({ id, children }: { id: string; children: React.ReactNode }) {
  const { me } = useStaff();
  if (!me) return null;
  const tool = STAFF_TOOLS.find(t => t.id === id);
  if (!me.tools.includes(id)) {
    const why = tool?.requires === 'superadmin'
      ? 'the SuperAdmin role'
      : !me.platformWide ? 'platform-wide scope' : null;
    return <AccessDenied what={`${tool?.label ?? 'this tool'}${why ? ` — it needs ${why}` : ''}`} />;
  }
  return <>{children}</>;
}

export function AccessDenied({ what }: { what: string }) {
  const { me } = useStaff();
  return (
    <div role="alert" style={stateBox}>
      <Icon name="lock" size={22} color="var(--ink3)" />
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>You don’t have access to {what}</div>
      <div style={{ color: 'var(--ink3)', maxWidth: 460 }}>Ask an administrator for access.</div>
      {me?.homePath && <Button asChild size="sm" variant="outline"><Link to={me.homePath}>Go to your home</Link></Button>}
    </div>
  );
}

export function LoadState({ loading, error, onRetry, empty, emptyText, children }: {
  loading: boolean; error: string | null; onRetry?: () => void; empty?: boolean; emptyText?: string; children: React.ReactNode;
}) {
  if (loading) return <SectionLoading />;
  if (error) return (
    <div role="alert" style={stateBox}>
      <Icon name="alertCircle" size={20} color="var(--red)" />
      <div style={{ color: 'var(--ink2)' }}>{error}</div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
  if (empty) return <div style={{ ...stateBox, padding: '28px 16px' }}><div style={{ color: 'var(--ink3)' }}>{emptyText ?? 'Nothing here yet.'}</div></div>;
  return <>{children}</>;
}

const stateBox: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '48px 16px', fontSize: 13 };

/** Small fetch hook with loading / error / retry. */
export function useStaffData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await apiFetch(path)); } catch (e: any) { setError(e?.message ?? 'Could not load.'); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

function environmentLabel(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (/^(localhost|127\.|\[::1\])/.test(host)) return 'Local development';
  if (/staging|test|qa/i.test(host)) return 'Staging';
  return 'Production';
}

/** Always-visible statement of what the viewer is acting on. */
export function ScopeBanner() {
  const { me } = useStaff();
  if (!me) return null;
  const s = me.scope;
  const products = s.allProducts ? 'All products' : s.productIds.length ? `${s.productIds.length} product${s.productIds.length === 1 ? '' : 's'}` : 'No products';
  const customers = s.allCustomers ? 'All customers' : s.customerIds.length ? `${s.customerIds.length} customer${s.customerIds.length === 1 ? '' : 's'}` : 'No customers';
  const env = environmentLabel();
  return (
    <div className="console-scope" aria-label="Current scope">
      <span className="console-scope-chip console-scope-chip-role"><Icon name="shield" size={12} color="var(--teal)" /> {me.roles.map(r => r.name).join(' · ') || 'No roles'}</span>
      <span className="console-scope-chip"><Icon name="package" size={12} color="var(--ink3)" /> {products}</span>
      <span className="console-scope-chip"><Icon name="building" size={12} color="var(--ink3)" /> {customers}</span>
      {(s.excludedCustomerIds.length + s.excludedProductIds.length) > 0 && <span className="console-scope-chip">{s.excludedCustomerIds.length + s.excludedProductIds.length} exclusion(s)</span>}
      <span className={env === 'Production' ? 'console-env console-env-prod' : 'console-env'}>{env}</span>
    </div>
  );
}

/** Persistent banner while a customer access session is open or pending. */
export function AccessSessionBanner() {
  const { me, reload } = useStaff();
  const s = me?.activeAccessSession;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!s) return; const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, [s]);
  useEffect(() => { if (s && new Date(s.expiresAt).getTime() <= now) reload(); }, [s, now, reload]);
  if (!s) return null;
  const mins = Math.max(0, Math.round((new Date(s.expiresAt).getTime() - now) / 60000));
  const end = async () => { await apiFetch(`/v1/staff/access-sessions/${s.id}/end`, { method: 'POST', body: '{}' }).catch(() => {}); reload(); };
  return (
    <div className="console-access-banner" role="status">
      <Icon name="key" size={14} color="var(--gold)" />
      <span>
        {s.status === 'active' ? <>Acting in <strong>{s.tenantName}</strong> as yourself{s.appId ? <> · {s.appId}</> : null} · {s.actions.join(' + ')} · {mins} min left</>
          : <>Waiting for <strong>{s.tenantName}</strong> to approve your access request</>}
        <span className="console-access-purpose"> — {s.purpose}</span>
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {s.status === 'active' && <Button asChild size="sm" variant="outline"><Link to={`/console/access/${s.id}`}>Open records</Link></Button>}
        <Button size="sm" variant="outline" onClick={end}>{s.status === 'active' ? 'End session' : 'Cancel request'}</Button>
      </span>
    </div>
  );
}

export const fmtDate = (v: string | Date | null | undefined) => v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtRel = (v: string | Date | null | undefined) => {
  if (!v) return '—';
  const d = (new Date(v).getTime() - Date.now()) / 60000;
  const a = Math.abs(d);
  const t = a < 60 ? `${Math.round(a)} min` : a < 2880 ? `${Math.round(a / 60)} h` : `${Math.round(a / 1440)} d`;
  return d >= 0 ? `in ${t}` : `${t} ago`;
};
