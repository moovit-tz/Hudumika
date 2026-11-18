import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { encryptLensCredential, decryptLensCredential, verifyHmacSha256, verifySlackSignature } from '../services/lens-crypto.service.js';
import { ingestWebhook } from '../services/lens-inbox.service.js';
import { emitLensOutboxEvent, processLensOutbox } from '../services/lens-outbox.service.js';
import { createSnapshot, getSnapshotContent, prepareSnapshotRestore } from '../services/lens-snapshot.service.js';
import { intakeReport } from '../services/lens-intake.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

let tenant: TestTenant;

beforeAll(async () => {
  tenant = await createTestTenant('TENANT_ADMIN');
}, 120000);

afterAll(async () => {
  if (tenant) await tenant.cleanup();
}, 120000);

describe('Lens Production Architecture', () => {
  // ── 1. Cryptographic Security & Signatures ──────────────────────────────
  describe('Crypto & Credential Safety', () => {
    it('encrypts and decrypts provider credentials safely using AES-256-GCM', () => {
      const token = 'ghp_secretToken_1234567890abcdef';
      const encrypted = encryptLensCredential(token);
      expect(encrypted).not.toBe(token);
      expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext

      const decrypted = decryptLensCredential(encrypted);
      expect(decrypted).toBe(token);
    });

    it('verifies valid HMAC-SHA256 webhook signatures and rejects invalid ones', () => {
      const payload = JSON.stringify({ action: 'opened', issue: { number: 42 } });
      const secret = 'webhook_secret_key_999';

      // Compute valid signature
      const { createHmac } = require('node:crypto');
      const validSig = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
      const invalidSig = 'sha256=' + '0000000000000000000000000000000000000000000000000000000000000000';

      expect(verifyHmacSha256(payload, secret, validSig)).toBe(true);
      expect(verifyHmacSha256(payload, secret, invalidSig)).toBe(false);
      expect(verifyHmacSha256(payload, 'wrong_secret', validSig)).toBe(false);
    });

    it('verifies Slack timestamped v0 signatures with replay window protection', () => {
      const rawBody = 'command=%2Flens&text=status';
      const secret = 'slack_signing_secret_xyz';
      const nowTs = Math.floor(Date.now() / 1000).toString();

      const { createHmac } = require('node:crypto');
      const sigBase = `v0:${nowTs}:${rawBody}`;
      const validSig = 'v0=' + createHmac('sha256', secret).update(sigBase).digest('hex');

      expect(verifySlackSignature(rawBody, secret, nowTs, validSig)).toBe(true);

      // Replay attack with timestamp older than 5 minutes should fail
      const oldTs = (Math.floor(Date.now() / 1000) - 600).toString();
      expect(verifySlackSignature(rawBody, secret, oldTs, validSig)).toBe(false);
    });
  });

  // ── 2. Webhook Ingestion & Durable Deduplication ─────────────────────────
  describe('Durable Webhooks Inbox', () => {
    it('persists incoming webhooks and deduplicates identical deliveries', async () => {
      const deliveryId = `test-deliv-${Date.now()}-${Math.random()}`;
      const payload = { test: true, time: Date.now() };

      const first = await ingestWebhook({
        provider: 'github',
        eventType: 'ping',
        deliveryId,
        rawBody: JSON.stringify(payload),
        payload,
      });

      expect(first.accepted).toBe(true);
      expect(first.duplicate).toBe(false);
      expect(first.inboxId).toBeDefined();

      // Second identical delivery
      const second = await ingestWebhook({
        provider: 'github',
        eventType: 'ping',
        deliveryId,
        rawBody: JSON.stringify(payload),
        payload,
      });

      expect(second.accepted).toBe(true);
      expect(second.duplicate).toBe(true);
      expect(second.inboxId).toBe(first.inboxId);
    });
  });

  // ── 3. All-App Defect Reporting Intake ───────────────────────────────────
  describe('All-App Defect Reporting Intake', () => {
    it('sanitizes client context and records defect report linked to reporter and tenant', async () => {
      const res = await intakeReport({
        sourceApp: 'clearos',
        sourceRoute: '/shipments/SH-001',
        tenantId: tenant.tenantId,
        reporter: {
          id: tenant.userId,
          email: 'agent@test.org',
          name: 'Clearing Agent',
          role: 'MANAGER',
        },
        title: 'Customs declaration status failed to refresh',
        summary: 'Clicking refresh displays error code 502',
        stepsToReproduce: '1. Open shipment SH-001\n2. Click refresh status',
        expectedBehavior: 'Status updates to RELEASED',
        actualBehavior: 'Spinner hangs and 502 error shows',
        severity: 'HIGH',
        clientContext: {
          browser: 'Chrome 131',
          url: 'http://localhost:5173/shipments/SH-001',
          authorization: 'Bearer secret_jwt_token_here',
          apiKey: 'key_live_999',
          sessionCookie: 'sid=sensitive_session_value',
        },
        autoCreateLensItem: false,
      });

      expect(res.report.id).toBeDefined();
      expect(res.report.source_app).toBe('clearos');
      expect(res.report.tenant_id).toBe(tenant.tenantId);
      expect(res.report.status).toBe('NEW');

      // Sensitive fields must be sanitized/redacted!
      expect(res.report.client_context.authorization).toBe('[REDACTED]');
      expect(res.report.client_context.apiKey).toBe('[REDACTED]');
      expect(res.report.client_context.sessionCookie).toBe('[REDACTED]');
      expect(res.report.client_context.browser).toBe('Chrome 131');
    });

    it('rejects invalid or unknown app IDs', async () => {
      await expect(intakeReport({
        sourceApp: 'nonexistent_fake_app',
        title: 'test',
        summary: 'test',
        reporter: { id: tenant.userId },
      })).rejects.toThrow(/Invalid source app/);
    });
  });

  // ── 4. Code & File Snapshots ─────────────────────────────────────────────
  describe('Snapshots & Recovery Artifacts', () => {
    it('captures patch snapshot, verifies SHA-256 checksum, and enables verified restore', async () => {
      const patchContent = `diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-const vat = 0;\n+const vat = 0.18;`;

      const snap = await createSnapshot({
        snapshotType: 'working_tree_patch',
        branchLabel: 'fix/vat-rounding',
        reason: 'Reproduction patch for statutory VAT calculation',
        createdBy: tenant.userId,
        rawContent: patchContent,
        manifest: { fileCount: 1, files: [{ path: 'app.ts', size: patchContent.length }] },
      });

      expect(snap.id).toBeDefined();
      expect(snap.status).toBe('READY');
      expect(snap.size_bytes).toBe(patchContent.length);
      expect(snap.checksum_sha256).toBeDefined();

      // Verify content read-back
      const { content, verified } = await getSnapshotContent(snap.id);
      expect(verified).toBe(true);
      expect(content.toString('utf8')).toBe(patchContent);

      // Verify restore preview
      const preview = await prepareSnapshotRestore(snap.id);
      expect(preview.snapshotId).toBe(snap.id);
      expect(preview.checksum).toBe(snap.checksum_sha256);
      expect(preview.downloadUrl).toBeDefined();
    });
  });

  // ── 5. Durable Outbox & Worker Leasing ───────────────────────────────────
  describe('Durable Outbox Queue', () => {
    it('emits outbox event and processes lease without dropping notification', async () => {
      const eventId = await emitLensOutboxEvent({
        eventName: 'lens.test.event',
        aggregateId: 'test-agg-1',
        payload: { message: 'hello from lens outbox' },
      });

      expect(eventId).toBeDefined();

      const result = await processLensOutbox(10);
      expect(result.processed).toBeGreaterThanOrEqual(1);

      // Verify record is marked delivered
      const row = await dbPlatform.selectFrom('lens_outbox_events')
        .selectAll().where('id', '=', eventId).executeTakeFirst();
      expect(row?.status).toBe('delivered');
      expect(row?.lease_id).toBeNull();
    });
  });

  // ── 6. Resolution & Closure Enforcement ──────────────────────────────────
  describe('Closure Resolution Enforcement', () => {
    it('preserves existing platform projects and LTS release seeds', async () => {
      const project = await dbPlatform.selectFrom('lens_projects')
        .selectAll().where('key', '=', 'HUD').executeTakeFirst();
      expect(project).toBeDefined();
      expect(project?.name).toContain('Hudumika');

      const release = await dbPlatform.selectFrom('lens_releases')
        .selectAll().where('version', '=', 'v1.0.0-lts').executeTakeFirst();
      expect(release).toBeDefined();
      expect(release?.status).toBe('RELEASED');
    });
  });
});
