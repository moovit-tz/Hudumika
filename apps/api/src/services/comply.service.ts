import { dbPlatform, withTenant } from '../db/client.js';
import { getAdapter } from '../integrations/comply-agencies.js';
import { MinioIntegration } from '../integrations/minio.js';
import { CloudSync } from './cloud-sync.service.js';
import { toISODate, toEpochMs, toDateParam } from '../utils/dates.js';
import type {
  CompDashboardStats,
  CompCertificate,
  CompApplication,
  CompObligation,
  CompRenewal,
  CreateApplicationInput,
  UpdateApplicationInput,
  CompAgencyDirectoryEntry,
  CompCalendarEvent,
  CreateCertificateInput,
  CreateReminderInput,
  CompReminder,
  ObligationScanInput,
  ObligationScanResult,
  CompLicenseCatalogEntry,
  ImportBrelaCompanyInput,
  ImportBrelaCompanyResult,
  Customer,
} from '@hudumika/types';

const BRELA_TIN_PLACEHOLDER = 'Not available from BRELA public search';
const CUSTOMER_AVATAR_COLORS = ['#0b7264', '#0e1f3d', '#1849a9', '#5b3ea8', '#b57d0a'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Accepts a DATE column (a 'YYYY-MM-DD' string from the driver — see the type
 * parser in db/client.ts) or a TIMESTAMPTZ, which is still a real Date.
 * 9999 preserves every caller's existing "no expiry means never due" reading.
 */
function daysUntil(date: unknown): number {
  const t = toEpochMs(date);
  return t === null ? 9999 : Math.ceil((t - Date.now()) / 86400000);
}

function certStatus(expiry: unknown): 'active' | 'expiring' | 'expired' {
  const d = daysUntil(expiry);
  if (d <= 0)  return 'expired';
  if (d <= 30) return 'expiring';
  return 'active';
}

// Generate sequential APP-YYYY-NNN numbers (per tenant)
async function nextAppNumber(tenantId: string, trx: any): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await trx
    .selectFrom('comply_applications')
    .select((eb: any) => eb.fn.count('id').as('cnt'))
    .where('tenant_id', '=', tenantId)
    .where('app_number', 'like', `APP-${year}-%`)
    .executeTakeFirst();
  const seq = ((rows?.cnt ?? 0) as number) + 1;
  return `APP-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ComplyService {

  // ── Dashboard ─────────────────────────────────────────────────────────────

  static async getDashboardStats(tenantId: string): Promise<CompDashboardStats> {
    return withTenant(tenantId, async (trx) => {
      const certs = await trx
        .selectFrom('comply_certificates')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('status', '!=', 'revoked')
        .execute();

      const apps = await trx
        .selectFrom('comply_applications')
        .select(['status'])
        .where('tenant_id', '=', tenantId)
        .execute();

      const renewals = await trx
        .selectFrom('comply_renewals')
        .select(['status'])
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'pending_review')
        .execute();

      const recentSyncs = await trx
        .selectFrom('comply_agency_syncs')
        .select(['agency_code', 'synced_at', 'status'])
        .where('tenant_id', '=', tenantId)
        .orderBy('synced_at', 'desc')
        .limit(5)
        .execute();

      // Recompute live statuses
      const activeCerts   = certs.filter(c => certStatus(c.expiry_date) === 'active').length;
      const expiringSoon  = certs.filter(c => certStatus(c.expiry_date) === 'expiring').length;
      const expiredCerts  = certs.filter(c => certStatus(c.expiry_date) === 'expired').length;
      const pendingApps   = apps.filter(a => ['submitted', 'review', 'pending'].includes(a.status)).length;
      const totalRequired = certs.length + expiredCerts;
      const healthScore   = totalRequired === 0 ? 100 : Math.round((activeCerts / Math.max(totalRequired, 1)) * 100);

      const upcomingDeadlines = certs
        .filter(c => c.expiry_date !== null)
        .map(c => ({
          cert_id:     c.id,
          cert_name:   c.name,
          agency_code: c.agency_code,
          // Non-null by the filter directly above.
          expiry_date: toISODate(c.expiry_date)!,
          days_left:   daysUntil(c.expiry_date),
        }))
        .filter(d => d.days_left <= 90)
        .sort((a, b) => a.days_left - b.days_left)
        .slice(0, 8);

      return {
        active_certs:     activeCerts,
        expiring_soon:    expiringSoon,
        pending_apps:     pendingApps,
        overdue:          expiredCerts,
        health_score:     Math.min(100, Math.max(0, healthScore)),
        pending_renewals: renewals.length,
        upcoming_deadlines: upcomingDeadlines,
        recent_syncs: recentSyncs.map(s => ({
          agency_code: s.agency_code,
          synced_at:   (s.synced_at as Date).toISOString(),
          status:      s.status as 'success' | 'failed' | 'partial',
        })),
      };
    });
  }

  // ── Certificates ─────────────────────────────────────────────────────────

  static async getCertificates(tenantId: string, status?: string): Promise<CompCertificate[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('comply_certificates as c')
        .leftJoin('customers as cu', 'cu.id', 'c.customer_id')
        .select([
          'c.id', 'c.cert_number', 'c.name', 'c.agency_code', 'c.agency_name', 'c.agency_class',
          'c.issued_date', 'c.expiry_date', 'c.status', 'c.document_url', 'c.external_ref',
          'c.auto_renew', 'c.last_synced_at', 'c.metadata', 'c.customer_id', 'cu.name as customer_name',
          'c.reminder_90d_sent_at', 'c.reminder_30d_sent_at', 'c.non_renewal_risk',
          'c.created_at', 'c.updated_at',
        ])
        .where('c.tenant_id', '=', tenantId);
      if (status) q = q.where('c.status', '=', status);
      const rows = await q.orderBy('c.expiry_date', 'asc').execute();

      return rows.map(r => ({
        id:             r.id,
        cert_number:    r.cert_number,
        name:           r.name,
        agency_code:    r.agency_code,
        agency_name:    r.agency_name,
        agency_class:   r.agency_class as any,
        issued_date:    r.issued_date ? toISODate(r.issued_date) : null,
        expiry_date:    r.expiry_date ? toISODate(r.expiry_date) : null,
        status:         certStatus(r.expiry_date) as any,
        document_url:   r.document_url,
        external_ref:   r.external_ref,
        auto_renew:     r.auto_renew,
        last_synced_at: r.last_synced_at ? (r.last_synced_at as Date).toISOString() : null,
        metadata:       r.metadata as Record<string, unknown>,
        customer_id:    r.customer_id,
        customer_name:  r.customer_name,
        reminder_90d_sent_at: r.reminder_90d_sent_at ? (r.reminder_90d_sent_at as Date).toISOString() : null,
        reminder_30d_sent_at: r.reminder_30d_sent_at ? (r.reminder_30d_sent_at as Date).toISOString() : null,
        non_renewal_risk:     r.non_renewal_risk,
        created_at:     (r.created_at as Date).toISOString(),
        updated_at:     (r.updated_at as Date).toISOString(),
      }));
    });
  }

  // ── Applications ─────────────────────────────────────────────────────────

  static async getApplications(tenantId: string, status?: string): Promise<CompApplication[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx
        .selectFrom('comply_applications as a')
        .leftJoin('customers as cu', 'cu.id', 'a.customer_id')
        .select([
          'a.id', 'a.app_number', 'a.cert_type', 'a.agency_code', 'a.status', 'a.submitted_at',
          'a.created_at', 'a.updated_at', 'a.created_by', 'a.agency_ref', 'a.notes',
          'a.linked_cert_id', 'a.metadata', 'a.customer_id', 'cu.name as customer_name',
          'a.license_catalog_id',
        ])
        .where('a.tenant_id', '=', tenantId);
      if (status) q = q.where('a.status', '=', status);
      const rows = await q.orderBy('a.created_at', 'desc').execute();

      return rows.map(r => ({
        id:             r.id,
        app_number:     r.app_number,
        cert_type:      r.cert_type,
        agency_code:    r.agency_code,
        status:         r.status as any,
        submitted_at:   r.submitted_at ? (r.submitted_at as Date).toISOString() : null,
        created_at:     (r.created_at as Date).toISOString(),
        updated_at:     (r.updated_at as Date).toISOString(),
        created_by:     r.created_by,
        agency_ref:     r.agency_ref,
        notes:          r.notes,
        linked_cert_id: r.linked_cert_id,
        metadata:       r.metadata as Record<string, unknown>,
        customer_id:    r.customer_id,
        customer_name:  r.customer_name,
        license_catalog_id: r.license_catalog_id,
      }));
    });
  }

  // ── Bliss → ComplyOS bridge ──────────────────────────────────────────────
  // When a support ticket surfaces a compliance gap, Bliss can raise a draft
  // ComplyOS application pre-filled with the ticket's context — same "direct
  // cross-domain call within one request" convention webhooks.routes.ts uses
  // for its inbound-WhatsApp-creates-a-ticket path (no generic event bus
  // exists in this platform to route through instead).
  static async createApplicationFromTicket(
    tenantId: string,
    userId: string,
    input: { ticket_id: string; agency_code: string; cert_type: string },
  ): Promise<CompApplication> {
    return withTenant(tenantId, async (trx) => {
      const ticket = await trx
        .selectFrom('support_tickets')
        .select(['id', 'ref_number', 'subject', 'description', 'customer_id'])
        .where('id', '=', input.ticket_id)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const app_number = await nextAppNumber(tenantId, trx);
      const notes = `Raised from Bliss support ticket ${ticket.ref_number}: "${ticket.subject}"${ticket.description ? ' — ' + ticket.description : ''}`;

      const row = await trx
        .insertInto('comply_applications')
        .values({
          tenant_id: tenantId, app_number, cert_type: input.cert_type, agency_code: input.agency_code,
          created_by: userId, notes, customer_id: ticket.customer_id ?? null,
          metadata: { source: 'bliss_ticket', source_ticket_id: ticket.id, source_ticket_ref: ticket.ref_number },
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: row.id, app_number: row.app_number, cert_type: row.cert_type,
        agency_code: row.agency_code, status: row.status as any,
        submitted_at: null, created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
        created_by: row.created_by, agency_ref: null, notes: row.notes,
        linked_cert_id: null, metadata: row.metadata as Record<string, unknown>,
        customer_id: row.customer_id, customer_name: null, license_catalog_id: null,
      };
    });
  }

  static async createApplication(
    tenantId: string,
    userId: string,
    input: CreateApplicationInput,
  ): Promise<CompApplication> {
    return withTenant(tenantId, async (trx) => {
      if (input.customer_id) {
        await trx.selectFrom('customers').select('id')
          .where('id', '=', input.customer_id).where('tenant_id', '=', tenantId)
          .executeTakeFirstOrThrow();
      }
      const app_number = await nextAppNumber(tenantId, trx);
      const row = await trx
        .insertInto('comply_applications')
        .values({
          tenant_id:  tenantId,
          app_number,
          cert_type:  input.cert_type,
          agency_code:input.agency_code,
          created_by: userId,
          notes:      input.notes ?? null,
          customer_id: input.customer_id ?? null,
          license_catalog_id: input.license_catalog_id ?? null,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        id: row.id, app_number: row.app_number, cert_type: row.cert_type,
        agency_code: row.agency_code, status: row.status as any,
        submitted_at: null, created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
        created_by: row.created_by, agency_ref: null, notes: row.notes,
        linked_cert_id: null, metadata: row.metadata as Record<string, unknown>,
        customer_id: row.customer_id, customer_name: null,
        license_catalog_id: row.license_catalog_id,
      };
    });
  }

  static async updateApplication(
    tenantId: string,
    appId: string,
    input: UpdateApplicationInput,
  ): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = {
        status:     input.status,
        updated_at: new Date(),
      };
      if (input.agency_ref) update['agency_ref'] = input.agency_ref;
      if (input.notes)      update['notes']      = input.notes;
      if (input.customer_id !== undefined) update['customer_id'] = input.customer_id;

      // On submission, route through the agency's adapter so `agency_ref`
      // reflects a real (or manual-tracking) submission reference instead of
      // requiring the caller to supply one — this is what actually connects
      // the adapter layer in comply-agencies.ts to the Applications workflow.
      if (input.status === 'submitted') {
        update['submitted_at'] = new Date();
        if (!input.agency_ref) {
          const app = await trx
            .selectFrom('comply_applications')
            .select(['agency_code', 'cert_type', 'app_number'])
            .where('id', '=', appId)
            .where('tenant_id', '=', tenantId)
            .executeTakeFirst();
          const adapter = app ? getAdapter(app.agency_code) : null;
          if (adapter) {
            const { external_ref } = await adapter.submitApplication({
              app_number: app!.app_number, cert_type: app!.cert_type, tenant_id: tenantId,
            });
            update['agency_ref'] = external_ref;
          }
        }
      }

      await trx
        .updateTable('comply_applications')
        .set(update)
        .where('id', '=', appId)
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  /** Only draft applications can be deleted — anything submitted has a real (or manual-tracking) agency reference and must stay in the audit trail. */
  static async deleteApplication(tenantId: string, appId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const result = await trx
        .deleteFrom('comply_applications')
        .where('id', '=', appId)
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'draft')
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new Error('Only draft applications can be deleted.');
      }
    });
  }

  // ── Obligations ───────────────────────────────────────────────────────────

  static async getObligations(tenantId: string): Promise<CompObligation[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('comply_obligations as o')
        .leftJoin('customers as cu', 'cu.id', 'o.customer_id')
        .select([
          'o.id', 'o.obligation_code', 'o.agency_code', 'o.agency_class', 'o.name', 'o.frequency',
          'o.mandatory', 'o.status', 'o.due_date', 'o.last_fulfilled_date', 'o.linked_cert_id',
          'o.customer_id', 'cu.name as customer_name',
        ])
        .where('o.tenant_id', '=', tenantId)
        .orderBy('o.agency_code', 'asc')
        .execute();

      return rows.map(r => ({
        id:                   r.id,
        obligation_code:      r.obligation_code,
        agency_code:          r.agency_code,
        agency_class:         r.agency_class as any,
        name:                 r.name,
        frequency:            r.frequency,
        mandatory:            r.mandatory,
        status:               r.status as any,
        due_date:             r.due_date ? toISODate(r.due_date) : null,
        last_fulfilled_date:  r.last_fulfilled_date ? toISODate(r.last_fulfilled_date) : null,
        linked_cert_id:       r.linked_cert_id,
        customer_id:          r.customer_id,
        customer_name:        r.customer_name,
      }));
    });
  }

  static async createObligation(tenantId: string, input: {
    obligation_code: string; agency_code: string; name: string; frequency: string;
    mandatory?: boolean; due_date?: string | null; customer_id?: string | null;
  }): Promise<CompObligation> {
    return withTenant(tenantId, async (trx) => {
      if (input.customer_id) {
        await trx.selectFrom('customers').select('id')
          .where('id', '=', input.customer_id).where('tenant_id', '=', tenantId)
          .executeTakeFirstOrThrow();
      }
      const row = await trx
        .insertInto('comply_obligations')
        .values({
          tenant_id: tenantId,
          obligation_code: input.obligation_code,
          agency_code: input.agency_code,
          name: input.name,
          frequency: input.frequency,
          mandatory: input.mandatory ?? true,
          due_date: input.due_date ? new Date(input.due_date) : null,
          customer_id: input.customer_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: row.id, obligation_code: row.obligation_code, agency_code: row.agency_code,
        agency_class: row.agency_class as any, name: row.name, frequency: row.frequency,
        mandatory: row.mandatory, status: row.status as any,
        due_date: row.due_date ? toISODate(row.due_date) : null,
        last_fulfilled_date: null, linked_cert_id: null,
        customer_id: row.customer_id, customer_name: null,
      };
    });
  }

  static async updateObligation(tenantId: string, obligationId: string, input: {
    status?: string; due_date?: string | null; last_fulfilled_date?: string | null; customer_id?: string | null;
  }): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.status !== undefined) update['status'] = input.status;
      if (input.due_date !== undefined) update['due_date'] = input.due_date ? new Date(input.due_date) : null;
      if (input.last_fulfilled_date !== undefined) update['last_fulfilled_date'] = input.last_fulfilled_date ? new Date(input.last_fulfilled_date) : null;
      if (input.customer_id !== undefined) update['customer_id'] = input.customer_id;

      await trx
        .updateTable('comply_obligations')
        .set(update)
        .where('id', '=', obligationId)
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async deleteObligation(tenantId: string, obligationId: string): Promise<void> {
    await withTenant(tenantId, (trx) =>
      trx.deleteFrom('comply_obligations')
        .where('id', '=', obligationId)
        .where('tenant_id', '=', tenantId)
        .execute(),
    );
  }

  // ── Renewals ──────────────────────────────────────────────────────────────

  static async getRenewals(tenantId: string): Promise<CompRenewal[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('comply_renewals as r')
        .innerJoin('comply_certificates as c', 'c.id', 'r.cert_id')
        .select([
          'r.id', 'r.cert_id', 'c.name as cert_name', 'c.agency_code',
          'r.status', 'r.trigger', 'r.triggered_at', 'r.approved_by',
          'r.approved_at', 'r.submitted_at', 'r.completed_at', 'r.notes',
        ])
        .where('r.tenant_id', '=', tenantId)
        .orderBy('r.triggered_at', 'desc')
        .execute();

      return rows.map(r => ({
        id:           r.id,
        cert_id:      r.cert_id,
        cert_name:    r.cert_name,
        agency_code:  r.agency_code,
        status:       r.status as any,
        trigger:      r.trigger as 'automatic' | 'manual',
        triggered_at: (r.triggered_at as Date).toISOString(),
        approved_by:  r.approved_by,
        approved_at:  r.approved_at ? (r.approved_at as Date).toISOString() : null,
        submitted_at: r.submitted_at ? (r.submitted_at as Date).toISOString() : null,
        completed_at: r.completed_at ? (r.completed_at as Date).toISOString() : null,
        notes:        r.notes,
      }));
    });
  }

  static async startRenewal(tenantId: string, certId: string, trigger: 'automatic' | 'manual'): Promise<CompRenewal> {
    return withTenant(tenantId, async (trx) => {
      // Check no active renewal already running for this cert
      const existing = await trx
        .selectFrom('comply_renewals')
        .select(['id'])
        .where('cert_id', '=', certId)
        .where('tenant_id', '=', tenantId)
        .where('status', 'in', ['pending_review', 'approved', 'submitted'])
        .executeTakeFirst();
      if (existing) throw new Error('A renewal workflow is already active for this certificate.');

      const cert = await trx
        .selectFrom('comply_certificates')
        .select(['id', 'name', 'agency_code'])
        .where('id', '=', certId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();

      const row = await trx
        .insertInto('comply_renewals')
        .values({ tenant_id: tenantId, cert_id: certId, trigger })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: row.id, cert_id: row.cert_id, cert_name: cert.name, agency_code: cert.agency_code,
        status: row.status as any, trigger: row.trigger as 'automatic' | 'manual',
        triggered_at: (row.triggered_at as Date).toISOString(),
        approved_by: null, approved_at: null, submitted_at: null, completed_at: null, notes: null,
      };
    });
  }

  static async approveRenewal(tenantId: string, renewalId: string, userId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx
        .updateTable('comply_renewals')
        .set({ status: 'approved', approved_by: userId, approved_at: new Date() })
        .where('id', '=', renewalId)
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'pending_review')
        .execute();
    });
  }

  // ── Agency Sync ───────────────────────────────────────────────────────────

  static async syncAgency(tenantId: string, agencyCode: string, tin: string): Promise<{ records_updated: number }> {
    const adapter = getAdapter(agencyCode);
    if (!adapter) throw new Error(`No adapter for agency: ${agencyCode}`);

    let records_updated = 0;
    let syncStatus: 'success' | 'failed' | 'partial' = 'success';
    let errorMsg: string | null = null;

    try {
      const certs = await adapter.syncCertificates(tin);

      await withTenant(tenantId, async (trx) => {
        for (const cert of certs) {
          const existing = await trx
            .selectFrom('comply_certificates')
            .select(['id'])
            .where('tenant_id', '=', tenantId)
            .where('external_ref', '=', cert.external_ref)
            .executeTakeFirst();

          if (existing) {
            await trx
              .updateTable('comply_certificates')
              .set({
                status:         cert.status,
                expiry_date:    cert.expiry_date ? new Date(cert.expiry_date) : null,
                last_synced_at: new Date(),
                updated_at:     new Date(),
              })
              .where('id', '=', existing.id)
              .execute();
          } else {
            await trx
              .insertInto('comply_certificates')
              .values({
                tenant_id:      tenantId,
                cert_number:    cert.cert_number,
                name:           cert.name,
                agency_code:    agencyCode,
                agency_name:    adapter.name,
                issued_date:    cert.issued_date ? new Date(cert.issued_date) : null,
                expiry_date:    cert.expiry_date ? new Date(cert.expiry_date) : null,
                external_ref:   cert.external_ref,
                last_synced_at: new Date(),
              })
              .execute();
          }
          records_updated++;
        }

        // Log the sync
        await trx
          .insertInto('comply_agency_syncs')
          .values({ tenant_id: tenantId, agency_code: agencyCode, status: syncStatus, records_updated })
          .execute();
      });
    } catch (err: any) {
      syncStatus = 'failed';
      errorMsg   = err.message;
      await withTenant(tenantId, async (trx) => {
        await trx
          .insertInto('comply_agency_syncs')
          .values({ tenant_id: tenantId, agency_code: agencyCode, status: 'failed', records_updated: 0, error: errorMsg })
          .execute();
      });
      throw err;
    }

    return { records_updated };
  }

  // ── Agency Directory ──────────────────────────────────────────────────────

  static async getAgencyDirectory(): Promise<CompAgencyDirectoryEntry[]> {
    // Shared reference directory, no tenant_id — platform-scoped.
    const rows = await dbPlatform
      .selectFrom('comply_agency_directory')
      .selectAll()
      .orderBy('code', 'asc')
      .execute();

    return rows.map(r => ({
      code:         r.code,
      name:         r.name,
      category:     r.category,
      agency_class: r.agency_class as any,
      website:      r.website,
      phone:        r.phone,
      location:     r.location,
      obligations:  r.obligations as string[],
      turnaround:   r.turnaround,
      portal_type:  r.portal_type as any,
    }));
  }

  // ── Business Licence Catalogue ───────────────────────────────────────────

  static async getLicenseCatalog(): Promise<CompLicenseCatalogEntry[]> {
    // Shared reference catalogue, no tenant_id — platform-scoped.
    const rows = await dbPlatform
      .selectFrom('comply_license_catalog')
      .selectAll()
      .orderBy('sn', 'asc')
      .orderBy('code', 'asc')
      .execute();

    return rows.map(r => ({
      id:                  r.id,
      code:                r.code,
      sn:                  r.sn,
      category:            r.category,
      description:         r.description,
      tier:                r.tier,
      principal_fee:       r.principal_fee !== null ? Number(r.principal_fee) : null,
      principal_currency:  r.principal_currency,
      subsidiary_fee:      r.subsidiary_fee !== null ? Number(r.subsidiary_fee) : null,
      subsidiary_currency: r.subsidiary_currency,
      notes:               r.notes,
      requirements:        r.requirements as unknown as string[],
    }));
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  static async getCalendarEvents(tenantId: string, year: number, month: number): Promise<CompCalendarEvent[]> {
    return withTenant(tenantId, async (trx) => {
      const monthStart = new Date(year, month, 1);
      const monthEnd   = new Date(year, month + 1, 0);

      const obligations = await trx
        .selectFrom('comply_obligations')
        .select(['id', 'name', 'agency_code', 'due_date', 'mandatory'])
        .where('tenant_id', '=', tenantId)
        .where('due_date', 'is not', null)
        .where('due_date', '>=', toDateParam(monthStart))
        .where('due_date', '<=', toDateParam(monthEnd))
        .execute();

      const certs = await trx
        .selectFrom('comply_certificates')
        .select(['id', 'name', 'agency_code', 'expiry_date'])
        .where('tenant_id', '=', tenantId)
        .where('expiry_date', 'is not', null)
        .where('expiry_date', '>=', toDateParam(monthStart))
        .where('expiry_date', '<=', toDateParam(monthEnd))
        .execute();

      const renewals = await trx
        .selectFrom('comply_renewals as r')
        .innerJoin('comply_certificates as c', 'c.id', 'r.cert_id')
        .select(['r.id', 'c.name as cert_name', 'c.agency_code', 'r.triggered_at', 'r.status'])
        .where('r.tenant_id', '=', tenantId)
        .where('r.triggered_at', '>=', monthStart)
        .where('r.triggered_at', '<=', monthEnd)
        .execute();

      const reminders = await trx
        .selectFrom('comply_reminders')
        .select(['id', 'title', 'agency_code', 'remind_date'])
        .where('tenant_id', '=', tenantId)
        .where('remind_date', '>=', toDateParam(monthStart))
        .where('remind_date', '<=', toDateParam(monthEnd))
        .execute();

      const events: CompCalendarEvent[] = [];

      for (const o of obligations) {
        const daysLeft = Math.ceil(((toEpochMs(o.due_date) ?? 0) - Date.now()) / 86400000);
        events.push({
          source: 'obligation', source_id: o.id,
          date: toISODate(o.due_date)!,
          title: o.name, agency_code: o.agency_code,
          severity: daysLeft <= 0 ? 'red' : daysLeft <= 14 ? 'amber' : o.mandatory ? 'blue' : 'green',
        });
      }
      for (const c of certs) {
        const daysLeft = Math.ceil(((toEpochMs(c.expiry_date) ?? 0) - Date.now()) / 86400000);
        events.push({
          source: 'certificate', source_id: c.id,
          date: toISODate(c.expiry_date)!,
          title: `${c.name} expires`, agency_code: c.agency_code,
          severity: daysLeft <= 0 ? 'red' : daysLeft <= 14 ? 'amber' : 'blue',
        });
      }
      for (const r of renewals) {
        events.push({
          source: 'renewal', source_id: r.id,
          date: (r.triggered_at as Date).toISOString().split('T')[0],
          title: `${r.cert_name} renewal ${r.status === 'issued' ? 'issued' : 'started'}`,
          agency_code: r.agency_code, severity: 'green',
        });
      }
      for (const rem of reminders) {
        events.push({
          source: 'reminder', source_id: rem.id,
          date: toISODate(rem.remind_date)!,
          title: rem.title, agency_code: rem.agency_code, severity: 'amber',
        });
      }

      return events.sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  static async createReminder(tenantId: string, userId: string, input: CreateReminderInput): Promise<CompReminder> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx
        .insertInto('comply_reminders')
        .values({
          tenant_id:   tenantId,
          title:       input.title,
          agency_code: input.agency_code ?? null,
          remind_date: new Date(input.remind_date),
          notes:       input.notes ?? null,
          created_by:  userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        id: row.id, title: row.title, agency_code: row.agency_code,
        // remind_date is NOT NULL and was just written from input, so the
        // row always has one.
        remind_date: toISODate(row.remind_date)!,
        notes: row.notes, created_at: (row.created_at as Date).toISOString(),
      };
    });
  }

  static async deleteReminder(tenantId: string, reminderId: string): Promise<void> {
    await withTenant(tenantId, (trx) =>
      trx.deleteFrom('comply_reminders')
        .where('id', '=', reminderId)
        .where('tenant_id', '=', tenantId)
        .execute(),
    );
  }

  // ── Certificate creation (manual / BRELA-import) ───────────────────────────

  // Shared insert body — no own withTenant, so callers already inside a
  // transaction (e.g. importBrelaCompany below) can invoke this on their own
  // `trx` and keep the whole operation atomic. withTenant opens its own
  // db.transaction().execute(...) per call, so nesting a full createCertificate
  // call inside another withTenant callback would silently run on a second,
  // non-atomic connection.
  private static async insertCertificateRow(trx: any, tenantId: string, input: CreateCertificateInput): Promise<CompCertificate> {
    if (input.customer_id) {
      await trx.selectFrom('customers').select('id')
        .where('id', '=', input.customer_id).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();
    }
    const existing = await trx
      .selectFrom('comply_certificates')
      .select(['id'])
      .where('tenant_id', '=', tenantId)
      .where('cert_number', '=', input.cert_number)
      .executeTakeFirst();
    if (existing) throw new Error(`A certificate with number "${input.cert_number}" already exists.`);

    const row = await trx
      .insertInto('comply_certificates')
      .values({
        tenant_id:    tenantId,
        cert_number:  input.cert_number,
        name:         input.name,
        agency_code:  input.agency_code,
        agency_name:  input.agency_name,
        issued_date:  input.issued_date ? new Date(input.issued_date) : null,
        expiry_date:  input.expiry_date ? new Date(input.expiry_date) : null,
        document_url: input.document_url ?? null,
        external_ref: input.external_ref ?? null,
        metadata:     input.metadata ?? {},
        customer_id:  input.customer_id ?? null,
        non_renewal_risk: input.non_renewal_risk ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id, cert_number: row.cert_number, name: row.name,
      agency_code: row.agency_code, agency_name: row.agency_name, agency_class: row.agency_class as any,
      issued_date: row.issued_date ? toISODate(row.issued_date) : null,
      expiry_date: row.expiry_date ? toISODate(row.expiry_date) : null,
      status: row.status as any, document_url: row.document_url, external_ref: row.external_ref,
      auto_renew: row.auto_renew, last_synced_at: null, metadata: row.metadata as Record<string, unknown>,
      customer_id: row.customer_id, customer_name: null,
      reminder_90d_sent_at: null, reminder_30d_sent_at: null, non_renewal_risk: row.non_renewal_risk,
      created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
    };
  }

  static async createCertificate(tenantId: string, input: CreateCertificateInput): Promise<CompCertificate> {
    return withTenant(tenantId, (trx) => this.insertCertificateRow(trx, tenantId, input));
  }

  // Row shape returned by Customer selects — mirrors CustomersTable's Date
  // columns cast to the string-based Customer API type.
  private static mapCustomerRow(row: any): Customer {
    return {
      ...row,
      incorporation_date: row.incorporation_date ? toISODate(row.incorporation_date) ?? undefined : undefined,
      created_at: (row.created_at as Date).toISOString(),
      updated_at: (row.updated_at as Date).toISOString(),
    };
  }

  // Atomically finds-or-creates the "company" (customers/CRM) record for a
  // BRELA search result, deduped by BRELA's own registry/incorporation
  // number (NOT tax_id/TIN — live BRELA search never returns a real TIN, so
  // every live result would otherwise share the same placeholder string and
  // collide with each other's customer rows), then creates the linked Vault
  // certificate in the same transaction so both writes succeed or fail
  // together.
  static async importBrelaCompany(tenantId: string, userId: string, userRole: string, input: ImportBrelaCompanyInput): Promise<ImportBrelaCompanyResult> {
    return withTenant(tenantId, async (trx) => {
      const realTin = input.tin && input.tin !== BRELA_TIN_PLACEHOLDER ? input.tin : null;

      const existing = await trx
        .selectFrom('customers')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('registry_number', '=', input.reg_number)
        .executeTakeFirst();

      let customerRow: any;
      if (existing) {
        customerRow = await trx
          .updateTable('customers')
          .set({
            name:                 input.name,
            entity_type:          input.entity_type ?? null,
            registration_status:  input.status ?? null,
            registered_address:   input.registered_office ?? null,
            incorporation_date:   input.incorporation_date ? new Date(input.incorporation_date) : null,
            source:               'brela_import',
            tax_id:               realTin ?? existing.tax_id,
            updated_at:           new Date(),
          })
          .where('id', '=', existing.id)
          .where('tenant_id', '=', tenantId)
          .returningAll()
          .executeTakeFirstOrThrow();
      } else {
        const initials = input.name.substring(0, 2).toUpperCase();
        const avatarColor = CUSTOMER_AVATAR_COLORS[Math.floor(Math.random() * CUSTOMER_AVATAR_COLORS.length)];
        customerRow = await trx
          .insertInto('customers')
          .values({
            tenant_id:            tenantId,
            name:                 input.name,
            registry_number:      input.reg_number,
            entity_type:          input.entity_type ?? null,
            registration_status:  input.status ?? null,
            registered_address:   input.registered_office ?? null,
            incorporation_date:   input.incorporation_date ? new Date(input.incorporation_date) : null,
            tax_id:               realTin ?? null,
            source:               'brela_import',
            category:             'sme',
            preferred_channel:    'WHATSAPP',
            avatar_initials:      initials,
            avatar_color:         avatarColor,
            assigned_officer_id:  userRole === 'OFFICER' ? userId : null,
            // Created inactive — a "holding" draft in Company Directory only.
            // It becomes a real, usable CRM customer (visible to ClearOS/
            // Finance/other apps' customer pickers) only once the tenant
            // reviews the profile and marks it complete, which PATCHes
            // active:true via the same endpoint used to reactivate any
            // other customer.
            active:               false,
            created_at:           new Date(),
            updated_at:           new Date(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        MinioIntegration.ensureCustomerFolder(tenantId, customerRow.id, customerRow.name);
        // BRELA-imported customers skipped the Cloud folder every other
        // customer-creation path already gets (customers.routes.ts) — this
        // was a raw Minio folder with no cloud_files row behind it, so it
        // never showed up in Drive or this customer's own Documents tab.
        CloudSync.ensureCustomerFolder(tenantId, customerRow.id, customerRow.name)
          .catch(err => console.error('[Cloud] BRELA customer folder sync failed:', err.message));
      }

      const certificate = await this.insertCertificateRow(trx, tenantId, {
        cert_number:  input.reg_number,
        name:         `BRELA ORS Certificate - ${input.name}`,
        agency_code:  'BRELA',
        agency_name:  'Business Registration & Licensing Agency',
        issued_date:  input.incorporation_date ?? null,
        expiry_date:  null,
        external_ref: input.reg_number,
        metadata: {
          source: 'BRELA ORS Live Search',
          address: input.registered_office,
          entity_type: input.entity_type,
        },
        customer_id: customerRow.id,
      });

      return { customer: this.mapCustomerRow(customerRow), certificate };
    });
  }

  static async updateCertificate(tenantId: string, certId: string, input: {
    name?: string; issued_date?: string | null; expiry_date?: string | null; document_url?: string | null;
    auto_renew?: boolean; status?: string; customer_id?: string | null; non_renewal_risk?: string | null;
  }): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.name !== undefined) update['name'] = input.name;
      if (input.issued_date !== undefined) update['issued_date'] = input.issued_date ? new Date(input.issued_date) : null;
      if (input.expiry_date !== undefined) {
        update['expiry_date'] = input.expiry_date ? new Date(input.expiry_date) : null;
        // A renewed/changed expiry date needs fresh reminder stages — clear
        // the sent-at markers so the 90d/30d reminders fire again for the
        // new date instead of staying silenced from the old one.
        update['reminder_90d_sent_at'] = null;
        update['reminder_30d_sent_at'] = null;
      }
      if (input.document_url !== undefined) update['document_url'] = input.document_url;
      if (input.auto_renew !== undefined) update['auto_renew'] = input.auto_renew;
      if (input.status !== undefined) update['status'] = input.status;
      if (input.customer_id !== undefined) update['customer_id'] = input.customer_id;
      if (input.non_renewal_risk !== undefined) update['non_renewal_risk'] = input.non_renewal_risk;

      await trx
        .updateTable('comply_certificates')
        .set(update)
        .where('id', '=', certId)
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  /** Certificates are revoked, not hard-deleted — they're part of the compliance audit trail (renewals/applications may reference them). */
  static async revokeCertificate(tenantId: string, certId: string): Promise<void> {
    await withTenant(tenantId, (trx) =>
      trx.updateTable('comply_certificates')
        .set({ status: 'revoked', updated_at: new Date() })
        .where('id', '=', certId)
        .where('tenant_id', '=', tenantId)
        .execute(),
    );
  }

  // ── AI Obligation Scan ──────────────────────────────────────────────────────

  static async scanObligations(tenantId: string, input: ObligationScanInput): Promise<ObligationScanResult> {
    return withTenant(tenantId, async (trx) => {
      await trx
        .insertInto('comply_profiles')
        .values({
          tenant_id: tenantId,
          sector: input.sector,
          sub_sector: input.sub_sector ?? null,
          ownership_structure: input.ownership_structure ?? null,
          employee_band: input.employee_band ?? null,
        })
        .onConflict((oc) => oc.column('tenant_id').doUpdateSet({
          sector: input.sector,
          sub_sector: input.sub_sector ?? null,
          ownership_structure: input.ownership_structure ?? null,
          employee_band: input.employee_band ?? null,
          updated_at: new Date(),
        }))
        .execute();

      const rules = await trx
        .selectFrom('comply_obligation_rules')
        .selectAll()
        .where('jurisdiction', '=', 'TZ')
        .where((eb) => eb.or([eb('sector', 'is', null), eb('sector', '=', input.sector)]))
        .execute();

      let created = 0;
      for (const rule of rules) {
        const existing = await trx
          .selectFrom('comply_obligations')
          .select(['id'])
          .where('tenant_id', '=', tenantId)
          .where('obligation_code', '=', rule.obligation_code)
          .executeTakeFirst();
        if (existing) continue;

        await trx
          .insertInto('comply_obligations')
          .values({
            tenant_id: tenantId,
            obligation_code: rule.obligation_code,
            agency_code: rule.agency_code,
            name: rule.name,
            frequency: rule.frequency,
            mandatory: rule.mandatory,
          })
          .execute();
        created++;
      }

      return {
        profile: {
          sector: input.sector, sub_sector: input.sub_sector ?? null,
          ownership_structure: input.ownership_structure ?? null,
          employee_band: input.employee_band ?? null, jurisdiction: 'TZ',
        },
        obligations_created: created,
        obligations_matched: rules.length,
      };
    });
  }

  static async getProfile(tenantId: string) {
    return withTenant(tenantId, (trx) =>
      trx.selectFrom('comply_profiles').selectAll().where('tenant_id', '=', tenantId).executeTakeFirst(),
    );
  }
}
