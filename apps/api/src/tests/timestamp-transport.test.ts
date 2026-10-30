import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const requireSdk = createRequire(createRequire(import.meta.url).resolve('opentimestamps'));
const { RemoteCalendar } = requireSdk('./src/calendar.js');
const Timestamp = requireSdk('./src/timestamp.js');
const { PendingAttestation } = requireSdk('./src/notary.js');
const { StreamSerialization } = requireSdk('./src/context.js');
const request = requireSdk('request-promise');

it('preserves binary calendar requests and proof decoding with the maintained transport', async () => {
  const digest = Buffer.alloc(32, 7);
  const timestamp = new Timestamp(Array.from(digest));
  timestamp.attestations.push(new PendingAttestation('https://a.pool.opentimestamps.org'));
  const context = new StreamSerialization(); timestamp.serialize(context);
  let received = Buffer.alloc(0);
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    received = Buffer.concat(chunks);
    res.writeHead(200, { 'Content-Type': 'application/vnd.opentimestamps.v1' });
    res.end(Buffer.from(context.getOutput()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const result = await new RemoteCalendar(`http://127.0.0.1:${address.port}`).submit(Array.from(digest));
    expect(received).toEqual(digest);
    expect(result.msg).toEqual(Array.from(digest));
    expect(result.attestations[0].uri).toBe('https://a.pool.opentimestamps.org');
    expect(requireSdk('request/package.json').name).toBe('@cypress/request');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

it('refuses cross-protocol redirects instead of following the legacy request SSRF path', async () => {
  const server = createServer((_req, res) => { res.writeHead(302, { Location: 'https://127.0.0.1:9/private' }); res.end(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    await expect(request({ url: `http://127.0.0.1:${address.port}`, timeout: 1500 })).rejects.toThrow(/protocol/i);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
