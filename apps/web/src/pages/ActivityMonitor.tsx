import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';

interface Settings { enabled: boolean; captureKeystrokes: boolean; captureHeatmap: boolean; intervalSeconds: number; }
interface Summary { rows: number; grid: { rows: number; cols: number }; zones: Record<string, number>; users: any[]; }

const LEAD_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR']);
const fmtDur = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

export function ActivityMonitorPage() {
  const { user } = useAuth();
  const isLead = !!(user && LEAD_ROLES.has(user.role));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [consent, setConsent] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const [scope, setScope] = useState<'self' | 'team'>('self');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(() => {
    apiFetch('/v1/activity-monitor/config').then((c: any) => {
      setSettings(c.settings); setConsent(!!c.consent); setCanAdmin(!!c.canAdmin);
    }).catch(() => {});
  }, []);
  const loadSummary = useCallback(() => {
    apiFetch(`/v1/activity-monitor/summary?scope=${scope}`).then((s: any) => setSummary(s)).catch(() => {});
  }, [scope]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const patchSettings = async (patch: Partial<Settings>) => {
    setSaving(true);
    try { const r: any = await apiFetch('/v1/activity-monitor/settings', { method: 'PATCH', body: JSON.stringify(patch) }); setSettings(r.settings); }
    catch (e: any) { showAlert(e.message || 'Could not update settings'); }
    finally { setSaving(false); }
  };
  const toggleConsent = async () => {
    const next = !consent;
    try { const r: any = await apiFetch('/v1/activity-monitor/consent', { method: 'POST', body: JSON.stringify({ consent: next }) }); setConsent(!!r.consent); }
    catch (e: any) { showAlert(e.message || 'Could not update consent'); }
  };

  const maxZone = summary ? Math.max(1, ...Object.values(summary.zones)) : 1;
  const cell = (r: number, cc: number) => {
    const v = summary?.zones[`r${r}c${cc}`] ?? 0;
    const t = v / maxZone;
    return <div key={`r${r}c${cc}`} title={`zone ${r},${cc}: ${v}`} style={{ background: `rgba(13,148,136,${v ? 0.1 + 0.85 * t : 0})`, borderRadius: 3 }} />;
  };

  return (
    <div className="page-layout" style={{ paddingBottom: 48 }}>
      <PageHeader
        crumbs={['Workspace', 'Activity']}
        titlePlain="Activity"
        titleEm="monitoring"
        subtitle="Opt-in, intensity-only insight — how much work happens where, never what is typed. Keystroke counts and pointer heat, no content, ever."
      />

      {/* Privacy statement */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
        <Icon name="shield" size={16} color="var(--teal-d)" />
        <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.55 }}>
          This records the <strong>number</strong> of keystrokes and clicks, mouse-travel distance, active seconds, and a coarse on-screen heat zone — <strong>never which keys, never any text or field values</strong>. It runs only while both the workspace has it switched on and you have opted in, and shows a visible indicator whenever it is active.
        </div>
      </div>

      {/* My consent */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>My participation</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>
            {settings?.enabled ? (consent ? 'You are opted in. Collection runs while you use the app.' : 'You are opted out. Nothing is collected for you.') : 'The workspace has monitoring switched off — nothing is collected regardless.'}
          </div>
        </div>
        <button type="button" onClick={toggleConsent} disabled={!settings?.enabled} style={{
          padding: 'var(--ds-btn-py-sm) 16px', borderRadius: 'var(--r)', border: '1px solid ' + (consent ? 'var(--red)' : 'var(--teal)'),
          background: consent ? 'var(--white)' : 'var(--teal)', color: consent ? 'var(--red)' : '#fff', fontSize: 13, fontWeight: 700,
          cursor: settings?.enabled ? 'pointer' : 'not-allowed', opacity: settings?.enabled ? 1 : 0.5, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25,
        }}>{consent ? 'Opt out' : 'Opt in'}</button>
      </div>

      {/* Admin settings */}
      {canAdmin && settings && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>Workspace settings <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>· admin</span></div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 12 }}>Turning this off stops collection for everyone immediately, opted-in or not.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              ['enabled', 'Enable activity monitoring for this workspace'],
              ['captureKeystrokes', 'Record keystroke counts (never the keys)'],
              ['captureHeatmap', 'Record pointer heat zones'],
            ] as [keyof Settings, string][]).map(([k, label]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!settings[k]} disabled={saving || (k !== 'enabled' && !settings.enabled)} onChange={e => patchSettings({ [k]: e.target.checked })} />
                {label}
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink2)' }}>
              Flush interval
              <select value={settings.intervalSeconds} disabled={saving || !settings.enabled} onChange={e => patchSettings({ intervalSeconds: Number(e.target.value) })}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                {[30, 60, 120, 300].map(s => <option key={s} value={s}>{s < 60 ? `${s}s` : `${s / 60}m`}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Heatmap + totals */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Last 24 hours</div>
        {isLead && (
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['self', 'team'] as const).map(s => (
              <button key={s} onClick={() => setScope(s)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', background: scope === s ? 'var(--teal)' : 'var(--white)', color: scope === s ? '#fff' : 'var(--ink2)' }}>{s === 'self' ? 'Me' : 'Team'}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1.2fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Attention heatmap</div>
          {summary && summary.rows > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${summary.grid.cols}, 1fr)`, gridAutoRows: '1fr', gap: 2, aspectRatio: `${summary.grid.cols} / ${summary.grid.rows}`, background: 'var(--bg)', padding: 4, borderRadius: 6 }}>
              {Array.from({ length: summary.grid.rows }).flatMap((_, r) => Array.from({ length: summary.grid.cols }).map((__, cc) => cell(r, cc)))}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '18px 0', textAlign: 'center' }}>No activity recorded yet.</div>}
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>Where the pointer spent time on screen — a proxy for where attention went, at a resolution far too coarse to reconstruct anything specific.</div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, overflowX: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Intensity totals</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Member', 'Active', 'Keystrokes', 'Clicks', 'Mouse (m)'].map(h => <th key={h} style={{ textAlign: h === 'Member' ? 'left' : 'right', padding: '6px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {(summary?.users ?? []).map(u => (
                <tr key={u.userId}>
                  <td style={{ padding: '7px 8px', fontWeight: 600, color: 'var(--ink)' }}>{u.name}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDur(u.activeSeconds)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.keystrokes.toLocaleString()}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.clicks.toLocaleString()}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(u.mouseDistancePx / 3780).toLocaleString()}</td>
                </tr>
              ))}
              {(!summary || summary.users.length === 0) && <tr><td colSpan={5} style={{ padding: '18px', textAlign: 'center', color: 'var(--ink3)' }}>No activity recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
