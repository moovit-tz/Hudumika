import { withTenant } from '../db/client.js';
import { GLService } from './gl.service.js';

/**
 * Posts operational costs into the general ledger.
 *
 * Demurrage was visible in its own app and invisible to finance: every
 * container carried a demurrage_cost, /v1/demurrage/* returned it happily,
 * and none of it reached a journal entry — so it could never appear in a P&L,
 * a trial balance, or the expenses report. The cost existed; the accounting
 * did not.
 *
 * Posting rule (a demurrage charge is an incurred expense owed to the line):
 *
 *   DR  5003  Storage & Demurrage      the cost hits the P&L
 *   CR  2000  Accounts Payable         and is owed until paid
 *
 * Both codes are already in STANDARD_COA — 5003 is literally named "Storage &
 * Demurrage", so the chart was designed for this. If your accounting treats
 * demurrage as recoverable from the customer rather than an own-account cost,
 * the debit belongs on a receivable instead; that is a one-line change here
 * and the only judgement call in this file.
 *
 * Idempotency is by (source_module, source_id): a container already posted is
 * skipped, so this can be run repeatedly and on a schedule without doubling
 * anything. WAIVED containers are never posted — a waived charge is not an
 * expense.
 */

export interface CostPostingResult {
  posted: { containerId: string; containerNumber: string; amount: number; entryId: string }[];
  skipped: { containerId: string; reason: string }[];
}

const DEMURRAGE_EXPENSE_ACCOUNT = '5003'; // Storage & Demurrage
const ACCOUNTS_PAYABLE_ACCOUNT = '2000'; // Accounts Payable

export class CostPostingService {
  /**
   * Post every unposted demurrage charge for a tenant.
   *
   * @param dryRun report what would be posted without writing anything —
   *        worth having, because the first run against real data is the one
   *        you want to read before it happens.
   */
  static async postDemurrage(
    tenantId: string,
    userId: string | null,
    dryRun = false,
  ): Promise<CostPostingResult> {
    return withTenant(tenantId, async (trx) => {
      // Explicit tenant filter, not RLS alone — see CLAUDE.md.
      const containers = await trx
        .selectFrom('container_tracking')
        .select([
          'id', 'container_number', 'demurrage_cost', 'demurrage_days',
          'status', 'shipment_id', 'return_date', 'gate_out_date',
        ])
        .where('tenant_id', '=', tenantId)
        .execute();

      // One query for what is already posted, rather than one per container.
      const existing = await trx
        .selectFrom('journal_entries')
        .select('source_id')
        .where('tenant_id', '=', tenantId)
        .where('source_module', '=', 'EXPENSE')
        .where('status', '<>', 'VOIDED')
        .execute();
      const alreadyPosted = new Set(existing.map(e => e.source_id).filter(Boolean) as string[]);

      const result: CostPostingResult = { posted: [], skipped: [] };

      for (const c of containers) {
        const amount = Number(c.demurrage_cost ?? 0);
        if (alreadyPosted.has(c.id)) {
          result.skipped.push({ containerId: c.id, reason: 'already posted' });
          continue;
        }
        if (amount <= 0) {
          result.skipped.push({ containerId: c.id, reason: 'no demurrage charge' });
          continue;
        }
        if (c.status === 'WAIVED') {
          result.skipped.push({ containerId: c.id, reason: 'waived — not an expense' });
          continue;
        }
        if (dryRun) {
          result.posted.push({
            containerId: c.id, containerNumber: c.container_number, amount, entryId: '(dry run)',
          });
          continue;
        }

        // Dated when the charge crystallised, falling back to today rather
        // than to a null the ledger would reject.
        const entryDate = String(c.return_date ?? c.gate_out_date ?? new Date().toISOString()).slice(0, 10);

        const entryId = await GLService.post(tenantId, {
          entryDate,
          description: `Demurrage — container ${c.container_number} (${c.demurrage_days} day(s))`,
          reference: c.container_number,
          sourceModule: 'EXPENSE',
          sourceId: c.id,
          createdBy: userId ?? undefined,
          lines: [
            { accountCode: DEMURRAGE_EXPENSE_ACCOUNT, debit: amount, credit: 0,
              description: `Demurrage ${c.container_number}` },
            { accountCode: ACCOUNTS_PAYABLE_ACCOUNT, debit: 0, credit: amount,
              description: `Demurrage payable — ${c.container_number}` },
          ],
        } as any);

        result.posted.push({
          containerId: c.id, containerNumber: c.container_number, amount, entryId,
        });
      }

      return result;
    });
  }
}
