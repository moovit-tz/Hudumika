import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function setup(result: Response | Error, services = [[['com'], ['https://registry.example/rdap/']]]) {
  vi.resetModules();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ services })));
  if (result instanceof Error) fetcher.mockRejectedValue(result); else fetcher.mockResolvedValue(result);
  vi.stubGlobal('fetch', fetcher);
  return { ...(await import('../services/onsite-rdap.service.js')), fetcher };
}
describe('Onsite direct registry lookup', () => {
  it('queries the IANA endpoint directly and recognizes a registered domain', async () => {
    const s = await setup(new Response(JSON.stringify({ objectClassName: 'domain' })));
    expect(await s.checkDomainAvailability('EXAMPLE.com')).toEqual({ domain: 'example.com', available: false, error: null });
    expect(String(s.fetcher.mock.calls[1][0])).toBe('https://registry.example/rdap/domain/example.com');
  });
  it('accepts a registry 404 with an empty body', async () => {
    const s = await setup(new Response(null, { status: 404 }));
    expect((await s.checkDomainAvailability('example.com')).available).toBe(true);
  });
  it('does not treat a missing TLD service as an available domain', async () => {
    const s = await setup(new Response(null, { status: 404 }));
    expect(await s.checkDomainAvailability('example.io')).toMatchObject({ available: false, error: expect.stringContaining('no RDAP service') });
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([403, 429, 500])('reports HTTP %s as unchecked', async status => {
    const s = await setup(new Response(null, { status }));
    expect(await s.checkDomainAvailability('example.com')).toMatchObject({ available: false, error: expect.any(String) });
  });
  it('does not confuse a gateway HTML response with a registration record', async () => {
    const s = await setup(new Response('<html>Blocked</html>'));
    expect(await s.checkDomainAvailability('example.com')).toMatchObject({ available: false, error: expect.any(String) });
  });
  it('shares and caches the directory across simultaneous checks', async () => {
    const s = await setup(new Response(null, { status: 404 }));
    const results = await s.checkAvailabilityForTlds('example', ['.com', '.com']);
    expect(results.every(r => r.available)).toBe(true);
    expect(s.fetcher.mock.calls.filter(c => String(c[0]).includes('data.iana.org'))).toHaveLength(1);
  });
  it('rejects URL input before fetching', async () => {
    const s = await setup(new Response(null, { status: 404 }));
    expect((await s.checkDomainAvailability('https://example.com/path')).error).toContain('valid domain');
    expect(s.fetcher).not.toHaveBeenCalled();
  });
});
