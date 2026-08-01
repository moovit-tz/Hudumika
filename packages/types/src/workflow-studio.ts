// ─── Workflow Studio ────────────────────────────────────────────────────
//
// Trigger and action ids are plain strings, resolved at runtime from the
// registries the API serves (`GET /v1/workflow-studio/triggers` and
// `/actions`). They were previously string-literal unions naming events like
// 'shipment.created' and 'landed_cost.computed' — none of which the platform
// emits. A union of invented names is worse than `string`: it makes TypeScript
// vouch for a workflow that can never run, which is how 21 dead workflows
// shipped (migrations 155 and 157). The registry is the source of truth and
// `npm run check:triggers` keeps it aligned with the real emitters.

export type WorkflowStudioStatus = 'ACTIVE' | 'PAUSED' | 'DRAFT';

/** SIMULATED = dry run. PARTIAL = some actions completed before one failed. */
export type WorkflowStudioRunStatus = 'SUCCESS' | 'RUNNING' | 'FAILED' | 'PARTIAL' | 'SIMULATED';

export type WorkflowStudioNodeType = 'trigger' | 'condition' | 'action' | 'forEach';

export interface WorkflowStudioNode {
  id: string;
  type: WorkflowStudioNodeType;
  title: string;
  subtitle?: string;
  /** Trigger id on a `trigger` node, action id on an `action` node. */
  eventOrAction?: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowStudioEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowStudioApp {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  status: WorkflowStudioStatus;
  trigger_event: string;
  trigger_config: Record<string, any>;
  nodes: WorkflowStudioNode[];
  edges: WorkflowStudioEdge[];
  last_run_at: string | null;
  run_count: number;
  /** Names the code subscriber this workflow stands down once ACTIVE. */
  supersedes_subscriber?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStudioRunStep {
  node_id: string;
  node_type: WorkflowStudioNodeType;
  title: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'SIMULATED';
  duration_ms: number;
  output?: Record<string, any>;
  error?: string;
  /** 1-based position within a forEach body. */
  iteration?: number;
}

export interface WorkflowStudioRun {
  id: string;
  tenant_id: string;
  workflow_id: string;
  trigger_source: string;
  status: WorkflowStudioRunStatus;
  payload: Record<string, any>;
  step_results: WorkflowStudioRunStep[];
  error_message: string | null;
  duration_ms: number;
  domain_event_id?: string | null;
  created_at: string;
}

// ─── Registry catalogues (served by the API, never hardcoded client-side) ──

export type WorkflowStudioTriggerKind = 'DOMAIN_EVENT' | 'SCHEDULE' | 'MANUAL';

export interface WorkflowStudioTriggerDef {
  id: string;
  kind: WorkflowStudioTriggerKind;
  app: string;
  appName: string;
  color: string;
  label: string;
  description: string;
  entityType: string | null;
  samplePayload: Record<string, any>;
}

export interface WorkflowStudioActionInput {
  name: string;
  required: boolean;
}

export interface WorkflowStudioActionDef {
  id: string;
  app: string;
  appName: string;
  color: string;
  label: string;
  description: string;
  /** Writes to a regulated ledger or files with an authority — gated in the picker. */
  restricted: boolean;
  requiredEntitlement: string | null;
  inputs: WorkflowStudioActionInput[];
}

export interface WorkflowStudioIntegration {
  id: string;
  name: string;
  color: string;
  status: string;
  events_count: number;
  actions_count: number;
}
