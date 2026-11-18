import { dbPlatform } from '../db/client.js';
import { verifyHmacSha256, verifySlackSignature, decryptLensCredential } from './lens-crypto.service.js';

export interface WebhookEnvelope {
  provider: string;
  eventType: string;
  deliveryId: string;
  signature?: string;
  timestamp?: string;
  rawBody: string;
  payload: any;
  connectionId?: string;
}

export interface IngestResult {
  accepted: boolean;
  duplicate: boolean;
  verified: boolean;
  status: 'processed' | 'pending' | 'ignored' | 'failed';
  inboxId?: string;
  error?: string;
}

/**
 * Persist incoming webhook envelope with durable deduplication and signature verification.
 */
export async function ingestWebhook(envelope: WebhookEnvelope): Promise<IngestResult> {
  const { provider, eventType, deliveryId, signature, timestamp, rawBody, payload, connectionId } = envelope;

  // 1. Deduplication check by provider + deliveryId
  const existing = await dbPlatform.selectFrom('lens_webhooks_inbox')
    .selectAll()
    .where('provider', '=', provider)
    .where('delivery_id', '=', deliveryId)
    .executeTakeFirst();

  if (existing) {
    return {
      accepted: true,
      duplicate: true,
      verified: existing.signature_verified,
      status: existing.status as any,
      inboxId: existing.id,
    };
  }

  // 2. Signature verification
  let verified = false;
  if (connectionId) {
    const conn = await dbPlatform.selectFrom('lens_connection_instances')
      .selectAll()
      .where('id', '=', connectionId)
      .executeTakeFirst();

    if (conn?.encrypted_webhook_secret) {
      try {
        const secret = decryptLensCredential(conn.encrypted_webhook_secret);
        if (provider === 'slack' && timestamp && signature) {
          verified = verifySlackSignature(rawBody, secret, timestamp, signature);
        } else if (signature) {
          verified = verifyHmacSha256(rawBody, secret, signature);
        }
      } catch {
        verified = false;
      }
    }
  }

  // 3. Durable insert into inbox
  const record = await dbPlatform.insertInto('lens_webhooks_inbox').values({
    connection_id: connectionId ?? null,
    provider,
    event_type: eventType,
    delivery_id: deliveryId,
    signature: signature ?? null,
    signature_verified: verified,
    payload: JSON.stringify(payload) as any,
    status: 'pending',
    attempts: 0,
  }).returningAll().executeTakeFirstOrThrow();

  // 4. Immediate synchronous processing for well-known events
  let processStatus: 'processed' | 'ignored' | 'failed' = 'ignored';
  let errorMessage: string | null = null;

  try {
    const handled = await processWebhookPayload(provider, eventType, payload);
    processStatus = handled ? 'processed' : 'ignored';
  } catch (err: any) {
    processStatus = 'failed';
    errorMessage = err?.message || 'Processing failed';
  }

  await dbPlatform.updateTable('lens_webhooks_inbox').set({
    status: processStatus,
    error_message: errorMessage,
    processed_at: new Date(),
  }).where('id', '=', record.id).execute();

  return {
    accepted: true,
    duplicate: false,
    verified,
    status: processStatus,
    inboxId: record.id,
    error: errorMessage ?? undefined,
  };
}

/**
 * Extract Lens references (e.g., "LENS-42") from text strings.
 */
function extractLensRefs(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\bLENS-\d+\b/gi) || [];
  return [...new Set(matches.map(m => m.toUpperCase()))];
}

/**
 * Handle incoming provider webhooks and correlate with Lens items.
 */
async function processWebhookPayload(provider: string, eventType: string, payload: any): Promise<boolean> {
  if (provider === 'github') {
    if (eventType === 'issues') {
      const issue = payload.issue;
      const action = payload.action;
      if (!issue) return false;

      const refs = extractLensRefs(`${issue.title} ${issue.body || ''}`);
      for (const ref of refs) {
        const item = await dbPlatform.selectFrom('lens_items').select('id')
          .where('ref', '=', ref).executeTakeFirst();
        if (item) {
          await dbPlatform.insertInto('lens_links').values({
            item_id: item.id,
            provider: 'github',
            kind: 'issue',
            external_id: String(issue.number),
            url: issue.html_url,
            title: issue.title,
            external_status: issue.state,
            synced_at: new Date(),
          }).onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doUpdateSet({
            external_status: issue.state,
            synced_at: new Date(),
          })).execute();

          await dbPlatform.insertInto('lens_events').values({
            item_id: item.id,
            kind: 'webhook_github',
            detail: `GitHub issue #${issue.number} ${action}: ${issue.state}`,
            actor_name: payload.sender?.login ?? 'github-webhook',
          }).execute();
        }
      }
      return refs.length > 0;
    }

    if (eventType === 'pull_request') {
      const pr = payload.pull_request;
      const action = payload.action;
      if (!pr) return false;

      const refs = extractLensRefs(`${pr.title} ${pr.body || ''} ${pr.head?.ref || ''}`);
      for (const ref of refs) {
        const item = await dbPlatform.selectFrom('lens_items').select('id')
          .where('ref', '=', ref).executeTakeFirst();
        if (item) {
          const prState = pr.merged ? 'merged' : pr.state;
          await dbPlatform.insertInto('lens_links').values({
            item_id: item.id,
            provider: 'github',
            kind: 'pull_request',
            external_id: String(pr.number),
            url: pr.html_url,
            title: pr.title,
            external_status: prState,
            synced_at: new Date(),
          }).onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doUpdateSet({
            external_status: prState,
            synced_at: new Date(),
          })).execute();

          await dbPlatform.insertInto('lens_events').values({
            item_id: item.id,
            kind: 'webhook_github',
            detail: `GitHub PR #${pr.number} ${action} (${prState})`,
            actor_name: payload.sender?.login ?? 'github-webhook',
          }).execute();
        }
      }
      return refs.length > 0;
    }
  }

  return false;
}
