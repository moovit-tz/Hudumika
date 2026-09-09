// ─── HuduBI — semantic entity resolution (Phase M5) ─────────────────────────
// "Resist the urge to build a full graph-relationship engine before one
// real cross-app query needs it" — this is that one real query, not a
// generic dynamic-SQL executor driven by arbitrary registry rows (which
// would be a real injection surface once anyone besides this migration can
// write to semantic_entities). The registry is read here to know WHICH
// apps register a resolver for 'customer' and to describe them to the
// caller — the actual join for each app is a plain, specific, safe query
// below. A future app added to the registry needs a matching case here;
// that's the deliberate boundary, not an oversight.
import { dbPlatform } from '../db/client.js';

export interface CrossAppCustomerHit {
  app: string;
  table_name: string;
  record_id: string;
  matched_via: 'client_id' | 'email' | 'user_id';
  summary: string; // human-readable: what this record actually is
}

export interface CustomerEntityResolution {
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  registered_apps: Array<{ app: string; table_name: string; description: string | null }>;
  hits: CrossAppCustomerHit[];
}

/** The one real cross-app join this phase builds: a CRM customer resolved
 *  against Sign, two ways — the structured client_id FK (426, unambiguous)
 *  and a fuzzy email match on sign_recipients (for a document sent before
 *  client_id existed, or by someone who typed an email instead of picking
 *  the customer from the picker). Both are real; neither is invented. */
export async function resolveCustomerAcrossApps(tenantId: string, customerId: string): Promise<CustomerEntityResolution | null> {
  const customer = await dbPlatform.selectFrom('customers').select(['id', 'name', 'email'])
    .where('id', '=', customerId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!customer) return null;

  const registeredApps = await dbPlatform.selectFrom('semantic_entities')
    .select(['app', 'table_name', 'description'])
    .where('entity_key', '=', 'customer')
    .execute();

  const hits: CrossAppCustomerHit[] = [];

  // Structured link — sign_envelopes.client_id (426).
  const byClientId = await dbPlatform.selectFrom('sign_envelopes')
    .select(['id', 'title', 'status'])
    .where('tenant_id', '=', tenantId).where('client_id', '=', customerId)
    .execute();
  for (const e of byClientId) {
    hits.push({ app: 'sign', table_name: 'sign_envelopes', record_id: e.id, matched_via: 'client_id', summary: `"${e.title}" (${e.status})` });
  }

  // Fuzzy link — sign_recipients.email, only for envelopes not already
  // caught above (an envelope can have both client_id set AND a recipient
  // whose email happens to match — dedup by envelope, not by recipient row).
  if (customer.email) {
    const byEmail = await dbPlatform.selectFrom('sign_recipients as r')
      .innerJoin('sign_envelopes as e', 'e.id', 'r.envelope_id')
      .select(['e.id', 'e.title', 'e.status', 'e.client_id'])
      .where('r.tenant_id', '=', tenantId).where('r.email', '=', customer.email)
      .execute();
    const alreadyHit = new Set(hits.map(h => h.record_id));
    for (const e of byEmail) {
      if (e.client_id === customerId || alreadyHit.has(e.id)) continue; // already caught above
      alreadyHit.add(e.id);
      hits.push({ app: 'sign', table_name: 'sign_envelopes', record_id: e.id, matched_via: 'email', summary: `"${e.title}" (${e.status}) — recipient email matches, not linked by customer record` });
    }
  }

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    customer_email: customer.email,
    registered_apps: registeredApps,
    hits,
  };
}
