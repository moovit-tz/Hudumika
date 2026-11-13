import type { FastifyInstance } from 'fastify';

// Per-tenant in-memory replay buffer, so a client that drops and reconnects
// within a short window (a network blip, a laptop sleep) can catch up on
// what it missed instead of silently staying stale until its next full
// page load. This is deliberately NOT a durable log — it lives only in this
// process's memory, same scope as `fastify.websocketServer.clients` itself,
// so it does not survive a server restart or help across multiple API
// instances. Each tenant's bookkeeping lives forever (bounded by tenant
// count, not event volume), but the events themselves are capped by both
// count and age below.
const BUFFER_MAX_EVENTS = 200;
const BUFFER_TTL_MS = 5 * 60 * 1000;

interface BufferedEvent { seq: number; payload: unknown; at: number; }
const tenantSeq = new Map<string, number>();
const tenantBuffer = new Map<string, BufferedEvent[]>();

function pushBuffered(tenantId: string, entry: BufferedEvent): void {
  const buf = tenantBuffer.get(tenantId) ?? [];
  buf.push(entry);
  const cutoff = Date.now() - BUFFER_TTL_MS;
  while (buf.length && (buf.length > BUFFER_MAX_EVENTS || buf[0].at < cutoff)) buf.shift();
  tenantBuffer.set(tenantId, buf);
}

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
  const seq = (tenantSeq.get(tenantId) ?? 0) + 1;
  tenantSeq.set(tenantId, seq);
  pushBuffered(tenantId, { seq, payload, at: Date.now() });
  const message = JSON.stringify({ seq, event: payload });
  fastify.websocketServer?.clients.forEach((client: any) => {
    if (client.tenantId === tenantId && client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

/**
 * The server handle, kept so code with no request in hand (services, jobs)
 * can still reach connected sockets. Set once at boot, see index.ts.
 */
let wsServer: FastifyInstance | null = null;
export function registerWsServer(fastify: FastifyInstance): void { wsServer = fastify; }

/**
 * Nudges one person's open tabs to reload their notifications.
 *
 * Sent to that user's sockets only, and carries no content: the client
 * re-reads GET /v1/notifications, which applies the real access rules. It
 * is deliberately outside the tenant replay buffer (seq 0) — a missed nudge
 * costs nothing, since the header also polls.
 *
 * Delayed slightly because most callers are still inside the transaction
 * that wrote the row; a client that re-read immediately would not see it.
 */
export function notifyUser(tenantId: string, userId: string | null | undefined): void {
  if (!userId || !wsServer) return;
  const message = JSON.stringify({ seq: 0, event: { type: 'notification.new', count: 1 } });
  setTimeout(() => {
    wsServer?.websocketServer?.clients.forEach((client: any) => {
      if (client.tenantId === tenantId && client.userId === userId && client.readyState === client.OPEN) {
        try { client.send(message); } catch { /* client gone */ }
      }
    });
  }, 800).unref?.();
}

/**
 * Replays everything the buffer still holds for `tenantId` after `sinceSeq`,
 * sent only to the one reconnecting `socket` — never broadcast. Returns
 * false when `sinceSeq` has already aged or rotated out of the buffer, so
 * the caller can tell that client it needs a full resync instead of quietly
 * leaving a gap (see the `resync.required` ServerEvent).
 */
export function replayMissedEvents(socket: any, tenantId: string, sinceSeq: number): boolean {
  const currentSeq = tenantSeq.get(tenantId) ?? 0;
  if (!Number.isFinite(sinceSeq) || sinceSeq >= currentSeq) return true;
  const buf = tenantBuffer.get(tenantId) ?? [];
  if (buf.length === 0 || buf[0].seq > sinceSeq + 1) return false;
  for (const entry of buf) {
    if (entry.seq > sinceSeq) {
      try { socket.send(JSON.stringify({ seq: entry.seq, event: entry.payload })); } catch { /* client gone */ }
    }
  }
  return true;
}
