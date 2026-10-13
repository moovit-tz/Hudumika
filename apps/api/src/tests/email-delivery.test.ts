import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MailService } from '../services/mail.service.js';
import { EmailIntegration } from '../integrations/email.js';
import { MinioIntegration } from '../integrations/minio.js';
import { withTenant } from '../db/client.js';
import { runMailOutboxJob } from '../jobs/mail-outbox.job.js';
import { runScheduledEmailSendJob } from '../jobs/scheduled-email-send.job.js';
import { randomUUID } from 'node:crypto';
import { CommEventsService } from '../services/comm-events.service.js';
import { COMM_EVENT_REGISTRY } from '../config/comm-event-registry.js';
import { createTestTenant, type TestTenant } from './helpers.js';

describe('Email durable delivery', () => {
  let tenant: TestTenant;
  beforeAll(async () => { tenant = await createTestTenant('TENANT_ADMIN'); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await withTenant(tenant.tenantId, async trx => {
      await trx.deleteFrom('email_messages').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('email_outbox').where('tenant_id', '=', tenant.tenantId).execute();
    });
  });
  afterAll(async () => { await tenant.cleanup(); });

  it('preserves multiple files, BCC, sender and threading on queued delivery', async () => {
    const send = vi.spyOn(EmailIntegration, 'sendEmail').mockResolvedValue({ success: true, messageId: '<delivered@test>' });
    vi.spyOn(MinioIntegration, 'readFile').mockResolvedValue(Buffer.from('file'));
    const id = await MailService.enqueue(tenant.tenantId, {
      to: 'recipient@example.test', subject: 'Envelope', bodyHtml: 'hello', sourceApp: 'email',
      bcc: ['private@example.test'], userId: tenant.userId,
      inReplyToMessageId: '<parent@test>', referencesMessageIds: ['<parent@test>'],
      attachments: [{ storageKey: 'one', filename: 'one.pdf' }, { storageKey: 'two', filename: 'two.pdf' }],
    });
    await Promise.all([runMailOutboxJob(tenant.tenantId), runMailOutboxJob(tenant.tenantId)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ bcc: ['private@example.test'], userId: tenant.userId, inReplyToMessageId: '<parent@test>' });
    expect(send.mock.calls[0][0].attachments).toHaveLength(2);
    const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_outbox').selectAll().where('tenant_id', '=', tenant.tenantId).where('id', '=', id).executeTakeFirstOrThrow());
    expect(row.status).toBe('sent'); expect(row.claim_token).toBeNull(); expect(row.attempts).toBe(1);
  });

  it('does not send when a required file is missing', async () => {
    const send = vi.spyOn(EmailIntegration, 'sendEmail').mockResolvedValue({ success: true });
    vi.spyOn(MinioIntegration, 'readFile').mockResolvedValue(null);
    const id = await MailService.enqueue(tenant.tenantId, { to: 'recipient@example.test', subject: 'Missing file', bodyHtml: 'hello', sourceApp: 'email', attachments: [{ storageKey: 'missing', filename: 'quote.pdf' }] });
    await runMailOutboxJob(tenant.tenantId);
    expect(send).not.toHaveBeenCalled();
    const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_outbox').selectAll().where('tenant_id', '=', tenant.tenantId).where('id', '=', id).executeTakeFirstOrThrow());
    expect(row.status).toBe('failed'); expect(row.last_error).toContain('quote.pdf');
  });

  it('rejects completion from a worker whose claim was replaced', async () => {
    const id = await MailService.enqueue(tenant.tenantId, { to: 'recipient@example.test', subject: 'Fence', bodyHtml: 'hello', sourceApp: 'email' });
    vi.spyOn(EmailIntegration, 'sendEmail').mockImplementation(async () => {
      await withTenant(tenant.tenantId, trx => trx.updateTable('email_outbox').set({ claim_token: '00000000-0000-4000-8000-000000000001' }).where('tenant_id', '=', tenant.tenantId).where('id', '=', id).execute());
      return { success: true };
    });
    await runMailOutboxJob(tenant.tenantId);
    const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_outbox').selectAll().where('tenant_id', '=', tenant.tenantId).where('id', '=', id).executeTakeFirstOrThrow());
    expect(row.status).toBe('sending');
  });

  it('recovers an expired claim and keeps a failed delivery retryable', async () => {
    const id = await MailService.enqueue(tenant.tenantId, { to: 'recipient@example.test', subject: 'Recovery', bodyHtml: 'hello', sourceApp: 'email' });
    await withTenant(tenant.tenantId, trx => trx.updateTable('email_outbox')
      .set({ status: 'sending', claim_token: randomUUID(), next_attempt_at: new Date(0) })
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', id).execute());
    const send = vi.spyOn(EmailIntegration, 'sendEmail').mockResolvedValue({ success: false, error: 'Temporary SMTP failure' });
    await runMailOutboxJob(tenant.tenantId);
    await withTenant(tenant.tenantId, trx => trx.updateTable('email_outbox').set({ next_attempt_at: new Date(0) })
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', id).execute());
    send.mockResolvedValue({ success: true, messageId: '<recovered@test>' });
    await runMailOutboxJob(tenant.tenantId);
    const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_outbox').selectAll()
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', id).executeTakeFirstOrThrow());
    expect(send).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('sent');
    expect(row.attempts).toBe(2);
    expect(row.last_error).toBeNull();
  });

  it('hands a scheduled message to the outbox once across concurrent workers', async () => {
    const message = await withTenant(tenant.tenantId, trx => trx.insertInto('email_messages').values({
      tenant_id: tenant.tenantId, user_id: tenant.userId, folder: 'scheduled', thread_id: randomUUID(),
      to_addresses: JSON.stringify([{ email: 'recipient@example.test' }]),
      bcc_addresses: JSON.stringify([{ email: 'private@example.test' }]),
      subject: 'Scheduled handoff', body: 'hello', scheduled_at: new Date(0),
    }).returning('id').executeTakeFirstOrThrow());
    await Promise.all([runScheduledEmailSendJob(tenant.tenantId), runScheduledEmailSendJob(tenant.tenantId)]);
    await runScheduledEmailSendJob(tenant.tenantId);
    const queued = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_outbox').selectAll()
      .where('tenant_id', '=', tenant.tenantId).where('subject', '=', 'Scheduled handoff').execute());
    expect(queued).toHaveLength(1);
    const send = vi.spyOn(EmailIntegration, 'sendEmail').mockResolvedValue({ success: true, messageId: '<scheduled@test>' });
    await runMailOutboxJob(tenant.tenantId);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].bcc).toEqual(['private@example.test']);
    const delivered = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_messages').selectAll()
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', message.id).executeTakeFirstOrThrow());
    expect(delivered.folder).toBe('sent');
    expect(delivered.outbox_id).toBe(queued[0].id);
    expect(delivered.scheduled_at).toBeNull();
  });

  it('links communication dispatch to the final delivery log and attempts', async () => {
    const event = COMM_EVENT_REGISTRY.find(item => item.default_template && item.available_channels.includes('EMAIL'))!;
    vi.spyOn(CommEventsService, 'render').mockResolvedValue({
      eventKey: event.event_key, templateKey: event.default_template!, locale: 'en',
      subject: 'Tracked communication', preheader: '', bodyHtml: 'hello', plainText: 'hello',
      recipients: { to: [{ email: 'recipient@example.test', type: 'TO' }], cc: [], bcc: [] },
    });
    const dispatched = await CommEventsService.dispatch({
      tenantId: tenant.tenantId, eventKey: event.event_key,
      idempotencyKey: randomUUID(),
    });
    vi.spyOn(EmailIntegration, 'sendEmail').mockResolvedValue({ success: true, messageId: '<tracked@test>' });
    await runMailOutboxJob(tenant.tenantId);
    const log = await withTenant(tenant.tenantId, trx => trx.selectFrom('comm_delivery_log').selectAll()
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', dispatched.deliveryIds[0]).executeTakeFirstOrThrow());
    const attempts = await withTenant(tenant.tenantId, trx => trx.selectFrom('comm_delivery_attempts').selectAll()
      .where('tenant_id', '=', tenant.tenantId).where('delivery_id', '=', log.id).orderBy('attempt_number').execute());
    expect(log.status).toBe('sent');
    expect(log.provider_id).toBe('<tracked@test>');
    expect(log.outbox_id).toBeTruthy();
    expect(attempts.map(attempt => attempt.status)).toEqual(['queued', 'sent']);
  });
});
