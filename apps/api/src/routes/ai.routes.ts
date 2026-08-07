import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { AI_TOOL_DEFINITIONS, runAiTool } from '../services/ai-tools.service.js';
import {
  loadMemory, memoryPromptSection, resolveConversation, saveTurn, loadHistory, parseRememberCommand,
} from '../services/ai-memory.service.js';

const CHAT_SYSTEM_PROMPT = `You are the Hudumika assistant, embedded in a freight-clearance and finance SaaS.
Answer questions about the tenant's own operational data (shipments, customers, receivables) using the
tools provided — never guess numbers. If a question isn't about the tenant's data, answer normally from
general knowledge. Keep answers concise and concrete (cite actual reference numbers/customer names/amounts
returned by tools, not vague summaries).`;

const MAX_TOOL_ROUNDS = 4;

/** Postgres raises 22P02 on a malformed uuid, which Fastify turns into a 500
 *  carrying the driver's own error text. A bad id is a "not found", not an
 *  internal error, and the client has no business seeing a database code. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

interface ChatToolCallLog { name: string; input: Record<string, any>; result: any }

/** Agentic loop: lets the model call read-only tools (ai-tools.service.ts) and
 *  re-prompts with results until it produces a final answer or MAX_TOOL_ROUNDS
 *  is hit. Anthropic and OpenAI have different tool-calling wire formats, so
 *  each provider gets its own loop rather than forcing a shared shape. */
async function runAgenticChat(
  tenantId: string, apiKey: string, model: string, provider: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  /** Facts the user asked to be remembered, appended to the system prompt. */
  memorySection = ''
): Promise<{ reply: string; toolCalls: ChatToolCallLog[] }> {
  const toolCalls: ChatToolCallLog[] = [];
  const isAnthropic = provider === 'anthropic' || model.startsWith('claude');
  const systemPrompt = CHAT_SYSTEM_PROMPT + memorySection;

  if (isAnthropic) {
    const messages: any[] = history.map(m => ({ role: m.role, content: m.content }));
    const tools = AI_TOOL_DEFINITIONS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1024, temperature: 0.3, system: systemPrompt, messages, tools }),
      });
      if (!res.ok) { const err: any = await res.json(); throw new Error(err.error?.message || `Anthropic error ${res.status}`); }
      const data: any = await res.json();

      const toolUseBlocks = (data.content || []).filter((b: any) => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
        return { reply: text, toolCalls };
      }

      messages.push({ role: 'assistant', content: data.content });
      const toolResults = [];
      for (const block of toolUseBlocks) {
        const result = await runAiTool(tenantId, block.name, block.input || {});
        toolCalls.push({ name: block.name, input: block.input || {}, result });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }
    return { reply: "I wasn't able to finish gathering that information — try narrowing your question.", toolCalls };
  }

  // OpenAI function-calling path
  const messages: any[] = [{ role: 'system', content: systemPrompt }, ...history];
  const tools = AI_TOOL_DEFINITIONS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1024, temperature: 0.3, messages, tools }),
    });
    if (!res.ok) { const err: any = await res.json(); throw new Error(err.error?.message || `OpenAI error ${res.status}`); }
    const data: any = await res.json();
    const message = data.choices?.[0]?.message;

    if (!message?.tool_calls?.length) {
      return { reply: message?.content || '', toolCalls };
    }

    messages.push(message);
    for (const call of message.tool_calls) {
      let input: Record<string, any> = {};
      try { input = JSON.parse(call.function.arguments || '{}'); } catch {}
      const result = await runAiTool(tenantId, call.function.name, input);
      toolCalls.push({ name: call.function.name, input, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "I wasn't able to finish gathering that information — try narrowing your question.", toolCalls };
}

export async function callAI(apiKey: string, model: string, provider: string, messages: any[], maxTokens = 1024, temperature = 0.3) {
  if (provider === 'anthropic' || model.startsWith('claude')) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages }),
    });
    if (!res.ok) { const err: any = await res.json(); throw new Error(err.error?.message || `Anthropic error ${res.status}`); }
    const data: any = await res.json();
    return data.content?.[0]?.text || '';
  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages }),
    });
    if (!res.ok) { const err: any = await res.json(); throw new Error(err.error?.message || `OpenAI error ${res.status}`); }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('ai'));

  /**
   * POST /v1/ai/test
   * Test API key connectivity
   */
  fastify.post('/test', async (request, reply) => {
    const { apiKey, model, provider } = request.body as any;
    if (!apiKey) return reply.status(400).send({ error: 'apiKey is required' });
    try {
      const text = await callAI(apiKey, model || 'claude-haiku-4-5-20251001', provider || 'anthropic',
        [{ role: 'user', content: 'Reply with only: "Connection successful"' }], 20);
      return { ok: true, message: text.trim() || 'Connection successful!' };
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }
  });

  /**
   * POST /v1/ai/search
   * Natural language search — returns structured filter suggestions
   * Body: { query: string, context?: 'shipments' | 'customers' | 'tasks' | 'leads' }
   */
  fastify.post('/search', async (request, reply) => {
    const user = request.user;
    const { query, context = 'shipments' } = request.body as any;
    if (!query?.trim()) return reply.status(400).send({ error: 'query is required' });

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
    }

    const systemPrompt = `You are a search assistant for a freight clearance SaaS called ClearOS.
The user is searching in: ${context}.
Extract structured search parameters from their natural language query.

For shipments: extract { search?: string, stage?: string, type?: 'SEA'|'AIR'|'ROAD', riskOnly?: boolean, myCases?: boolean, customer?: string }
For customers: extract { search?: string, type?: string }
For tasks: extract { search?: string, status?: string, priority?: string, assignee?: string }
For leads: extract { search?: string, stage?: string, assignee?: string }

Respond ONLY with a valid JSON object matching the appropriate structure. Nothing else.`;

    try {
      const raw = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-sonnet-4-6',
        aiCfg.provider || 'anthropic',
        [
          { role: 'user', content: `${systemPrompt}\n\nQuery: "${query}"` },
        ],
        256,
        0.1
      );
      let filters: any = {};
      try { filters = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim()); } catch {}
      return { filters, raw };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  /**
   * POST /v1/ai/summarise
   * Summarise text (document content, shipment notes, etc.)
   * Body: { text: string, mode?: 'brief' | 'detailed' }
   */
  fastify.post('/summarise', async (request, reply) => {
    const user = request.user;
    const { text, mode = 'brief' } = request.body as any;
    if (!text?.trim()) return reply.status(400).send({ error: 'text is required' });

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) return reply.status(400).send({ error: 'AI not configured.' });

    const instruction = mode === 'brief'
      ? 'Summarise the following in 2-3 sentences, focusing on key facts and action items:'
      : 'Provide a detailed summary with bullet points covering key facts, parties involved, dates, and any action items:';

    try {
      const summary = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic',
        [{ role: 'user', content: `${instruction}\n\n${text.slice(0, 8000)}` }],
        512, 0.3);
      return { summary };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  /**
   * POST /v1/ai/automations/generate
   * Turn a natural-language description into an automation flow skeleton.
   * Body: { prompt: string }
   */
  fastify.post('/automations/generate', async (request, reply) => {
    const user = request.user;
    const { prompt } = request.body as any;
    if (!prompt?.trim()) return reply.status(400).send({ error: 'prompt is required' });

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
    }

    const systemPrompt = `You design automation workflows for a freight/logistics SaaS called Hudumika.
Given a plain-English description, break it into a trigger and an ordered list of steps.

Each step has a "kind" (one of: webhook, field, assignee, notify, delay, condition) and a short "label" (max 6 words):
- webhook: call an external API/integration
- field: set/update a field on a record
- assignee: assign a person or team
- notify: send a notification/message
- delay: wait a duration before continuing
- condition: branch based on a condition

Respond ONLY with valid JSON in this exact shape, nothing else:
{"trigger": {"title": "..."}, "steps": [{"kind": "...", "label": "..."}]}
Limit to at most 6 steps.`;

    try {
      const raw = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-sonnet-4-6',
        aiCfg.provider || 'anthropic',
        [{ role: 'user', content: `${systemPrompt}\n\nDescription: "${prompt}"` }],
        512,
        0.2
      );
      let flow: any;
      try { flow = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim()); } catch {
        return reply.status(500).send({ error: 'AI returned an unparseable response. Try rephrasing.' });
      }
      return flow;
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  /**
   * POST /v1/ai/chat
   * Conversational assistant with tool-calling access to real tenant data
   * (ai-tools.service.ts). Body: { messages: {role:'user'|'assistant', content:string}[] }
   */
  /**
   * POST /v1/ai/chat
   *
   * Takes the new message and a conversation id, not the whole transcript:
   * history now comes from the database, so a reload, a different device or a
   * new browser continues the same thread. The old shape — a client-supplied
   * `messages` array — is still accepted so nothing breaks mid-deploy, but it
   * is only used to pull out the latest user turn.
   */
  fastify.post('/chat', async (request, reply) => {
    const user = request.user;
    const body = request.body as {
      message?: string;
      conversation_id?: string | null;
      messages?: { role: 'user' | 'assistant'; content: string }[];
    };

    const incoming = (body.message ?? [...(body.messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? '').trim();
    if (!incoming) return reply.status(400).send({ error: 'message is required' });

    if (body.conversation_id && !isUuid(body.conversation_id)) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    // "Remember that …" is handled before the AI-configured check on purpose:
    // it is answered by this code, not by a model, so it needs no API key.
    // Gating it behind one would mean a workspace that has not set up a
    // provider cannot record anything — and confirming a save is only honest
    // if the code that performed the save is what says so.
    const remember = parseRememberCommand(incoming);
    if (remember) {
      const saved = await withTenant(user.tenant_id, async (trx) => {
        const conversationId = await resolveConversation(trx, user.tenant_id, user.sub, body.conversation_id ?? null, incoming);
        if (!conversationId) return null;
        await trx.insertInto('ai_memory').values({
          tenant_id: user.tenant_id, user_id: user.sub, content: remember,
          source: 'user', source_conversation_id: conversationId,
        }).execute();
        const text = `Saved. I'll remember: ${remember}`;
        await saveTurn(trx, user.tenant_id, conversationId, incoming, text, []);
        return { conversationId, text };
      });
      if (!saved) return reply.status(404).send({ error: 'Conversation not found' });
      return { reply: saved.text, toolCalls: [], conversation_id: saved.conversationId, remembered: remember };
    }

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
    }

    // The thread, memory and history are resolved before the model is called,
    // so a provider failure cannot leave a half-written conversation.
    const prepared = await withTenant(user.tenant_id, async (trx) => {
      const conversationId = await resolveConversation(trx, user.tenant_id, user.sub, body.conversation_id ?? null, incoming);
      if (!conversationId) return null;
      const facts = await loadMemory(trx, user.tenant_id, user.sub);
      const history = await loadHistory(trx, user.tenant_id, conversationId);
      return { conversationId, facts, history };
    });
    if (!prepared) return reply.status(404).send({ error: 'Conversation not found' });

    try {
      const { reply: text, toolCalls } = await runAgenticChat(
        user.tenant_id, aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic',
        [...prepared.history, { role: 'user', content: incoming }],
        memoryPromptSection(prepared.facts),
      );
      await withTenant(user.tenant_id, trx =>
        saveTurn(trx, user.tenant_id, prepared.conversationId, incoming, text, toolCalls));
      return { reply: text, toolCalls, conversation_id: prepared.conversationId };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // ── Conversations ────────────────────────────────────────────────────────

  fastify.get('/conversations', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('ai_conversations')
        .select(['id', 'title', 'created_at', 'updated_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .orderBy('updated_at', 'desc')
        .limit(50)
        .execute();
      return { data: rows };
    });
  });

  fastify.get('/conversations/:id', async (request: any, reply) => {
    const user = request.user;
    if (!isUuid(request.params.id)) return reply.status(404).send({ error: 'Conversation not found' });
    const result = await withTenant(user.tenant_id, async (trx) => {
      const convo = await trx.selectFrom('ai_conversations')
        .select(['id', 'title', 'created_at', 'updated_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('id', '=', request.params.id)
        .executeTakeFirst();
      if (!convo) return null;
      const messages = await trx.selectFrom('ai_messages')
        .select(['id', 'role', 'content', 'tool_calls', 'created_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('conversation_id', '=', convo.id)
        .orderBy('created_at', 'asc')
        .execute();
      return { ...convo, messages };
    });
    if (!result) return reply.status(404).send({ error: 'Conversation not found' });
    return result;
  });

  fastify.delete('/conversations/:id', async (request: any, reply) => {
    const user = request.user;
    if (!isUuid(request.params.id)) return reply.status(404).send({ error: 'Conversation not found' });
    // ai_messages cascades on the FK, so the transcript goes with the thread.
    const deleted = await withTenant(user.tenant_id, trx =>
      trx.deleteFrom('ai_conversations')
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('id', '=', request.params.id)
        .executeTakeFirst());
    if (!Number(deleted.numDeletedRows)) return reply.status(404).send({ error: 'Conversation not found' });
    return reply.status(204).send();
  });

  // ── Memory ───────────────────────────────────────────────────────────────
  // Readable and deletable by the person it belongs to. Memory that shapes
  // every answer but cannot be inspected or removed is not a feature.

  fastify.get('/memory', async (request) => {
    const user = request.user;
    const facts = await withTenant(user.tenant_id, trx => loadMemory(trx, user.tenant_id, user.sub));
    return { data: facts };
  });

  fastify.post('/memory', async (request: any, reply) => {
    const user = request.user;
    const content = String(request.body?.content ?? '').trim();
    if (!content) return reply.status(400).send({ error: 'content is required' });
    // scope:'workspace' shares it with everyone in the tenant; default is personal.
    const shared = request.body?.scope === 'workspace';
    const row = await withTenant(user.tenant_id, trx =>
      trx.insertInto('ai_memory').values({
        tenant_id: user.tenant_id, user_id: shared ? null : user.sub,
        content, source: 'user', source_conversation_id: null,
      }).returning(['id', 'content']).executeTakeFirstOrThrow());
    return reply.status(201).send(row);
  });

  fastify.delete('/memory/:id', async (request: any, reply) => {
    const user = request.user;
    if (!isUuid(request.params.id)) return reply.status(404).send({ error: 'Not found' });
    const deleted = await withTenant(user.tenant_id, trx =>
      trx.deleteFrom('ai_memory')
        .where('tenant_id', '=', user.tenant_id)
        // Their own, or the workspace's — never another person's personal memory.
        .where(eb => eb.or([eb('user_id', 'is', null), eb('user_id', '=', user.sub)]))
        .where('id', '=', request.params.id)
        .executeTakeFirst());
    if (!Number(deleted.numDeletedRows)) return reply.status(404).send({ error: 'Not found' });
    return reply.status(204).send();
  });

  /**
   * GET /v1/ai/insights
   * Proactive digest — real computed signals synthesised into a short
   * natural-language summary by the model (numbers are real; the writing is AI).
   */
  fastify.get('/insights', async (request, reply) => {
    const user = request.user;

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
    }

    const [atRisk, aged] = await Promise.all([
      runAiTool(user.tenant_id, 'get_at_risk_shipments', {}),
      runAiTool(user.tenant_id, 'get_aged_receivables', {}),
    ]);

    const declStatus = await withTenant(user.tenant_id, async (trx) => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const rows = await trx.selectFrom('declarations').select(['status']).where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart).execute();
      const pending = rows.filter(r => ['VALIDATED', 'SAVED', 'TRANSFERRED', 'ASSESSED'].includes(r.status)).length;
      return { total_this_month: rows.length, pending };
    });

    const signals = {
      at_risk_shipments: atRisk,
      aged_receivables: aged,
      declarations_this_month: declStatus,
    };

    try {
      const digest = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-sonnet-4-6',
        aiCfg.provider || 'anthropic',
        [{
          role: 'user',
          content: `You are an operations analyst for a freight-clearance company. Given this real, computed data (JSON below), write a short digest (3-5 bullet points, plain text with "- " prefixes, no markdown headers) highlighting what needs attention today. Be specific — use real reference numbers, customer names, and amounts from the data. If a section is empty, skip it rather than noting its absence.\n\n${JSON.stringify(signals, null, 2)}`,
        }],
        512, 0.3
      );
      return { digest, signals };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });
}
