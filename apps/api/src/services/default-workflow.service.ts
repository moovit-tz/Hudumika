import crypto from 'node:crypto';
import { DEFAULT_WORKFLOWS, type DefaultWorkflowDef } from '../config/default-workflows.js';
import type { FieldCondition, AutoComm } from '@hudumika/types';

/**
 * Installs the platform default workflows (Sea/Air/Road/Sea-transit — see
 * config/default-workflows.ts) into a tenant. Called:
 *   • at tenant creation, next to GLService.seedChartOfAccounts, so every new
 *     tenant starts with a working set of mode-specific workflows; and
 *   • by scripts/seed-default-workflows.ts to backfill existing tenants.
 *
 * Idempotent AND deletion-respecting: a default is (re)installed only if the
 * tenant has NO row for that template_key at all — deleted or live. So a tenant
 * that deleted the default after building its own is never re-seeded, exactly
 * the lifecycle the product calls for.
 *
 * Accepts either the shared `db` or an open transaction so it can enrol inside
 * the tenant-creation transaction (RLS `app.tenant_id` already set) or run
 * stand-alone from a script.
 */
export class DefaultWorkflowService {
  static async seedForTenant(dbOrTrx: any, tenantId: string, createdBy: string | null = null): Promise<{ created: string[]; skipped: string[] }> {
    const created: string[] = [];
    const skipped: string[] = [];
    for (const def of DEFAULT_WORKFLOWS) {
      const installed = await this.installOne(dbOrTrx, tenantId, createdBy, def);
      (installed ? created : skipped).push(def.templateKey);
    }
    return { created, skipped };
  }

  private static async installOne(trx: any, tenantId: string, createdBy: string | null, def: DefaultWorkflowDef): Promise<boolean> {
    // Existence check spans deleted rows on purpose — never resurrect a default
    // a tenant deliberately removed.
    const existing = await trx.selectFrom('workflows').select('id')
      .where('tenant_id', '=', tenantId)
      .where('template_key', '=', def.templateKey)
      .executeTakeFirst();
    if (existing) return false;

    const now = new Date();
    const wf = await trx.insertInto('workflows').values({
      tenant_id: tenantId,
      name: def.name,
      description: def.description,
      is_active: true,
      is_default: false,
      is_system: true,
      template_key: def.templateKey,
      triggers: JSON.stringify({
        freightModes: def.freightModes,
        consignmentTypes: def.consignmentTypes,
        customerIds: [], originCountries: [], destinationCountries: [], isDefault: false,
      }),
      created_by: createdBy,
      created_at: now, updated_at: now,
    }).returning('id').executeTakeFirstOrThrow();

    // Pre-mint each step's UUID so next_step_ids can reference siblings.
    const keyToId: Record<string, string> = {};
    for (const s of def.steps) keyToId[s.key] = crypto.randomUUID();

    let condSeq = 0, commSeq = 0;
    for (const [order, s] of def.steps.entries()) {
      const entryConditions: FieldCondition[] = (s.conditions ?? []).map((c) => ({
        id: `${def.templateKey}-c${++condSeq}`,
        field: c.field, operator: c.operator, label: c.label, value: c.value,
      }));
      const autoComms: AutoComm[] = (s.comms ?? []).map((c) => ({
        id: `${def.templateKey}-m${++commSeq}`,
        channel: c.channel, recipient: c.recipient,
        subject: c.subject ?? '', template: c.template,
        delayMinutes: c.delayMinutes ?? 0, customEmail: '',
      }));

      await trx.insertInto('workflow_steps').values({
        id: keyToId[s.key],
        tenant_id: tenantId,
        workflow_id: wf.id,
        name: s.name,
        description: s.description,
        step_order: order,
        is_start: !!s.isStart,
        is_terminal: !!s.isTerminal,
        next_step_ids: JSON.stringify(s.next.map((k) => keyToId[k]).filter(Boolean)),
        entry_conditions: JSON.stringify(entryConditions),
        auto_comms: JSON.stringify(autoComms),
        sla_hours: s.slaHours,
        color: s.color,
        created_at: now, updated_at: now,
      }).execute();
    }
    return true;
  }
}
