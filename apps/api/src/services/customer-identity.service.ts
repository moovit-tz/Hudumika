import { withTenant } from '../db/client.js';

/**
 * Which customer a CUSTOMER-role login acts for.
 *
 * Eleven call sites used `user.sub` for this — the login's own id — on the
 * assumption that it is also their `customers` row id. It is not, so every
 * customer-scoped query matched nothing and the whole portal showed a customer
 * none of their own data.
 *
 * Resolved from `users.customer_id` (migration 207). The email fallback is kept
 * for logins created before that column existed and never backfilled, but it is
 * deliberately strict: it takes a match only when exactly one customer in the
 * tenant holds that address. Two matches is not a tie to break — it is a
 * question about who this person is, and answering it by picking the first row
 * is how the original bug would come back wearing different clothes.
 *
 * Returns null when it genuinely cannot tell. A null must be treated as "sees
 * nothing", never as "sees everything" — the difference between an empty portal
 * and one customer reading another's shipments.
 */
const cache = new Map<string, { id: string | null; at: number }>();
const TTL_MS = 60_000;

export async function resolveCustomerId(
  user: { sub: string; tenant_id: string; email?: string; role?: string },
): Promise<string | null> {
  const hit = cache.get(user.sub);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.id;

  const id = await withTenant(user.tenant_id, async (trx) => {
    const row = await trx.selectFrom('users').select(['customer_id', 'email'])
      .where('id', '=', user.sub).where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();

    if (row?.customer_id) return row.customer_id;

    const email = row?.email ?? user.email;
    if (email) {
      const matches = await trx.selectFrom('customers').select('id')
        .where('tenant_id', '=', user.tenant_id)
        .where(eb => eb(eb.fn('lower', ['email']), '=', email.toLowerCase()))
        .limit(2).execute();
      // Exactly one, or nothing. See the note above.
      return matches.length === 1 ? matches[0].id : null;
    }
    return null;
  });

  cache.set(user.sub, { id, at: Date.now() });
  return id;
}

/** Drops a cached link — call after changing who a login belongs to. */
export function forgetCustomerLink(userId: string): void {
  cache.delete(userId);
}
