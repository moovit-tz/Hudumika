import { requireAppEnabled } from '../middleware/appGate.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

async function callAI(apiKey: string, model: string, provider: string, messages: any[], maxTokens = 1024, temperature = 0.3) {
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
  fastify.addHook('preHandler', requireAppEnabled('ai'));

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
}
