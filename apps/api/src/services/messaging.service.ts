import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { MailService } from './mail.service.js';
import { SmsIntegration } from '../integrations/sms.js';
import { withTenant } from '../db/client.js';
import type { MessageChannel, MessageDirection } from '@hudumika/types';

export class MessagingService {
  /**
   * Dispatches an outbound message to a customer via the given channel,
   * and saves the record in `support_messages`.
   */
  static async dispatchOutbound(
    tenantId: string,
    ticketId: string,
    channel: MessageChannel,
    content: string,
    authorId: string,
    authorName: string,
    customerPhone?: string,
    customerEmail?: string
  ) {
    let externalRef: string | undefined = undefined;
    
    // Dispatch to external channels
    if (channel === 'WHATSAPP' && customerPhone) {
      const res = await WhatsAppIntegration.sendMessage(customerPhone, content);
      if (res.success && res.messageId) {
        externalRef = res.messageId;
      }
    } else if (channel === 'EMAIL' && customerEmail) {
      const res = await MailService.sendNowTemplated(tenantId, 'support.ticket_update', customerEmail, {
        ticketRef: ticketId.split('-')[0], content: content.replace(/\n/g, '<br/>'),
      }, 'support');
      if (res.success) {
        externalRef = res.outboxId;
      }
    } else if (channel === 'SMS' && customerPhone) {
      const res = await SmsIntegration.sendSms(tenantId, customerPhone, content);
      if (res.success && res.messageId) externalRef = res.messageId;
    }

    // Save outbound message to DB
    const message = await withTenant(tenantId, trx => trx
      .insertInto('support_messages')
      .values({
        tenant_id: tenantId,
        ticket_id: ticketId,
        channel,
        direction: 'OUTBOUND',
        author_id: authorId,
        author_name: authorName,
        author_type: 'OFFICER',
        content,
        external_ref: externalRef || null,
      })
      .returningAll()
      .executeTakeFirstOrThrow());

    return message;
  }
}
