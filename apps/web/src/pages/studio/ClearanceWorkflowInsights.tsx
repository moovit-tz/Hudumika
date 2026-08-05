import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Combobox } from '../../components/ui/combobox.js';

/**
 * The two capabilities clearance workflows borrowed from Studio (migration 168):
 * a rehearsal before you commit, and a record of what actually happened.
 *
 * Nothing here invents a number. A workflow with no runs says so; a dry run
 * with no shipment selected reports what it genuinely cannot know rather than
 * guessing that a comm "would probably" reach someone.
 */

interface ConditionOutcome { label: string; field: string; operator: string; passed: boolean | null }
interface CommOutcome {
  commId: string; channel: string; recipient: string;
  status?: 'SENT' | 'FAILED' | 'QUEUED' | 'CANCELLED'; error?: string; delayMinutes?: number;
  wouldReach?: boolean | null; detail?: string; subject?: string;
}
interface RunRow {
  id: string; shipmentId: string; refNumber: string | null;
  toStepId: string; toStepName: string; status: string;
  conditions: ConditionOutcome[]; comms: CommOutcome[];
  errorMessage: string | null; durationMs: number; simulated: boolean;
  actorName: string | null; createdAt: string;
}
interface DryRunStep {
  stepId: string; name: string; order: number; isStart: boolean; isTerminal: boolean;
  reachable: boolean; slaHours: number | null;
  conditions: ConditionOutcome[]; comms: CommOutcome[];
}
interface DryRunResult {
  workflow: { id: string; name: string };
  shipment: { id: string; refNumber: string; stage: string } | null;
  issues: { level: 'error' | 'warning'; message: string; stepId?: string }[];
  steps: DryRunStep[];
  summary: {
    stepCount: number; errors: number; warnings: number;
    stepsBlockedForThisShipment: number | null; commsThatWouldNotReachAnyone: number;
  };
}

const RUN_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  SUCCESS: 'success', PARTIAL: 'warning', BLOCKED: 'warning', FAILED: 'error', SIMULATED: 'info',
};
const COMM_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  SENT: 'success', QUEUED: 'gray', FAILED: 'error', CANCELLED: 'gray',
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS', webhook: 'Webhook', system_notification: 'In-app',
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 12,
  background: 'var(--card-bg, var(--white))', overflow: 'hidden',
};

/* ══ Dry run ══════════════════════════════════════════════════════ */

function DryRunTab({ workflowId, unsaved }: { workflowId: string; unsaved: boolean }) {
  const [shipments, setShipments] = useState<{ value: string; label: string; sublabel?: string }[]>([]);
  const [shipmentId, setShipmentId] = useState('');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/shipments?limit=50')
      .then((r: any) => {
        const rows = r?.data ?? r ?? [];
        setShipments(rows.map((s: any) => ({
          value: s.id,
          label: s.ref_number ?? s.id.slice(0, 8),
          sublabel: [s.customer_name, s.stage].filter(Boolean).join(' · '),
        })));
      })
      .catch(() => setShipments([]));  // the structure-only dry run still works
  }, []);

  const run = useCallback(async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await apiFetch(`/v1/workflows/${workflowId}/dry-run`, {
        method: 'POST',
        body: JSON.stringify(shipmentId ? { shipmentId } : {}),
      }));
    } catch (e: any) {
      setError(e?.message ?? 'Could not complete the dry run.');
    } finally { setBusy(false); }
  }, [workflowId, shipmentId]);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6 }}>
        Checks this workflow's structure, and — if you pick a shipment — evaluates every step's
        entry conditions against that shipment's real data and works out whether each auto-comm
        would actually reach anyone. <strong>Nothing is sent and nothing moves.</strong>
      </div>

      {unsaved && (
        <div style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 9, background: 'var(--gold-l)', border: '1px solid var(--gold-l)', fontSize: 12, color: 'var(--ink2)' }}>
          <Icon name="alertTriangle" size={14} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>This tests the <strong>saved</strong> version. Save first to test your current edits.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Combobox
            options={[{ value: '__none__', label: 'Structure only (no shipment)' }, ...shipments]}
            value={shipmentId || '__none__'}
            onChange={(v) => setShipmentId(v === '__none__' ? '' : v)}
            placeholder="Test against a shipment…"
            searchPlaceholder="Search shipments…"
            emptyText="No shipments found."
            // PopoverContent portals to body at z-50; this drawer sits at
            // z-1000, so without lifting it the list renders underneath the
            // drawer and its options cannot be clicked.
            className="z-1100"
          />
        </div>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          <Icon name="play" size={13} color="white" /> {busy ? 'Testing…' : 'Run test'}
        </button>
      </div>

      {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}

      {result && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
            {[
              { label: 'Steps', value: result.summary.stepCount, tone: 'gray' as const },
              { label: 'Errors', value: result.summary.errors, tone: result.summary.errors > 0 ? 'error' as const : 'success' as const },
              { label: 'Warnings', value: result.summary.warnings, tone: result.summary.warnings > 0 ? 'warning' as const : 'gray' as const },
              {
                label: 'Comms that reach no one',
                value: result.summary.commsThatWouldNotReachAnyone,
                tone: result.summary.commsThatWouldNotReachAnyone > 0 ? 'warning' as const : 'success' as const,
              },
            ].map(t => (
              <div key={t.label} style={{ ...cardStyle, padding: '9px 11px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{t.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: `var(--${t.tone === 'gray' ? 'ink' : t.tone === 'error' ? 'red' : t.tone === 'warning' ? 'gold' : 'green'})`, marginTop: 3 }}>{t.value}</div>
              </div>
            ))}
          </div>

          {result.shipment ? (
            <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
              Tested against <strong>{result.shipment.refNumber}</strong>
              {result.summary.stepsBlockedForThisShipment != null && result.summary.stepsBlockedForThisShipment > 0 && (
                <> — {result.summary.stepsBlockedForThisShipment} step{result.summary.stepsBlockedForThisShipment === 1 ? '' : 's'} would block it today.</>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              Structure only. Pick a shipment to check conditions and comms against real data.
            </div>
          )}

          {result.issues.length > 0 && (
            <div style={cardStyle}>
              <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Structure</div>
              {result.issues.map((iss, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : undefined, fontSize: 12.5 }}>
                  <Icon name={iss.level === 'error' ? 'alertCircle' : 'alertTriangle'} size={14}
                        color={iss.level === 'error' ? 'var(--red)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: 'var(--ink2)' }}>{iss.message}</span>
                </div>
              ))}
            </div>
          )}

          {result.steps.map(step => {
            const blocked = step.conditions.filter(c => c.passed === false).length;
            const unreachable = step.comms.filter(c => c.wouldReach === false).length;
            if (step.conditions.length === 0 && step.comms.length === 0) return null;
            return (
              <div key={step.stepId} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{step.order}. {step.name}</span>
                  {blocked > 0 && <Badge variant="warning">{blocked} would block</Badge>}
                  {unreachable > 0 && <Badge variant="error">{unreachable} reach no one</Badge>}
                  {blocked === 0 && unreachable === 0 && <Badge variant="success">clear</Badge>}
                </div>

                {step.conditions.length > 0 && (
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 5 }}>Entry conditions</div>
                    {step.conditions.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '3px 0' }}>
                        <Icon name={c.passed === true ? 'check' : c.passed === false ? 'x' : 'minus'} size={13}
                              color={c.passed === true ? 'var(--green)' : c.passed === false ? 'var(--red)' : 'var(--ink3)'} />
                        <span style={{ color: c.passed === false ? 'var(--ink)' : 'var(--ink2)' }}>{c.label}</span>
                        {c.passed === null && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>not checked — no shipment</span>}
                      </div>
                    ))}
                  </div>
                )}

                {step.comms.length > 0 && (
                  <div style={{ padding: '8px 12px', borderTop: step.conditions.length ? '1px solid var(--border)' : undefined }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 5 }}>Auto-comms</div>
                    {step.comms.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '3px 0' }}>
                        <Icon name={c.wouldReach === true ? 'check' : c.wouldReach === false ? 'x' : 'minus'} size={13}
                              color={c.wouldReach === true ? 'var(--green)' : c.wouldReach === false ? 'var(--red)' : 'var(--ink3)'}
                              style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: 'var(--ink2)' }}>
                          <strong style={{ color: 'var(--ink)' }}>{CHANNEL_LABEL[c.channel] ?? c.channel}</strong>
                          {' → '}{c.recipient.replace(/_/g, ' ')}
                          {!!c.delayMinutes && <span style={{ color: 'var(--ink3)' }}> · after {c.delayMinutes}m</span>}
                          <span style={{ display: 'block', color: c.wouldReach === false ? 'var(--red)' : 'var(--ink3)', fontSize: 11.5 }}>{c.detail}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ══ Run history ══════════════════════════════════════════════════ */

function HistoryTab({ workflowId }: { workflowId: string }) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/v1/workflows/${workflowId}/runs?limit=50${filter ? `&status=${filter}` : ''}`)
      .then((r: any) => { if (alive) { setRuns(r.data ?? []); setCounts(r.counts ?? {}); } })
      .catch((e: any) => { if (alive) setError(e?.message ?? 'Could not load run history.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workflowId, filter]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6 }}>
        Every transition attempt on this workflow — including the ones that were refused,
        and the auto-comms that failed to send.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className={`wfb-tag-pill ${!filter ? 'sel' : ''}`} onClick={() => setFilter('')}>
          All {total > 0 && `(${total})`}
        </button>
        {['SUCCESS', 'PARTIAL', 'BLOCKED', 'FAILED', 'SIMULATED'].filter(s => counts[s]).map(s => (
          <button key={s} type="button" className={`wfb-tag-pill ${filter === s ? 'sel' : ''}`} onClick={() => setFilter(s)}>
            {s.charAt(0) + s.slice(1).toLowerCase()} ({counts[s]})
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Loading…</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}

      {!loading && !error && runs.length === 0 && (
        <div style={{ ...cardStyle, padding: 24, textAlign: 'center' }}>
          <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="clock" size={20} /></FeaturedIcon>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 10, fontWeight: 600 }}>
            {filter ? `No ${filter.toLowerCase()} runs.` : 'Nothing has run yet.'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
            {filter ? 'Try another filter.' : 'Runs appear here as shipments move through this workflow. Use Dry run to rehearse one safely first.'}
          </div>
        </div>
      )}

      {runs.map(r => {
        const failedComms = r.comms.filter(c => c.status === 'FAILED');
        const open = expanded === r.id;
        const detailed = r.conditions.length > 0 || r.comms.length > 0 || r.errorMessage;
        return (
          <div key={r.id} style={cardStyle}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', cursor: detailed ? 'pointer' : 'default' }}
              onClick={() => detailed && setExpanded(open ? null : r.id)}
            >
              <Badge variant={RUN_VARIANT[r.status] ?? 'gray'}>{r.status}</Badge>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.refNumber ? <strong>{r.refNumber}</strong> : <span style={{ color: 'var(--ink3)' }}>shipment removed</span>}
                  {' → '}{r.toStepName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>
                  {timeAgo(r.createdAt)}{r.actorName ? ` · ${r.actorName}` : ''} · {r.durationMs}ms
                  {failedComms.length > 0 && <span style={{ color: 'var(--red)' }}> · {failedComms.length} comm{failedComms.length === 1 ? '' : 's'} failed</span>}
                </div>
              </div>
              {detailed && <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} color="var(--ink3)" />}
            </div>

            {open && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '9px 12px' }}>
                {r.errorMessage && (
                  <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: r.conditions.length || r.comms.length ? 9 : 0 }}>{r.errorMessage}</div>
                )}
                {r.conditions.length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 4 }}>Conditions</div>
                    {r.conditions.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, padding: '2px 0' }}>
                        <Icon name={c.passed ? 'check' : 'x'} size={12} color={c.passed ? 'var(--green)' : 'var(--red)'} />
                        <span style={{ color: 'var(--ink2)' }}>{c.label}</span>
                      </div>
                    ))}
                  </>
                )}
                {r.comms.length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '9px 0 4px' }}>Comms</div>
                    {r.comms.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, padding: '2px 0' }}>
                        <Badge variant={COMM_VARIANT[c.status ?? ''] ?? 'gray'}>{c.status ?? '—'}</Badge>
                        <span style={{ color: 'var(--ink2)' }}>
                          {CHANNEL_LABEL[c.channel] ?? c.channel} → {c.recipient.replace(/_/g, ' ')}
                          {c.error && <span style={{ display: 'block', color: 'var(--red)', fontSize: 11.5 }}>{c.error}</span>}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══ Drawer ═══════════════════════════════════════════════════════ */

export function ClearanceWorkflowInsights({
  workflowId, unsaved, onClose, initialTab = 'test',
}: {
  workflowId: string;
  unsaved: boolean;
  onClose: () => void;
  initialTab?: 'test' | 'history';
}) {
  const [tab, setTab] = useState<'test' | 'history'>(initialTab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="wfb-insights-backdrop" onClick={onClose}>
      <aside className="wfb-insights" onClick={e => e.stopPropagation()} role="dialog" aria-label="Workflow test and history">
        <div className="wfb-insights-head">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['test', 'history'] as const).map(t => (
              <button key={t} type="button"
                      className={`wfb-insights-tab ${tab === t ? 'sel' : ''}`}
                      onClick={() => setTab(t)}>
                <Icon name={t === 'test' ? 'play' : 'clock'} size={13} />
                {t === 'test' ? 'Dry run' : 'History'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="wfb-insights-body">
          {tab === 'test'
            ? <DryRunTab workflowId={workflowId} unsaved={unsaved} />
            : <HistoryTab workflowId={workflowId} />}
        </div>
      </aside>
    </div>
  );
}
