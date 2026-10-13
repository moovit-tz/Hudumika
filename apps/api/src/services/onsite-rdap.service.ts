/** Registry endpoints come from IANA; a shared redirect gateway can block all TLDs. */
export interface RdapLookupResult { domain: string; available: boolean; error: string | null }
type Bootstrap = { services: [string[], string[]][] };
const TIMEOUT_MS = 10_000;
let cached: { data: Bootstrap; expires: number } | null = null;
let loading: Promise<Bootstrap> | null = null;
async function registryDirectory(): Promise<Bootstrap> {
  if (cached && cached.expires > Date.now()) return cached.data;
  if (loading) return loading;
  loading = (async () => {
    const response = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error('Registry directory unavailable');
    const data = await response.json() as Bootstrap;
    if (!Array.isArray(data.services) || !data.services.every(s => Array.isArray(s) && Array.isArray(s[0]) && Array.isArray(s[1]) && s[0].every(v => typeof v === 'string') && s[1].every(v => typeof v === 'string'))) throw new Error('Invalid registry directory');
    cached = { data, expires: Date.now() + 6 * 60 * 60_000 };
    return data;
  })();
  try { return await loading; } finally { loading = null; }
}
export async function checkDomainAvailability(domain: string): Promise<RdapLookupResult> {
  domain = domain.trim().toLowerCase();
  if (domain.length > 253 || !domain.includes('.') || !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return { domain, available: false, error: 'Enter a valid domain name without a URL or path.' };
  try {
    const directory = await registryDirectory();
    const tld = domain.split('.').at(-1)!;
    const endpoints = directory.services.find(([tlds]) => tlds.includes(tld))?.[1] ?? [];
    if (!endpoints.length) return { domain, available: false, error: `.${tld} has no RDAP service listed by IANA. Check availability with a connected registrar.` };
    let error = 'The registry could not be reached. Please retry.';
    for (const base of endpoints.slice(0, 2)) {
      try {
        const url = new URL(`domain/${encodeURIComponent(domain)}`, base.endsWith('/') ? base : `${base}/`);
        if (!['https:', 'http:'].includes(url.protocol)) continue;
        const response = await fetch(url, { headers: { Accept: 'application/rdap+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (response.status === 404) return { domain, available: true, error: null };
        if (response.ok) {
          const record = await response.json();
          if (record.objectClassName === 'domain') return { domain, available: false, error: null };
          error = 'The registry returned an unexpected response. Please retry.';
        } else error = response.status === 429 ? 'The registry is rate limiting lookups. Please retry later.' : `The registry rejected the lookup (HTTP ${response.status}). Please retry or check with your registrar.`;
      } catch (cause) {
        error = cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name) ? 'The registry lookup timed out. Please retry.' : 'The registry could not be reached. Please retry.';
      }
    }
    return { domain, available: false, error };
  } catch { return { domain, available: false, error: 'The registry directory could not be loaded. Please retry.' }; }
}
export async function checkAvailabilityForTlds(baseName: string, tlds: string[]): Promise<RdapLookupResult[]> {
  return Promise.all(tlds.map(tld => checkDomainAvailability(`${baseName}${tld}`)));
}
