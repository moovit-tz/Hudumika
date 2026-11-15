import { sql, type Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { normalizePhone } from '../lib/phone.js';
import { PulseConsent } from './pulse-segments.service.js';
import { emitDomainEventStandalone, registerSubscriber, type DomainEvent } from './domain-events.service.js';

/**
 * Pulse forms and attribution.
 *
 * A CMS form submission becomes a contact (and, if the form says so, a CRM
 * lead), records consent only when the form asked for it and the person said
 * yes, and leaves a touchpoint carrying the UTM tags of the link they came
 * from. Clicks on Pulse messages leave touchpoints too.
 *
 * A conversion — lead created, deal won, payment received — is credited to
 * the person's first and last touchpoint in the 90 days before it. People are
 * matched by email, else phone, so a contact who clicked an email and the CRM
 * lead or customer they became are recognised as the same person. Browsing is
 * never tracked: CMS page views stay anonymous by design.
 */

const LOOKBACK_DAYS = 90;
const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);

export function personKey(email?: string | null, phone?: string | null): string | null {
  const e = email?.trim().toLowerCase();
  if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return e;
  return normalizePhone(phone ?? null);
}

export async function recordTouch(trx: Transaction<Database>, tenantId: string, t: {
  key: string; channel: 'email' | 'sms' | 'whatsapp' | 'form'; campaignId?: string | null; formId?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string } | null;
}) {
  await trx.insertInto('pulse_touchpoints').values({
    tenant_id: tenantId, person_key: t.key, channel: t.channel, campaign_id: t.campaignId ?? null, form_id: t.formId ?? null,
    utm_source: t.utm?.source?.slice(0, 80) ?? null, utm_medium: t.utm?.medium?.slice(0, 80) ?? null, utm_campaign: t.utm?.campaign?.slice(0, 80) ?? null,
  }).execute();
}

// ── Forms ────────────────────────────────────────────────────────────────────

interface FormField { key: string; label: string; type: string; options?: string[] }
export interface FormMapping { enabled: boolean; create_lead: boolean; email_field: string | null; name_field: string | null; phone_field: string | null; company_field: string | null; consent_field: string | null; consent_value: string | null }

/** Best guess at which field is which, used until someone saves settings. */
export function guessMapping(fields: FormField[]): FormMapping {
  const find = (re: RegExp, type?: string) => fields.find((f) => (type && f.type === type) || re.test(`${f.key} ${f.label}`))?.key ?? null;
  const consent = fields.find((f) => f.type === 'select' && /consent|subscribe|newsletter|marketing|updates|email you|contact you/i.test(`${f.key} ${f.label}`));
  return {
    enabled: true, create_lead: false,
    email_field: fields.find((f) => f.type === 'email')?.key ?? find(/e-?mail/i),
    name_field: find(/(^|_)(full_)?name\b|your name|jina/i),
    phone_field: find(/phone|mobile|simu|whatsapp|tel/i),
    company_field: find(/company|organi[sz]ation|business|kampuni/i),
    consent_field: consent?.key ?? null,
    consent_value: consent?.options?.find((o) => /^(yes|ndiyo|i agree|agree|opt in)/i.test(o)) ?? null,
  };
}

export async function formMapping(trx: Transaction<Database>, tenantId: string, formId: string, fields: FormField[]): Promise<FormMapping & { saved: boolean }> {
  const row = await trx.selectFrom('pulse_form_settings').selectAll().where('tenant_id', '=', tenantId).where('form_id', '=', formId).executeTakeFirst();
  if (!row) return { ...guessMapping(fields), saved: false };
  return { enabled: row.enabled, create_lead: row.create_lead, email_field: row.email_field, name_field: row.name_field, phone_field: row.phone_field, company_field: row.company_field, consent_field: row.consent_field, consent_value: row.consent_value, saved: true };
}

/** Handles one stored submission. Idempotent per submission: a replayed event finds the contact it already made. */
export async function handleFormSubmission(tenantId: string, formId: string, submissionId: string) {
  const outcome = await withTenant(tenantId, async (trx) => {
    const form = await trx.selectFrom('cms_forms').select(['id', 'name', 'fields']).where('tenant_id', '=', tenantId).where('id', '=', formId).executeTakeFirst();
    const sub = await trx.selectFrom('cms_form_submissions').select(['id', 'data', 'created_at']).where('tenant_id', '=', tenantId).where('id', '=', submissionId).executeTakeFirst();
    if (!form || !sub) throw new Error('Form submission not visible yet'); // the event bus retries
    const fields = (parse(form.fields) ?? []) as FormField[];
    const m = await formMapping(trx, tenantId, formId, fields);
    if (!m.enabled) return null;
    const data = (parse(sub.data) ?? {}) as Record<string, any>;
    const get = (k: string | null) => (k && typeof data[k] === 'string' ? data[k].trim() : '');
    const email = get(m.email_field).toLowerCase(), phone = get(m.phone_field), name = get(m.name_field), company = get(m.company_field);
    const key = personKey(email, phone);
    if (!key) return null; // nothing to reach them on — the submission stays in the CMS only

    // Find the person in Contacts by email, else phone; create them if new.
    let contact = email
      ? await trx.selectFrom('contacts').select('id').where('tenant_id', '=', tenantId).where(sql<boolean>`lower(email) = ${email}`).executeTakeFirst()
      : undefined;
    if (!contact && phone) {
      const p9 = normalizePhone(phone);
      contact = await trx.selectFrom('contacts').select('id').where('tenant_id', '=', tenantId)
        .where(sql<boolean>`right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 9) = ${p9}`).executeTakeFirst();
    }
    let created = false;
    if (!contact) {
      const [first, ...rest] = (name || email.split('@')[0] || 'Website visitor').split(/\s+/);
      contact = await trx.insertInto('contacts').values({
        tenant_id: tenantId, first_name: first.slice(0, 100), last_name: rest.join(' ').slice(0, 100) || null,
        email: email || null, phone: phone || null, company: company || null, source: 'website_form',
        notes: `From the website form “${form.name}”.`,
      } as any).returning('id').executeTakeFirstOrThrow();
      created = true;
    }

    // Consent only when the form asked and they said yes — never assumed.
    const said = get(m.consent_field);
    if (m.consent_field && m.consent_value && said && said.toLowerCase() === m.consent_value.toLowerCase()) {
      const question = fields.find((f) => f.key === m.consent_field)?.label ?? m.consent_field;
      const evidence = { form_id: formId, submission_id: submissionId, question, answer: said };
      if (email) await PulseConsent.set(trx, tenantId, { channel: 'email', address: email, status: 'subscribed', source: 'form', evidence });
      if (phone && normalizePhone(phone)) await PulseConsent.set(trx, tenantId, { channel: 'sms', address: phone, status: 'subscribed', source: 'form', evidence });
    }

    const utm = data._utm && typeof data._utm === 'object' ? data._utm : null;
    await recordTouch(trx, tenantId, { key, channel: 'form', formId, utm });

    let leadId: string | null = null;
    if (m.create_lead) {
      const existing = email ? await trx.selectFrom('leads').select('id').where('tenant_id', '=', tenantId)
        .where(sql<boolean>`lower(contact_email) = ${email}`).where('stage', 'not in', ['WON', 'LOST']).executeTakeFirst() : undefined;
      if (!existing) {
        const lead = await trx.insertInto('leads').values({
          tenant_id: tenantId, company: (company || name || email || 'Website enquiry').slice(0, 200), contact_name: (name || email || phone).slice(0, 200),
          contact_email: email || null, contact_phone: phone || null, source: 'Web Form',
          notes: `From the website form “${form.name}”${utm?.campaign ? ` (campaign: ${utm.campaign})` : ''}.`,
        } as any).returning('id').executeTakeFirstOrThrow();
        leadId = lead.id;
      }
    }
    return { contactId: contact.id, created, leadId, company: company || name || email };
  });
  if (!outcome) return null;
  if (outcome.leadId) {
    // The same event the CRM emits for a lead created by hand, so lead journeys, Studio and conversions all see it.
    await emitDomainEventStandalone(tenantId, {
      type: 'lead.created', sourceApp: 'pulse', entityType: 'lead', entityId: outcome.leadId,
      payload: { company: outcome.company, source: 'Web Form', value: 0 },
    }).catch(() => {});
  }
  return outcome;
}

// ── Conversions ──────────────────────────────────────────────────────────────

async function convert(tenantId: string, input: { kind: 'lead' | 'deal_won' | 'payment'; entityId: string; key: string | null; value: number; eventId?: string }) {
  await withTenant(tenantId, async (trx) => {
    let first: string | null = null, last: string | null = null;
    if (input.key) {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);
      const touches = await trx.selectFrom('pulse_touchpoints').select(['id']).where('tenant_id', '=', tenantId)
        .where('person_key', '=', input.key).where('occurred_at', '>=', since).where('occurred_at', '<=', new Date())
        .orderBy('occurred_at', 'asc').execute();
      first = touches[0]?.id ?? null;
      last = touches[touches.length - 1]?.id ?? null;
    }
    await trx.insertInto('pulse_conversions').values({
      tenant_id: tenantId, kind: input.kind, entity_id: input.entityId, person_key: input.key, value: String(input.value || 0),
      first_touch_id: first, last_touch_id: last, event_id: input.eventId ?? '',
    }).onConflict((oc) => oc.columns(['tenant_id', 'kind', 'entity_id', 'event_id']).doNothing()).execute();
  });
}

async function onConversionEvent(tenantId: string, event: DomainEvent) {
  if (!event.entityId) return;
  const p = event.payload ?? {};
  if (event.type === 'lead.created') {
    const lead = await withTenant(tenantId, (trx) => trx.selectFrom('leads').select(['contact_email', 'contact_phone', 'value'])
      .where('tenant_id', '=', tenantId).where('id', '=', event.entityId!).executeTakeFirst());
    if (!lead) throw new Error('Lead not visible yet');
    await convert(tenantId, { kind: 'lead', entityId: event.entityId, key: personKey(lead.contact_email, lead.contact_phone), value: Number(lead.value) || 0 });
  }
  if (event.type === 'deal.won') {
    const who = await withTenant(tenantId, async (trx) => {
      const d = await trx.selectFrom('deals').select(['lead_id', 'customer_id']).where('tenant_id', '=', tenantId).where('id', '=', event.entityId!).executeTakeFirst();
      if (d?.lead_id) {
        const l = await trx.selectFrom('leads').select(['contact_email', 'contact_phone']).where('tenant_id', '=', tenantId).where('id', '=', d.lead_id).executeTakeFirst();
        if (l) return personKey(l.contact_email, l.contact_phone);
      }
      if (d?.customer_id) {
        const c = await trx.selectFrom('customers').select(['email', 'phone']).where('tenant_id', '=', tenantId).where('id', '=', d.customer_id).executeTakeFirst();
        if (c) return personKey(c.email, c.phone);
      }
      return null;
    });
    await convert(tenantId, { kind: 'deal_won', entityId: event.entityId, key: who, value: Number(p.value) || 0 });
  }
  if (event.type === 'invoice.payment_recorded') {
    const cid = typeof p.customerId === 'string' ? p.customerId : null;
    const key = cid ? await withTenant(tenantId, async (trx) => {
      const c = await trx.selectFrom('customers').select(['email', 'phone']).where('tenant_id', '=', tenantId).where('id', '=', cid).executeTakeFirst();
      return c ? personKey(c.email, c.phone) : null;
    }) : null;
    await convert(tenantId, { kind: 'payment', entityId: event.entityId, key, value: Number(p.amount) || 0, eventId: event.id ?? `${Date.now()}` });
  }
}

let registered = false;
export function registerPulseAttributionSubscribers(onFormContact: (tenantId: string, contactId: string, event: DomainEvent) => Promise<void>) {
  if (registered) return;
  registered = true;
  registerSubscriber('cms.form_submitted', async (tenantId, event) => {
    const formId = (event.payload as any)?.formId;
    if (!formId || !event.entityId) return;
    const r = await handleFormSubmission(tenantId, formId, event.entityId);
    if (r) await onFormContact(tenantId, r.contactId, event);
  });
  for (const t of ['lead.created', 'deal.won', 'invoice.payment_recorded']) registerSubscriber(t, onConversionEvent);
}
