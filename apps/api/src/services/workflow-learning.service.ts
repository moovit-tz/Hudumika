import { dbPlatform } from '../db/client.js';
import { WorkflowTemplateService } from './workflow-template.service.js';
import type { DefaultStepDef } from '../config/default-workflows.js';

/**
 * Self-learning workflow evolution.
 *
 * The platform ships default workflows as templates (migration 218); tenants
 * adopt and then edit them. This service mines those edits across ALL tenants
 * and proposes a consensus next version of the template for the superadmin to
 * approve — the tenant admin can watch the same evidence form.
 *
 * It is deliberately a *transparent* learner, not a black box:
 *   1. diff — each tenant workflow is diffed against the exact template version
 *      it descends from (origin_template_key/version), producing typed edit
 *      events (step added/removed, condition added/removed, SLA changed);
 *   2. aggregate — edits are counted by DISTINCT tenant (frequent-pattern
 *      counting), giving each a support = tenants-with-this-edit / tenants-who-
 *      edited-this-template; every count is written to workflow_learning_signals
 *      so the recommendation can always be audited back to real tenants;
 *   3. synthesise — edits whose support clears the threshold are applied to the
 *      base template to build a proposed next version, filed as `pending` with
 *      its confidence and the signals that justified it.
 *
 * Approval publishes the proposal as a real new template version; rejection
 * archives it. Nothing is ever auto-published — a machine proposes, a human
 * decides.
 */

// A pattern must recur across at least this many tenants AND clear this share
// of the tenants who edited the template before it is proposed. Low floors
// suit a young platform; raise them as adoption grows.
const MIN_SUPPORT_TENANTS = 2;
const MIN_SUPPORT_PCT = 0.5;
const MIN_EDITING_TENANTS = 2;

type EditType = 'STEP_ADDED' | 'STEP_REMOVED' | 'CONDITION_ADDED' | 'CONDITION_REMOVED' | 'SLA_CHANGED';
interface EditEvent { editType: EditType; stepSignature: string; anchorAfter: string; detail: Record<string, any>; }

interface NormStep { name: string; norm: string; fields: string[]; sla: number; isStart: boolean; isTerminal: boolean; }

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function parseArr(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

/** Base template steps → the normalized comparison shape. */
function baseToNorm(steps: DefaultStepDef[]): NormStep[] {
  return steps.map((s, i) => ({
    name: s.name, norm: norm(s.name),
    fields: (s.conditions ?? []).map((c) => c.field),
    sla: s.slaHours, isStart: i === 0, isTerminal: !!s.isTerminal,
  }));
}

/** A tenant's live workflow_steps rows → the same normalized shape. */
function rowsToNorm(rows: any[]): NormStep[] {
  const sorted = [...rows].sort((a, b) => a.step_order - b.step_order);
  return sorted.map((r, i) => ({
    name: r.name, norm: norm(r.name),
    fields: parseArr(r.entry_conditions).map((c: any) => c.field),
    sla: r.sla_hours ?? 24, isStart: i === 0, isTerminal: !!r.is_terminal,
  }));
}

/** Typed diff of a tenant workflow against the template it descends from. */
function diff(base: NormStep[], tenant: NormStep[]): EditEvent[] {
  const events: EditEvent[] = [];
  const baseByNorm = new Map(base.map((s) => [s.norm, s]));
  const tenantByNorm = new Map(tenant.map((s) => [s.norm, s]));

  // Steps the tenant added (not in base), with the base-anchored insertion point.
  tenant.forEach((s, i) => {
    if (baseByNorm.has(s.norm)) return;
    let anchor = '';
    for (let j = i - 1; j >= 0; j--) { if (baseByNorm.has(tenant[j].norm)) { anchor = tenant[j].norm; break; } }
    events.push({ editType: 'STEP_ADDED', stepSignature: s.norm, anchorAfter: anchor, detail: { name: s.name } });
  });

  // Steps the tenant removed (in base, not in tenant).
  for (const s of base) {
    if (!tenantByNorm.has(s.norm)) events.push({ editType: 'STEP_REMOVED', stepSignature: s.norm, anchorAfter: '', detail: { name: s.name } });
  }

  // Per shared step: condition + SLA changes.
  for (const s of base) {
    const t = tenantByNorm.get(s.norm);
    if (!t) continue;
    const baseFields = new Set(s.fields), tenantFields = new Set(t.fields);
    for (const f of tenantFields) if (!baseFields.has(f)) events.push({ editType: 'CONDITION_ADDED', stepSignature: s.norm, anchorAfter: '', detail: { field: f } });
    for (const f of baseFields) if (!tenantFields.has(f)) events.push({ editType: 'CONDITION_REMOVED', stepSignature: s.norm, anchorAfter: '', detail: { field: f } });
    if (t.sla !== s.sla) events.push({ editType: 'SLA_CHANGED', stepSignature: s.norm, anchorAfter: '', detail: { from: s.sla, to: t.sla } });
  }
  return events;
}

const editKey = (e: EditEvent) => `${e.editType}|${e.stepSignature}|${e.anchorAfter}`;

interface AggSignal { editType: EditType; stepSignature: string; anchorAfter: string; detail: Record<string, any>; tenants: Set<string>; }

export class WorkflowLearningService {
  /** Run the full pipeline for every template. Returns a per-template summary. */
  static async analyze(): Promise<Array<{ templateKey: string; editingTenants: number; signals: number; proposal: 'created' | 'none' }>> {
    const published = await WorkflowTemplateService.listPublished();
    const summary: Array<{ templateKey: string; editingTenants: number; signals: number; proposal: 'created' | 'none' }> = [];

    for (const tpl of published) {
      const templateKey = tpl.def.templateKey;
      const base = baseToNorm(tpl.def.steps as DefaultStepDef[]);

      // Every tenant workflow descended from this template.
      const wfs = await dbPlatform.selectFrom('workflows').select(['id', 'tenant_id'])
        .where('origin_template_key', '=', templateKey).where('deleted_at', 'is', null).execute();

      const agg = new Map<string, AggSignal>();
      const editingTenants = new Set<string>();

      for (const wf of wfs) {
        const rows = await dbPlatform.selectFrom('workflow_steps').selectAll().where('workflow_id', '=', wf.id).execute();
        const events = diff(base, rowsToNorm(rows));
        if (events.length === 0) continue;
        editingTenants.add(wf.tenant_id);
        // Each edit counts once per tenant even if the tenant repeats it.
        const seen = new Set<string>();
        for (const e of events) {
          const k = editKey(e);
          if (seen.has(k)) continue;
          seen.add(k);
          const cur = agg.get(k) ?? { editType: e.editType, stepSignature: e.stepSignature, anchorAfter: e.anchorAfter, detail: e.detail, tenants: new Set<string>() };
          cur.tenants.add(wf.tenant_id);
          agg.set(k, cur);
        }
      }

      const denom = editingTenants.size || 1;

      // Persist signals (replace this template's prior snapshot).
      await dbPlatform.deleteFrom('workflow_learning_signals').where('template_key', '=', templateKey).execute();
      const now = new Date();
      const signalRows = [...agg.values()].map((s) => ({
        template_key: templateKey, base_version: tpl.version, edit_type: s.editType, step_signature: s.stepSignature,
        anchor_after: s.anchorAfter, detail: JSON.stringify(s.detail), support_tenants: s.tenants.size,
        editing_tenants: editingTenants.size, support_pct: Number((s.tenants.size / denom).toFixed(4)), computed_at: now,
      }));
      if (signalRows.length) await dbPlatform.insertInto('workflow_learning_signals').values(signalRows).execute();

      // Dominant edits = enough tenants AND enough share.
      const dominant = [...agg.values()].filter((s) => s.tenants.size >= MIN_SUPPORT_TENANTS && (s.tenants.size / denom) >= MIN_SUPPORT_PCT);

      let proposal: 'created' | 'none' = 'none';
      if (editingTenants.size >= MIN_EDITING_TENANTS && dominant.length > 0) {
        await this.buildProposal(templateKey, tpl, base, dominant, editingTenants.size, denom);
        proposal = 'created';
      } else {
        // No live consensus → retire any stale pending proposal.
        await dbPlatform.updateTable('workflow_template_proposals').set({ status: 'superseded' })
          .where('template_key', '=', templateKey).where('status', '=', 'pending').execute();
      }
      summary.push({ templateKey, editingTenants: editingTenants.size, signals: signalRows.length, proposal });
    }
    return summary;
  }

  /** Apply the dominant edits to the base template and file a pending proposal. */
  private static async buildProposal(
    templateKey: string, tpl: { id: string; def: any; version: number }, base: NormStep[],
    dominant: AggSignal[], editingTenants: number, denom: number,
  ): Promise<void> {
    // Work on a mutable copy of the base step defs.
    const steps: DefaultStepDef[] = (tpl.def.steps as DefaultStepDef[]).map((s) => ({ ...s, conditions: [...(s.conditions ?? [])], comms: [...(s.comms ?? [])] }));

    const removeNorms = new Set(dominant.filter((d) => d.editType === 'STEP_REMOVED').map((d) => d.stepSignature));
    const condAdds = dominant.filter((d) => d.editType === 'CONDITION_ADDED');
    const condRemoves = dominant.filter((d) => d.editType === 'CONDITION_REMOVED');
    const slaChanges = dominant.filter((d) => d.editType === 'SLA_CHANGED');
    const stepAdds = dominant.filter((d) => d.editType === 'STEP_ADDED');

    let working: DefaultStepDef[] = steps.filter((s, i) => {
      const isTerminal = !!s.isTerminal, isStart = i === 0;
      return !(removeNorms.has(norm(s.name)) && !isTerminal && !isStart); // never drop start/terminal
    });

    // Condition edits on surviving steps.
    for (const s of working) {
      const n = norm(s.name);
      for (const c of condAdds) if (c.stepSignature === n) {
        const field = c.detail.field as string;
        if (!(s.conditions ?? []).some((x) => x.field === field)) {
          (s.conditions ??= []).push({ field, operator: 'required', label: labelFor(field) });
        }
      }
      for (const c of condRemoves) if (c.stepSignature === n) {
        s.conditions = (s.conditions ?? []).filter((x) => x.field !== c.detail.field);
      }
      const sla = slaChanges.find((c) => c.stepSignature === n);
      if (sla && typeof sla.detail.to === 'number') s.slaHours = sla.detail.to;
    }

    // Inserted steps, placed after their anchor (or at the front if anchor='').
    let learnedSeq = 0;
    for (const a of stepAdds) {
      const newStep: DefaultStepDef = {
        key: `learned-${++learnedSeq}`, name: a.detail.name || 'New step',
        description: 'Added from tenant workflow edits.', next: [], conditions: [], comms: [], slaHours: 24, color: '#64748b',
      };
      const idx = a.anchorAfter ? working.findIndex((s) => norm(s.name) === a.anchorAfter) : -1;
      if (idx >= 0) working.splice(idx + 1, 0, newStep); else working.unshift(newStep);
    }

    // Re-key and re-link into a clean linear chain (superadmin can branch it
    // afterward). Exactly one start, one terminal.
    working = working.map((s, i) => ({ ...s, key: `s${i}` }));
    working.forEach((s, i) => { s.isStart = i === 0; s.isTerminal = i === working.length - 1; s.next = i < working.length - 1 ? [`s${i + 1}`] : []; });

    const proposedVersion = tpl.version + 1;
    const confidence = Number((dominant.reduce((a, d) => a + d.tenants.size / denom, 0) / dominant.length).toFixed(4));
    const rationale = dominant.map((d) => ({ editType: d.editType, stepSignature: d.stepSignature, anchorAfter: d.anchorAfter, detail: d.detail, supportTenants: d.tenants.size, supportPct: Number((d.tenants.size / denom).toFixed(4)) }));

    // One live proposal per key: supersede any older pending, then insert.
    await dbPlatform.updateTable('workflow_template_proposals').set({ status: 'superseded' })
      .where('template_key', '=', templateKey).where('status', '=', 'pending').execute();

    await dbPlatform.insertInto('workflow_template_proposals').values({
      template_key: templateKey, base_version: tpl.version, proposed_version: proposedVersion,
      name: tpl.def.name, description: tpl.def.description,
      freight_modes: JSON.stringify(tpl.def.freightModes), consignment_types: JSON.stringify(tpl.def.consignmentTypes),
      steps: JSON.stringify(working), rationale: JSON.stringify(rationale),
      supporting_tenants: Math.max(...dominant.map((d) => d.tenants.size)), editing_tenants: editingTenants,
      confidence, status: 'pending', created_at: new Date(),
    }).execute();
  }

  // ── Read surfaces ─────────────────────────────────────────────────────────
  static async listProposals(status?: string): Promise<any[]> {
    let q = dbPlatform.selectFrom('workflow_template_proposals').selectAll().orderBy('created_at', 'desc');
    if (status) q = q.where('status', '=', status);
    const rows = await q.execute();
    return rows.map(proposalToJson);
  }

  static async getSignals(templateKey?: string): Promise<any[]> {
    let q = dbPlatform.selectFrom('workflow_learning_signals').selectAll().orderBy('support_pct', 'desc');
    if (templateKey) q = q.where('template_key', '=', templateKey);
    const rows = await q.execute();
    return rows.map((r) => ({
      templateKey: r.template_key, baseVersion: r.base_version, editType: r.edit_type, stepSignature: r.step_signature,
      anchorAfter: r.anchor_after || null, detail: parseArr(r.detail).length ? parseArr(r.detail) : (typeof r.detail === 'string' ? safeObj(r.detail) : r.detail),
      supportTenants: r.support_tenants, editingTenants: r.editing_tenants, supportPct: Number(r.support_pct),
      computedAt: new Date(r.computed_at).toISOString(),
    }));
  }

  /** Approve → publish as a real new template version (source='learned'). */
  static async approve(proposalId: string, decidedBy: string | null): Promise<{ version: number }> {
    const p = await dbPlatform.selectFrom('workflow_template_proposals').selectAll().where('id', '=', proposalId).executeTakeFirst();
    if (!p) throw new Error('Proposal not found');
    if (p.status !== 'pending') throw new Error(`Proposal already ${p.status}`);

    const res = await WorkflowTemplateService.publishNewVersion(p.template_key, {
      name: p.name, description: p.description,
      freightModes: parseArr(p.freight_modes), consignmentTypes: parseArr(p.consignment_types),
      steps: parseArr(p.steps), source: 'learned',
    }, decidedBy);

    await dbPlatform.updateTable('workflow_template_proposals')
      .set({ status: 'approved', decided_by: decidedBy, decided_at: new Date() })
      .where('id', '=', proposalId).execute();
    return { version: res.version };
  }

  static async reject(proposalId: string, decidedBy: string | null, note?: string): Promise<void> {
    const p = await dbPlatform.selectFrom('workflow_template_proposals').select(['status']).where('id', '=', proposalId).executeTakeFirst();
    if (!p) throw new Error('Proposal not found');
    if (p.status !== 'pending') throw new Error(`Proposal already ${p.status}`);
    await dbPlatform.updateTable('workflow_template_proposals')
      .set({ status: 'rejected', decided_by: decidedBy, decided_at: new Date(), decision_note: note ?? null })
      .where('id', '=', proposalId).execute();
  }
}

function labelFor(field: string): string {
  if (field.startsWith('document:')) return `${field.slice('document:'.length)} verified`;
  return `${field.replace(/_/g, ' ')} recorded`;
}
function safeObj(s: string): any { try { return JSON.parse(s); } catch { return {}; } }
function proposalToJson(r: any) {
  return {
    id: r.id, templateKey: r.template_key, baseVersion: r.base_version, proposedVersion: r.proposed_version,
    name: r.name, description: r.description, freightModes: parseArr(r.freight_modes), consignmentTypes: parseArr(r.consignment_types),
    steps: parseArr(r.steps), rationale: parseArr(r.rationale), supportingTenants: r.supporting_tenants,
    editingTenants: r.editing_tenants, confidence: Number(r.confidence), status: r.status,
    createdAt: new Date(r.created_at).toISOString(), decidedBy: r.decided_by,
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null, decisionNote: r.decision_note,
  };
}
