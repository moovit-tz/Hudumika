import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Thrown by assertPublicHttpUrl — always a clean, user-facing message (never
 * a raw DNS/network error), since every call site surfaces it directly to
 * whoever configured the offending URL.
 */
export class UnsafeUrlError extends Error {}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — includes AWS/GCP/Azure metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments / benchmarking ranges
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

/**
 * Guards every "fetch a URL a tenant configured" integration (Onsite uptime
 * monitors, workflow webhook actions, GPSWOX's base_url, marketplace app
 * webhooks) against SSRF: a tenant pointing the feature at the server's own
 * private network — cloud metadata services (169.254.169.254), localhost, or
 * an internal service with no auth of its own — instead of a real external
 * endpoint. Resolves the hostname itself (a literal IP is checked directly)
 * and rejects if *any* resolved address is private, rather than trusting
 * whatever the caller typed.
 *
 * Known gap, not fixed here: this checks the URL once, up front. A `fetch`
 * with `redirect: 'follow'` will still transparently follow a 3xx from an
 * initially-public host to a private one afterward — closing that requires
 * `redirect: 'manual'` plus validating every hop, which no caller of this
 * guard currently does. Every current call site's target rarely if ever
 * redirects in normal operation, so this closes the direct attack (typing a
 * private URL straight in) without yet closing the redirect-chain bypass.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('That is not a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http:// and https:// URLs are allowed.');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 URL brackets
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new UnsafeUrlError('URLs pointing at localhost are not allowed.');
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeUrlError('URLs pointing at a private or internal address are not allowed.');
    }
    return;
  }
  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map(a => a.address);
  } catch {
    throw new UnsafeUrlError(`Could not resolve "${hostname}".`);
  }
  if (addresses.some(isPrivateIp)) {
    throw new UnsafeUrlError('This hostname resolves to a private or internal address and cannot be used.');
  }
}
