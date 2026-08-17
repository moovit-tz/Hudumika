import { db } from '../db/client.js';
import { decryptSecret } from '../services/onsite-secrets.service.js';

/**
 * Verifies a Google reCAPTCHA response token against the tenant's own
 * configured secret key (settings.int-google.rcSecret, set via Settings →
 * Integrations → Google). Returns true (allow) whenever the tenant hasn't
 * enabled reCAPTCHA or hasn't configured a secret yet — same "skip until
 * configured" behavior as the webhook signature checks in webhooks.routes.ts,
 * rather than rejecting every request against a secret that doesn't exist.
 */
export async function verifyRecaptcha(tenantId: string, token: string | undefined): Promise<boolean> {
  const row = await db.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!row) return true;

  const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
  const cfg = settings?.['int-google'];
  if (!cfg?.rc || !cfg?.rcSecret) return true;

  if (!token) return false;

  const secret = decryptSecret(cfg.rcSecret);
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!res.ok) return false;
  const data = await res.json() as { success?: boolean };
  return data.success === true;
}
