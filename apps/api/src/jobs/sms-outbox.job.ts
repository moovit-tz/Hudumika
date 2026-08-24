import { dbPlatform, withTenant } from '../db/client.js';
import { SmsIntegration } from '../integrations/sms.js';
import { formatTemplate } from '../lib/template.js';

const BATCH_SIZE = 50;

/**
 * Polls sms_messages for 'queued' rows and sends them via SmsIntegration —
 * the throttled path for bulk/campaign sends (SmsService.enqueue/enqueueBulk),
 * so a request handler firing a 500-recipient campaign never blocks on 500
 * synchronous gateway round-trips. A failed send here is marked 'failed' and
 * left there (no retry loop, unlike mail-outbox.job.ts) — SMS gateways are
 * synchronous REST calls, not a bounce-and-retry transport, so silently
 * re-attempting a rejected send risks double-charging; a user can always
 * re-send from the Reports view instead.
 */
export async function runSmsOutboxJob(): Promise<void> {
  try {
    const due = await dbPlatform.selectFrom('sms_messages').selectAll()
      .where('status', '=', 'queued')
      .orderBy('created_at', 'asc')
      .limit(BATCH_SIZE)
      .execute();

    if (due.length > 0) {
      let sent = 0, failed = 0;
      for (const item of due) {
        const result = await SmsIntegration.sendSms(item.tenant_id, item.to_number, item.body);
        await withTenant(item.tenant_id, async (trx) => {
          await trx.updateTable('sms_messages').set({
            status: result.success ? 'sent' : 'failed',
            provider: result.provider ?? null,
            provider_message_id: result.messageId ?? null,
            error: result.success ? null : (result.error ?? 'Unknown send error'),
            attempts: item.attempts + 1,
            sent_at: result.success ? new Date().toISOString() : null,
          }).where('id', '=', item.id).execute();
        });
        if (result.success) sent++; else failed++;
      }
      console.log(`📱 SMS outbox sweep — sent: ${sent}, failed: ${failed} (of ${due.length} due)`);
    }

    // Due scheduled campaigns — fan out into 'queued' sms_messages rows the
    // same way POST /v1/sms/campaigns/:id/send does, then flip to 'sending'
    // so the next poll's rows above pick them up for the actual sends.
    const dueCampaigns = await dbPlatform.selectFrom('sms_campaigns').selectAll()
      .where('status', '=', 'scheduled')
      .where('scheduled_at', '<=', new Date())
      .limit(20)
      .execute();

    for (const campaign of dueCampaigns) {
      await withTenant(campaign.tenant_id, async (trx) => {
        if (!campaign.group_id) {
          await trx.updateTable('sms_campaigns').set({ status: 'failed', updated_at: new Date() }).where('id', '=', campaign.id).execute();
          return;
        }
        const members = await trx.selectFrom('sms_group_members').select(['phone', 'name'])
          .where('group_id', '=', campaign.group_id).where('tenant_id', '=', campaign.tenant_id).execute();
        if (members.length === 0) {
          await trx.updateTable('sms_campaigns').set({ status: 'failed', updated_at: new Date() }).where('id', '=', campaign.id).execute();
          return;
        }

        let body = campaign.body;
        if (campaign.template_id) {
          const template = await trx.selectFrom('sms_templates').select('body').where('id', '=', campaign.template_id).executeTakeFirst();
          if (template) body = formatTemplate(template.body, {});
        }

        await trx.insertInto('sms_messages').values(members.map(m => ({
          tenant_id: campaign.tenant_id, user_id: campaign.created_by, to_number: m.phone, body,
          status: 'queued' as const, segments: Math.max(1, Math.ceil(body.length / 153)), source_app: 'sms',
          campaign_id: campaign.id, template_id: campaign.template_id, contact_name: m.name,
        }))).execute();

        await trx.updateTable('sms_campaigns').set({
          status: 'sending', total_recipients: members.length, sent_at: new Date().toISOString(), updated_at: new Date(),
        }).where('id', '=', campaign.id).execute();
      });
      console.log(`📱 SMS campaign "${campaign.name}" (${campaign.id}) fanned out to its group.`);
    }

    // A campaign whose fan-out fully drained (every one of its messages left
    // 'queued') is done — flip 'sending' -> 'sent' so the UI stops polling it
    // as in-progress. Cheap enough to check every pass: one row per tenant
    // with an active campaign, not per-message.
    const inFlight = await dbPlatform.selectFrom('sms_campaigns').select(['id', 'tenant_id']).where('status', '=', 'sending').execute();
    for (const c of inFlight) {
      await withTenant(c.tenant_id, async (trx) => {
        const remaining = await trx.selectFrom('sms_messages').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('campaign_id', '=', c.id).where('status', '=', 'queued').executeTakeFirst();
        if (Number(remaining?.c ?? 0) === 0) {
          await trx.updateTable('sms_campaigns').set({ status: 'sent', updated_at: new Date() }).where('id', '=', c.id).execute();
        }
      });
    }
  } catch (error) {
    console.error('❌ SMS outbox job failed:', error);
  }
}
