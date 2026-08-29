import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';

interface AuthentikEvent {
  action: string; // e.g., 'login', 'login_failed', 'token_written', 'user_wrote'
  user?: {
    pk: string | number;
    username: string;
    email: string;
  };
  client_ip?: string;
  context?: {
    user_agent?: string;
    [key: string]: any;
  };
  created?: string;
}

export async function authentikWebhookRoutes(app: FastifyInstance) {
  const webhookSecret = process.env.AUTHENTIK_WEBHOOK_SECRET || 'mock_webhook_secret';

  app.post('/authentik/events', {
    preParsing: (request, reply, payload, done) => {
      let buffer = '';
      payload.on('data', (chunk) => {
        buffer += chunk;
      });
      payload.on('end', () => {
        (request as any).rawBody = buffer;
      });
      done(null, payload);
    },
    handler: async (request: FastifyRequest<{ Body: AuthentikEvent }>, reply) => {
      const signature = request.headers['x-authentik-signature'] as string | undefined;
      const rawBody = (request as any).rawBody || JSON.stringify(request.body);

      // Verify signature
      if (webhookSecret !== 'mock_webhook_secret') {
        if (!signature) {
          return reply.code(400).send({ error: 'missing_signature' });
        }
        
        const computedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(rawBody)
          .digest('hex');

        if (computedSignature !== signature) {
          app.log.error({ signature, computedSignature }, 'Invalid webhook signature');
          return reply.code(401).send({ error: 'invalid_signature' });
        }
      } else {
        app.log.warn('Webhook secret is mock_webhook_secret — skipping signature check');
      }

      const event = request.body;
      app.log.info({ action: event.action }, 'Received authentik webhook event');

      const action = event.action;
      const userPk = event.user?.pk ? String(event.user.pk) : null;
      const email = event.user?.email || null;

      // Find user in DB
      let user = null;
      if (email) {
        user = await app.prisma.user.findUnique({ where: { email } });
      }

      if (!user && userPk) {
        user = await app.prisma.user.findUnique({ where: { id: userPk } });
      }

      if (user) {
        let type: 'LOGIN' | 'KYC' | 'DEVICE_CHANGE' | 'CREDIT' | 'CONSENT' = 'LOGIN';
        let status: 'SUCCESS' | 'FAILED' | 'PENDING' = 'SUCCESS';
        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

        if (action === 'login') {
          type = 'LOGIN';
          status = 'SUCCESS';
        } else if (action === 'login_failed') {
          type = 'LOGIN';
          status = 'FAILED';
          riskLevel = 'MEDIUM';
        } else if (action === 'token_written') {
          type = 'CONSENT';
          status = 'SUCCESS';
        }

        // Record ActivityEvent
        await app.prisma.activityEvent.create({
          data: {
            userId: user.id,
            type: type as any,
            status: status as any,
            riskLevel: riskLevel as any,
            metadata: {
              ip: event.client_ip || null,
              userAgent: event.context?.user_agent || null,
              authentikEvent: action,
              created: event.created || null
            }
          }
        });

        // Recalculate Trust Score reactively
        await (app as any).recalculateTrust(user.id);
      }

      // Write to audit log — regulatory requirement
      await app.audit.write({
        entityType: 'USER',
        entityId: userPk || 'unknown',
        action: action === 'login_failed' ? 'LOGIN_FAILED' : 'LOGIN_SUCCESS',
        category: 'AUTH',
        performedBy: 'authentik',
        ipAddress: event.client_ip,
        userAgent: event.context?.user_agent,
        metadata: {
          action,
          email,
          userPk,
          ondiUserResolved: !!user
        },
        severity: action === 'login_failed' ? 'WARNING' : 'INFO',
        isRegulatory: true
      });

      return reply.send({ success: true });
    }
  });
}
