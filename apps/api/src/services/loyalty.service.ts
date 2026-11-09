import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { GLService } from './gl.service.js';

// 'earn'/'adjust_add'/'refund' increase a customer's balance; 'redeem'/
// 'adjust_subtract'/'void_writeoff'/'reversal' decrease it. Balance is
// always derived fresh from loyalty_transactions, same convention as
// customer_credits/gift_cards/petti_wallets/fintech wallets.
const CREDIT_TYPES = new Set(['earn', 'adjust_add', 'refund']);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface LoyaltyProgram {
  tenantId: string;
  enabled: boolean;
  pointsPerCurrencyUnit: number;
  redemptionValuePerPoint: number;
}

export async function getLoyaltyProgram(trx: Transaction<Database>, tenantId: string): Promise<LoyaltyProgram | null> {
  const row = await trx.selectFrom('loyalty_programs').selectAll().where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!row) return null;
  return {
    tenantId, enabled: row.enabled,
    pointsPerCurrencyUnit: Number(row.points_per_currency_unit),
    redemptionValuePerPoint: Number(row.redemption_value_per_point),
  };
}

export async function computeLoyaltyBalance(trx: Transaction<Database>, tenantId: string, customerId: string): Promise<number> {
  const rows = await trx.selectFrom('loyalty_transactions').select(['type', 'points'])
    .where('tenant_id', '=', tenantId).where('customer_id', '=', customerId).execute();
  return rows.reduce((balance, r) => balance + (CREDIT_TYPES.has(r.type) ? Number(r.points) : -Number(r.points)), 0);
}

/**
 * Earns points on a completed POS sale, inside the SAME transaction that
 * creates the sale's own rows — so a GL-posting failure here rolls back
 * the whole sale exactly like an inventory shortfall does, and earning
 * happens exactly once per sale regardless of how many times the sale's
 * own revenue journal is later retried (that retry only re-attempts
 * `postSaleJournal`, never re-runs this function).
 *
 * `netAmount` is the sale's grand total MINUS any gift-card-tendered
 * portion — a customer earning points by paying with money that was
 * itself a prior reward (a gift card, and in a future pass, redeemed
 * points) would let a reward compound on itself. Returns null (a true
 * no-op, nothing written) when the program is off, there's no customer on
 * the sale, or the computed points round down to zero.
 */
export async function earnPointsForSale(
  trx: Transaction<Database>, tenantId: string,
  input: { customerId: string | null; saleId: string; saleNumber: string; netAmount: number; currency: string; actorId: string },
): Promise<{ pointsEarned: number; journalEntryId: string } | null> {
  if (!input.customerId || input.netAmount <= 0) return null;
  const program = await getLoyaltyProgram(trx, tenantId);
  if (!program || !program.enabled) return null;

  const pointsEarned = Math.floor(input.netAmount * program.pointsPerCurrencyUnit);
  if (pointsEarned <= 0) return null;
  const value = money(pointsEarned * program.redemptionValuePerPoint);

  const journalEntryId = await GLService.post(tenantId, {
    entryDate: new Date().toISOString().slice(0, 10), description: `Loyalty points earned: ${input.saleNumber}`,
    reference: input.saleNumber, sourceModule: 'AR', sourceId: input.saleId, createdBy: input.actorId,
    lines: [
      { accountCode: '5910', debit: value, credit: 0, description: 'Loyalty points issued', currency: input.currency },
      { accountCode: '2170', debit: 0, credit: value, description: 'Loyalty points liability', currency: input.currency },
    ],
  }, trx);

  await trx.insertInto('loyalty_transactions').values({
    tenant_id: tenantId, customer_id: input.customerId, type: 'earn', points: String(pointsEarned), value: String(value),
    sale_id: input.saleId, journal_entry_id: journalEntryId, created_by: input.actorId,
  }).execute();

  return { pointsEarned, journalEntryId };
}

/**
 * Claws back some fraction of the points a sale earned when that sale (or
 * part of it) is refunded. `ratio` is 1 for a whole-sale refund/void (the
 * entire earn reverses) and the same per-event refund ratio
 * `processItemLevelReturn` already computes for a partial item-level
 * return. Posts its own mirror-image reversing GL entry — it does not
 * touch the sale's own revenue journal entry at all, so it composes
 * cleanly with both GLService.voidEntry (whole-sale) and a fresh
 * reversing entry (item-level) without either needing to know loyalty
 * exists.
 *
 * Known, accepted limitation: several partial item-level returns against
 * the SAME sale each independently floor their own share — like every
 * other per-event proportional split in this codebase, repeated partial
 * returns can drift by a point or two of rounding rather than reconciling
 * exactly against the original earn. A single whole-sale refund/void
 * (the common case) reverses exactly.
 */
export async function reverseLoyaltyEarnForSale(
  trx: Transaction<Database>, tenantId: string, saleId: string, actorId: string, ratio = 1,
): Promise<void> {
  if (ratio <= 0) return;
  const earns = await trx.selectFrom('loyalty_transactions').selectAll()
    .where('tenant_id', '=', tenantId).where('sale_id', '=', saleId).where('type', '=', 'earn').execute();
  for (const earn of earns) {
    const points = Math.floor(Number(earn.points) * ratio);
    const value = money(Number(earn.value) * ratio);
    if (points <= 0 || value <= 0) continue;
    const journalEntryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString().slice(0, 10), description: 'Loyalty points reversed (sale refunded)',
      sourceModule: 'AR', sourceId: saleId, createdBy: actorId,
      lines: [
        { accountCode: '2170', debit: value, credit: 0, description: 'Loyalty points liability reversed' },
        { accountCode: '5910', debit: 0, credit: value, description: 'Loyalty points expense reversed' },
      ],
    }, trx);
    await trx.insertInto('loyalty_transactions').values({
      tenant_id: tenantId, customer_id: earn.customer_id, type: 'reversal', points: String(points), value: String(value),
      sale_id: saleId, journal_entry_id: journalEntryId, created_by: actorId,
    }).execute();
  }
}

/**
 * Redeems points as a POS tender — called inside the same transaction
 * that creates the sale, exactly like gift-card redemption. The caller
 * (pos.routes.ts) already knows the currency `amount` this tender is
 * worth; this function's job is to validate that `points * the program's
 * current redemption_value_per_point` actually equals that amount (within
 * rounding), then draw the points down for real. Posting the GL side
 * here — not in postSaleJournal — keeps pos.routes.ts's main sale journal
 * unaware that loyalty exists at all, the same separation gift cards use.
 */
export async function redeemPointsForSale(
  trx: Transaction<Database>, tenantId: string,
  input: { customerId: string; points: number; amount: number; saleId: string; saleNumber: string; currency: string; actorId: string },
): Promise<void> {
  const program = await getLoyaltyProgram(trx, tenantId);
  if (!program || !program.enabled) {
    throw Object.assign(new Error('The loyalty program is not active for this workspace.'), { statusCode: 422 });
  }
  const expectedValue = money(input.points * program.redemptionValuePerPoint);
  if (Math.abs(expectedValue - input.amount) > 0.01) {
    throw Object.assign(new Error(`${input.points} points are worth ${expectedValue}, not ${input.amount}.`), { statusCode: 422 });
  }
  const balance = await computeLoyaltyBalance(trx, tenantId, input.customerId);
  if (input.points > balance + 1e-9) {
    throw Object.assign(new Error(`This customer only has ${balance} loyalty points.`), { statusCode: 422 });
  }

  const journalEntryId = await GLService.post(tenantId, {
    entryDate: new Date().toISOString().slice(0, 10), description: `Loyalty points redeemed: ${input.saleNumber}`,
    reference: input.saleNumber, sourceModule: 'AR', sourceId: input.saleId, createdBy: input.actorId,
    lines: [
      { accountCode: '2170', debit: input.amount, credit: 0, description: 'Loyalty points redeemed', currency: input.currency },
      { accountCode: '4500', debit: 0, credit: input.amount, description: 'POS revenue (paid in loyalty points)', currency: input.currency },
    ],
  }, trx);

  await trx.insertInto('loyalty_transactions').values({
    tenant_id: tenantId, customer_id: input.customerId, type: 'redeem', points: String(input.points), value: String(input.amount),
    sale_id: input.saleId, journal_entry_id: journalEntryId, created_by: input.actorId,
  }).execute();
}

/**
 * Restores points to a customer when a sale that redeemed them is
 * refunded or partially returned. Posts no GL of its own — the GL side is
 * always handled by whatever already reverses the sale's original
 * journal entry (GLService.voidEntry for a whole-sale refund, a fresh
 * reversing entry for an item-level return), both of which already credit
 * back the same `2170` liability this redemption debited.
 */
export async function refundRedeemedPoints(
  trx: Transaction<Database>, tenantId: string,
  input: { customerId: string; points: number; saleId: string; actorId: string },
): Promise<void> {
  if (input.points <= 0) return;
  await trx.insertInto('loyalty_transactions').values({
    tenant_id: tenantId, customer_id: input.customerId, type: 'refund', points: String(input.points), value: '0',
    sale_id: input.saleId, created_by: input.actorId,
  }).execute();
}
