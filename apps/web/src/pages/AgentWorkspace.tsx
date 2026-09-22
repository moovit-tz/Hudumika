import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentApprovalStatus, AgentRunStatus, AgentToolSummary } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Textarea } from '../components/ui/textarea.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip.js';
import { AgenticExecutionStage } from '../components/agentic/AgenticExecutionStage.js';
import './AgentWorkspace.css';

type JsonMap = Record<string, unknown>;

interface RunStep {
  id: string;
  sequence: number;
  stepType: string;
  toolId: string | null;
  input: JsonMap | null;
  output: unknown;
  status: string;
  error: string | null;
  createdAt: string;
}

interface RunApproval {
  id: string;
  toolId: string;
  requestedEffect: string;
  preview: JsonMap | null;
  approverRole: string;
  requiredApprovals: number;
  decisionsSoFar: number;
  status: AgentApprovalStatus;
}

interface RunEvidence {
  id: string;
  claim: string;
  entityType: string | null;
  entityId: string | null;
  sourceUrl: string | null;
}

interface RunArtifact {
  id: string;
  kind: string;
  title: string;
  content: unknown;
  classification: string;
}

interface RunDetail {
  id: string;
  status: AgentRunStatus;
  goal: string;
  errorMessage: string | null;
  createdAt: string;
  steps: RunStep[];
  approvals: RunApproval[];
  artifacts: RunArtifact[];
  evidence: RunEvidence[];
}

const EXAMPLES = [
  'Show the shipments at risk of missing their ETA.',
  'Summarise this month’s unpaid invoices and the customers involved.',
  'Draft a follow-up plan for overdue customer accounts.',
];

function pick<T>(row: any, camel: string, snake: string, fallback: T): T {
  return (row?.[camel] ?? row?.[snake] ?? fallback) as T;
}

function normaliseRun(raw: any): RunDetail {
  return {
    id: raw.id,
    status: raw.status,
    goal: raw.goal,
    errorMessage: pick(raw, 'errorMessage', 'error_message', null),
    createdAt: pick(raw, 'createdAt', 'created_at', ''),
    steps: (raw.steps ?? []).map((step: any) => ({
      id: step.id,
      sequence: step.sequence,
      stepType: pick(step, 'stepType', 'step_type', 'message'),
      toolId: pick(step, 'toolId', 'tool_id', null),
      input: parseJson(step.input),
      output: parseJson(step.output),
      status: step.status,
      error: step.error ?? null,
      createdAt: pick(step, 'createdAt', 'created_at', ''),
    })),
    approvals: (raw.approvals ?? []).map((approval: any) => ({
      id: approval.id,
      toolId: pick(approval, 'toolId', 'tool_id', ''),
      requestedEffect: pick(approval, 'requestedEffect', 'requested_effect', ''),
      preview: parseJson(approval.preview),
      approverRole: pick(approval, 'approverRole', 'approver_role', ''),
      requiredApprovals: Number(pick(approval, 'requiredApprovals', 'required_approvals', 1)),
      decisionsSoFar: Number(pick(approval, 'decisionsSoFar', 'decisions_so_far', 0)),
      status: approval.status,
    })),
    artifacts: (raw.artifacts ?? []).map((artifact: any) => ({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      content: parseJson(artifact.content),
      classification: artifact.classification,
    })),
    evidence: (raw.evidence ?? []).map((evidence: any) => ({
      id: evidence.id,
      claim: evidence.claim,
      entityType: pick(evidence, 'entityType', 'entity_type', null),
      entityId: pick(evidence, 'entityId', 'entity_id', null),
      sourceUrl: pick(evidence, 'sourceUrl', 'source_url', null),
    })),
  };
}

function parseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function textFrom(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const row = value as JsonMap;
  for (const key of ['content', 'text', 'message', 'summary', 'detail', 'result']) {
    if (typeof row[key] === 'string') return row[key] as string;
  }
  return '';
}

function titleFromTool(toolId: string | null, tools: Map<string, AgentToolSummary>): string {
  if (!toolId) return 'Agent response';
  return tools.get(toolId)?.label ?? toolId.split('.').map(part => part.replaceAll('_', ' ')).join(' · ');
}

function statusMeta(status: AgentRunStatus) {
  switch (status) {
    case 'running': return { label: 'Working', variant: 'warning' as const, icon: 'activity' as IconName };
    case 'awaiting_approval': return { label: 'Approval needed', variant: 'warning' as const, icon: 'clock' as IconName };
    case 'completed': return { label: 'Completed', variant: 'success' as const, icon: 'check' as IconName };
    case 'failed': return { label: 'Needs attention', variant: 'error' as const, icon: 'alertCircle' as IconName };
    case 'cancelled': return { label: 'Stopped', variant: 'gray' as const, icon: 'close' as IconName };
    default: return { label: 'Preparing', variant: 'info' as const, icon: 'clock' as IconName };
  }
}

export function AgentWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'stage' | 'console'>('stage');
  const [prompt, setPrompt] = useState('');
  const [run, setRun] = useState<RunDetail | null>(null);
  const [tools, setTools] = useState<AgentToolSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const toolMap = useMemo(() => new Map(tools.map(tool => [tool.id, tool])), [tools]);
  const refreshRun = useCallback(async (id: string) => {
    const detail = await apiFetch(`/v1/agent/runs/${id}`);
    setRun(normaliseRun(detail));
  }, []);

  useEffect(() => {
    apiFetch<AgentToolSummary[]>('/v1/agent/tools').then(setTools).catch(() => setTools([]));
  }, []);

  useEffect(() => {
    if (!run || !['running', 'pending', 'awaiting_approval'].includes(run.status)) return;
    const timer = window.setInterval(() => refreshRun(run.id).catch(() => {}), 3000);
    return () => window.clearInterval(timer);
  }, [refreshRun, run?.id, run?.status]);

  async function submit() {
    const message = prompt.trim();
    if (!message || submitting) return;
    setError('');
    setSubmitting(true);
    setPrompt('');
    try {
      const result = run
        ? await apiFetch(`/v1/agent/runs/${run.id}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
        : await apiFetch('/v1/agent/runs', { method: 'POST', body: JSON.stringify({ goal: message, appContext: window.location.pathname }) });
      await refreshRun(result.id);
    } catch (err: any) {
      setPrompt(message);
      setError(err?.message || 'The agent could not start this task.');
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(approval: RunApproval, decision: 'approved' | 'rejected') {
    if (decisionId) return;
    setDecisionId(approval.id);
    setError('');
    try {
      await apiFetch(`/v1/agent/approvals/${approval.id}/decision`, {
        method: 'POST', body: JSON.stringify({ decision }),
      });
      if (run) await refreshRun(run.id);
    } catch (err: any) {
      setError(err?.message || 'The decision could not be recorded.');
    } finally {
      setDecisionId(null);
    }
  }

  async function cancelRun() {
    if (!run) return;
    setSubmitting(true);
    try {
      await apiFetch(`/v1/agent/runs/${run.id}/cancel`, { method: 'POST' });
      await refreshRun(run.id);
    } catch (err: any) {
      setError(err?.message || 'The run could not be stopped.');
    } finally {
      setSubmitting(false);
    }
  }

  function newTask() {
    setRun(null);
    setPrompt('');
    setError('');
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  const visibleSteps = useMemo(() => (run?.steps ?? []).filter(step => {
    if (step.stepType !== 'message') return true;
    const role = typeof step.input === 'object' && step.input ? step.input.role : null;
    return role === 'assistant';
  }), [run?.steps]);
  const pendingApprovals = run?.approvals.filter(a => a.status === 'pending') ?? [];
  const canContinue = run && ['completed', 'failed'].includes(run.status);
  const meta = run ? statusMeta(run.status) : null;

  return (
    <main className="agent-workspace" aria-label="Hudumika agent workspace">
      <header className="agent-topbar">
        <button type="button" className="agent-brand" onClick={() => navigate('/')} aria-label="Return to workspace">
          <span className="agent-brand-mark"><Icon name="zap" size={17} /></span>
          <span>Hudumika</span>
          <span className="agent-brand-divider" />
          <span className="agent-brand-section">Agent</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '3px', borderRadius: 8 }}>
          <button
            type="button"
            onClick={() => setViewMode('stage')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, background: viewMode === 'stage' ? '#ea580c' : 'transparent', color: viewMode === 'stage' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon name="sparkle" size={13} />
            <span>Interactive Flow</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('console')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, background: viewMode === 'console' ? '#0f172a' : 'transparent', color: viewMode === 'console' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon name="terminal" size={13} />
            <span>Console Audit</span>
          </button>
        </div>

        <div className="agent-topbar-actions">
          {run && <span className="agent-run-id">{run.id.slice(0, 8).toUpperCase()}</span>}
          <Button type="button" variant="ghost" size="sm" onClick={newTask}>
            New task <Icon name="plus" size={14} />
          </Button>
        </div>
      </header>

      {viewMode === 'stage' ? (
        <div style={{ padding: '24px 32px 48px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <AgenticExecutionStage />
        </div>
      ) : !run ? (
        <section className="agent-empty">
          <div className="agent-empty-copy">
            <PersonAvatar userId={user?.id} name={user?.name || 'Workspace agent'} size={58} />
            <h1>Ask Hudumika.</h1>
            <p>Your workspace, in one conversation.</p>
          </div>
          <div className="agent-example-list" aria-label="Example tasks">
            {EXAMPLES.map(example => (
              <button key={example} type="button" onClick={() => { setPrompt(example); composerRef.current?.focus(); }}>
                {example}<Icon name="arrowUpRight" size={14} />
              </button>
            ))}
          </div>
          <Composer ref={composerRef} value={prompt} onChange={setPrompt} onSubmit={submit} busy={submitting} error={error} />
        </section>
      ) : (
        <div className="agent-run-layout">
          <aside className="agent-run-rail">
            <div className="agent-assignee">
              <PersonAvatar userId={user?.id} name={user?.name || 'Workspace user'} size={38} />
              <div><span>Assigned by</span><strong>{user?.name || 'You'}</strong></div>
            </div>
            <p className="agent-goal-compact">{run.goal}</p>
            <ol className="agent-step-list">
              {visibleSteps.map((step, index) => {
                const failed = step.status === 'error';
                const current = index === visibleSteps.length - 1 && run.status !== 'completed';
                return (
                  <li key={step.id} className={current ? 'is-current' : failed ? 'is-error' : 'is-complete'}>
                    <span className="agent-step-marker">{failed ? '!' : current ? index + 1 : <Icon name="check" size={12} />}</span>
                    <span>{titleFromTool(step.toolId, toolMap)}</span>
                  </li>
                );
              })}
              {visibleSteps.length === 0 && <li className="is-current"><span className="agent-step-marker">1</span><span>Understand the request</span></li>}
            </ol>
          </aside>

          <section className="agent-run-main">
            <div className="agent-run-heading">
              <div>
                <span className="agent-eyebrow">Delegated task</span>
                <h1>{run.goal}</h1>
              </div>
              {meta && <Badge variant={meta.variant}><Icon name={meta.icon} size={12} />{meta.label}</Badge>}
            </div>

            {submitting && <WorkingCard label="Hudumika is working on your request" />}

            {!submitting && visibleSteps.length === 0 && ['running', 'pending'].includes(run.status) && <WorkingCard label="Planning the work" />}

            <div className="agent-result-stack" aria-live="polite">
              {visibleSteps.map(step => <StepCard key={step.id} step={step} tools={toolMap} />)}

              {pendingApprovals.map(approval => (
                <ApprovalCard key={approval.id} approval={approval} busy={decisionId === approval.id} onDecision={decide} />
              ))}

              {run.artifacts.map(artifact => (
                <article key={artifact.id} className="agent-content-card">
                  <div className="agent-card-kicker"><Icon name="fileText" size={14} />{artifact.kind} · {artifact.classification}</div>
                  <h2>{artifact.title}</h2>
                  <StructuredValue value={artifact.content} />
                </article>
              ))}

              {run.evidence.length > 0 && (
                <article className="agent-content-card agent-evidence-card">
                  <div className="agent-card-kicker"><Icon name="link" size={14} />Evidence used</div>
                  <ul>{run.evidence.map(item => <li key={item.id}>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.claim}<Icon name="externalLink" size={12} /></a> : <span>{item.claim}</span>}</li>)}</ul>
                </article>
              )}

              {run.errorMessage && <div className="agent-error" role="alert"><Icon name="alertCircle" size={17} /><span>{run.errorMessage}</span></div>}
              {error && <div className="agent-error" role="alert"><Icon name="alertCircle" size={17} /><span>{error}</span></div>}
            </div>

            <div className="agent-run-footer">
              {['running', 'pending', 'awaiting_approval'].includes(run.status) && (
                <Button type="button" variant="outline" size="sm" onClick={cancelRun} disabled={submitting}>Stop task</Button>
              )}
              {canContinue && <Composer ref={composerRef} compact value={prompt} onChange={setPrompt} onSubmit={submit} busy={submitting} error="" />}
              {run.status === 'cancelled' && <Button type="button" onClick={newTask}>Start another task</Button>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const Composer = React.forwardRef<HTMLTextAreaElement, { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean; error: string; compact?: boolean }>(
  ({ value, onChange, onSubmit, busy, error, compact }, ref) => (
    <div className={`agent-composer-wrap${compact ? ' is-compact' : ''}`}>
      <div className="agent-composer">
        <Tooltip><TooltipTrigger asChild><button type="button" className="agent-attach" aria-label="Attach context" disabled><Icon name="plus" size={20} /></button></TooltipTrigger><TooltipContent>Attachments are coming next</TooltipContent></Tooltip>
        <Textarea
          ref={ref}
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSubmit(); }
          }}
          placeholder={compact ? 'Continue this task…' : 'What would you like Hudumika to do?'}
          aria-label="Message Hudumika agent"
          rows={1}
          disabled={busy}
        />
        <Button type="button" size="icon" onClick={onSubmit} disabled={!value.trim() || busy} aria-label="Send task">
          <Icon name={busy ? 'activity' : 'arrowUp'} size={18} />
        </Button>
      </div>
      {error && <p className="agent-composer-error" role="alert">{error}</p>}
      {!compact && <p className="agent-composer-hint">Enter to send · Shift + Enter for a new line · Actions that change data require approval</p>}
    </div>
  ),
);
Composer.displayName = 'AgentComposer';

function WorkingCard({ label }: { label: string }) {
  return <div className="agent-working"><span className="agent-working-dot" /><span>{label}</span><span className="agent-working-time">Working</span></div>;
}

function StepCard({ step, tools }: { step: RunStep; tools: Map<string, AgentToolSummary> }) {
  const title = titleFromTool(step.toolId, tools);
  const text = textFrom(step.output) || textFrom(step.input);
  return (
    <article className={`agent-content-card${step.status === 'error' ? ' is-error' : ''}`}>
      <div className="agent-card-kicker">
        <Icon name={step.status === 'error' ? 'alertCircle' : step.stepType === 'tool_call' ? 'zap' : 'checkCircle'} size={14} />
        {step.stepType.replaceAll('_', ' ')}
      </div>
      <div className="agent-card-title-row"><h2>{title}</h2><Badge variant={step.status === 'error' ? 'error' : 'success'}>{step.status === 'error' ? 'Failed' : 'Done'}</Badge></div>
      {step.error ? <p>{step.error}</p> : text ? <p>{text}</p> : <StructuredValue value={step.output ?? step.input} />}
    </article>
  );
}

function ApprovalCard({ approval, busy, onDecision }: { approval: RunApproval; busy: boolean; onDecision: (approval: RunApproval, decision: 'approved' | 'rejected') => void }) {
  const preview = approval.preview && typeof approval.preview === 'object' ? (approval.preview.preview ?? approval.preview.input) : null;
  return (
    <article className="agent-approval-card">
      <div className="agent-card-kicker"><Icon name="shield" size={14} />Human approval</div>
      <h2>Review before Hudumika continues.</h2>
      <p>{approval.requestedEffect}</p>
      {preview != null && <div className="agent-approval-preview"><StructuredValue value={preview} /></div>}
      <div className="agent-approval-meta">
        <span>{approval.decisionsSoFar} of {approval.requiredApprovals} approvals</span>
        <span>{approval.approverRole.replaceAll('_', ' ').toLowerCase()}</span>
      </div>
      <div className="agent-approval-actions">
        <Button type="button" variant="outline" onClick={() => onDecision(approval, 'rejected')} disabled={busy}>Reject</Button>
        <Button type="button" onClick={() => onDecision(approval, 'approved')} disabled={busy}>{busy ? 'Recording…' : 'Approve and continue'}</Button>
      </div>
    </article>
  );
}

function StructuredValue({ value }: { value: unknown }) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return <p>{value}</p>;
  if (Array.isArray(value)) return <ul className="agent-value-list">{value.slice(0, 12).map((item, index) => <li key={index}><StructuredValue value={item} /></li>)}</ul>;
  if (typeof value === 'object') return (
    <dl className="agent-value-grid">
      {Object.entries(value as JsonMap).filter(([, item]) => item != null && item !== '').slice(0, 12).map(([key, item]) => (
        <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</dd></div>
      ))}
    </dl>
  );
  return <p>{String(value)}</p>;
}
