import { dbPlatform } from '../db/client.js';

/**
 * SuperAdmin ▸ Settings ▸ Security & Sessions / API & Webhooks
 * (apps/web/src/pages/SuperAdmin.tsx's SettingsView) used to save these
 * fields to tenant_settings.settings under the platform pseudo-tenant and
 * nothing ever read them back — every field was decorative. This is the one
 * place every enforcement point (password policy, session timeout, login
 * lockout, 2FA policy, IP allowlist, CORS, rate limiting) reads them from,
 * so a save from that screen takes effect everywhere at once.
 *
 * Cached briefly: these settings change rarely (a SuperAdmin editing a form)
 * but are read on the hot path of every login and, for the IP
 * allowlist/rate-limit checks, every authenticated request — a full DB round
 * trip per request would be a real cost for no benefit. invalidate() is
 * called the moment SuperAdmin actually saves, so a change is never stale
 * for longer than one in-flight request.
 */
const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const CACHE_MS = 30_000;

let cache: { at: number; settings: Record<string, any> } | null = null;

async function readRaw(): Promise<Record<string, any>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.settings;
  const row = await dbPlatform.selectFrom('tenant_settings').select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  cache = { at: Date.now(), settings };
  return settings;
}

/** Call right after POST /v1/superadmin/settings writes a new value, so the
 *  very next request sees it instead of waiting out the cache window. */
export function invalidatePlatformSettingsCache(): void {
  cache = null;
}

function splitList(value: unknown): string[] {
  return String(value ?? '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}

export interface PlatformSecuritySettings {
  minPasswordLength: number;
  /** Hours; 0 = no platform-wide default (a tenant's own sessionPolicy, if any, still applies). */
  sessionTimeoutHours: number;
  /** 0 = lockout disabled — the untouched default enforces nothing, same as every other unconfigured policy in this codebase. */
  maxLoginAttempts: number;
  lockoutMinutes: number;
  twoFaPolicy: 'off' | 'optional' | 'required';
  /** CIDR entries (e.g. "196.0.0.0/8") or bare IPs (treated as /32). Empty = no restriction. */
  ipAllowlist: string[];
}

export async function getPlatformSecuritySettings(): Promise<PlatformSecuritySettings> {
  const s = (await readRaw()).security || {};
  const twoFaPolicy = s.twoFaPolicy === 'required' || s.twoFaPolicy === 'off' ? s.twoFaPolicy : 'optional';
  return {
    minPasswordLength: Math.max(0, Number(s.minPasswordLength) || 0),
    sessionTimeoutHours: Math.max(0, Number(s.sessionTimeoutHours) || 0),
    maxLoginAttempts: Math.max(0, Number(s.maxLoginAttempts) || 0),
    lockoutMinutes: Math.max(1, Number(s.lockoutMinutes) || 15),
    twoFaPolicy,
    ipAllowlist: splitList(s.ipAllowlist),
  };
}

export interface PlatformApiSettings {
  /** requests/minute for a normal session; 0 = use the built-in default. */
  rateLimit: number;
  /** Extra trusted origins layered on top of env.CORS_ORIGINS — never a replacement for it, so a bad value here can't lock the SPA out of its own API. */
  corsOrigins: string[];
}

export async function getPlatformApiSettings(): Promise<PlatformApiSettings> {
  const s = (await readRaw()).api || {};
  return {
    rateLimit: Math.max(0, Number(s.rateLimit) || 0),
    corsOrigins: splitList(s.corsOrigins).filter(o => o !== '*'),
  };
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

/**
 * Matches the CIDR notation the settings UI itself documents ("Comma-
 * separated CIDRs", placeholder "196.0.0.0/8, 10.0.0.1"). IPv4 only — this
 * platform's IPs are IPv4 in practice, and a wrong hand-rolled IPv6 CIDR
 * implementation is worse than not having one. A bare address (no /prefix)
 * is treated as /32 — an exact match — and a non-IPv4 entry (or an IP that
 * doesn't parse, e.g. a raw IPv6 address behind some proxy configs) falls
 * back to an exact string comparison rather than silently matching nothing.
 */
export function ipMatchesAllowlist(ip: string, allowlist: string[]): boolean {
  const ipInt = ipv4ToInt(ip);
  return allowlist.some(entry => {
    const [base, prefixStr] = entry.split('/');
    const baseInt = ipv4ToInt(base);
    if (baseInt === null || ipInt === null) return ip === entry;
    const prefix = prefixStr !== undefined ? Number(prefixStr) : 32;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return ip === entry;
    const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}
