import { withTenant } from '../db/client.js';
import type { Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { NOTIFICATION_MATRIX } from '../config/notification-matrix.js';
import { formatTemplate } from '../lib/template.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { MailService } from './mail.service.js';
import type { NotificationTrigger, MessageChannel } from '@hudumika/types';
import { env } from '../config/env.js';

/** Maps each matrix trigger to the bell's icon type and a deep-link builder. */
const TRIGGER_BELL_CONFIG: Partial<Record<NotificationTrigger, { type: string; title: string; buildLink: (shipmentId: string) => string }>> = {
  CASE_OPENED:        { type: 'task',     title: 'New shipment case opened',   buildLink: (id) => `/clearance/${id}` },
  STAGE_ADVANCED:      { type: 'info',     title: 'Shipment status updated',    buildLink: (id) => `/clearance/${id}` },
  MISSING_DOCUMENT:    { type: 'task',     title: 'Missing document',           buildLink: (id) => `/clearance/${id}?tab=files` },
  DEMURRAGE_RISK:       { type: 'security', title: 'Demurrage risk alert',       buildLink: (id) => `/clearance/${id}` },
  SLA_BREACH:           { type: 'security', title: 'SLA breach',                 buildLink: (id) => `/clearance/${id}` },
  DAILY_STATUS:         { type: 'info',     title: 'Daily shipment summary',     buildLink: (id) => `/clearance/${id}` },
  INVOICE_GENERATED:    { type: 'tag',      title: 'Invoice generated',          buildLink: (id) => `/clearance/${id}?tab=ledger` },
  PAYMENT_RECEIVED:     { type: 'tag',      title: 'Payment received',           buildLink: (id) => `/clearance/${id}?tab=ledger` },
  DOCUMENT_UPLOADED:    { type: 'task',     title: 'Document uploaded',          buildLink: (id) => `/clearance/${id}?tab=files` },
  MESSAGE_RECEIVED:     { type: 'chat',     title: 'New message',                buildLink: (id) => `/clearance/${id}?tab=updates` },
};

export interface CreateNotificationOptions {
  tenantId: string;
  userId: string;
  app?: string;
  type?: string;
  title: string;
  message?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
}

export class NotificationService {
  /** Create a single in-app notification directly (no matrix/channel routing) */
  static async createNotification(opts: CreateNotificationOptions): Promise<void> {
    const { withTenant } = await import('../db/client.js');
    await withTenant(opts.tenantId, (trx) => trx
      .insertInto('notifications')
      .values({
        tenant_id: opts.tenantId,
        user_id: opts.userId,
        app: opts.app ?? 'clearos',
        type: opts.type ?? 'info',
        title: opts.title,
        message: opts.message ?? null,
        link: opts.link ?? null,
        metadata: '{}',
        entity_type: opts.entityType ?? null,
        entity_id: opts.entityId ?? null,
        entity_label: opts.entityLabel ?? null,
        shipment_id: null,
        customer_id: null,
        trigger_type: null,
        channel: null,
        recipient: null,
        content: null,
      } as any)
      .execute());
  }

  /**
   * Evaluate rules for a trigger, format template, dispatch via WhatsApp/Email, and log in DB
   */
  static async triggerNotification(
    tenantId: string,
    shipmentId: string,
    trigger: NotificationTrigger,
    variables: Record<string, string> = {}
  ): Promise<void> {
    const rules = NOTIFICATION_MATRIX.filter((r) => r.trigger === trigger);
    if (rules.length === 0) return;

    return withTenant(tenantId, async (trx) => {
      // 1. Fetch shipment case details
      const shipment = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!shipment) return;

      // 2. Fetch customer details
      const customer = await trx
        .selectFrom('customers')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', shipment.customer_id)
        .executeTakeFirst();

      // 3. Fetch officer details if assigned
      const officer = shipment.assigned_to
        ? await trx
            .selectFrom('users')
            .selectAll()
            .where('id', '=', shipment.assigned_to)
            .executeTakeFirst()
        : null;

      // 4. Merge variables
      const mergedVars = {
        refNumber: shipment.ref_number,
        goodsDesc: shipment.goods_desc,
        customerName: customer?.name || 'Customer',
        officerName: officer?.name || 'Assigned Officer',
        officerPhone: officer?.phone || '',
        portalUrl: env.OPS_BOARD_URL, // Use Ops Board URL as fallback portal URL
        caseId: shipment.id,
        stageLabel: shipment.stage,
        ...variables,
      };

      for (const rule of rules) {
        const bodyContent = formatTemplate(rule.template, mergedVars);

        // Resolve recipients
        for (const recipientRole of rule.recipients) {
          const targets: { userId?: string; customerId?: string; phone?: string; email?: string }[] = [];

          if (recipientRole === 'CUSTOMER' && customer) {
            targets.push({
              customerId: customer.id,
              phone: customer.phone_wa || customer.phone || undefined,
              email: customer.email || undefined,
            });
          } else if (recipientRole === 'ASSIGNED_OFFICER' && officer) {
            targets.push({
              userId: officer.id,
              phone: officer.phone || undefined,
              email: officer.email || undefined,
            });
          } else if (recipientRole === 'MANAGER' || recipientRole === 'FINANCE') {
            // Tenant-scoped: without this the MANAGER/FINANCE fan-out
            // resolves to every tenant's managers, and each one is sent a
            // real SMS/email about a shipment in a workspace they have no
            // access to.
            const staff = await trx
              .selectFrom('users')
              .selectAll()
              .where('tenant_id', '=', tenantId)
              .where('role', '=', recipientRole)
              .where('active', '=', true)
              .execute();

            for (const u of staff) {
              targets.push({
                userId: u.id,
                phone: u.phone || undefined,
                email: u.email || undefined,
              });
            }
          }

          // Send to each target on all allowed channels
          for (const target of targets) {
            for (const channel of rule.channels) {
              await this.sendOnChannel(trx, {
                tenantId, shipmentId, refNumber: shipment.ref_number,
                trigger, channel, target, bodyContent,
              });
            }
          }
        }
      }
    });
  }

  /**
   * Sends one notification on one channel to one target, and logs it to the
   * `notifications` table. Shared by `triggerNotification` (role-based matrix
   * recipients) and `notifyListeners` (explicit per-shipment listener list) —
   * same delivery + logging behavior regardless of how the recipient was resolved.
   */
  private static async sendOnChannel(
    trx: Transaction<Database>,
    opts: {
      tenantId: string; shipmentId: string; refNumber: string;
      trigger: NotificationTrigger; channel: MessageChannel;
      target: { userId?: string; customerId?: string; phone?: string; email?: string };
      bodyContent: string;
    }
  ): Promise<void> {
    const { tenantId, shipmentId, refNumber, trigger, channel, target, bodyContent } = opts;
    let deliveryStatus = 'PENDING';

    if (channel === 'WHATSAPP' && target.phone) {
      // Tenant-wide kill switch (Workspace ▸ Settings ▸ Notifications ▸
      // "WhatsApp Notifications") — this used to only exist as a per-shipment
      // toggle on the Shipment Detail page that nothing here ever actually
      // checked, so turning it off never stopped a single real message.
      const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
      const tenantSettings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
      if (tenantSettings?.notifications?.whatsapp === false) return;

      const result = await WhatsAppIntegration.sendMessage(target.phone, bodyContent);
      // SIMULATED is its own state. Recording a simulated send as SENT made the
      // notification log assert a delivery that never left this machine —
      // which is the one thing someone reads that log to find out.
      deliveryStatus = !result.success ? 'FAILED' : result.simulated ? 'SIMULATED' : 'SENT';
    } else if (channel === 'EMAIL' && target.email) {
      // Same tenant-wide kill switch as WHATSAPP above (Workspace ▸ Settings
      // ▸ Notifications ▸ "Email Notifications") — this toggle used to save
      // to tenant_settings and nothing anywhere ever read it back. Unlike
      // WhatsApp, this one defaults OFF in the UI (NotificationsSection's
      // own `useState(false)`), so the gate must require an explicit `true`
      // rather than skip only on an explicit `false` — an unset tenant
      // never opted in, so it must not start sending until they do.
      const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
      const tenantSettings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
      if (tenantSettings?.notifications?.email !== true) return;

      // Was hardcoded to "Msomi Freight Notification" for every tenant
      // regardless of the tenant's actual name — fixed by resolving the
      // real tenant name as a template var instead of a literal string.
      const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
      const result = await MailService.sendNowTemplated(tenantId, 'notification.generic', target.email, {
        tenantName: tenant?.name || 'Hudumika', refNumber, bodyContent,
      }, 'notification');
      // A synchronous send failure still leaves a 'failed' outbox row
      // mail-outbox.job.ts will retry on its own next poll — sendNowTemplated
      // isn't "no retry," it's "also try once immediately."
      deliveryStatus = !result.success ? 'FAILED' : result.simulated ? 'SIMULATED' : 'SENT';
    } else if (channel === 'IN_APP') {
      deliveryStatus = 'SENT';
    } else {
      // No usable contact info for this channel (e.g. WHATSAPP requested but no phone on file) — skip silently.
      return;
    }

    // Insert notification record. `type` is NOT NULL in the schema, so it's always
    // set from the trigger config (falls back to 'info'). link/message/entity_* are
    // only populated for IN_APP rows — WHATSAPP/EMAIL rows are delivery-log entries
    // only, and GET /v1/notifications filters to IN_APP (or channel IS NULL) so they
    // never surface as bell items regardless.
    const cfg = TRIGGER_BELL_CONFIG[trigger];
    const isInApp = channel === 'IN_APP';

    await trx
      .insertInto('notifications')
      .values({
        tenant_id: tenantId,
        shipment_id: shipmentId,
        user_id: target.userId || null,
        customer_id: target.customerId || null,
        trigger_type: trigger,
        channel,
        recipient: channel === 'WHATSAPP' ? (target.phone || '') : (target.email || 'IN_APP'),
        title: cfg?.title ?? String(trigger).replace(/_/g, ' '),
        content: bodyContent,
        message: isInApp ? bodyContent : null,
        type: cfg?.type ?? 'info',
        link: isInApp && cfg ? cfg.buildLink(shipmentId) : null,
        entity_type: isInApp ? 'shipment' : null,
        entity_id: isInApp ? shipmentId : null,
        entity_label: isInApp ? refNumber : null,
        status: deliveryStatus,
        read: false,
        created_at: new Date(),
      } as any)
      .execute();
  }

  /**
   * Notifies a shipment's tagged listeners (shipment_listeners — the "Add
   * Internal"/"Add Customer" list on the Shipment Detail sidebar), per each
   * listener's own enabled channels, independent of the role-based
   * NOTIFICATION_MATRIX recipients in triggerNotification(). Only WHATSAPP/EMAIL
   * are ever present in a listener's channels today (the UI no longer offers
   * SMS/Teams — no real integration exists for either). Always also logs one
   * IN_APP bell entry per listener so untoggled listeners still see the update.
   */
  static async notifyListeners(
    tenantId: string,
    shipmentId: string,
    trigger: NotificationTrigger,
    variables: Record<string, string> = {}
  ): Promise<void> {
    const rule = NOTIFICATION_MATRIX.find((r) => r.trigger === trigger);
    if (!rule) return;

    return withTenant(tenantId, async (trx) => {
      const listeners = await trx
        .selectFrom('shipment_listeners')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .execute();
      if (listeners.length === 0) return;

      const shipment = await trx.selectFrom('shipment_cases').selectAll().where('id', '=', shipmentId).executeTakeFirst();
      if (!shipment) return;

      const bodyContent = formatTemplate(rule.template, { refNumber: shipment.ref_number, goodsDesc: shipment.goods_desc, ...variables });

      for (const listener of listeners) {
        if (!listener.user_id) continue; // nothing resolvable to notify

        const person = await trx.selectFrom('users').select(['id', 'phone', 'email']).where('id', '=', listener.user_id).executeTakeFirst();
        if (!person) continue;

        const target = { userId: person.id, phone: person.phone || undefined, email: person.email || undefined };
        const channels: string[] = typeof listener.channels === 'string' ? JSON.parse(listener.channels) : (listener.channels as any) || [];

        for (const ch of channels) {
          if (ch === 'whatsapp') await this.sendOnChannel(trx, { tenantId, shipmentId, refNumber: shipment.ref_number, trigger, channel: 'WHATSAPP', target, bodyContent });
          else if (ch === 'email') await this.sendOnChannel(trx, { tenantId, shipmentId, refNumber: shipment.ref_number, trigger, channel: 'EMAIL', target, bodyContent });
        }

        // Always pair with an in-app bell entry, matching the matrix's own convention.
        await this.sendOnChannel(trx, { tenantId, shipmentId, refNumber: shipment.ref_number, trigger, channel: 'IN_APP', target, bodyContent });
      }
    });
  }
}
