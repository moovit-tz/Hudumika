import { env } from '../config/env.js';
import nodemailer from 'nodemailer';
import { db } from '../db/client.js';

export class EmailIntegration {
  /**
   * Send an email utilizing SMTP, Sendmail, or system defaults (no SMTP config needed)
   */
  static async sendEmail(input: {
    to: string;
    subject: string;
    bodyHtml: string;
    tenantId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string; simulated?: boolean }> {
    try {
      let emailConfig: any = null;

      // 1. Fetch tenant email configuration if tenantId is provided
      if (input.tenantId) {
        const row = await db
          .selectFrom('tenant_settings')
          .select('settings')
          .where('tenant_id', '=', input.tenantId)
          .executeTakeFirst();
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
        const port = Number(emailConfig.port) || (emailConfig.enc === 'ssl' ? 465 : 587);
        const secure = emailConfig.enc === 'ssl';
        const requireTLS = !secure && emailConfig.enc === 'tls';

        transporter = nodemailer.createTransport({
          host: emailConfig.host,
          port,
          secure,
          requireTLS,
          auth: {
            user: emailConfig.user,
            pass: emailConfig.pass,
          },
          tls: { rejectUnauthorized: false }
        } as any);
      } else if (protocol === 'sendmail') {
        // --- Sendmail Protocol (No SMTP required) ---
        transporter = nodemailer.createTransport({
          sendmail: true,
          path: emailConfig?.sendmail_path || '/usr/sbin/sendmail',
          newline: 'unix'
        });
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
        subject: input.subject,
        html: input.bodyHtml,
      });

      console.log(`✉️ Email sent successfully to ${input.to}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };

    } catch (err: any) {
      console.error('❌ Failed to send email:', err.message || err);
      return { success: false, error: err.message || 'Unknown email delivery error' };
    }
  }
}
