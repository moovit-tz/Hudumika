import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { db, dbPlatform, withTenant } from '../db/client.js';

const TENANT_A = '00000000-0000-0000-0000-000000000001';
const TENANT_B = '00000000-0000-0000-0000-000000000099';

const DOMAIN_TABLES = [
  'finance_property_units',
  'finance_leases',
  'finance_lease_charges',
  'finance_boq_items',
  'finance_progress_certificates',
  'finance_progress_measurements',
  'finance_vehicle_records',
  'finance_job_cards',
  'finance_insurance_policies',
  'finance_insurance_claims',
  'finance_loans',
  'finance_loan_schedule',
  'finance_loan_repayments',
] as const;

async function cleanDomainTables(tenantId: string) {
  await withTenant(tenantId, async trx => {
    for (const table of [...DOMAIN_TABLES].reverse()) {
      await sql`DELETE FROM ${sql.table(table)} WHERE tenant_id = ${tenantId}`.execute(trx);
    }
  });
}

async function ensureTestTenant(id: string, slug: string, name: string) {
  const exists = await dbPlatform.selectFrom('tenants').select('id')
    .where('id', '=', id).executeTakeFirst();
  if (!exists) {
    await dbPlatform.insertInto('tenants').values({ id, slug, name } as any).execute();
  }
}

describe('Migration 621 — industry domain tables', () => {
  beforeAll(async () => {
    await ensureTestTenant(TENANT_A, 'test-tenant-a', 'Test Tenant A');
    await ensureTestTenant(TENANT_B, 'test-tenant-b', 'Test Tenant B');
  });

  afterAll(async () => {
    await cleanDomainTables(TENANT_A);
    await cleanDomainTables(TENANT_B);
  });

  describe('table existence and RLS', () => {
    for (const table of DOMAIN_TABLES) {
      it(`${table} exists with RLS enabled + forced`, async () => {
        const result = await sql<{ relforcerowsecurity: boolean }>`
          SELECT relforcerowsecurity FROM pg_class WHERE relname = ${table}
        `.execute(db);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].relforcerowsecurity).toBe(true);
      });
    }
  });

  describe('property / rentals', () => {
    it('rejects invalid unit_type', async () => {
      await expect(withTenant(TENANT_A, async trx =>
        trx.insertInto('finance_property_units').values({
          tenant_id: TENANT_A, name: 'Test', unit_type: 'spaceship' as any,
        }).execute()
      )).rejects.toThrow();
    });

    it('rejects invalid unit status', async () => {
      await expect(withTenant(TENANT_A, async trx =>
        trx.insertInto('finance_property_units').values({
          tenant_id: TENANT_A, name: 'Test', unit_type: 'residential', status: 'destroyed' as any,
        }).execute()
      )).rejects.toThrow();
    });

    it('rejects non-positive rent', async () => {
      await expect(withTenant(TENANT_A, async trx => {
        const unit = await trx.insertInto('finance_property_units').values({
          tenant_id: TENANT_A, name: 'Unit A', unit_type: 'commercial',
        }).returningAll().executeTakeFirstOrThrow();
        const work = await trx.selectFrom('finance_industry_work').select('id')
          .where('tenant_id', '=', TENANT_A).executeTakeFirst();
        await trx.insertInto('finance_leases').values({
          tenant_id: TENANT_A, work_id: work?.id ?? '00000000-0000-0000-0000-000000000000',
          unit_id: unit.id, tenant_name: 'Tenant', lease_start: '2026-01-01',
          rent_amount: -500, rent_currency: 'TZS',
        }).execute();
      })).rejects.toThrow();
    });
  });

  describe('construction — BOQ', () => {
    it('rejects negative BOQ quantity', async () => {
      await expect(withTenant(TENANT_A, async trx => {
        const work = await trx.selectFrom('finance_industry_work').select('id')
          .where('tenant_id', '=', TENANT_A).executeTakeFirst();
        await trx.insertInto('finance_boq_items').values({
          tenant_id: TENANT_A, work_id: work?.id ?? '00000000-0000-0000-0000-000000000000',
          item_no: 'A1', description: 'Excavation', quantity: -10, rate: 100,
        }).execute();
      })).rejects.toThrow();
    });
  });

  describe('automotive — job cards', () => {
    it('rejects invalid job card status', async () => {
      await expect(withTenant(TENANT_A, async trx => {
        const work = await trx.selectFrom('finance_industry_work').select('id')
          .where('tenant_id', '=', TENANT_A).executeTakeFirst();
        const vehicle = await trx.insertInto('finance_vehicle_records').values({
          tenant_id: TENANT_A, registration: 'T999ZZZ',
        }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('finance_job_cards').values({
          tenant_id: TENANT_A, work_id: work?.id ?? '00000000-0000-0000-0000-000000000000',
          vehicle_id: vehicle.id, reported_fault: 'Test', status: 'flying' as any,
        }).execute();
      })).rejects.toThrow();
    });
  });

  describe('insurance — policies and claims', () => {
    it('rejects non-positive sum insured', async () => {
      await expect(withTenant(TENANT_A, async trx => {
        const work = await trx.selectFrom('finance_industry_work').select('id')
          .where('tenant_id', '=', TENANT_A).executeTakeFirst();
        await trx.insertInto('finance_insurance_policies').values({
          tenant_id: TENANT_A, work_id: work?.id ?? '00000000-0000-0000-0000-000000000000',
          policy_number: 'POL-001', policy_type: 'motor', holder_name: 'Test',
          coverage_start: '2026-01-01', coverage_end: '2027-01-01',
          sum_insured: 0, premium_amount: 100,
        }).execute();
      })).rejects.toThrow();
    });

    it('rejects invalid claim status', async () => {
      await expect(withTenant(TENANT_A, async trx =>
        sql`INSERT INTO finance_insurance_claims (tenant_id, policy_id, claim_number, incident_date, description, claim_amount, status)
            VALUES (${TENANT_A}, gen_random_uuid(), 'CLM-001', '2026-06-01', 'test', 1000, 'magic')`.execute(trx)
      )).rejects.toThrow();
    });
  });

  describe('lending — loans', () => {
    it('rejects non-positive principal', async () => {
      await expect(withTenant(TENANT_A, async trx => {
        const work = await trx.selectFrom('finance_industry_work').select('id')
          .where('tenant_id', '=', TENANT_A).executeTakeFirst();
        await trx.insertInto('finance_loans').values({
          tenant_id: TENANT_A, work_id: work?.id ?? '00000000-0000-0000-0000-000000000000',
          loan_number: 'LN-001', product_name: 'Personal', borrower_name: 'Test',
          principal: -1000, interest_rate: 12, term_months: 12,
        }).execute();
      })).rejects.toThrow();
    });

    it('rejects non-positive term', async () => {
      await expect(withTenant(TENANT_A, async trx => {
        const work = await trx.selectFrom('finance_industry_work').select('id')
          .where('tenant_id', '=', TENANT_A).executeTakeFirst();
        await trx.insertInto('finance_loans').values({
          tenant_id: TENANT_A, work_id: work?.id ?? '00000000-0000-0000-0000-000000000000',
          loan_number: 'LN-002', product_name: 'Personal', borrower_name: 'Test',
          principal: 10000, interest_rate: 12, term_months: 0,
        }).execute();
      })).rejects.toThrow();
    });

    it('rejects non-positive repayment amount', async () => {
      await expect(withTenant(TENANT_A, async trx =>
        sql`INSERT INTO finance_loan_repayments (tenant_id, loan_id, amount)
            VALUES (${TENANT_A}, gen_random_uuid(), -500)`.execute(trx)
      )).rejects.toThrow();
    });
  });

  describe('cross-tenant isolation', () => {
    it('tenant B cannot see tenant A property units', async () => {
      await withTenant(TENANT_A, async trx => {
        await trx.insertInto('finance_property_units').values({
          tenant_id: TENANT_A, name: 'Secret Unit', unit_type: 'residential',
        }).execute();
      });
      const result = await withTenant(TENANT_B, async trx =>
        trx.selectFrom('finance_property_units').selectAll()
          .where('tenant_id', '=', TENANT_A).execute()
      );
      expect(result).toHaveLength(0);
    });

    it('tenant B cannot see tenant A vehicles', async () => {
      await withTenant(TENANT_A, async trx => {
        await trx.insertInto('finance_vehicle_records').values({
          tenant_id: TENANT_A, registration: 'T123ABC',
        }).execute();
      });
      const result = await withTenant(TENANT_B, async trx =>
        trx.selectFrom('finance_vehicle_records').selectAll()
          .where('tenant_id', '=', TENANT_A).execute()
      );
      expect(result).toHaveLength(0);
    });
  });
});
