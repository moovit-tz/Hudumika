/**
 * Leave types and balances.
 *
 * The point of all of it is the check in POST /v1/hr/leaves: until now an
 * approver was deciding on an unknown quantity of an unknown allowance, and
 * nothing stopped someone taking forty days of a twenty-eight day entitlement.
 */
import type { FastifyInstance } from 'fastify';
import { withTenant, db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { computeBalances, persistBalances } from '../services/leave-entitlement.service.js';
import { statutoryLeaveFor } from '../services/leave-statutory.service.js';

const MGMT = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const canSeeOthers = (role: string) => (MGMT as readonly string[]).includes(role) || role === 'FINANCE';

export async function leaveRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  fastify.get('/leave-types', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_leave_types').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('statutory', 'desc').orderBy('name').execute();
    });
  });

  /**
   * Seed the statutory minimums for the tenant's country.
   *
   * Never overwrites a type the tenant already has: a tenant that has raised
   * annual leave to 30 days should not be quietly returned to 28 by pressing a
   * button labelled "generate defaults".
   */
  fastify.post('/leave-types/generate-statutory', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;

    const tenant = await withTenant(user.tenant_id, trx => trx.selectFrom('tenants').select(['country', 'name'])
      .where('id', '=', user.tenant_id).executeTakeFirst());
    const country = tenant?.country ?? null;
    if (!country) {
      return reply.status(409).send({
        error: 'No country is set for this tenant, so there is no statute to apply. Set the country first.',
      });
    }
    const defaults = statutoryLeaveFor(country);
    if (defaults.length === 0) {
      return reply.status(409).send({
        error: `Statutory leave for ${country} has not been encoded yet. Only TZ is available so far.`,
        country,
      });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const created: string[] = [];
      const kept: string[] = [];

      for (const d of defaults) {
        const existing = await trx.selectFrom('hr_leave_types').select(['id', 'days_entitled'])
          .where('tenant_id', '=', user.tenant_id).where('code', '=', d.code).executeTakeFirst();
        if (existing) { kept.push(`${d.code} (${existing.days_entitled} days, left as configured)`); continue; }

        await trx.insertInto('hr_leave_types').values({
          tenant_id: user.tenant_id, code: d.code, name: d.name,
          days_entitled: String(d.daysEntitled), cycle_months: d.cycleMonths,
          full_pay_days: d.fullPayDays !== undefined ? String(d.fullPayDays) : null,
          reduced_pay_pct: d.reducedPayPct !== undefined ? String(d.reducedPayPct) : null,
          paid: d.paid, carry_forward_max: String(d.carryForwardMax),
          requires_document: d.requiresDocument, applies_to: d.appliesTo,
          min_service_months: d.minServiceMonths, statutory: d.statutory, active: true,
        } as any).execute();
        created.push(`${d.code} — ${d.note}`);
      }
      return { country, created, kept };
    });
  });

  fastify.patch('/leave-types/:id', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const b = req.body as any;

    // Validated before any write: a 4xx returned from inside withTenant returns
    // normally and the transaction commits.
    const patch: Record<string, unknown> = {};
    if (b.days_entitled !== undefined) {
      const v = Number(b.days_entitled);
      if (!Number.isFinite(v) || v < 0) return reply.status(400).send({ error: 'days_entitled must be zero or more' });
      patch.days_entitled = String(v);
    }
    if (b.cycle_months !== undefined) {
      const v = Number(b.cycle_months);
      if (!Number.isInteger(v) || v < 1 || v > 120) return reply.status(400).send({ error: 'cycle_months must be between 1 and 120' });
      patch.cycle_months = v;
    }
    if (b.carry_forward_max !== undefined) {
      const v = Number(b.carry_forward_max);
      if (!Number.isFinite(v) || v < 0) return reply.status(400).send({ error: 'carry_forward_max must be zero or more' });
      patch.carry_forward_max = String(v);
    }
    if (b.name !== undefined) {
      if (!String(b.name).trim()) return reply.status(400).send({ error: 'name cannot be empty' });
      patch.name = String(b.name).trim();
    }
    if (b.paid !== undefined) patch.paid = !!b.paid;
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.requires_document !== undefined) patch.requires_document = !!b.requires_document;
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'Nothing to update' });
    patch.updated_at = new Date();

    return withTenant(user.tenant_id, async (trx) => {
      const before = await trx.selectFrom('hr_leave_types').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!before) return reply.status(404).send({ error: 'Leave type not found' });

      const updated = await trx.updateTable('hr_leave_types').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();

      // Reducing a statutory entitlement is allowed but never silent — the
      // tenant carries the consequence and should see it stated.
      const warning = before.statutory && patch.days_entitled !== undefined
        && Number(patch.days_entitled) < Number(before.days_entitled)
        ? `${before.name} is a statutory minimum. Reducing it below ${before.days_entitled} days may not be lawful.`
        : undefined;
      return { ...updated, warning };
    });
  });

  /** A person's balances. Your own always; anyone else's needs a role. */
  fastify.get('/leave-balances', async (req, reply) => {
    const user = req.user;
    const q = req.query as any;
    const targetId = String(q.user_id ?? user.sub);
    if (targetId !== user.sub && !canSeeOthers(user.role)) {
      return reply.status(403).send({ error: 'Forbidden: you may only view your own leave balance' });
    }
    const balances = await computeBalances(user.tenant_id, targetId);
    return {
      user_id: targetId,
      balances,
      // Says plainly when there is nothing configured, rather than returning an
      // empty list that reads as "no leave owed".
      configured: balances.length > 0,
    };
  });

  /** Everyone's balances, for the approver's overview. */
  fastify.get('/leave-balances/all', { preHandler: requireRole(...MGMT, 'FINANCE') }, async (req) => {
    const user = req.user;
    const staff = await withTenant(user.tenant_id, trx => trx.selectFrom('users').select(['id', 'name', 'email'])
      .where('tenant_id', '=', user.tenant_id).where('active', '=', true)
      .orderBy('name').execute());

    const out = [];
    for (const s of staff) {
      const balances = await computeBalances(user.tenant_id, s.id);
      if (balances.length === 0) continue;
      out.push({ user_id: s.id, name: s.name, email: s.email, balances });
    }
    return out;
  });

  fastify.post('/leave-balances/recompute', { preHandler: requireRole(...MGMT) }, async (req) => {
    const user = req.user;
    const b = (req.body ?? {}) as any;
    const ids = b.user_id
      ? [String(b.user_id)]
      : (await withTenant(user.tenant_id, trx => trx.selectFrom('users').select('id')
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).execute())).map(r => r.id);

    let rows = 0;
    for (const id of ids) rows += await persistBalances(user.tenant_id, id);
    return { people: ids.length, balances: rows };
  });

  /**
   * A manual correction to a balance.
   *
   * Separate from everything else because it is the only figure a person may
   * set by hand, and the schema requires a reason — an unexplained adjustment
   * to somebody's leave cannot be distinguished from a mistake.
   */
  fastify.post('/leave-balances/adjust', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const b = req.body as any;
    const days = Number(b.days);
    const note = String(b.note ?? '').trim();

    if (!b.user_id || !b.leave_type_id) return reply.status(400).send({ error: 'user_id and leave_type_id are required' });
    if (!Number.isFinite(days) || days === 0) return reply.status(400).send({ error: 'days must be a non-zero number' });
    if (!note) return reply.status(400).send({ error: 'A reason is required for any adjustment to somebody\'s leave' });

    const balances = await computeBalances(user.tenant_id, String(b.user_id));
    const target = balances.find(x => x.leave_type_id === b.leave_type_id);
    if (!target) return reply.status(404).send({ error: 'That leave type does not apply to this person' });

    const result = await withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_leave_balances').select(['id', 'adjustment'])
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', String(b.user_id))
        .where('leave_type_id', '=', String(b.leave_type_id))
        .where('cycle_start', '=', target.cycle_start as any).executeTakeFirst();

      const newAdjustment = Number(existing?.adjustment ?? 0) + days;
      const stamped = `${new Date().toISOString().slice(0, 10)} ${user.email ?? user.sub}: ${note}`;

      if (existing) {
        await trx.updateTable('hr_leave_balances').set({
          adjustment: String(newAdjustment), adjustment_note: stamped, updated_at: new Date(),
        } as any).where('id', '=', existing.id).execute();
      } else {
        await trx.insertInto('hr_leave_balances').values({
          tenant_id: user.tenant_id, user_id: String(b.user_id), leave_type_id: String(b.leave_type_id),
          cycle_start: target.cycle_start, cycle_end: target.cycle_end,
          entitled: String(target.entitled), taken: String(target.taken), pending: String(target.pending),
          adjustment: String(newAdjustment), adjustment_note: stamped,
        } as any).execute();
      }

      return { applied: days, total_adjustment: newAdjustment, note: stamped };
    });

    // Same reason as in the leave request: computeBalances reads through `db`,
    // so calling it inside the transaction would report the balance from
    // before this adjustment was written.
    const after = await computeBalances(user.tenant_id, String(b.user_id));
    return { ...result, balance: after.find(x => x.leave_type_id === b.leave_type_id) };
  });
}
