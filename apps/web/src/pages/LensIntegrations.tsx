import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { Input } from '../components/ui/input.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { SectionCard } from '../components/SectionCard.js';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  remedy?: string;
  skipped?: boolean;
}

interface Preflight {
  provider: string;
  ok: boolean;
  checks: Check[];
  nextStep: string | null;
}

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

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  minHeight: 'var(--ctl-h-sm)',
  boxSizing: 'border-box',
  fontSize: 13,
  background: 'var(--white)',
  color: 'var(--ink)',
  width: '100%',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink2)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: 6,
};

const PROVIDER_ICON: Record<string, string> = {
  github: 'gitBranch',
  slack: 'chatBubble',
  jira: 'layers',
  linear: 'list',
  circleci: 'refresh',
};

const STATUS_FILTER_OPTIONS = [
  { key: 'ALL', label: 'All Integrations' },
  { key: 'connected', label: 'Connected', dotColor: 'var(--green)' },
  { key: 'disconnected', label: 'Not Configured', dotColor: 'var(--ink3)' },
  { key: 'error', label: 'Requires Attention', dotColor: 'var(--red)' },
];

export function LensIntegrations() {
  const [rows, setRows] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, { credential: string; config: Record<string, string> }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; detail: string; status: number }>>({});
  const [flight, setFlight] = useState<Record<string, Preflight>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/lens/integrations')
      .then((r: Integration[]) => {
        setRows(r ?? []);
        setDraft(Object.fromEntries((r ?? []).map(i => [i.provider, { credential: '', config: { ...i.config } }])));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    } finally {
      setBusy(null);
    }
  }

  async function runPreflight(p: Integration) {
    setBusy(p.provider);
    try {
      const r: Preflight = await apiFetch(`/v1/lens/integrations/${p.provider}/preflight`, { method: 'POST' });
      setFlight(x => ({ ...x, [p.provider]: r }));
      load();
    } catch (e: any) {
      setResult(x => ({ ...x, [p.provider]: { ok: false, detail: e?.message ?? 'Failed', status: 0 } }));
    } finally {
      setBusy(null);
    }
  }

  async function test(p: Integration) {
    setBusy(p.provider);
    try {
      const r: any = await apiFetch(`/v1/lens/integrations/${p.provider}/test`, { method: 'POST' });
      setResult(x => ({ ...x, [p.provider]: r }));
      load();
    } catch (e: any) {
      setResult(x => ({ ...x, [p.provider]: { ok: false, detail: e?.message ?? 'Test request failed', status: 0 } }));
    } finally {
      setBusy(null);
    }
  }

  // Filtered rows
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return r.label.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q);
    });
  }, [rows, statusFilter, search]);

  // Counts
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: rows.length };
    for (const r of rows) {
      map[r.status] = (map[r.status] || 0) + 1;
    }
    return map;
  }, [rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const connected = rows.filter(r => r.status === 'connected').length;
    const errors = rows.filter(r => r.status === 'error').length;
    return { total, connected, errors };
  }, [rows]);

  return (
    <div className="lens-workspace">
      <PageHeader
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Integrations' }]}
        titlePlain="Connected"
        titleEm="tools"
        subtitle="Where the work actually happens — GitHub, Slack, Jira, Linear, CircleCI."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/lens">
              <Icon name="chevronLeft" size={14} />
              Back to Board
            </Link>
          </Button>
        }
      />

      {/* Summary Metrics Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          width: '100%',
        }}
      >
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--r-sm)',
              background: 'var(--surface-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink2)',
            }}
          >
            <Icon name="layers" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Supported Tools
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{stats.total}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--r-sm)',
              background: 'var(--green-l)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--green)',
            }}
          >
            <Icon name="check" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Connected & Verified
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{stats.connected}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--r-sm)',
              background: stats.errors > 0 ? 'var(--red-l)' : 'var(--teal-l)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: stats.errors > 0 ? 'var(--red)' : 'var(--teal)',
            }}
          >
            <Icon name={stats.errors > 0 ? 'alertCircle' : 'refresh'} size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Connection Alerts
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: stats.errors > 0 ? 'var(--red)' : 'var(--teal)' }}>
              {stats.errors}
            </div>
          </div>
        </div>
      </div>

      <Banner variant="warning" title="Live Account Notice">
        Endpoints follow each provider's official API specifications. Saving or updating credentials triggers immediate verification
        against the remote provider to ensure bi-directional synchronization is ready.
      </Banner>

      {/* Filter and Search Toolbar */}
      <div className="lens-filters-wrap">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full md:w-auto">
          <TabsList>
            {STATUS_FILTER_OPTIONS.map(opt => (
              <TabsTrigger key={opt.key} value={opt.key} className="gap-2">
                {opt.dotColor && (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: opt.dotColor }}
                  />
                )}
                <span>{opt.label}</span>
                <Badge variant="gray">{counts[opt.key] || 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="lens-search-wrap">
          <div style={{ position: 'relative', width: '100%' }}>
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink3)',
                pointerEvents: 'none',
                display: 'flex',
                zIndex: 1,
              }}
            >
              <Icon name="search" size={14} />
            </span>
            <Input
              type="search"
              aria-label="Search integrations"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search provider..."
              style={{ paddingLeft: 30, paddingRight: search ? 30 : 12 }}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink3)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <SectionLoading />
      ) : rows.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="layers" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No integrations found</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13 }}>No external tools configured for this tenant.</p>
          </div>
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="search" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No matching integrations</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              No integrations match your search query.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStatusFilter('ALL');
                setSearch('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(p => {
            const r = result[p.provider];
            const isExpanded = expanded === p.provider;
            const statusColor = p.status === 'connected' ? 'var(--green)' : p.status === 'error' ? 'var(--red)' : 'var(--ink3)';
            const statusBg = p.status === 'connected' ? 'var(--green-l)' : p.status === 'error' ? 'var(--red-l)' : 'var(--surface-hover)';
            const iconName = PROVIDER_ICON[p.provider] ?? 'layers';

            return (
              <div
                key={p.provider}
                style={{
                  background: 'var(--white)',
                  border: `1px solid ${isExpanded ? 'var(--teal)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-sm)',
                  overflow: 'hidden',
                  boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Accordion Trigger Header */}
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={isExpanded}
                  className="lens-provider-trigger"
                  onClick={() => setExpanded(isExpanded ? null : p.provider)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '16px 18px',
                    width: '100%',
                    boxSizing: 'border-box',
                    background: isExpanded ? 'var(--teal-l)' : 'transparent',
                    textAlign: 'left',
                    borderRadius: 0,
                    height: 'auto',
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--white)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--ink)',
                    }}
                  >
                    <Icon name={iconName as any} size={20} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{p.label}</span>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: statusBg,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-full)',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 'var(--r-full)',
                            background: statusColor,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: statusColor,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {p.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      {p.has_credential ? '✓ Credential verified & stored' : 'Not configured'}
                      {p.last_sync_at && ` · Last synced ${new Date(p.last_sync_at).toLocaleDateString()}`}
                    </div>
                  </div>

                  <div
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                      color: 'var(--ink3)',
                      display: 'flex',
                    }}
                  >
                    <Icon name="chevronDown" size={18} />
                  </div>
                </Button>

                {/* Expanded Details & Form */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '18px 20px',
                      borderTop: '1px solid var(--border)',
                      background: 'var(--white)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase' }}>
                        Connection Configuration
                      </h4>
                      <a
                        href={p.docs}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12,
                          color: 'var(--teal)',
                          textDecoration: 'none',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        API Reference
                        <Icon name="externalLink" size={12} />
                      </a>
                    </div>

                    {p.note && (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--ink2)',
                          marginBottom: 16,
                          lineHeight: 1.5,
                          background: 'var(--surface-hover)',
                          padding: '10px 14px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {p.note}
                      </div>
                    )}

                    {/* Responsive Form Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: 14,
                        marginBottom: 16,
                      }}
                    >
                      {p.configFields.map(f => {
                        const fieldId = `${p.provider}-${f.key}`;
                        return (
                          <div key={f.key}>
                            <label htmlFor={fieldId} style={labelStyle}>
                              {f.label}
                              {f.required ? ' *' : ''}
                            </label>
                            <input
                              id={fieldId}
                              data-ui-field="input"
                              style={inputStyle}
                              placeholder={f.placeholder}
                              value={draft[p.provider]?.config?.[f.key] ?? ''}
                              onChange={e =>
                                setDraft(d => ({
                                  ...d,
                                  [p.provider]: {
                                    ...d[p.provider],
                                    config: { ...d[p.provider]?.config, [f.key]: e.target.value },
                                  },
                                }))
                              }
                            />
                          </div>
                        );
                      })}

                      <div>
                        <label htmlFor={`${p.provider}-credential`} style={labelStyle}>
                          {p.credentialLabel}
                        </label>
                        <input
                          id={`${p.provider}-credential`}
                          data-ui-field="input"
                          style={inputStyle}
                          type="password"
                          autoComplete="off"
                          placeholder={p.has_credential ? '••••••••  (Stored — leave blank to keep)' : 'Paste API key or secret token'}
                          value={draft[p.provider]?.credential ?? ''}
                          onChange={e =>
                            setDraft(d => ({
                              ...d,
                              [p.provider]: { ...d[p.provider], credential: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>

                    {/* Action Buttons Toolbar */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={busy === p.provider}
                        onClick={() => save(p)}
                      >
                        <Icon name="check" size={14} />
                        {busy === p.provider ? 'Verifying...' : 'Save & Verify'}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        disabled={busy === p.provider || !p.has_credential}
                        onClick={() => test(p)}
                      >
                        <Icon name="refresh" size={14} />
                        Test Connection
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        disabled={busy === p.provider || !p.has_credential}
                        onClick={() => runPreflight(p)}
                      >
                        <Icon name="search" size={14} />
                        Run Preflight Audit
                      </Button>
                    </div>

                    {/* Preflight Checks Checklist */}
                    {flight[p.provider] && (
                      <div
                        style={{
                          marginTop: 16,
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-sm)',
                          overflow: 'hidden',
                        }}
                      >
                        {flight[p.provider].checks.map((c, i) => (
                          <div
                            key={c.name}
                            style={{
                              display: 'flex',
                              gap: 12,
                              alignItems: 'flex-start',
                              padding: '10px 14px',
                              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                              background: c.skipped ? 'var(--bg)' : c.ok ? 'transparent' : 'var(--red-l)',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 14,
                                lineHeight: 1.3,
                                flexShrink: 0,
                                color: c.skipped ? 'var(--ink3)' : c.ok ? 'var(--green)' : 'var(--red)',
                                fontWeight: 700,
                              }}
                            >
                              {c.skipped ? '–' : c.ok ? '✓' : '✗'}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: c.skipped ? 'var(--ink3)' : 'var(--ink)',
                                }}
                              >
                                {c.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--ink2)',
                                  lineHeight: 1.4,
                                  wordBreak: 'break-word',
                                }}
                              >
                                {c.detail}
                              </div>
                              {c.remedy && (
                                <div
                                  style={{
                                    fontSize: 11.5,
                                    color: 'var(--gold)',
                                    marginTop: 4,
                                    lineHeight: 1.4,
                                    fontWeight: 600,
                                  }}
                                >
                                  Fix: {c.remedy}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {flight[p.provider].nextStep && (
                          <div
                            style={{
                              padding: '10px 14px',
                              borderTop: '1px solid var(--border)',
                              background: 'var(--gold-l)',
                              fontSize: 12,
                              color: 'var(--ink)',
                              lineHeight: 1.5,
                            }}
                          >
                            <strong>Next Step:</strong> {flight[p.provider].nextStep}
                          </div>
                        )}

                        {flight[p.provider].ok && (
                          <div
                            style={{
                              padding: '10px 14px',
                              borderTop: '1px solid var(--border)',
                              background: 'var(--green-l)',
                              fontSize: 12,
                              color: 'var(--green)',
                              fontWeight: 600,
                            }}
                          >
                            ✓ Ready — this connection has passed all capability and write permission checks.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Result or Error Diagnostic Box */}
                    {(r || p.last_error) && (
                      <div
                        style={{
                          marginTop: 16,
                          padding: '12px 14px',
                          borderRadius: 'var(--r-sm)',
                          fontSize: 12,
                          lineHeight: 1.5,
                          background: r?.ok ? 'var(--green-l)' : 'var(--surface-hover)',
                          border: `1px solid ${r?.ok ? 'var(--green)' : 'var(--border)'}`,
                          color: r?.ok ? 'var(--green)' : 'var(--red)',
                          wordBreak: 'break-word',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            textTransform: 'uppercase',
                            color: r?.ok ? 'var(--green)' : 'var(--ink3)',
                            marginBottom: 4,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                          }}
                        >
                          {r?.ok ? 'Provider Response: OK' : 'Provider Diagnostic Response'}
                        </div>
                        {r ? `${r.status || 'no status'} — ${r.detail}` : p.last_error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LensIntegrations;
