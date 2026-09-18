// SMS regression suite — first permanent test file for this app. Grew out of
// a one-off scratch script (verify_sms_tmp.ts, since deleted) run by hand to
// verify a pending/incomplete-items pass: real Twilio webhook signature
// verification, inbound-webhook redelivery idempotency, STOP/START opt-out
// symmetry with a confirmation reply, an admin-only guard on reversing a
// consumer-initiated opt-out, and the transient-vs-permanent outbound retry
// boundary. Real HTTP through the actual app (fastify.inject), a real
// Postgres tenant, RLS genuinely enforced — no mocks.
//
// Gateway credentials below are deliberately incomplete (no twilioToken /
// no atKey) so every send fails fast via sendViaGateway's own synchronous
// "not configured" check rather than a real network call — this keeps the
// suite fast and deterministic. That same synchronous-failure path is also
// what's being asserted for the retry boundary: never literally throwing
// there is by design, so it's correctly never marked 'transient' — a
// provider that never actually answers must not be silently retried. The
// complementary genuine-network-throw branch (a real DNS/connection
// failure mid-fetch) was verified once by hand against this app's real
// gateway functions — it isn't re-verified here since forcing a real
// network-level exception deterministically would need a fetch seam this
// codebase deliberately doesn't add (no mocking framework, real HTTP
// everywhere else too).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import { withTenant } from '../db/client.js';
import { encryptJson } from '../services/onsite-secrets.service.js';
import { verifyTwilioSignature, SmsIntegration } from '../integrations/sms.js';
import { SmsService } from '../services/sms.service.js';
import { runSmsOutboxJob } from '../jobs/sms-outbox.job.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

function twilioInboundBody(to: string, from: string, text: string, sid: string) {
  return new URLSearchParams({ To: to, From: from, Body: text, MessageSid: sid }).toString();
}
function atInboundBody(to: string, from: string, text: string) {
  return new URLSearchParams({ to, from, text }).toString();
}

describe('SMS — webhook signature, inbound idempotency, opt-out compliance, retry boundary', () => {
  describe('verifyTwilioSignature (§ Twilio production signature)', () => {
    const authToken = 'test-auth-token-1234';
    const url = 'https://api.hudumika.invalid/v1/sms/webhook/twilio';
    const params: Record<string, string> = { MessageSid: 'SM123', MessageStatus: 'delivered', To: '+255700000000' };
    const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url as string);
    const sig = crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');

    it('accepts a correctly computed signature', () => {
      expect(verifyTwilioSignature(url, params, authToken, sig)).toBe(true);
    });
    it('rejects a tampered param', () => {
      expect(verifyTwilioSignature(url, { ...params, MessageStatus: 'failed' }, authToken, sig)).toBe(false);
    });
    it('rejects a mismatched callback URL', () => {
      expect(verifyTwilioSignature(url + '/x', params, authToken, sig)).toBe(false);
    });
    it('rejects a garbage header', () => {
      expect(verifyTwilioSignature(url, params, authToken, 'not-a-real-signature')).toBe(false);
    });
    it('fails open (allows) when no gateway auth token is configured yet', () => {
      expect(verifyTwilioSignature(url, params, undefined, undefined)).toBe(true);
    });
    it('fails closed when an auth token is configured but the header is missing', () => {
      expect(verifyTwilioSignature(url, params, authToken, undefined)).toBe(false);
    });
  });

  describe('inbound webhooks — dedup, STOP/START, confirmation reply, admin-only reversal', () => {
    let t: TestTenant;
    let twilioSender: string;
    let atSender: string;

    beforeAll(async () => {
      await getApp();
      t = await createTestTenant('TENANT_ADMIN');
      // Unique per test run — a shared literal sender id previously
      // collided with an orphaned tenant from a crashed prior run and made
      // gateway resolution nondeterministic (unordered SELECT ... LIMIT 1
      // across two candidate rows). Real bug class, not hypothetical.
      const suffix = randomUUID().slice(0, 8);
      twilioSender = `+1555${suffix.slice(0, 6)}`;
      atSender = suffix.slice(0, 5);
      await withTenant(t.tenantId, trx => trx.insertInto('sms_gateways').values({
        tenant_id: t.tenantId, provider: 'twilio', label: 'Test Twilio',
        credentials: encryptJson({ twilioFrom: twilioSender }), // no twilioToken — sends fail fast, no network
        sender_id: twilioSender, priority: 0, active: true,
      }).execute());
      await withTenant(t.tenantId, trx => trx.insertInto('sms_gateways').values({
        tenant_id: t.tenantId, provider: 'africas_talking', label: 'Test AT',
        credentials: encryptJson({}), // no atUser/atKey — sends fail fast, no network
        sender_id: atSender, priority: 1, active: true,
      }).execute());
    });

    afterAll(async () => { await t.cleanup(); });

    it('records a STOP as an opt-out and logs the inbound message', async () => {
      const app = await getApp();
      const from = '+255700111222';
      const sid = `SM${randomUUID().slice(0, 10)}`;
      const res = await app.inject({ method: 'POST', url: '/v1/sms/webhook/twilio/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: twilioInboundBody(twilioSender, from, 'STOP', sid) });
      expect(res.statusCode).toBe(200);

      const optOuts = await withTenant(t.tenantId, trx => trx.selectFrom('sms_opt_outs').selectAll().where('tenant_id', '=', t.tenantId).where('phone', '=', from).execute());
      expect(optOuts).toHaveLength(1);
      expect(optOuts[0].reason).toBe('stop_keyword');

      const inbound = await withTenant(t.tenantId, trx => trx.selectFrom('sms_inbound_messages').selectAll().where('tenant_id', '=', t.tenantId).where('from_number', '=', from).execute());
      expect(inbound).toHaveLength(1);
      expect(inbound[0].matched_keyword).toBe('stop');

      // The required STOP confirmation reply is attempted (and logged into
      // sms_messages) even though this tenant's gateway can't actually send
      // it — SmsService.sendNow logs the real outcome regardless of success.
      const confirm = await withTenant(t.tenantId, trx => trx.selectFrom('sms_messages').selectAll().where('tenant_id', '=', t.tenantId).where('to_number', '=', from).execute());
      expect(confirm).toHaveLength(1);
      expect(confirm[0].body).toMatch(/unsubscribed/i);
    });

    it('dedupes a Twilio redelivery of the same MessageSid to a single inbound row', async () => {
      const app = await getApp();
      const from = '+255700111333';
      const sid = `SM${randomUUID().slice(0, 10)}`;
      const r1 = await app.inject({ method: 'POST', url: '/v1/sms/webhook/twilio/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: twilioInboundBody(twilioSender, from, 'Hello', sid) });
      const r2 = await app.inject({ method: 'POST', url: '/v1/sms/webhook/twilio/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: twilioInboundBody(twilioSender, from, 'Hello', sid) });
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);

      const rows = await withTenant(t.tenantId, trx => trx.selectFrom('sms_inbound_messages').selectAll().where('tenant_id', '=', t.tenantId).where('from_number', '=', from).execute());
      expect(rows).toHaveLength(1);
    });

    it('dedupes an Africa\'s Talking redelivery (no provider id) via the time-window fallback', async () => {
      const app = await getApp();
      const from = '+255700999888';
      const r1 = await app.inject({ method: 'POST', url: '/v1/sms/webhook/africas-talking/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: atInboundBody(atSender, from, 'Hello there') });
      const r2 = await app.inject({ method: 'POST', url: '/v1/sms/webhook/africas-talking/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: atInboundBody(atSender, from, 'Hello there') });
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);

      const rows = await withTenant(t.tenantId, trx => trx.selectFrom('sms_inbound_messages').selectAll().where('tenant_id', '=', t.tenantId).where('from_number', '=', from).execute());
      expect(rows).toHaveLength(1);
    });

    it('a START reply clears a stop_keyword opt-out but never a manual one', async () => {
      const app = await getApp();
      const stopPhone = '+255700444555';
      const manualPhone = '+255700333444';

      await app.inject({ method: 'POST', url: '/v1/sms/webhook/twilio/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: twilioInboundBody(twilioSender, stopPhone, 'STOP', `SM${randomUUID().slice(0, 10)}`) });
      await withTenant(t.tenantId, trx => trx.insertInto('sms_opt_outs').values({
        tenant_id: t.tenantId, phone: manualPhone, phone_normalized: '700333444', reason: 'manual', note: 'admin block',
      }).execute());

      await app.inject({ method: 'POST', url: '/v1/sms/webhook/twilio/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: twilioInboundBody(twilioSender, stopPhone, 'START', `SM${randomUUID().slice(0, 10)}`) });
      await app.inject({ method: 'POST', url: '/v1/sms/webhook/twilio/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: twilioInboundBody(twilioSender, manualPhone, 'START', `SM${randomUUID().slice(0, 10)}`) });

      const stopRows = await withTenant(t.tenantId, trx => trx.selectFrom('sms_opt_outs').selectAll().where('tenant_id', '=', t.tenantId).where('phone', '=', stopPhone).execute());
      expect(stopRows).toHaveLength(0);

      const manualRows = await withTenant(t.tenantId, trx => trx.selectFrom('sms_opt_outs').selectAll().where('tenant_id', '=', t.tenantId).where('phone', '=', manualPhone).execute());
      expect(manualRows).toHaveLength(1);
      expect(manualRows[0].reason).toBe('manual');
    });

    it('DELETE /opt-outs/:id requires an admin for a stop_keyword row but not for a manual one', async () => {
      const app = await getApp();
      const staff = await t.addUser('MANAGER');

      const stopPhone = '+255700666777';
      await app.inject({ method: 'POST', url: '/v1/sms/webhook/twilio/inbound', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: twilioInboundBody(twilioSender, stopPhone, 'STOP', `SM${randomUUID().slice(0, 10)}`) });
      const stopRow = await withTenant(t.tenantId, trx => trx.selectFrom('sms_opt_outs').select('id').where('tenant_id', '=', t.tenantId).where('phone', '=', stopPhone).executeTakeFirstOrThrow());

      const deniedRes = await app.inject({ method: 'DELETE', url: `/v1/sms/opt-outs/${stopRow.id}`, headers: authHeaders(staff.token) });
      expect(deniedRes.statusCode).toBe(403);
      const allowedRes = await app.inject({ method: 'DELETE', url: `/v1/sms/opt-outs/${stopRow.id}`, headers: authHeaders(t.token) });
      expect(allowedRes.statusCode).toBe(200);

      const manualPhone = '+255700777888';
      const manualRow = await withTenant(t.tenantId, trx => trx.insertInto('sms_opt_outs').values({
        tenant_id: t.tenantId, phone: manualPhone, phone_normalized: '700777888', reason: 'manual',
      }).returning('id').executeTakeFirstOrThrow());
      const manualDeleteRes = await app.inject({ method: 'DELETE', url: `/v1/sms/opt-outs/${manualRow.id}`, headers: authHeaders(staff.token) });
      expect(manualDeleteRes.statusCode).toBe(200);
    });
  });

  describe('outbound transient-vs-permanent retry boundary', () => {
    it('a config-level failure (never reached a provider) is never marked transient', async () => {
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        // No gateway configured at all — the earliest, most unambiguous
        // "definitely never contacted a provider" case.
        const result = await SmsIntegration.sendSms(t.tenantId, '+255711222333', 'probe');
        expect(result.success).toBe(false);
        expect(result.transient).toBeFalsy();
      } finally { await t.cleanup(); }
    });

    it('a misconfigured gateway (sync validation failure, no throw) is never marked transient', async () => {
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        await withTenant(t.tenantId, trx => trx.insertInto('sms_gateways').values({
          tenant_id: t.tenantId, provider: 'twilio', label: 'Dud Twilio',
          credentials: encryptJson({}), // missing twilioSid/twilioToken/twilioFrom
          sender_id: null, priority: 0, active: true,
        }).execute());
        const result = await SmsIntegration.sendSms(t.tenantId, '+255711222333', 'probe');
        expect(result.success).toBe(false);
        expect(result.transient).toBe(false);
      } finally { await t.cleanup(); }
    });

    it('sms-outbox job marks a non-transient failure "failed" on the first attempt, never requeued', async () => {
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const msgId = await SmsService.enqueue(t.tenantId, null, { to: '+255711222333', body: 'probe', sourceApp: 'sms' });
        await runSmsOutboxJob();
        const row = await withTenant(t.tenantId, trx => trx.selectFrom('sms_messages').selectAll().where('id', '=', msgId).executeTakeFirstOrThrow());
        expect(row.status).toBe('failed');
        expect(row.attempts).toBe(1);
      } finally { await t.cleanup(); }
    });
  });
});
