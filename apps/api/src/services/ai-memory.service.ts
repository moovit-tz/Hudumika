import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * Persistence for the assistant: the transcript of what was said, and the
 * small set of facts worth carrying into every future conversation.
 *
 * On why memory is only ever written when the user says so, never inferred:
 * a remembered fact is injected into the system prompt of every subsequent
 * turn, so one wrong entry is not a single bad answer, it is a bias on all of
 * them — and it is invisible, because the user never sees the prompt. The
 * model is good at noticing "they mentioned Sirari" and bad at knowing whether
 * that was a standing fact or a one-off. `source` records which of the two
 * happened for every row, so an inferred fact can never be presented with the
 * authority of a stated one if extraction is ever added.
 */

/** How many past turns are replayed to the model. Long enough to hold a
 *  thread of conversation, short enough that an old thread cannot quietly
 *  grow into an enormous prompt. Older turns stay in the database and stay
 *  readable in the UI — this caps what is *sent*, not what is kept. */
export const CHAT_HISTORY_TURNS = 40;

export interface MemoryFact { id: string; content: string; scope: 'workspace' | 'personal'; source: string }

/**
 * Facts this user should have in context: the workspace's own (user_id IS
 * NULL) plus their personal ones. Another user's personal memory is never
 * returned, even inside the same tenant.
 */
export async function loadMemory(
  trx: Transaction<Database>, tenantId: string, userId: string
): Promise<MemoryFact[]> {
  const rows = await trx.selectFrom('ai_memory')
    .select(['id', 'content', 'user_id', 'source'])
    .where('tenant_id', '=', tenantId)
    .where(eb => eb.or([eb('user_id', 'is', null), eb('user_id', '=', userId)]))
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(r => ({
    id: r.id,
    content: r.content,
    scope: r.user_id ? 'personal' : 'workspace',
    source: r.source,
  }));
}

/** Renders memory into the system prompt. Returns '' when there is none, so
 *  a workspace that has never saved anything gets the original prompt
 *  unchanged rather than an empty "here is what you know" heading. */
export function memoryPromptSection(facts: MemoryFact[]): string {
  if (facts.length === 0) return '';
  const lines = facts.map(f => `- ${f.content}`).join('\n');
  return `\n\nThe user has asked you to remember the following. Treat these as background context, not as answers:\n${lines}`;
}

/** Creates a thread, or verifies an existing one belongs to this user.
 *  Returns null when the id is real but someone else's — the caller turns
 *  that into a 404, so a thread id cannot be probed for existence. */
export async function resolveConversation(
  trx: Transaction<Database>, tenantId: string, userId: string,
  conversationId: string | null, firstMessage: string
): Promise<string | null> {
  if (conversationId) {
    const found = await trx.selectFrom('ai_conversations').select('id')
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .where('id', '=', conversationId)
      .executeTakeFirst();
    return found ? found.id : null;
  }
  // The first thing asked makes a serviceable title until something better
  // exists; naming a thread is not worth a second model call.
  const title = firstMessage.trim().replace(/\s+/g, ' ').slice(0, 80) || 'New conversation';
  const row = await trx.insertInto('ai_conversations')
    .values({ tenant_id: tenantId, user_id: userId, title })
    .returning('id').executeTakeFirstOrThrow();
  return row.id;
}

/** Appends one exchange and bumps the thread so it sorts to the top. */
export async function saveTurn(
  trx: Transaction<Database>, tenantId: string, conversationId: string,
  userContent: string, assistantContent: string, toolCalls: unknown[]
): Promise<void> {
  await trx.insertInto('ai_messages').values([
    { tenant_id: tenantId, conversation_id: conversationId, role: 'user', content: userContent, tool_calls: null },
    {
      tenant_id: tenantId, conversation_id: conversationId, role: 'assistant', content: assistantContent,
      tool_calls: toolCalls.length ? JSON.stringify(toolCalls) : null,
    },
  ]).execute();
  await trx.updateTable('ai_conversations').set({ updated_at: new Date() })
    .where('tenant_id', '=', tenantId).where('id', '=', conversationId).execute();
}

/** The turns to replay, oldest first, capped at CHAT_HISTORY_TURNS.
 *  Ordered DESC then reversed so the cap keeps the most *recent* turns —
 *  taking the first N would replay the start of a long thread and drop
 *  everything the user just said. */
export async function loadHistory(
  trx: Transaction<Database>, tenantId: string, conversationId: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await trx.selectFrom('ai_messages')
    .select(['role', 'content'])
    .where('tenant_id', '=', tenantId)
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at', 'desc')
    .limit(CHAT_HISTORY_TURNS)
    .execute();
  return rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

/**
 * "Remember that we always clear through Sirari" — an explicit instruction,
 * which is the only way a fact gets stored. Returns the text to remember, or
 * null when the message was an ordinary question.
 *
 * Deliberately narrow: it must start with the instruction, so "do you
 * remember what I said about Sirari?" is a question about memory rather than
 * a command to write to it.
 */
export function parseRememberCommand(message: string): string | null {
  const m = message.trim().match(/^(?:please\s+)?remember(?:\s+that)?[:,]?\s+(.{3,500})$/is);
  if (!m) return null;
  return m[1].trim().replace(/\s+/g, ' ');
}
