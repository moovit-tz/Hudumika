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
  // RLS hardening (security checklist #4, see db/migrations/241_rls_restricted_roles.sql).
  // DATABASE_URL_APP is the app's real day-to-day connection once cutover
  // happens — ordinary read/write, but not a superuser/BYPASSRLS role, so
  // FORCE ROW LEVEL SECURITY actually constrains it. Dormant until then:
  // client.ts's `db`/`withTenant()` still point at DATABASE_URL (the
  // superuser) until every tenant-scoped query in the app is verified to
  // route through withTenant().
  DATABASE_URL_APP: z.string().url().default('postgresql://hudumika_app:hudumika_app_pass@localhost:5432/clearos'),
  // DATABASE_URL_PLATFORM is a narrow, explicitly-audited BYPASSRLS
  // exception for the small set of confirmed SUPER_ADMIN-gated /
  // genuinely cross-tenant call sites (SuperAdmin console, tenant
  // management & reports, platform settings, lens, reference data, the
  // two pre-tenant auth lookups) — never used by anything handling
  // ordinary tenant traffic.
  DATABASE_URL_PLATFORM: z.string().url().default('postgresql://hudumika_platform:hudumika_platform_pass@localhost:5432/clearos'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  
  JWT_SECRET: z.string().default('change-this-in-production-min-32-characters-long'),
  // The access token's real lifetime. Was '7d' and unused — nothing passed it
  // to sign(), so tokens carried no exp at all. Now that it is honoured and a
  // refresh token exists to renew silently, a week-long access token would
  // throw away the point of having two.
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  // Protects the platform's self-signed PDF-signing certificate at rest
  // (apps/api/uploads/platform/ — see pdf-signing-identity.service.ts).
  // The private key itself, not this password, is what actually produces
  // the signature; this only guards the P12 file if it were copied off
  // the server, same reasoning as every other secret in this file.
  SIGN_CERT_PASSWORD: z.string().default('change-this-in-production-hudumika-sign'),
  // Session-cookie migration (security checklist #9). 'lax' is correct when
  // the frontend and API share a registrable domain (e.g. app.hudumika.tz /
  // api.hudumika.tz) — the expected production topology. Override to 'none'
  // (requires `secure`, which APP_ENV=production already forces) only if a
  // deployment ever puts the frontend on a genuinely unrelated domain.
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

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
  /** The WhatsApp Business Account (WABA) itself — a different Graph API
   *  object than the phone number above, and the one template management
   *  (GET/POST .../message_templates) is scoped to. A placeholder default
   *  the same way every other META_* credential works: template listing/
   *  creation is real once this is set, not before. */
  META_WABA_ID: z.string().default('your-whatsapp-business-account-id'),
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
  // Platform-wide default meeting duration cap (minutes) — the same "Teams
  // free/basic tier" reference the auto-termination job (meeting-duration-
  // limit.job.ts) is built on. A host can raise/lower it per meeting within
  // MEETING_MAX_DURATION_CEILING_MINUTES; there's no per-tenant plan tier to
  // key this off yet, so it's one platform default, not a billing feature.
  MEETING_MAX_DURATION_DEFAULT_MINUTES: z.coerce.number().default(60),
  MEETING_MAX_DURATION_CEILING_MINUTES: z.coerce.number().default(480),
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

  /** This API's own externally-resolvable base URL. Unlike PUBLIC_APP_URL
   *  above (the web app, used for links a person clicks), this is for a
   *  machine-to-machine callback: SAML's Assertion Consumer Service URL and
   *  SP entity ID have to be a stable address an external IdP is configured
   *  in advance to trust and POST back to — there was no existing "what is
   *  my own address" setting to reuse for that. */
  API_BASE_URL: z.string().url().default('http://localhost:3001'),

  /**
   * Drive ("cloud") object storage. Unset → files are stored on the local
   * disk under apps/api/uploads/ (the historical behaviour, fine for a
   * single-node dev box, not for a multi-node or ephemeral-filesystem
   * deployment). Set all of S3_ENDPOINT + S3_BUCKET + S3_ACCESS_KEY_ID +
   * S3_SECRET_ACCESS_KEY → every read/write/delete/signed-URL goes to that
   * S3-compatible bucket instead (AWS S3, MinIO, Cloudflare R2, Backblaze
   * B2, ...). integrations/storage.ts picks the driver from these at boot.
   */
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // MinIO / most self-hosted S3 need path-style (bucket in the path, not the
  // host); real AWS S3 wants virtual-hosted-style. Defaults to path-style
  // since that's the self-hosted case this is most likely to be pointed at.
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  // Public base for presigned GET URLs, if the bucket is fronted by a CDN
  // whose host differs from S3_ENDPOINT. Falls back to S3_ENDPOINT.
  S3_PUBLIC_URL: z.string().url().optional(),

  /**
   * Signs the short-lived download URLs the disk storage driver hands out
   * (GET /v1/files/signed/:key). Falls back to JWT_SECRET when unset — fine,
   * since both are server-only HMAC keys of the same trust level.
   */
  FILE_SIGNING_SECRET: z.string().optional(),

  /**
   * ClamAV daemon for upload malware scanning. Unset → uploads are not
   * scanned (logged once at boot), same "the feature is real once you point
   * it at a real service" convention as SMTP/Meta/etc. Set CLAMAV_HOST
   * (+ optionally CLAMAV_PORT, default 3310) → every Drive upload and new
   * file version is streamed to clamd (INSTREAM) before it is stored, and a
   * positive hit is rejected with 422 and the signature name.
   */
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().default(15000),

  /**
   * Path to a LibreOffice/soffice binary for server-side Office→PDF preview
   * conversion (docx/xlsx/pptx/odt/...). Unset → those types have no inline
   * preview and GET /v1/files/:id/preview returns 415 with a "download to
   * view" hint (the frontend renders that honestly). Set e.g.
   * /usr/bin/soffice → the route converts on demand and caches the PDF.
   */
  SOFFICE_BIN: z.string().optional(),

  AIS_API_KEY: z.string().optional(),

  /**
   * QuickBooks/Xero OAuth app credentials. Unlike mail-oauth (where each
   * tenant registers their own Microsoft/Google app to send-as their own
   * domain), an accounting sync is Hudumika asking for access to a
   * tenant's company — one app registered once with Intuit/Xero, shared
   * across every tenant, exactly how QBO/Xero App Store integrations work.
   * Optional: unset until a real Intuit/Xero developer app exists: the
   * Connect button then reports the integration as not yet configured
   * instead of attempting an OAuth flow with no client id.
   */
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),

  /**
   * Google Sign-In (Ondi M2) — one platform-level OAuth client, unlike
   * mail-oauth's per-tenant Gmail-sync credentials: this is Hudumika asking
   * "who is this person," not a tenant asking to send mail as themself, so
   * one client registered once covers every tenant, same shape as
   * QUICKBOOKS_CLIENT_ID above. Only a client ID is needed — the frontend
   * uses Google Identity Services' implicit ID-token flow, and the backend
   * verifies that token against Google's own tokeninfo endpoint rather than
   * holding a client secret at all. Optional: unset until a real Google
   * Cloud OAuth client exists, same "report not configured" convention.
   */
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),

  /**
   * Microsoft Sign-In (Ondi M2, same shape as Google above) — one
   * platform-level Azure AD app registration ("multitenant + personal
   * Microsoft accounts" account type, authority `common`) covers every
   * tenant. Only a client ID is needed: the frontend runs MSAL's public
   * client (SPA) authorization-code+PKCE flow, which needs no client
   * secret, and the backend verifies the returned id_token itself against
   * Microsoft's own published JWKS (lib/microsoft-oidc.ts) rather than
   * holding a secret. Optional: unset until a real Azure app registration
   * exists, same "report not configured" convention.
   */
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),

  /**
   * Sign in with Apple (Ondi M2, same shape as Google/Microsoft above) — the
   * Services ID (not a Bundle ID) registered for web sign-in, one per
   * platform. Only a client ID is needed: the frontend runs Apple's own JS
   * SDK popup flow, which returns a signed id_token directly (no client
   * secret exchange on our side), and the backend verifies that token
   * against Apple's own published JWKS (lib/apple-oidc.ts) rather than
   * holding a secret. Optional: unset until a real Apple "Sign in with
   * Apple" Services ID exists, same "report not configured" convention.
   */
  APPLE_OAUTH_CLIENT_ID: z.string().optional(),
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
  ['DATABASE_URL_APP', 'postgresql://hudumika_app:hudumika_app_pass@localhost:5432/clearos',
   'the app\'s restricted read-write role would be reachable with a published password'],
  ['DATABASE_URL_PLATFORM', 'postgresql://hudumika_platform:hudumika_platform_pass@localhost:5432/clearos',
   'the BYPASSRLS platform role would be reachable with a published password — it can read and write across every tenant'],
  ['ONSITE_SECRETS_KEY', '6f6e73697465646576656c6f706d656e746b65796e6f74666f7270726f6475637469'.slice(0, 64),
   'every Onsite environment variable, CI token and cloud credential could be decrypted from this repository'],
  ['SIGN_CERT_PASSWORD', 'change-this-in-production-hudumika-sign',
   'the platform PDF-signing private key file would be readable by anyone holding this repository and a copy of apps/api/uploads/platform/'],
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
