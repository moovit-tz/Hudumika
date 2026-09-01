import type { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { durationSeconds, type IssuedTokens } from '../services/token.service.js';

/**
 * Session-cookie migration (security checklist #9). Cookies are the new
 * mechanism; the JSON response body's access_token/refresh_token stays
 * exactly as it was — this is a permanent dual-mode, not a transitional
 * shim (see the plan doc's "Design" section on why keeping Bearer-header
 * support is free and doesn't weaken the SPA's own XSS posture).
 */
export const COOKIE_NAMES = {
  access: 'hudumika_access',
  refresh: 'hudumika_refresh',
  csrf: 'hudumika_csrf',
  orgAccess: 'hudumika_org_access',
  orgRefresh: 'hudumika_org_refresh',
  superAccess: 'hudumika_super_access',
  superRefresh: 'hudumika_super_refresh',
  // A Bliss meeting guest's short-lived token (calls.routes.ts's
  // calls-public routes) — a distinct name from `access`, never the same
  // slot, so a guest joining a public meeting link in a browser tab that
  // also holds a real staff session can never clobber it (or vice versa).
  guestAccess: 'hudumika_guest_access',
} as const;

function baseOpts(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.APP_ENV === 'production',
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Sets the primary (or org) session pair plus the CSRF cookie. `Path=/` on
 * every cookie deliberately — authRoutes is mounted at both `/auth` and
 * `/v1/auth` (index.ts), so a narrower path would silently miss one of them.
 * The refresh cookie riding along on non-refresh requests is harmless:
 * middleware/auth.ts already rejects any typ==='refresh' token used as an
 * access credential.
 */
export function setSessionCookies(reply: FastifyReply, tokens: IssuedTokens, opts: { org?: boolean } = {}): void {
  const [accessName, refreshName] = opts.org
    ? [COOKIE_NAMES.orgAccess, COOKIE_NAMES.orgRefresh]
    : [COOKIE_NAMES.access, COOKIE_NAMES.refresh];
  reply.setCookie(accessName, tokens.access_token, baseOpts(tokens.expires_in));
  reply.setCookie(refreshName, tokens.refresh_token, baseOpts(durationSeconds(env.JWT_REFRESH_EXPIRES_IN)));
  // Non-httpOnly by design — the frontend reads this via document.cookie and
  // echoes it back as X-CSRF-Token (double-submit pattern). One shared
  // cookie for both the main and org flows: its only job is proving "this
  // JS could read a cookie we set," not identifying which session is active.
  reply.setCookie(COOKIE_NAMES.csrf, crypto.randomBytes(32).toString('hex'), {
    ...baseOpts(tokens.expires_in),
    httpOnly: false,
  });
}

export function clearSessionCookies(reply: FastifyReply, opts: { org?: boolean } = {}): void {
  const [accessName, refreshName] = opts.org
    ? [COOKIE_NAMES.orgAccess, COOKIE_NAMES.orgRefresh]
    : [COOKIE_NAMES.access, COOKIE_NAMES.refresh];
  const clearOpts = { path: '/' };
  reply.clearCookie(accessName, clearOpts);
  reply.clearCookie(refreshName, clearOpts);
  reply.clearCookie(COOKIE_NAMES.csrf, clearOpts);
}

/**
 * Impersonation cookie-stacking (see the plan doc's "Non-obvious findings"
 * #1). The client can no longer read+stash the current token itself once it's
 * httpOnly, so the server does it: the caller's own current session is
 * copied verbatim into the super_* slot before the primary pair is
 * overwritten with the impersonated session.
 */
export function setSuperCookies(reply: FastifyReply, access: string, refresh: string, accessMaxAge: number): void {
  reply.setCookie(COOKIE_NAMES.superAccess, access, baseOpts(accessMaxAge));
  reply.setCookie(COOKIE_NAMES.superRefresh, refresh, baseOpts(durationSeconds(env.JWT_REFRESH_EXPIRES_IN)));
}

export function clearSuperCookies(reply: FastifyReply): void {
  const clearOpts = { path: '/' };
  reply.clearCookie(COOKIE_NAMES.superAccess, clearOpts);
  reply.clearCookie(COOKIE_NAMES.superRefresh, clearOpts);
}

/** Sets the guest meeting token as its own cookie — httpOnly, but no CSRF
 *  cookie alongside it: nothing under /v1/calls-public goes through
 *  authenticate()'s CSRF check (they're public routes with no preHandler at
 *  all), so there is nothing for one to protect. */
export function setGuestCookie(reply: FastifyReply, token: string, maxAgeSeconds: number): void {
  reply.setCookie(COOKIE_NAMES.guestAccess, token, baseOpts(maxAgeSeconds));
}

export function clearGuestCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.guestAccess, { path: '/' });
}

/**
 * @fastify/jwt's own default token lookup checks the Authorization header —
 * this overrides it to check cookies first, falling back to the header for
 * any non-browser caller (see the plan doc's dual-mode design). Requires
 * @fastify/cookie registered ahead of @fastify/jwt so `request.cookies` is
 * already populated (index.ts).
 *
 * Cookie-priority is exactly why /auth/stop-impersonating cannot trust
 * request.user during an active impersonation — see its own doc comment.
 */
export function extractToken(request: FastifyRequest): string | void {
  const cookies = request.cookies || {};
  if (cookies[COOKIE_NAMES.access]) return cookies[COOKIE_NAMES.access];
  if (cookies[COOKIE_NAMES.orgAccess]) return cookies[COOKIE_NAMES.orgAccess];
  const auth = request.headers.authorization;
  if (auth && /^Bearer\s/i.test(auth)) return auth.slice(7);
  return undefined;
}
