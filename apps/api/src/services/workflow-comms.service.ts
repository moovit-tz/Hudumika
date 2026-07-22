import { withTenant, db } from '../db/client.js';
import { formatTemplate } from '../config/notification-matrix.js';
import { EmailIntegration } from '../integrations/email.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { NotificationService } from './notification.service.js';
import type { AutoComm } from '@hudumika/types';

/**
 * Fires a workflow step's automated comms. delayMinutes===0 comms are sent
 * detached (fire-and-forget, same non-blocking pattern the CO2 auto-calc
 * side-effect in workflow.service.ts already uses) — a comms failure never
 * blocks or fails the stage transition itself. delayMinutes>0 comms are
 * queued for the workflow-comm job to pick up.
 */
export async function dispatchAutoComms(tenantId: string, shipmentId: string, stepId: string, stepName: string, comms: AutoComm[]): Promise<void> {
  if (comms.length === 0) return;

  const immediate = comms.filter((c) => !c.delayMinutes || c.delayMinutes <= 0);
  const delayed = comms.filter((c) => c.delayMinutes > 0);

  for (const comm of immediate) {
    sendOneComm(tenantId, shipmentId, comm, stepName).catch((err) =>
      console.error(`[WorkflowComms] immediate send failed for shipment ${shipmentId}, comm ${comm.id}:`, err.message),
    );
  }

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
          })
          .execute();
      }
    });
  }
}

/** Cancels any still-pending delayed comms queued for a step the shipment just left. */
export async function cancelPendingComms(tenantId: string, shipmentId: string, stepId: string): Promise<void> {
  await withTenant(tenantId, (trx) =>
    trx
      .updateTable('workflow_comm_queue')
      .set({ status: 'CANCELLED' })
      .where('tenant_id', '=', tenantId)
      .where('shipment_id', '=', shipmentId)
      .where('workflow_step_id', '=', stepId)
      .where('status', '=', 'PENDING')
      .execute(),
  );
}

/** Sends (or honestly logs, for channels with no real integration) a single AutoComm. Exported for the delayed-queue job to reuse. */
export async function sendOneComm(tenantId: string, shipmentId: string, comm: AutoComm, stepName: string): Promise<{ success: boolean; error?: string }> {
  const shipment = await db.selectFrom('shipment_cases').selectAll().where('id', '=', shipmentId).executeTakeFirst();
  if (!shipment) return { success: false, error: 'Shipment not found' };

  const customer = await db.selectFrom('customers').selectAll().where('id', '=', shipment.customer_id).executeTakeFirst();
  const officer = shipment.assigned_to
    ? await db.selectFrom('users').selectAll().where('id', '=', shipment.assigned_to).executeTakeFirst()
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

  const subject = formatTemplate(comm.subject, vars);
  const body = formatTemplate(comm.template, vars);

  let toEmail: string | undefined;
  let toPhone: string | undefined;
  let toUserId: string | undefined;

  if (comm.recipient === 'customer') {
    toEmail = customer?.email || undefined;
    toPhone = customer?.phone_wa || customer?.phone || undefined;
  } else if (comm.recipient === 'assigned_agent') {
    toEmail = officer?.email || undefined;
    toPhone = officer?.phone || undefined;
    toUserId = officer?.id;
  } else if (comm.recipient === 'manager') {
    const manager = await db.selectFrom('users').selectAll().where('tenant_id', '=', tenantId).where('role', '=', 'MANAGER').where('active', '=', true).executeTakeFirst();
    toEmail = manager?.email || undefined;
    toPhone = manager?.phone || undefined;
    toUserId = manager?.id;
  } else if (comm.recipient === 'custom_email') {
    toEmail = comm.customEmail || undefined;
  }

  switch (comm.channel) {
    case 'email': {
      if (!toEmail) return { success: false, error: 'No email address available for recipient' };
      const result = await EmailIntegration.sendEmail({ to: toEmail, subject, bodyHtml: `<p>${body}</p>`, tenantId });
      return { success: result.success, error: result.error };
    }
    case 'whatsapp': {
      if (!toPhone) return { success: false, error: 'No phone number available for recipient' };
      const result = await WhatsAppIntegration.sendMessage(toPhone, body);
      return { success: result.success, error: result.error };
    }
    case 'webhook': {
      const settingsRow = await db.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
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
      // No SMS provider integration exists anywhere in this codebase today
      // (confirmed — messaging.service.ts mocks SMS the same honest way for
      // support tickets). Logged, not fabricated as sent.
      console.log(`[WorkflowComms][SMS mock] shipment ${shipmentId}: ${body}`);
      return { success: false, error: 'SMS not integrated — logged only' };
    }
    default:
      return { success: false, error: `Unknown channel: ${comm.channel}` };
  }
}
