import crypto from 'crypto';
import { withTenant } from '../db/client.js';

/**
 * Tenant-configurable password policy — Ondi ▸ Policies, alongside the
 * session-timeout / MFA-required fields that already lived at
 * tenant_settings.settings.sessionPolicy. Every field defaults to "off" so
 * an unconfigured tenant behaves exactly as before this existed (min 8
 * chars, the zod schema's own floor, nothing else required).
 */
export interface PasswordPolicy {
  minLength: number;
  requireMixedCase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  checkBreached: boolean;
  /** null = no rotation reminder. */
  maxAgeDays: number | null;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireMixedCase: false,
  requireNumber: false,
  requireSymbol: false,
  checkBreached: false,
  maxAgeDays: null,
};

export async function getPasswordPolicy(tenantId: string): Promise<PasswordPolicy> {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { ...DEFAULT_PASSWORD_POLICY, ...(settings?.passwordPolicy ?? {}) };
  });
}

/** Local, synchronous checks only — length and character classes. Never
 *  the breach check, which is async and network-dependent (see below). */
export function validatePasswordComplexity(password: string, policy: PasswordPolicy): { ok: true } | { ok: false; reason: string } {
  if (password.length < policy.minLength) {
    return { ok: false, reason: `Password must be at least ${policy.minLength} characters.` };
  }
  if (policy.requireMixedCase && !(/[a-z]/.test(password) && /[A-Z]/.test(password))) {
    return { ok: false, reason: 'Password must include both uppercase and lowercase letters.' };
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    return { ok: false, reason: 'Password must include at least one number.' };
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, reason: 'Password must include at least one symbol.' };
  }
  return { ok: true };
}

/**
 * Have I Been Pwned's k-anonymity range API — a real, free, public,
 * no-auth-needed service (the actual password never leaves this server;
 * only the first 5 hex chars of its SHA-1 go out, and the full match
 * happens locally against the returned suffix list). Fails OPEN: a
 * third-party outage must never be able to block someone from setting a
 * password, so any network/parse error is treated as "not checked," not
 * "breached" or "clean."
 */
export async function isPasswordBreached(password: string): Promise<boolean | null> {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Hudumika-PasswordPolicy' },
    });
    if (!res.ok) return null;
    const body = await res.text();
    return body.split('\n').some(line => line.split(':')[0].trim() === suffix);
  } catch {
    return null;
  }
}

/** The one call site every password-set route should use — local checks
 *  first (cheap, always enforced when configured), breach check last (only
 *  attempted when the policy asks for it, and never fatal on its own). */
export async function enforcePasswordPolicy(tenantId: string, password: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const policy = await getPasswordPolicy(tenantId);
  const local = validatePasswordComplexity(password, policy);
  if (!local.ok) return local;
  if (policy.checkBreached) {
    const breached = await isPasswordBreached(password);
    if (breached === true) {
      return { ok: false, reason: 'This password has appeared in a known data breach. Choose a different one.' };
    }
  }
  return { ok: true };
}
