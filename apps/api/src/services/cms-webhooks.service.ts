import crypto from 'node:crypto';
import { withTenant } from '../db/client.js';
import type { CmsWebhook, CreateCmsWebhookInput, UpdateCmsWebhookInput, CmsWebhookEvent } from '@hudumika/types';

function toWebhook(row: any, includeSecret: boolean): CmsWebhook {
  return {
    id: row.id, tenant_id: row.tenant_id, url: row.url,
    ...(includeSecret ? { secret: row.secret as string } : {}),
    events: typeof row.events === 'string' ? JSON.parse(row.events) : (row.events ?? []),
    enabled: !!row.enabled,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
  };
}

function checkUrl(url: string) {
  if (!/^https?:\/\//.test(url)) throw new Error('Webhook URL must start with http:// or https://.');
}

/**
 * §78 of the CMS master brief — real outbound webhooks. The event points
 * (a page/post/entry becoming published, a media upload) already existed in
 * code; this is wiring a real dispatch onto them, not new architecture.
 * Deliberately best-effort: fire-and-forget with no retry queue and no
 * delivery log yet — a real, disclosed scope line, not hidden behind a
 * confident-looking "Delivered" status this doesn't actually track.
 */
export class CMSWebhooksService {
  static async list(tenantId: string): Promise<CmsWebhook[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_webhooks').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').execute();
      return rows.map(r => toWebhook(r, false));
    });
  }

  /** The signing secret is returned only from this one call, right after
   *  creation — every later read (list/update) omits it, the same "shown
   *  once" posture the platform's own API-key issuance already uses. */
  static async create(tenantId: string, userId: string, input: CreateCmsWebhookInput): Promise<CmsWebhook> {
    checkUrl(input.url);
    const secret = crypto.randomBytes(32).toString('hex');
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('cms_webhooks').values({
        tenant_id: tenantId, url: input.url, secret,
        events: JSON.stringify(input.events ?? []), created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return toWebhook(row, true);
    });
  }

  static async update(tenantId: string, id: string, input: UpdateCmsWebhookInput): Promise<CmsWebhook> {
    if (input.url !== undefined) checkUrl(input.url);
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.url !== undefined) update['url'] = input.url;
      if (input.events !== undefined) update['events'] = JSON.stringify(input.events);
      if (input.enabled !== undefined) update['enabled'] = input.enabled;
      const row = await trx.updateTable('cms_webhooks').set(update)
        .where('id', '=', id).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst();
      // HUD-0130: was executeTakeFirstOrThrow() — a wrong/stale id crashed
      // with Kysely's own raw "no result" instead of a clean 404.
      if (!row) throw new Error('Webhook not found.');
      return toWebhook(row, false);
    });
  }

  static async delete(tenantId: string, id: string): Promise<void> {
    await withTenant(tenantId, trx => trx.deleteFrom('cms_webhooks')
      .where('id', '=', id).where('tenant_id', '=', tenantId).execute());
  }

  /** Fire-and-forget — never awaited by a caller, never throws into the
   *  request that triggered it (every call site wraps this as a side effect
   *  after its own real work already succeeded). */
  static dispatchEvent(tenantId: string, event: CmsWebhookEvent, data: Record<string, unknown>): void {
    withTenant(tenantId, async (trx) => {
      const hooks = await trx.selectFrom('cms_webhooks').selectAll()
        .where('tenant_id', '=', tenantId).where('enabled', '=', true).execute();
      if (hooks.length === 0) return;
      const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
      for (const hook of hooks) {
        const events: string[] = typeof hook.events === 'string' ? JSON.parse(hook.events) : (hook.events ?? []);
        if (!events.includes(event)) continue;
        const signature = crypto.createHmac('sha256', hook.secret).update(payload).digest('hex');
        fetch(hook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Hudumika-Signature': signature, 'X-Hudumika-Event': event },
          body: payload,
        }).catch(() => { /* best-effort — no retry, no delivery log */ });
      }
    }).catch(() => { /* tenant/db lookup itself failing must never affect the caller */ });
  }

  /** A real end-to-end send, for the admin "Test" button — same signing
   *  path dispatchEvent uses, so a green result actually means something. */
  static async sendTest(tenantId: string, id: string): Promise<{ ok: boolean; status?: number; error?: string }> {
    const hook = await withTenant(tenantId, trx => trx.selectFrom('cms_webhooks').selectAll()
      .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    // HUD-0130: was executeTakeFirstOrThrow() — a wrong/stale id crashed
    // with Kysely's own raw "no result" instead of a clean 404.
    if (!hook) throw new Error('Webhook not found.');
    const payload = JSON.stringify({ event: 'test', data: { message: 'This is a test event from Hudumika CMS.' }, timestamp: new Date().toISOString() });
    const signature = crypto.createHmac('sha256', hook.secret).update(payload).digest('hex');
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hudumika-Signature': signature, 'X-Hudumika-Event': 'test' },
        body: payload,
      });
      return { ok: res.ok, status: res.status };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Request failed.' };
    }
  }
}
