import type { FastifyRequest, FastifyReply } from 'fastify';
import { COOKIE_NAMES } from '../lib/cookies.js';

/**
 * Double-submit-cookie CSRF check (security checklist #9's cookie migration
 * reopens CSRF, which the previous Bearer-header-only model was naturally
 * immune to). `hudumika_csrf` is deliberately non-httpOnly — the frontend
 * reads it via document.cookie and echoes it back as X-CSRF-Token on every
 * mutating request. A cross-site attacker's forged request can neither read
 * that cookie (same-origin policy) nor set a custom header on a plain form
 * POST, so a matching header proves the request originated from JS that
 * could actually read this origin's cookies.
 *
 * `usedCookie` is supplied by the caller rather than inferred here, because
 * "was this request's credential ambient (cookie) or explicit (header/body)"
 * means something different depending on which auth path called this:
 * middleware/auth.ts's shared decorator has an Authorization header to check;
 * /auth/refresh has no header at all, only a body-vs-cookie refresh token.
 * Either way, an explicit (non-ambient) credential was never CSRF-able in
 * the first place — a forged cross-site request can't read/attach it — so
 * this check is skipped entirely rather than incorrectly demanding a header
 * from a caller (a partner API client, say) that never had one to send.
 */
export function verifyCsrf(request: FastifyRequest, reply: FastifyReply, usedCookie: boolean): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  if (!usedCookie) return true;

  const header = request.headers['x-csrf-token'];
  const cookie = request.cookies?.[COOKIE_NAMES.csrf];
  if (!header || !cookie || header !== cookie) {
    reply.status(403).send({ error: 'Missing or invalid CSRF token' });
    return false;
  }
  return true;
}
