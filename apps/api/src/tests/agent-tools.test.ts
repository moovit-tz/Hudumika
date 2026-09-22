// Agentic platform regression tests — the parts that need no database and no
// AI provider: the zod→JSON-Schema converter the model's tool definitions are
// built from, the registry's advertised schemas vs. each tool's real zod
// shape, the client-safe catalogue, the approval-policy decision, and that
// malformed model arguments come back as a failed result rather than a throw.
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from '../lib/zod-json-schema.js';
import { AGENT_TOOL_INPUT_SCHEMAS, AGENT_TOOL_REGISTRY, runAgentTool, evidenceForTool } from '../services/agent-registry.js';
import { decideToolPolicy, runAgentLoop } from '../services/agent-runtime.service.js';
import { AI_PROVIDER_CONFIG, generationParams, detectAiProvider } from '../lib/ai-providers.js';
import { ACTIONS } from '../studio/actions.js';

describe('zodToJsonSchema', () => {
  it('maps the constructors the tool schemas use', () => {
    const schema = zodToJsonSchema(z.object({
      id: z.string().uuid(),
      note: z.string().min(1).max(10),
      qty: z.number().int().min(1),
      flag: z.boolean().default(true),
      kind: z.enum(['a', 'b']),
      tags: z.array(z.string()).optional(),
      maybe: z.string().nullable(),
    })) as any;
    expect(schema.type).toBe('object');
    expect(schema.properties.id).toEqual({ type: 'string', format: 'uuid' });
    expect(schema.properties.note).toEqual({ type: 'string', minLength: 1, maxLength: 10 });
    expect(schema.properties.qty).toEqual({ type: 'integer', minimum: 1 });
    expect(schema.properties.flag).toEqual({ type: 'boolean', default: true });
    expect(schema.properties.kind).toEqual({ type: 'string', enum: ['a', 'b'] });
    expect(schema.properties.tags).toEqual({ type: 'array', items: { type: 'string' } });
    expect(schema.properties.maybe.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
    // optional and defaulted fields are not required; nullable-but-present ones are
    expect(schema.required).toEqual(['id', 'note', 'qty', 'kind', 'maybe']);
  });

  it('carries .describe() text through', () => {
    const schema = zodToJsonSchema(z.object({ body: z.string().describe('The note text') })) as any;
    expect(schema.properties.body.description).toBe('The note text');
  });

  it('degrades to "any value" for a type it does not know, instead of throwing', () => {
    expect(zodToJsonSchema(z.any())).toEqual({});
  });
});

describe('agent tool registry', () => {
  it('advertises an object schema for every tool', () => {
    expect(AGENT_TOOL_REGISTRY.length).toBeGreaterThan(0);
    for (const t of AGENT_TOOL_REGISTRY) {
      const schema = AGENT_TOOL_INPUT_SCHEMAS[t.id] as any;
      expect(schema, t.id).toBeTruthy();
      expect(schema.type, t.id).toBe('object');
      expect(typeof schema.properties, t.id).toBe('object');
    }
  });

  it("each Studio action's advertised properties and required fields match its real zod schema", () => {
    for (const action of ACTIONS) {
      const advertised = AGENT_TOOL_INPUT_SCHEMAS[action.id] as any;
      const shape = (action.inputSchema as any)._def.shape() as Record<string, z.ZodTypeAny>;
      expect(Object.keys(advertised.properties).sort(), action.id).toEqual(Object.keys(shape).sort());
      const required = Object.keys(shape).filter(k => !shape[k].isOptional()).sort();
      expect([...(advertised.required ?? [])].sort(), action.id).toEqual(required);
    }
  });

  it('keeps schemas and execution logic out of the client-safe catalogue', () => {
    for (const t of AGENT_TOOL_REGISTRY) {
      expect(t).not.toHaveProperty('inputSchema');
      expect(t).not.toHaveProperty('run');
    }
  });

  it('has unique tool ids', () => {
    const ids = AGENT_TOOL_REGISTRY.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns malformed arguments as a readable failed result, never a thrown error', async () => {
    const res = await runAgentTool({ tenantId: '00000000-0000-0000-0000-000000000000' }, 'crm.add_note', { subjectId: 'not-a-uuid' });
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/^Invalid arguments for crm\.add_note/);
    expect(res.detail).toContain('subjectId');
  });

  it('refuses an unknown tool cleanly', async () => {
    const res = await runAgentTool({ tenantId: '00000000-0000-0000-0000-000000000000' }, 'no.such.tool', {});
    expect(res).toEqual({ ok: false, detail: 'Unknown tool: no.such.tool' });
  });

  it('a "my own X" tool refuses to run without a user context', async () => {
    const res = await runAgentTool({ tenantId: '00000000-0000-0000-0000-000000000000' }, 'tasks.list_my_open', {});
    expect(res.ok).toBe(false);
  });
});

describe('approval policy', () => {
  it('always gates an "always" tool, even for a super admin', () => {
    expect(decideToolPolicy('always', 'SUPER_ADMIN')).toBe('require_approval');
  });
  it('never gates a "never" tool, even for a plain staff member', () => {
    expect(decideToolPolicy('never', 'STAFF')).toBe('allow');
  });
  it('lets management roles proceed on a "policy" tool but holds everyone else', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER']) expect(decideToolPolicy('policy', role)).toBe('allow');
    for (const role of ['STAFF', 'EMPLOYEE', 'CUSTOMER']) expect(decideToolPolicy('policy', role)).toBe('require_approval');
  });
  it('every critical-risk tool in the registry is gated "always"', () => {
    for (const t of AGENT_TOOL_REGISTRY.filter(t => t.risk === 'critical')) expect(t.approvalPolicy, t.id).toBe('always');
  });
  it('no write tool is auto-approved at medium risk or above', () => {
    for (const t of AGENT_TOOL_REGISTRY.filter(t => t.effect !== 'read' && (t.risk === 'medium' || t.risk === 'high' || t.risk === 'critical'))) {
      expect(t.approvalPolicy, t.id).not.toBe('never');
    }
  });
});

describe('evidence from tool results', () => {
  it('maps a read tool\'s output to the records it came from, nothing else', () => {
    const refs = evidenceForTool('bliss.list_my_open_tickets', [{ id: 't-1', ref: 'SUP-1', subject: 'Missing BL' }]);
    expect(refs).toEqual([{ claim: 'Ticket SUP-1: Missing BL', entityType: 'ticket', entityId: 't-1' }]);
  });
  it('records nothing for a tool with no evidence mapping, a non-list output, or a malformed one', () => {
    expect(evidenceForTool('crm.add_note', [{ id: 'x' }])).toEqual([]);
    expect(evidenceForTool('tasks.list_my_open', 'boom')).toEqual([]);
    expect(evidenceForTool('tasks.list_my_open', [null])).toEqual([]);
    expect(evidenceForTool('no.such.tool', [])).toEqual([]);
  });
  it('records the real record a write tool left behind, from its output', () => {
    expect(evidenceForTool('tasks.create_task', { taskId: 'k-1' })).toEqual([{ claim: 'Created a task', entityType: 'task', entityId: 'k-1' }]);
    expect(evidenceForTool('finance.record_expense', { expenseId: 'e-1' })[0]).toMatchObject({ entityType: 'expense', entityId: 'e-1' });
  });
  it('for a write tool whose output has no id, uses the input id only when the action says it happened', () => {
    expect(evidenceForTool('support.assign_ticket', 'Assigned ticket T to U.', { ticketId: 'T' })).toEqual([{ claim: 'Assigned a support ticket', entityType: 'ticket', entityId: 'T' }]);
    expect(evidenceForTool('support.assign_ticket', 'Already assigned to this person — nothing to do.', { ticketId: 'T' })).toEqual([]);
    expect(evidenceForTool('seal.release_lot', 'Released lot L to X.', { lotId: 'L' })[0]).toMatchObject({ entityType: 'lot', entityId: 'L' });
  });
  it('grounds the ClearOS shipment and customer tools in the records they returned', () => {
    expect(evidenceForTool('search_shipments', [{ id: 's-1', ref_number: 'SH-9', customer: 'Acme', stage: 'DELIVERY' }])).toEqual([
      { claim: 'Shipment SH-9 (Acme) is at stage DELIVERY', entityType: 'shipment', entityId: 's-1' }]);
    expect(evidenceForTool('get_at_risk_shipments', [{ id: 's-2', ref_number: 'SH-2', customer: 'B', stage: 'X', sla_breached: true, demurrage_risk: true }])[0].claim).toContain('SLA breached, demurrage risk');
    expect(evidenceForTool('get_customer_info', { id: 'c-1', customer: 'Acme', total_shipments: 3, outstanding_balance: 10 })[0]).toMatchObject({ entityType: 'customer', entityId: 'c-1' });
  });
  it('records nothing for an aggregate (aged receivables) or a "not found" error result', () => {
    expect(evidenceForTool('get_aged_receivables', { totals: {}, top_debtors: [] })).toEqual([]);
    expect(evidenceForTool('get_customer_info', { error: 'No customer found' })).toEqual([]);
  });
  it('records nothing when a write was skipped (its output is just a message)', () => {
    expect(evidenceForTool('tasks.create_task', 'Skipped — an open task with this title already exists (k).')).toEqual([]);
  });
  it('drops rows that carry no entity id rather than recording an unlinkable claim', () => {
    expect(evidenceForTool('tasks.list_my_open', [{ title: 'no id' }])).toEqual([]);
  });
});

describe('tool grants in the agent loop (no database — refused calls never execute anything)', () => {
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const usage = { input_tokens: 1, output_tokens: 1 };

  it('offers the model only the granted tools', async () => {
    const seen: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      seen.push(JSON.parse(init.body));
      return reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }], usage });
    }) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', new Set(['crm.add_note']));
    spy.mockRestore();
    expect(res.status).toBe('completed');
    expect(seen[0].tools.map((t: any) => t.name)).toEqual(['crm__add_note']);
  });

  it('refuses a tool the model calls anyway, tells it so, and lets the run continue', async () => {
    const bodies: any[] = [];
    let call = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return reply(call++ === 0
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'tasks__create_task', input: {} }], usage }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage });
    }) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', new Set(['crm.add_note']));
    spy.mockRestore();
    expect(res.status).toBe('completed');
    const result = res.steps.find(s => s.stepType === 'tool_result')!;
    expect(result.status).toBe('error');
    expect(result.error).toBe('Tool tasks.create_task is not enabled for this agent.');
    expect(JSON.stringify(bodies[1].messages.at(-1))).toContain('is not enabled for this agent');
  });

  it('an empty allow-list (all grants expired) offers no tools at all', async () => {
    let offered = -1;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      offered = (JSON.parse(init.body).tools ?? []).length;
      return reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage });
    }) as any);
    await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', new Set());
    spy.mockRestore();
    expect(offered).toBe(0);
  });
});

describe('several tool calls in one model turn', () => {
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const usage = { input_tokens: 1, output_tokens: 1 };
  const only = new Set(['crm.add_note']); // both calls below are refused, so no database is touched

  it('Anthropic: every tool_use block gets a tool_result, or the provider rejects the next request', async () => {
    const bodies: any[] = [];
    let n = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return reply(n++ === 0
        ? { stop_reason: 'tool_use', content: [
            { type: 'tool_use', id: 'A', name: 'tasks__create_task', input: {} },
            { type: 'tool_use', id: 'B', name: 'tasks__list_my_open', input: {} },
          ], usage }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage });
    }) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', only);
    spy.mockRestore();
    expect(res.status).toBe('completed');
    const results = bodies[1].messages.at(-1).content;
    expect(results.map((r: any) => r.tool_use_id).sort()).toEqual(['A', 'B']);
    expect(results.every((r: any) => r.type === 'tool_result')).toBe(true);
  });

  it('OpenAI-compatible: every tool_call gets a tool message', async () => {
    const bodies: any[] = [];
    let n = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return reply(n++ === 0
        ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
            { id: 'A', type: 'function', function: { name: 'tasks__create_task', arguments: '{}' } },
            { id: 'B', type: 'function', function: { name: 'tasks__list_my_open', arguments: '{}' } },
          ] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }
        : { choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'llama-3.3-70b-versatile', 'groq', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', only);
    spy.mockRestore();
    expect(res.status).toBe('completed');
    const toolMsgs = bodies[1].messages.filter((m: any) => m.role === 'tool');
    expect(toolMsgs.map((m: any) => m.tool_call_id).sort()).toEqual(['A', 'B']);
  });
});

describe('resuming after an approval when the model had made several calls', () => {
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const done = { ok: true, detail: 'done', output: { fine: true } };

  it('Anthropic: the replayed turn gets a result for every tool_use block, not just the approved one', async () => {
    const bodies: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    }) as any);
    const raw = [{ type: 'tool_use', id: 'A', name: 'finance__record_expense', input: {} }, { type: 'tool_use', id: 'B', name: 'tasks__list_my_open', input: {} }];
    await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }],
      { toolId: 'finance.record_expense', result: done, rawAssistantMessage: raw, toolUseId: 'A' });
    spy.mockRestore();
    expect(bodies[0].messages.at(-1).content.map((r: any) => r.tool_use_id).sort()).toEqual(['A', 'B']);
  });

  it('OpenAI-compatible: every replayed tool_call gets a tool message', async () => {
    const bodies: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return reply({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    const raw = { role: 'assistant', content: null, tool_calls: [
      { id: 'A', type: 'function', function: { name: 'finance__record_expense', arguments: '{}' } },
      { id: 'B', type: 'function', function: { name: 'tasks__list_my_open', arguments: '{}' } },
    ] };
    await runAgentLoop('t', 'u', 'k', 'llama-3.3-70b-versatile', 'groq', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }],
      { toolId: 'finance.record_expense', result: done, rawAssistantMessage: raw, toolUseId: 'A' });
    spy.mockRestore();
    expect(bodies[0].messages.filter((m: any) => m.role === 'tool').map((m: any) => m.tool_call_id).sort()).toEqual(['A', 'B']);
  });
});

describe('tool names on the wire', () => {
  const NAME_RULE = /^[a-zA-Z0-9_-]{1,64}$/; // Anthropic, OpenAI and Groq all enforce this
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  it('every tool name sent to Anthropic satisfies the provider naming rule', async () => {
    const seen: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      seen.push(JSON.parse(init.body));
      return reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    }) as any);
    await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }]);
    spy.mockRestore();
    const names: string[] = seen[0].tools.map((t: any) => t.name);
    expect(names.length).toBe(AGENT_TOOL_REGISTRY.length);
    for (const n of names) expect(n, n).toMatch(NAME_RULE);
    expect(new Set(names).size).toBe(names.length); // sanitising must not merge two tools
  });

  it('every tool name sent to an OpenAI-compatible provider satisfies the rule', async () => {
    const seen: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      seen.push(JSON.parse(init.body));
      return reply({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    await runAgentLoop('t', 'u', 'k', 'llama-3.3-70b-versatile', 'groq', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }]);
    spy.mockRestore();
    for (const t of seen[0].tools) expect(t.function.name, t.function.name).toMatch(NAME_RULE);
  });

  it('a call using the wire name resolves back to the canonical tool id', async () => {
    let n = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      const body = JSON.parse(init.body);
      const wire = body.tools[0].name; // the single granted tool, as the model sees it
      return reply(n++ === 0
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'tasks__create_task', input: {} }], usage: { input_tokens: 1, output_tokens: 1 } }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text: wire }], usage: { input_tokens: 1, output_tokens: 1 } });
    }) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', new Set(['crm.add_note']));
    spy.mockRestore();
    // refused (not granted) — but recorded under the canonical dotted id, proving the name mapped back
    expect(res.steps.find(s => s.stepType === 'tool_call')!.toolId).toBe('tasks.create_task');
  });
});

describe('wire-name mapping safety', () => {
  it('no registered tool id already contains "__", so "." -> "__" is reversible and collision-free', () => {
    for (const t of AGENT_TOOL_REGISTRY) expect(t.id, t.id).not.toContain('__');
  });
});

describe('provider rules (documented, Sept 2026)', () => {
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  it('never sends an empty tools array (OpenAI-style APIs reject minItems:0) — the key is omitted instead', async () => {
    const seen: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      seen.push(JSON.parse(init.body));
      return reply(seen.length % 2 ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }
                                    : { choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', new Set());
    await runAgentLoop('t', 'u', 'k', 'llama-3.3-70b-versatile', 'groq', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', new Set());
    spy.mockRestore();
    for (const body of seen) expect(body).not.toHaveProperty('tools');
  });

  it("Google's default model is not the one scheduled for shutdown", () => {
    expect(AI_PROVIDER_CONFIG.google.defaultModel).toBe('gemini-3.8-flash');
  });

  it('Gemini tool schemas carry no keywords the docs do not list as supported (format/default/additionalProperties/anyOf)', async () => {
    const seen: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      seen.push(JSON.parse(init.body));
      return reply({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    await runAgentLoop('t', 'u', 'k', 'gemini-3.8-flash', 'google', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }]);
    spy.mockRestore();
    const banned = ['format', 'default', 'additionalProperties', 'anyOf', '$schema'];
    // Keys directly under "properties" are field NAMES, everything else is a schema keyword.
    const walk = (node: any, path: string): void => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, path + '[' + i + ']'));
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        if (k === 'properties') {
          for (const [name, sub] of Object.entries(v as object)) walk(sub, path + '.' + name);
          continue;
        }
        if (banned.includes(k)) throw new Error(path + ' has forbidden keyword "' + k + '"');
        walk(v, path + '.' + k);
      }
    };
    for (const t of seen[0].tools) walk(t.function.parameters, t.function.name);
    // ...but the information is not lost: it moves into the description text.
    const note = seen[0].tools.find((t: any) => t.function.name === 'crm__add_note').function.parameters.properties.subjectId;
    expect(note.description).toMatch(/uuid/i);
  });

  it('other providers still receive the full, unsimplified schema', async () => {
    const seen: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      seen.push(JSON.parse(init.body));
      return reply({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    await runAgentLoop('t', 'u', 'k', 'llama-3.3-70b-versatile', 'groq', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }]);
    spy.mockRestore();
    expect(seen[0].tools.find((t: any) => t.function.name === 'crm__add_note').function.parameters.properties.subjectId.format).toBe('uuid');
  });

  it('fills in a missing tool_call id (some OpenAI-compatible layers omit it) so the result can be paired', async () => {
    const bodies: any[] = [];
    let n = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return reply(n++ === 0
        ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ type: 'function', function: { name: 'tasks__create_task', arguments: '{}' } }] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }
        : { choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'gemini-3.8-flash', 'google', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', new Set(['crm.add_note']));
    spy.mockRestore();
    expect(res.status).toBe('completed');
    const assistant = bodies[1].messages.find((m: any) => m.role === 'assistant');
    const tool = bodies[1].messages.find((m: any) => m.role === 'tool');
    expect(assistant.tool_calls[0].id).toBeTruthy();
    expect(tool.tool_call_id).toBe(assistant.tool_calls[0].id);
  });
});

describe('generation parameters per model (documented, Sept 2026)', () => {
  it('Claude Sonnet 5 / Opus 5 reject non-default sampling params (400) — temperature is omitted for them', () => {
    for (const m of ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5-1']) {
      expect(generationParams('anthropic', m, 1024), m).toEqual({ max_tokens: 1024 });
    }
  });
  it('older Claude models that accept temperature still get it', () => {
    for (const m of ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6']) {
      expect(generationParams('anthropic', m, 1024, 0.3), m).toEqual({ max_tokens: 1024, temperature: 0.3 });
    }
  });
  it('an unknown Anthropic model gets NO temperature — omitting is always accepted, sending can be a 400', () => {
    expect(generationParams('anthropic', 'claude-something-new', 512)).toEqual({ max_tokens: 512 });
  });
  it('GPT-5-family models use max_completion_tokens and no custom temperature; GPT-4-family keep the old shape', () => {
    expect(generationParams('openai', 'gpt-5.6-terra', 800)).toEqual({ max_completion_tokens: 800 });
    expect(generationParams('openai', 'gpt-5.6-luna', 800)).toEqual({ max_completion_tokens: 800 });
    expect(generationParams('openai', 'gpt-4o', 800, 0.3)).toEqual({ max_tokens: 800, temperature: 0.3 });
  });
  it('Groq and Gemini keep max_tokens + temperature', () => {
    expect(generationParams('groq', 'llama-3.3-70b-versatile', 100, 0.3)).toEqual({ max_tokens: 100, temperature: 0.3 });
    expect(generationParams('google', 'gemini-3.8-flash', 100, 0.3)).toEqual({ max_tokens: 100, temperature: 0.3 });
  });
  it('the agent loop sends no temperature to Sonnet 5 and a completion-token limit to gpt-5.6', async () => {
    const reply = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    const seen: any[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: any, init: any) => {
      const body = JSON.parse(init.body); seen.push(body);
      return reply(body.system !== undefined
        ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }
        : { choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as any);
    await runAgentLoop('t', 'u', 'k', 'claude-sonnet-5', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }]);
    await runAgentLoop('t', 'u', 'k', 'gpt-5.6-terra', 'openai', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }]);
    spy.mockRestore();
    expect(seen[0]).not.toHaveProperty('temperature');
    expect(seen[1]).toHaveProperty('max_completion_tokens', 1024);
    expect(seen[1]).not.toHaveProperty('max_tokens');
    expect(seen[1]).not.toHaveProperty('temperature');
  });
});

describe('model defaults and provider detection', () => {
  it("defaults are models the providers list as current, not retired or scheduled for retirement", () => {
    expect(AI_PROVIDER_CONFIG.anthropic.defaultModel).toBe('claude-sonnet-5'); // Haiku 4.5's retirement window opens 2026-10-15
    expect(AI_PROVIDER_CONFIG.google.defaultModel).toBe('gemini-3.8-flash');
    expect(AI_PROVIDER_CONFIG.groq.defaultModel).toBe('llama-3.3-70b-versatile');
    expect(AI_PROVIDER_CONFIG.openai.defaultModel).toBe('gpt-5.6-luna');
  });
  it('a Groq-hosted model whose id starts with "openai/" is routed to Groq, not OpenAI', () => {
    expect(detectAiProvider(undefined, 'openai/gpt-oss-120b')).toBe('groq');
    expect(detectAiProvider(undefined, 'qwen/qwen3.8-27b')).toBe('groq');
    expect(detectAiProvider(undefined, 'gpt-5.6-terra')).toBe('openai');
    expect(detectAiProvider(undefined, 'claude-sonnet-5')).toBe('anthropic');
  });
});
