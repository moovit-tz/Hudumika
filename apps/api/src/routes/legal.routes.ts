import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';

const MATTER_TYPES = ['litigation', 'corporate', 'real_estate', 'employment', 'ip', 'tax', 'criminal', 'family', 'immigration', 'general'] as const;
const MATTER_STATUSES = ['open', 'active', 'on_hold', 'closed', 'archived'] as const;
const BILLING_METHODS = ['hourly', 'fixed', 'contingency', 'pro_bono', 'retainer'] as const;
const COURT_HIERARCHIES = ['COURT_OF_APPEAL', 'HIGH_COURT', 'RESIDENT_MAGISTRATE', 'DISTRICT', 'PRIMARY', 'TRIBUNAL'] as const;
const COURT_EVENT_TYPES = ['MENTION', 'HEARING', 'PTC', 'JUDGMENT', 'RULING', 'EXECUTION', 'FILING'] as const;
const DEADLINE_TYPES = ['LIMITATION', 'APPEAL_WINDOW', 'STATUTORY', 'COURT_ORDER', 'REMINDER', 'CUSTOM'] as const;
const DISBURSEMENT_CATEGORIES = ['COURT_FEE', 'STAMP_DUTY', 'BRELA', 'TRAVEL', 'EXPERT', 'COUNSEL_FEE', 'OTHER'] as const;

const LEGAL_TRANSITIONS: Record<string, string[]> = {
  open:      ['active', 'on_hold', 'closed'],
  active:    ['on_hold', 'closed'],
  on_hold:   ['active', 'closed'],
  closed:    ['archived'],
  archived:  [],
};

export async function registerLegalRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', requireEntitlement('lexcore'));

    // ── Clients ───────────────────────────────────────────────
    fastify.get('/clients', async (request) => {
      const { search, page = '1', limit = '50' } = request.query as Record<string, string>;
      const p = Math.max(1, parseInt(page));
      const l = Math.min(100, Math.max(1, parseInt(limit)));
      return withTenant(request.user.tenant_id, async (trx) => {
        let q = trx.selectFrom('legal_clients')
          .where('tenant_id', '=', request.user.tenant_id)
          .orderBy('name', 'asc');
        if (search) {
          q = q.where(sql<boolean>`lower(name) like ${`%${search.toLowerCase()}%`}`);
        }
        const rows = await q.selectAll().limit(l).offset((p - 1) * l).execute();
        const [{ count }] = await trx.selectFrom('legal_clients')
          .where('tenant_id', '=', request.user.tenant_id)
          .select(sql<number>`count(*)::int`.as('count'))
          .execute();
        return { rows, total: count, page: p, limit: l };
      });
    });

    fastify.post('/clients', async (request, reply) => {
      const schema = z.object({
        name: z.string().trim().min(1),
        client_type: z.enum(['individual', 'company', 'government', 'ngo']).default('individual'),
        tax_id: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        notes: z.string().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.insertInto('legal_clients')
          .values({
            tenant_id: request.user.tenant_id,
            name: body.name,
            client_type: body.client_type,
            tax_id: body.tax_id,
            address: body.address,
            phone: body.phone,
            email: body.email,
            notes: body.notes,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });

    fastify.get('/clients/:id', async (request) => {
      const { id } = request.params as { id: string };
      return withTenant(request.user.tenant_id, async (trx) => {
        const row = await trx.selectFrom('legal_clients')
          .where('id', '=', id)
          .where('tenant_id', '=', request.user.tenant_id)
          .selectAll()
          .executeTakeFirst();
        if (!row) throw { statusCode: 404, message: 'Client not found' };
        return row;
      });
    });

    // ── Matters ───────────────────────────────────────────────
    fastify.get('/matters', async (request) => {
      const { status, client_id, page = '1', limit = '50' } = request.query as Record<string, string>;
      const p = Math.max(1, parseInt(page));
      const l = Math.min(100, Math.max(1, parseInt(limit)));
      return withTenant(request.user.tenant_id, async (trx) => {
        let q = trx.selectFrom('legal_matters')
          .where('legal_matters.tenant_id', '=', request.user.tenant_id)
          .leftJoin('legal_clients', 'legal_clients.id', 'legal_matters.client_id')
          .select([
            'legal_matters.id', 'legal_matters.matter_number', 'legal_matters.title',
            'legal_matters.matter_type', 'legal_matters.status', 'legal_matters.billing_method',
            'legal_matters.date_opened', 'legal_matters.date_closed', 'legal_matters.created_at',
            'legal_clients.name as client_name',
          ])
          .orderBy('legal_matters.created_at', 'desc');
        if (status) q = q.where('legal_matters.status', '=', status as any);
        if (client_id) q = q.where('legal_matters.client_id', '=', client_id);
        const rows = await q.limit(l).offset((p - 1) * l).execute();
        const [{ count }] = await trx.selectFrom('legal_matters')
          .where('tenant_id', '=', request.user.tenant_id)
          .select(sql<number>`count(*)::int`.as('count'))
          .execute();
        return { rows, total: count, page: p, limit: l };
      });
    });

    fastify.post('/matters', async (request, reply) => {
      const schema = z.object({
        client_id: z.string().uuid(),
        title: z.string().trim().min(1),
        description: z.string().optional(),
        matter_type: z.enum(MATTER_TYPES).default('general'),
        billing_method: z.enum(BILLING_METHODS).default('hourly'),
        billing_rate: z.number().optional(),
        practice_area: z.string().optional(),
        responsible_attorney_id: z.string().uuid().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const [{ count }] = await trx.selectFrom('legal_matters')
          .where('tenant_id', '=', request.user.tenant_id)
          .select(sql<number>`count(*)::int`.as('count'))
          .execute();
        const matterNumber = `MTR-${String(count + 1).padStart(5, '0')}`;

        const [row] = await trx.insertInto('legal_matters')
          .values({
            tenant_id: request.user.tenant_id,
            matter_number: matterNumber,
            client_id: body.client_id,
            title: body.title,
            description: body.description,
            matter_type: body.matter_type,
            status: 'open',
            billing_method: body.billing_method,
            billing_rate: body.billing_rate ?? null,
            practice_area: body.practice_area,
            responsible_attorney_id: body.responsible_attorney_id,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });

    fastify.get('/matters/:id', async (request) => {
      const { id } = request.params as { id: string };
      return withTenant(request.user.tenant_id, async (trx) => {
        const matter = await trx.selectFrom('legal_matters')
          .where('id', '=', id)
          .where('tenant_id', '=', request.user.tenant_id)
          .selectAll()
          .executeTakeFirst();
        if (!matter) throw { statusCode: 404, message: 'Matter not found' };

        const client = matter.client_id
          ? await trx.selectFrom('legal_clients')
              .where('id', '=', matter.client_id)
              .selectAll()
              .executeTakeFirst()
          : null;

        const court_cases = await trx.selectFrom('legal_court_cases')
          .where('matter_id', '=', id)
          .where('tenant_id', '=', request.user.tenant_id)
          .selectAll()
          .execute();

        const deadlines = await trx.selectFrom('legal_deadlines')
          .where('matter_id', '=', id)
          .where('tenant_id', '=', request.user.tenant_id)
          .orderBy('due_date', 'asc')
          .selectAll()
          .execute();

        return { ...matter, client, court_cases, deadlines };
      });
    });

    fastify.patch('/matters/:id', async (request) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(MATTER_STATUSES).optional(),
        practice_area: z.string().optional(),
        responsible_attorney_id: z.string().uuid().nullable().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        if (body.status) {
          const current = await trx.selectFrom('legal_matters')
            .where('id', '=', id)
            .where('tenant_id', '=', request.user.tenant_id)
            .select('status')
            .executeTakeFirst();
          if (!current) throw { statusCode: 404, message: 'Matter not found' };
          const allowed = LEGAL_TRANSITIONS[current.status] || [];
          if (!allowed.includes(body.status)) {
            throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${body.status}` };
          }
        }
        const [row] = await trx.updateTable('legal_matters')
          .set({ ...body, updated_at: new Date() })
          .where('id', '=', id)
          .where('tenant_id', '=', request.user.tenant_id)
          .returningAll()
          .execute();
        if (!row) throw { statusCode: 404, message: 'Matter not found' };
        return row;
      });
    });

    // ── Court cases ───────────────────────────────────────────
    fastify.post('/matters/:id/court-cases', async (request, reply) => {
      const { id: matterId } = request.params as { id: string };
      const schema = z.object({
        case_number: z.string().trim().optional(),
        court_name: z.string().trim().min(1),
        court_hierarchy: z.enum(COURT_HIERARCHIES),
        division_type: z.string().optional(),
        filed_at: z.string().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.insertInto('legal_court_cases')
          .values({
            tenant_id: request.user.tenant_id,
            matter_id: matterId,
            case_number: body.case_number,
            court_name: body.court_name,
            court_hierarchy: body.court_hierarchy,
            division_type: (body.division_type as any) ?? null,
            filed_at: body.filed_at ?? null,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });

    // ── Court events ──────────────────────────────────────────
    fastify.post('/matters/:id/events', async (request, reply) => {
      const { id: matterId } = request.params as { id: string };
      const schema = z.object({
        court_case_id: z.string().uuid(),
        event_type: z.enum(COURT_EVENT_TYPES),
        scheduled_at: z.string(),
        outcome: z.string().optional(),
        notes: z.string().optional(),
        next_event_type: z.string().optional(),
        next_event_date: z.string().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.insertInto('legal_court_events')
          .values({
            tenant_id: request.user.tenant_id,
            court_case_id: body.court_case_id,
            matter_id: matterId,
            event_type: body.event_type,
            scheduled_at: new Date(body.scheduled_at),
            outcome: body.outcome,
            notes: body.notes,
            next_event_type: body.next_event_type,
            next_event_date: body.next_event_date ? new Date(body.next_event_date) : null,
            recorded_by: request.user.sub,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });

    // ── Deadlines ─────────────────────────────────────────────
    fastify.get('/deadlines', async (request) => {
      const { matter_id, upcoming } = request.query as Record<string, string>;
      return withTenant(request.user.tenant_id, async (trx) => {
        let q = trx.selectFrom('legal_deadlines')
          .where('tenant_id', '=', request.user.tenant_id)
          .orderBy('due_date', 'asc');
        if (matter_id) q = q.where('matter_id', '=', matter_id);
        if (upcoming === 'true') {
          q = q.where('completed_at', 'is', null);
        }
        return q.selectAll().execute();
      });
    });

    fastify.post('/deadlines', async (request, reply) => {
      const schema = z.object({
        matter_id: z.string().uuid(),
        court_case_id: z.string().uuid().optional(),
        deadline_type: z.enum(DEADLINE_TYPES),
        description: z.string().trim().min(1),
        due_date: z.string(),
        is_critical: z.boolean().default(false),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.insertInto('legal_deadlines')
          .values({
            tenant_id: request.user.tenant_id,
            matter_id: body.matter_id,
            court_case_id: body.court_case_id,
            deadline_type: body.deadline_type,
            description: body.description,
            due_date: body.due_date,
            raw_due_date: body.due_date,
            is_critical: body.is_critical,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });

    fastify.patch('/deadlines/:id/complete', async (request) => {
      const { id } = request.params as { id: string };
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.updateTable('legal_deadlines')
          .set({ completed_at: new Date(), updated_at: new Date() })
          .where('id', '=', id)
          .where('tenant_id', '=', request.user.tenant_id)
          .returningAll()
          .execute();
        if (!row) throw { statusCode: 404, message: 'Deadline not found' };
        return row;
      });
    });

    // ── Time entries ──────────────────────────────────────────
    fastify.get('/time', async (request) => {
      const { matter_id, user_id, billable, page = '1', limit = '50' } = request.query as Record<string, string>;
      const p = Math.max(1, parseInt(page));
      const l = Math.min(100, Math.max(1, parseInt(limit)));
      return withTenant(request.user.tenant_id, async (trx) => {
        let q = trx.selectFrom('legal_time_entries')
          .where('tenant_id', '=', request.user.tenant_id)
          .orderBy('entry_date', 'desc');
        if (matter_id) q = q.where('matter_id', '=', matter_id);
        if (user_id) q = q.where('user_id', '=', user_id);
        if (billable === 'true') q = q.where('is_billable', '=', true);
        if (billable === 'false') q = q.where('is_billable', '=', false);
        const rows = await q.selectAll().limit(l).offset((p - 1) * l).execute();
        return { rows, page: p, limit: l };
      });
    });

    fastify.post('/time', async (request, reply) => {
      const schema = z.object({
        matter_id: z.string().uuid(),
        entry_date: z.string(),
        description: z.string().trim().min(1),
        hours: z.number().positive(),
        rate: z.number().optional(),
        is_billable: z.boolean().default(true),
        activity_code: z.string().optional(),
      });
      const body = schema.parse(request.body);
      const amount = body.rate ? Math.round(body.rate * body.hours * 100) / 100 : null;
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.insertInto('legal_time_entries')
          .values({
            tenant_id: request.user.tenant_id,
            matter_id: body.matter_id,
            user_id: request.user.sub,
            entry_date: body.entry_date,
            description: body.description,
            hours: body.hours,
            rate: body.rate ?? null,
            amount,
            is_billable: body.is_billable,
            activity_code: body.activity_code,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });

    // ── Trust accounts ────────────────────────────────────────
    fastify.get('/trust/accounts', async (request) => {
      return withTenant(request.user.tenant_id, async (trx) => {
        return trx.selectFrom('legal_trust_accounts')
          .where('tenant_id', '=', request.user.tenant_id)
          .selectAll()
          .execute();
      });
    });

    fastify.post('/trust/accounts', async (request, reply) => {
      const schema = z.object({
        account_name: z.string().trim().min(1),
        account_number: z.string().optional(),
        bank_name: z.string().optional(),
        client_id: z.string().uuid().optional(),
        matter_id: z.string().uuid().optional(),
        currency: z.string().default('TZS'),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.insertInto('legal_trust_accounts')
          .values({
            tenant_id: request.user.tenant_id,
            account_name: body.account_name,
            account_number: body.account_number,
            bank_name: body.bank_name,
            client_id: body.client_id,
            matter_id: body.matter_id,
            currency: body.currency,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });

    // ── Trust transactions (deposit/disbursement with GL posting) ──
    fastify.get('/trust/accounts/:accountId/transactions', async (request) => {
      const { accountId } = request.params as { accountId: string };
      const { page = '1', limit = '50' } = request.query as Record<string, string>;
      const p = Math.max(1, parseInt(page));
      const l = Math.min(100, Math.max(1, parseInt(limit)));
      return withTenant(request.user.tenant_id, async (trx) => {
        const rows = await trx.selectFrom('legal_trust_transactions')
          .where('tenant_id', '=', request.user.tenant_id)
          .where('trust_account_id', '=', accountId)
          .selectAll()
          .orderBy('created_at', 'desc')
          .limit(l).offset((p - 1) * l)
          .execute();
        const [{ count }] = await trx.selectFrom('legal_trust_transactions')
          .where('tenant_id', '=', request.user.tenant_id)
          .where('trust_account_id', '=', accountId)
          .select(sql<number>`count(*)::int`.as('count'))
          .execute();
        return { rows, total: count, page: p, limit: l };
      });
    });

    fastify.post('/trust/accounts/:accountId/deposit', async (request, reply) => {
      const { accountId } = request.params as { accountId: string };
      const schema = z.object({
        amount: z.number().positive(),
        description: z.string().trim().min(1),
        reference: z.string().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const account = await trx.selectFrom('legal_trust_accounts')
          .where('id', '=', accountId)
          .where('tenant_id', '=', request.user.tenant_id)
          .selectAll().forUpdate()
          .executeTakeFirst();
        if (!account) throw { statusCode: 404, message: 'Trust account not found' };
        if (account.status !== 'active') throw { statusCode: 422, message: 'Trust account is not active' };

        const newBalance = Number(account.balance) + body.amount;

        await GLService.post(request.user.tenant_id, {
          entryDate: new Date().toISOString().slice(0, 10),
          description: `Trust deposit: ${account.account_name} — ${body.description}`,
          sourceModule: 'MANUAL',
          sourceId: accountId,
          createdBy: request.user.sub,
          lines: [
            { accountCode: '1010', debit: body.amount, credit: 0, dimensions: { trust_account_id: accountId } },
            { accountCode: '2700', debit: 0, credit: body.amount, dimensions: { trust_account_id: accountId } },
          ],
        }, trx);

        await trx.updateTable('legal_trust_accounts')
          .set({ balance: newBalance, updated_at: new Date() })
          .where('id', '=', accountId)
          .where('tenant_id', '=', request.user.tenant_id)
          .execute();

        const [txn] = await trx.insertInto('legal_trust_transactions')
          .values({
            tenant_id: request.user.tenant_id,
            trust_account_id: accountId,
            type: 'deposit',
            amount: body.amount,
            balance_after: newBalance,
            description: body.description,
            reference: body.reference ?? null,
            payee: null,
            check_number: null,
            performed_by: request.user.sub,
          })
          .returningAll()
          .execute();

        reply.status(201);
        return txn;
      });
    });

    fastify.post('/trust/accounts/:accountId/disburse', async (request, reply) => {
      const { accountId } = request.params as { accountId: string };
      const schema = z.object({
        amount: z.number().positive(),
        description: z.string().trim().min(1),
        payee: z.string().trim().min(1),
        reference: z.string().optional(),
        check_number: z.string().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const account = await trx.selectFrom('legal_trust_accounts')
          .where('id', '=', accountId)
          .where('tenant_id', '=', request.user.tenant_id)
          .selectAll().forUpdate()
          .executeTakeFirst();
        if (!account) throw { statusCode: 404, message: 'Trust account not found' };
        if (account.status !== 'active') throw { statusCode: 422, message: 'Trust account is not active' };
        if (Number(account.balance) < body.amount) {
          throw { statusCode: 422, message: `Insufficient trust balance: ${account.balance} < ${body.amount}` };
        }

        const newBalance = Number(account.balance) - body.amount;

        await GLService.post(request.user.tenant_id, {
          entryDate: new Date().toISOString().slice(0, 10),
          description: `Trust disbursement: ${account.account_name} → ${body.payee}`,
          sourceModule: 'MANUAL',
          sourceId: accountId,
          createdBy: request.user.sub,
          lines: [
            { accountCode: '2700', debit: body.amount, credit: 0, dimensions: { trust_account_id: accountId } },
            { accountCode: '1010', debit: 0, credit: body.amount, dimensions: { trust_account_id: accountId } },
          ],
        }, trx);

        await trx.updateTable('legal_trust_accounts')
          .set({ balance: newBalance, updated_at: new Date() })
          .where('id', '=', accountId)
          .where('tenant_id', '=', request.user.tenant_id)
          .execute();

        const [txn] = await trx.insertInto('legal_trust_transactions')
          .values({
            tenant_id: request.user.tenant_id,
            trust_account_id: accountId,
            type: 'disbursement',
            amount: body.amount,
            balance_after: newBalance,
            description: body.description,
            reference: body.reference ?? null,
            payee: body.payee,
            check_number: body.check_number ?? null,
            performed_by: request.user.sub,
          })
          .returningAll()
          .execute();

        reply.status(201);
        return txn;
      });
    });

    // ── Conflict checks ───────────────────────────────────────
    fastify.post('/conflicts/search', async (request) => {
      const schema = z.object({
        parties: z.array(z.string()).min(1),
      });
      const { parties } = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const patterns = parties.map(p => `%${p.toLowerCase()}%`);
        const clients = await trx.selectFrom('legal_clients')
          .where('tenant_id', '=', request.user.tenant_id)
          .where((eb) => {
            const conds = patterns.map(p => sql<boolean>`lower(name) like ${p}`);
            return eb.or(conds);
          })
          .selectAll()
          .execute();

        const matters = clients.length > 0
          ? await trx.selectFrom('legal_matters')
              .where('tenant_id', '=', request.user.tenant_id)
              .where('client_id', 'in', clients.map(c => c.id))
              .selectAll()
              .execute()
          : [];

        return { clients, matters, potential_conflicts: clients.length > 0 };
      });
    });

    fastify.post('/conflicts/:matterId/clear', async (request, reply) => {
      const { matterId } = request.params as { matterId: string };
      const schema = z.object({
        party_name: z.string().trim().min(1),
        party_role: z.enum(['client', 'opposing', 'related', 'witness']),
        result: z.enum(['clear', 'potential', 'conflict', 'waived']).default('clear'),
        notes: z.string().optional(),
        waiver_reason: z.string().optional(),
      });
      const body = schema.parse(request.body);
      return withTenant(request.user.tenant_id, async (trx) => {
        const [row] = await trx.insertInto('legal_conflict_checks')
          .values({
            tenant_id: request.user.tenant_id,
            matter_id: matterId,
            party_name: body.party_name,
            party_role: body.party_role,
            checked_by: request.user.sub,
            result: body.result,
            notes: body.notes,
            waiver_reason: body.waiver_reason,
            waived_by: body.result === 'waived' ? request.user.sub : null,
            waived_at: body.result === 'waived' ? new Date() : null,
          })
          .returningAll()
          .execute();
        reply.status(201);
        return row;
      });
    });
}
