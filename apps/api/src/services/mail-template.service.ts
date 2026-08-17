import { withTenant } from '../db/client.js';
import { EMAIL_TEMPLATE_DEFAULTS } from '../config/email-template-defaults.js';
import { formatTemplate } from '../lib/template.js';
import { wrapEmailHtml } from '../lib/email-envelope.js';

/**
 * Resolves a template_key to real, tenant-branded subject/body HTML — a
 * tenant's own email_templates row (if any) overrides the code-defined
 * default in email-template-defaults.ts. The one place every mail sender
 * that used to hand-build its own inline HTML now goes through instead.
 */
export const MailTemplateService = {
  async render(tenantId: string, templateKey: string, vars: Record<string, string>): Promise<{ subject: string; bodyHtml: string }> {
    return withTenant(tenantId, async (trx) => {
      const [tenant, override, settingsRow] = await Promise.all([
        trx.selectFrom('tenants').select(['name', 'logo_url', 'primary_color']).where('id', '=', tenantId).executeTakeFirst(),
        trx.selectFrom('email_templates').select(['subject', 'body_html'])
          .where('tenant_id', '=', tenantId).where('template_key', '=', templateKey).executeTakeFirst(),
        trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst(),
      ]);

      const fallback = EMAIL_TEMPLATE_DEFAULTS[templateKey];
      if (!override && !fallback) {
        throw new Error(`Unknown email template_key: "${templateKey}"`);
      }

      const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : null;
      const signatureHtml: string | null = settings?.email?.sig || null;

      const subject = formatTemplate(override?.subject ?? fallback!.subject, vars);
      const innerHtml = formatTemplate(override?.body_html ?? fallback!.body, vars);
      const bodyHtml = wrapEmailHtml(
        tenant ?? { name: 'Hudumika', logo_url: null, primary_color: null },
        innerHtml,
        signatureHtml,
      );

      return { subject, bodyHtml };
    });
  },
};
