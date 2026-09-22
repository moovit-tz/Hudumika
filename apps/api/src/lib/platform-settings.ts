import { dbPlatform } from '../db/client.js';
import { decryptSecret, encryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';
import { AI_PROVIDER_CONFIG, AI_PROVIDERS, detectAiProvider, type AiProvider } from './ai-providers.js';
import { isByokAllowed, hasAiCreditsRemaining, debitAiCredit } from './ai-credits.js';

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

/**
 * SuperAdmin ▸ Settings ▸ AI (agentic platform, milestone 0). Every AI
 * feature (ai.routes.ts) today is dead until a tenant pastes their own
 * provider key into Settings ▸ Integrations ▸ AI (`tenant_settings.
 * settings['int-ai']`) — this is the platform-operator fallback, so a
 * tenant that never configures one still gets a working agent.
 *
 * The key itself can come from either of two places, checked in this
 * order: a SuperAdmin can enter one directly (SuperAdmin ▸ Settings ▸ AI),
 * encrypted at rest via encryptSecret/decryptSecret — the exact same
 * round-trip-safe convention superadmin.routes.ts already uses for the
 * platform SMTP password (masked on GET, "still masked = unchanged" on
 * POST) — or an operator can set PLATFORM_AI_API_KEY in the environment,
 * next to JWT_SECRET/DATABASE_URL, if they'd rather not have it in the
 * database at all. Either way `enabled` must still be turned on
 * deliberately; a key being present configures nothing by itself.
 * getPlatformAiSettings() never returns the raw key — only
 * resolveAiCredentials() below reads and decrypts it, for the same
 * least-exposure reason this file never returns a session secret either.
 */
/**
 * Stored shape of the platform AI settings (SuperAdmin ▸ Platform Settings ▸
 * AI Provider):
 *   ai: { enabled, provider (the DEFAULT provider), model, providers: {
 *          <provider>: { apiKey (encrypted at rest), model } } }
 * A key per provider, so a SuperAdmin can keep Anthropic, Groq and Gemini
 * all configured and switch the default without re-typing anything. The
 * older single-key shape (ai.apiKey belonging to ai.provider) is still read
 * — normalizeAiSettings folds it in — so nothing stored needs a migration.
 */
export interface PlatformAiProviderEntry { apiKey?: string; model?: string }
export interface NormalizedAiSettings {
  enabled: boolean;
  provider?: string;
  model?: string;
  providers: Partial<Record<AiProvider, PlatformAiProviderEntry>>;
}

const isProvider = (p: unknown): p is AiProvider => typeof p === 'string' && (AI_PROVIDERS as readonly string[]).includes(p);

export function normalizeAiSettings(raw: any): NormalizedAiSettings {
  const src = raw && typeof raw === 'object' ? raw : {};
  const providers: Partial<Record<AiProvider, PlatformAiProviderEntry>> = {};
  for (const [name, entry] of Object.entries(src.providers ?? {})) {
    if (isProvider(name) && entry && typeof entry === 'object') providers[name] = { ...(entry as PlatformAiProviderEntry) };
  }
  // Legacy single key: belongs to the provider named beside it (or implied by the model).
  if (typeof src.apiKey === 'string' && src.apiKey) {
    const legacyProvider = detectAiProvider(typeof src.provider === 'string' ? src.provider : undefined, typeof src.model === 'string' ? src.model : '');
    if (!providers[legacyProvider]?.apiKey) {
      providers[legacyProvider] = { ...providers[legacyProvider], apiKey: src.apiKey, model: providers[legacyProvider]?.model ?? (typeof src.model === 'string' ? src.model : undefined) };
    }
  }
  return {
    enabled: src.enabled === true,
    provider: typeof src.provider === 'string' ? src.provider : undefined,
    model: typeof src.model === 'string' ? src.model : undefined,
    providers,
  };
}

/** What the settings screen receives: every stored key replaced by the mask
 *  (the legacy top-level key is folded under its provider and removed), so a
 *  key never leaves the server once saved. */
export function maskAiForClient(raw: any): Record<string, unknown> {
  const n = normalizeAiSettings(raw);
  const providers: Record<string, { apiKey: string; model?: string }> = {};
  for (const [name, entry] of Object.entries(n.providers)) {
    providers[name] = { apiKey: entry?.apiKey ? MASKED_VALUE : '', ...(entry?.model ? { model: entry.model } : {}) };
  }
  return { enabled: n.enabled, ...(n.provider ? { provider: n.provider } : {}), ...(n.model ? { model: n.model } : {}), providers };
}

/** Turns what the settings screen posted into what gets stored: a still-masked
 *  key means "unchanged" (the real stored key is kept, including one that
 *  lived in the legacy field), a newly typed key is encrypted, an empty key
 *  removes that provider's key. An old client posting the single-key shape is
 *  treated as a key for its own provider. */
export function mergeAiForSave(body: any, existing: any): Record<string, unknown> {
  const posted = normalizeAiSettings(body);
  const before = normalizeAiSettings(existing);
  const providers: Record<string, PlatformAiProviderEntry> = {};
  for (const [name, entry] of Object.entries(posted.providers) as [AiProvider, PlatformAiProviderEntry][]) {
    const typed = entry.apiKey;
    let apiKey: string | undefined;
    if (typed === MASKED_VALUE) apiKey = before.providers[name]?.apiKey;
    else if (typed) apiKey = encryptSecret(typed);
    const model = entry.model?.trim();
    if (apiKey || model) providers[name] = { ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}) };
  }
  const provider = posted.provider;
  const activeProvider = detectAiProvider(provider, posted.model ?? '');
  return {
    enabled: posted.enabled,
    ...(provider ? { provider } : {}),
    ...((providers[activeProvider]?.model ?? posted.model) ? { model: providers[activeProvider]?.model ?? posted.model } : {}),
    providers,
  };
}

export interface PlatformAiSettings {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  /** True once either a stored (encrypted) key or the env var is present — lets a settings UI show "configured" without ever seeing the key. */
  hasKey: boolean;
  /** Providers that have a key stored — the SuperAdmin screen's "Configured" badges; never the keys. */
  configuredProviders: AiProvider[];
}

export async function getPlatformAiSettings(): Promise<PlatformAiSettings> {
  const s = normalizeAiSettings((await readRaw()).ai);
  const envProvider = process.env.PLATFORM_AI_PROVIDER;
  const provider = detectAiProvider(s.provider ?? envProvider, s.model ?? '');
  const entry = s.providers[provider];
  const hasKey = !!entry?.apiKey || !!process.env.PLATFORM_AI_API_KEY;
  return {
    // Off by default even with a key present — a SuperAdmin turns this on
    // deliberately, the same "untouched default enforces/does nothing"
    // convention every other platform setting here follows (see
    // PlatformSecuritySettings' twoFaPolicy/lockout above).
    enabled: s.enabled && hasKey,
    provider,
    model: entry?.model?.trim()
      || (s.model?.trim() && detectAiProvider(s.provider, s.model) === provider ? s.model.trim() : '')
      || process.env.PLATFORM_AI_MODEL?.trim()
      || AI_PROVIDER_CONFIG[provider].defaultModel,
    hasKey,
    configuredProviders: (Object.keys(s.providers) as AiProvider[]).filter(p => !!s.providers[p]?.apiKey),
  };
}

/**
 * Resolves which provider credentials an AI call should use for this
 * tenant. The tenant's own configured key wins — but only on a plan tier
 * that allows bringing one at all (packages.byok_ai_allowed, migration
 * 489; today just the "Hudu Advanced" tier). Every other tenant draws
 * against their plan's monthly AI-credits allowance, billed to the
 * platform (apps/api/src/lib/ai-credits.ts); once that's exhausted for the
 * calendar month, this returns null the same as "not configured" — callers
 * should show describeAiUnavailable(tenantId) rather than a hardcoded
 * string, since the real reason now differs (off vs. out of credits).
 * A successful platform-billed resolution eagerly debits one credit here —
 * the provider bills for the attempt regardless of the app-level outcome,
 * so this is the one place every AI call site (ai.routes.ts,
 * agent.routes.ts) gets metered/blocked without each needing its own logic.
 *
 * `role` mirrors checkUsageLimit()'s own SUPER_ADMIN bypass (usage.ts) — a
 * platform admin exercising AI features isn't "a tenant using their
 * monthly allowance," the same reasoning that already exempts them from
 * the platform-wide item-count quota.
 */
export async function resolveAiCredentials(tenantId: string, tenantAiConfig: { on?: boolean; apiKey?: string; model?: string; provider?: string } | undefined | null, role?: string):
  Promise<{ apiKey: string; model: string; provider: string; billedToPlatform: boolean } | null> {
  const isSuperAdmin = role === 'SUPER_ADMIN';
  if (tenantAiConfig?.on && tenantAiConfig.apiKey && (isSuperAdmin || await isByokAllowed(tenantId))) {
    const model = tenantAiConfig.model || 'claude-sonnet-5';
    return {
      apiKey: tenantAiConfig.apiKey,
      model,
      provider: detectAiProvider(tenantAiConfig.provider, model),
      billedToPlatform: false,
    };
  }
  const platform = await getPlatformAiSettings();
  if (!platform.enabled) return null;
  if (!isSuperAdmin && !(await hasAiCreditsRemaining(tenantId))) return null;
  // A stored key wins over the env var when both exist — it's the one a
  // SuperAdmin most recently and deliberately set via the settings screen.
  const stored = normalizeAiSettings((await readRaw()).ai).providers[platform.provider]?.apiKey;
  const apiKey = stored ? decryptSecret(stored) : process.env.PLATFORM_AI_API_KEY!;
  if (!isSuperAdmin) await debitAiCredit(tenantId, null, 'Platform-billed AI call');
  return {
    apiKey,
    model: platform.model,
    provider: platform.provider,
    billedToPlatform: true,
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

/** The decrypted platform key for one provider (server-side only — used by the
 *  SuperAdmin "Test" button). A key stored for that provider wins; the
 *  PLATFORM_AI_API_KEY env var only counts for the provider it is meant for. */
export async function getPlatformProviderKey(provider: AiProvider): Promise<string | null> {
  const stored = normalizeAiSettings((await readRaw()).ai).providers[provider]?.apiKey;
  if (stored) return decryptSecret(stored);
  const envKey = process.env.PLATFORM_AI_API_KEY;
  if (envKey && detectAiProvider(process.env.PLATFORM_AI_PROVIDER, process.env.PLATFORM_AI_MODEL ?? '') === provider) return envKey;
  return null;
}
