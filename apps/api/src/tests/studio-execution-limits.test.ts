import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS_BY_ID } from '../studio/actions.js';
import { executeWorkflow, STUDIO_EXECUTION_LIMITS } from '../studio/executor.js';
import { resolveContext } from '../studio/context.js';

vi.mock('../studio/context.js', () => ({ resolveContext: vi.fn(async () => ({ items: Array.from({ length: 101 }, (_, id) => ({ id })) })) }));

const trigger = { id: 'start', type: 'trigger', eventOrAction: 'manual.run' };
const action = (id: string) => ({ id, type: 'action', eventOrAction: 'notification.send_in_app', config: { input: { userId: '00000000-0000-0000-0000-000000000000', title: 'Test' } } });
const options = (nodes: unknown[], signal?: AbortSignal) => ({ tenantId: '00000000-0000-0000-0000-000000000000', workflow: { id: 'test', trigger_event: 'manual.run', nodes, edges: nodes.slice(1).map((_, i) => ({ source: (nodes[i] as any).id, target: (nodes[i + 1] as any).id })) }, payload: {}, entityId: null, domainEventId: null, simulate: false, signal });

afterEach(() => vi.restoreAllMocks());
describe('Studio cooperative execution boundaries', () => {
  it('prevents effects when already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute');
    const result = await executeWorkflow(options([trigger, action('one')], controller.signal));
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('cancelled');
    expect(spy).not.toHaveBeenCalled();
  });
  it('lets an in-flight action settle and stops the next action', async () => {
    const controller = new AbortController();
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockImplementation(async () => {
      controller.abort();
      await Promise.resolve();
      return { ok: true, detail: 'Completed effect' };
    });
    const result = await executeWorkflow(options([trigger, action('one'), action('two')], controller.signal));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PARTIAL');
    expect(result.stepResults.find(s => s.node_id === 'one')?.status).toBe('SUCCESS');
    expect(result.errorMessage).toContain('cancelled');
  });
  it('stops at the time boundary without racing an in-flight action', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockImplementation(async () => {
      now += STUDIO_EXECUTION_LIMITS.durationMs;
      return { ok: true, detail: 'Completed effect' };
    });
    const result = await executeWorkflow(options([trigger, action('one'), action('two')]));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PARTIAL');
    expect(result.errorMessage).toContain('time limit');
  });
  it('rejects oversized loops before executing any body action', async () => {
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute');
    const result = await executeWorkflow(options([trigger, { id: 'loop', type: 'forEach', config: { over: 'items', as: 'item' } }, action('one')]));
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('100-item');
    expect(spy).not.toHaveBeenCalled();
  });
  it('caps expanded loop steps and retains completed effects', async () => {
    vi.mocked(resolveContext).mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, id) => ({ id })) });
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockResolvedValue({ ok: true, detail: 'Completed effect' });
    const result = await executeWorkflow(options([trigger, { id: 'loop', type: 'forEach', config: { over: 'items', as: 'item' } }, ...Array.from({ length: 11 }, (_, id) => action(`action-${id}`))]));
    expect(spy).toHaveBeenCalledTimes(STUDIO_EXECUTION_LIMITS.steps - 2);
    expect(result.status).toBe('PARTIAL');
    expect(result.errorMessage).toContain('step limit');
    expect(result.stepResults.filter(s => s.node_type === 'action' && s.status === 'SUCCESS')).toHaveLength(998);
  });
});
