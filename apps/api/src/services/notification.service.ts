import { withTenant } from '../db/client.js';
import { NOTIFICATION_MATRIX, formatTemplate } from '../config/notification-matrix.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { EmailIntegration } from '../integrations/email.js';
import type { NotificationTrigger } from '@clearos/types';
import { env } from '../config/env.js';

export class NotificationService {
  /**
   * Evaluate rules for a trigger, format template, dispatch via WhatsApp/Email, and log in DB
   */
  static async triggerNotification(
    tenantId: string,
    shipmentId: string,
    trigger: NotificationTrigger,
    variables: Record<string, string> = {}
  ): Promise<void> {
    const rules = NOTIFICATION_MATRIX.filter((r) => r.trigger === trigger);
    if (rules.length === 0) return;

    return withTenant(tenantId, async (trx) => {
      // 1. Fetch shipment case details
      const shipment = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('id', '=', shipmentId)
        .executeTakeFirst();

      if (!shipment) return;

      // 2. Fetch customer details
      const customer = await trx
        .selectFrom('customers')
        .selectAll()
        .where('id', '=', shipment.customer_id)
        .executeTakeFirst();

      // 3. Fetch officer details if assigned
      const officer = shipment.assigned_to
        ? await trx
            .selectFrom('users')
            .selectAll()
            .where('id', '=', shipment.assigned_to)
            .executeTakeFirst()
        : null;

      // 4. Merge variables
      const mergedVars = {
        refNumber: shipment.ref_number,
        goodsDesc: shipment.goods_desc,
        customerName: customer?.name || 'Customer',
        officerName: officer?.name || 'Assigned Officer',
        officerPhone: officer?.phone || '',
        portalUrl: env.OPS_BOARD_URL, // Use Ops Board URL as fallback portal URL
        caseId: shipment.id,
        stageLabel: shipment.stage,
        ...variables,
      };

      for (const rule of rules) {
        const bodyContent = formatTemplate(rule.template, mergedVars);

        // Resolve recipients
        for (const recipientRole of rule.recipients) {
          const targets: { userId?: string; customerId?: string; phone?: string; email?: string }[] = [];

          if (recipientRole === 'CUSTOMER' && customer) {
            targets.push({
              customerId: customer.id,
              phone: customer.phone_wa || customer.phone || undefined,
              email: customer.email || undefined,
            });
          } else if (recipientRole === 'ASSIGNED_OFFICER' && officer) {
            targets.push({
              userId: officer.id,
              phone: officer.phone || undefined,
              email: officer.email || undefined,
            });
          } else if (recipientRole === 'MANAGER' || recipientRole === 'FINANCE') {
            const staff = await trx
              .selectFrom('users')
              .selectAll()
              .where('role', '=', recipientRole)
              .where('active', '=', true)
              .execute();

            for (const u of staff) {
              targets.push({
                userId: u.id,
                phone: u.phone || undefined,
                email: u.email || undefined,
              });
            }
          }

          // Send to each target on all allowed channels
          for (const target of targets) {
            for (const channel of rule.channels) {
              let deliveryStatus = 'PENDING';

              if (channel === 'WHATSAPP' && target.phone) {
                const result = await WhatsAppIntegration.sendMessage(target.phone, bodyContent);
                deliveryStatus = result.success ? 'SENT' : 'FAILED';
              } else if (channel === 'EMAIL' && target.email) {
                const result = await EmailIntegration.sendEmail({
                  to: target.email,
                  subject: `Msomi Freight Notification - Shipment ${shipment.ref_number}`,
                  bodyHtml: `<p>${bodyContent}</p>`,
                });
                deliveryStatus = result.success ? 'SENT' : 'FAILED';
              } else if (channel === 'IN_APP') {
                deliveryStatus = 'SENT';
              }

              // Insert notification record
              await trx
                .insertInto('notifications')
                .values({
                  tenant_id: tenantId,
                  shipment_id: shipmentId,
                  user_id: target.userId || null,
                  customer_id: target.customerId || null,
                  trigger_type: trigger,
                  channel,
                  recipient: channel === 'WHATSAPP' ? (target.phone || '') : (target.email || 'IN_APP'),
                  title: String(trigger).replace(/_/g, ' '),
                  content: bodyContent,
                  status: deliveryStatus,
                  read: false,
                  created_at: new Date(),
                })
                .execute();
            }
          }
        }
      }
    });
  }
}
