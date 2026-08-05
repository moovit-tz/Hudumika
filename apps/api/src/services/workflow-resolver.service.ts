import { WORKFLOW_CONFIGS } from '../config/workflow.config.js';
import { CLEARANCE_STAGES } from '@hudumika/types';
import type { FieldCondition, AutoComm, ShipmentType } from '@hudumika/types';
import { applyOperator } from '../studio/conditions.js';

export interface ResolvedStep {
  id: string;
  order: number;
  name: string;
  isStart: boolean;
  isTerminal: boolean;
  nextStepIds: string[];
  entryConditions: FieldCondition[];
  autoComms: AutoComm[];
  slaHours: number;
}

export interface ResolvedWorkflow {
  kind: 'CUSTOM' | 'LEGACY';
  workflowId: string | null; // null for LEGACY
  steps: ResolvedStep[];
}

// Freight mode derived from ShipmentType, mirrors the existing CO2_MODE_MAP
// convention in workflow.service.ts.
const FREIGHT_MODE_MAP: Record<string, string> = {
  SEA_FCL: 'sea', SEA_LCL: 'sea', BULK: 'sea', AIR: 'air', ROAD: 'road', RAIL: 'rail',
};

/**
 * Synthesizes the legacy fixed 18-stage system into the same ResolvedStep
 * shape a custom workflow uses — this is the bridge that makes the generic
 * transition engine byte-identical to today's behavior for any tenant that
 * has never created a custom workflow. Linear nextStepIds, isTerminal only
 * on CLOSED (matches the old `nextStage === 'CLOSED'` checks exactly),
 * entryConditions built from WORKFLOW_CONFIGS[stage].requiredDocuments.
 */
function synthesizeLegacyWorkflow(): ResolvedWorkflow {
  const steps: ResolvedStep[] = CLEARANCE_STAGES.map((stage, i) => {
    const config = WORKFLOW_CONFIGS[stage];
    const next = CLEARANCE_STAGES[i + 1];
    return {
      id: stage,
      order: i,
      name: config.label,
      isStart: i === 0,
      isTerminal: stage === 'CLOSED',
      nextStepIds: next ? [next] : [],
      entryConditions: config.requiredDocuments.map((docType) => ({
        id: `legacy-${stage}-${docType}`,
        field: `document:${docType}`,
        operator: 'required' as const,
        label: `${docType} document`,
      })),
      autoComms: [],
      slaHours: config.slaHours,
    };
  });
  return { kind: 'LEGACY', workflowId: null, steps };
}

function parseSteps(rows: any[]): ResolvedStep[] {
  return rows.map((r) => ({
    id: r.id,
    order: r.step_order,
    name: r.name,
    isStart: r.is_start,
    isTerminal: r.is_terminal,
    nextStepIds: typeof r.next_step_ids === 'string' ? JSON.parse(r.next_step_ids) : (r.next_step_ids ?? []),
    entryConditions: typeof r.entry_conditions === 'string' ? JSON.parse(r.entry_conditions) : (r.entry_conditions ?? []),
    autoComms: typeof r.auto_comms === 'string' ? JSON.parse(r.auto_comms) : (r.auto_comms ?? []),
    slaHours: r.sla_hours ?? 24,
  }));
}

async function loadWorkflowSteps(trx: any, tenantId: string, workflowId: string): Promise<ResolvedStep[]> {
  const rows = await trx
    .selectFrom('workflow_steps')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('workflow_id', '=', workflowId)
    .orderBy('step_order', 'asc')
    .execute();
  return parseSteps(rows);
}

/** Re-hydrates the workflow governing an EXISTING shipment (workflowId as stored on shipment_cases.workflow_id). */
export async function loadResolvedWorkflow(trx: any, tenantId: string, workflowId: string | null): Promise<ResolvedWorkflow> {
  if (!workflowId) return synthesizeLegacyWorkflow();
  const steps = await loadWorkflowSteps(trx, tenantId, workflowId);
  // Safety net: the workflow was deleted or emptied out from under an active
  // shipment — fall back to legacy rather than leaving the shipment stranded
  // with zero valid steps to transition through.
  if (steps.length === 0) return synthesizeLegacyWorkflow();
  return { kind: 'CUSTOM', workflowId, steps };
}

interface NewShipmentInput {
  type: ShipmentType;
  consignmentType: string;
  customerId: string;
  originPort: string;
  destPort: string;
}

export interface TargetingContext {
  freightMode: string;
  consignmentType: string;
  customerId: string;
  originCountry: string;
  destCountry: string;
}

/**
 * Exported so Studio's event dispatch narrows automations by exactly the same
 * rules clearance narrows workflows — one vocabulary, the way studio/conditions.ts
 * already shares operator semantics. An empty list means "no restriction".
 */
export function triggerMatches(triggers: any, ctx: TargetingContext): boolean {
  const check = (arr: string[] | undefined, val: string) =>
    !arr || arr.length === 0 || arr.some((x) => x.toLowerCase() === val.toLowerCase());
  return (
    check(triggers.freightModes, ctx.freightMode) &&
    check(triggers.consignmentTypes, ctx.consignmentType) &&
    check(triggers.customerIds, ctx.customerId) &&
    check(triggers.originCountries, ctx.originCountry) &&
    check(triggers.destinationCountries, ctx.destCountry)
  );
}

export function hasAnyTrigger(triggers: any): boolean {
  return Boolean(
    triggers.freightModes?.length || triggers.consignmentTypes?.length || triggers.customerIds?.length ||
    triggers.originCountries?.length || triggers.destinationCountries?.length,
  );
}

/**
 * Resolves which workflow governs a BRAND NEW shipment — called once at
 * creation only (a workflow owns a case for its lifecycle; edits to a
 * workflow's triggers never reassign an already-created shipment). Ranking:
 * exact customerId match > exact freight+consignment match > tenant's
 * is_default workflow > LEGACY (no custom workflow at all, or nothing
 * matches and no default exists).
 */
export async function resolveWorkflowForNewShipment(trx: any, tenantId: string, input: NewShipmentInput): Promise<ResolvedWorkflow> {
  const rows = await trx
    .selectFrom('workflows')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('is_active', '=', true)
    .where('deleted_at', 'is', null)
    .execute();

  if (rows.length === 0) return synthesizeLegacyWorkflow();

  const ctx = {
    freightMode: FREIGHT_MODE_MAP[input.type] ?? 'sea',
    consignmentType: input.consignmentType,
    customerId: input.customerId,
    originCountry: (input.originPort || '').slice(0, 2).toUpperCase(),
    destCountry: (input.destPort || '').slice(0, 2).toUpperCase(),
  };

  const parsed = rows.map((w: any) => ({ ...w, triggers: typeof w.triggers === 'string' ? JSON.parse(w.triggers) : w.triggers }));

  const customerMatch = parsed.find((w: any) => w.triggers.customerIds?.length && triggerMatches(w.triggers, ctx));
  const freightConsignmentMatch = parsed.find((w: any) =>
    w.triggers.freightModes?.length && w.triggers.consignmentTypes?.length && triggerMatches(w.triggers, ctx));
  const anyTriggerMatch = parsed.find((w: any) => hasAnyTrigger(w.triggers) && triggerMatches(w.triggers, ctx));
  const defaultWorkflow = parsed.find((w: any) => w.is_default);

  const chosen = customerMatch ?? freightConsignmentMatch ?? anyTriggerMatch ?? defaultWorkflow;
  if (!chosen) return synthesizeLegacyWorkflow();

  const steps = await loadWorkflowSteps(trx, tenantId, chosen.id);
  if (steps.length === 0) return synthesizeLegacyWorkflow();
  return { kind: 'CUSTOM', workflowId: chosen.id, steps };
}

/** Lowest-step_order step with isStart=true, falling back to the lowest step_order overall. */
export function pickStartStep(steps: ResolvedStep[]): ResolvedStep {
  const starters = steps.filter((s) => s.isStart).sort((a, b) => a.order - b.order);
  if (starters.length > 0) return starters[0];
  return [...steps].sort((a, b) => a.order - b.order)[0];
}

/** One condition's verdict, kept so a run record can name which one blocked. */
export interface ConditionOutcome {
  label: string;
  field: string;
  operator: string;
  passed: boolean;
}

export interface EntryConditionResult {
  valid: boolean;
  failures: string[];
  /** Every condition in evaluation order, passed and failed alike — a dry run
   *  needs the passes too, not just the reasons it stopped. */
  outcomes: ConditionOutcome[];
}

/**
 * Evaluates a step's entryConditions against a shipment row + its documents.
 * `field` starting with "document:" preserves the old required-documents
 * check exactly (documents.status === 'VERIFIED'); otherwise `field` is a
 * shipment_cases column name. An unknown field name fails safe (treated as
 * unmet, not silently passed) rather than letting a typo'd condition let
 * everything through.
 */
export function evaluateEntryConditions(
  shipment: Record<string, any>,
  documents: { type: string; status: string }[],
  conditions: FieldCondition[],
): EntryConditionResult {
  const failures: string[] = [];
  const outcomes: ConditionOutcome[] = [];

  for (const cond of conditions) {
    if (cond.field.startsWith('document:')) {
      const docType = cond.field.slice('document:'.length);
      const doc = documents.find((d) => d.type === docType);
      const passed = !!doc && doc.status === 'VERIFIED';
      const label = cond.label || `${docType} document must be verified`;
      if (!passed) failures.push(label);
      outcomes.push({ label, field: cond.field, operator: 'verified', passed });
      continue;
    }

    // Operator semantics live in studio/conditions.ts so this engine and Studio
    // share one vocabulary rather than two copies that drift.
    const { ok } = applyOperator(shipment[cond.field], cond.operator, cond.value);
    const label = cond.label || `"${cond.field}" ${cond.operator} ${cond.value ?? ''}`.trim();
    if (!ok) failures.push(label);
    outcomes.push({ label, field: cond.field, operator: cond.operator, passed: ok });
  }

  return { valid: failures.length === 0, failures, outcomes };
}
