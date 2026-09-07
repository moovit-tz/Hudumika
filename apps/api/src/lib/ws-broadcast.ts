import type { FastifyInstance } from 'fastify';

/**
 * Sends `payload` only to sockets whose handshake authenticated as
 * `tenantId` — tagged in index.ts's `/ws` upgrade handler as
 * `socket.tenantId`, the same JWT claim every REST route trusts. Every
 * event broadcast to this socket carries another tenant's data (ticket
 * messages, vehicle positions, invoices...), so a call site that reaches
 * `fastify.websocketServer.clients` directly instead of through here is a
 * cross-tenant leak, not a style nit.
 */
export function broadcastToTenant(fastify: FastifyInstance, tenantId: string, payload: unknown): void {
  const message = JSON.stringify(payload);
  fastify.websocketServer?.clients.forEach((client: any) => {
    if (client.tenantId === tenantId && client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}
