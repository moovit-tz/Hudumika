import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant, dbPlatform, type Database } from '../db/client.js';
import { COOKIE_NAMES, setGuestCookie } from '../lib/cookies.js';
import { env } from '../config/env.js';
import { sql } from 'kysely';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { callAI } from './ai.routes.js';
import { CloudSync } from '../services/cloud-sync.service.js';

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
const meta = new WeakMap<any, { tenantId: string; userId: string; name: string; rooms: Set<string>; guestMeetingId: string | null }>();
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
    // A guest occupies a real registry key (needed for the signaling relay
    // to reach them) under a synthetic `guest:<uuid>` id — not a colleague
    // to surface in a staff-facing "who's online" list, and there's no
    // users row behind it for a click-through to resolve anyway.
    if (t === tenantId && u !== 'guest') ids.push(u);
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

// What a guest connection (calls-public routes) may actually send — a small
// subset of each set above. offer/answer/ice is the real mesh negotiation a
// guest legitimately needs with whichever peers show up in their own room's
// roster; room-chat/room-reaction/room-status is the core meeting
// experience. Everything else in RELAY_TYPES is 1:1-call or host-control
// semantics that make no sense coming from an anonymous guest, and
// everything else in ROOM_BROADCAST_TYPES is a meeting-tool/host-control
// "go re-fetch" ping a guest has no legitimate reason to originate — both
// are real (if low-severity) forgery/griefing surface otherwise, since nothing
// else here checks who is allowed to send a given message type.
const GUEST_RELAY_TYPES = new Set(['offer', 'answer', 'ice']);
const GUEST_ROOM_BROADCAST_TYPES = new Set(['room-chat', 'room-reaction', 'room-status']);

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

/**
 * Actually ends a meeting — extracted so the host-triggered /end route and
 * jobs/meeting-duration-limit.job.ts's auto-termination sweep are the exact
 * same code path, not two copies that can drift. Caller supplies an
 * already-open transaction (withTenant opens its own — never nest it), and
 * is responsible for whatever authorization check applies to its own case
 * (the route checks host_id; the job's authority is the clock, not a user).
 * Returns null if the meeting was already ended (or doesn't exist).
 */
export async function endMeetingRow(
  trx: Transaction<Database>,
  tenantId: string,
  meetingId: string,
  reason: 'host' | 'time_limit' = 'host',
) {
  const meeting = await trx.updateTable('bliss_meetings')
    .set({ status: 'ENDED', ended_at: new Date(), end_reason: reason, updated_at: new Date() })
    .where('id', '=', meetingId).where('tenant_id', '=', tenantId).where('status', '!=', 'ENDED')
    .returningAll().executeTakeFirst();
  if (!meeting) return null;

  const openRows = await trx.selectFrom('bliss_meeting_participants').select(['id', 'user_id', 'joined_at'])
    .where('meeting_id', '=', meetingId).where('left_at', 'is', null).execute();
  for (const row of openRows) {
    const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(row.joined_at).getTime()) / 1000));
    await trx.updateTable('bliss_meeting_participants').set({ left_at: new Date(), duration_seconds: durationSeconds }).where('id', '=', row.id).execute();
    // Sent directly to each participant so it still reaches anyone inside a
    // breakout room (its own separate room key) — see the /end route's own
    // original comment on this, unchanged by the extraction.
    if (row.user_id) sendTo(tenantId, row.user_id, { type: 'meeting-ended', meetingId, reason, maxDurationMinutes: meeting.max_duration_minutes });
  }
  broadcastToRoom(tenantId, meetingId, { type: 'meeting-ended', meetingId, reason, maxDurationMinutes: meeting.max_duration_minutes });
  return meeting;
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
    const parsed = row?.settings as any;
    return (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) ?? {};
  });
  const turn = settings?.turnConfig;
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

// HUD-0024 continuation: none of this file's REST routes had a role check —
// Bliss Calls is the same "internal comms tool" pillar as Team Chat
// (chat.routes.ts, fixed under HUD-0035), and the file's own header comment
// already says as much ("an internal tool, not a public webinar product").
// Left off the signaling WebSocket route deliberately — that connection's
// auth shape (cookie-based, guest-aware) is different enough from a normal
// REST preHandler that changing it wasn't verified as part of this pass.
async function blockCustomer(req: any, reply: any) {
  if (req.user.role === 'CUSTOMER') {
    return reply.status(403).send({ error: 'Not available for this account type.' });
  }
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
    let isGuestToken = false;
    try {
      const staffToken = req.cookies?.[COOKIE_NAMES.access] || req.cookies?.[COOKIE_NAMES.orgAccess] || '';
      if (staffToken) {
        claims = fastify.jwt.verify(staffToken);
      } else {
        // No staff session on this connection at all — the one other
        // credential this endpoint accepts is a Bliss meeting-guest token
        // (calls-public routes), scoped to exactly one meeting below.
        const guestToken = req.cookies?.[COOKIE_NAMES.guestAccess] || '';
        claims = fastify.jwt.verify(guestToken);
        isGuestToken = true;
      }
    } catch {
      try { socket.close(4001, 'unauthorized'); } catch { /* ignore */ }
      return;
    }
    if (!claims?.sub || !claims?.tenant_id || claims.typ === 'refresh') { try { socket.close(4001, 'unauthorized'); } catch {} return; }
    // A guest token must actually be one (not a staff token replayed through
    // the guest branch by omitting cookies some other way) and must carry
    // the one meeting it's scoped to — see the GUEST role / JWTPayload.typ
    // comments in @hudumika/types.
    if (isGuestToken && (claims.typ !== 'guest' || !claims.meetingId)) { try { socket.close(4001, 'unauthorized'); } catch {} return; }
    const isGuest = isGuestToken && claims.typ === 'guest';

    const tenantId = String(claims.tenant_id);
    const userId = String(claims.sub);
    const name = String(claims.name || '');
    const guestMeetingId = isGuest ? String(claims.meetingId) : null;
    const key = rkey(tenantId, userId);

    const wasOffline = !registry.has(key);
    if (!registry.has(key)) registry.set(key, new Set());
    registry.get(key)!.add(socket);
    meta.set(socket, { tenantId, userId, name, rooms: new Set(), guestMeetingId });
    // A guest isn't a colleague to announce as "online" tenant-wide — that
    // presence list is an internal-staff concept (NexusHR directory, chat).
    if (wasOffline && !isGuest) broadcastPresence(tenantId, userId, true);

    socket.send(JSON.stringify({ type: 'ready', online: isGuest ? [] : onlineUserIds(tenantId) }));

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
        // A guest may only ever join the one meeting their token names —
        // otherwise a guest link to meeting A could be replayed to walk
        // into any other meeting in the tenant just by guessing its id.
        if (isGuest && meetingId !== guestMeetingId) return;
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
        if (isGuest && !GUEST_ROOM_BROADCAST_TYPES.has(m.type)) return;
        const meetingId = String(m.meetingId || '');
        if (!meetingId) return;
        if (isGuest && meetingId !== guestMeetingId) return;
        broadcastToRoom(tenantId, meetingId, { ...m, from: userId, fromName: name }, userId);
        return;
      }

      if (!RELAY_TYPES.has(m.type)) return;
      if (isGuest && !GUEST_RELAY_TYPES.has(m.type)) return;
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
        if (set.size === 0) { registry.delete(key); if (!isGuest) broadcastPresence(tenantId, userId, false); }
      }
      for (const meetingId of Array.from(meta.get(socket)?.rooms || [])) leaveRoom(meetingId);
      meta.delete(socket);
    });
  });

  // ── REST: presence, history, records ──────────────────────────────
  fastify.get('/presence', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
    const user = req.user;
    return { online: onlineUserIds(user.tenant_id).filter(id => id !== user.sub) };
  });

  fastify.get('/config', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
    // Public STUN handles same-network / simple-NAT calls on its own. For strict
    // NATs a TURN relay is required — read it from the tenant's own settings
    // (settings.turnConfig = { urls, username, credential }, set via the Bliss
    // Telephony page / PATCH /v1/settings), then fall back to a platform-wide
    // one in the environment. The frontend uses whatever we return, so
    // configuring TURN makes calls work across strict NATs with no code change.
    const iceServers = await resolveIceServers(req.user.tenant_id);
    return { iceServers, turnConfigured: iceServers.length > 2 };
  });

  fastify.get('/direct', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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

  fastify.post('/direct', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.patch('/direct/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.get('/meetings', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
    const user = req.user;
    const q = req.query as { page?: string; pageSize?: string; search?: string; status?: string; kind?: string; mine?: string; dateFrom?: string; dateTo?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize || '10', 10) || 10));
    const search = (q.search || '').trim().toLowerCase();
    const statusFilter = (q.status || 'ALL').toUpperCase();
    const kindFilter = (q.kind || 'ALL').toUpperCase();
    const mineOnly = q.mine === '1' || q.mine === 'true';
    const dateFrom = q.dateFrom ? new Date(q.dateFrom) : null;
    const dateTo = q.dateTo ? new Date(q.dateTo) : null;

    return withTenant(user.tenant_id, async (trx) => {
      // Real Bliss meetings — every one this tenant has, no arbitrary cap.
      // Bounded to a generous window for the merge-sort below rather than
      // truly unbounded, matching the same "fetch enough to paginate
      // correctly, not the whole table" reasoning as the calendar query.
      const blissRows = await trx.selectFrom('bliss_meetings as m')
        .innerJoin('users as host', 'host.id', 'm.host_id')
        .select(['m.id', 'm.title', 'm.join_code', 'm.kind', 'm.status', 'm.scheduled_at',
                 'm.started_at', 'm.ended_at', 'm.locked', 'm.host_id', 'host.name as host_name',
                 'm.password_hash', 'm.waiting_room_enabled', 'm.guest_join_enabled',
                 'm.max_duration_minutes', 'm.end_reason', 'm.created_at'])
        .where('m.tenant_id', '=', user.tenant_id)
        .where('m.status', '!=', 'CANCELLED')
        .orderBy(sql`COALESCE(m.scheduled_at, m.started_at, m.created_at)`, 'desc')
        .limit(300)
        .execute();
      const blissMapped = blissRows.map(({ password_hash, ...r }) => ({
        ...r, hasPassword: !!password_hash, source: 'bliss' as const, meeting_url: null as string | null,
      }));

      // Calendar-scheduled meetings that never went through "Add Video
      // Call" as a real Bliss room — a Jitsi link only (bliss_meeting_id
      // IS NULL; the ones that DO have a real room already appear above via
      // bliss_meetings directly, and would otherwise show up twice). A
      // ±60-day window: far enough back to still show recent history, far
      // enough forward to catch what's actually scheduled, without scanning
      // someone's entire calendar.
      const now = new Date();
      const windowStart = new Date(now.getTime() - 60 * 24 * 3600_000);
      const windowEnd = new Date(now.getTime() + 60 * 24 * 3600_000);
      const calRows = await trx.selectFrom('calendar_events as ce')
        .innerJoin('users as u', 'u.id', 'ce.user_id')
        .select(['ce.id', 'ce.title', 'ce.meeting_url', 'ce.start_at', 'ce.end_at', 'ce.user_id', 'u.name as host_name', 'ce.created_at'])
        .where('ce.tenant_id', '=', user.tenant_id)
        .where('ce.meeting_url', 'is not', null)
        .where('ce.bliss_meeting_id', 'is', null)
        .where('ce.start_at', '>=', windowStart)
        .where('ce.start_at', '<=', windowEnd)
        .orderBy('ce.start_at', 'desc')
        .limit(300)
        .execute();
      const calMapped = calRows.map(ce => {
        const start = new Date(ce.start_at);
        const end = new Date(ce.end_at);
        return {
          id: `cal:${ce.id}`, title: ce.title, join_code: null as string | null, kind: 'VIDEO',
          // A calendar event's own start/end IS a real schedule, so — unlike
          // a Bliss room, where "ACTIVE" only ever means someone is actually
          // in it — inferring ACTIVE/SCHEDULED/ENDED from wall-clock time
          // against that schedule is honest, not a guess.
          status: now < start ? 'SCHEDULED' : (now <= end ? 'ACTIVE' : 'ENDED'),
          scheduled_at: ce.start_at, started_at: null, ended_at: null,
          locked: false, host_id: ce.user_id, host_name: ce.host_name,
          hasPassword: false, waiting_room_enabled: false, guest_join_enabled: false,
          max_duration_minutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)),
          end_reason: null as string | null,
          source: 'calendar' as const, meeting_url: ce.meeting_url, created_at: ce.created_at,
        };
      });

      // Unfiltered — these are dashboard-summary counts ("how many active
      // right now"), not "how many active among your current search", so
      // they're taken before the filter below narrows the working set.
      const allForCounts = [...blissMapped, ...calMapped];
      const activeCount = allForCounts.filter(m => m.status === 'ACTIVE').length;
      const scheduledCount = allForCounts.filter(m => m.status === 'SCHEDULED').length;

      const merged = allForCounts
        .filter(m => {
          if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
          if (kindFilter !== 'ALL' && m.kind !== kindFilter) return false;
          if (mineOnly && m.host_id !== user.sub) return false;
          if (dateFrom || dateTo) {
            const at = m.scheduled_at || m.started_at;
            if (!at) return false;
            const t = new Date(at).getTime();
            if (dateFrom && t < dateFrom.getTime()) return false;
            if (dateTo && t > dateTo.getTime()) return false;
          }
          if (search) {
            const hay = `${m.title} ${m.host_name} ${m.join_code || ''}`.toLowerCase();
            if (!hay.includes(search)) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const at = new Date(a.scheduled_at || a.started_at || 0).getTime();
          const bt = new Date(b.scheduled_at || b.started_at || 0).getTime();
          return bt - at;
        });

      const total = merged.length;
      const start = (page - 1) * pageSize;
      const pageRows = merged.slice(start, start + pageSize);

      // Real per-meeting attendance count — only for the page actually being
      // returned (not all 300+ candidates), and only for real bliss_meetings
      // rows (a calendar-captured entry has no bliss_meeting_participants at
      // all; it shows the calendar event's own guest count instead, already
      // available on the calendar_events row if ever needed — not fetched
      // here since Meeting Center doesn't currently surface calendar guests).
      const blissIds = pageRows.filter(m => m.source === 'bliss').map(m => m.id);
      const participantCounts = new Map<string, number>();
      if (blissIds.length > 0) {
        const counts = await trx.selectFrom('bliss_meeting_participants')
          .select(['meeting_id', trx.fn.count('id').as('cnt')])
          .where('meeting_id', 'in', blissIds)
          .groupBy('meeting_id')
          .execute();
        for (const c of counts) participantCounts.set(c.meeting_id, Number(c.cnt));
      }
      const pageRowsWithCounts = pageRows.map(m => ({ ...m, participantCount: participantCounts.get(m.id) ?? 0 }));

      return {
        data: pageRowsWithCounts, total, page, pageSize,
        totalMeetings: allForCounts.length, activeCount, scheduledCount,
      };
    });
  });

  fastify.get('/meetings/by-code/:code', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const code = String((req.params as any).code || '').toUpperCase();
    return withTenant(user.tenant_id, async (trx) => {
      const m = await trx.selectFrom('bliss_meetings').selectAll().where('tenant_id', '=', user.tenant_id).where('join_code', '=', code).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'No meeting found for that code' });
      // HUD-0120: this used to return the full row including password_hash —
      // reachable by any non-customer staff member holding the join code
      // (which is the whole point of a join code: it's meant to be shared
      // with participants), not just the host. GET /meetings/:id and PATCH
      // already strip this same field; this route was the one miss.
      const { password_hash, ...rest } = m as any;
      return { ...rest, hasPassword: !!password_hash };
    });
  });

  fastify.get('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const m = await trx.selectFrom('bliss_meetings as m')
        .innerJoin('users as host', 'host.id', 'm.host_id')
        .select(['m.id', 'm.title', 'm.join_code', 'm.kind', 'm.status', 'm.scheduled_at',
                 'm.started_at', 'm.ended_at', 'm.locked', 'm.host_id', 'host.name as host_name',
                 'm.password_hash', 'm.waiting_room_enabled', 'm.chat_disabled', 'm.screen_share_disabled',
                 'm.guest_join_enabled', 'm.max_duration_minutes', 'm.end_reason'])
        .where('m.id', '=', id).where('m.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'Meeting not found' });
      const { password_hash, ...rest } = m;
      return { ...rest, hasPassword: !!password_hash, liveParticipantCount: roomRosterCount(user.tenant_id, id) };
    });
  });

  fastify.post('/meetings', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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
    // Teams-style duration cap — a host can shorten/extend it within a real
    // ceiling (env.MEETING_MAX_DURATION_CEILING_MINUTES), not an unbounded
    // number; the platform default applies when the caller doesn't specify
    // one (every existing caller — Calendar/Tasks/Notes' "Add video call" —
    // doesn't send this field, so they all get the same real default).
    let maxDurationMinutes = env.MEETING_MAX_DURATION_DEFAULT_MINUTES;
    if (b.max_duration_minutes !== undefined) {
      const n = Number(b.max_duration_minutes);
      if (!Number.isFinite(n) || n < 5) return reply.status(400).send({ error: 'max_duration_minutes must be at least 5' });
      maxDurationMinutes = Math.min(n, env.MEETING_MAX_DURATION_CEILING_MINUTES);
    }
    return withTenant(user.tenant_id, async (trx) => {
      let joinCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateJoinCode();
        const clash = await trx.selectFrom('bliss_meetings').select('id').where('join_code', '=', candidate).executeTakeFirst();
        if (!clash) { joinCode = candidate; break; }
      }
      if (!joinCode) return reply.status(500).send({ error: 'Could not generate a join code — try again' });
      const isInstant = !scheduledAt;
      const created = await trx.insertInto('bliss_meetings').values({
        tenant_id: user.tenant_id, host_id: user.sub, title, join_code: joinCode, kind,
        status: isInstant ? 'ACTIVE' : 'SCHEDULED',
        scheduled_at: scheduledAt, started_at: isInstant ? new Date() : null,
        password_hash: password ? hashPassword(password) : null,
        waiting_room_enabled: !!b.waiting_room_enabled,
        // Lets a meeting created FROM Calendar/Tasks/Notes (calendarApp.tsx's
        // "Add video call", and the same MeetingLinkPanel used by tasks/
        // notes) come into being with guest access already configured,
        // rather than requiring a second PATCH from inside the room.
        guest_join_enabled: !!b.guest_join_enabled,
        max_duration_minutes: maxDurationMinutes,
      }).returningAll().executeTakeFirstOrThrow();
      // HUD-0120: same fix as GET /meetings/by-code/:code above — this used
      // to return the freshly-inserted row via .returningAll() unstripped,
      // so the host's own create-meeting response carried the real
      // password_hash back to the browser for no reason (they already know
      // the plaintext they just typed; the hash should never leave the
      // server at all, matching every sibling meeting-read route's own
      // hasPassword-only convention).
      const { password_hash: _ph, ...rest } = created as any;
      return { ...rest, hasPassword: !!created.password_hash };
    });
  });

  fastify.patch('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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
    if (b.guest_join_enabled !== undefined) patch.guest_join_enabled = !!b.guest_join_enabled;
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

  fastify.delete('/meetings/:id', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('bliss_meetings').set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub).where('status', '=', 'SCHEDULED')
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'No cancellable scheduled meeting found, or you are not its host' });
      // HUD-0120: same fix as the other meeting-mutation routes in this file.
      const { password_hash, ...rest } = updated as any;
      return { ...rest, hasPassword: !!password_hash };
    });
  });

  fastify.post('/meetings/:id/join', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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
      // HUD-0120: this handed the real password_hash to EVERY participant on
      // EVERY successful join (not just the host, and not just when a
      // meeting had a password) — the highest-reach instance of the same
      // leak fixed elsewhere in this file, since joining is the one route
      // every attendee of every call actually hits.
      const { password_hash, ...meetingSafe } = updatedMeeting as any;
      return { meeting: { ...meetingSafe, hasPassword: !!password_hash }, iceServers, role: isHost ? 'HOST' : 'PARTICIPANT' };
    });
  });

  fastify.post('/meetings/:id/leave', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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

  fastify.post('/meetings/:id/end', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const owned = await trx.selectFrom('bliss_meetings').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub).where('status', '!=', 'ENDED')
        .executeTakeFirst();
      if (!owned) return reply.status(404).send({ error: 'Meeting not found, or you are not its host' });
      const ended = await endMeetingRow(trx, user.tenant_id, id, 'host');
      if (!ended) return reply.status(404).send({ error: 'Meeting not found, or you are not its host' });
      // HUD-0120: same fix as GET/POST/by-code above — endMeetingRow()
      // returns the full row (it's also called from the auto-end-on-
      // duration-limit background job, which has no HTTP response to worry
      // about), but this route's own response reached a real client.
      const { password_hash, ...rest } = ended as any;
      return { ...rest, hasPassword: !!password_hash };
    });
  });

  fastify.get('/meetings/:id/participants', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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
  fastify.get('/metrics', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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

  fastify.get('/meetings/:id/polls', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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

  fastify.post('/meetings/:id/polls', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/polls/:pollId/vote', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/polls/:pollId/close', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.get('/meetings/:id/questions', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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

  fastify.post('/meetings/:id/questions', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/questions/:qId/upvote', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/questions/:qId/answer', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.get('/meetings/:id/transcript', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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
  fastify.post('/meetings/:id/transcript', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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
  fastify.get('/meetings/:id/waiting-room', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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
  fastify.get('/meetings/:id/waiting-room/my-status', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('bliss_meeting_waiting_room').select('status')
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
      return { status: row?.status ?? 'NONE' };
    });
  });

  // :userId also accepts a waiting-room row's own id — a guest row (migration
  // 368) has no user_id to match on at all, so the host UI passes whichever
  // identifier the row actually has (see the guest_name fallback rendering
  // in MeetingRoom.tsx's waiting-room panel).
  fastify.post('/meetings/:id/waiting-room/:userId/admit', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id, userId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const updated = await trx.updateTable('bliss_meeting_waiting_room').set({ status: 'ADMITTED', decided_at: new Date() })
        .where('meeting_id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING')
        .where((eb) => eb.or([eb('user_id', '=', userId), eb('id', '=', userId)]))
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'No pending request found for that person' });
      // A guest isn't connected to the signaling socket yet — their own
      // client discovers admission by polling calls-public's status route,
      // not this push (which only reaches a real, already-authenticated user).
      if (updated.user_id) sendTo(user.tenant_id, updated.user_id, { type: 'waiting-room-admitted', meetingId: id });
      return { ok: true };
    });
  });

  fastify.post('/meetings/:id/waiting-room/:userId/reject', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id, userId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const updated = await trx.updateTable('bliss_meeting_waiting_room').set({ status: 'REJECTED', decided_at: new Date() })
        .where('meeting_id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING')
        .where((eb) => eb.or([eb('user_id', '=', userId), eb('id', '=', userId)]))
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'No pending request found for that person' });
      if (updated.user_id) sendTo(user.tenant_id, updated.user_id, { type: 'waiting-room-rejected', meetingId: id });
      return { ok: true };
    });
  });

  fastify.post('/meetings/:id/waiting-room/admit-all', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const host = await requireHostOrCoHost(trx, user.tenant_id, id, user.sub);
      if (!host.ok) return reply.status(host.status).send({ error: host.error });
      const pending = await trx.updateTable('bliss_meeting_waiting_room').set({ status: 'ADMITTED', decided_at: new Date() })
        .where('meeting_id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING')
        .returningAll().execute();
      for (const row of pending) if (row.user_id) sendTo(user.tenant_id, row.user_id, { type: 'waiting-room-admitted', meetingId: id });
      return { ok: true, admitted: pending.length };
    });
  });

  // ── REST: co-hosts & per-participant state ──────────────────────────
  fastify.post('/meetings/:id/participants/:userId/co-host', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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
  fastify.get('/meetings/:id/breakout-rooms', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any) => {
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

  fastify.post('/meetings/:id/breakout-rooms', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/breakout-rooms/assign', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/breakout-rooms/broadcast', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/breakout-rooms/close', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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
  fastify.get('/meetings/:id/summary', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('bliss_meeting_summaries').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('meeting_id', '=', id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'No summary generated yet' });
      return row;
    });
  });

  fastify.post('/meetings/:id/summarize', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  fastify.post('/meetings/:id/create-tasks', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
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

  // ── REST: meeting recording & Drive storage ──────────────────────────
  fastify.get('/meetings/:id/recording', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.selectFrom('bliss_meetings').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });

      // Calculate real or estimated duration
      let durationSeconds = 1800;
      if (meeting.started_at && meeting.ended_at) {
        durationSeconds = Math.max(60, Math.round((new Date(meeting.ended_at).getTime() - new Date(meeting.started_at).getTime()) / 1000));
      } else if (meeting.max_duration_minutes) {
        durationSeconds = meeting.max_duration_minutes * 60;
      }

      const rec = await CloudSync.ensureMeetingRecording(
        user.tenant_id,
        meeting.id,
        meeting.title,
        meeting.started_at || meeting.scheduled_at || meeting.created_at,
        durationSeconds
      );

      return {
        ok: true,
        meetingId: meeting.id,
        title: meeting.title,
        durationSeconds,
        driveId: rec.driveId,
        folderId: rec.folderId,
        fileId: rec.fileId,
        fileName: rec.fileName,
        sizeBytes: rec.size,
        driveUrl: `/drive?folder=${rec.folderId}`,
        downloadUrl: `/v1/files/${rec.fileId}/download`,
        streamUrl: `/v1/files/${rec.fileId}/stream`,
      };
    });
  });

  // ── REST: meeting notes & sync ─────────────────────────────────────────
  fastify.get('/meetings/:id/notes', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.selectFrom('bliss_meetings').select(['id', 'title', 'scheduled_at', 'started_at', 'ended_at'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });

      const summary = await trx.selectFrom('bliss_meeting_summaries').selectAll()
        .where('meeting_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();

      return {
        ok: true,
        meetingId: meeting.id,
        title: meeting.title,
        notes: summary ? (typeof summary.summary_json === 'string' ? JSON.parse(summary.summary_json) : summary.summary_json) : null,
      };
    });
  });

  fastify.post('/meetings/:id/notes', { preHandler: [fastify.authenticate, requireEntitlement('bliss'), blockCustomer] }, async (req: any, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const { content, keyPoints, decisions, actionItems } = (req.body as any) || {};

    return withTenant(user.tenant_id, async (trx) => {
      const meeting = await trx.selectFrom('bliss_meetings').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });

      const payload = {
        executiveSummary: content || 'Meeting session notes and decisions recorded.',
        keyPoints: Array.isArray(keyPoints) ? keyPoints : [],
        decisions: Array.isArray(decisions) ? decisions : [],
        actionItems: Array.isArray(actionItems) ? actionItems : [],
        updatedAt: new Date().toISOString(),
      };

      const row = await trx.insertInto('bliss_meeting_summaries').values({
        tenant_id: user.tenant_id,
        meeting_id: id,
        generated_by: user.sub,
        summary_json: JSON.stringify(payload),
      }).onConflict((oc) => oc.column('meeting_id').doUpdateSet({
        summary_json: JSON.stringify(payload),
        generated_by: user.sub,
        created_at: new Date(),
      })).returningAll().executeTakeFirstOrThrow();

      return { ok: true, summary: row };
    });
  });
}

// ── Guest (no-account) meeting join ─────────────────────────────────────
// Unauthenticated by design (no fastify.authenticate anywhere in this
// function) — this is the whole point: a "join like Zoom/Meet/Teams" link
// for someone with no Hudumika account at all. Looked up by the opaque
// meeting id only, same reasoning sign.routes.ts's own module comment
// gives for its public signing endpoints: there is no tenant to scope a
// pre-login request to, so dbPlatform (BYPASSRLS, narrow and audited) is
// used throughout rather than withTenant() — every query still carries an
// explicit tenant_id/meeting_id .where() of its own, same as everywhere
// else in this codebase. Registered at its own /v1/calls-public prefix
// (index.ts) rather than folded into /v1/calls, so nothing here can ever
// be reached by accidentally omitting a preHandler on a route meant to be
// authenticated.
async function mintGuestSession(fastify: FastifyInstance, reply: any, meeting: any, name: string) {
  // A guest identity always looks like `guest:<uuid>` — never a real users.id
  // — both so the WS registry/room roster can key on it exactly like a real
  // user id (rkey/roomKey don't care what shape a userId string is) and so
  // onlineUserIds() can cheaply recognize and exclude it (see that function).
  const guestId = `guest:${crypto.randomUUID()}`;
  // Deliberately short-lived and scoped to this one meeting only
  // (meetingId claim, checked by the /signal WS handler) — a leaked guest
  // link is worth at most a few hours of one meeting, never more.
  const token = fastify.jwt.sign(
    { sub: guestId, tenant_id: meeting.tenant_id, role: 'GUEST', email: '', name, typ: 'guest', meetingId: meeting.id } as any,
    { expiresIn: '6h' },
  );
  setGuestCookie(reply, token, 6 * 3600);

  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (meeting.status === 'SCHEDULED') { patch.status = 'ACTIVE'; patch.started_at = new Date(); }
  const [updatedMeeting, participant] = await Promise.all([
    Object.keys(patch).length > 1
      ? dbPlatform.updateTable('bliss_meetings').set(patch as any).where('id', '=', meeting.id).returningAll().executeTakeFirstOrThrow()
      : Promise.resolve(meeting),
    dbPlatform.insertInto('bliss_meeting_participants').values({
      tenant_id: meeting.tenant_id, meeting_id: meeting.id, user_id: null, guest_name: name, role: 'PARTICIPANT',
    }).returningAll().executeTakeFirstOrThrow(),
  ]);
  const iceServers = await resolveIceServers(meeting.tenant_id);
  // Same minimal-disclosure shape as the pre-join GET — tenant_id/host_id/
  // join_code grant nothing extra to a guest already inside the room (the
  // authenticated join-by-code route they'd resolve against is blocked to
  // guest tokens anyway), but there's no reason to hand them over either.
  const { password_hash, tenant_id, host_id, join_code, ...meetingSafe } = updatedMeeting as any;
  return {
    meeting: { ...meetingSafe, hasPassword: !!password_hash },
    iceServers, role: 'PARTICIPANT', guestId, participantId: participant.id,
  };
}

const GUEST_NAME_MAX = 80;

export async function callsPublicRoutes(fastify: FastifyInstance) {
  // Safe public info for the join screen — deliberately excludes anything
  // an anonymous visitor shouldn't see (password itself, tenant_id, etc.).
  fastify.get('/meetings/:id', async (req: any, reply) => {
    const { id } = req.params as any;
    const m = await dbPlatform.selectFrom('bliss_meetings as m')
      .innerJoin('users as host', 'host.id', 'm.host_id')
      .select(['m.id', 'm.title', 'm.kind', 'm.status', 'm.guest_join_enabled', 'm.locked',
                'm.password_hash', 'm.waiting_room_enabled', 'm.chat_disabled', 'm.screen_share_disabled',
                'host.name as host_name'])
      .where('m.id', '=', id).executeTakeFirst();
    if (!m || !m.guest_join_enabled) return reply.status(404).send({ error: 'This meeting link is not open to guests.' });
    if (m.status === 'ENDED' || m.status === 'CANCELLED') {
      return reply.status(410).send({ error: `This meeting has ${m.status === 'CANCELLED' ? 'been cancelled' : 'ended'}.` });
    }
    const { password_hash, ...rest } = m;
    return { ...rest, hasPassword: !!password_hash };
  });

  fastify.post('/meetings/:id/join', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const name = String(b.name || '').trim().slice(0, GUEST_NAME_MAX);
    if (!name) return reply.status(400).send({ error: 'Enter your name to join.' });

    const meeting = await dbPlatform.selectFrom('bliss_meetings').selectAll().where('id', '=', id).executeTakeFirst();
    if (!meeting || !meeting.guest_join_enabled) return reply.status(404).send({ error: 'This meeting link is not open to guests.' });
    if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') return reply.status(410).send({ error: 'This meeting has ended.' });
    if (meeting.locked) return reply.status(403).send({ error: 'This meeting is locked.' });
    if (meeting.password_hash) {
      // 403, not 401 — mirrors the authenticated /join's own reasoning
      // (this isn't a dead session, it's a wrong password for this one
      // meeting), doubly relevant here since there's no session at all to
      // protect from being misread as dead.
      if (!b.password || !verifyPassword(String(b.password), meeting.password_hash)) {
        return reply.status(403).send({ error: 'A password is required to join this meeting.', passwordRequired: true });
      }
    }

    if (meeting.waiting_room_enabled) {
      const guestToken = crypto.randomBytes(24).toString('hex');
      await dbPlatform.insertInto('bliss_meeting_waiting_room').values({
        tenant_id: meeting.tenant_id, meeting_id: id, user_id: null, guest_token: guestToken, user_name: name,
      }).execute();
      sendTo(meeting.tenant_id, meeting.host_id, { type: 'waiting-room-update', meetingId: id });
      return { waiting: true, guestToken };
    }

    return mintGuestSession(fastify, reply, meeting, name);
  });

  // The guest client's only way to learn it's been admitted — it has no
  // session to receive a push over (that only opens once actually in the
  // room), same reasoning as the authenticated /waiting-room/my-status.
  // Mints the real join payload itself once ADMITTED is seen, so the guest
  // client needs exactly one more round trip, not a third endpoint.
  fastify.get('/meetings/:id/waiting-room/status', async (req: any, reply) => {
    const { id } = req.params as any;
    const guestToken = String((req.query as any)?.guestToken || '');
    if (!guestToken) return reply.status(400).send({ error: 'Missing guestToken' });
    const row = await dbPlatform.selectFrom('bliss_meeting_waiting_room').selectAll()
      .where('meeting_id', '=', id).where('guest_token', '=', guestToken).executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Not found' });
    // HUD-0120: this used to re-mint a brand-new guest session (a new
    // bliss_meeting_participants row + a new guest JWT) on every single
    // poll that saw status==='ADMITTED', not just the first — a real,
    // easily-triggered bug for a polling-based endpoint (a network retry, a
    // double-click, or React effects firing twice all reproduce it live),
    // silently multiplying a single guest into several duplicate attendance
    // records. Fixed with an atomic claim: only the caller that actually
    // flips PENDING's terminal ADMITTED state to JOINED gets to mint;
    // everyone else (including two truly concurrent pollers) sees the
    // already-decided state instead of minting again.
    if (row.status === 'JOINED') return { status: 'ADMITTED' };
    if (row.status !== 'ADMITTED') return { status: row.status };
    const claimed = await dbPlatform.updateTable('bliss_meeting_waiting_room')
      .set({ status: 'JOINED' })
      .where('id', '=', row.id).where('status', '=', 'ADMITTED')
      .returningAll().executeTakeFirst();
    if (!claimed) return { status: 'ADMITTED' };
    const meeting = await dbPlatform.selectFrom('bliss_meetings').selectAll().where('id', '=', id).executeTakeFirst();
    if (!meeting) return reply.status(404).send({ error: 'Meeting not found' });
    const joined = await mintGuestSession(fastify, reply, meeting, row.user_name);
    return { status: 'ADMITTED', ...joined };
  });

  // Best-effort attendance close-out — identified by the participant row id
  // the join response handed back, not a session (guests have none once
  // they leave; the WS 'close' handler already tears down live room state
  // regardless of whether this call ever lands).
  fastify.post('/meetings/:id/leave', async (req: any) => {
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const participantId = String(b.participantId || '');
    if (!participantId) return { ok: true };
    const open = await dbPlatform.selectFrom('bliss_meeting_participants').select(['id', 'joined_at'])
      .where('id', '=', participantId).where('meeting_id', '=', id).where('left_at', 'is', null).executeTakeFirst();
    if (!open) return { ok: true };
    const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(open.joined_at).getTime()) / 1000));
    await dbPlatform.updateTable('bliss_meeting_participants').set({ left_at: new Date(), duration_seconds: durationSeconds })
      .where('id', '=', open.id).execute();
    return { ok: true };
  });
}
