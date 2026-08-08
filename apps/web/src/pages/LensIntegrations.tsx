import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';

interface Check { name: string; ok: boolean; detail: string; remedy?: string; skipped?: boolean }
interface Preflight { provider: string; ok: boolean; checks: Check[]; nextStep: string | null }

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
  padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13,
  fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--ink2)',
  textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6,
};

const PROVIDER_ICON: Record<string, string> = {
  github: 'gitBranch', slack: 'chatBubble', jira: 'layers', linear: 'list', circleci: 'refresh',
};

export function LensIntegrations() {
  const [rows, setRows] = useState<Integration[]>([]);
  const [draft, setDraft] = useState<Record<string, { credential: string; config: Record<string, string> }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; detail: string; status: number }>>({});
  const [flight, setFlight] = useState<Record<string, Preflight>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

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

  /** The check that matters — auth, then does the target exist, then may we write. */
  async function runPreflight(p: Integration) {
    setBusy(p.provider);
    try {
      const r: Preflight = await apiFetch(`/v1/lens/integrations/${p.provider}/preflight`, { method: 'POST' });
      setFlight(x => ({ ...x, [p.provider]: r }));
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

      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', padding: '14px 18px', marginBottom: 24,
        background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)',
        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.05)',
      }}>
        <div style={{ background: '#fff', borderRadius: '50%', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <Icon name="alertTriangle" size={16} color="var(--gold)" />
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--ink)' }}>Live Account Warning:</strong> None of these has been called with real credentials yet.
          The endpoints and payloads follow each provider's API, but nothing here has been proven against a live account. 
          Saving a connection tests it instantly to verify its status.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 64 }}>
        {rows.map(p => {
          const r = result[p.provider];
          const isExpanded = expanded === p.provider;
          const statusColor = p.status === 'connected' ? 'var(--green)' : p.status === 'error' ? 'var(--red)' : 'var(--ink3)';
          const statusBg = p.status === 'connected' ? 'var(--green-l)' : p.status === 'error' ? 'var(--red-l)' : 'var(--bg)';
          const iconName = PROVIDER_ICON[p.provider] ?? 'layers';

          return (
            <div key={p.provider} style={{
              background: 'var(--white)', border: `1px solid ${isExpanded ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: '12px', overflow: 'hidden',
              boxShadow: isExpanded ? '0 4px 20px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              {/* Header / Summary */}
              <div 
                onClick={() => setExpanded(isExpanded ? null : p.provider)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', 
                  cursor: 'pointer', background: isExpanded ? 'var(--teal-l)' : 'transparent',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => { if(!isExpanded) e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={e => { if(!isExpanded) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 10, background: 'var(--white)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  <Icon name={iconName as any} size={20} color="var(--ink)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{p.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: statusBg, padding: '3px 8px', borderRadius: 12 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, boxShadow: p.status === 'connected' ? `0 0 0 2px rgba(16, 185, 129, 0.2)` : 'none' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.status}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {p.has_credential ? 'Credential stored' : 'Not configured'}
                    {p.last_sync_at && ` · Synced ${new Date(p.last_sync_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', color: 'var(--ink3)' }}>
                  <Icon name="chevronDown" size={20} />
                </div>
              </div>

              {/* Expanded Configuration */}
              {isExpanded && (
                <div style={{ padding: '20px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Configuration</h4>
                    <a href={p.docs} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      API Docs <Icon name="externalLink" size={12} />
                    </a>
                  </div>

                  {p.note && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 20, lineHeight: 1.5, background: 'var(--bg)', padding: 12, borderRadius: 'var(--r-sm)' }}>
                      {p.note}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                    {p.configFields.map(f => (
                      <div key={f.key} style={{ flex: '1 1 200px' }}>
                        <label style={label}>{f.label}{f.required ? ' *' : ''}</label>
                        <input style={input} placeholder={f.placeholder}
                          value={draft[p.provider]?.config?.[f.key] ?? ''}
                          onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                          onBlur={e => e.target.style.borderColor = 'var(--border)'}
                          onChange={e => setDraft(d => ({
                            ...d,
                            [p.provider]: {
                              ...d[p.provider],
                              config: { ...d[p.provider]?.config, [f.key]: e.target.value },
                            },
                          }))} />
                      </div>
                    ))}
                    <div style={{ flex: '1 1 200px' }}>
                      <label style={label}>{p.credentialLabel}</label>
                      <input style={input} type="password" autoComplete="off"
                        placeholder={p.has_credential ? 'Stored — leave blank to keep it' : 'Paste the token'}
                        value={draft[p.provider]?.credential ?? ''}
                        onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        onChange={e => setDraft(d => ({
                          ...d, [p.provider]: { ...d[p.provider], credential: e.target.value },
                        }))} />
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button type="button" className="btn btn-primary" style={{ height: 'var(--ctl-h-sm)' }}
                        disabled={busy === p.provider} onClick={() => save(p)}>
                        {busy === p.provider ? 'Testing…' : 'Save & Test'}
                      </button>
                      <button type="button" className="btn btn-secondary" style={{ height: 'var(--ctl-h-sm)' }}
                        disabled={busy === p.provider || !p.has_credential} onClick={() => test(p)}>
                        Test Connection
                      </button>
                      {/* The one worth running. "Test connection" only proves the
                          token authenticates; this proves it can do the job. */}
                      <button type="button" className="btn btn-secondary" style={{ height: 'var(--ctl-h-sm)' }}
                        disabled={busy === p.provider || !p.has_credential} onClick={() => runPreflight(p)}>
                        Run full check
                      </button>
                    </div>

                    {flight[p.provider] && (
                      <div style={{
                        marginTop: 14, border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)', overflow: 'hidden',
                      }}>
                        {flight[p.provider].checks.map((c, i) => (
                          <div key={c.name} style={{
                            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
                            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                            background: c.skipped ? 'var(--bg)' : c.ok ? 'transparent' : 'var(--red-l)',
                          }}>
                            <span style={{
                              fontSize: 13, lineHeight: 1.3, flexShrink: 0,
                              color: c.skipped ? 'var(--ink3)' : c.ok ? 'var(--green)' : 'var(--red)',
                            }}>
                              {c.skipped ? '\u2013' : c.ok ? '\u2713' : '\u2717'}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{
                                fontSize: 12.5, fontWeight: 600,
                                color: c.skipped ? 'var(--ink3)' : 'var(--ink)',
                              }}>{c.name}</div>
                              <div style={{
                                fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.5,
                                fontFamily: c.ok ? 'var(--font)' : 'var(--mono)', wordBreak: 'break-word',
                              }}>{c.detail}</div>
                              {/* Specific, not "check your settings". */}
                              {c.remedy && (
                                <div style={{ fontSize: 11.5, color: 'var(--gold)', marginTop: 3, lineHeight: 1.5 }}>
                                  {c.remedy}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {flight[p.provider].nextStep && (
                          <div style={{
                            padding: '10px 12px', borderTop: '1px solid var(--border)',
                            background: 'var(--gold-l)', fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5,
                          }}>
                            <strong style={{ color: 'var(--ink)' }}>Next:</strong> {flight[p.provider].nextStep}
                          </div>
                        )}
                        {flight[p.provider].ok && (
                          <div style={{
                            padding: '10px 12px', borderTop: '1px solid var(--border)',
                            background: 'var(--green-l)', fontSize: 12, color: 'var(--green)', fontWeight: 600,
                          }}>
                            Ready — this connection can do what Lens will ask of it.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {(r || p.last_error) && (
                    <div style={{
                      marginTop: 20, padding: '12px 14px', borderRadius: 8,
                      fontSize: 12, fontFamily: 'var(--mono)', lineHeight: 1.5,
                      background: r?.ok ? 'var(--green-l)' : '#1e1e1e',
                      border: `1px solid ${r?.ok ? 'var(--green)' : '#333'}`,
                      color: r?.ok ? 'var(--green)' : '#f87171',
                      wordBreak: 'break-word',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', color: r?.ok ? 'var(--green)' : '#888', marginBottom: 6, fontWeight: 700, letterSpacing: '0.05em' }}>
                        {r?.ok ? 'Response / OK' : 'Response / Error'}
                      </div>
                      {r ? `${r.status || 'no response'} — ${r.detail}` : p.last_error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
