import crypto from 'crypto';
import { withTenant } from '../db/client.js';
import { decryptSecret } from '../services/onsite-secrets.service.js';
import type { OndiEventType } from './audit-chain.js';

interface SiemExportConfig {
  enabled?: boolean;
  webhookUrl?: string;
  /** Encrypted at rest — see SECRET_FIELDS_BY_KEY in settings.routes.ts. */
  secret?: string;
}

/**
 * Generic SIEM/webhook export of Ondi's audit chain — a Stripe/GitHub-style
 * signed webhook (any SIEM that can ingest an HMAC-signed HTTPS POST can
 * consume this: Splunk HEC, Sentinel's Logic Apps trigger, Datadog's
 * webhook intake, or a tenant's own collector) rather than a bespoke
 * integration for one specific vendor. This is the "SIEM webhook dispatch"
 * audit-chain.ts's own header comment noted as deferred when this file's
 * event taxonomy was first ported in.
 *
 * Fire-and-forget by design: called from recordAuthEvent without being
 * awaited, and every failure path here is swallowed rather than thrown —
 * an unreachable or slow SIEM endpoint must never add latency to, or block,
 * the auth flow the event is reporting on. Same "never throws" discipline
 * recordAuthEvent already holds itself to.
 */
export function dispatchSiemExport(
  tenantId: string,
  event: { id: string; eventType: OndiEventType; userId: string | null; metadata: Record<string, unknown>; createdAt: string },
): void {
  withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!row) return;
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    const config: SiemExportConfig | undefined = settings?.siemExport;
    if (!config?.enabled || !config.webhookUrl || !config.secret) return;

    const payload = JSON.stringify({
      id: event.id,
      tenant_id: tenantId,
      event_type: event.eventType,
      user_id: event.userId,
      metadata: event.metadata,
      occurred_at: event.createdAt,
    });
    const signature = crypto.createHmac('sha256', decryptSecret(config.secret)).update(payload).digest('hex');

    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ondi-Signature': `sha256=${signature}` },
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
  }).catch(() => { /* must never affect the auth flow it's reporting on */ });
}
