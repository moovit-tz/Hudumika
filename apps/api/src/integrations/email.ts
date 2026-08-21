import { env } from '../config/env.js';
import nodemailer from 'nodemailer';
import { withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';

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
  }): Promise<{ success: boolean; messageId?: string; error?: string; simulated?: boolean }> {
    try {
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

      // 3. Send the email
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: input.to,
        cc: input.cc?.length ? input.cc.join(',') : undefined,
        subject: input.subject,
        html: input.bodyHtml,
        attachments: input.attachments,
      });

      console.log(`✉️ Email sent successfully to ${input.to}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };

    } catch (err: any) {
      console.error('❌ Failed to send email:', err.message || err);
      return { success: false, error: err.message || 'Unknown email delivery error' };
    }
  }
}
