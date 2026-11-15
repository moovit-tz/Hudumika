// Pulse forms and attribution (migration 780): a website form submission
// becomes a contact (and a lead when asked), records consent only on a clear
// yes, keeps the UTM tags it arrived with, and conversions credit the right
// touch — a form from a tagged link, or a click in a Pulse email.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Pulse forms and attribution', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant;
  let slug: string, formId: string;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({ method, url, headers: authHeaders(A.token), payload: payload as any });
  const waitFor = async <T>(fn: () => Promise<T | undefined | null>, ms = 6000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 150)); }
  };
  const submit = (body: Record<string, string>) => app.inject({ method: 'POST', url: `/v1/cms/public/${slug}/forms/contact_us/submit`, payload: body });
  const contactByEmail = (email: string) => withTenant(A.tenantId, (trx) => trx.selectFrom('contacts').selectAll().where('tenant_id', '=', A.tenantId).where('email', '=', email).executeTakeFirst());

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', A.tenantId).execute();
    slug = (await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow()).slug!;
    const f = await withTenant(A.tenantId, (trx) => trx.insertInto('cms_forms').values({
      tenant_id: A.tenantId, key: 'contact_us', name: 'Contact us',
      fields: JSON.stringify([
        { key: 'full_name', label: 'Full name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'company', label: 'Company', type: 'text', required: false },
        { key: 'updates', label: 'May we email you updates?', type: 'select', required: false, options: ['Yes', 'No'] },
      ]),
    } as any).returning('id').executeTakeFirstOrThrow());
    formId = f.id;
  }, 120_000);

  afterAll(async () => {
    // cms_forms keys tenant_id as text with no cascade, so remove them by hand.
    await withTenant(A.tenantId, async (trx) => {
      await trx.deleteFrom('cms_form_submissions').where('tenant_id', '=', A.tenantId).execute();
      await trx.deleteFrom('cms_forms').where('tenant_id', '=', A.tenantId).execute();
    }).catch(() => {});
    await A?.cleanup();
  }, 240_000);

  it('guesses the field mapping, including the consent question', async () => {
    const m = (await call('GET', `/v1/pulse/forms/${formId}`)).json().data.mapping;
    expect(m).toMatchObject({ email_field: 'email', name_field: 'full_name', company_field: 'company', consent_field: 'updates', consent_value: 'Yes', saved: false });
  });

  it('turns a submission into a contact, with consent only on a yes and the UTM tags kept', async () => {
    expect((await submit({ full_name: 'Zawadi Kimaro', email: 'Zawadi@Example.test', company: 'Mbeya Mills', updates: 'Yes', _utm_source: 'facebook', _utm_campaign: 'harvest' })).statusCode).toBe(201);
    expect((await submit({ full_name: 'Juma Said', email: 'juma@example.test', updates: 'No' })).statusCode).toBe(201);
    const zawadi = await waitFor(() => contactByEmail('zawadi@example.test'));
    expect(zawadi).toMatchObject({ first_name: 'Zawadi', last_name: 'Kimaro', company: 'Mbeya Mills', source: 'website_form' });
    await waitFor(() => contactByEmail('juma@example.test'));
    const consents = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_consents').select(['address', 'status', 'source']).where('tenant_id', '=', A.tenantId).execute());
    expect(consents).toEqual([{ address: 'zawadi@example.test', status: 'subscribed', source: 'form' }]);
    const touch = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_touchpoints').selectAll().where('person_key', '=', 'zawadi@example.test').executeTakeFirstOrThrow());
    expect(touch).toMatchObject({ channel: 'form', form_id: formId, utm_source: 'facebook', utm_campaign: 'harvest' });
    // A second submission from the same person reuses the contact.
    await submit({ full_name: 'Zawadi K', email: 'zawadi@example.test' });
    await new Promise((r) => setTimeout(r, 800));
    const all = await withTenant(A.tenantId, (trx) => trx.selectFrom('contacts').select('id').where('tenant_id', '=', A.tenantId).where('email', 'ilike', 'zawadi@example.test').execute());
    expect(all).toHaveLength(1);
  });

  it('opens a lead when asked, and credits it to the tagged form', async () => {
    const s = await call('PUT', `/v1/pulse/forms/${formId}/settings`, {
      enabled: true, create_lead: true, email_field: 'email', name_field: 'full_name', phone_field: null, company_field: 'company', consent_field: 'updates', consent_value: 'Yes',
    });
    expect(s.statusCode).toBe(200);
    await submit({ full_name: 'Baraka Mushi', email: 'baraka.m@example.test', company: 'Tanga Fresh', _utm_source: 'newsletter', _utm_campaign: 'q4-promo' });
    const lead = await waitFor(() => withTenant(A.tenantId, (trx) => trx.selectFrom('leads').selectAll().where('tenant_id', '=', A.tenantId).where('contact_email', '=', 'baraka.m@example.test').executeTakeFirst()));
    expect(lead).toMatchObject({ company: 'Tanga Fresh', source: 'Web Form' });
    const conv = await waitFor(() => withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_conversions').selectAll().where('tenant_id', '=', A.tenantId).where('entity_id', '=', lead.id).executeTakeFirst()));
    expect(conv.kind).toBe('lead');
    expect(conv.last_touch_id).toBeTruthy();
    const report = (await call('GET', '/v1/pulse/attribution?days=30')).json().data;
    expect(report.find((r: any) => r.utm_campaign === 'q4-promo')).toMatchObject({ leads: 1, form_name: 'Contact us' });
  });

  it('rejects settings that point at missing fields or treat free text as consent', async () => {
    const bad = await call('PUT', `/v1/pulse/forms/${formId}/settings`, { enabled: true, create_lead: false, email_field: 'nope', name_field: null, phone_field: null, company_field: null, consent_field: null, consent_value: null });
    expect(bad.statusCode).toBe(400);
    const freeText = await call('PUT', `/v1/pulse/forms/${formId}/settings`, { enabled: true, create_lead: false, email_field: 'email', name_field: null, phone_field: null, company_field: null, consent_field: 'company', consent_value: 'yes' });
    expect(freeText.statusCode).toBe(400);
  });

  it('credits a won deal to the email click that came before it', async () => {
    const c = await withTenant(A.tenantId, (trx) => trx.insertInto('contacts').values({ tenant_id: A.tenantId, first_name: 'Neema', email: 'neema.a@example.test', company: 'Attr Co' } as any).execute());
    void c;
    const seg = await call('POST', '/v1/pulse/segments', { name: 'Attr Co', source: 'contacts', match_type: 'all', rules: [{ field: 'company', op: 'eq', value: 'Attr Co' }] });
    const camp = await call('POST', '/v1/pulse/campaigns', { name: 'Offer', channel: 'email', segment_id: seg.json().data.id, subject: 'Offer', body_html: '<a href="https://example.com/x">x</a>' });
    const id = camp.json().data.id;
    await call('POST', `/v1/pulse/campaigns/${id}/launch`, {});
    const { advanceCampaign } = await import('../services/pulse-campaigns.service.js');
    await advanceCampaign(A.tenantId, id);
    const send = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_sends').select('token').where('campaign_id', '=', id).executeTakeFirstOrThrow());
    expect((await app.inject({ method: 'GET', url: `/v1/pulse-public/c/${send.token}/1` })).statusCode).toBe(302);
    // The contact becomes a lead and the deal is won.
    const lead = await withTenant(A.tenantId, (trx) => trx.insertInto('leads').values({ tenant_id: A.tenantId, company: 'Attr Co', contact_name: 'Neema', contact_email: 'neema.a@example.test' } as any).returning('id').executeTakeFirstOrThrow());
    const deal = await withTenant(A.tenantId, (trx) => trx.insertInto('deals').values({ tenant_id: A.tenantId, name: 'Attr deal', lead_id: lead.id, value: 2500000, created_by: A.userId } as any).returning('id').executeTakeFirstOrThrow());
    const { emitDomainEventStandalone } = await import('../services/domain-events.service.js');
    await emitDomainEventStandalone(A.tenantId, { type: 'deal.won', sourceApp: 'crm', entityType: 'deal', entityId: deal.id, payload: { name: 'Attr deal', value: 2500000, customerId: null } });
    await waitFor(() => withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_conversions').select('id').where('entity_id', '=', deal.id).executeTakeFirst()));
    const report = (await call('GET', '/v1/pulse/attribution?days=30')).json().data;
    expect(report.find((r: any) => r.campaign_id === id)).toMatchObject({ deals: 1, deal_value: 2500000, campaign_name: 'Offer' });
  });
});
