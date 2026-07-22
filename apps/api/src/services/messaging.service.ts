import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { EmailIntegration } from '../integrations/email.js';
import { db } from '../db/client.js';
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
      const res = await EmailIntegration.sendEmail({
        to: customerEmail,
        subject: `Support Ticket Update (Ref: ${ticketId.split('-')[0]})`,
        bodyHtml: `<p>${content.replace(/\n/g, '<br/>')}</p>`,
        tenantId,
      });
      if (res.success) {
        externalRef = `email-${Date.now()}`;
      }
    } else if (channel === 'SMS' && customerPhone) {
      // Mock SMS integration for now
      console.log(`[SMS] Sending to ${customerPhone}: ${content}`);
      externalRef = `sms-${Date.now()}`;
    }

    // Save outbound message to DB
    const message = await db
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
      .executeTakeFirstOrThrow();

    return message;
  }
}
