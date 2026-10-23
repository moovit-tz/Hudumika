// Workstream A: party_channels sync — verifies migration 617 fixes:
//   - customer email/phone/phone_wa UPDATE → party_channels updated
//   - supplier email/phone UPDATE → party_channels updated
//   - clearing a field deactivates the managed channel
//   - independently managed channels are not affected
//   - provenance columns are set correctly
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, type TestTenant } from './helpers.js';

describe('Party channel sync (mig 617)', () => {
  let T: TestTenant;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
  });
  afterAll(async () => { await T.cleanup(); });

  const channels = (partyId: string) =>
    dbPlatform.selectFrom('party_channels')
      .select(['channel_type', 'normalized_value', 'status', 'source_entity', 'source_field'] as any)
      .where('party_id', '=', partyId)
      .where('tenant_id', '=', T.tenantId)
      .orderBy('channel_type')
      .orderBy('source_field')
      .execute() as Promise<{ channel_type: string; normalized_value: string; status: string; source_entity: string | null; source_field: string | null }[]>;

  describe('customer email/phone updates', () => {
    it('INSERT creates channels with provenance', async () => {
      const c = await dbPlatform.insertInto('customers').values({
        tenant_id: T.tenantId, name: 'ChanTest Co',
        email: 'Sales@ChanTest.test', phone: '+255 712 000 001',
      } as any).returning(['id', 'party_id'] as any).executeTakeFirstOrThrow() as any;

      const ch = await channels(c.id);
      expect(ch).toEqual(expect.arrayContaining([
        expect.objectContaining({
          channel_type: 'EMAIL', normalized_value: 'sales@chantest.test',
          status: 'ACTIVE', source_entity: 'customers', source_field: 'email',
        }),
        expect.objectContaining({
          channel_type: 'PHONE', normalized_value: '+255712000001',
          status: 'ACTIVE', source_entity: 'customers', source_field: 'phone',
        }),
      ]));
    });

    it('UPDATE email syncs the managed channel', async () => {
      const c = await dbPlatform.insertInto('customers').values({
        tenant_id: T.tenantId, name: 'EmailUpdate Co',
        email: 'old@test.test', phone: '+255 700 000 001',
      } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

      // Update email
      await dbPlatform.updateTable('customers')
        .set({ email: 'new@test.test' } as any)
        .where('id', '=', c.id).execute();

      const ch = await channels(c.id);
      const email = ch.find((r: any) => r.channel_type === 'EMAIL' && r.source_field === 'email');
      expect(email).toBeTruthy();
      expect(email!.normalized_value).toBe('new@test.test');
      expect(email!.status).toBe('ACTIVE');
    });

    it('UPDATE phone syncs the managed channel', async () => {
      const c = await dbPlatform.insertInto('customers').values({
        tenant_id: T.tenantId, name: 'PhoneUpdate Co', phone: '+255 700 111 000',
      } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

      await dbPlatform.updateTable('customers')
        .set({ phone: '+255 700 222 000' } as any)
        .where('id', '=', c.id).execute();

      const ch = await channels(c.id);
      const phone = ch.find((r: any) => r.channel_type === 'PHONE' && r.source_field === 'phone');
      expect(phone!.normalized_value).toBe('+255700222000');
    });

    it('clearing email deactivates the managed channel', async () => {
      const c = await dbPlatform.insertInto('customers').values({
        tenant_id: T.tenantId, name: 'ClearEmail Co', email: 'clear@test.test',
      } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

      await dbPlatform.updateTable('customers')
        .set({ email: null } as any)
        .where('id', '=', c.id).execute();

      const ch = await channels(c.id);
      const email = ch.find((r: any) => r.source_entity === 'customers' && r.source_field === 'email');
      expect(email!.status).toBe('INACTIVE');
    });

    it('independent channels are not affected by customer updates', async () => {
      const c = await dbPlatform.insertInto('customers').values({
        tenant_id: T.tenantId, name: 'IndepChan Co', email: 'managed@test.test',
      } as any).returning(['id', 'party_id'] as any).executeTakeFirstOrThrow() as any;

      // Add an independent channel (no source_entity)
      await dbPlatform.insertInto('party_channels').values({
        tenant_id: T.tenantId, party_id: c.id,
        channel_type: 'EMAIL', value: 'independent@other.test',
        normalized_value: 'independent@other.test',
        label: 'personal', context: 'PERSONAL', is_primary: false,
      } as any).execute();

      // Update the customer email
      await dbPlatform.updateTable('customers')
        .set({ email: 'new-managed@test.test' } as any)
        .where('id', '=', c.id).execute();

      const ch = await channels(c.id);
      const indep = ch.find((r: any) => r.normalized_value === 'independent@other.test');
      expect(indep).toBeTruthy();
      expect(indep!.status).toBe('ACTIVE');
      expect(indep!.source_entity).toBeNull();
    });
  });

  describe('customer phone_wa (WhatsApp)', () => {
    it('INSERT with phone_wa creates WHATSAPP channel', async () => {
      const c = await dbPlatform.insertInto('customers').values({
        tenant_id: T.tenantId, name: 'WA Test Co',
        phone_wa: '+255 789 000 001',
      } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

      const ch = await channels(c.id);
      const wa = ch.find((r: any) => r.channel_type === 'WHATSAPP');
      expect(wa).toBeTruthy();
      expect(wa!.normalized_value).toBe('+255789000001');
      expect(wa!.source_field).toBe('phone_wa');
    });

    it('UPDATE phone_wa syncs WHATSAPP channel', async () => {
      const c = await dbPlatform.insertInto('customers').values({
        tenant_id: T.tenantId, name: 'WA Update Co',
        phone_wa: '+255 789 111 000',
      } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

      await dbPlatform.updateTable('customers')
        .set({ phone_wa: '+255 789 222 000' } as any)
        .where('id', '=', c.id).execute();

      const ch = await channels(c.id);
      const wa = ch.find((r: any) => r.channel_type === 'WHATSAPP');
      expect(wa!.normalized_value).toBe('+255789222000');
    });
  });

  describe('supplier email/phone updates', () => {
    it('INSERT creates channels with provenance', async () => {
      const s = await dbPlatform.insertInto('suppliers').values({
        tenant_id: T.tenantId, name: 'SupChan Ltd',
        email: 'Orders@SupChan.test', phone: '+255 756 000 001',
      } as any).returning(['id', 'party_id'] as any).executeTakeFirstOrThrow() as any;

      const ch = await channels(s.id);
      expect(ch).toEqual(expect.arrayContaining([
        expect.objectContaining({
          channel_type: 'EMAIL', normalized_value: 'orders@supchan.test',
          source_entity: 'suppliers', source_field: 'email',
        }),
        expect.objectContaining({
          channel_type: 'PHONE', normalized_value: '+255756000001',
          source_entity: 'suppliers', source_field: 'phone',
        }),
      ]));
    });

    it('UPDATE email syncs supplier managed channel', async () => {
      const s = await dbPlatform.insertInto('suppliers').values({
        tenant_id: T.tenantId, name: 'SupEmailUpd Ltd', email: 'old@sup.test',
      } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

      await dbPlatform.updateTable('suppliers')
        .set({ email: 'new@sup.test' } as any)
        .where('id', '=', s.id).execute();

      const ch = await channels(s.id);
      const email = ch.find((r: any) => r.source_entity === 'suppliers' && r.source_field === 'email');
      expect(email!.normalized_value).toBe('new@sup.test');
    });

    it('clearing supplier phone deactivates managed channel', async () => {
      const s = await dbPlatform.insertInto('suppliers').values({
        tenant_id: T.tenantId, name: 'SupClearPhone Ltd', phone: '+255 756 999 000',
      } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

      await dbPlatform.updateTable('suppliers')
        .set({ phone: null } as any)
        .where('id', '=', s.id).execute();

      const ch = await channels(s.id);
      const phone = ch.find((r: any) => r.source_entity === 'suppliers' && r.source_field === 'phone');
      expect(phone!.status).toBe('INACTIVE');
    });
  });

  describe('cross-tenant isolation', () => {
    it('channel sync does not leak across tenants', async () => {
      const T2 = await createTestTenant('TENANT_ADMIN');
      try {
        const c1 = await dbPlatform.insertInto('customers').values({
          tenant_id: T.tenantId, name: 'Tenant1 Co', email: 'a@t1.test',
        } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

        const c2 = await dbPlatform.insertInto('customers').values({
          tenant_id: T2.tenantId, name: 'Tenant2 Co', email: 'a@t2.test',
        } as any).returning(['id'] as any).executeTakeFirstOrThrow() as any;

        // Update T1's email — should not touch T2
        await dbPlatform.updateTable('customers')
          .set({ email: 'updated@t1.test' } as any)
          .where('id', '=', c1.id).execute();

        const ch2 = await dbPlatform.selectFrom('party_channels')
          .select(['normalized_value'] as any)
          .where('party_id', '=', c2.id)
          .where('tenant_id', '=', T2.tenantId)
          .execute();
        expect(ch2).toEqual([expect.objectContaining({ normalized_value: 'a@t2.test' })]);
      } finally {
        await T2.cleanup();
      }
    });
  });
});
