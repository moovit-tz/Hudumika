import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { PULSE_ROLES, PULSE_PUBLISH_ROLES } from './pulse.routes.js';
import { formMapping } from '../services/pulse-attribution.service.js';

const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);

const settingsBody = z.object({
  enabled: z.boolean(),
  create_lead: z.boolean(),
  email_field: z.string().max(60).nullable(),
  name_field: z.string().max(60).nullable(),
  phone_field: z.string().max(60).nullable(),
  company_field: z.string().max(60).nullable(),
  consent_field: z.string().max(60).nullable(),
  consent_value: z.string().max(200).nullable(),
});

export async function pulseFormRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  // CMS forms, seen from marketing: how many people each one brought in.
  // Forms are built and placed on pages in the CMS; Pulse only decides what
  // a submission becomes.
  fastify.get('/forms', async (request) => {
    const { tenant_id } = request.user;
    const q = request.query as { days?: string };
    const days = [7, 30, 90, 365].includes(Number(q.days)) ? Number(q.days) : 30;
    const since = new Date(Date.now() - days * 86400_000);
    return withTenant(tenant_id, async (trx) => {
      const forms = await trx.selectFrom('cms_forms').select(['id', 'key', 'name', 'fields', 'updated_at',
        sql<string>`(SELECT count(*) FROM cms_form_submissions s WHERE s.form_id = cms_forms.id AND s.created_at >= ${since})`.as('submissions'),
        sql<string>`(SELECT count(*) FROM pulse_touchpoints t WHERE t.form_id = cms_forms.id AND t.occurred_at >= ${since})`.as('people'),
        sql<string>`(SELECT count(*) FROM pulse_conversions c JOIN pulse_touchpoints t ON t.id = c.last_touch_id WHERE t.form_id = cms_forms.id AND c.kind = 'lead' AND c.occurred_at >= ${since})`.as('leads')])
        .where('tenant_id', '=', tenant_id).orderBy('name').execute();
      const settings = await trx.selectFrom('pulse_form_settings').select(['form_id', 'enabled', 'create_lead']).where('tenant_id', '=', tenant_id).execute();
      return {
        data: forms.map((f) => {
          const s = settings.find((x) => x.form_id === f.id);
          return { id: f.id, key: f.key, name: f.name, field_count: (parse(f.fields) ?? []).length, updated_at: f.updated_at,
            submissions: Number(f.submissions), people: Number(f.people), leads: Number(f.leads),
            enabled: s ? s.enabled : true, create_lead: s ? s.create_lead : false, configured: !!s };
        }),
        days,
      };
    });
  });

  fastify.get('/forms/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      const f = await trx.selectFrom('cms_forms').select(['id', 'key', 'name', 'fields']).where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!f) return reply.status(404).send({ error: 'Form not found' });
      const fields = parse(f.fields) ?? [];
      const utm = await trx.selectFrom('pulse_touchpoints').select([sql<string>`coalesce(utm_campaign, '')`.as('campaign'), sql<string>`coalesce(utm_source, '')`.as('source'), sql<string>`count(*)`.as('n')])
        .where('tenant_id', '=', tenant_id).where('form_id', '=', id).groupBy([sql`coalesce(utm_campaign, '')`, sql`coalesce(utm_source, '')`])
        .orderBy(sql`count(*)`, 'desc').limit(20).execute();
      return { data: { id: f.id, key: f.key, name: f.name, fields, mapping: await formMapping(trx, tenant_id, id, fields), sources: utm.map((u) => ({ campaign: u.campaign || null, source: u.source || null, n: Number(u.n) })) } };
    });
  });

  fastify.put('/forms/:id/settings', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    const parsed = settingsBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' });
    const d = parsed.data;
    return withTenant(tenant_id, async (trx) => {
      const f = await trx.selectFrom('cms_forms').select(['fields']).where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!f) return reply.status(404).send({ error: 'Form not found' });
      const fields = (parse(f.fields) ?? []) as { key: string; type: string; options?: string[] }[];
      const has = (k: string | null) => !k || fields.some((x) => x.key === k);
      if (![d.email_field, d.name_field, d.phone_field, d.company_field, d.consent_field].every(has)) return reply.status(400).send({ error: 'One of the chosen fields is no longer on this form' });
      if (!d.email_field && !d.phone_field && d.enabled) return reply.status(400).send({ error: 'Choose the field with the email address or phone number' });
      if (d.consent_field) {
        const cf = fields.find((x) => x.key === d.consent_field);
        if (cf?.type !== 'select') return reply.status(400).send({ error: 'Consent must come from a question with set answers (a drop-down)' });
        if (!d.consent_value || !(cf.options ?? []).includes(d.consent_value)) return reply.status(400).send({ error: 'Choose which answer means “yes, you may contact me”' });
      }
      const values = { ...d, consent_value: d.consent_field ? d.consent_value : null, updated_by: sub, updated_at: new Date() };
      const row = await trx.insertInto('pulse_form_settings').values({ tenant_id, form_id: id, ...values })
        .onConflict((oc) => oc.columns(['tenant_id', 'form_id']).doUpdateSet(values)).returningAll().executeTakeFirstOrThrow();
      return { data: row };
    });
  });

  // ── Attribution ───────────────────────────────────────────────────────────

  fastify.get('/attribution', async (request) => {
    const { tenant_id } = request.user;
    const q = request.query as { days?: string; model?: string };
    const days = [7, 30, 90, 365].includes(Number(q.days)) ? Number(q.days) : 90;
    const model = q.model === 'first' ? 'first_touch_id' : 'last_touch_id';
    const since = new Date(Date.now() - days * 86400_000);
    return withTenant(tenant_id, async (trx) => {
      const rows = await trx.selectFrom('pulse_conversions as c')
        .leftJoin('pulse_touchpoints as t', (join) => join.onRef('t.id', '=', model === 'first_touch_id' ? 'c.first_touch_id' : 'c.last_touch_id'))
        .leftJoin('pulse_campaigns as p', 'p.id', 't.campaign_id')
        .leftJoin('cms_forms as f', 'f.id', 't.form_id')
        .select([
          sql<string>`CASE WHEN t.id IS NULL THEN 'none' WHEN t.campaign_id IS NOT NULL THEN 'campaign' WHEN t.utm_campaign IS NOT NULL OR t.utm_source IS NOT NULL THEN 'tagged' ELSE 'form' END`.as('kind_of_touch'),
          't.campaign_id', 'p.name as campaign_name', 'p.channel as campaign_channel', 'p.journey_id',
          't.utm_campaign', 't.utm_source', 'f.name as form_name',
          sql<string>`count(*) FILTER (WHERE c.kind = 'lead')`.as('leads'),
          sql<string>`count(*) FILTER (WHERE c.kind = 'deal_won')`.as('deals'),
          sql<string>`coalesce(sum(c.value) FILTER (WHERE c.kind = 'deal_won'), 0)`.as('deal_value'),
          sql<string>`count(*) FILTER (WHERE c.kind = 'payment')`.as('payments'),
          sql<string>`coalesce(sum(c.value) FILTER (WHERE c.kind = 'payment'), 0)`.as('paid'),
        ])
        .where('c.tenant_id', '=', tenant_id).where('c.occurred_at', '>=', since)
        .groupBy([sql`1`, 't.campaign_id', 'p.name', 'p.channel', 'p.journey_id', 't.utm_campaign', 't.utm_source', 'f.name'])
        .execute();
      const data = rows.map((r) => ({
        ...r, leads: Number(r.leads), deals: Number(r.deals), deal_value: Number(r.deal_value), payments: Number(r.payments), paid: Number(r.paid),
      })).sort((a, b) => (b.paid + b.deal_value) - (a.paid + a.deal_value) || b.leads - a.leads);
      return { data, days, model: q.model === 'first' ? 'first' : 'last' };
    });
  });
}
