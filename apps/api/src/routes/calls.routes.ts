import type { FastifyInstance } from 'fastify';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';

/**
 * NexusHR calls — 1:1 voice/video.
 *
 * WebRTC media is peer-to-peer and never touches the server. This module only
 * (a) relays signaling (ring / SDP offer & answer / ICE candidates / hang-up)
 * between two users of the SAME tenant over a WebSocket, (b) tracks who is
 * connected so the directory can show presence, and (c) persists a metadata
 * record per call for history. SDP/ICE payloads are relayed, never stored.
 *
 * Presence is in-memory (per server instance) — appropriate for a single-node
 * deployment; a multi-node rollout would move the registry to Redis pub/sub.
 */

// key = `${tenantId}:${userId}` → the set of that user's live sockets.
const registry = new Map<string, Set<any>>();
const meta = new WeakMap<any, { tenantId: string; userId: string; name: string }>();
const rkey = (t: string, u: string) => `${t}:${u}`;

function sendTo(tenantId: string, userId: string, payload: unknown) {
  const set = registry.get(rkey(tenantId, userId));
  if (!set) return false;
  const msg = JSON.stringify(payload);
  let delivered = false;
  for (const s of set) { try { s.send(msg); delivered = true; } catch { /* dead socket */ } }
  return delivered;
}

function onlineUserIds(tenantId: string): string[] {
  const ids: string[] = [];
  for (const key of registry.keys()) {
    const [t, u] = key.split(':');
    if (t === tenantId) ids.push(u);
  }
  return ids;
}

// Tell everyone in the tenant that one user's presence flipped.
function broadcastPresence(tenantId: string, userId: string, online: boolean) {
  const payload = { type: 'presence', userId, online };
  const seen = new Set<any>();
  for (const [key, set] of registry.entries()) {
    if (!key.startsWith(`${tenantId}:`)) continue;
    for (const s of set) { if (seen.has(s)) continue; seen.add(s); try { s.send(JSON.stringify(payload)); } catch { /* ignore */ } }
  }
}

const RELAY_TYPES = new Set(['ring', 'offer', 'answer', 'ice', 'accept', 'decline', 'hangup', 'cancel']);

export async function callsRoutes(fastify: FastifyInstance) {
  // ── Signaling socket ──────────────────────────────────────────────
  // Browsers can't set an Authorization header on a WebSocket, so the access
  // token is passed as a query param and verified here before anything is wired.
  fastify.get('/signal', { websocket: true }, (socket: any, req: any) => {
    let claims: any;
    try {
      const token = String((req.query as any)?.token || '');
      claims = fastify.jwt.verify(token);
    } catch {
      try { socket.close(4001, 'unauthorized'); } catch { /* ignore */ }
      return;
    }
    if (!claims?.sub || !claims?.tenant_id || claims.typ === 'refresh') { try { socket.close(4001, 'unauthorized'); } catch {} return; }

    const tenantId = String(claims.tenant_id);
    const userId = String(claims.sub);
    const name = String(claims.name || '');
    const key = rkey(tenantId, userId);

    const wasOffline = !registry.has(key);
    if (!registry.has(key)) registry.set(key, new Set());
    registry.get(key)!.add(socket);
    meta.set(socket, { tenantId, userId, name });
    if (wasOffline) broadcastPresence(tenantId, userId, true);

    socket.send(JSON.stringify({ type: 'ready', online: onlineUserIds(tenantId) }));

    socket.on('message', (raw: any) => {
      let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
      if (!m || typeof m.type !== 'string') return;
      if (!RELAY_TYPES.has(m.type)) return;
      const to = String(m.to || '');
      if (!to) return;
      // Same-tenant only: the target is looked up in this tenant's registry, so
      // a signaling message can never cross a tenant boundary.
      sendTo(tenantId, to, { ...m, from: userId, fromName: name });
    });

    socket.on('close', () => {
      const set = registry.get(key);
      if (set) {
        set.delete(socket);
        if (set.size === 0) { registry.delete(key); broadcastPresence(tenantId, userId, false); }
      }
      meta.delete(socket);
    });
  });

  // ── REST: presence, history, records ──────────────────────────────
  fastify.get('/presence', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    return { online: onlineUserIds(user.tenant_id).filter(id => id !== user.sub) };
  });

  fastify.get('/config', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    // Public STUN handles same-network / simple-NAT calls on its own. For strict
    // NATs a TURN relay is required — read it from the tenant's own settings
    // (settings.calls.turn = { urls, username, credential }), then fall back to a
    // platform-wide one in the environment. The frontend uses whatever we return,
    // so configuring TURN makes calls work across strict NATs with no code change.
    const iceServers: any[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return (row?.settings as any) ?? {};
    });
    const turn = settings?.calls?.turn;
    if (turn?.urls) {
      iceServers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
    } else if (process.env.TURN_URL) {
      iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    }
    return { iceServers, turnConfigured: iceServers.length > 2 };
  });

  fastify.get('/calls', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_calls as c')
        .innerJoin('users as caller', 'caller.id', 'c.caller_id')
        .innerJoin('users as callee', 'callee.id', 'c.callee_id')
        .select(['c.id', 'c.caller_id', 'c.callee_id', 'c.kind', 'c.status', 'c.started_at',
                 'c.answered_at', 'c.ended_at', 'c.duration_seconds',
                 'caller.name as caller_name', 'callee.name as callee_name'])
        .where('c.tenant_id', '=', user.tenant_id)
        .where((eb) => eb.or([eb('c.caller_id', '=', user.sub), eb('c.callee_id', '=', user.sub)]))
        .orderBy('c.started_at', 'desc')
        .limit(100)
        .execute();
    });
  });

  fastify.post('/calls', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const b = (req.body as any) || {};
    if (!b.callee_id) return reply.status(400).send({ error: 'callee_id is required' });
    if (b.callee_id === user.sub) return reply.status(400).send({ error: 'You cannot call yourself' });
    return withTenant(user.tenant_id, async (trx) => {
      const callee = await trx.selectFrom('users').select('id').where('id', '=', b.callee_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!callee) return reply.status(404).send({ error: 'Person not found' });
      return trx.insertInto('hr_calls').values({
        tenant_id: user.tenant_id, caller_id: user.sub, callee_id: b.callee_id,
        kind: b.kind === 'VOICE' ? 'VOICE' : 'VIDEO', status: 'RINGING',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/calls/:id', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const VALID = ['RINGING', 'ONGOING', 'ENDED', 'MISSED', 'DECLINED'];
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.status !== undefined) {
      if (!VALID.includes(b.status)) return reply.status(400).send({ error: 'invalid status' });
      patch.status = b.status;
      if (b.status === 'ONGOING') patch.answered_at = new Date();
      if (['ENDED', 'MISSED', 'DECLINED'].includes(b.status)) patch.ended_at = new Date();
    }
    if (b.duration_seconds !== undefined) patch.duration_seconds = Math.max(0, Number(b.duration_seconds) || 0);
    return withTenant(user.tenant_id, async (trx) => {
      // Only a participant may update the record.
      const updated = await trx.updateTable('hr_calls').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .where((eb) => eb.or([eb('caller_id', '=', user.sub), eb('callee_id', '=', user.sub)]))
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Call not found' });
      return updated;
    });
  });
}
