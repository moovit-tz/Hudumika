import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

/**
 * Real, count-based completion signals for the post-login "getting started"
 * checklist — one existence check per phase against the table that phase's
 * first genuine action actually writes to. Deliberately NOT chart_of_accounts
 * or workflows.is_active: both are auto-seeded for every tenant at signup
 * (onboarding.service.ts → GLService.seedChartOfAccounts / DefaultWorkflowService
 * .seedForTenant), so either would read as "done" before an admin has touched
 * anything. tax_codes, customers, shipment_cases, hr_departments,
 * comply_obligations and workflow_studio_apps are never seeded — each stays
 * empty until a tenant genuinely acts. Same reasoning for
 * ondi_kyc_submissions (security phase, added with Ondi M0-M7): nobody has
 * one until they've actually submitted an ID for verification.
 */
export async function setupGuideRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/checklist', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const [users, kycSubmissions, taxCodes, customers, shipments, departments, obligations, automations] = await Promise.all([
        trx.selectFrom('users').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('ondi_kyc_submissions').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('tax_codes').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('customers').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('shipment_cases').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('hr_departments').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('comply_obligations').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('workflow_studio_apps').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'ACTIVE').executeTakeFirst(),
      ]);

      return {
        data: {
          foundation: Number(users?.c ?? 0) > 1,
          security: Number(kycSubmissions?.c ?? 0) > 0,
          finance: Number(taxCodes?.c ?? 0) > 0,
          crm: Number(customers?.c ?? 0) > 0,
          operations: Number(shipments?.c ?? 0) > 0,
          people: Number(departments?.c ?? 0) > 0,
          compliance: Number(obligations?.c ?? 0) > 0,
          automate: Number(automations?.c ?? 0) > 0,
        },
      };
    });
  });
}
