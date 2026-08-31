import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

// Comfortably covers the frontend's 60s heartbeat interval (useAuth.tsx) plus
// one missed beat from a slow network — long enough that presence doesn't
// flicker to offline between beats, short enough that closing a tab reads as
// offline within a few minutes rather than staying "online" all day.
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

type PresenceStatus = 'offline' | 'online' | 'clocked_in';

/**
 * Real, API-linked presence — three states (offline / online / clocked-in),
 * derived from a heartbeat row (this table) plus the existing HR clock-in
 * session, not a fabricated local flag. Every PersonAvatar rendering a
 * `people` subject polls this in shared, batched form (see
 * lib/presence.ts on the frontend) so a colleague's status is visible
 * wherever they're tagged, not just on their own dashboard.
 */
export async function presenceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/heartbeat', async (req) => {
    const user = req.user;
    await withTenant(user.tenant_id, async (trx) => {
      await trx.insertInto('user_presence')
        .values({ user_id: user.sub, tenant_id: user.tenant_id, last_active_at: new Date() })
        .onConflict((oc) => oc.column('user_id').doUpdateSet({ last_active_at: new Date() }))
        .execute();
    });
    return { ok: true };
  });

  // Batch lookup — ?ids=uuid1,uuid2,... — so a page rendering forty avatars
  // costs one request per poll cycle, not forty.
  fastify.get('/', async (req) => {
    const user = req.user;
    const q = req.query as { ids?: string };
    const ids = Array.from(new Set((q.ids || '').split(',').map(s => s.trim()).filter(Boolean)));
    if (!ids.length) return {};

    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('users')
        .leftJoin('user_presence', 'user_presence.user_id', 'users.id')
        .select(['users.id as id', 'users.profile as profile', 'user_presence.last_active_at as last_active_at'])
        .where('users.tenant_id', '=', user.tenant_id)
        .where('users.id', 'in', ids)
        .execute();

      const activeSessions = await trx.selectFrom('hr_clock_sessions')
        .select('user_id')
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', 'in', ids)
        .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
        .execute();
      const clockedInIds = new Set(activeSessions.map(s => s.user_id));

      const now = Date.now();
      const result: Record<string, PresenceStatus> = {};
      for (const row of rows) {
        const profile: Record<string, any> = typeof row.profile === 'string'
          ? (JSON.parse(row.profile || '{}') || {})
          : (row.profile as Record<string, any> || {});
        const isSelf = row.id === user.sub;
        // A user who has turned presence sharing off always reads as offline
        // to everyone else — but never to themselves, so their own dashboard
        // still shows their real state.
        const hidden = !isSelf && profile.hide_presence === true;
        const lastActiveMs = row.last_active_at ? new Date(row.last_active_at).getTime() : 0;
        const isOnline = !hidden && (now - lastActiveMs) < ONLINE_THRESHOLD_MS;
        result[row.id] = !isOnline ? 'offline' : (clockedInIds.has(row.id) ? 'clocked_in' : 'online');
      }
      // A requested id with no matching row in this tenant (wrong tenant, deleted).
      for (const id of ids) if (!(id in result)) result[id] = 'offline';
      return result;
    });
  });
}
