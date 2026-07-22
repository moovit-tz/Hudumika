import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

/**
 * Real team chat backend (channels, DMs, groups, messages, reactions).
 * Polling-based, not websocket-realtime — the frontend refetches on an
 * interval. Chat.tsx previously ran entirely off hardcoded mock data.
 */
export async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/chat/channels — every channel the user belongs to, with unread
  // count and last-message preview.
  fastify.get('/channels', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      // Bootstrap: a brand-new tenant has no channels at all, so nobody
      // could ever start chatting. Seed a #general channel with every
      // active staff member on first access, same pattern as hr_tasks.
      const anyChannel = await trx.selectFrom('chat_channels').select('id')
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!anyChannel) {
        const general = await trx.insertInto('chat_channels').values({
          tenant_id: user.tenant_id, type: 'channel', name: 'general',
          description: 'Company-wide discussion & announcements', created_by: user.sub,
        }).returningAll().executeTakeFirstOrThrow();
        const staff = await trx.selectFrom('users').select('id')
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).execute();
        await trx.insertInto('chat_channel_members').values(
          staff.map((s) => ({ channel_id: general.id, user_id: s.id }))
        ).execute();
      }

      const memberships = await trx.selectFrom('chat_channel_members')
        .select(['channel_id', 'last_read_at'])
        .where('user_id', '=', user.sub)
        .execute();
      const channelIds = memberships.map((m) => m.channel_id);
      if (channelIds.length === 0) return { data: [] };

      const channels = await trx.selectFrom('chat_channels').selectAll()
        .where('id', 'in', channelIds).where('tenant_id', '=', user.tenant_id).execute();

      const lastMsgs = await trx.selectFrom('chat_messages')
        .selectAll()
        .where('channel_id', 'in', channelIds)
        .orderBy('created_at', 'desc')
        .execute();
      const lastByChannel = new Map<string, typeof lastMsgs[number]>();
      for (const m of lastMsgs) if (!lastByChannel.has(m.channel_id)) lastByChannel.set(m.channel_id, m);

      const readMap = new Map(memberships.map((m) => [m.channel_id, m.last_read_at]));
      const unreadCounts = new Map<string, number>();
      for (const m of lastMsgs) {
        const readAt = readMap.get(m.channel_id);
        if (readAt && new Date(m.created_at) > new Date(readAt) && m.author_id !== user.sub) {
          unreadCounts.set(m.channel_id, (unreadCounts.get(m.channel_id) ?? 0) + 1);
        }
      }

      // For DMs, resolve the other member's identity so the frontend can show their name.
      const allMembers = await trx.selectFrom('chat_channel_members')
        .select(['channel_id', 'user_id']).where('channel_id', 'in', channelIds).execute();
      const membersByChannel = new Map<string, string[]>();
      for (const m of allMembers) {
        const arr = membersByChannel.get(m.channel_id) ?? [];
        arr.push(m.user_id);
        membersByChannel.set(m.channel_id, arr);
      }
      const otherUserIds = [...new Set(allMembers.filter((m) => m.user_id !== user.sub).map((m) => m.user_id))];
      const users = otherUserIds.length > 0
        ? await trx.selectFrom('users').select(['id', 'name', 'role']).where('id', 'in', otherUserIds).execute()
        : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      const data = channels.map((c) => {
        const last = lastByChannel.get(c.id);
        const memberIds = membersByChannel.get(c.id) ?? [];
        const otherId = c.type === 'dm' ? memberIds.find((id) => id !== user.sub) : undefined;
        const other = otherId ? userMap.get(otherId) : undefined;
        return {
          id: c.id, type: c.type,
          name: c.type === 'dm' && other ? other.name : c.name,
          description: c.description,
          member_ids: memberIds,
          other_user_id: otherId ?? null,
          other_user_role: other?.role ?? null,
          unread: unreadCounts.get(c.id) ?? 0,
          last_message: last?.content ?? null,
          last_message_at: last?.created_at ?? null,
        };
      }).sort((a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime());

      return { data };
    });
  });

  // POST /v1/chat/channels — create a channel, group, or DM.
  // body: { type: 'channel'|'dm'|'group', name?, description?, member_ids? }
  fastify.post('/channels', async (request, reply) => {
    const user = request.user;
    const { type, name, description, member_ids } = request.body as { type: 'channel' | 'dm' | 'group'; name?: string; description?: string; member_ids?: string[] };
    if (!type) return reply.status(400).send({ error: 'type is required' });

    return withTenant(user.tenant_id, async (trx) => {
      if (type === 'dm') {
        const otherId = member_ids?.[0];
        if (!otherId) return reply.status(400).send({ error: 'member_ids[0] is required for a DM' });

        // Re-use an existing DM between these two users instead of creating duplicates.
        const mine = await trx.selectFrom('chat_channel_members').select('channel_id').where('user_id', '=', user.sub).execute();
        const theirs = await trx.selectFrom('chat_channel_members').select('channel_id').where('user_id', '=', otherId).execute();
        const mineSet = new Set(mine.map((m) => m.channel_id));
        const sharedIds = theirs.map((t) => t.channel_id).filter((id) => mineSet.has(id));
        if (sharedIds.length > 0) {
          const existingDm = await trx.selectFrom('chat_channels').selectAll()
            .where('id', 'in', sharedIds).where('type', '=', 'dm').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          if (existingDm) return existingDm;
        }

        const other = await trx.selectFrom('users').select('name').where('id', '=', otherId).executeTakeFirst();
        const channel = await trx.insertInto('chat_channels').values({
          tenant_id: user.tenant_id, type: 'dm', name: other?.name || 'Direct Message', created_by: user.sub,
        }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('chat_channel_members').values([
          { channel_id: channel.id, user_id: user.sub },
          { channel_id: channel.id, user_id: otherId },
        ]).execute();
        return channel;
      }

      if (!name) return reply.status(400).send({ error: 'name is required' });
      const channel = await trx.insertInto('chat_channels').values({
        tenant_id: user.tenant_id, type, name, description: description || null, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      const memberIds = new Set([user.sub, ...(member_ids ?? [])]);
      await trx.insertInto('chat_channel_members').values(
        [...memberIds].map((uid) => ({ channel_id: channel.id, user_id: uid }))
      ).execute();
      return channel;
    });
  });

  // GET /v1/chat/channels/:id/messages
  fastify.get('/channels/:id/messages', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const member = await trx.selectFrom('chat_channel_members').select('user_id')
        .where('channel_id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!member) return reply.status(403).send({ error: 'Not a member of this channel' });

      const messages = await trx.selectFrom('chat_messages').selectAll()
        .where('channel_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc').execute();

      const authorIds = [...new Set(messages.map((m) => m.author_id))];
      const authors = authorIds.length > 0
        ? await trx.selectFrom('users').select(['id', 'name']).where('id', 'in', authorIds).execute()
        : [];
      const authorMap = new Map(authors.map((a) => [a.id, a.name]));

      const messageIds = messages.map((m) => m.id);
      const reactions = messageIds.length > 0
        ? await trx.selectFrom('chat_message_reactions').selectAll().where('message_id', 'in', messageIds).execute()
        : [];
      const reactionsByMessage = new Map<string, typeof reactions>();
      for (const r of reactions) {
        const arr = reactionsByMessage.get(r.message_id) ?? [];
        arr.push(r);
        reactionsByMessage.set(r.message_id, arr);
      }

      return {
        data: messages.map((m) => {
          const msgReactions = reactionsByMessage.get(m.id) ?? [];
          const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();
          for (const r of msgReactions) {
            const e = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
            e.count += 1;
            if (r.user_id === user.sub) e.mine = true;
            byEmoji.set(r.emoji, e);
          }
          return {
            id: m.id, author_id: m.author_id, author_name: authorMap.get(m.author_id) ?? 'Unknown',
            content: m.content, created_at: m.created_at, reactions: [...byEmoji.values()],
          };
        }),
      };
    });
  });

  // POST /v1/chat/channels/:id/messages
  fastify.post('/channels/:id/messages', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { content } = request.body as { content?: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });

    return withTenant(user.tenant_id, async (trx) => {
      const member = await trx.selectFrom('chat_channel_members').select('user_id')
        .where('channel_id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!member) return reply.status(403).send({ error: 'Not a member of this channel' });

      const message = await trx.insertInto('chat_messages').values({
        tenant_id: user.tenant_id, channel_id: id, author_id: user.sub, content: content.trim(),
      }).returningAll().executeTakeFirstOrThrow();

      await trx.updateTable('chat_channel_members').set({ last_read_at: new Date() })
        .where('channel_id', '=', id).where('user_id', '=', user.sub).execute();

      return { id: message.id, author_id: message.author_id, author_name: user.name, content: message.content, created_at: message.created_at, reactions: [] };
    });
  });

  // PATCH /v1/chat/channels/:id/read — mark a channel as read up to now.
  fastify.patch('/channels/:id/read', async (request) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('chat_channel_members').set({ last_read_at: new Date() })
        .where('channel_id', '=', id).where('user_id', '=', user.sub).execute();
      return { ok: true };
    });
  });

  // POST /v1/chat/messages/:id/reactions — toggle a reaction for the current user.
  fastify.post('/messages/:id/reactions', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { emoji } = request.body as { emoji?: string };
    if (!emoji) return reply.status(400).send({ error: 'emoji is required' });

    return withTenant(user.tenant_id, async (trx) => {
      const message = await trx.selectFrom('chat_messages').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!message) return reply.status(404).send({ error: 'Message not found' });

      const existing = await trx.selectFrom('chat_message_reactions').select('id')
        .where('message_id', '=', id).where('user_id', '=', user.sub).where('emoji', '=', emoji).executeTakeFirst();
      if (existing) {
        await trx.deleteFrom('chat_message_reactions').where('id', '=', existing.id).execute();
        return { toggled: 'off' };
      }
      await trx.insertInto('chat_message_reactions').values({ message_id: id, user_id: user.sub, emoji }).execute();
      return { toggled: 'on' };
    });
  });
}
