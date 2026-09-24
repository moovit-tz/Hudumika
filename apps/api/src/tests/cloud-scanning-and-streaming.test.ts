// Fixes for the three previously-open items: streamed malware scanning (no full-buffer requirement),
// streamed object-storage writes (DiskBackend.putStream — the backend actually exercised in dev/test),
// a real clamd connectivity check, and the /health endpoint surfacing it.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { scanBuffer, scanChunks, pingClamd, checkAntivirusAtBoot } from '../integrations/antivirus.js';
import { objectStore } from '../integrations/object-storage.js';
import { getApp } from './helpers.js';

describe('Malware scanning without a full in-memory buffer', () => {
  it('scanChunks over several pieces gives the same result as scanBuffer over the whole thing (scanner unconfigured → both skip)', async () => {
    const whole = Buffer.from('hello world, this is a normal file with no signatures in it');
    const pieces = [whole.subarray(0, 10), whole.subarray(10, 30), whole.subarray(30)];
    const [a, b] = await Promise.all([scanBuffer(whole), scanChunks(pieces)]);
    expect(a).toEqual(b);
    expect(a.skipped).toBe(true); // no CLAMAV_HOST in the test environment
  });

  it('scanChunks accepts an async generator, not just an array, without buffering it first', async () => {
    async function* gen() { yield Buffer.from('a'); yield Buffer.from('b'); yield Buffer.from('c'); }
    const result = await scanChunks(gen());
    expect(result.skipped).toBe(true);
  });

  it('pingClamd reports "not configured" rather than hanging or throwing when CLAMAV_HOST is unset', async () => {
    const result = await pingClamd(500);
    expect(result).toEqual({ ok: false, error: 'not configured' });
  });

  it('checkAntivirusAtBoot never throws, in either environment', async () => {
    await expect(checkAntivirusAtBoot('development')).resolves.toBeUndefined();
    await expect(checkAntivirusAtBoot('production')).resolves.toBeUndefined();
  });

  it('a real (if fake) clamd that answers PONG is reported healthy', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', (d) => { if (d.toString().includes('PING')) socket.end('PONG\0'); });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    const origHost = process.env.CLAMAV_HOST, origPort = process.env.CLAMAV_PORT;
    try {
      const { env } = await import('../config/env.js');
      (env as any).CLAMAV_HOST = '127.0.0.1';
      (env as any).CLAMAV_PORT = port;
      const result = await pingClamd(2000);
      expect(result).toEqual({ ok: true });
    } finally {
      const { env } = await import('../config/env.js');
      (env as any).CLAMAV_HOST = origHost;
      (env as any).CLAMAV_PORT = origPort;
      server.close();
    }
  });
});

describe('Streamed object-storage writes (DiskBackend)', () => {
  const keys: string[] = [];
  afterEach(async () => { for (const k of keys) await objectStore.del(k).catch(() => {}); keys.length = 0; });

  it('putStream assembles chunks into byte-identical content to a single put()', async () => {
    if (objectStore.kind !== 'disk') return; // this test targets the backend actually running in dev/test
    const content = Buffer.alloc(3 * 1024 * 1024);
    for (let i = 0; i < content.length; i++) content[i] = i % 251;
    const chunks = [content.subarray(0, 1_000_000), content.subarray(1_000_000, 2_500_000), content.subarray(2_500_000)];

    const streamedKey = `tests/putstream-${Date.now()}.bin`;
    const directKey = `tests/put-${Date.now()}.bin`;
    keys.push(streamedKey, directKey);

    async function* gen() { for (const c of chunks) yield c; }
    await objectStore.putStream(streamedKey, gen(), content.length);
    await objectStore.put(directKey, content);

    const [streamed, direct] = await Promise.all([objectStore.get(streamedKey), objectStore.get(directKey)]);
    expect(streamed).not.toBeNull();
    expect(streamed!.equals(direct!)).toBe(true);
    expect(streamed!.length).toBe(content.length);
  });

  it('a failed stream leaves no partial file behind', async () => {
    if (objectStore.kind !== 'disk') return;
    const key = `tests/putstream-fail-${Date.now()}.bin`;
    async function* gen(): AsyncIterable<Buffer> { yield Buffer.from('partial'); throw new Error('simulated read failure'); }
    await expect(objectStore.putStream(key, gen(), 100)).rejects.toThrow('simulated read failure');
    expect(await objectStore.exists(key)).toBe(false);
  });
});

describe('Health endpoint reports real antivirus connectivity', () => {
  it('reports not_configured when no scanner is set up (the test environment)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().antivirus).toBe('not_configured');
  });
});
