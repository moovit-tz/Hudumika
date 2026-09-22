// A grant's maxAmountTzs cap turns "the agent may just do it" into "a human
// must approve it" — and only ever in that direction.
import { describe, it, expect, vi } from 'vitest';
import { exceedsToolLimit, runAgentLoop } from '../services/agent-runtime.service.js';

const limits = { 'finance.record_expense': { maxAmountTzs: 500_000 } };

describe('exceedsToolLimit', () => {
  it('is false at or under the cap, true over it', () => {
    expect(exceedsToolLimit('finance.record_expense', { amountTzs: 500_000 }, limits)).toBe(false);
    expect(exceedsToolLimit('finance.record_expense', { amountTzs: 1000 }, limits)).toBe(false);
    expect(exceedsToolLimit('finance.record_expense', { amountTzs: 500_001 }, limits)).toBe(true);
  });
  it('treats an unreadable amount as over the cap rather than waving it through', () => {
    expect(exceedsToolLimit('finance.record_expense', {}, limits)).toBe(true);
    expect(exceedsToolLimit('finance.record_expense', { amountTzs: 'lots' }, limits)).toBe(true);
    expect(exceedsToolLimit('finance.record_expense', null, limits)).toBe(true);
  });
  it('ignores tools with no cap', () => {
    expect(exceedsToolLimit('crm.add_note', { amountTzs: 9e9 }, limits)).toBe(false);
    expect(exceedsToolLimit('finance.record_expense', { amountTzs: 9e9 }, {})).toBe(false);
  });
});

describe('cap in the agent loop', () => {
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const call = (amountTzs: number) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'finance__record_expense', input: { shipmentId: '00000000-0000-0000-0000-000000000000', category: 'X', label: 'x', amountTzs } }], usage: { input_tokens: 1, output_tokens: 1 } });

  it('holds an over-cap expense for approval even for a TENANT_ADMIN who is normally trusted', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async () => reply(call(900_000))) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'claude-haiku-4-5-20251001', 'anthropic', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', null, limits);
    spy.mockRestore();
    expect(res.status).toBe('awaiting_approval');
    expect(res.pendingApproval?.toolId).toBe('finance.record_expense');
  });

  it('applies to OpenAI-compatible providers too', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async () => reply({
      choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'finance__record_expense', arguments: JSON.stringify({ shipmentId: '00000000-0000-0000-0000-000000000000', category: 'X', label: 'x', amountTzs: 900_000 }) } }] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })) as any);
    const res = await runAgentLoop('t', 'u', 'k', 'llama-3.3-70b-versatile', 'groq', 'TENANT_ADMIN', [{ role: 'user', content: 'x' }], undefined, '', null, limits);
    spy.mockRestore();
    expect(res.status).toBe('awaiting_approval');
  });
});
