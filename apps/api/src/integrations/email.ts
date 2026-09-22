import { env } from '../config/env.js';
import nodemailer from 'nodemailer';
import { dbPlatform, withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/** The platform-level SMTP config a SuperAdmin saves at Platform Settings ▸
 *  Email/SMTP (superadmin.routes.ts) — the real source for this system-
 *  default fallback, checked before env.SMTP_* so a SuperAdmin's saved
 *  credentials actually take effect instead of silently being unread. */
async function getPlatformSmtpConfig(): Promise<{ host: string; port?: string | number; user: string; pass: string; tls?: boolean; from?: string } | null> {
  const row = await dbPlatform.selectFrom('tenant_settings').select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
  if (!row) return null;
  const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
  const smtp = settings?.smtp;
  if (!smtp?.host || !smtp?.pass) return null;
  return { ...smtp, pass: decryptIfEncrypted(smtp.pass) };
}

/**
 * Builds a plain SMTP nodemailer transporter from a host/port/user/pass/enc
 * config — the one implementation POST /v1/settings/email/test and
 * EmailIntegration.sendEmail's smtp branch both use, instead of the two
 * separately-maintained copies that used to exist (settings.routes.ts had
 * its own, missing the connectionTimeout/socketTimeout this one carries —
 * without them a bad host could hang the SMTP send indefinitely).
 */
export function buildSmtpTransporter(config: { host: string; port?: string | number; user?: string; pass?: string; enc?: string }): nodemailer.Transporter {
  const port = Number(config.port) || (config.enc === 'ssl' ? 465 : 587);
  const secure = config.enc === 'ssl';
  const requireTLS = !secure && config.enc === 'tls';
  return nodemailer.createTransport({
    host: config.host,
    port,
    secure,
    requireTLS,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: false },
  } as any);
}

/** onsite-secrets.service's ciphertext format is "<iv_hex>:<authTag_hex>:
 *  <cipher_hex>" — three hex segments. Anything else is legacy plaintext
 *  saved before pass was encrypted at rest; returned as-is rather than
 *  thrown on, so an existing tenant's SMTP config doesn't break the moment
 *  this ships. */
function decryptIfEncrypted(value: string | undefined): string | undefined {
  if (!value) return value;
  const parts = value.split(':');
  const looksEncrypted = parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
  if (!looksEncrypted) return value;
  try { return decryptSecret(value); } catch { return value; }
}

/** nodemailer's OAuth2 auth type auto-refreshes the access token from the
 *  refresh token when it's expired, but only holds the new one in memory —
 *  it never persists it anywhere. Without this, every send after the first
 *  access-token expiry (~1hr) re-refreshes needlessly instead of reusing a
 *  still-valid token mail-oauth.routes.ts already stored. */
async function persistRefreshedToken(tenantId: string, provider: 'outlook' | 'gmail', tokenInfo: { accessToken: string; expires?: number }): Promise<void> {
  await withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!row) return;
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    const emailConfig = settings.email ?? {};
    const updated = {
      ...settings,
      email: {
        ...emailConfig,
        [`${provider}AccessToken`]: encryptSecret(tokenInfo.accessToken),
        [`${provider}TokenExpiresAt`]: tokenInfo.expires ? new Date(tokenInfo.expires).toISOString() : emailConfig[`${provider}TokenExpiresAt`],
      },
    };
    await trx.updateTable('tenant_settings').set({ settings: JSON.stringify(updated), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).execute();
  });
}

/** Same idea as persistRefreshedToken above, but for a per-user send
 *  identity (migration 491) — the refreshed token belongs to this one
 *  user's row on user_email_accounts, not the tenant's shared settings. */
async function persistRefreshedUserToken(tenantId: string, userId: string, provider: 'outlook' | 'gmail', tokenInfo: { accessToken: string; expires?: number }): Promise<void> {
  await withTenant(tenantId, async (trx) => {
    const patch = provider === 'outlook'
      ? { outlook_access_token: encryptSecret(tokenInfo.accessToken), ...(tokenInfo.expires ? { outlook_token_expires_at: new Date(tokenInfo.expires) } : {}) }
      : { gmail_access_token: encryptSecret(tokenInfo.accessToken), ...(tokenInfo.expires ? { gmail_token_expires_at: new Date(tokenInfo.expires) } : {}) };
    await trx.updateTable('user_email_accounts').set({ ...patch, updated_at: new Date() }).where('user_id', '=', userId).execute();
  });
}

/**
 * A user's own configured send identity (migration 491's send_protocol,
 * smtp, outlook, and gmail columns on user_email_accounts) — null when the
 * user hasn't set one up (send_protocol is 'platform', the default), so the
 * caller falls through to the tenant/system identity exactly as before this
 * feature existed. Built the same way the tenant-level branches below build
 * theirs, just sourced from this one user's row instead of tenant_settings.
 */
async function buildUserTransporter(tenantId: string, userId: string): Promise<{ transporter: nodemailer.Transporter; fromName: string; fromAddress: string } | null> {
  const row = await withTenant(tenantId, (trx) =>
    trx.selectFrom('user_email_accounts').selectAll().where('user_id', '=', userId).executeTakeFirst());
  if (!row || row.send_protocol === 'platform') return null;

  if (row.send_protocol === 'smtp') {
    if (!row.smtp_host || !row.smtp_user || !row.smtp_pass) return null;
    const transporter = buildSmtpTransporter({
      host: row.smtp_host, port: row.smtp_port, user: row.smtp_user,
      pass: decryptIfEncrypted(row.smtp_pass), enc: row.smtp_encryption,
    });
    return { transporter, fromName: row.from_name || 'Hudumika', fromAddress: row.from_email || row.smtp_user };
  }

  // outlook | gmail — the token exchange never learns the authorized
  // account's own address, so a from_email must already be on file or
  // there's nothing valid to put in the SASL username/From header; falls
  // through to the tenant/system identity rather than sending as "<>".
  const refreshToken = row.send_protocol === 'outlook' ? row.outlook_refresh_token : row.gmail_refresh_token;
  if (!refreshToken || !row.from_email) return null;
  const accessToken = row.send_protocol === 'outlook' ? row.outlook_access_token : row.gmail_access_token;
  const expiresAt = row.send_protocol === 'outlook' ? row.outlook_token_expires_at : row.gmail_token_expires_at;

  // OAuth2 needs the tenant's registered app (Client ID/Secret) — only the
  // resulting tokens are per-user, same reasoning as mail-oauth.routes.ts's
  // authorize-personal route.
  const settingsRow = await withTenant(tenantId, (trx) =>
    trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst());
  const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
  const emailConfig = settings?.email ?? {};
  const clientId = emailConfig[`${row.send_protocol}ClientId`];
  const clientSecret = emailConfig[`${row.send_protocol}ClientSecret`];
  if (!clientId || !clientSecret) return null;

  const transporter = nodemailer.createTransport({
    ...(row.send_protocol === 'outlook'
      ? { host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true }
      : { service: 'gmail' }),
    auth: {
      type: 'OAuth2',
      user: row.from_email,
      clientId,
      clientSecret: decryptIfEncrypted(clientSecret),
      refreshToken: decryptIfEncrypted(refreshToken),
      accessToken: accessToken ? decryptIfEncrypted(accessToken) : undefined,
      expires: expiresAt ? new Date(expiresAt).getTime() : undefined,
    },
  } as any);

  transporter.on('token', (tokenInfo: { accessToken: string; expires?: number }) => {
    persistRefreshedUserToken(tenantId, userId, row.send_protocol as 'outlook' | 'gmail', tokenInfo)
      .catch(err => console.error(`[EmailIntegration] failed to persist refreshed user ${row.send_protocol} token:`, err.message));
  });

  // Same limitation the tenant-level OAuth branch below already has: the
  // token exchange never learns the authorized account's own address, so
  // fromEmail has to be set explicitly in Email Settings for OAuth sending
  // to use the right address (the UI prompts for it once a provider connects).
  return { transporter, fromName: row.from_name || 'Hudumika', fromAddress: row.from_email || '' };
}

export class EmailIntegration {
  /**
   * Send an email utilizing SMTP, Sendmail, or system defaults (no SMTP config needed)
   */
  static async sendEmail(input: {
    to: string;
    subject: string;
    bodyHtml: string;
    tenantId?: string;
    cc?: string[];
    attachments?: { filename: string; content: Buffer }[];
    /** Real RFC 5322 threading — set from the parent message's own stored
     *  message_id (email.routes.ts) so a reply sent through Hudumika
     *  threads correctly in the recipient's own mail client, and so an
     *  inbound reply to it carries a References header
     *  imap-email-ingest.job.ts can match on instead of only the subject
     *  fallback. */
    inReplyToMessageId?: string | null;
    referencesMessageIds?: string[];
    /** The Email app's own compose/reply send (scheduled-email-send.job.ts
     *  passes the owning row's user_id) — checked against that user's own
     *  configured send identity (migration 491) before falling back to the
     *  tenant/system identity below. Never set by system-generated mail
     *  (payroll, workflow notifications, etc.), which should always use the
     *  shared tenant identity regardless of who triggered it. */
    userId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string; simulated?: boolean }> {
    try {
      if (input.tenantId && input.userId) {
        const userIdentity = await buildUserTransporter(input.tenantId, input.userId).catch(() => null);
        if (userIdentity) {
          const info = await userIdentity.transporter.sendMail({
            from: `"${userIdentity.fromName}" <${userIdentity.fromAddress}>`,
            to: input.to,
            cc: input.cc?.length ? input.cc.join(',') : undefined,
            subject: input.subject,
            html: input.bodyHtml,
            attachments: input.attachments,
            inReplyTo: input.inReplyToMessageId ?? undefined,
            references: input.referencesMessageIds?.length ? input.referencesMessageIds : undefined,
          });
          return { success: true, messageId: info.messageId };
        }
      }

      let emailConfig: any = null;

      // 1. Fetch tenant email configuration if tenantId is provided
      if (input.tenantId) {
        const row = await withTenant(input.tenantId, (trx) =>
          trx
            .selectFrom('tenant_settings')
            .select('settings')
            .where('tenant_id', '=', input.tenantId!)
            .executeTakeFirst(),
        );
        if (row) {
          const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
          emailConfig = settings?.email;
        }
      }

      // Field names here match what Workspace ▸ Settings ▸ Email (Settings.tsx
      // EmailSection) actually saves — protocol/host/port/user/pass/enc/fromName/
      // fromEmail — not a separate email_*/smtp_* convention nobody ever wrote.
      const protocol = emailConfig?.protocol || 'mail'; // 'smtp', 'sendmail', or 'mail' (system default)
      let transporter: nodemailer.Transporter;

      let fromName = emailConfig?.fromName || 'Hudumika';
      let fromAddress = emailConfig?.fromEmail || env.SMTP_USER;

      // 2. Instantiate the correct transporter based on the protocol
      if (protocol === 'smtp' && emailConfig?.host) {
        // --- SMTP Protocol ---
        transporter = buildSmtpTransporter({
          host: emailConfig.host, port: emailConfig.port, user: emailConfig.user,
          pass: decryptIfEncrypted(emailConfig.pass), enc: emailConfig.enc,
        });
      } else if (protocol === 'sendmail') {
        // --- Sendmail Protocol (No SMTP required) ---
        transporter = nodemailer.createTransport({
          sendmail: true,
          path: emailConfig?.sendmail_path || '/usr/sbin/sendmail',
          newline: 'unix'
        });
      } else if ((protocol === 'outlook' || protocol === 'gmail') && emailConfig?.[`${protocol}RefreshToken`]) {
        // --- Outlook / Gmail OAuth2 --- nodemailer has built-in XOAUTH2
        // support, so this reuses the exact same transporter/sendMail path
        // as every other protocol — mail-oauth.routes.ts's job is only ever
        // to obtain the tokens, never to send anything itself.
        transporter = nodemailer.createTransport({
          ...(protocol === 'outlook'
            ? { host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true }
            : { service: 'gmail' }),
          auth: {
            type: 'OAuth2',
            user: emailConfig.fromEmail || emailConfig.user,
            clientId: emailConfig[`${protocol}ClientId`],
            clientSecret: decryptIfEncrypted(emailConfig[`${protocol}ClientSecret`]),
            refreshToken: decryptIfEncrypted(emailConfig[`${protocol}RefreshToken`]),
            accessToken: decryptIfEncrypted(emailConfig[`${protocol}AccessToken`]),
            expires: emailConfig[`${protocol}TokenExpiresAt`] ? new Date(emailConfig[`${protocol}TokenExpiresAt`]).getTime() : undefined,
          },
        } as any);

        if (input.tenantId) {
          const tenantId = input.tenantId;
          transporter.on('token', (tokenInfo: { accessToken: string; expires?: number }) => {
            persistRefreshedToken(tenantId, protocol, tokenInfo).catch(err =>
              console.error(`[EmailIntegration] failed to persist refreshed ${protocol} token:`, err.message));
          });
        }
      } else {
        // --- Mail Protocol (System Default / Fallback) ---
        // A SuperAdmin's saved Platform Settings ▸ Email/SMTP config (real,
        // encrypted at rest) is the real system default; env.SMTP_* is only
        // a fallback for environments where nothing has been saved yet.
        const platformSmtp = await getPlatformSmtpConfig();

        if (platformSmtp) {
          transporter = buildSmtpTransporter({
            host: platformSmtp.host, port: platformSmtp.port, user: platformSmtp.user,
            pass: platformSmtp.pass, enc: platformSmtp.tls ? 'tls' : undefined,
          });
          const fromMatch = /^(.*?)\s*<(.+)>$/.exec(platformSmtp.from || '');
          fromName = fromMatch ? fromMatch[1].replace(/^"|"$/g, '') : 'Hudumika Platform';
          fromAddress = fromMatch ? fromMatch[2] : platformSmtp.user;
        } else {
          // If the system default is not set or is still the placeholder, we simulate delivery in development
          const isPlaceholder = env.SMTP_USER === 'your-email@domain.com' || env.SMTP_PASS === 'your-app-password';

          if (isPlaceholder && env.APP_ENV !== 'production') {
            console.log(`📧 [Simulated Email] To: ${input.to} | Subject: ${input.subject}`);
            // Flagged for the same reason as the WhatsApp simulation: nothing
            // downstream should record this as delivered.
            return { success: true, simulated: true, messageId: `sim_${Math.random().toString(36).substring(7)}` };
          }

          // Use the system's pre-configured global SMTP mailer
          transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            },
            tls: { rejectUnauthorized: false }
          });

          fromName = 'Hudumika Notification';
          fromAddress = env.SMTP_USER;
        }
      }

      // 3. Send the email
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: input.to,
        cc: input.cc?.length ? input.cc.join(',') : undefined,
        subject: input.subject,
        html: input.bodyHtml,
        attachments: input.attachments,
        inReplyTo: input.inReplyToMessageId ?? undefined,
        references: input.referencesMessageIds?.length ? input.referencesMessageIds : undefined,
      });

      console.log(`✉️ Email sent successfully to ${input.to}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };

    } catch (err: any) {
      console.error('❌ Failed to send email:', err.message || err);
      return { success: false, error: err.message || 'Unknown email delivery error' };
    }
  }
}
