/**
 * Onsite RDAP availability lookup.
 *
 * /domains/search-lookup used to answer `available: true` for every query,
 * regardless of whether the domain was actually taken — no registrar or
 * WHOIS/RDAP call was ever made. This is the real check: RDAP (RFC 7482+) is
 * the IANA-standardized, free, no-API-key successor to WHOIS, and rdap.org
 * is IANA's own public bootstrap redirector — it resolves a domain to
 * whichever registry actually holds it (Verisign for .com, tzNIC for .tz,
 * etc.) and forwards the request. A 200 means the registry has a record for
 * the name (registered); a 404 means it doesn't (available). Verified live
 * against rdap.org for example.com (200), hudumika.tz (200, via tzNIC's own
 * RDAP server) and a made-up name (404) before wiring this in.
 *
 * A convenience gateway, not the only source of truth — worth hardening to
 * query the IANA bootstrap registry + each registry's RDAP server directly
 * if this sees real purchase volume later, but real and live beats the
 * hardcoded `available: true` this replaces.
 */

export interface RdapLookupResult {
  domain: string;
  available: boolean;
  /** Set when the lookup itself failed (network/timeout) — distinct from a
   *  successful lookup that found the domain unregistered. */
  error: string | null;
}

const RDAP_TIMEOUT_MS = 6000;

export async function checkDomainAvailability(domain: string): Promise<RdapLookupResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: controller.signal,
    });
    if (res.status === 404) return { domain, available: true, error: null };
    if (res.ok) return { domain, available: false, error: null };
    // Neither a clean "registered" nor "not found" — the lookup didn't
    // actually answer the question, so this must not be reported as
    // available (the opposite mistake to the one being fixed here).
    return { domain, available: false, error: `RDAP lookup returned HTTP ${res.status}` };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      domain, available: false,
      error: aborted ? `RDAP lookup timed out after ${RDAP_TIMEOUT_MS}ms` : `RDAP lookup failed: ${err?.message ?? err}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Looks up every TLD candidate for a base name in parallel — one query per
 *  TLD, since RDAP has no batch/multi-name endpoint. */
export async function checkAvailabilityForTlds(baseName: string, tlds: string[]): Promise<RdapLookupResult[]> {
  return Promise.all(tlds.map(tld => checkDomainAvailability(`${baseName}${tld}`)));
}
