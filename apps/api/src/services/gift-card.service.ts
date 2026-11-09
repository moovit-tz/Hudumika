import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

// 'issue'/'reload'/'refund' increase the spendable balance; 'redeem' and
// 'void_writeoff' decrease it — see migration 729's own comment. A card's
// balance is always derived fresh from this table, the same convention
// customer_credits/petti_wallets/fintech wallets already use, never a
// mutable counter on gift_cards itself.
const CREDIT_TYPES = new Set(['issue', 'reload', 'refund']);

export async function computeGiftCardBalance(trx: Transaction<Database>, tenantId: string, giftCardId: string): Promise<number> {
  const rows = await trx.selectFrom('gift_card_transactions').select(['type', 'amount'])
    .where('tenant_id', '=', tenantId).where('gift_card_id', '=', giftCardId).execute();
  return rows.reduce((balance, r) => balance + (CREDIT_TYPES.has(r.type) ? Number(r.amount) : -Number(r.amount)), 0);
}

export function normalizeGiftCardCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Draws down a gift card's balance at POS checkout — called from inside
 * the same transaction that creates the sale, so a bad/expired/insufficient
 * code rolls back the whole sale exactly like an inventory shortfall does.
 * Locks the `gift_cards` row first (`.forUpdate()`), which also serializes
 * concurrent redemptions against the same card, since each one must take
 * that lock before computing a balance from `gift_card_transactions`.
 */
export async function redeemGiftCard(
  trx: Transaction<Database>, tenantId: string,
  input: { code: string; amount: number; saleId: string; actorId: string },
): Promise<{ giftCardId: string }> {
  const code = normalizeGiftCardCode(input.code);
  const card = await trx.selectFrom('gift_cards').selectAll()
    .where('tenant_id', '=', tenantId).where('code', '=', code).forUpdate().executeTakeFirst();
  if (!card) throw Object.assign(new Error(`Gift card ${code} was not found.`), { statusCode: 422 });
  if (card.status !== 'active') throw Object.assign(new Error(`Gift card ${code} is no longer active.`), { statusCode: 422 });
  if (card.expires_at && new Date(card.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error(`Gift card ${code} expired on ${new Date(card.expires_at).toISOString().slice(0, 10)}.`), { statusCode: 422 });
  }
  const balance = await computeGiftCardBalance(trx, tenantId, card.id);
  if (input.amount > balance + 1e-9) {
    throw Object.assign(new Error(`Gift card ${code} only has ${balance.toLocaleString()} remaining.`), { statusCode: 422 });
  }
  await trx.insertInto('gift_card_transactions').values({
    tenant_id: tenantId, gift_card_id: card.id, type: 'redeem', amount: String(input.amount),
    sale_id: input.saleId, created_by: input.actorId,
  }).execute();
  return { giftCardId: card.id };
}

/**
 * Restores balance to a specific gift card when a sale that redeemed it is
 * refunded or partially returned. Deliberately posts no GL entry of its
 * own — the GL side of a refund is always handled by whatever already
 * reverses the sale's original journal entry (GLService.voidEntry for a
 * whole-sale refund, a fresh reversing entry for an item-level return),
 * both of which already credit back the same `2160` liability account this
 * card's original redemption debited. This function only updates the
 * app-level spendable-balance ledger so the card can be used again.
 */
export async function refundGiftCard(
  trx: Transaction<Database>, tenantId: string,
  input: { giftCardId: string; amount: number; saleId: string; actorId: string },
): Promise<void> {
  if (input.amount <= 0) return;
  await trx.insertInto('gift_card_transactions').values({
    tenant_id: tenantId, gift_card_id: input.giftCardId, type: 'refund', amount: String(input.amount),
    sale_id: input.saleId, created_by: input.actorId,
  }).execute();
}
