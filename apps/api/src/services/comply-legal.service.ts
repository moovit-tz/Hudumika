import { db, withTenant } from '../db/client.js';
import type {
  CompLegalFirm,
  CompLegalEngagement,
  CompLegalMilestone,
  CompLegalMessage,
  CreateEngagementInput,
  LegalEngagementStatus,
  LegalMilestoneStatus,
} from '@hudumika/types';

function mapFirm(r: any): CompLegalFirm {
  return {
    id: r.id, name: r.name, initials: r.initials, color: r.color,
    specialties: r.specialties as string[], agencies_handled: r.agencies_handled as string[],
    location: r.location, founded_year: r.founded_year, rating: Number(r.rating),
    review_count: r.review_count, starting_price_label: r.starting_price_label,
    description: r.description, verified: r.verified,
  };
}

function mapMilestone(r: any): CompLegalMilestone {
  return {
    id: r.id, engagement_id: r.engagement_id, description: r.description,
    amount: r.amount, status: r.status as LegalMilestoneStatus,
    created_at: (r.created_at as Date).toISOString(),
  };
}

function mapMessage(r: any): CompLegalMessage {
  return {
    id: r.id, engagement_id: r.engagement_id, sender_type: r.sender_type as 'tenant' | 'firm',
    sender_id: r.sender_id, body: r.body, created_at: (r.created_at as Date).toISOString(),
  };
}

export class LegalMarketplaceService {

  static async getFirms(): Promise<CompLegalFirm[]> {
    const rows = await db
      .selectFrom('comply_legal_firms')
      .selectAll()
      .orderBy('rating', 'desc')
      .execute();
    return rows.map(mapFirm);
  }

  static async getEngagements(tenantId: string): Promise<CompLegalEngagement[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('comply_legal_engagements as e')
        .innerJoin('comply_legal_firms as f', 'f.id', 'e.firm_id')
        .leftJoin('customers as cu', 'cu.id', 'e.customer_id')
        .select([
          'e.id', 'e.firm_id', 'f.name as firm_name', 'e.application_id', 'e.engagement_type',
          'e.agency_code', 'e.brief', 'e.status', 'e.quoted_price', 'e.created_by',
          'e.customer_id', 'cu.name as customer_name', 'e.created_at', 'e.updated_at',
        ])
        .where('e.tenant_id', '=', tenantId)
        .orderBy('e.created_at', 'desc')
        .execute();

      const engagements: CompLegalEngagement[] = [];
      for (const r of rows) {
        const milestones = await trx
          .selectFrom('comply_legal_milestones')
          .selectAll()
          .where('engagement_id', '=', r.id)
          .orderBy('created_at', 'asc')
          .execute();
        const messages = await trx
          .selectFrom('comply_legal_messages')
          .selectAll()
          .where('engagement_id', '=', r.id)
          .orderBy('created_at', 'asc')
          .execute();

        engagements.push({
          id: r.id, firm_id: r.firm_id, firm_name: r.firm_name,
          application_id: r.application_id, engagement_type: r.engagement_type,
          agency_code: r.agency_code, brief: r.brief, status: r.status as LegalEngagementStatus,
          quoted_price: r.quoted_price, created_by: r.created_by,
          customer_id: r.customer_id, customer_name: r.customer_name,
          created_at: (r.created_at as Date).toISOString(), updated_at: (r.updated_at as Date).toISOString(),
          milestones: milestones.map(mapMilestone), messages: messages.map(mapMessage),
        });
      }
      return engagements;
    });
  }

  static async createEngagement(tenantId: string, userId: string, input: CreateEngagementInput): Promise<CompLegalEngagement> {
    return withTenant(tenantId, async (trx) => {
      const firm = await trx
        .selectFrom('comply_legal_firms')
        .select(['id', 'name'])
        .where('id', '=', input.firm_id)
        .executeTakeFirstOrThrow();

      if (input.customer_id) {
        await trx.selectFrom('customers').select('id')
          .where('id', '=', input.customer_id).where('tenant_id', '=', tenantId)
          .executeTakeFirstOrThrow();
      }

      const row = await trx
        .insertInto('comply_legal_engagements')
        .values({
          tenant_id: tenantId,
          firm_id: input.firm_id,
          application_id: input.application_id ?? null,
          engagement_type: input.engagement_type,
          agency_code: input.agency_code ?? null,
          brief: input.brief,
          created_by: userId,
          customer_id: input.customer_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Seed the shared workspace with the client's opening brief.
      await trx
        .insertInto('comply_legal_messages')
        .values({ engagement_id: row.id, sender_type: 'tenant', sender_id: userId, body: input.brief })
        .execute();

      return {
        id: row.id, firm_id: row.firm_id, firm_name: firm.name, application_id: row.application_id,
        engagement_type: row.engagement_type, agency_code: row.agency_code, brief: row.brief,
        status: row.status as LegalEngagementStatus, quoted_price: row.quoted_price,
        created_by: row.created_by, customer_id: row.customer_id, customer_name: null,
        created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(), milestones: [],
        messages: [{ id: '', engagement_id: row.id, sender_type: 'tenant', sender_id: userId, body: input.brief, created_at: (row.created_at as Date).toISOString() }],
      };
    });
  }

  static async deleteEngagement(tenantId: string, engagementId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const result = await trx
        .deleteFrom('comply_legal_engagements')
        .where('id', '=', engagementId)
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'requested')
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new Error('Only engagements still awaiting a quote can be cancelled/deleted — use status "cancelled" for engagements already in progress.');
      }
    });
  }

  static async updateEngagementStatus(tenantId: string, engagementId: string, status: LegalEngagementStatus): Promise<void> {
    await withTenant(tenantId, (trx) =>
      trx.updateTable('comply_legal_engagements')
        .set({ status, updated_at: new Date() })
        .where('id', '=', engagementId)
        .where('tenant_id', '=', tenantId)
        .execute(),
    );
  }

  static async addMessage(tenantId: string, engagementId: string, userId: string, body: string): Promise<CompLegalMessage> {
    return withTenant(tenantId, async (trx) => {
      // tenant_id filter via the parent engagement, since messages carry no tenant_id of their own
      await trx.selectFrom('comply_legal_engagements').select('id')
        .where('id', '=', engagementId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();

      const row = await trx
        .insertInto('comply_legal_messages')
        .values({ engagement_id: engagementId, sender_type: 'tenant', sender_id: userId, body })
        .returningAll()
        .executeTakeFirstOrThrow();
      return mapMessage(row);
    });
  }

  static async setMilestoneStatus(tenantId: string, engagementId: string, milestoneId: string, status: LegalMilestoneStatus): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx.selectFrom('comply_legal_engagements').select('id')
        .where('id', '=', engagementId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();

      await trx
        .updateTable('comply_legal_milestones')
        .set({ status, updated_at: new Date() })
        .where('id', '=', milestoneId)
        .where('engagement_id', '=', engagementId)
        .execute();
    });
  }
}
