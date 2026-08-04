import { z } from 'zod';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';
import { SealService } from '../services/seal.service.js';
import type { AppId } from './triggers.js';

/**
 * The catalogue of things a Studio workflow can actually do.
 *
 * **The rule this file exists to enforce: an action is a thin wrapper over an
 * existing service. It never holds business logic of its own.** The moment
 * Studio starts computing duty, deciding what a valid movement is, or choosing
 * an SLA, it has become a second implementation of an app — and the two will
 * drift. This codebase has already paid for that twice: two landed-cost
 * engines whose VAT bases diverged, and a money parser that existed in two
 * places. If an action needs logic that does not exist yet, the logic goes in
 * the owning service and the action calls it.
 *
 * Actions run under the tenant of the triggering event. Every write goes
 * through `withTenant` or an explicit `tenant_id`, per CLAUDE.md — RLS does not
 * protect these tables on its own.
 */

export interface ActionContext {
  tenantId: string;
  /** The domain event's entityId, when the trigger had one. */
  entityId: string | null;
  /** Validated trigger payload. */
  payload: Record<string, unknown>;
  /** True during a dry run: an action must not perform side effects. */
  simulate: boolean;
}

export interface ActionResult {
  ok: boolean;
  /** Human-readable outcome for the run log. Must describe what really happened. */
  detail: string;
  /** Structured output later nodes can read. */
  output?: Record<string, unknown>;
}

export interface ActionDef {
  id: string;
  app: AppId;
  label: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  /** Gate reused from the existing middleware vocabulary. */
  requiredEntitlement?: string;
  /**
   * Actions that write to a regulated ledger or file something with an
   * authority are never freely composable by a tenant admin — Studio offers
   * them only where the plan's action-gating allows. Flagged here so the
   * catalogue endpoint can withhold them from the picker.
   */
  restricted?: boolean;
  execute(ctx: ActionContext, input: any): Promise<ActionResult>;
}

const SLA_HOURS: Record<string, number> = { URGENT: 4, HIGH: 8, NORMAL: 24, LOW: 48 };

export const ACTIONS: ActionDef[] = [
  {
    id: 'notification.send_in_app',
    app: 'studio',
    label: 'Send an in-app notification',
    description: 'Delivers a notification to one user, in a chosen app\'s inbox.',
    inputSchema: z.object({
      userId: z.string().uuid(),
      app: z.string().default('clearos'),
      type: z.enum(['info', 'success', 'warning', 'security']).default('info'),
      title: z.string().min(1),
      message: z.string().optional(),
      link: z.string().optional(),
      // What the notification points at. Defaulting entityId to the event's own
      // entity is wrong whenever the notification is about something else — a
      // trip notification must reference the trip, not the shipment that
      // triggered it — so all three are explicit.
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      entityLabel: z.string().optional(),
    }),
    async execute(ctx, input) {
      if (ctx.simulate) return { ok: true, detail: `Would notify user ${input.userId} in ${input.app}.` };
      await NotificationService.createNotification({
        tenantId: ctx.tenantId,
        userId: input.userId,
        app: input.app,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        entityType: input.entityType,
        entityId: input.entityId ?? ctx.entityId ?? undefined,
        entityLabel: input.entityLabel,
      });
      return { ok: true, detail: `Notified user ${input.userId} in ${input.app}.` };
    },
  },

  {
    id: 'support.create_ticket',
    app: 'bliss',
    label: 'Raise a support ticket',
    description: 'Opens a Bliss ticket, the same way the manual "Raise ticket" button does.',
    inputSchema: z.object({
      // support_tickets.customer_id is NOT NULL — declaring this optional made
      // the action fail at insert time with a raw Postgres error instead of a
      // readable validation message.
      customerId: z.string().uuid(),
      subject: z.string().min(1),
      description: z.string().default(''),
      priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
      category: z.string().default('General'),
      tags: z.array(z.string()).default([]),
      /**
       * Suppresses a duplicate while a matching ticket is still open. The
       * existing SLA-breach subscriber does this inline; making it an input
       * keeps that protection when the rule moves into Studio.
       */
      dedupeOnOpenSubjectLike: z.string().optional(),
    }),
    async execute(ctx, input) {
      return withTenant(ctx.tenantId, async (trx) => {
        if (input.dedupeOnOpenSubjectLike) {
          const existing = await trx.selectFrom('support_tickets')
            .select('id')
            .where('tenant_id', '=', ctx.tenantId)
            .where('subject', 'like', input.dedupeOnOpenSubjectLike)
            .where('status', '!=', 'CLOSED')
            .executeTakeFirst();
          if (existing) return { ok: true, detail: `Skipped — ticket ${existing.id} is already open for this.` };
        }
        if (ctx.simulate) return { ok: true, detail: `Would open a ${input.priority} ticket: "${input.subject}".` };

        const row = await trx.insertInto('support_tickets').values({
          tenant_id: ctx.tenantId,
          customer_id: input.customerId,
          ref_number: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
          subject: input.subject,
          description: input.description,
          channel: 'SYSTEM',
          priority: input.priority,
          category: input.category,
          status: 'OPEN',
          tags: JSON.stringify(input.tags),
          sla_deadline: new Date(Date.now() + (SLA_HOURS[input.priority] ?? 24) * 3600_000),
        }).returning('id').executeTakeFirstOrThrow();

        return { ok: true, detail: `Opened ticket ${row.id}.`, output: { ticketId: row.id } };
      });
    },
  },

  {
    id: 'finance.record_expense',
    app: 'finops',
    label: 'Record an expense against a shipment',
    description: 'Books a cost line. The amount must be supplied — this never derives one.',
    inputSchema: z.object({
      shipmentId: z.string().uuid(),
      category: z.string().min(1),
      label: z.string().min(1),
      amountTzs: z.number().positive(),
      /** Skips when a line already exists in this category for the shipment. */
      onlyIfNoneInCategory: z.boolean().default(true),
    }),
    async execute(ctx, input) {
      return withTenant(ctx.tenantId, async (trx) => {
        if (input.onlyIfNoneInCategory) {
          const already = await trx.selectFrom('expenses')
            .select('id')
            .where('tenant_id', '=', ctx.tenantId)
            .where('shipment_id', '=', input.shipmentId)
            .where('category', '=', input.category)
            .executeTakeFirst();
          if (already) return { ok: true, detail: `Skipped — a ${input.category} line already exists on this shipment.` };
        }
        if (ctx.simulate) return { ok: true, detail: `Would record ${input.category} of TZS ${input.amountTzs.toLocaleString()}.` };

        const row = await trx.insertInto('expenses').values({
          tenant_id: ctx.tenantId,
          shipment_id: input.shipmentId,
          category: input.category,
          label: input.label,
          amount_tzs: input.amountTzs,
          is_revenue: false,
          recorded_by: null,
        }).returning('id').executeTakeFirstOrThrow();

        return { ok: true, detail: `Recorded expense ${row.id} (TZS ${input.amountTzs.toLocaleString()}).`, output: { expenseId: row.id } };
      });
    },
  },

  {
    id: 'hr.log_activity',
    app: 'nexushr',
    label: 'Log activity against a staff member',
    description: 'Writes to the HR activity feed the staff detail view already reads.',
    inputSchema: z.object({
      userId: z.string().uuid(),
      action: z.string().min(1),
      module: z.string().default('Studio'),
    }),
    async execute(ctx, input) {
      if (ctx.simulate) return { ok: true, detail: `Would log "${input.action}" for user ${input.userId}.` };
      await withTenant(ctx.tenantId, trx => trx.insertInto('hr_activity_log').values({
        tenant_id: ctx.tenantId,
        user_id: input.userId,
        action: input.action,
        module: input.module,
      }).execute());
      return { ok: true, detail: `Logged activity for user ${input.userId}.` };
    },
  },

  {
    /**
     * The HR service every other app actually needs: who can take this on.
     *
     * "Assign the new consignment to a senior officer" is wrong if that officer
     * is on approved leave — which ClearOS has no way to know, because staffing
     * lives in NexusHR. This answers it from the one place that knows, and
     * returns a userId later nodes assign to.
     */
    id: 'hr.find_available_staff',
    app: 'nexushr',
    label: 'Find an available staff member',
    description: 'Picks an active staff member of a given role who is not on approved leave on the date given. Read-only.',
    inputSchema: z.object({
      role: z.string().min(1),
      /** ISO date; defaults to today. */
      onDate: z.string().optional(),
      /** Round-robin by least recently assigned rather than always the same person. */
      strategy: z.enum(['first', 'least_loaded']).default('least_loaded'),
    }),
    async execute(ctx, input) {
      const day = (input.onDate ?? new Date().toISOString().slice(0, 10));
      return withTenant(ctx.tenantId, async (trx) => {
        const candidates = await trx.selectFrom('users')
          .select(['id', 'name', 'email'])
          .where('tenant_id', '=', ctx.tenantId)
          .where('role', '=', input.role)
          .where('active', '=', true)
          .execute();

        if (candidates.length === 0) {
          return { ok: false, detail: `No active staff with role ${input.role}.` };
        }

        const away = await trx.selectFrom('hr_leaves')
          .select('user_id')
          .where('tenant_id', '=', ctx.tenantId)
          .where('status', '=', 'APPROVED')
          .where('from_date', '<=', day as any)
          .where('to_date', '>=', day as any)
          .execute();
        const awaySet = new Set(away.map(a => a.user_id));
        const free = candidates.filter(c => !awaySet.has(c.id));

        if (free.length === 0) {
          return { ok: false, detail: `All ${candidates.length} ${input.role} staff are on approved leave on ${day}.` };
        }

        let chosen = free[0];
        if (input.strategy === 'least_loaded') {
          // Fewest open shipments wins. Counted here rather than guessed.
          const load = await trx.selectFrom('shipment_cases')
            .select('assigned_to')
            .select(eb => eb.fn.countAll<string>().as('n'))
            .where('tenant_id', '=', ctx.tenantId)
            .where('assigned_to', 'in', free.map(f => f.id))
            .where('resolved_at', 'is', null)
            .groupBy('assigned_to')
            .execute();
          const byUser = new Map(load.map(l => [l.assigned_to as string, Number(l.n)]));
          chosen = [...free].sort((a, b) => (byUser.get(a.id) ?? 0) - (byUser.get(b.id) ?? 0))[0];
        }

        return {
          ok: true,
          detail: `${chosen.name ?? chosen.email} is available on ${day} (${free.length} of ${candidates.length} ${input.role} free).`,
          output: { userId: chosen.id, name: chosen.name, email: chosen.email, availableCount: free.length },
        };
      });
    },
  },

  {
    id: 'hr.post_announcement',
    app: 'nexushr',
    label: 'Post a staff announcement',
    description: 'Publishes to the NexusHR announcements board any app can raise something staff-wide.',
    inputSchema: z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      category: z.string().default('General'),
      audience: z.string().default('All Staff'),
    }),
    async execute(ctx, input) {
      if (ctx.simulate) return { ok: true, detail: `Would post "${input.title}" to ${input.audience}.` };
      const row = await withTenant(ctx.tenantId, trx => trx.insertInto('hr_announcements').values({
        tenant_id: ctx.tenantId,
        title: input.title,
        body: input.body,
        category: input.category,
        audience: input.audience,
        // Posted by an automation, not a person — left null rather than
        // attributed to whoever happened to trigger the event.
        author_id: null,
      }).returning('id').executeTakeFirstOrThrow());
      return { ok: true, detail: `Posted "${input.title}" to ${input.audience}.`, output: { announcementId: row.id } };
    },
  },

  {
    id: 'tasks.create_task',
    app: 'studio',
    label: 'Create a task for someone',
    description: 'Puts a to-do on a person\'s list — the hand-off point when a journey needs a human.',
    inputSchema: z.object({
      userId: z.string().uuid(),
      title: z.string().min(1),
      notes: z.string().optional(),
      starred: z.boolean().default(false),
      /** Skips when an open task with this exact title already exists for the user. */
      dedupeOnOpenTitle: z.boolean().default(true),
    }),
    async execute(ctx, input) {
      return withTenant(ctx.tenantId, async (trx) => {
        if (input.dedupeOnOpenTitle) {
          const existing = await trx.selectFrom('tasks')
            .select('id')
            .where('tenant_id', '=', ctx.tenantId)
            .where('user_id', '=', input.userId)
            .where('title', '=', input.title)
            .where('completed', '=', false)
            .executeTakeFirst();
          if (existing) return { ok: true, detail: `Skipped — an open task with this title already exists (${existing.id}).` };
        }
        if (ctx.simulate) return { ok: true, detail: `Would create the task "${input.title}" for user ${input.userId}.` };

        // tasks.list_id is NOT NULL — use the user's first list, and say so
        // plainly when they have none rather than inventing one.
        const list = await trx.selectFrom('task_lists')
          .select('id')
          .where('tenant_id', '=', ctx.tenantId)
          .where('user_id', '=', input.userId)
          .orderBy('created_at', 'asc')
          .executeTakeFirst();
        if (!list) return { ok: false, detail: `User ${input.userId} has no task list to add this to.` };

        const row = await trx.insertInto('tasks').values({
          tenant_id: ctx.tenantId,
          user_id: input.userId,
          list_id: list.id,
          title: input.title,
          notes: input.notes ?? null,
          starred: input.starred,
          status: 'todo',
          completed: false,
        } as any).returning('id').executeTakeFirstOrThrow();

        return { ok: true, detail: `Created task ${row.id}.`, output: { taskId: row.id } };
      });
    },
  },

  {
    id: 'seal.release_lot',
    app: 'seal',
    label: 'Release a bonded lot',
    description: 'Moves a lot out of duty suspension through SEAL\'s append-only movement ledger.',
    // Writes to a hash-chained customs ledger. Not a free-for-all action.
    restricted: true,
    requiredEntitlement: 'seal',
    inputSchema: z.object({
      lotId: z.string().uuid(),
      toCustomsStatus: z.string().min(1),
      reasonCode: z.string().min(1),
      reference: z.string().default(''),
    }),
    async execute(ctx, input) {
      if (ctx.simulate) return { ok: true, detail: `Would release lot ${input.lotId} to ${input.toCustomsStatus}.` };
      await withTenant(ctx.tenantId, (trx: Transaction<Database>) => SealService.recordMovement(trx, ctx.tenantId, {
        actorId: null,
        actorType: 'system',
        movementType: 'release',
        lotId: input.lotId,
        toCustomsStatus: input.toCustomsStatus,
        reasonCode: input.reasonCode,
        reference: input.reference,
      } as any));
      return { ok: true, detail: `Released lot ${input.lotId} to ${input.toCustomsStatus}.` };
    },
  },
];

export const ACTIONS_BY_ID = new Map(ACTIONS.map(a => [a.id, a]));
