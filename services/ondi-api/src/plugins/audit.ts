/**
 * plugins/audit.ts
 *
 * Tamper-proof audit service using SHA-256 hash chaining.
 *
 * Chain invariant:
 *   entryHash = SHA-256(id | entityType | entityId | action | performedBy | JSON(metadata) | previousHash)
 *
 * Any modification to a historical record breaks the chain from that point forward.
 * Chain integrity can be verified at any time via GET /audit/verify-chain.
 */

import fp from 'fastify-plugin';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';

export type AuditActionKey =
  | 'KYC_SUBMITTED' | 'KYC_VERIFIED' | 'KYC_REJECTED'
  | 'KYB_SUBMITTED' | 'KYB_VERIFIED' | 'KYB_REJECTED'
  | 'ORG_CREATED' | 'TEAM_INVITE_SENT' | 'TEAM_MEMBER_JOINED' | 'ROLE_CHANGED' | 'MEMBER_REMOVED'
  | 'DIRECTOR_ADDED' | 'DIRECTOR_VERIFIED'
  | 'LOGIN_SUCCESS'  | 'LOGIN_FAILED'
  | 'OTP_ISSUED'     | 'OTP_USED'    | 'OTP_EXPIRED'
  | 'DEVICE_TRUSTED' | 'DEVICE_REMOVED' | 'DEVICE_LOCKED' | 'DEVICE_UNLOCKED' | 'DEVICE_PAIRED' | 'SESSION_REVOKED'
  | 'ACCESS_GRANTED' | 'ACCESS_DENIED'  | 'ACCESS_REQUESTED' | 'STEP_UP_TRIGGERED' | 'STEP_UP_COMPLETED'
  | 'CREDIT_EVALUATED' | 'LOAN_ISSUED' | 'LOAN_REPAID' | 'LOAN_DEFAULTED'
  | 'ADMIN_VERIFY'   | 'ADMIN_REJECT'  | 'ADMIN_UPDATE'
  | 'CONSENT_GRANTED'| 'CONSENT_REVOKED'
  | 'MFA_ENROLLED'   | 'MFA_VERIFIED'  | 'MFA_FAILED'
  | 'PASSKEY_ADDED'  | 'PASSKEY_REMOVED'
  | 'PROFILE_UPDATED'| 'SECURITY_CODE_SET' | 'TOKEN_REFRESHED'
  | 'VAULT_CONFIGURED' | 'VAULT_ITEM_CREATED' | 'VAULT_ITEM_UPDATED' | 'VAULT_ITEM_DELETED'
  | 'VAULT_ITEM_SHARED' | 'VAULT_SHARE_REVOKED'
  | 'RECOVERY_CONTACT_ADDED' | 'RECOVERY_CONTACT_REMOVED'
  | 'RECOVERY_REQUESTED' | 'RECOVERY_APPROVED' | 'RECOVERY_DENIED' | 'RECOVERY_COMPLETED'
  | 'AUTOMATION_RUN_TRIGGERED'
  | 'ACCOUNT_DELETION_REQUESTED' | 'ACCOUNT_DELETED';

export type AuditCategoryKey = 'AUTH' | 'IDENTITY' | 'CREDIT' | 'ACCESS' | 'ADMIN' | 'CONSENT' | 'FRAUD';
export type AuditSeverityKey = 'INFO' | 'WARNING' | 'CRITICAL';

export interface WriteAuditParams {
  entityType:   'USER' | 'ORG' | 'CREDENTIAL';
  entityId:     string;
  action:       AuditActionKey;
  category:     AuditCategoryKey;
  performedBy:  string;
  /**
   * The org this event happened in, when the caller has one — populated by
   * org-scoped routes (lib/org-auth.ts's requireMember/requirePermission call
   * sites). Used solely to target SIEM webhook dispatch (below); omit it and
   * the event is written normally but never pushed to any OrgWebhookConfig.
   */
  organizationId?: string;
  ipAddress?:   string;
  userAgent?:   string;
  before?:      Record<string, any>;
  after?:       Record<string, any>;
  metadata?:    Record<string, any>;
  severity?:    AuditSeverityKey;
  isRegulatory?: boolean;
}

function computeEntryHash(params: {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  metadata: any;
  previousHash: string | null;
}): string {
  const payload = [
    params.id,
    params.entityType,
    params.entityId,
    params.action,
    params.performedBy,
    JSON.stringify(params.metadata ?? null),
    params.previousHash ?? 'GENESIS',
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Enqueues one webhook-delivery job per enabled OrgWebhookConfig that opted
 * into this event's category (empty eventTypes = all categories). Actual
 * HTTP delivery + HMAC signing happens in the worker (plugins/queue.ts) so
 * a slow/unreachable SIEM endpoint can never slow down an audit write.
 */
async function dispatchToWebhooks(
  app: FastifyInstance, organizationId: string, payload: Record<string, unknown>,
): Promise<void> {
  const configs = await app.prisma.orgWebhookConfig.findMany({
    where: { organizationId, isEnabled: true },
  });
  for (const config of configs) {
    if (config.eventTypes.length > 0 && !config.eventTypes.includes(payload.category as string)) continue;
    await app.queues.webhookDelivery.add('deliver', {
      configId: config.id, url: config.url, secret: config.secret, payload,
    }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    audit: {
      write(params: WriteAuditParams): Promise<string>;
      verifyChain(limit?: number): Promise<{ valid: boolean; broken_at?: string; checked: number }>;
    };
  }
}

async function _auditPlugin(app: FastifyInstance) {
  const audit = {

    async write(params: WriteAuditParams): Promise<string> {
      // Fetch the most recent entry to get the chain tip
      const last = await app.prisma.auditLog.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { entryHash: true },
      });

      const id = crypto.randomUUID();
      const entryHash = computeEntryHash({
        id,
        entityType:   params.entityType,
        entityId:     params.entityId,
        action:       params.action,
        performedBy:  params.performedBy,
        metadata:     params.metadata,
        previousHash: last?.entryHash ?? null,
      });

      await app.prisma.auditLog.create({
        data: {
          id,
          entityType:     params.entityType,
          entityId:       params.entityId,
          action:         params.action,
          category:       params.category,
          performedBy:    params.performedBy,
          organizationId: params.organizationId,
          ipAddress:      params.ipAddress,
          userAgent:      params.userAgent,
          before:         params.before,
          after:          params.after,
          metadata:       params.metadata,
          previousHash:   last?.entryHash ?? null,
          entryHash,
          severity:       params.severity     ?? 'INFO',
          isRegulatory:   params.isRegulatory ?? false,
        },
      });

      // SIEM push — fire-and-forget, never blocks or fails the write path
      // above. Only org-scoped events (organizationId set) can match any
      // OrgWebhookConfig at all.
      if (params.organizationId) {
        dispatchToWebhooks(app, params.organizationId, {
          id, entityType: params.entityType, entityId: params.entityId, action: params.action,
          category: params.category, performedBy: params.performedBy, metadata: params.metadata ?? null,
          severity: params.severity ?? 'INFO', timestamp: new Date().toISOString(),
        }).catch(err => app.log.error(err, 'Failed to enqueue SIEM webhook dispatch'));
      }

      return entryHash;
    },

    /**
     * Walk the chain oldest → newest, recomputing each hash.
     * Returns the first broken entry if the chain has been tampered with.
     */
    async verifyChain(limit = 10_000): Promise<{ valid: boolean; broken_at?: string; checked: number }> {
      const entries = await app.prisma.auditLog.findMany({
        orderBy: { timestamp: 'asc' },
        take:    limit,
        select: {
          id: true, entityType: true, entityId: true, action: true,
          performedBy: true, metadata: true, previousHash: true, entryHash: true,
        },
      });

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const expected = computeEntryHash({
          id:           e.id,
          entityType:   e.entityType,
          entityId:     e.entityId,
          action:       e.action,
          performedBy:  e.performedBy,
          metadata:     e.metadata,
          previousHash: e.previousHash,
        });
        if (expected !== e.entryHash) {
          return { valid: false, broken_at: e.id, checked: i + 1 };
        }
      }

      return { valid: true, checked: entries.length };
    },
  };

  app.decorate('audit', audit);
}

export const auditPlugin = fp(_auditPlugin, { name: 'audit' });

