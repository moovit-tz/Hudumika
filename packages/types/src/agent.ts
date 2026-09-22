// ─── Agentic Platform ───────────────────────────────────────────────────
//
// Contracts for the governed agent execution layer (see docs/architecture/
// HUDUMIKA_AGENTIC_IMPLEMENTATION_2026-09-19.html and migration 488).
// Tool/appId are plain strings resolved at runtime from
// apps/api/src/services/agent-registry.ts, the same "registry is the
// source of truth, not an invented union" convention workflow-studio.ts
// already established for trigger/action ids — a tool a client can name
// but the registry doesn't have is a real 404, not a type-checked lie.

export type AgentToolEffect = 'read' | 'create' | 'update' | 'delete' | 'external';
export type AgentToolRisk = 'low' | 'medium' | 'high' | 'critical';
export type AgentApprovalPolicy = 'never' | 'policy' | 'always';

/**
 * What a client is allowed to know about a tool — never the schema or
 * execution logic, which stay server-side. Served by `GET /v1/agent/tools`
 * (milestone 2) so a UI can render "what can the agent do here" without
 * hardcoding the catalogue.
 */
export interface AgentToolSummary {
  id: string;
  appId: string;
  label: string;
  description: string;
  effect: AgentToolEffect;
  risk: AgentToolRisk;
  approvalPolicy: AgentApprovalPolicy;
}

export type AgentRunStatus = 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';

export interface AgentRun {
  id: string;
  status: AgentRunStatus;
  goal: string;
  appContext: string | null;
  costUsd: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type AgentRunStepType = 'plan' | 'message' | 'tool_call' | 'tool_result' | 'approval_requested' | 'transition';
export type AgentRunStepStatus = 'ok' | 'error' | 'skipped' | 'simulated';

export interface AgentRunStep {
  id: string;
  sequence: number;
  stepType: AgentRunStepType;
  toolId: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  status: AgentRunStepStatus;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface AgentApproval {
  id: string;
  runId: string;
  toolId: string;
  requestedEffect: string;
  preview: Record<string, unknown> | null;
  approverRole: string;
  requiredApprovals: number;
  decisionsSoFar: number;
  status: AgentApprovalStatus;
  expiresAt: string;
  createdAt: string;
}

/** One row in the current user's approval inbox — `GET /v1/agent/approvals`
 *  (milestone 3). Only ever contains approvals this user's role is actually
 *  eligible to decide; `decisionsSoFar`/`myDecision` are what let a UI show
 *  "waiting on 1 more approver" on a dual-control (required_approvals > 1)
 *  approval rather than treating every approval as single-decision. */
export interface AgentApprovalInboxItem extends AgentApproval {
  runGoal: string;
  initiatorUserId: string;
  initiatorName: string | null;
  myDecision: 'approved' | 'rejected' | null;
}

export type AgentArtifactKind = 'worklist' | 'draft' | 'report' | 'plan';

export interface AgentArtifact {
  id: string;
  runId: string;
  kind: AgentArtifactKind;
  title: string;
  content: unknown;
  classification: 'internal' | 'sensitive';
  createdAt: string;
}

export interface AgentEvidence {
  id: string;
  runId: string;
  claim: string;
  entityType: string | null;
  entityId: string | null;
  sourceUrl: string | null;
  accessedAt: string;
}

/** Full state for `GET /v1/agent/runs/:id` (milestone 2). */
export interface AgentRunDetail extends AgentRun {
  steps: AgentRunStep[];
  approvals: AgentApproval[];
  artifacts: AgentArtifact[];
  evidence: AgentEvidence[];
}
