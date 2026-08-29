import nodemailer from 'nodemailer';

/**
 * Email delivery for account actions that can't reach a phone — chiefly a
 * federated (Google/Microsoft/Apple) signup, whose User.phoneNumber is a
 * non-deliverable `federated_<provider>_<sub>` placeholder (see
 * federated.ts) rather than a real number. sendSMS silently no-ops against
 * that placeholder, which used to leave those users permanently unable to
 * complete anything gated behind an OTP (e.g. account deletion).
 *
 * Uses SMTP_HOST/PORT/USER/PASS/FROM env vars in production, same pattern
 * as services/ngao-api/src/services/mailer.ts. Falls back to an Ethereal
 * (fake SMTP, previewable at ethereal.email) transport in dev/when unset —
 * mirrors sendSMS's "log and no-op" fallback so local dev doesn't need real
 * credentials, but still lets you see what would have been sent.
 */

let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (host) {
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return transporter;
  }

  if (process.env.NODE_ENV === 'production') return null;

  const testAccount = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  return transporter;
}

const FROM = process.env.SMTP_FROM ?? '"Ondi" <noreply@hudumika.tz>';

function otpEmailHtml(title: string, code: string, bodyText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e6f0;">
    <div style="background:#4253d1;padding:24px 32px;">
      <span style="font-size:1.3rem;font-weight:800;color:#fff;letter-spacing:-0.02em;">Ondi</span>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:0.95rem;color:#16182b;">${bodyText}</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;font-size:2rem;font-weight:800;letter-spacing:0.3em;color:#4253d1;padding:12px 20px;background:#eef0fd;border-radius:10px;">${code}</span>
      </div>
      <p style="margin:0;font-size:0.8rem;color:#8286a3;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="padding:16px 32px;background:#f9f9fb;border-top:1px solid #eee;font-size:0.72rem;color:#999;">
      Ondi is a product of Hudumika. © ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends a 6-digit verification code by email. Mirrors sendSMS's signature
 * and failure mode (log + no-op on missing config, never throws) so callers
 * can treat both channels interchangeably.
 */
export async function sendCodeEmail(
  to: string,
  code: string,
  opts: { subject: string; bodyText: string },
  log: any,
): Promise<void> {
  const transport = await getTransporter();
  if (!transport) {
    log.warn('SMTP_HOST not set. Verification email not sent.');
    return;
  }

  try {
    const info = await transport.sendMail({
      from: FROM,
      to,
      subject: opts.subject,
      html: otpEmailHtml(opts.subject, code, opts.bodyText),
    });
    log.info(`Verification email sent to ${to} — ${info.messageId}`);
    if (process.env.NODE_ENV !== 'production') {
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) log.info(`Preview: ${preview}`);
    }
  } catch (err) {
    log.error(err, `Failed to send verification email to ${to}`);
  }
}

/** A federated signup's placeholder phone (see federated.ts) — never real, never deliverable. */
export function hasDeliverablePhone(phoneNumber: string | null | undefined): boolean {
  return !!phoneNumber && !phoneNumber.startsWith('federated_') && !phoneNumber.startsWith('deleted_');
}
