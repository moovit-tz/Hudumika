import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';

const TABS = ['DSR Queue', 'PII Access Log', 'Processing Activities', 'Retention Policies', 'Consent Analytics'] as const;
type Tab = typeof TABS[number];

type DsrStatus = 'PENDING' | 'IN_REVIEW' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'PARTIALLY_COMPLETED' | 'CANCELLED';

interface DsrRow {
  id: string;
  requester_email: string;
  request_type: string;
  status: DsrStatus;
  created_at: string;
  due_at: string;
  identity_verified: boolean;
  rejection_reason?: string;
}

interface AccessLogRow {
  id: string;
  accessor_id?: string;
  accessor_type: string;
  subject_id?: string;
  subject_table: string;
  fields_accessed: string[];
  data_domain: string;
  sensitivity_level: string;
  purpose?: string;
  route?: string;
  created_at: string;
}

interface Activity {
  id: string;
  name: string;
  purpose: string;
  lawful_basis: string;
  data_domains: string[];
  retention_days?: number;
  is_active: boolean;
  dpia_required: boolean;
  dpia_completed_at?: string;
}

interface ConsentAnalytic {
  activity_id: string;
  activity_name: string;
  status: string;
  count: string;
}

interface RetentionPolicy {
  id: string;
  table_name: string;
  data_domain: string;
  retention_days: number;
  action_on_expiry: string;
  legal_hold: boolean;
}

const STATUS_VARIANT: Record<DsrStatus, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
  PROCESSING: 'info',
  COMPLETED: 'success',
  REJECTED: 'error',
  PARTIALLY_COMPLETED: 'warning',
  CANCELLED: 'gray',
};

const SENSITIVITY_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  LOW: 'success',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
};

export function DPODashboard() {
  const [tab, setTab] = useState<Tab>('DSR Queue');
  const [dsrs, setDsrs] = useState<DsrRow[]>([]);
  const [overdue, setOverdue] = useState<DsrRow[]>([]);
  const [accessLog, setAccessLog] = useState<AccessLogRow[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [consentAnalytics, setConsentAnalytics] = useState<ConsentAnalytic[]>([]);
  const [retentionPolicies, setRetentionPolicies] = useState<{ platform_defaults: RetentionPolicy[]; tenant_overrides: RetentionPolicy[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      if (t === 'DSR Queue') {
        const [all, od] = await Promise.all([
          apiFetch('/v1/admin/privacy/dsr').then(r => r.ok ? r.json() : []),
          apiFetch('/v1/admin/privacy/dsr/overdue').then(r => r.ok ? r.json() : []),
        ]);
        setDsrs(all);
        setOverdue(od);
      } else if (t === 'PII Access Log') {
        const res = await apiFetch('/v1/admin/privacy/pii-access-log?limit=100');
        if (res.ok) setAccessLog(await res.json());
      } else if (t === 'Processing Activities') {
        const res = await apiFetch('/v1/admin/privacy/processing-activities');
        if (res.ok) setActivities(await res.json());
      } else if (t === 'Retention Policies') {
        const res = await apiFetch('/v1/admin/privacy/retention-policies');
        if (res.ok) setRetentionPolicies(await res.json());
      } else if (t === 'Consent Analytics') {
        const res = await apiFetch('/v1/admin/privacy/consent-analytics');
        if (res.ok) setConsentAnalytics(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  async function processDsr(id: string) {
    setProcessing(id);
    try {
      const res = await apiFetch(`/v1/admin/privacy/dsr/${id}/process`, { method: 'POST' });
      if (res.ok) await loadTab('DSR Queue');
    } finally {
      setProcessing(null);
    }
  }

  async function patchDsr(id: string, body: object) {
    const res = await apiFetch(`/v1/admin/privacy/dsr/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) await loadTab('DSR Queue');
  }

  return (
    <div>
      <PageHeader
        crumbs={['NexusHR', 'Privacy']}
        titlePlain="Data protection"
        titleEm="dashboard"
        subtitle="DSR queue, PII access audit, processing register and consent analytics."
      />

      <div style={{ display: 'flex', gap: 4, padding: '0 28px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              background: tab === t ? 'hsl(var(--primary))' : 'transparent',
              color: tab === t ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {t}
            {t === 'DSR Queue' && overdue.length > 0 && (
              <span style={{
                marginLeft: 6,
                background: 'var(--red)',
                color: '#fff',
                borderRadius: 10,
                fontSize: 10,
                padding: '1px 5px',
                fontWeight: 700,
              }}>{overdue.length}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 28px' }}>
        {loading && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>}

        {/* ── DSR Queue ─────────────────────────────────────────────────────── */}
        {!loading && tab === 'DSR Queue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {overdue.length > 0 && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--red-l)',
                border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
                borderRadius: 'var(--r)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Icon name="alertTriangle" size={15} color="var(--red)" />
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                  <strong>{overdue.length}</strong> request{overdue.length !== 1 ? 's' : ''} approaching the 30-day deadline.
                </span>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Requester', 'Type', 'Status', 'Submitted', 'Due', 'Verified', 'Actions'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dsrs.map(dsr => (
                    <tr key={dsr.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>{dsr.requester_email}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge variant="info">{dsr.request_type}</Badge>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge variant={STATUS_VARIANT[dsr.status]}>{dsr.status.replace('_', ' ')}</Badge>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--ink3)' }}>{new Date(dsr.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '10px 12px', color: new Date(dsr.due_at) < new Date() ? 'var(--red)' : 'var(--ink3)' }}>
                        {new Date(dsr.due_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {dsr.identity_verified ? (
                          <Icon name="check" size={14} color="var(--green)" />
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => patchDsr(dsr.id, { identity_verified: true })}>
                            Verify
                          </Button>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {['PENDING', 'IN_REVIEW'].includes(dsr.status) && (
                            <Button
                              size="sm"
                              disabled={processing === dsr.id}
                              onClick={() => processDsr(dsr.id)}
                            >
                              {processing === dsr.id ? '…' : 'Process'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {dsrs.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--ink3)' }}>
                        No data subject requests.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PII Access Log ────────────────────────────────────────────────── */}
        {!loading && tab === 'PII Access Log' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['When', 'Accessor', 'Subject table', 'Fields', 'Domain', 'Sensitivity', 'Purpose'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accessLog.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>
                      <div style={{ fontSize: 12 }}>{row.accessor_id?.slice(0, 8) ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{row.accessor_type}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>{row.subject_table}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {row.fields_accessed.slice(0, 3).map(f => (
                          <Badge key={f} variant="gray" style={{ fontSize: 10 }}>{f}</Badge>
                        ))}
                        {row.fields_accessed.length > 3 && (
                          <Badge variant="gray" style={{ fontSize: 10 }}>+{row.fields_accessed.length - 3}</Badge>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink2)', fontSize: 12 }}>{row.data_domain}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge variant={SENSITIVITY_VARIANT[row.sensitivity_level] ?? 'gray'}>{row.sensitivity_level}</Badge>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink3)', fontSize: 12 }}>{row.purpose ?? '—'}</td>
                  </tr>
                ))}
                {accessLog.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--ink3)' }}>
                      No HIGH/CRITICAL access events logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Processing Activities ─────────────────────────────────────────── */}
        {!loading && tab === 'Processing Activities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activities.map(a => (
              <div key={a.id} style={{
                padding: '14px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                <FeaturedIcon variant={a.is_active ? 'brand' : 'gray'} size="sm" shape="squircle">
                  <Icon name="layers" size={13} />
                </FeaturedIcon>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{a.purpose}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <Badge variant="info">{a.lawful_basis}</Badge>
                    {a.dpia_required && (
                      <Badge variant={a.dpia_completed_at ? 'success' : 'warning'}>
                        DPIA {a.dpia_completed_at ? 'complete' : 'required'}
                      </Badge>
                    )}
                    {a.retention_days && (
                      <Badge variant="gray">{a.retention_days}d retention</Badge>
                    )}
                    {!a.is_active && <Badge variant="gray">Inactive</Badge>}
                  </div>
                </div>
              </div>
            ))}
            {activities.length === 0 && (
              <div style={{
                padding: '32px 24px', textAlign: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
              }}>
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No processing activities configured. Add them via the API or workspace settings.</div>
              </div>
            )}
          </div>
        )}

        {/* ── Retention Policies ────────────────────────────────────────────── */}
        {!loading && tab === 'Retention Policies' && retentionPolicies && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {[
              { label: 'Platform defaults', rows: retentionPolicies.platform_defaults },
              { label: 'Workspace overrides', rows: retentionPolicies.tenant_overrides },
            ].map(({ label, rows }) => (
              <div key={label}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 8 }}>{label}</div>
                {rows.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0' }}>None configured.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Table', 'Domain', 'Retention', 'On expiry', 'Legal hold'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', color: 'var(--ink)', fontFamily: 'monospace', fontSize: 12 }}>{p.table_name}</td>
                            <td style={{ padding: '10px 12px' }}><Badge variant="info">{p.data_domain}</Badge></td>
                            <td style={{ padding: '10px 12px', color: 'var(--ink2)' }}>{p.retention_days}d</td>
                            <td style={{ padding: '10px 12px' }}><Badge variant="warning">{p.action_on_expiry}</Badge></td>
                            <td style={{ padding: '10px 12px' }}>
                              {p.legal_hold ? <Icon name="lock" size={14} color="var(--red)" /> : <span style={{ color: 'var(--ink3)' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Consent Analytics ─────────────────────────────────────────────── */}
        {!loading && tab === 'Consent Analytics' && (
          <div>
            {consentAnalytics.length === 0 ? (
              <div style={{
                padding: '32px 24px', textAlign: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
              }}>
                <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No consent data yet.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Processing activity', 'Status', 'Count'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {consentAnalytics.map(row => (
                      <tr key={`${row.activity_id}-${row.status}`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>{row.activity_name}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <Badge variant={row.status === 'ACTIVE' ? 'success' : row.status === 'WITHDRAWN' ? 'error' : 'gray'}>
                            {row.status}
                          </Badge>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--ink)', fontWeight: 600 }}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
