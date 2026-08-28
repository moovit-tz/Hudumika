import type { FastifyInstance } from 'fastify';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { COOKIE_NAMES } from '../lib/cookies.js';
import { env } from '../config/env.js';
import { sql } from 'kysely';
import crypto from 'crypto';

/**
 * NexusHR calls — 1:1 voice/video, plus group meetings (mesh WebRTC: every
 * participant connects directly to every other; no media server).
 *
 * WebRTC media is peer-to-peer and never touches the server. This module only
 * (a) relays signaling (ring / SDP offer & answer / ICE candidates / hang-up,
 * and for meetings, room join/leave rosters) between users of the SAME
 * tenant over a WebSocket, (b) tracks who is connected so the directory can
 * show presence, and (c) persists metadata (call/meeting records, meeting
 * attendance) for history and the metrics dashboard. SDP/ICE payloads are
 * relayed, never stored.
 *
 * Presence and room rosters are in-memory (per server instance) — appropriate
 * for a single-node deployment; a multi-node rollout would move both to
 * Redis pub/sub.
 *
 * Mesh has a real ceiling: every participant uploads a separate stream to
 * every other participant, so cost grows with the square of the group size.
 * Fine for typical internal team meetings; not for anything large — there is
 * no admission control past that, by design (an internal tool, not a public
 * webinar product).
 */

// key = `${tenantId}:${userId}` → the set of that user's live sockets.
const registry = new Map<string, Set<any>>();
const meta = new WeakMap<any, { tenantId: string; userId: string; name: string; rooms: Set<string> }>();
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

const RELAY_TYPES = new Set([
  'ring', 'offer', 'answer', 'ice', 'accept', 'decline', 'hangup', 'cancel',
  // Meeting host controls — targeted at one participant (`to`), same generic
  // relay as everything else above. A signal, not an enforced action: WebRTC
  // gives no way for one peer to reach into another's device, so the
  // receiving client complies by muting/leaving itself on receipt.
  'host-mute-request', 'host-remove',
]);
// Meeting-wide broadcasts (chat, reactions) — relayed to every room member
// via the server's own roster rather than the client looping over peer ids,
// so a message still reaches everyone even mid-connection-negotiation.
const ROOM_BROADCAST_TYPES = new Set(['room-chat', 'room-reaction', 'room-status']);

// Meeting rooms: key = `${tenantId}:${meetingId}` → the set of userIds
// currently in that room. Separate from `registry` (which tracks a user's
// live sockets for 1:1 presence) since one user can be a member of several
// rooms' worth of state across reconnects; this only tracks room membership,
// signaling itself is still relayed socket-to-socket via `sendTo` above,
// keyed by userId exactly like a 1:1 call — mesh just means more pairs of
// offer/answer/ice than a 1:1 call has, not a different relay mechanism.
const rooms = new Map<string, Map<string, string>>(); // roomKey -> (userId -> displayName)
const roomKey = (t: string, m: string) => `${t}:${m}`;

function broadcastToRoom(tenantId: string, meetingId: string, payload: unknown, exceptUserId?: string) {
  const members = rooms.get(roomKey(tenantId, meetingId));
  if (!members) return;
  for (const userId of members.keys()) {
    if (userId === exceptUserId) continue;
    sendTo(tenantId, userId, payload);
  }
}

function roomRosterCount(tenantId: string, meetingId: string): number {
  return rooms.get(roomKey(tenantId, meetingId))?.size ?? 0;
}

// Shared by /config and a meeting join response — same TURN resolution
// either way, so configuring TURN once makes both 1:1 calls and meetings
// work across strict NATs with no code change.
async function resolveIceServers(tenantId: string): Promise<any[]> {
  const iceServers: any[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const settings = await withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    return (row?.settings as any) ?? {};
  });
  const turn = settings?.calls?.turn;
  if (turn?.urls) {
    iceServers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
  } else if (process.env.TURN_URL) {
    iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return iceServers;
}

// Crockford base32 (no 0/O/1/I) — a join code that's short enough to read
// aloud/type but has no ambiguous characters.
const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateJoinCode(): string {
  let code = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) code += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length];
  return code;
}

export async function callsRoutes(fastify: FastifyInstance) {
  // ── Signaling socket ──────────────────────────────────────────────
  // Browsers can't set an Authorization header on a WebSocket handshake, but
  // they DO send cookies on it — same as any other request to this origin —
  // so the httpOnly access cookie authenticates the connection. Used to
  // carry the raw access token as a `?token=` query param instead (browser
  // history, server/proxy logs); the cookie migration retired that.
  fastify.get('/signal', { websocket: true }, (socket: any, req: any) => {
    // No CORS preflight applies to a WS upgrade, so an ambient cookie
    // credential gets its own origin check here rather than relying on the
    // CORS plugin (which never runs for this route at all).
    const origin = String(req.headers?.origin || '');
    if (origin && !env.CORS_ORIGINS.split(',').includes(origin)) {
      try { socket.close(4001, 'unauthorized'); } catch { /* ignore */ }
      return;
    }

    let claims: any;
    try {
      const token = req.cookies?.[COOKIE_NAMES.access] || req.cookies?.[COOKIE_NAMES.orgAccess] || '';
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
    meta.set(socket, { tenantId, userId, name, rooms: new Set() });
    if (wasOffline) broadcastPresence(tenantId, userId, true);

    socket.send(JSON.stringify({ type: 'ready', online: onlineUserIds(tenantId) }));

    function leaveRoom(meetingId: string) {
      const rk = roomKey(tenantId, meetingId);
      const members = rooms.get(rk);
      if (!members?.has(userId)) return;
      members.delete(userId);
      if (members.size === 0) rooms.delete(rk);
      meta.get(socket)?.rooms.delete(meetingId);
      broadcastToRoom(tenantId, meetingId, { type: 'peer-left', meetingId, userId });
    }

    socket.on('message', (raw: any) => {
      let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
      if (!m || typeof m.type !== 'string') return;

      // Meeting room membership — bookkeeping only, not a plain relay: the
      // server needs to know who's in a room to hand a new joiner the
      // current roster (mesh connections are initiated client-side once
      // each side knows who else to dial).
      if (m.type === 'join-room') {
        const meetingId = String(m.meetingId || '');
        if (!meetingId) return;
        const rk = roomKey(tenantId, meetingId);
        if (!rooms.has(rk)) rooms.set(rk, new Map());
        const members = rooms.get(rk)!;
        const peers = Array.from(members.entries()).map(([id, n]) => ({ id, name: n }));
        members.set(userId, name);
        meta.get(socket)?.rooms.add(meetingId);
        socket.send(JSON.stringify({ type: 'room-peers', meetingId, peers }));
        broadcastToRoom(tenantId, meetingId, { type: 'peer-joined', meetingId, userId, name }, userId);
        return;
      }
      if (m.type === 'leave-room') {
        const meetingId = String(m.meetingId || '');
        if (meetingId) leaveRoom(meetingId);
        return;
      }
      if (ROOM_BROADCAST_TYPES.has(m.type)) {
        const meetingId = String(m.meetingId || '');
        if (!meetingId) return;
        broadcastToRoom(tenantId, meetingId, { ...m, from: userId, fromName: name }, userId);
        return;
      }

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
      for (const meetingId of Array.from(meta.get(socket)?.rooms || [])) leaveRoom(meetingId);
      meta.delete(socket);
    });
  });

  // ── REST: presence, history, records ──────────────────────────────
  fastify.get('/presence', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    return { online: onlineUserIds(user.tenant_id).filter(id => id !== user.sub) };
  });

  fastify.get('/config', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    // Public STUN handles same-network / simple-NAT calls on its own. For strict
    // NATs a TURN relay is required — read it from the tenant's own settings
    // (settings.calls.turn = { urls, username, credential }), then fall back to a
    // platform-wide one in the environment. The frontend uses whatever we return,
    // so configuring TURN makes calls work across strict NATs with no code change.
    const iceServers = await resolveIceServers(req.user.tenant_id);
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

  // ── REST: group meetings ────────────────────────────────────────────
  const MEETING_KINDS = ['VIDEO', 'VOICE'];

  fastify.get('/meetings', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_meetings as m')
        .innerJoin('users as host', 'host.id', 'm.host_id')
        .select(['m.id', 'm.title', 'm.join_code', 'm.kind', 'm.status', 'm.scheduled_at',
                 'm.started_at', 'm.ended_at', 'm.locked', 'm.host_id', 'host.name as host_name'])
        .where('m.tenant_id', '=', user.tenant_id)
        .where('m.status', '!=', 'CANCELLED')
        .orderBy(sql`COALESCE(m.scheduled_at, m.started_at, m.created_at)`, 'desc')
        .limit(60)
        .execute();
    });
  });

  fastify.get('/meetings/by-code/:code', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const code = String((req.params as any).code || '').toUpperCase();
    return withTenant(user.tenant_id, async (trx) => {
      const m = await trx.selectFrom('hr_meetings').selectAll().where('tenant_id', '=', user.tenant_id).where('join_code', '=', code).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'No meeting found for that code' });
      return m;
    });
  });

  fastify.get('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const m = await trx.selectFrom('hr_meetings as m')
        .innerJoin('users as host', 'host.id', 'm.host_id')
        .select(['m.id', 'm.title', 'm.join_code', 'm.kind', 'm.status', 'm.scheduled_at',
                 'm.started_at', 'm.ended_at', 'm.locked', 'm.host_id', 'host.name as host_name'])
        .where('m.id', '=', id).where('m.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'Meeting not found' });
      return { ...m, liveParticipantCount: roomRosterCount(user.tenant_id, id) };
    });
  });

  fastify.post('/meetings', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const b = (req.body as any) || {};
    const kind = MEETING_KINDS.includes(b.kind) ? b.kind : 'VIDEO';
    let scheduledAt: Date | null = null;
    if (b.scheduled_at) {
      scheduledAt = new Date(b.scheduled_at);
      if (Number.isNaN(scheduledAt.getTime())) return reply.status(400).send({ error: 'Invalid scheduled_at' });
      if (scheduledAt.getTime() < Date.now() - 60_000) return reply.status(400).send({ error: 'Scheduled time must be in the future' });
    }
    const title = String(b.title || '').trim() || 'Meeting';
    return withTenant(user.tenant_id, async (trx) => {
      let joinCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateJoinCode();
        const clash = await trx.selectFrom('hr_meetings').select('id').where('join_code', '=', candidate).executeTakeFirst();
        if (!clash) { joinCode = candidate; break; }
      }
      if (!joinCode) return reply.status(500).send({ error: 'Could not generate a join code — try again' });
      const isInstant = !scheduledAt;
      return trx.insertInto('hr_meetings').values({
        tenant_id: user.tenant_id, host_id: user.sub, title, join_code: joinCode, kind,
        status: isInstant ? 'ACTIVE' : 'SCHEDULED',
        scheduled_at: scheduledAt, started_at: isInstant ? new Date() : null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.title !== undefined) patch.title = String(b.title).trim() || 'Meeting';
    if (b.locked !== undefined) patch.locked = !!b.locked;
    if (b.kind !== undefined && MEETING_KINDS.includes(b.kind)) patch.kind = b.kind;
    if (b.scheduled_at !== undefined) {
      const d = b.scheduled_at ? new Date(b.scheduled_at) : null;
      if (d && Number.isNaN(d.getTime())) return reply.status(400).send({ error: 'Invalid scheduled_at' });
      patch.scheduled_at = d;
    }
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_meetings').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Meeting not found, or you are not its host' });
      return updated;
    });
  });

  fastify.delete('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_meetings').set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub).where('status', '=', 'SCHEDULED')
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'No cancellable scheduled meeting found, or you are not its host' });
      return updated;
    });
  });

  fastify.post('/meetings/:id/join', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.selectFrom('hr_meetings').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });
      if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') return reply.status(410).send({ error: 'This meeting has ended' });
      const isHost = meeting.host_id === user.sub;
      if (meeting.locked && !isHost) {
        const attendedBefore = await trx.selectFrom('hr_meeting_participants').select('id')
          .where('meeting_id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
        if (!attendedBefore) return reply.status(403).send({ error: 'This meeting is locked' });
      }
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (meeting.status === 'SCHEDULED') { patch.status = 'ACTIVE'; patch.started_at = new Date(); }
      const [updatedMeeting] = await Promise.all([
        Object.keys(patch).length > 1
          ? trx.updateTable('hr_meetings').set(patch as any).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
          : Promise.resolve(meeting),
        trx.insertInto('hr_meeting_participants').values({
          tenant_id: user.tenant_id, meeting_id: id, user_id: user.sub, role: isHost ? 'HOST' : 'PARTICIPANT',
        }).execute(),
      ]);
      const iceServers = await resolveIceServers(user.tenant_id);
      return { meeting: updatedMeeting, iceServers, role: isHost ? 'HOST' : 'PARTICIPANT' };
    });
  });

  fastify.post('/meetings/:id/leave', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const open = await trx.selectFrom('hr_meeting_participants').select(['id', 'joined_at'])
        .where('meeting_id', '=', id).where('user_id', '=', user.sub).where('left_at', 'is', null)
        .orderBy('joined_at', 'desc').executeTakeFirst();
      if (!open) return { ok: true };
      const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(open.joined_at).getTime()) / 1000));
      await trx.updateTable('hr_meeting_participants').set({ left_at: new Date(), duration_seconds: durationSeconds }).where('id', '=', open.id).execute();
      return { ok: true, duration_seconds: durationSeconds };
    });
  });

  fastify.post('/meetings/:id/end', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.updateTable('hr_meetings').set({ status: 'ENDED', ended_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub).where('status', '!=', 'ENDED')
        .returningAll().executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found, or you are not its host' });
      const openRows = await trx.selectFrom('hr_meeting_participants').select(['id', 'joined_at'])
        .where('meeting_id', '=', id).where('left_at', 'is', null).execute();
      for (const row of openRows) {
        const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(row.joined_at).getTime()) / 1000));
        await trx.updateTable('hr_meeting_participants').set({ left_at: new Date(), duration_seconds: durationSeconds }).where('id', '=', row.id).execute();
      }
      broadcastToRoom(user.tenant_id, id, { type: 'meeting-ended', meetingId: id });
      return meeting;
    });
  });

  fastify.get('/meetings/:id/participants', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_meeting_participants as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select(['p.id', 'p.user_id', 'u.name as user_name', 'p.role', 'p.joined_at', 'p.left_at', 'p.duration_seconds'])
        .where('p.tenant_id', '=', user.tenant_id).where('p.meeting_id', '=', id)
        .orderBy('p.joined_at', 'asc')
        .execute();
    });
  });

  // ── REST: metrics ───────────────────────────────────────────────────
  // Personal figures are always real, computed from hr_calls/hr_meeting_participants
  // — never a fabricated placeholder. The tenant-wide leaderboard section is
  // gated to HR/admin roles: a "who calls the most" ranking visible to every
  // employee reads as surveillance in an HR context, not a helpful metric.
  fastify.get('/metrics/calls', { preHandler: [fastify.authenticate, requireEntitlement('nexushr')] }, async (req: any) => {
    const user = req.user;
    const days = Math.min(365, Math.max(1, Number((req.query as any)?.days) || 30));
    const since = new Date(Date.now() - days * 86400_000);
    const isMgmt = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'HR'].includes(user.role);

    return withTenant(user.tenant_id, async (trx) => {
      const myCalls = await trx.selectFrom('hr_calls')
        .select([
          sql<number>`count(*)`.as('total'),
          sql<number>`count(*) filter (where status in ('MISSED','DECLINED'))`.as('missed'),
          sql<number>`coalesce(sum(duration_seconds), 0)`.as('total_seconds'),
        ])
        .where('tenant_id', '=', user.tenant_id)
        .where((eb) => eb.or([eb('caller_id', '=', user.sub), eb('callee_id', '=', user.sub)]))
        .where('started_at', '>=', since)
        .executeTakeFirstOrThrow();

      const myMeetings = await trx.selectFrom('hr_meeting_participants')
        .select([sql<number>`count(*)`.as('total'), sql<number>`coalesce(sum(duration_seconds), 0)`.as('total_seconds')])
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('joined_at', '>=', since)
        .executeTakeFirstOrThrow();

      const personal = {
        calls: Number(myCalls.total), callsMissed: Number(myCalls.missed), callSeconds: Number(myCalls.total_seconds),
        meetingsJoined: Number(myMeetings.total), meetingSeconds: Number(myMeetings.total_seconds),
      };

      if (!isMgmt) return { days, personal };

      const tenantCalls = await trx.selectFrom('hr_calls')
        .select([
          sql<number>`count(*)`.as('total'),
          sql<number>`count(*) filter (where status in ('MISSED','DECLINED'))`.as('missed'),
          sql<number>`coalesce(avg(duration_seconds) filter (where status = 'ENDED'), 0)`.as('avg_seconds'),
        ])
        .where('tenant_id', '=', user.tenant_id).where('started_at', '>=', since)
        .executeTakeFirstOrThrow();

      const tenantMeetings = await trx.selectFrom('hr_meetings')
        .select([sql<number>`count(*)`.as('total')])
        .where('tenant_id', '=', user.tenant_id).where('status', '!=', 'CANCELLED')
        .where(sql`coalesce(started_at, scheduled_at)`, '>=', since)
        .executeTakeFirstOrThrow();

      // Combined per-day volume — calls and meetings together, so the trend
      // isn't silently missing whichever of the two a given day only had.
      const dailyTrendRows = await sql<{ day: string; calls: number; meetings: number }>`
        SELECT day, SUM(calls)::int AS calls, SUM(meetings)::int AS meetings FROM (
          SELECT to_char(started_at, 'YYYY-MM-DD') AS day, count(*) AS calls, 0 AS meetings
          FROM hr_calls WHERE tenant_id = ${user.tenant_id} AND started_at >= ${since}
          GROUP BY 1
          UNION ALL
          SELECT to_char(COALESCE(started_at, scheduled_at), 'YYYY-MM-DD') AS day, 0 AS calls, count(*) AS meetings
          FROM hr_meetings WHERE tenant_id = ${user.tenant_id} AND status != 'CANCELLED' AND COALESCE(started_at, scheduled_at) >= ${since}
          GROUP BY 1
        ) combined
        GROUP BY day ORDER BY day ASC
      `.execute(trx);
      const dailyTrend = dailyTrendRows.rows;

      const topParticipants = await trx.selectFrom('hr_meeting_participants as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select(['p.user_id', 'u.name as user_name', sql<number>`count(*)`.as('meetings'), sql<number>`coalesce(sum(p.duration_seconds), 0)`.as('total_seconds')])
        .where('p.tenant_id', '=', user.tenant_id).where('p.joined_at', '>=', since)
        .groupBy(['p.user_id', 'u.name'])
        .orderBy(sql`coalesce(sum(p.duration_seconds), 0)`, 'desc')
        .limit(8)
        .execute();

      return {
        days, personal,
        tenant: {
          calls: Number(tenantCalls.total), callsMissed: Number(tenantCalls.missed),
          avgCallSeconds: Math.round(Number(tenantCalls.avg_seconds)), meetings: Number(tenantMeetings.total),
          dailyTrend: dailyTrend.map(r => ({ day: r.day, calls: Number(r.calls), meetings: Number(r.meetings) })),
          topParticipants: topParticipants.map(r => ({ userId: r.user_id, name: r.user_name, meetings: Number(r.meetings), totalSeconds: Number(r.total_seconds) })),
        },
      };
    });
  });
}
