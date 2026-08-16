import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

/**
 * Access and refresh tokens, issued as a pair.
 *
 * What was here before: `fastify.jwt.sign(payload)` with no expiry, returned as
 * both the access token and the "refresh token" — literally the same string,
 * marked `// simplified for dev` — beside a response claiming
 * `expires_in: 7 days`. The token had no `exp` claim at all, so it was valid
 * forever and the number was decoration.
 *
 * The shape now:
 *
 *   access   short-lived, carries the identity claims, expires. Losing one
 *            costs an hour, not a career.
 *   refresh  long-lived, carries almost nothing — enough to say who and which
 *            device — and is only accepted by POST /auth/refresh.
 *
 * `typ` is what keeps them apart, and it is checked in both directions: the
 * auth middleware refuses a refresh token for ordinary API calls, and /refresh
 * refuses an access token. Without that, a leaked long-lived refresh token
 * would simply be a long-lived access token and the split would buy nothing.
 *
 * Both carry `device_id`, and that is deliberate: revocation in this codebase
 * is `hr_devices.revoked_at`, re-checked on every request. Signing out a device
 * must kill the refresh token too, or the session comes straight back.
 */

export interface AccessClaims {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
  name: string;
  device_id: string;
  // See JWTPayload.impersonated_by in @hudumika/types — optional, set only
  // for an impersonation-issued session.
  impersonated_by?: string;
  impersonated_by_name?: string;
}

/** Seconds in a duration like '15m', '1h', '30d'. Used for `expires_in`. */
export function durationSeconds(spec: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(spec.trim());
  if (!m) return 3600;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd']);
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function issueTokens(fastify: FastifyInstance, claims: AccessClaims): IssuedTokens {
  // `as any`: JWTPayload in @hudumika/types does not declare `typ`, and adding
  // it there would ripple through every consumer of that shared type for a
  // claim only these two functions and the auth middleware read.
  const access = fastify.jwt.sign({ ...claims, typ: 'access' } as any, { expiresIn: env.JWT_EXPIRES_IN });
  const refresh = fastify.jwt.sign(
    {
      sub: claims.sub, tenant_id: claims.tenant_id, device_id: claims.device_id, typ: 'refresh',
      ...(claims.impersonated_by ? { impersonated_by: claims.impersonated_by, impersonated_by_name: claims.impersonated_by_name } : {}),
    } as any,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  );
  return {
    access_token: access,
    refresh_token: refresh,
    // The real lifetime of the access token, not a number typed beside it.
    expires_in: durationSeconds(env.JWT_EXPIRES_IN),
  };
}
