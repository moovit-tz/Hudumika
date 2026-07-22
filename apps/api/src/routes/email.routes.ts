import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { EmailIntegration } from '../integrations/email.js';

export async function emailRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));

  // POST /v1/email/send
  fastify.post('/send', async (request, reply) => {
    const { to, subject, body } = request.body as {
      to: string;
      subject: string;
      body: string;
    };

    if (!to || !subject || !body) {
      return reply.status(400).send({ success: false, error: 'Recipient (to), subject, and body are required.' });
    }

    const tenantId = (request.user as any).tenant_id;

    // Convert newlines to HTML line breaks for the HTML body
    const bodyHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap;">${body}</div>`;

    const result = await EmailIntegration.sendEmail({
      to,
      subject,
      bodyHtml,
      tenantId,
    });

    if (!result.success) {
      return reply.status(500).send({ success: false, error: result.error });
    }

    return { success: true, messageId: result.messageId };
  });
}
