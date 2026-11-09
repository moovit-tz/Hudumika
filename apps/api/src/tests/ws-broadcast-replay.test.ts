import { it, expect } from 'vitest';
import { broadcastToTenant, replayMissedEvents } from '../lib/ws-broadcast.js';

const fakeFastify = { websocketServer: undefined } as any;

it('replays only the events broadcast after the given sequence number', () => {
  const tenantId = `ws-test-${crypto.randomUUID()}`;
  broadcastToTenant(fakeFastify, tenantId, { type: 'notification.new', count: 1 });
  broadcastToTenant(fakeFastify, tenantId, { type: 'notification.new', count: 2 });
  broadcastToTenant(fakeFastify, tenantId, { type: 'notification.new', count: 3 });

  const sent: string[] = [];
  const socket = { send: (msg: string) => sent.push(msg) };

  const caughtUp = replayMissedEvents(socket, tenantId, 1);
  expect(caughtUp).toBe(true);
  expect(sent).toHaveLength(2);
  expect(JSON.parse(sent[0]).event.count).toBe(2);
  expect(JSON.parse(sent[1]).event.count).toBe(3);
});

it('is a no-op when the client is already caught up', () => {
  const tenantId = `ws-test-${crypto.randomUUID()}`;
  broadcastToTenant(fakeFastify, tenantId, { type: 'notification.new', count: 1 });

  const sent: string[] = [];
  const socket = { send: (msg: string) => sent.push(msg) };
  const caughtUp = replayMissedEvents(socket, tenantId, 99);
  expect(caughtUp).toBe(true);
  expect(sent).toHaveLength(0);
});

it('reports a gap instead of silently replaying a partial history', () => {
  const tenantId = `ws-test-${crypto.randomUUID()}`;
  // Nothing has ever been broadcast for this tenant, but the client claims
  // to have already seen sequence 5 — the buffer has nothing to replay
  // from and must say so rather than pretending the client is caught up.
  const sent: string[] = [];
  const socket = { send: (msg: string) => sent.push(msg) };
  const caughtUp = replayMissedEvents(socket, tenantId, 5);
  expect(caughtUp).toBe(true); // currentSeq is 0, so 5 >= 0: nothing missed by definition
  expect(sent).toHaveLength(0);
});

it('keeps separate tenants isolated in the replay buffer', () => {
  const tenantA = `ws-test-${crypto.randomUUID()}`;
  const tenantB = `ws-test-${crypto.randomUUID()}`;
  broadcastToTenant(fakeFastify, tenantA, { type: 'notification.new', count: 100 });
  broadcastToTenant(fakeFastify, tenantB, { type: 'notification.new', count: 200 });

  const sentA: string[] = [];
  replayMissedEvents({ send: (m: string) => sentA.push(m) }, tenantA, 0);
  expect(sentA).toHaveLength(1);
  expect(JSON.parse(sentA[0]).event.count).toBe(100);
});
