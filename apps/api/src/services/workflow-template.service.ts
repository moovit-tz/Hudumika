import crypto from 'node:crypto';
import { dbPlatform } from '../db/client.js';
import { DEFAULT_WORKFLOWS, type DefaultWorkflowDef, type DefaultStepDef } from '../config/default-workflows.js';
import type { FieldCondition, AutoComm } from '@hudumika/types';

/**
 * The platform workflow-template library (migration 218). Templates are
 * global, versioned, superadmin-managed rows; a tenant sees the published ones
 * and clones one into its own `workflows` with "Use template". This service
 * owns three things:
 *
 *   1. the shared "materialise a workflow-def into a tenant's workflows/steps"
 *      insert (used by both seeding and adoption);
 *   2. per-tenant seeding of the platform defaults — now sourced from the
 *      templates table (so a superadmin who publishes v2 changes what new
 *      tenants get), falling back to the code registry if the table is empty;
 *   3. superadmin CRUD + versioning, and the tenant-facing adopt.
 */

export interface TemplateDef {
  templateKey: string;
  name: string;
  description: string;
  freightModes: string[];
  consignmentTypes: string[];
  steps: DefaultStepDef[];
}

function parseArr(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

/** Convert a stored template row into the def shape the installer consumes. */
function rowToDef(row: any): TemplateDef {
  return {
    templateKey: row.template_key,
    name: row.name,
    description: row.description ?? '',
    freightModes: parseArr(row.freight_modes),
    consignmentTypes: parseArr(row.consignment_types),
    steps: parseArr(row.steps),
  };
}

export class WorkflowTemplateService {
  /**
   * Inserts one workflow-def into a tenant's real workflows/workflow_steps.
   * Shared by seeding (skipIfExists by template_key, is_system) and adoption
   * (always create, tenant-owned). Returns whether a row was created.
   */
  static async installDef(
    trx: any,
    tenantId: string,
    createdBy: string | null,
    def: TemplateDef,
    opts: { isSystem: boolean; templateKey: string | null; originVersion: number | null; skipIfTemplateExists?: boolean; nameOverride?: string; isActive?: boolean },
  ): Promise<{ created: boolean; workflowId?: string }> {
    if (opts.skipIfTemplateExists && opts.templateKey) {
      // Existence spans deleted rows on purpose — never resurrect a default a
      // tenant deliberately removed.
      const existing = await trx.selectFrom('workflows').select('id')
        .where('tenant_id', '=', tenantId).where('template_key', '=', opts.templateKey).executeTakeFirst();
      if (existing) return { created: false };
    }

    const now = new Date();
    const wf = await trx.insertInto('workflows').values({
      tenant_id: tenantId,
      name: opts.nameOverride ?? def.name,
      description: def.description,
      is_active: opts.isActive ?? true,
      is_default: false,
      is_system: opts.isSystem,
      template_key: opts.templateKey,
      origin_template_key: def.templateKey,
      origin_template_version: opts.originVersion,
      triggers: JSON.stringify({
        freightModes: def.freightModes, consignmentTypes: def.consignmentTypes,
        customerIds: [], originCountries: [], destinationCountries: [], isDefault: false,
      }),
      created_by: createdBy,
      created_at: now, updated_at: now,
    }).returning('id').executeTakeFirstOrThrow();

    const keyToId: Record<string, string> = {};
    for (const s of def.steps) keyToId[s.key] = crypto.randomUUID();

    let condSeq = 0, commSeq = 0;
    for (const [order, s] of def.steps.entries()) {
      const entryConditions: FieldCondition[] = (s.conditions ?? []).map((c) => ({
        id: `${def.templateKey}-c${++condSeq}`, field: c.field, operator: c.operator, label: c.label, value: c.value,
      }));
      const autoComms: AutoComm[] = (s.comms ?? []).map((c) => ({
        id: `${def.templateKey}-m${++commSeq}`, channel: c.channel, recipient: c.recipient,
        subject: c.subject ?? '', template: c.template, delayMinutes: c.delayMinutes ?? 0, customEmail: '',
      }));
      await trx.insertInto('workflow_steps').values({
        id: keyToId[s.key], tenant_id: tenantId, workflow_id: wf.id,
        name: s.name, description: s.description, step_order: order,
        is_start: !!s.isStart, is_terminal: !!s.isTerminal,
        next_step_ids: JSON.stringify(s.next.map((k) => keyToId[k]).filter(Boolean)),
        entry_conditions: JSON.stringify(entryConditions),
        auto_comms: JSON.stringify(autoComms),
        sla_hours: s.slaHours, color: s.color, created_at: now, updated_at: now,
      }).execute();
    }
    return { created: true, workflowId: wf.id };
  }

  /** Latest published version of every template_key (what tenants see / new tenants get). */
  static async listPublished(trx: any = dbPlatform): Promise<Array<{ id: string; def: TemplateDef; version: number; source: string; isSystem: boolean }>> {
    const rows = await trx.selectFrom('workflow_templates').selectAll()
      .where('status', '=', 'published').orderBy('template_key').orderBy('version', 'desc').execute();
    const seen = new Set<string>();
    const out: Array<{ id: string; def: TemplateDef; version: number; source: string; isSystem: boolean }> = [];
    for (const r of rows) {
      if (seen.has(r.template_key)) continue;   // keep only the highest version per key
      seen.add(r.template_key);
      out.push({ id: r.id, def: rowToDef(r), version: r.version, source: r.source, isSystem: r.is_system });
    }
    return out;
  }

  /**
   * Seeds the platform defaults into a tenant from the templates table (latest
   * published per key), falling back to the code registry if the table has not
   * been populated yet. Idempotent + deletion-respecting via installDef's
   * skip-by-template_key. This is what the tenant-creation hooks call.
   */
  static async seedForTenant(trx: any, tenantId: string, createdBy: string | null = null): Promise<{ created: string[]; skipped: string[] }> {
    const created: string[] = [];
    const skipped: string[] = [];

    const published = await this.listPublished(trx).catch(() => []);
    const source: Array<{ def: TemplateDef; version: number }> = published.length
      ? published.map((p) => ({ def: p.def, version: p.version }))
      : DEFAULT_WORKFLOWS.map((d: DefaultWorkflowDef) => ({ def: d, version: 1 }));

    for (const { def, version } of source) {
      const res = await this.installDef(trx, tenantId, createdBy, def, {
        isSystem: true, templateKey: def.templateKey, originVersion: version, skipIfTemplateExists: true,
      });
      (res.created ? created : skipped).push(def.templateKey);
    }
    return { created, skipped };
  }

  /** Tenant adopts a specific template → a fully tenant-owned, editable workflow. */
  static async adopt(trx: any, tenantId: string, templateId: string, createdBy: string | null): Promise<{ workflowId: string; name: string }> {
    const row = await trx.selectFrom('workflow_templates').selectAll().where('id', '=', templateId).executeTakeFirst();
    if (!row) throw new Error('Template not found');
    const def = rowToDef(row);

    // Suffix the name if the tenant already has a live workflow by that name.
    const clash = await trx.selectFrom('workflows').select('id')
      .where('tenant_id', '=', tenantId).where('name', '=', def.name).where('deleted_at', 'is', null).executeTakeFirst();
    const name = clash ? `${def.name} (copy)` : def.name;

    const res = await this.installDef(trx, tenantId, createdBy, def, {
      isSystem: false, templateKey: null, originVersion: row.version, nameOverride: name, isActive: true,
    });
    return { workflowId: res.workflowId!, name };
  }

  // ── Superadmin management ────────────────────────────────────────────────
  static async listAll(): Promise<any[]> {
    const rows = await dbPlatform.selectFrom('workflow_templates').selectAll()
      .orderBy('template_key').orderBy('version', 'desc').execute();
    return rows.map((r) => ({
      id: r.id, templateKey: r.template_key, version: r.version, name: r.name, description: r.description,
      freightModes: parseArr(r.freight_modes), consignmentTypes: parseArr(r.consignment_types),
      steps: parseArr(r.steps), status: r.status, isSystem: r.is_system, source: r.source,
      createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  /** Create a brand-new template key at version 1 (superadmin authoring). */
  static async create(input: TemplateDef & { source?: string }, createdBy: string | null): Promise<{ id: string }> {
    const now = new Date();
    const row = await dbPlatform.insertInto('workflow_templates').values({
      template_key: input.templateKey, version: 1, name: input.name, description: input.description ?? '',
      freight_modes: JSON.stringify(input.freightModes ?? []), consignment_types: JSON.stringify(input.consignmentTypes ?? []),
      steps: JSON.stringify(input.steps ?? []), status: 'published', is_system: false,
      source: input.source ?? 'superadmin', created_by: createdBy, created_at: now, updated_at: now,
    }).returning('id').executeTakeFirstOrThrow();
    return { id: row.id };
  }

  /** Publish the next version of an existing template key. */
  static async publishNewVersion(templateKey: string, input: Partial<TemplateDef> & { source?: string }, createdBy: string | null): Promise<{ id: string; version: number }> {
    const latest = await dbPlatform.selectFrom('workflow_templates').selectAll()
      .where('template_key', '=', templateKey).orderBy('version', 'desc').executeTakeFirst();
    if (!latest) throw new Error('Template key not found');
    const base = rowToDef(latest);
    const version = latest.version + 1;
    const now = new Date();
    const row = await dbPlatform.insertInto('workflow_templates').values({
      template_key: templateKey, version,
      name: input.name ?? base.name, description: input.description ?? base.description,
      freight_modes: JSON.stringify(input.freightModes ?? base.freightModes),
      consignment_types: JSON.stringify(input.consignmentTypes ?? base.consignmentTypes),
      steps: JSON.stringify(input.steps ?? base.steps), status: 'published', is_system: false,
      source: input.source ?? 'superadmin', created_by: createdBy, created_at: now, updated_at: now,
    }).returning('id').executeTakeFirstOrThrow();
    return { id: row.id, version };
  }

  static async setStatus(id: string, status: 'draft' | 'published' | 'archived'): Promise<void> {
    await dbPlatform.updateTable('workflow_templates').set({ status, updated_at: new Date() }).where('id', '=', id).execute();
  }
}
