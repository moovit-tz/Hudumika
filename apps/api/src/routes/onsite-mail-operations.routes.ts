import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { encryptSecret } from '../services/onsite-secrets.service.js';
import { mailProviderConfigSchema, checkMailProvider, createProviderMailbox, microsoftMailDns, inspectProviderMailbox } from '../services/mail-provider.service.js';
import { mailDnsRecordsSchema } from '../services/onsite-email.service.js';
import { saveWorkspaceMailProvider, resolveWorkspaceMailProvider } from '../services/workspace-mail-provider.service.js';

export function registerOnsiteMailOperations(fastify: FastifyInstance) {
  const admin = { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') };
  fastify.get('/email-domains/:id/setup', admin, async request => {
    const { id } = request.params as { id: string };
    const row = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_email_domains')
      .select(['provider', 'provider_config_ciphertext', 'required_dns_records'])
      .where('tenant_id', '=', request.user.tenant_id).where('id', '=', id).executeTakeFirstOrThrow());
    return { provider: row.provider, connected: !!(await resolveWorkspaceMailProvider(request.user.tenant_id, row.provider, row.provider_config_ciphertext)), records: row.required_dns_records };
  });
  fastify.put('/email-domains/:id/setup', admin, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;
    const body = z.object({ config: mailProviderConfigSchema.optional(), records: mailDnsRecordsSchema }).parse(request.body);
    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_email_domains')
      .select('provider').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Email domain not found' });
    if (body.config && body.config.kind !== (domain.provider === 'platform' ? 'cpanel' : domain.provider)) {
      return reply.status(400).send({ error: 'Credentials must match the domain mail provider.' });
    }
    if (body.config) await saveWorkspaceMailProvider(tenantId, body.config);
    await withTenant(tenantId, trx => trx.updateTable('onsite_email_domains').set({
      required_dns_records: JSON.stringify(body.records), mx_verified: false, spf_verified: false, dkim_verified: false, dmarc_verified: false,
      status: 'pending', updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', id).execute());
    return { success: true };
  });
  fastify.post('/email-domains/:id/provider-check', admin, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;
    const row = await withTenant(tenantId, trx => trx.selectFrom('onsite_email_domains as ed')
      .innerJoin('onsite_domains as d', 'd.id', 'ed.domain_id').select(['ed.provider_config_ciphertext', 'ed.provider', 'd.domain'])
      .where('ed.tenant_id', '=', tenantId).where('ed.id', '=', id).executeTakeFirst());
    const config = row ? await resolveWorkspaceMailProvider(tenantId, row.provider, row.provider_config_ciphertext) : null;
    if (!row || !config) return reply.status(400).send({ error: 'Configure administration credentials in Workspace Settings first.' });
    try {
      await checkMailProvider(config, row.domain);
      const discoveredRecords = config.kind === 'microsoft' ? await microsoftMailDns(config, row.domain) : [];
      return { connected: true, discoveredRecords };
    } catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : 'Provider check failed' }); }
  });
  fastify.post('/email-domains/:id/mailboxes/:mailboxId/provision', admin, async (request, reply) => {
    const { id, mailboxId } = request.params as { id: string; mailboxId: string };
    const tenantId = request.user.tenant_id;
    const { password } = z.object({ password: z.string().min(16).max(128) }).parse(request.body);
    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_email_domains').select(['provider', 'provider_config_ciphertext'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst());
    const config = domain ? await resolveWorkspaceMailProvider(tenantId, domain.provider, domain.provider_config_ciphertext) : null;
    if (!config) return reply.status(400).send({ error: 'Configure and check the provider in Workspace Settings first.' });
    const mailbox = await withTenant(tenantId, trx => trx.updateTable('onsite_email_mailboxes')
      .set({ provision_status: 'provisioning', provision_error: null, mailbox_secret_ciphertext: encryptSecret(password) })
      .where('tenant_id', '=', tenantId).where('email_domain_id', '=', id).where('id', '=', mailboxId)
      .where('type', '=', 'mailbox').where('provision_status', '=', 'unconfigured').returningAll().executeTakeFirst());
    if (!mailbox) return reply.status(409).send({ error: 'Mailbox not found or provisioning already started. Review the provider before retrying an uncertain operation.' });
    try {
      const result = await createProviderMailbox(config, { address: mailbox.full_address, name: mailbox.display_name ?? mailbox.local_part, password, quotaMb: mailbox.quota_mb }, async providerId => {
        await withTenant(tenantId, trx => trx.updateTable('onsite_email_mailboxes').set({ provider_mailbox_id: providerId })
          .where('tenant_id', '=', tenantId).where('id', '=', mailboxId).execute());
      });
      await withTenant(tenantId, async trx => {
        await trx.updateTable('onsite_email_mailboxes').set({ provision_status: result.mailboxReady ? 'ready' : 'review',
          provision_error: result.mailboxReady ? null : 'Account created. Confirm mail-service activation/licensing and connect the user mailbox in Email settings.' })
          .where('tenant_id', '=', tenantId).where('id', '=', mailboxId).execute();
        if (config.kind === 'cpanel' && mailbox.linked_user_id) {
          const existing = await trx.selectFrom('user_email_accounts').select(['id', 'from_email'])
            .where('tenant_id', '=', tenantId).where('user_id', '=', mailbox.linked_user_id).executeTakeFirst();
          const settings = { imap_enabled: true, imap_host: config.imapHost, imap_port: 993, imap_user: mailbox.full_address, imap_pass: encryptSecret(password), imap_encryption: 'ssl' as const,
            smtp_host: config.smtpHost, smtp_port: 465, smtp_user: mailbox.full_address, smtp_pass: encryptSecret(password), smtp_encryption: 'ssl' as const,
            send_protocol: 'smtp' as const, from_email: mailbox.full_address, from_name: mailbox.display_name };
          if (!existing) await trx.insertInto('user_email_accounts').values({ tenant_id: tenantId, user_id: mailbox.linked_user_id, ...settings }).execute();
          else if (existing.from_email === mailbox.full_address) await trx.updateTable('user_email_accounts').set(settings)
            .where('tenant_id', '=', tenantId).where('id', '=', existing.id).execute();
        }
      });
      return { success: true, ready: result.mailboxReady };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provisioning failed';
      // The provider may have created the account before a timeout. Do not repeat creation blindly.
      await withTenant(tenantId, trx => trx.updateTable('onsite_email_mailboxes').set({ provision_status: 'review', provision_error: message })
        .where('tenant_id', '=', tenantId).where('id', '=', mailboxId).execute());
      return reply.status(409).send({ error: message });
    }
  });
  fastify.post('/email-domains/:id/mailboxes/:mailboxId/check', admin, async (request, reply) => {
    const { id, mailboxId } = request.params as { id: string; mailboxId: string };
    const tenantId = request.user.tenant_id;
    const row = await withTenant(tenantId, trx => trx.selectFrom('onsite_email_mailboxes as m')
      .innerJoin('onsite_email_domains as d', 'd.id', 'm.email_domain_id')
      .select(['m.full_address', 'm.provider_mailbox_id', 'm.linked_user_id', 'd.provider', 'd.provider_config_ciphertext'])
      .where('m.tenant_id', '=', tenantId).where('d.tenant_id', '=', tenantId).where('m.id', '=', mailboxId).where('d.id', '=', id).executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Mailbox not found' });
    const config = await resolveWorkspaceMailProvider(tenantId, row.provider, row.provider_config_ciphertext);
    if (!config) return reply.status(400).send({ error: 'Configure administration credentials in Workspace Settings first.' });
    try {
      const result = await inspectProviderMailbox(config, row.full_address, row.provider_mailbox_id);
      const receipt = row.linked_user_id ? await withTenant(tenantId, trx => trx.selectFrom('email_live_checks as c')
        .innerJoin('user_email_accounts as a', 'a.id', 'c.account_id').select('c.id')
        .where('c.tenant_id', '=', tenantId).where('a.tenant_id', '=', tenantId).where('c.user_id', '=', row.linked_user_id!)
        .where('a.imap_user', '=', row.full_address).where('c.status', '=', 'received').executeTakeFirst()) : null;
      const ready = result.mailboxReady || !!receipt;
      await withTenant(tenantId, trx => trx.updateTable('onsite_email_mailboxes').set({ provider_mailbox_id: result.id,
        provision_status: ready ? 'ready' : 'review', provision_error: ready ? null : 'Provider account confirmed. Connect this mailbox in Email settings and run live verification to confirm mail activation.' })
        .where('tenant_id', '=', tenantId).where('id', '=', mailboxId).execute());
      return { success: true, ready };
    } catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : 'Provider account check failed' }); }
  });
}
