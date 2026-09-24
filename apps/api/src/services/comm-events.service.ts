import type {
  CommunicationDispatchRequest,
  CommunicationEventDefinition,
  CommunicationRecipient,
  RenderedCommunication,
  ResolvedRecipients,
} from '@hudumika/types';
import { withTenant } from '../db/client.js';
import { COMM_EVENT_MAP } from '../config/comm-event-registry.js';
import { MailTemplateService } from './mail-template.service.js';
import { MailService } from './mail.service.js';
import { NotificationService } from './notification.service.js';

function emptyRecipients(): ResolvedRecipients {
  return { to: [], cc: [], bcc: [] };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeRecipients(recipients: CommunicationRecipient[]): ResolvedRecipients {
  const result = emptyRecipients();
  const seen = new Set<string>();
  for (const recipient of recipients) {
    const email = normalizeEmail(recipient.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result[recipient.type.toLowerCase() as 'to' | 'cc' | 'bcc'].push({ ...recipient, email });
  }
  return result;
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function allowedVariableNames(def: CommunicationEventDefinition): Set<string> {
  return new Set(Object.values(def.available_variables).flatMap(group => Object.keys(group)));
}

function resolveVariables(def: CommunicationEventDefinition, source: Record<string, unknown>): Record<string, string> {
  const allowed = allowedVariableNames(def);
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowed.has(key) && value !== undefined && value !== null) variables[key] = String(value);
  }
  for (const group of Object.values(def.available_variables)) {
    for (const [key, variable] of Object.entries(group)) {
      if (variable.required && !variables[key]) throw new Error(`Missing required communication variable: "${key}"`);
    }
  }
  return variables;
}

async function resolveRecipients(request: CommunicationDispatchRequest, def: CommunicationEventDefinition): Promise<ResolvedRecipients> {
  const recipients: CommunicationRecipient[] = [];
  const manualAllowed = def.recipient_resolvers.some(item => item.resolver === 'manual_recipient');
  if (request.manualRecipients?.length) {
    if (!manualAllowed) throw new Error(`Event "${def.event_key}" does not allow manual recipients`);
    recipients.push(...request.manualRecipients);
  }

  if (def.recipient_resolvers.some(item => item.resolver === 'self')) {
    if (!request.actorId) throw new Error(`Event "${def.event_key}" requires an actor recipient`);
    const user = await withTenant(request.tenantId, trx => trx.selectFrom('users')
      .select(['id', 'email', 'name'])
      .where('tenant_id', '=', request.tenantId)
      .where('id', '=', request.actorId!)
      .executeTakeFirst());
    if (!user?.email) throw new Error('Recipient user was not found in this tenant');
    recipients.push({ email: user.email, name: user.name ?? undefined, user_id: user.id, type: 'TO' });
  }

  if (!recipients.length) {
    throw new Error(`No recipients could be resolved for event "${def.event_key}"`);
  }
  return dedupeRecipients(recipients);
}

export const CommEventsService = {
  getEvent(eventKey: string): CommunicationEventDefinition {
    const def = COMM_EVENT_MAP.get(eventKey);
    if (!def) throw new Error(`Unknown communication event: "${eventKey}"`);
    return def;
  },

  async previewRecipients(request: CommunicationDispatchRequest): Promise<ResolvedRecipients> {
    return resolveRecipients(request, this.getEvent(request.eventKey));
  },

  async render(request: CommunicationDispatchRequest, sample = false): Promise<RenderedCommunication> {
    const def = this.getEvent(request.eventKey);
    const config = await withTenant(request.tenantId, trx => trx.selectFrom('tenant_event_configs')
      .selectAll()
      .where('tenant_id', '=', request.tenantId)
      .where('event_key', '=', request.eventKey)
      .executeTakeFirst());
    const templateKey = config?.template_key ?? def.default_template;
    if (!templateKey) throw new Error(`No template configured for event "${request.eventKey}"`);
    const locale = request.locale ?? config?.locale ?? def.default_locale;
    const source = sample ? { ...def.sample_context, ...(request.context ?? {}) } : (request.context ?? {});
    const variables = resolveVariables(def, source);
    const rendered = await MailTemplateService.render(request.tenantId, templateKey, variables, locale);
    const registeredResolvers = new Map(def.recipient_resolvers.map(item => [item.resolver, item]));
    const configuredRecipients = Array.isArray(config?.recipient_rules)
      ? config.recipient_rules.flatMap((rule: any) => {
          const registered = registeredResolvers.get(rule?.resolver);
          return registered && ['TO', 'CC', 'BCC'].includes(rule?.type) ? [{ ...registered, type: rule.type }] : [];
        })
      : [];
    const effectiveDefinition = configuredRecipients.length ? { ...def, recipient_resolvers: configuredRecipients } : def;
    const recipients = sample && !request.manualRecipients?.length
      ? emptyRecipients()
      : await resolveRecipients(request, effectiveDefinition);
    return {
      eventKey: request.eventKey,
      templateKey,
      locale: rendered.locale,
      subject: rendered.subject,
      preheader: rendered.preheader,
      bodyHtml: rendered.bodyHtml,
      plainText: rendered.plainText || plainTextFromHtml(rendered.bodyHtml),
      recipients,
    };
  },

  async dispatch(request: CommunicationDispatchRequest): Promise<{ deliveryIds: string[]; duplicate: boolean }> {
    const def = this.getEvent(request.eventKey);
    const config = await withTenant(request.tenantId, trx => trx.selectFrom('tenant_event_configs')
      .selectAll().where('tenant_id', '=', request.tenantId).where('event_key', '=', request.eventKey).executeTakeFirst());
    if (config && !config.is_enabled && !def.is_required) return { deliveryIds: [], duplicate: false };

    const rendered = await this.render(request);
    const channels = (config?.channels?.length ? config.channels : [config?.channel ?? def.default_channel])
      .filter((channel): channel is 'EMAIL' | 'IN_APP' => channel === 'EMAIL' || channel === 'IN_APP');
    const allRecipients = [...rendered.recipients.to, ...rendered.recipients.cc, ...rendered.recipients.bcc];
    const deliveryIds: string[] = [];
    let duplicate = false;

    for (const channel of channels) {
      for (const recipient of allRecipients) {
        const recipientKey = request.idempotencyKey
          ? `${request.idempotencyKey}:${channel}:${normalizeEmail(recipient.email)}`
          : null;
        const reserved = await withTenant(request.tenantId, trx => trx.insertInto('comm_delivery_log').values({
          tenant_id: request.tenantId,
          event_key: request.eventKey,
          recipient_email: recipient.email,
          recipient_name: recipient.name ?? null,
          recipient_type: recipient.type,
          template_key: rendered.templateKey,
          channel,
          locale: rendered.locale,
          subject: rendered.subject,
          status: 'queued',
          idempotency_key: recipientKey,
          context_ref: request.record ? `${request.record.type}:${request.record.id}` : null,
          actor_id: request.actorId ?? null,
          record_type: request.record?.type ?? null,
          record_id: request.record?.id ?? null,
        }).onConflict(oc => oc.columns(['tenant_id', 'idempotency_key']).where('idempotency_key', 'is not', null).doNothing())
          .returning('id').executeTakeFirst());
        if (!reserved) { duplicate = true; continue; }
        deliveryIds.push(reserved.id);

        try {
          let outboxId: string | null = null;
          if (channel === 'EMAIL') {
            outboxId = await MailService.enqueue(request.tenantId, {
              to: recipient.email,
              subject: rendered.subject,
              bodyHtml: rendered.bodyHtml,
              templateKey: rendered.templateKey,
              sourceApp: def.application,
              attachmentStorageKey: request.attachments?.[0]?.storageKey,
              attachmentFilename: request.attachments?.[0]?.filename,
            });
          } else if (recipient.user_id) {
            await NotificationService.createNotification({
              tenantId: request.tenantId,
              userId: recipient.user_id,
              app: def.application.toLowerCase(),
              title: rendered.subject,
              message: rendered.plainText.slice(0, 500),
              entityType: request.record?.type,
              entityId: request.record?.id,
              entityLabel: request.record?.label,
            });
          } else {
            throw new Error('In-app delivery requires a Hudumika user recipient');
          }
          await withTenant(request.tenantId, async trx => {
            await trx.updateTable('comm_delivery_log').set({ outbox_id: outboxId, updated_at: new Date() })
              .where('tenant_id', '=', request.tenantId).where('id', '=', reserved.id).execute();
            await trx.insertInto('comm_delivery_attempts').values({
              tenant_id: request.tenantId, delivery_id: reserved.id, attempt_number: 1, status: 'queued',
              provider: channel === 'EMAIL' ? 'outbox' : 'in_app', provider_id: outboxId, error_message: null,
            }).execute();
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Communication delivery failed';
          await withTenant(request.tenantId, async trx => {
            await trx.updateTable('comm_delivery_log').set({ status: 'failed', error_message: message, updated_at: new Date() })
              .where('tenant_id', '=', request.tenantId).where('id', '=', reserved.id).execute();
            await trx.insertInto('comm_delivery_attempts').values({
              tenant_id: request.tenantId, delivery_id: reserved.id, attempt_number: 1, status: 'failed',
              provider: null, provider_id: null, error_message: message,
            }).execute();
          });
          throw error;
        }
      }
    }
    return { deliveryIds, duplicate };
  },

  async dispatchLegacy(options: {
    tenantId: string; eventKey: string; to: string; toName?: string; vars: Record<string, string>;
    actorId?: string | null; idempotencyKey?: string; contextRef?: string; locale?: string;
  }) {
    const [recordType, recordId] = options.contextRef?.split(':', 2) ?? [];
    return this.dispatch({
      tenantId: options.tenantId,
      eventKey: options.eventKey,
      actorId: options.actorId,
      record: recordType && recordId ? { type: recordType, id: recordId } : undefined,
      context: options.vars,
      locale: options.locale,
      idempotencyKey: options.idempotencyKey,
      manualRecipients: [{ email: options.to, name: options.toName, type: 'TO' }],
    });
  },

  async simulate(tenantId: string, eventKey: string, varsOverride?: Record<string, string>) {
    const result = await this.render({ tenantId, eventKey, context: varsOverride }, true);
    return {
      subject: result.subject, bodyHtml: result.bodyHtml, plainText: result.plainText,
      templateKey: result.templateKey, eventDef: this.getEvent(eventKey), locale: result.locale,
    };
  },

  async getDeliveryLog(tenantId: string, options: { limit?: number; offset?: number; eventKey?: string; recordType?: string; recordId?: string } = {}) {
    return withTenant(tenantId, trx => {
      let query = trx.selectFrom('comm_delivery_log').selectAll().where('tenant_id', '=', tenantId);
      if (options.eventKey) query = query.where('event_key', '=', options.eventKey);
      if (options.recordType) query = query.where('record_type', '=', options.recordType);
      if (options.recordId) query = query.where('record_id', '=', options.recordId);
      return query.orderBy('created_at', 'desc').limit(Math.min(options.limit ?? 50, 200)).offset(options.offset ?? 0).execute();
    });
  },

  async retryDelivery(tenantId: string, deliveryId: string) {
    return withTenant(tenantId, async trx => {
      const delivery = await trx.selectFrom('comm_delivery_log').selectAll()
        .where('tenant_id', '=', tenantId).where('id', '=', deliveryId).executeTakeFirst();
      if (!delivery) throw new Error('Delivery record not found');
      if (delivery.status !== 'failed') throw new Error('Only failed deliveries can be retried');
      if (!delivery.outbox_id) throw new Error('This delivery has no retryable outbox message');
      const outbox = await trx.updateTable('email_outbox').set({ status: 'pending', next_attempt_at: new Date(), last_error: null })
        .where('tenant_id', '=', tenantId).where('id', '=', delivery.outbox_id).returning('id').executeTakeFirst();
      if (!outbox) throw new Error('Outbox message not found');
      const attemptNumber = delivery.retry_count + 2;
      await trx.updateTable('comm_delivery_log').set({ status: 'queued', retry_count: delivery.retry_count + 1, error_message: null, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', deliveryId).execute();
      await trx.insertInto('comm_delivery_attempts').values({ tenant_id: tenantId, delivery_id: deliveryId, attempt_number: attemptNumber, status: 'queued', provider: 'outbox', provider_id: outbox.id, error_message: null }).execute();
      return { ok: true };
    });
  },
};
