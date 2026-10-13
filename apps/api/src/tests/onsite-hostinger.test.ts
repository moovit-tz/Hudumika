import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyProviderConnection } from '../services/onsite-ci.service.js';
import { listHostingerWebsites, readHostingerDns, normalizeHostingerDnsValue, publishHostingerDns, dnsFingerprint } from '../services/onsite-hostinger.service.js';

afterEach(() => vi.unstubAllGlobals());
describe('Hostinger connection verification', () => {
  it('validates then publishes without overwrite and verifies the provider result', async () => {
    let reads = 0;
    const request = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
      if (!options.method) {
        reads++;
        return new Response(JSON.stringify(reads >= 3 ? [{ name: 'new', type: 'TXT', ttl: 300, records: [{ content: 'test-value' }] }] : []), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', request);
    expect(await publishHostingerDns('test-token', 'example.tz', { name: 'new', type: 'TXT', ttl: 300, value: 'test-value' }, dnsFingerprint([]))).toEqual({ published: true });
    const writes = request.mock.calls.filter(call => call[1].method);
    expect(writes.map(call => call[1].method)).toEqual(['POST', 'PUT']);
    expect(JSON.parse(writes[1][1].body as string).overwrite).toBe(false);
  });
  it('refuses stale previews before any provider write', async () => {
    const request = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', request);
    await expect(publishHostingerDns('test-token', 'example.tz', { name: 'new', type: 'TXT', ttl: 300, value: 'test' }, 'stale')).rejects.toThrow('changed');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('extracts standard MX and SRV priorities while preserving malformed values', () => {
    expect(normalizeHostingerDnsValue('MX', '10 mail.example.tz')).toEqual({ priority: 10, value: 'mail.example.tz' });
    expect(normalizeHostingerDnsValue('SRV', '20 5 5060 sip.example.tz')).toEqual({ priority: 20, value: '5 5060 sip.example.tz' });
    expect(normalizeHostingerDnsValue('MX', '70000 mail.example.tz').priority).toBeNull();
    expect(normalizeHostingerDnsValue('SRV', '20 5 70000 sip.example.tz').priority).toBeNull();
    expect(normalizeHostingerDnsValue('TXT', '10 unchanged text').value).toBe('10 unchanged text');
  });
  it('flattens provider DNS groups and preserves disabled values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ name: '@', type: 'TXT', ttl: 300, records: [{ content: 'test', is_disabled: true }] }]), { status: 200 })));
    expect(await readHostingerDns('test-token', 'example.tz')).toEqual([{ name: '@', type: 'TXT', ttl: 300, value: 'test', priority: null, disabled: true }]);
  });
  it('rejects malformed DNS rather than reporting an empty zone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ name: '@', type: 'TXT', ttl: 300, records: [{}] }]), { status: 200 })));
    await expect(readHostingerDns('test-token', 'example.tz')).rejects.toThrow();
  });
  it('returns only domain names and passes the requested page', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ domain: 'example.tz', token: 'private' }, { domain: 'example.tz' }] }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    expect(await listHostingerWebsites('test-token', 2)).toEqual({ domains: ['example.tz'], page: 2 });
    expect(request.mock.calls[0][0]).toContain('?page=2');
  });
  it('rejects malformed inventory rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{}] }), { status: 200 })));
    await expect(listHostingerWebsites('test-token')).rejects.toThrow('unexpected');
  });
  it('verifies inventory access without a deployment request', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    expect((await verifyProviderConnection('hostinger', 'test-token')).ok).toBe(true);
    expect(request.mock.calls[0][0]).toBe('https://developers.hostinger.com/api/hosting/v1/websites');
    expect(request.mock.calls[0][1].method).toBeUndefined();
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });
  it('does not expose provider response bodies on token rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-provider-detail', { status: 403 })));
    const verdict = await verifyProviderConnection('hostinger', 'test-token');
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).not.toContain('private-provider-detail');
  });
  it('rejects an unexpected success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    expect((await verifyProviderConnection('hostinger', 'test-token')).ok).toBe(false);
  });
});
