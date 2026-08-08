import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';

/**
 * Connections to the tools the work actually happens in.
 *
 * Every save tests the connection immediately and shows the provider's own
 * reply, verbatim. The alternative — accepting a token, showing a green tick,
 * and letting the first real use discover it was wrong — is how integrations
 * end up quietly broken for weeks.
 *
 * None of these providers has been called with real credentials from this
 * environment, so the page says so rather than implying they are proven.
 */

interface Integration {
  provider: string;
  label: string;
  credentialLabel: string;
  configFields: { key: string; label: string; placeholder: string; required: boolean }[];
  docs: string;
  note?: string;
  status: 'disconnected' | 'connected' | 'error';
  config: Record<string, string>;
  has_credential: boolean;
  last_sync_at: string | null;
  last_error: string | null;
}

const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13,
  fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', width: '100%',
};
const label: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4,
};

export function LensIntegrations() {
  const [rows, setRows] = useState<Integration[]>([]);
  const [draft, setDraft] = useState<Record<string, { credential: string; config: Record<string, string> }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; detail: string; status: number }>>({});

  const load = useCallback(() => {
    apiFetch('/v1/lens/integrations')
      .then((r: Integration[]) => {
        setRows(r ?? []);
        setDraft(Object.fromEntries((r ?? []).map(i => [i.provider, { credential: '', config: { ...i.config } }])));
      })
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(p: Integration) {
    setBusy(p.provider);
    try {
      const r: any = await apiFetch(`/v1/lens/integrations/${p.provider}`, {
        method: 'PUT',
        body: JSON.stringify({
          credential: draft[p.provider]?.credential || undefined,
          config: draft[p.provider]?.config ?? {},
        }),
      });
      setResult(x => ({ ...x, [p.provider]: { ok: r.ok, detail: r.detail, status: r.status } }));
      load();
    } catch (e: any) {
      setResult(x => ({ ...x, [p.provider]: { ok: false, detail: e?.message ?? 'Failed', status: 0 } }));
    } finally { setBusy(null); }
  }

  async function test(p: Integration) {
    setBusy(p.provider);
    try {
      const r: any = await apiFetch(`/v1/lens/integrations/${p.provider}/test`, { method: 'POST' });
      setResult(x => ({ ...x, [p.provider]: r }));
      load();
    } finally { setBusy(null); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Lens', 'Integrations']}
        titlePlain="Connected"
        titleEm="tools"
        subtitle="Where the work actually happens — GitHub, Slack, Jira, Linear, CircleCI."
        actions={<a href="/lens" className="btn btn-secondary btn-sm">Back to board</a>}
      />

      {/* Said plainly, because the alternative is implying these are proven. */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 16,
        background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)',
        fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55,
      }}>
        <Icon name="alertTriangle" size={16} color="var(--gold)" />
        <div>
          <strong style={{ color: 'var(--ink)' }}>None of these has been called with real credentials yet.</strong>{' '}
          The endpoints and payloads follow each provider's published API, but nothing here has been proven
          against a live account. Saving a connection tests it straight away and shows exactly what the
          provider replied — so the first thing you learn is whether it works, not the tenth.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map(p => {
          const r = result[p.provider];
          return (
            <div key={p.provider} style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)', padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{p.label}</span>
                  <Badge variant={p.status === 'connected' ? 'success' : p.status === 'error' ? 'error' : 'gray'}>
                    {p.status}
                  </Badge>
                  {p.has_credential && <Badge variant="info">credential stored</Badge>}
                </div>
                <a href={p.docs} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11.5, color: 'var(--teal)', textDecoration: 'none' }}>
                  API docs ↗
                </a>
              </div>

              {p.note && (
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10 }}>{p.note}</div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {p.configFields.map(f => (
                  <div key={f.key}>
                    <label style={label}>{f.label}{f.required ? ' *' : ''}</label>
                    <input style={input} placeholder={f.placeholder}
                      value={draft[p.provider]?.config?.[f.key] ?? ''}
                      onChange={e => setDraft(d => ({
                        ...d,
                        [p.provider]: {
                          ...d[p.provider],
                          config: { ...d[p.provider]?.config, [f.key]: e.target.value },
                        },
                      }))} />
                  </div>
                ))}
                <div>
                  <label style={label}>{p.credentialLabel}</label>
                  <input style={input} type="password" autoComplete="off"
                    placeholder={p.has_credential ? 'Stored — leave blank to keep it' : 'Paste the token'}
                    value={draft[p.provider]?.credential ?? ''}
                    onChange={e => setDraft(d => ({
                      ...d, [p.provider]: { ...d[p.provider], credential: e.target.value },
                    }))} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary btn-sm"
                  disabled={busy === p.provider} onClick={() => save(p)}>
                  {busy === p.provider ? 'Testing…' : 'Save and test'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm"
                  disabled={busy === p.provider || !p.has_credential} onClick={() => test(p)}>
                  Test connection
                </button>
                {p.last_sync_at && (
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                    Last good call {new Date(p.last_sync_at).toLocaleString()}
                  </span>
                )}
              </div>

              {/* The provider's own words. A paraphrased failure is a lost one. */}
              {(r || p.last_error) && (
                <div style={{
                  marginTop: 10, padding: '9px 11px', borderRadius: 'var(--r-sm)',
                  fontSize: 11.5, fontFamily: 'var(--mono)', lineHeight: 1.5,
                  background: r?.ok ? 'var(--green-l)' : 'var(--red-l)',
                  border: `1px solid ${r?.ok ? 'var(--green)' : 'var(--red)'}`,
                  color: r?.ok ? 'var(--green)' : 'var(--red)',
                  wordBreak: 'break-word',
                }}>
                  {r ? `${r.status || 'no response'} — ${r.detail}` : p.last_error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
