/**
 * Onsite DNS Probe Service
 *
 * Checks DNS propagation by querying Cloudflare DNS-over-HTTPS and
 * Google DNS-over-HTTPS. No external npm dependencies — uses the
 * Node.js built-in fetch (available from Node 18+).
 *
 * Returns per-resolver propagation results so the UI can show
 * "Google DNS ✓ / Cloudflare ✓ / ISP resolver Pending" style output.
 */

export interface DnsPropagationResult {
  resolver: string;
  resolver_url: string;
  expected: string;
  actual: string | null;
  propagated: boolean;
  error: string | null;
}

const RESOLVERS = [
  {
    name: 'Cloudflare',
    url: (name: string, type: string) =>
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  },
  {
    name: 'Google',
    url: (name: string, type: string) =>
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  },
];

interface DoHAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DoHResponse {
  Status: number;  // 0 = NOERROR
  Answer?: DoHAnswer[];
}

/**
 * Query a DNS-over-HTTPS resolver for a specific record.
 * Returns the first answer's data, or null if no answer / error.
 */
async function queryDoH(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json() as DoHResponse;
    if (data.Status !== 0 || !data.Answer?.length) return null;
    return data.Answer[0].data;
  } catch {
    return null;
  }
}

/**
 * Check DNS propagation for a given name/type/expected-value combination.
 *
 * @param name     DNS name to check (e.g. "example.com" or "www.example.com")
 * @param type     Record type (e.g. "A", "TXT", "CNAME")
 * @param expected Expected value (e.g. "203.0.113.10")
 */
export async function checkDnsPropagation(
  name: string,
  type: string,
  expected: string,
): Promise<DnsPropagationResult[]> {
  const results = await Promise.all(
    RESOLVERS.map(async (resolver) => {
      const url = resolver.url(name, type);
      let actual: string | null = null;
      let error: string | null = null;
      try {
        actual = await queryDoH(url);
      } catch (e: any) {
        error = e?.message ?? 'Unknown error';
      }
      const propagated = actual !== null && normalise(actual) === normalise(expected);
      return {
        resolver: resolver.name,
        resolver_url: url,
        expected,
        actual,
        propagated,
        error,
      };
    }),
  );
  return results;
}

/** Normalise DNS values for loose comparison (trim whitespace, lowercase). */
function normalise(v: string): string {
  return v.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Verify a TXT record for domain ownership.
 * Returns true if any resolver can see the expected TXT value.
 */
export async function verifyTxtRecord(
  domain: string,
  expectedValue: string,
): Promise<boolean> {
  const results = await checkDnsPropagation(domain, 'TXT', expectedValue);
  return results.some((r) => r.propagated);
}
