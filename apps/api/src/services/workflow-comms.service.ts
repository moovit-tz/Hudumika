import { withTenant } from '../db/client.js';
import { formatTemplate } from '../lib/template.js';
import { MailService } from './mail.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { NotificationService } from './notification.service.js';
import { SmsService } from './sms.service.js';
import { attachCommOutcomes, settleQueuedComm, type CommOutcome } from './workflow-runs.service.js';
import type { AutoComm } from '@hudumika/types';

/**
 * Fires a workflow step's automated comms. delayMinutes===0 comms are sent
 * detached (fire-and-forget, same non-blocking pattern the CO2 auto-calc
 * side-effect in workflow.service.ts already uses) — a comms failure never
 * blocks or fails the stage transition itself. delayMinutes>0 comms are
 * queued for the workflow-comm job to pick up.
 */
export async function dispatchAutoComms(
  tenantId: string,
  shipmentId: string,
  stepId: string,
  stepName: string,
  comms: AutoComm[],
  runId?: string | null,
): Promise<CommOutcome[]> {
  if (comms.length === 0) return [];

  const immediate = comms.filter((c) => !c.delayMinutes || c.delayMinutes <= 0);
  const delayed = comms.filter((c) => c.delayMinutes > 0);
  const outcomes: CommOutcome[] = [];

  // Awaited rather than fire-and-forget-per-comm so each send's real verdict
  // is available to journal. This does not delay the transition: the whole
  // function is already invoked detached, after the transition has committed.
  const settled = await Promise.allSettled(
    immediate.map((comm) => sendOneComm(tenantId, shipmentId, comm, stepName)),
  );

  settled.forEach((res, i) => {
    const comm = immediate[i];
    if (res.status === 'fulfilled') {
      if (!res.value.success) {
        console.error(`[WorkflowComms] send failed for shipment ${shipmentId}, comm ${comm.id}: ${res.value.error}`);
      }
      outcomes.push({
        commId: comm.id, channel: comm.channel, recipient: comm.recipient,
        status: res.value.success ? 'SENT' : 'FAILED',
        ...(res.value.success ? {} : { error: res.value.error ?? 'Unknown error' }),
      });
    } else {
      console.error(`[WorkflowComms] immediate send threw for shipment ${shipmentId}, comm ${comm.id}:`, res.reason?.message);
      outcomes.push({
        commId: comm.id, channel: comm.channel, recipient: comm.recipient,
        status: 'FAILED', error: res.reason?.message ?? 'Send threw',
      });
    }
  });

  if (delayed.length > 0) {
    await withTenant(tenantId, async (trx) => {
      const now = Date.now();
      for (const comm of delayed) {
        await trx
          .insertInto('workflow_comm_queue')
          .values({
            tenant_id: tenantId,
            shipment_id: shipmentId,
            workflow_step_id: stepId,
            auto_comm_id: comm.id,
            fire_at: new Date(now + comm.delayMinutes * 60 * 1000),
            status: 'PENDING',
            // So the job can write this message's real outcome back onto the
            // run instead of leaving it reading QUEUED (migration 169).
            run_id: runId ?? null,
          })
          .execute();
        outcomes.push({
          commId: comm.id, channel: comm.channel, recipient: comm.recipient,
          status: 'QUEUED', delayMinutes: comm.delayMinutes,
        });
      }
    });
  }

  if (runId) await attachCommOutcomes(tenantId, runId, outcomes);
  return outcomes;
}

/** Cancels any still-pending delayed comms queued for a step the shipment just left. */
export async function cancelPendingComms(tenantId: string, shipmentId: string, stepId: string): Promise<void> {
  const cancelled = await withTenant(tenantId, (trx) =>
    trx
      .updateTable('workflow_comm_queue')
      .set({ status: 'CANCELLED' })
      .where('tenant_id', '=', tenantId)
      .where('shipment_id', '=', shipmentId)
      .where('workflow_step_id', '=', stepId)
      .where('status', '=', 'PENDING')
      .returning(['run_id', 'auto_comm_id'])
      .execute(),
  );

  // Show it on the run as deliberately cancelled rather than perpetually
  // QUEUED — "we chose not to send this" and "it never went" look identical
  // otherwise, and only one of them is a problem.
  for (const row of cancelled) {
    if (row.run_id) {
      await settleQueuedComm(tenantId, row.run_id, row.auto_comm_id, { status: 'CANCELLED' })
        .catch(() => { /* journalling must never break the cancel itself */ });
    }
  }
}

export interface ResolvedComm {
  shipment: any;
  subject: string;
  body: string;
  toEmail?: string;
  toPhone?: string;
  toUserId?: string;
}

/**
 * Works out who a comm would go to and what it would say — everything
 * sendOneComm does right up to the moment of actually sending.
 *
 * Split out so the dry run can answer "would this reach anyone?" using the
 * same resolution the real send uses, rather than a second copy that drifts
 * and eventually lies.
 */
export async function resolveComm(
  tenantId: string,
  shipmentId: string,
  comm: AutoComm,
  stepName: string,
): Promise<ResolvedComm | null> {
  return withTenant(tenantId, async (trx) => {
    const shipment = await trx.selectFrom('shipment_cases').selectAll().where('tenant_id', '=', tenantId).where('id', '=', shipmentId).executeTakeFirst();
    if (!shipment) return null;

    const customer = await trx.selectFrom('customers').selectAll().where('tenant_id', '=', tenantId).where('id', '=', shipment.customer_id).executeTakeFirst();
    const officer = shipment.assigned_to
      ? await trx.selectFrom('users').selectAll().where('tenant_id', '=', tenantId).where('id', '=', shipment.assigned_to).executeTakeFirst()
      : null;

    // Template variables — only include ones we can honestly populate.
    // {{eta}}/{{duty_amount}} intentionally stay literal placeholders when
    // unavailable (no ETA set, no duty-amount column exists at all on
    // shipment_cases today) rather than being fabricated or silently blanked.
    const vars: Record<string, string> = {
      ref: shipment.ref_number,
      customer_name: customer?.name || 'Customer',
      vessel: shipment.vessel || '',
      current_step: stepName,
    };
    if (shipment.eta) vars.eta = new Date(shipment.eta).toLocaleDateString();
    if (officer?.name) vars.agent_name = officer.name;

    const out: ResolvedComm = {
      shipment,
      subject: formatTemplate(comm.subject, vars),
      body: formatTemplate(comm.template, vars),
    };

    if (comm.recipient === 'customer') {
      out.toEmail = customer?.email || undefined;
      out.toPhone = customer?.phone_wa || customer?.phone || undefined;
    } else if (comm.recipient === 'assigned_agent') {
      out.toEmail = officer?.email || undefined;
      out.toPhone = officer?.phone || undefined;
      out.toUserId = officer?.id;
    } else if (comm.recipient === 'manager') {
      const manager = await trx.selectFrom('users').selectAll().where('tenant_id', '=', tenantId).where('role', '=', 'MANAGER').where('active', '=', true).executeTakeFirst();
      out.toEmail = manager?.email || undefined;
      out.toPhone = manager?.phone || undefined;
      out.toUserId = manager?.id;
    } else if (comm.recipient === 'custom_email') {
      out.toEmail = comm.customEmail || undefined;
    }

    return out;
  });
}

/** Sends (or honestly logs, for channels with no real integration) a single AutoComm. Exported for the delayed-queue job to reuse. */
export async function sendOneComm(tenantId: string, shipmentId: string, comm: AutoComm, stepName: string): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveComm(tenantId, shipmentId, comm, stepName);
  if (!resolved) return { success: false, error: 'Shipment not found' };
  const { shipment, subject, body, toEmail, toPhone, toUserId } = resolved;

  switch (comm.channel) {
    case 'email': {
      if (!toEmail) return { success: false, error: 'No email address available for recipient' };
      // Raw, not templated — subject/body are already tenant-authored via
      // formatTemplate() in resolveComm() above (Workflow Studio's own
      // per-step editor), so there's no email_templates lookup to do here.
      // Sent synchronously so this function's own {success,error} contract
      // (already relied on by dispatchAutoComms' run-outcome journal) keeps
      // meaning what it always meant.
      const result = await MailService.sendNow(tenantId, { to: toEmail, subject, bodyHtml: `<p>${body}</p>`, sourceApp: 'workflow-comms' });
      return { success: result.success, error: result.error };
    }
    case 'whatsapp': {
      if (!toPhone) return { success: false, error: 'No phone number available for recipient' };
      const result = await WhatsAppIntegration.sendMessage(toPhone, body);
      return { success: result.success, error: result.error };
    }
    case 'webhook': {
      const settingsRow = await withTenant(tenantId, trx => trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst());
      const settings = settingsRow?.settings ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
      const url = settings?.workflow_webhook_url;
      if (!url) return { success: false, error: 'No workflow_webhook_url configured for this tenant' };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'workflow.step_entered', shipmentId, refNumber: shipment.ref_number, step: stepName, subject, message: body }),
        });
        return { success: res.ok, error: res.ok ? undefined : `Webhook responded ${res.status}` };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
    case 'system_notification': {
      if (!toUserId) return { success: false, error: 'system_notification only supports assigned_agent/manager recipients (no in-app inbox for customers)' };
      await NotificationService.createNotification({
        tenantId, userId: toUserId, app: 'clearos', type: 'info',
        title: subject || `Shipment ${shipment.ref_number} — ${stepName}`,
        message: body, link: `/clearance/${shipmentId}`,
        entityType: 'shipment', entityId: shipmentId, entityLabel: shipment.ref_number,
      });
      return { success: true };
    }
    case 'sms': {
      if (!toPhone) return { success: false, error: 'No phone number available for recipient' };
      // Real send via SmsService (integrations/sms.ts's Africa's Talking/
      // Twilio wiring) — this comment used to claim no SMS integration
      // existed anywhere in the codebase, which stopped being true once
      // messaging.service.ts and sign.routes.ts started sending real SMS.
      // Also lands a row in sms_messages, so a workflow's SMS steps show up
      // in the SMS app's own unified Reports view, not just here.
      const result = await SmsService.sendNow(tenantId, null, { to: toPhone, body, sourceApp: 'studio' });
      return { success: result.success, error: result.error };
    }
    default:
      return { success: false, error: `Unknown channel: ${comm.channel}` };
  }
}
