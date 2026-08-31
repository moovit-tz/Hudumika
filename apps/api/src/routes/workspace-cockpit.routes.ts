import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';
import { PETTI_FINANCE_ROLES } from '../services/petti.service.js';
import { computeBalances } from '../services/leave-entitlement.service.js';

/**
 * GET /v1/workspace/cockpit — the real-data feed behind the Basic/Agentic
 * landing (AgenticHome.tsx). One round trip, `Promise.all` fan-out across
 * every app the signed-in user might have work in, same shape as
 * search.routes.ts's own multi-table pattern. Each branch is skipped when
 * the tenant lacks that app's entitlement, and every query is scoped to
 * "mine" (assignee/requester/approver), not the tenant's whole dataset —
 * this is a personal summary, not a reporting endpoint.
 *
 * Petty-cash "pending my approval" is a deliberate approximation of
 * PettiService's real `assertCanActOnApprovalStep` (petti.service.ts):
 * it does not re-resolve each request's workflow_id/requires_department_
 * approval, just the wallet's designated approver (+ backup) or, if none is
 * set, the Finance/Manager fallback. Good enough for "here's roughly what's
 * waiting on you" on a summary tile — the real approve/reject action still
 * goes through Petti's own enforcement, which is authoritative.
 */
export async function workspaceCockpitRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const user = request.user;
    if (user.role === 'CUSTOMER') return { tasks: [], tickets: [], shipments: null, leave: null, clock: null, pettyCash: null };

    const [hasClearos, hasNexusHr, hasPetti] = await Promise.all([
      tenantHasEntitlement(user.tenant_id, 'clearos'),
      tenantHasEntitlement(user.tenant_id, 'nexushr'),
      tenantHasEntitlement(user.tenant_id, 'petti'),
    ]);

    return withTenant(user.tenant_id, async (trx) => {
      const [tasks, tickets, shipments, leaveBalance, leaveRequests, clock, pettyMine, pettyApprovalWallets] = await Promise.all([
        // My open tasks — owner or assignee, not completed, soonest due first.
        trx.selectFrom('tasks')
          .where('tenant_id', '=', user.tenant_id)
          .where('completed', '=', false)
          .where('deleted_at', 'is', null)
          .where(eb => eb.or([eb('user_id', '=', user.sub), eb('assignee_id', '=', user.sub)]))
          .select(['id', 'title', 'due', 'priority', 'status'])
          .orderBy('due', 'asc').limit(8).execute(),

        // My open support tickets — assigned to me, not closed/resolved.
        trx.selectFrom('support_tickets')
          .where('tenant_id', '=', user.tenant_id)
          .where('assigned_to', '=', user.sub)
          .where('status', 'not in', ['RESOLVED', 'CLOSED'])
          .select(['id', 'ref_number as ref', 'subject', 'status', 'priority', 'sla_deadline'])
          .orderBy('sla_deadline', 'asc').limit(8).execute(),

        // My assigned shipments — "my plate," not a team/ops view.
        hasClearos
          ? trx.selectFrom('shipment_cases')
              .where('tenant_id', '=', user.tenant_id)
              .where('assigned_to', '=', user.sub)
              .where('deleted_at', 'is', null)
              .select(['id', 'ref_number', 'goods_desc', 'stage', 'eta'])
              .orderBy('eta', 'asc').limit(8).execute()
          : Promise.resolve(null),

        // computeBalances manages its own withTenant() connection internally
        // (see leave-entitlement.service.ts) — safe to run alongside this
        // block's own `trx`-based queries, same "own transaction, either
        // context" rule recordAuthEvent follows elsewhere in this codebase.
        hasNexusHr ? computeBalances(user.tenant_id, user.sub) : Promise.resolve(null),

        hasNexusHr
          ? trx.selectFrom('hr_leaves')
              .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('status', '=', 'PENDING')
              .select(['id', 'type', 'from_date', 'to_date', 'days', 'status'])
              .orderBy('created_at', 'desc').limit(5).execute()
          : Promise.resolve(null),

        hasNexusHr
          ? trx.selectFrom('hr_clock_sessions')
              .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
              .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
              .selectAll().orderBy('created_at', 'desc').executeTakeFirst()
          : Promise.resolve(null),

        hasPetti
          ? trx.selectFrom('petti_withdrawal_requests')
              .where('tenant_id', '=', user.tenant_id).where('requested_by', '=', user.sub)
              .where('status', '=', 'pending')
              .select(['id', 'amount', 'category', 'purpose', 'requested_at'])
              .orderBy('requested_at', 'desc').limit(5).execute()
          : Promise.resolve(null),

        // Wallets this user can approve for — designated approver/backup, or
        // (if a wallet has neither configured) the Finance/Manager fallback.
        hasPetti
          ? trx.selectFrom('petti_wallets')
              .where('tenant_id', '=', user.tenant_id)
              .select(['id', 'approver_user_id', 'approver_backup_user_id'])
              .execute()
          : Promise.resolve(null),
      ]);

      let pettyPendingApproval: any[] | null = null;
      if (hasPetti && pettyApprovalWallets) {
        const canApproveFallback = user.role === 'MANAGER' || (PETTI_FINANCE_ROLES as readonly string[]).includes(user.role);
        const myWalletIds = pettyApprovalWallets
          .filter(w => w.approver_user_id === user.sub || w.approver_backup_user_id === user.sub
            || (!w.approver_user_id && !w.approver_backup_user_id && canApproveFallback))
          .map(w => w.id);
        pettyPendingApproval = myWalletIds.length
          ? await trx.selectFrom('petti_withdrawal_requests')
              .where('tenant_id', '=', user.tenant_id).where('wallet_id', 'in', myWalletIds).where('status', '=', 'pending')
              .select(['id', 'wallet_id', 'amount', 'category', 'purpose', 'requested_by', 'requested_at'])
              .orderBy('requested_at', 'asc').limit(8).execute()
          : [];
      }

      return {
        tasks,
        tickets,
        shipments,
        leave: hasNexusHr ? { balance: leaveBalance, pendingRequests: leaveRequests } : null,
        clock: hasNexusHr ? clock : null,
        pettyCash: hasPetti ? { myRequests: pettyMine, pendingMyApproval: pettyPendingApproval } : null,
      };
    });
  });
}
