import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from root directory if it exists
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
// Also try local directory .env
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://clearos:clearos_pass@localhost:5432/clearos'),
  // Dedicated read-only role for the Query Builder's raw-SQL mode (see
  // db/migrations/084_readonly_role.sql) — the real backstop against writes,
  // not just the application-layer keyword checks. Rotate this for any
  // non-local deployment rather than relying on the migration's dev default.
  DATABASE_URL_READONLY: z.string().url().default('postgresql://hudumika_readonly:hudumika_readonly_pass@localhost:5432/clearos'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  
  JWT_SECRET: z.string().default('change-this-in-production-min-32-characters-long'),
  // The access token's real lifetime. Was '7d' and unused — nothing passed it
  // to sign(), so tokens carried no exp at all. Now that it is honoured and a
  // refresh token exists to renew silently, a week-long access token would
  // throw away the point of having two.
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  /**
   * Encrypts Onsite's stored credentials — environment secrets, CI tokens,
   * cloud provider keys (ONSITE.md §25, §66).
   *
   * onsite-secrets.service.ts required this and nothing declared it, so it was
   * absent everywhere: every attempt to save an environment variable or connect
   * a provider threw out of getKey() and surfaced as a 500. The feature could
   * not be used at all.
   *
   * The default is a development key and is listed in PUBLISHED_DEFAULTS below,
   * so production refuses to boot with it — the same treatment as JWT_SECRET,
   * and for the same reason: this one decrypts every infrastructure credential
   * a tenant has entrusted to the platform.
   */
  ONSITE_SECRETS_KEY: z.string().length(64, 'ONSITE_SECRETS_KEY must be 64 hex characters (32 bytes)')
    .default('6f6e73697465646576656c6f706d656e746b65796e6f74666f7270726f6475637469'.slice(0, 64)),
  
  META_WA_TOKEN: z.string().default('your-meta-whatsapp-token'),
  META_PHONE_NUMBER_ID: z.string().default('your-phone-number-id'),
  META_VERIFY_TOKEN: z.string().default('your-webhook-verify-token'),
  META_API_VERSION: z.string().default('v21.0'),
  /** Meta app secret used to verify the X-Hub-Signature-256 HMAC on inbound
   *  WhatsApp webhook deliveries. Optional: unset in dev/until a real Meta
   *  app is configured, in which case the signature check is skipped rather
   *  than rejecting every webhook against a secret that doesn't exist yet. */
  META_APP_SECRET: z.string().optional(),
  /** Shared secret GPSWOX must send back (as ?token=) on every webhook call —
   *  GPSWOX has no HMAC-signature scheme of its own, so this is the simplest
   *  proof the request actually came from the configured GPSWOX account and
   *  not an internet client that guessed a real vehicle IMEI. Optional for
   *  the same reason as META_APP_SECRET above. */
  GPSWOX_WEBHOOK_SECRET: z.string().optional(),
  
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default('your-email@domain.com'),
  SMTP_PASS: z.string().default('your-app-password'),
  SMTP_FROM: z.string().default('ClearOS <noreply@clearos.co>'),
  
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /** Public origin of the web app, used to build links that leave the system
   *  — currently the QR code printed on landed-cost estimates. Deliberately
   *  NOT derived from a request Host header: a spoofed header would mint QR
   *  codes pointing elsewhere, and these are printed on paper, so a wrong
   *  link can't be recalled. Leave unset and it falls back to the first
   *  CORS origin, which is already the frontend URL in every deployment. */
  PUBLIC_APP_URL: z.string().url().optional(),

  OPS_BOARD_URL: z.string().url().default('http://localhost:5173'),
  
  AIS_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;

/**
 * Refuse to start in production on a credential that is published in this
 * repository.
 *
 * JWT_SECRET, the read-only database password and the seeded app password all
 * carry working defaults so a developer can clone and run. Each of those
 * defaults is also public: anyone holding this source can mint a token for any
 * user in any tenant — SUPER_ADMIN included — without a password, and nothing
 * downstream can tell it from a real sign-in. Token expiry does not help,
 * because whoever can forge one can forge a fresh one.
 *
 * These are checked at boot rather than at first use so the failure is a
 * refusal to start, not a breach discovered later. Development and test are
 * untouched — the defaults exist for them.
 */
const PUBLISHED_DEFAULTS: [key: string, value: string, why: string][] = [
  ['JWT_SECRET', 'change-this-in-production-min-32-characters-long',
   'anyone with this repository could sign a valid token for any user in any tenant'],
  ['DATABASE_URL', 'postgresql://clearos:clearos_pass@localhost:5432/clearos',
   'the primary read-write database would be reachable with a published password — a strictly bigger exposure than the read-only role below'],
  ['DATABASE_URL_READONLY', 'postgresql://hudumika_readonly:hudumika_readonly_pass@localhost:5432/clearos',
   'the Query Builder\'s raw-SQL role would be reachable with a published password'],
  ['ONSITE_SECRETS_KEY', '6f6e73697465646576656c6f706d656e746b65796e6f74666f7270726f6475637469'.slice(0, 64),
   'every Onsite environment variable, CI token and cloud credential could be decrypted from this repository'],
];

if (env.APP_ENV === 'production') {
  const offenders = PUBLISHED_DEFAULTS
    .filter(([key, value]) => (env as Record<string, unknown>)[key] === value)
    .map(([key, , why]) => `  ${key} is still the default committed to this repository — ${why}.`);

  if (offenders.length) {
    console.error('❌ Refusing to start in production with published credentials:\n' + offenders.join('\n'));
    console.error('\nSet real values for these before deploying.');
    process.exit(1);
  }
}
