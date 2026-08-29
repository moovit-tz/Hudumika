import type { FastifyInstance } from 'fastify';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { COOKIE_NAMES } from '../lib/cookies.js';
import { env } from '../config/env.js';
import { sql } from 'kysely';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { callAI } from './ai.routes.js';

/**
 * Bliss calls — the platform's comms hub, matching how Team Chat
 * (chat.routes.ts) already lives here rather than in any one app: 1:1
 * voice/video, plus group meetings (mesh WebRTC: every participant connects
 * directly to every other; no media server). Originally built for NexusHR
 * (migrations 226, 349-350) and relocated here (migration 351) — apps that
 * need calling (NexusHR staff calling colleagues, a future Calendar "join
 * meeting" link, etc.) pull it from here rather than owning their own copy.
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
  'host-mute-request', 'host-remove', 'host-camera-off-request',
  'host-chat-disable', 'host-chat-enable',
]);
// Meeting-wide broadcasts (chat, reactions) — relayed to every room member
// via the server's own roster rather than the client looping over peer ids,
// so a message still reaches everyone even mid-connection-negotiation.
const ROOM_BROADCAST_TYPES = new Set([
  'room-chat', 'room-reaction', 'room-status',
  // Meeting tools — live updates so every participant's panel refreshes the
  // moment the host/asker acts, instead of relying on polling. The tools
  // themselves are REST-backed (poll/question rows persist for the
  // post-meeting record); these are just "go re-fetch" pings plus the
  // timer's own start/stop (which is genuinely WS-only — nothing to persist
  // for a countdown).
  'poll-created', 'poll-voted', 'poll-closed',
  'question-asked', 'question-upvoted', 'question-answered',
  'transcript-line', 'timer-start', 'timer-stop',
  // Host controls — a meeting-wide setting flip (lock/chat/screen-share) or a
  // host-chosen spotlight, broadcast to whichever room key the message names
  // (the main room, or one specific breakout room — see below).
  'meeting-settings-changed', 'host-spotlight',
  // Screen-share annotation — the presenter's real strokes (persistent,
  // normalized 0..1 coordinates so they map correctly on every viewer's own
  // window size) and any viewer's ephemeral laser pointer.
  'annotation-draw', 'annotation-clear',
  // Breakout rooms — 'breakout-assigned' goes to the MAIN room (everyone
  // still there sees which room they were placed in); 'breakout-broadcast'
  // and 'breakout-closed' are sent by the server directly into each
  // breakout room's own key (see the routes below), not relayed by a client.
  'breakout-assigned', 'breakout-broadcast', 'breakout-closed',
]);

// Breakout rooms reuse the exact same room registry/signaling as the main
// meeting, just under a different room-key string — see the module comment
// on migration 355. No new Map, no new relay logic needed.
const breakoutRoomKey = (meetingId: string, breakoutRoomId: string) => `${meetingId}::bo::${breakoutRoomId}`;

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
  fastify.get('/presence', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    return { online: onlineUserIds(user.tenant_id).filter(id => id !== user.sub) };
  });

  fastify.get('/config', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    // Public STUN handles same-network / simple-NAT calls on its own. For strict
    // NATs a TURN relay is required — read it from the tenant's own settings
    // (settings.calls.turn = { urls, username, credential }), then fall back to a
    // platform-wide one in the environment. The frontend uses whatever we return,
    // so configuring TURN makes calls work across strict NATs with no code change.
    const iceServers = await resolveIceServers(req.user.tenant_id);
    return { iceServers, turnConfigured: iceServers.length > 2 };
  });

  fastify.get('/direct', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('bliss_calls as c')
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

  fastify.post('/direct', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const b = (req.body as any) || {};
    if (!b.callee_id) return reply.status(400).send({ error: 'callee_id is required' });
    if (b.callee_id === user.sub) return reply.status(400).send({ error: 'You cannot call yourself' });
    return withTenant(user.tenant_id, async (trx) => {
      const callee = await trx.selectFrom('users').select('id').where('id', '=', b.callee_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!callee) return reply.status(404).send({ error: 'Person not found' });
      return trx.insertInto('bliss_calls').values({
        tenant_id: user.tenant_id, caller_id: user.sub, callee_id: b.callee_id,
        kind: b.kind === 'VOICE' ? 'VOICE' : 'VIDEO', status: 'RINGING',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/direct/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
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
      const updated = await trx.updateTable('bliss_calls').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .where((eb) => eb.or([eb('caller_id', '=', user.sub), eb('callee_id', '=', user.sub)]))
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Call not found' });
      return updated;
    });
  });

  // ── REST: group meetings ────────────────────────────────────────────
  const MEETING_KINDS = ['VIDEO', 'VOICE'];

  fastify.get('/meetings', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('bliss_meetings as m')
        .innerJoin('users as host', 'host.id', 'm.host_id')
        .select(['m.id', 'm.title', 'm.join_code', 'm.kind', 'm.status', 'm.scheduled_at',
                 'm.started_at', 'm.ended_at', 'm.locked', 'm.host_id', 'host.name as host_name',
                 'm.password_hash', 'm.waiting_room_enabled'])
        .where('m.tenant_id', '=', user.tenant_id)
        .where('m.status', '!=', 'CANCELLED')
        .orderBy(sql`COALESCE(m.scheduled_at, m.started_at, m.created_at)`, 'desc')
        .limit(60)
        .execute();
      return rows.map(({ password_hash, ...r }) => ({ ...r, hasPassword: !!password_hash }));
    });
  });

  fastify.get('/meetings/by-code/:code', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const code = String((req.params as any).code || '').toUpperCase();
    return withTenant(user.tenant_id, async (trx) => {
      const m = await trx.selectFrom('bliss_meetings').selectAll().where('tenant_id', '=', user.tenant_id).where('join_code', '=', code).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'No meeting found for that code' });
      return m;
    });
  });

  fastify.get('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const m = await trx.selectFrom('bliss_meetings as m')
        .innerJoin('users as host', 'host.id', 'm.host_id')
        .select(['m.id', 'm.title', 'm.join_code', 'm.kind', 'm.status', 'm.scheduled_at',
                 'm.started_at', 'm.ended_at', 'm.locked', 'm.host_id', 'host.name as host_name',
                 'm.password_hash', 'm.waiting_room_enabled', 'm.chat_disabled', 'm.screen_share_disabled'])
        .where('m.id', '=', id).where('m.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'Meeting not found' });
      const { password_hash, ...rest } = m;
      return { ...rest, hasPassword: !!password_hash, liveParticipantCount: roomRosterCount(user.tenant_id, id) };
    });
  });

  fastify.post('/meetings', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
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
    const password = typeof b.password === 'string' ? b.password.trim() : '';
    return withTenant(user.tenant_id, async (trx) => {
      let joinCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateJoinCode();
        const clash = await trx.selectFrom('bliss_meetings').select('id').where('join_code', '=', candidate).executeTakeFirst();
        if (!clash) { joinCode = candidate; break; }
      }
      if (!joinCode) return reply.status(500).send({ error: 'Could not generate a join code — try again' });
      const isInstant = !scheduledAt;
      return trx.insertInto('bliss_meetings').values({
        tenant_id: user.tenant_id, host_id: user.sub, title, join_code: joinCode, kind,
        status: isInstant ? 'ACTIVE' : 'SCHEDULED',
        scheduled_at: scheduledAt, started_at: isInstant ? new Date() : null,
        password_hash: password ? hashPassword(password) : null,
        waiting_room_enabled: !!b.waiting_room_enabled,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
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
    // Host controls — meeting-wide toggles a host can flip mid-meeting, not
    // just at creation. An empty string clears an existing password rather
    // than being ignored, so "remove the password" has a real code path.
    if (b.password !== undefined) {
      const password = String(b.password || '').trim();
      patch.password_hash = password ? hashPassword(password) : null;
    }
    if (b.waiting_room_enabled !== undefined) patch.waiting_room_enabled = !!b.waiting_room_enabled;
    if (b.chat_disabled !== undefined) patch.chat_disabled = !!b.chat_disabled;
    if (b.screen_share_disabled !== undefined) patch.screen_share_disabled = !!b.screen_share_disabled;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('bliss_meetings').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Meeting not found, or you are not its host' });
      if (b.locked !== undefined || b.chat_disabled !== undefined || b.screen_share_disabled !== undefined) {
        broadcastToRoom(user.tenant_id, id, {
          type: 'meeting-settings-changed', meetingId: id,
          locked: updated.locked, chatDisabled: updated.chat_disabled, screenShareDisabled: updated.screen_share_disabled,
        });
      }
      return { ...updated, password_hash: undefined, hasPassword: !!updated.password_hash };
    });
  });

  fastify.delete('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('bliss_meetings').set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub).where('status', '=', 'SCHEDULED')
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'No cancellable scheduled meeting found, or you are not its host' });
      return updated;
    });
  });

  fastify.post('/meetings/:id/join', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.selectFrom('bliss_meetings').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });
      if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') return reply.status(410).send({ error: 'This meeting has ended' });
      const isHost = meeting.host_id === user.sub;
      if (meeting.locked && !isHost) {
        const attendedBefore = await trx.selectFrom('bliss_meeting_participants').select('id')
          .where('meeting_id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
        if (!attendedBefore) return reply.status(403).send({ error: 'This meeting is locked' });
      }
      if (meeting.password_hash && !isHost) {
        // 403, not 401 — the session/JWT is perfectly valid; it's this one
        // meeting's password that didn't match. A 401 here would trip the
        // platform-wide "session just died" handling (apiFetch's
        // handleUnauthorized clears the cached user on any 401), which is
        // exactly the wrong reaction to a mistyped meeting password.
        if (!b.password || !verifyPassword(String(b.password), meeting.password_hash)) {
          return reply.status(403).send({ error: 'A password is required to join this meeting.', passwordRequired: true });
        }
      }
      if (meeting.waiting_room_enabled && !isHost) {
        const existing = await trx.selectFrom('bliss_meeting_waiting_room').selectAll()
          .where('meeting_id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
        if (!existing) {
          await trx.insertInto('bliss_meeting_waiting_room').values({
            tenant_id: user.tenant_id, meeting_id: id, user_id: user.sub, user_name: user.name || 'Guest',
          }).execute();
          sendTo(user.tenant_id, meeting.host_id, { type: 'waiting-room-update', meetingId: id });
          return { waiting: true };
        }
        if (existing.status === 'PENDING') return { waiting: true };
        if (existing.status === 'REJECTED') return reply.status(403).send({ error: 'The host did not admit you to this meeting.' });
        // ADMITTED — fall through to the normal join below.
      }
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (meeting.status === 'SCHEDULED') { patch.status = 'ACTIVE'; patch.started_at = new Date(); }
      const [updatedMeeting] = await Promise.all([
        Object.keys(patch).length > 1
          ? trx.updateTable('bliss_meetings').set(patch as any).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
          : Promise.resolve(meeting),
        trx.insertInto('bliss_meeting_participants').values({
          tenant_id: user.tenant_id, meeting_id: id, user_id: user.sub, role: isHost ? 'HOST' : 'PARTICIPANT',
        }).execute(),
      ]);
      const iceServers = await resolveIceServers(user.tenant_id);
      return { meeting: updatedMeeting, iceServers, role: isHost ? 'HOST' : 'PARTICIPANT' };
    });
  });

  fastify.post('/meetings/:id/leave', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const open = await trx.selectFrom('bliss_meeting_participants').select(['id', 'joined_at'])
        .where('meeting_id', '=', id).where('user_id', '=', user.sub).where('left_at', 'is', null)
        .orderBy('joined_at', 'desc').executeTakeFirst();
      if (!open) return { ok: true };
      const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(open.joined_at).getTime()) / 1000));
      await trx.updateTable('bliss_meeting_participants').set({ left_at: new Date(), duration_seconds: durationSeconds }).where('id', '=', open.id).execute();
      return { ok: true, duration_seconds: durationSeconds };
    });
  });

  fastify.post('/meetings/:id/end', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.updateTable('bliss_meetings').set({ status: 'ENDED', ended_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub).where('status', '!=', 'ENDED')
        .returningAll().executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found, or you are not its host' });
      const openRows = await trx.selectFrom('bliss_meeting_participants').select(['id', 'user_id', 'joined_at'])
        .where('meeting_id', '=', id).where('left_at', 'is', null).execute();
      for (const row of openRows) {
        const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(row.joined_at).getTime()) / 1000));
        await trx.updateTable('bliss_meeting_participants').set({ left_at: new Date(), duration_seconds: durationSeconds }).where('id', '=', row.id).execute();
        // Sent directly to each participant (not just broadcast to the main
        // room key) so it still reaches anyone currently inside a breakout
        // room, which lives under its own separate room key.
        sendTo(user.tenant_id, row.user_id, { type: 'meeting-ended', meetingId: id });
      }
      broadcastToRoom(user.tenant_id, id, { type: 'meeting-ended', meetingId: id });
      return meeting;
    });
  });

  fastify.get('/meetings/:id/participants', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('bliss_meeting_participants as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select(['p.id', 'p.user_id', 'u.name as user_name', 'p.role', 'p.joined_at', 'p.left_at', 'p.duration_seconds'])
        .where('p.tenant_id', '=', user.tenant_id).where('p.meeting_id', '=', id)
        .orderBy('p.joined_at', 'asc')
        .execute();
    });
  });

  // ── REST: metrics ───────────────────────────────────────────────────
  // Personal figures are always real, computed from bliss_calls/bliss_meeting_participants
  // — never a fabricated placeholder. The tenant-wide leaderboard section is
  // gated to HR/admin roles: a "who calls the most" ranking visible to every
  // employee reads as surveillance in an HR context, not a helpful metric.
  fastify.get('/metrics', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const days = Math.min(365, Math.max(1, Number((req.query as any)?.days) || 30));
    const since = new Date(Date.now() - days * 86400_000);
    const isMgmt = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'HR'].includes(user.role);

    return withTenant(user.tenant_id, async (trx) => {
      const myCalls = await trx.selectFrom('bliss_calls')
        .select([
          sql<number>`count(*)`.as('total'),
          sql<number>`count(*) filter (where status in ('MISSED','DECLINED'))`.as('missed'),
          sql<number>`coalesce(sum(duration_seconds), 0)`.as('total_seconds'),
        ])
        .where('tenant_id', '=', user.tenant_id)
        .where((eb) => eb.or([eb('caller_id', '=', user.sub), eb('callee_id', '=', user.sub)]))
        .where('started_at', '>=', since)
        .executeTakeFirstOrThrow();

      const myMeetings = await trx.selectFrom('bliss_meeting_participants')
        .select([sql<number>`count(*)`.as('total'), sql<number>`coalesce(sum(duration_seconds), 0)`.as('total_seconds')])
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('joined_at', '>=', since)
        .executeTakeFirstOrThrow();

      const personal = {
        calls: Number(myCalls.total), callsMissed: Number(myCalls.missed), callSeconds: Number(myCalls.total_seconds),
        meetingsJoined: Number(myMeetings.total), meetingSeconds: Number(myMeetings.total_seconds),
      };

      if (!isMgmt) return { days, personal };

      const tenantCalls = await trx.selectFrom('bliss_calls')
        .select([
          sql<number>`count(*)`.as('total'),
          sql<number>`count(*) filter (where status in ('MISSED','DECLINED'))`.as('missed'),
          sql<number>`coalesce(avg(duration_seconds) filter (where status = 'ENDED'), 0)`.as('avg_seconds'),
        ])
        .where('tenant_id', '=', user.tenant_id).where('started_at', '>=', since)
        .executeTakeFirstOrThrow();

      const tenantMeetings = await trx.selectFrom('bliss_meetings')
        .select([sql<number>`count(*)`.as('total')])
        .where('tenant_id', '=', user.tenant_id).where('status', '!=', 'CANCELLED')
        .where(sql`coalesce(started_at, scheduled_at)`, '>=', since)
        .executeTakeFirstOrThrow();

      // Combined per-day volume — calls and meetings together, so the trend
      // isn't silently missing whichever of the two a given day only had.
      const dailyTrendRows = await sql<{ day: string; calls: number; meetings: number }>`
        SELECT day, SUM(calls)::int AS calls, SUM(meetings)::int AS meetings FROM (
          SELECT to_char(started_at, 'YYYY-MM-DD') AS day, count(*) AS calls, 0 AS meetings
          FROM bliss_calls WHERE tenant_id = ${user.tenant_id} AND started_at >= ${since}
          GROUP BY 1
          UNION ALL
          SELECT to_char(COALESCE(started_at, scheduled_at), 'YYYY-MM-DD') AS day, 0 AS calls, count(*) AS meetings
          FROM bliss_meetings WHERE tenant_id = ${user.tenant_id} AND status != 'CANCELLED' AND COALESCE(started_at, scheduled_at) >= ${since}
          GROUP BY 1
        ) combined
        GROUP BY day ORDER BY day ASC
      `.execute(trx);
      const dailyTrend = dailyTrendRows.rows;

      const topParticipants = await trx.selectFrom('bliss_meeting_participants as p')
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

  // ── REST: meeting tools — polls, Q&A, transcript ────────────────────
  // Real, DB-backed data behind the "Meeting tools" panel — a poll/question/
  // transcript persists past the meeting (unlike the WS broadcasts above,
  // which only ever tell a client "go re-fetch").

  async function requireHost(trx: any, tenantId: string, meetingId: string, userId: string) {
    const meeting = await trx.selectFrom('bliss_meetings').select(['id', 'host_id']).where('id', '=', meetingId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!meeting) return { ok: false as const, status: 404, error: 'Meeting not found' };
    if (meeting.host_id !== userId) return { ok: false as const, status: 403, error: 'Only the host can do this' };
    return { ok: true as const };
  }

  // Co-hosts get the same in-meeting moderation powers as the host — waiting
  // room admission, per-participant controls, breakout rooms, summaries —
  // short of the handful of things reserved to the real host below (ending
  // the meeting for everyone, assigning/removing co-hosts, changing the
  // meeting's own password/lock/chat/screen-share settings).
  async function requireHostOrCoHost(trx: any, tenantId: string, meetingId: string, userId: string) {
    const meeting = await trx.selectFrom('bliss_meetings').select(['id', 'host_id']).where('id', '=', meetingId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!meeting) return { ok: false as const, status: 404, error: 'Meeting not found' };
    if (meeting.host_id === userId) return { ok: true as const };
    const coHost = await trx.selectFrom('bliss_meeting_participants').select('id')
      .where('meeting_id', '=', meetingId).where('user_id', '=', userId).where('role', '=', 'CO_HOST').where('left_at', 'is', null)
      .executeTakeFirst();
    if (!coHost) return { ok: false as const, status: 403, error: 'Only the host or a co-host can do this' };
    return { ok: true as const };
  }

  fastify.get('/meetings/:id/polls', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const polls = await trx.selectFrom('bliss_meeting_polls').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id)
        .orderBy('created_at', 'desc').execute();
      const results = [];
      for (const p of polls) {
        const votes = await trx.selectFrom('bliss_meeting_poll_votes').select(['option_index', 'user_id'])
          .where('tenant_id', '=', user.tenant_id).where('poll_id', '=', p.id).execute();
        const options: string[] = Array.isArray(p.options) ? p.options : JSON.parse(p.options as any);
        const tally = options.map((_, i) => votes.filter(v => v.option_index === i).length);
        const myVote = votes.find(v => v.user_id === user.sub)?.option_index ?? null;
        results.push({ ...p, options, tally, totalVotes: votes.length, myVote });
      }
      return results;
    });
  });

  fastify.post('/meetings/:id/polls', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const question = String(b.question || '').trim();
    const options: string[] = Array.isArray(b.options) ? b.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
    if (!question) return reply.status(400).send({ error: 'A question is required' });
    if (options.length < 2) return reply.status(400).send({ error: 'At least two options are required' });
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const poll = await trx.insertInto('bliss_meeting_polls').values({
        tenant_id: user.tenant_id, meeting_id: id, question, options: JSON.stringify(options),
        created_by: user.sub, created_by_name: user.name || 'Host',
      }).returningAll().executeTakeFirstOrThrow();
      broadcastToRoom(user.tenant_id, id, { type: 'poll-created', meetingId: id, pollId: poll.id });
      return { ...poll, options };
    });
  });

  fastify.post('/meetings/:id/polls/:pollId/vote', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id, pollId } = req.params as any;
    const optionIndex = Number((req.body as any)?.option_index);
    if (!Number.isInteger(optionIndex) || optionIndex < 0) return reply.status(400).send({ error: 'option_index is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const poll = await trx.selectFrom('bliss_meeting_polls').select(['id', 'closed_at', 'options']).where('id', '=', pollId).where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).executeTakeFirst();
      if (!poll) return reply.status(404).send({ error: 'Poll not found' });
      if (poll.closed_at) return reply.status(409).send({ error: 'This poll is closed' });
      const options: string[] = Array.isArray(poll.options) ? poll.options : JSON.parse(poll.options as any);
      if (optionIndex >= options.length) return reply.status(400).send({ error: 'Invalid option' });
      const existing = await trx.selectFrom('bliss_meeting_poll_votes').select('id').where('poll_id', '=', pollId).where('user_id', '=', user.sub).executeTakeFirst();
      if (existing) {
        await trx.updateTable('bliss_meeting_poll_votes').set({ option_index: optionIndex }).where('id', '=', existing.id).execute();
      } else {
        await trx.insertInto('bliss_meeting_poll_votes').values({ tenant_id: user.tenant_id, poll_id: pollId, user_id: user.sub, option_index: optionIndex }).execute();
      }
      broadcastToRoom(user.tenant_id, id, { type: 'poll-voted', meetingId: id, pollId });
      return { ok: true };
    });
  });

  fastify.post('/meetings/:id/polls/:pollId/close', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id, pollId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const updated = await trx.updateTable('bliss_meeting_polls').set({ closed_at: new Date() })
        .where('id', '=', pollId).where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('closed_at', 'is', null)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Poll not found or already closed' });
      broadcastToRoom(user.tenant_id, id, { type: 'poll-closed', meetingId: id, pollId });
      return updated;
    });
  });

  fastify.get('/meetings/:id/questions', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const questions = await trx.selectFrom('bliss_meeting_questions').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).execute();
      const results = [];
      for (const q of questions) {
        const upvotes = await trx.selectFrom('bliss_meeting_question_upvotes').select('user_id')
          .where('tenant_id', '=', user.tenant_id).where('question_id', '=', q.id).execute();
        results.push({ ...q, upvoteCount: upvotes.length, myUpvote: upvotes.some(u => u.user_id === user.sub) });
      }
      results.sort((a, b) => (b.upvoteCount - a.upvoteCount) || (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return results;
    });
  });

  fastify.post('/meetings/:id/questions', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const text = String((req.body as any)?.text || '').trim();
    if (!text) return reply.status(400).send({ error: 'A question is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const q = await trx.insertInto('bliss_meeting_questions').values({
        tenant_id: user.tenant_id, meeting_id: id, user_id: user.sub, user_name: user.name || 'Guest', text,
      }).returningAll().executeTakeFirstOrThrow();
      broadcastToRoom(user.tenant_id, id, { type: 'question-asked', meetingId: id, questionId: q.id });
      return { ...q, upvoteCount: 0, myUpvote: false };
    });
  });

  fastify.post('/meetings/:id/questions/:qId/upvote', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id, qId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const q = await trx.selectFrom('bliss_meeting_questions').select('id').where('id', '=', qId).where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).executeTakeFirst();
      if (!q) return reply.status(404).send({ error: 'Question not found' });
      const existing = await trx.selectFrom('bliss_meeting_question_upvotes').select('id').where('question_id', '=', qId).where('user_id', '=', user.sub).executeTakeFirst();
      if (existing) {
        await trx.deleteFrom('bliss_meeting_question_upvotes').where('id', '=', existing.id).execute();
      } else {
        await trx.insertInto('bliss_meeting_question_upvotes').values({ tenant_id: user.tenant_id, question_id: qId, user_id: user.sub }).execute();
      }
      broadcastToRoom(user.tenant_id, id, { type: 'question-upvoted', meetingId: id, questionId: qId });
      return { ok: true, upvoted: !existing };
    });
  });

  fastify.post('/meetings/:id/questions/:qId/answer', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id, qId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const updated = await trx.updateTable('bliss_meeting_questions').set({ answered: true })
        .where('id', '=', qId).where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Question not found' });
      broadcastToRoom(user.tenant_id, id, { type: 'question-answered', meetingId: id, questionId: qId });
      return updated;
    });
  });

  fastify.get('/meetings/:id/transcript', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('bliss_meeting_transcript_lines').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id)
        .orderBy('created_at', 'asc').execute();
    });
  });

  // Real speech-to-text runs client-side (the browser's own Web Speech API —
  // free, no external service, works wherever the browser supports it) and
  // posts each recognized segment here so it (a) broadcasts as a live
  // caption to everyone else in the room and (b) survives as a real
  // post-meeting transcript, rather than existing only in one browser tab.
  fastify.post('/meetings/:id/transcript', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const text = String((req.body as any)?.text || '').trim();
    if (!text) return reply.status(400).send({ error: 'text is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const line = await trx.insertInto('bliss_meeting_transcript_lines').values({
        tenant_id: user.tenant_id, meeting_id: id, user_id: user.sub, user_name: user.name || 'Guest', text,
      }).returningAll().executeTakeFirstOrThrow();
      broadcastToRoom(user.tenant_id, id, { type: 'transcript-line', meetingId: id, userId: user.sub, userName: user.name || 'Guest', text, lineId: line.id }, user.sub);
      return line;
    });
  });

  // ── REST: waiting room ──────────────────────────────────────────────
  fastify.get('/meetings/:id/waiting-room', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      return trx.selectFrom('bliss_meeting_waiting_room').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('status', '=', 'PENDING')
        .orderBy('requested_at', 'asc').execute();
    });
  });

  // The pending participant's own client polls this while they wait — it
  // isn't connected to the signaling socket yet (that only opens once
  // actually admitted into the room), so a push isn't available on this side.
  fastify.get('/meetings/:id/waiting-room/my-status', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('bliss_meeting_waiting_room').select('status')
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
      return { status: row?.status ?? 'NONE' };
    });
  });

  fastify.post('/meetings/:id/waiting-room/:userId/admit', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id, userId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const updated = await trx.updateTable('bliss_meeting_waiting_room').set({ status: 'ADMITTED', decided_at: new Date() })
        .where('meeting_id', '=', id).where('user_id', '=', userId).where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING')
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'No pending request found for that person' });
      sendTo(user.tenant_id, userId, { type: 'waiting-room-admitted', meetingId: id });
      return { ok: true };
    });
  });

  fastify.post('/meetings/:id/waiting-room/:userId/reject', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id, userId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const updated = await trx.updateTable('bliss_meeting_waiting_room').set({ status: 'REJECTED', decided_at: new Date() })
        .where('meeting_id', '=', id).where('user_id', '=', userId).where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING')
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'No pending request found for that person' });
      sendTo(user.tenant_id, userId, { type: 'waiting-room-rejected', meetingId: id });
      return { ok: true };
    });
  });

  fastify.post('/meetings/:id/waiting-room/admit-all', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const pending = await trx.updateTable('bliss_meeting_waiting_room').set({ status: 'ADMITTED', decided_at: new Date() })
        .where('meeting_id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING')
        .returningAll().execute();
      for (const row of pending) sendTo(user.tenant_id, row.user_id, { type: 'waiting-room-admitted', meetingId: id });
      return { ok: true, admitted: pending.length };
    });
  });

  // ── REST: co-hosts & per-participant state ──────────────────────────
  fastify.post('/meetings/:id/participants/:userId/co-host', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id, userId } = req.params as any;
    const makeCoHost = !!(req.body as any)?.coHost;
    return withTenant(user.tenant_id, async (trx) => {
      // Reserved to the real host, not delegable to a co-host — otherwise a
      // co-host could mint an unbounded number of further co-hosts.
      const host = await requireHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const updated = await trx.updateTable('bliss_meeting_participants')
        .set({ role: makeCoHost ? 'CO_HOST' : 'PARTICIPANT' })
        .where('meeting_id', '=', id).where('user_id', '=', userId).where('tenant_id', '=', user.tenant_id).where('left_at', 'is', null)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'That person is not currently in this meeting' });
      broadcastToRoom(user.tenant_id, id, { type: 'meeting-settings-changed', meetingId: id, coHostChanged: { userId, coHost: makeCoHost } });
      return updated;
    });
  });

  // ── REST: breakout rooms ─────────────────────────────────────────────
  fastify.get('/meetings/:id/breakout-rooms', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const roomsRows = await trx.selectFrom('bliss_meeting_breakout_rooms').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('closed_at', 'is', null)
        .orderBy('created_at', 'asc').execute();
      const results = [];
      for (const r of roomsRows) {
        const assignments = await trx.selectFrom('bliss_meeting_breakout_assignments').select(['user_id', 'user_name'])
          .where('tenant_id', '=', user.tenant_id).where('breakout_room_id', '=', r.id).execute();
        results.push({ ...r, assignments, liveCount: roomRosterCount(user.tenant_id, breakoutRoomKey(id, r.id)) });
      }
      return results;
    });
  });

  fastify.post('/meetings/:id/breakout-rooms', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const count = Math.min(20, Math.max(1, Number(b.count) || 0));
    if (!count) return reply.status(400).send({ error: 'count must be at least 1' });
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const names: string[] = Array.isArray(b.names) && b.names.length ? b.names : Array.from({ length: count }, (_, i) => `Room ${i + 1}`);
      const rows = [];
      for (let i = 0; i < count; i++) {
        const row = await trx.insertInto('bliss_meeting_breakout_rooms').values({
          tenant_id: user.tenant_id, meeting_id: id, name: names[i] || `Room ${i + 1}`,
        }).returningAll().executeTakeFirstOrThrow();
        rows.push(row);
      }
      return rows;
    });
  });

  fastify.post('/meetings/:id/breakout-rooms/assign', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const openRooms = await trx.selectFrom('bliss_meeting_breakout_rooms').select(['id', 'name'])
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('closed_at', 'is', null)
        .orderBy('created_at', 'asc').execute();
      if (!openRooms.length) return reply.status(400).send({ error: 'Create breakout rooms first' });

      let assignments: { userId: string; userName: string; roomId: string }[] = [];
      if (Array.isArray(b.assignments)) {
        const roomIds = new Set(openRooms.map(r => r.id));
        assignments = b.assignments.filter((a: any) => a?.userId && roomIds.has(a?.roomId)).map((a: any) => ({ userId: a.userId, userName: String(a.userName || 'Guest'), roomId: a.roomId }));
      } else {
        // Auto-distribute whoever is currently live in the main room
        // (excluding the host) evenly across the open breakout rooms.
        const members = rooms.get(roomKey(user.tenant_id, id));
        const roster = members ? Array.from(members.entries()).filter(([uid]) => uid !== user.sub) : [];
        assignments = roster.map(([uid, name], i) => ({ userId: uid, userName: name, roomId: openRooms[i % openRooms.length].id }));
      }
      if (!assignments.length) return reply.status(400).send({ error: 'No one to assign — is anyone else currently in the meeting?' });

      // Re-assigning is idempotent: clear existing assignments for this
      // meeting's rooms first, then insert the fresh set.
      const roomIdList = openRooms.map(r => r.id);
      await trx.deleteFrom('bliss_meeting_breakout_assignments').where('breakout_room_id', 'in', roomIdList).execute();
      for (const a of assignments) {
        await trx.insertInto('bliss_meeting_breakout_assignments').values({
          tenant_id: user.tenant_id, breakout_room_id: a.roomId, user_id: a.userId, user_name: a.userName,
        }).execute();
      }
      const roomNameById = new Map(openRooms.map(r => [r.id, r.name]));
      broadcastToRoom(user.tenant_id, id, {
        type: 'breakout-assigned', meetingId: id,
        assignments: assignments.map(a => ({ userId: a.userId, roomId: a.roomId, roomName: roomNameById.get(a.roomId) })),
      });
      return { ok: true, assigned: assignments.length };
    });
  });

  fastify.post('/meetings/:id/breakout-rooms/broadcast', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const text = String((req.body as any)?.text || '').trim();
    if (!text) return reply.status(400).send({ error: 'text is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const openRooms = await trx.selectFrom('bliss_meeting_breakout_rooms').select('id')
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('closed_at', 'is', null).execute();
      for (const r of openRooms) {
        broadcastToRoom(user.tenant_id, breakoutRoomKey(id, r.id), { type: 'breakout-broadcast', meetingId: breakoutRoomKey(id, r.id), text, from: user.name || 'Host' });
      }
      return { ok: true };
    });
  });

  fastify.post('/meetings/:id/breakout-rooms/close', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const openRooms = await trx.updateTable('bliss_meeting_breakout_rooms').set({ closed_at: new Date() })
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('closed_at', 'is', null)
        .returningAll().execute();
      for (const r of openRooms) {
        broadcastToRoom(user.tenant_id, breakoutRoomKey(id, r.id), { type: 'breakout-closed', meetingId: breakoutRoomKey(id, r.id), mainMeetingId: id });
      }
      return { ok: true, closed: openRooms.length };
    });
  });

  // ── REST: AI meeting summary + meeting-to-tasks ──────────────────────
  fastify.get('/meetings/:id/summary', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('bliss_meeting_summaries').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'No summary generated yet' });
      return row;
    });
  });

  fastify.post('/meetings/:id/summarize', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });

      const meeting = await trx.selectFrom('bliss_meetings').select(['id', 'title']).where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });

      const lines = await trx.selectFrom('bliss_meeting_transcript_lines').select(['user_name', 'text', 'created_at'])
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).orderBy('created_at', 'asc').execute();
      if (!lines.length) return reply.status(400).send({ error: 'No transcript yet — turn on Transcribe during the meeting to build one, then summarize afterward.' });

      const questions = await trx.selectFrom('bliss_meeting_questions').select(['text', 'user_name', 'answered'])
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).execute();

      const settings = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const aiCfg = (settings?.settings as any)?.['int-ai'] ?? {};
      if (!aiCfg.on || !aiCfg.apiKey) return reply.status(400).send({ error: 'AI is not configured for this workspace. Enable it in Settings > Integrations > AI Integration.' });

      const transcriptText = lines.map(l => `${l.user_name}: ${l.text}`).join('\n').slice(0, 12000);
      const qaText = questions.length ? `\n\nQ&A raised during the meeting:\n${questions.map(q => `- ${q.text} (asked by ${q.user_name}${q.answered ? ', answered' : ', unanswered'})`).join('\n')}` : '';

      const systemPrompt = `You are summarizing a real work meeting transcript titled "${meeting.title}". Read the transcript and produce a structured summary.
Respond ONLY with valid JSON in this exact shape, nothing else:
{"executiveSummary": "2-3 sentences", "keyPoints": ["..."], "decisions": ["..."], "actionItems": [{"text": "...", "assignee": "name or null"}], "questions": ["unresolved questions, if any"], "followUps": ["..."]}
If the transcript is too short or unclear to extract something, use an empty array for that field rather than inventing content. Never fabricate a decision, action item, or participant name that isn't actually supported by the transcript.`;

      try {
        const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic',
          [{ role: 'user', content: `${systemPrompt}\n\nTranscript:\n${transcriptText}${qaText}` }],
          1200, 0.2);
        let summary: any;
        try { summary = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim()); } catch {
          return reply.status(500).send({ error: 'AI returned an unparseable response. Try again.' });
        }
        const row = await trx.insertInto('bliss_meeting_summaries').values({
          tenant_id: user.tenant_id, meeting_id: id, generated_by: user.sub, summary_json: JSON.stringify(summary),
        }).onConflict((oc) => oc.column('meeting_id').doUpdateSet({ summary_json: JSON.stringify(summary), generated_by: user.sub, created_at: new Date() }))
          .returningAll().executeTakeFirstOrThrow();
        broadcastToRoom(user.tenant_id, id, { type: 'meeting-settings-changed', meetingId: id, summaryReady: true });
        return row;
      } catch (e: any) {
        return reply.status(500).send({ error: e.message || 'Could not generate a summary.' });
      }
    });
  });

  fastify.post('/meetings/:id/create-tasks', { preHandler: [fastify.authenticate, requireEntitlement('bliss')] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const items: { title: string; assigneeId?: string }[] = Array.isArray(b.items)
      ? b.items.filter((i: any) => i?.title && String(i.title).trim()).map((i: any) => ({ title: String(i.title).trim(), assigneeId: i.assigneeId || undefined }))
      : [];
    if (!items.length) return reply.status(400).send({ error: 'No task items given' });
    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.selectFrom('bliss_meetings').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });

      let listId = b.listId as string | undefined;
      if (listId) {
        const owned = await trx.selectFrom('task_lists').select('id').where('id', '=', listId).where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).executeTakeFirst();
        if (!owned) return reply.status(404).send({ error: 'That list was not found' });
      } else {
        const existingList = await trx.selectFrom('task_lists').select('id').where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('name', '=', 'Meeting Follow-ups').executeTakeFirst();
        listId = existingList?.id;
        if (!listId) {
          const created = await trx.insertInto('task_lists').values({
            id: crypto.randomUUID(), tenant_id: user.tenant_id, user_id: user.sub, name: 'Meeting Follow-ups', color: '#8ab4f8',
          }).returningAll().executeTakeFirstOrThrow();
          listId = created.id;
        }
      }

      const siblingCount = await trx.selectFrom('tasks').select(({ fn }) => fn.countAll<number>().as('count'))
        .where('list_id', '=', listId).where('deleted_at', 'is', null).executeTakeFirst();
      let sortOrder = Number(siblingCount?.count ?? 0);
      const created = [];
      for (const item of items) {
        const row = await trx.insertInto('tasks').values({
          id: crypto.randomUUID(), tenant_id: user.tenant_id, user_id: user.sub, list_id: listId,
          title: item.title, notes: `From meeting: ${id}`, tags: JSON.stringify([]) as unknown as string[],
          assignee_id: item.assigneeId || null, status: 'none', priority: 'medium', sort_order: sortOrder++,
        }).returningAll().executeTakeFirstOrThrow();
        created.push(row);
      }
      return { ok: true, listId, tasks: created };
    });
  });
}
