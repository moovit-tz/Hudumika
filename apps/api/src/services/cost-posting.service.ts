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
 * Who carries the charge decides the entry, so the debit is not fixed:
 *
 *   liable_party = CUSTOMER   the normal case. The delay is theirs, so the
 *                             charge is recoverable and is recharged on that
 *                             shipment's invoice. It is a receivable, never
 *                             our expense:
 *                                 DR  1100  Accounts Receivable
 *                                 CR  2000  Accounts Payable
 *
 *   liable_party = COMPANY    we failed to clear on time. The charge is
 *                             absorbed, must NOT reach the customer's
 *                             invoice, and lands in our own P&L:
 *                                 DR  5003  Storage & Demurrage
 *                                 CR  2000  Accounts Payable
 *
 * Getting this backwards is not a cosmetic error — it either inflates our
 * costs with money we are owed, or bills a customer for our own failure. The
 * credit is the same either way: we owe the shipping line regardless of whose
 * fault it was.
 *
 * Idempotency is by (source_module, source_id): a container already posted is
 * skipped, so this can be run repeatedly and on a schedule without doubling
 * anything. WAIVED containers are never posted — a waived charge is not a
 * cost to anyone.
 *
 * Still to build: the recharge itself. A CUSTOMER-liable charge posts to
 * receivables here, but nothing yet adds the line to the shipment's invoice,
 * and recharged_invoice_id (migration 175) is what will record that it has
 * been billed so it cannot be billed twice.
 */

export interface CostPostingResult {
  posted: { containerId: string; containerNumber: string; amount: number; entryId: string;
             treatment: 'recoverable' | 'absorbed' }[];
  skipped: { containerId: string; reason: string }[];
}

const DEMURRAGE_EXPENSE_ACCOUNT = '5003'; // Storage & Demurrage — only when we are at fault
const ACCOUNTS_RECEIVABLE_ACCOUNT = '1100'; // Accounts Receivable — recoverable from the customer
const ACCOUNTS_PAYABLE_ACCOUNT = '2000'; // Accounts Payable — owed to the line either way

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
          'liable_party', 'liability_reason',
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
            treatment: c.liable_party === 'COMPANY' ? 'absorbed' : 'recoverable',
          });
          continue;
        }

        // Dated when the charge crystallised, falling back to today rather
        // than to a null the ledger would reject.
        const entryDate = String(c.return_date ?? c.gate_out_date ?? new Date().toISOString()).slice(0, 10);

        // The debit follows fault. Credit is always the payable — we owe the
        // line whether or not the delay was ours.
        const absorbed = c.liable_party === 'COMPANY';
        const debitAccount = absorbed ? DEMURRAGE_EXPENSE_ACCOUNT : ACCOUNTS_RECEIVABLE_ACCOUNT;

        const entryId = await GLService.post(tenantId, {
          entryDate,
          description: absorbed
            ? `Demurrage absorbed (our delay) — container ${c.container_number} (${c.demurrage_days} day(s))`
            : `Demurrage recoverable from customer — container ${c.container_number} (${c.demurrage_days} day(s))`,
          reference: c.container_number,
          sourceModule: 'EXPENSE',
          sourceId: c.id,
          createdBy: userId ?? undefined,
          lines: [
            { accountCode: debitAccount, debit: amount, credit: 0,
              description: absorbed
                ? `Demurrage ${c.container_number}${c.liability_reason ? ` — ${c.liability_reason}` : ''}`
                : `Demurrage recharged ${c.container_number}` },
            { accountCode: ACCOUNTS_PAYABLE_ACCOUNT, debit: 0, credit: amount,
              description: `Demurrage payable — ${c.container_number}` },
          ],
        } as any);

        result.posted.push({
          containerId: c.id, containerNumber: c.container_number, amount, entryId,
          treatment: absorbed ? 'absorbed' : 'recoverable',
        });
      }

      return result;
    });
  }
}
