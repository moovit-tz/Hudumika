import { withTenant } from '../db/client.js';

// Workspace ▸ Settings ▸ Finance ▸ Payment Gateways (Settings.tsx's
// PaymentGatewaysSection) previously had no consumer anywhere in the
// codebase: real UI, a real "Test Connection" probe against the provider's
// own API, real persistence via PATCH /v1/settings — and nothing downstream
// ever read what was saved. This makes it the actual source of truth for
// "which gateway is this tenant's own", read by any tenant-scoped flow that
// needs to know (currently Petti's wallet deposit — see petti.service.ts).
//
// Deliberately NOT wired into integrations/payments.ts's onboarding
// simulateCharge(): that flow runs pre-tenant, while a signup is still being
// created — there is no tenant_settings row to read yet, so "this tenant's
// configured gateway" is a question that doesn't have an answer at that
// point in the flow. The two stay separate concerns, same as before.
export interface ActiveGateway {
  id: string;
  sandbox: boolean;
  /** The raw per-gateway fields submitted on the Settings form (clientId,
   *  clientSecret, apiKey, publicKey, ...) — whatever that provider's
   *  `configFields`/test-connection case expects. Needed by anything that
   *  wants to actually *use* the gateway (place a charge), not just report
   *  that one is configured. */
  config: Record<string, string>;
}

/** The first gateway this tenant has switched on in Settings, if any — the
 *  UI's own "N of M gateways active" count implies at most one is meant to
 *  actually be live at a time (there is no separate "default" picker), so
 *  first-enabled is the natural precedence. Real merchant credentials or a
 *  live provider SDK are a separate, later step — this only answers
 *  "is a gateway configured", not "can we actually charge a card". */
export async function getActiveGateway(tenantId: string): Promise<ActiveGateway | null> {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings')
      .where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!row) return null;
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    for (const key of Object.keys(settings || {})) {
      if (!key.startsWith('gw-')) continue;
      const gw = settings[key];
      if (gw && gw.enabled) {
        const { enabled, sandbox, ...config } = gw;
        return { id: key.slice(3), sandbox: !!sandbox, config };
      }
    }
    return null;
  });
}

/** Every `gw-*` key this tenant has ever saved in Settings, enabled or not —
 *  unlike getActiveGateway() above, which stops at the first enabled one.
 *  Built for the Gateways catalog view (Petti and, later, anywhere else
 *  that wants to show "which of our options are actually connected" rather
 *  than just "which one is live"). Never returns credential values — only
 *  the fact that a gateway has been configured, and whether it's on. */
export async function getConfiguredGateways(tenantId: string): Promise<Record<string, { enabled: boolean; sandbox: boolean }>> {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings')
      .where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!row) return {};
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    const out: Record<string, { enabled: boolean; sandbox: boolean }> = {};
    for (const key of Object.keys(settings || {})) {
      if (!key.startsWith('gw-')) continue;
      const gw = settings[key];
      if (!gw) continue;
      out[key.slice(3)] = { enabled: !!gw.enabled, sandbox: !!gw.sandbox };
    }
    return out;
  });
}
