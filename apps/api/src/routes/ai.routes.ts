import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { runAiTool } from '../services/ai-tools.service.js';
import { loadMemory } from '../services/ai-memory.service.js';
import { resolveAiCredentials } from '../lib/platform-settings.js';
import { describeAiUnavailable } from '../lib/ai-credits.js';
import { AI_PROVIDER_CONFIG, detectAiProvider, generationParams } from '../lib/ai-providers.js';

/** Postgres raises 22P02 on a malformed uuid, which Fastify turns into a 500
 *  carrying the driver's own error text. A bad id is a "not found", not an
 *  internal error, and the client has no business seeing a database code. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const testKeySchema = z.object({
  apiKey: z.string().trim().min(1),
  model: z.string().max(100).optional(),
  provider: z.string().max(50).optional(),
});
const searchSchema = z.object({
  query: z.string().trim().min(1),
  context: z.enum(['shipments', 'customers', 'tasks', 'leads', 'emails']).optional(),
});
const summariseSchema = z.object({
  text: z.string().trim().min(1),
  mode: z.enum(['brief', 'detailed', 'overview']).optional(),
});
const extractTaskSchema = z.object({
  subject: z.string().trim().max(500).optional(),
  body: z.string().trim().min(1).max(8000),
});
const composeDraftSchema = z.object({
  instruction: z.string().trim().min(1).max(2000),
  subject: z.string().trim().max(500).optional(),
  /** The message being replied to, if any — truncated the same way
   *  extract-task's own body is, so a long thread can't blow the prompt. */
  replyContext: z.string().trim().max(4000).optional(),
});
const automationGenerateSchema = z.object({ prompt: z.string().trim().min(1) });
export async function callAI(apiKey: string, model: string, provider: string, messages: any[], maxTokens = 1024, temperature = 0.3) {
  const providerCfg = AI_PROVIDER_CONFIG[detectAiProvider(provider, model)];
  if (providerCfg.kind === 'anthropic') {
    const res = await fetch(providerCfg.baseUrl, {
      method: 'POST',
      headers: { ...providerCfg.authHeaders(apiKey), 'content-type': 'application/json' },
      body: JSON.stringify({ model, ...generationParams(detectAiProvider(provider, model), model, maxTokens, temperature), messages }),
    });
    if (!res.ok) { const err: any = await res.json(); throw new Error(err.error?.message || `${providerCfg.label} error ${res.status}`); }
    const data: any = await res.json();
    return data.content?.[0]?.text || '';
  } else {
    const res = await fetch(providerCfg.baseUrl, {
      method: 'POST',
      headers: { ...providerCfg.authHeaders(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, ...generationParams(detectAiProvider(provider, model), model, maxTokens, temperature), messages }),
    });
    if (!res.ok) { const err: any = await res.json(); throw new Error(err.error?.message || `${providerCfg.label} error ${res.status}`); }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('ai'));
  // Production-readiness audit HUD-0024/0031: GET /memory deliberately
  // includes every workspace-shared ai_memory row (user_id IS NULL) plus the
  // caller's own — internal business context staff saved for the AI copilot
  // to use, not something an external CUSTOMER-portal account should read
  // (or add to/delete from). The AI chat/search/automation-generation
  // features here are all staff tools in the same way.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  /**
   * POST /v1/ai/test
   * Test API key connectivity
   */
  fastify.post('/test', async (request, reply) => {
    const { apiKey, model, provider } = testKeySchema.parse(request.body);
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
    const { query, context = 'shipments' } = searchSchema.parse(request.body);

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const creds = await resolveAiCredentials(user.tenant_id, settings['int-ai'], user.role);
    if (!creds) {
      return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });
    }

    const systemPrompt = `You are a search assistant for a freight clearance SaaS called ClearOS.
The user is searching in: ${context}.
Extract structured search parameters from their natural language query.

For shipments: extract { search?: string, stage?: string, type?: 'SEA'|'AIR'|'ROAD', riskOnly?: boolean, myCases?: boolean, customer?: string }
For customers: extract { search?: string, type?: string }
For tasks: extract { search?: string, status?: string, priority?: string, assignee?: string }
For leads: extract { search?: string, stage?: string, assignee?: string }
For emails: extract { search?: string, from?: string, to?: string, subject?: string, hasWords?: string, doesntHave?: string, hasAttachment?: boolean, dateWithin?: '1d'|'3d'|'1w'|'2w'|'1m'|'2m'|'6m'|'1y', scope?: 'all'|'inbox'|'starred'|'sent'|'drafts'|'spam'|'trash', unread?: boolean }

Respond ONLY with a valid JSON object matching the appropriate structure. Nothing else.`;

    try {
      const raw = await callAI(
        creds.apiKey,
        creds.model,
        creds.provider,
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
    const { text, mode = 'brief' } = summariseSchema.parse(request.body);

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const creds = await resolveAiCredentials(user.tenant_id, settings['int-ai'], user.role);
    if (!creds) return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });

    const instruction = mode === 'brief'
      ? 'Summarise the following in 2-3 sentences, focusing on key facts and action items:'
      : mode === 'overview'
      ? 'List the 3-5 most important facts from this email. Start every line with a dash (-). One fact per line. No intro sentence, no conclusion, no headers — only the dashed list:'
      : 'Provide a detailed summary with bullet points covering key facts, parties involved, dates, and any action items:';

    try {
      const summary = await callAI(creds.apiKey, creds.model, creds.provider,
        [{ role: 'user', content: `${instruction}\n\n${text.slice(0, 8000)}` }],
        512, 0.3);
      return { summary };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  /**
   * POST /v1/ai/extract-task
   * Reads an email's subject/body and, if it genuinely implies an action
   * item (a request, a deadline, something the recipient needs to do),
   * returns a suggested task — same idea as Gmail's Gemini "Suggested task"
   * banner. Returns { hasTask: false } rather than an error when nothing in
   * the email warrants one; the caller (EmailApp.tsx) treats that as "show
   * no banner", not a failure.
   */
  fastify.post('/extract-task', async (request, reply) => {
    const user = request.user;
    const { subject, body } = extractTaskSchema.parse(request.body);

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const creds = await resolveAiCredentials(user.tenant_id, settings['int-ai'], user.role);
    if (!creds) return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You read one email and decide whether it genuinely implies a task the recipient needs to do — a request, a deadline, a document to send, something to review or approve. Most emails do not (newsletters, FYI notices, confirmations, casual replies) — only flag a real action item.

Today's date is ${today}. Respond ONLY with valid JSON, nothing else, matching exactly:
{"hasTask": true|false, "title": "short imperative task title, max 60 chars", "dueDate": "YYYY-MM-DD or null"}

Rules:
- hasTask is false for anything that isn't a real, actionable request — set title to "" and dueDate to null in that case.
- title is written as something to DO ("Quote for PCB", "Send Q3 report"), not a restatement of the subject line.
- dueDate is only set when the email states or clearly implies an actual deadline/date — never invent one. Relative phrases ("by Friday", "end of month") should be resolved against today's date above.`;

    try {
      const raw = await callAI(
        creds.apiKey, creds.model, creds.provider,
        [{ role: 'user', content: `${systemPrompt}\n\nSubject: ${subject || '(no subject)'}\n\nBody:\n${body}` }],
        256, 0.1,
      );
      let parsed: any = {};
      try { parsed = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim()); } catch {
        return { hasTask: false };
      }
      if (!parsed.hasTask || !parsed.title) return { hasTask: false };
      return {
        hasTask: true,
        title: String(parsed.title).slice(0, 60),
        dueDate: typeof parsed.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate) ? parsed.dueDate : null,
      };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  /**
   * POST /v1/ai/compose-draft
   * "Describe your message" — turns a short instruction into a full email
   * body draft, aware of what's being replied to (if anything). The
   * subject/body split mirrors EmailApp.tsx's own compose model; a reply
   * never needs a new subject, so `subject` is only ever set for a fresh
   * message where none has been typed yet.
   */
  fastify.post('/compose-draft', async (request, reply) => {
    const user = request.user;
    const { instruction, subject, replyContext } = composeDraftSchema.parse(request.body);

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const creds = await resolveAiCredentials(user.tenant_id, settings['int-ai'], user.role);
    if (!creds) return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });

    const systemPrompt = `You write one email on behalf of ${user.name || 'the sender'}, from a short instruction describing what it should say.

Rules:
- Plain text only — no markdown, no HTML, no bullet-point asterisks, no signature or sign-off name (the app appends the sender's own signature separately).
- Write the body only. If a subject line genuinely improves on the one given (or none was given), you may suggest one, but only when it clearly helps.
- Match a normal, professional business-email tone — concise, no filler, no "I hope this email finds you well".
- If replying to a previous message (given below), address it directly rather than restating it.
- Respond ONLY with valid JSON: {"subject": "new subject or null", "body": "the email body"}`;

    const contextParts = [
      subject ? `Current subject: ${subject}` : null,
      replyContext ? `Replying to:\n${replyContext.slice(0, 4000)}` : null,
      `Instruction: ${instruction}`,
    ].filter(Boolean).join('\n\n');

    try {
      const raw = await callAI(creds.apiKey, creds.model, creds.provider,
        [{ role: 'user', content: `${systemPrompt}\n\n${contextParts}` }],
        700, 0.5);
      let parsed: any = {};
      try { parsed = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim()); } catch {
        // A model that ignores the JSON instruction still wrote something
        // usable — fall back to the raw text as the body rather than
        // failing the whole request over a formatting slip.
        return { body: raw.trim() };
      }
      return {
        body: String(parsed.body ?? raw).trim(),
        subject: typeof parsed.subject === 'string' && parsed.subject.trim() ? parsed.subject.trim() : undefined,
      };
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
    const { prompt } = automationGenerateSchema.parse(request.body);

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });

    const creds = await resolveAiCredentials(user.tenant_id, settings['int-ai'], user.role);
    if (!creds) {
      return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });
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
        creds.apiKey,
        creds.model,
        creds.provider,
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

  // POST /v1/ai/chat was retired: the assistant now runs on the governed
  // agent runtime (routes/agent.routes.ts, POST /v1/agent/runs).

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
    const creds = await resolveAiCredentials(user.tenant_id, settings['int-ai'], user.role);
    if (!creds) {
      return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });
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
        creds.apiKey,
        creds.model,
        creds.provider,
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
