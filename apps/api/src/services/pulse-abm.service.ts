import { sql, type Transaction } from 'kysely';
import { withTenant, dbPlatform, type Database } from '../db/client.js';
import { NotificationService } from './notification.service.js';

/**
 * Pulse account-based marketing: scoring the companies marketing and sales
 * are going after together.
 *
 * Score (0–100) from the last 30 days, every point traceable:
 *   email opens by the account's people   1 each, up to 20
 *   clicks on Pulse messages              5 each, up to 30
 *   website forms they sent               10 each, up to 20
 *   open deals with the account           10 each, up to 30
 * 60 or more is "hot" — the owner is told once when it crosses, and the
 * account stays hot until it falls below 40, so a score hovering at 59/60
 * doesn't notify them over and over.
 */

const HOT = 60, COOL = 40;

/** Everyone at the account we can match activity to: lower-cased emails and phone keys. */
export async function accountPeople(trx: Transaction<Database>, tenantId: string, customerId: string) {
  const c = await trx.selectFrom('customers').select(['id', 'name', 'email', 'phone', 'party_id']).where('tenant_id', '=', tenantId).where('id', '=', customerId).executeTakeFirst();
  if (!c) return null;
  const contacts = await trx.selectFrom('contacts').select(['id', sql<string>`trim(first_name || ' ' || coalesce(last_name, ''))`.as('name'), 'email', 'phone', 'avatar_url', 'job_title'])
    .where('tenant_id', '=', tenantId).where('status', '=', 'ACTIVE').where('company_id', '=', c.id).limit(500).execute();
  const leads = await trx.selectFrom('leads').select(['id', 'contact_name as name', 'contact_email as email', 'contact_phone as phone', 'stage'])
    .where('tenant_id', '=', tenantId)
    .where((eb) => eb.or([
      ...(c.party_id ? [eb('organization_party_id', '=', c.party_id)] : []),
      eb(sql`lower(company)`, '=', c.name.trim().toLowerCase()),
    ])).limit(500).execute();
  const emails = new Set<string>();
  for (const e of [c.email, ...contacts.map((x) => x.email), ...leads.map((x) => x.email)]) if (e && e.includes('@')) emails.add(e.trim().toLowerCase());
  return { customer: c, contacts, leads, emails: [...emails] };
}

export async function scoreAccount(trx: Transaction<Database>, tenantId: string, customerId: string) {
  const people = await accountPeople(trx, tenantId, customerId);
  if (!people) return null;
  const since = new Date(Date.now() - 30 * 86400_000);
  const emails = people.emails;
  const eng = emails.length ? await trx.selectFrom('pulse_sends').select([
    sql<string>`count(*) FILTER (WHERE opened_at >= ${since})`.as('opens'),
    sql<string>`count(*) FILTER (WHERE clicked_at >= ${since})`.as('clicks')])
    .where('tenant_id', '=', tenantId).where('address', 'in', emails).executeTakeFirst() : null;
  const forms = emails.length ? await trx.selectFrom('pulse_touchpoints').select(sql<string>`count(*)`.as('n'))
    .where('tenant_id', '=', tenantId).where('channel', '=', 'form').where('person_key', 'in', emails).where('occurred_at', '>=', since).executeTakeFirst() : null;
  const leadIds = people.leads.map((l) => l.id);
  const deals = await trx.selectFrom('deals as d').leftJoin('crm_pipeline_stages as s', (j) => j.onRef('s.tenant_id', '=', 'd.tenant_id').onRef('s.key', '=', 'd.stage'))
    .select(sql<string>`count(*)`.as('n'))
    .where('d.tenant_id', '=', tenantId)
    .where((eb) => eb.or([eb('d.customer_id', '=', customerId), ...(leadIds.length ? [eb('d.lead_id', 'in', leadIds)] : [])]))
    .where(sql<boolean>`coalesce(s.is_won, false) = false AND coalesce(s.is_lost, false) = false`)
    .executeTakeFirst().catch(() => ({ n: '0' }));
  const detail = {
    opens: Number(eng?.opens ?? 0), clicks: Number(eng?.clicks ?? 0), forms: Number(forms?.n ?? 0), open_deals: Number(deals?.n ?? 0),
    people: people.contacts.length + people.leads.length,
  };
  const score = Math.min(100, Math.min(20, detail.opens) + Math.min(30, detail.clicks * 5) + Math.min(20, detail.forms * 10) + Math.min(30, detail.open_deals * 10));
  return { score, detail };
}

/** Rescores every target account of one tenant; tells owners about accounts that just went hot. */
export async function rescoreTenant(tenantId: string) {
  const wentHot: { id: string; name: string; owner: string; score: number }[] = [];
  await withTenant(tenantId, async (trx) => {
    const rows = await trx.selectFrom('pulse_target_accounts as t').innerJoin('customers as c', 'c.id', 't.customer_id')
      .select(['t.id', 't.customer_id', 't.owner_id', 't.hot_since', 'c.name']).where('t.tenant_id', '=', tenantId).execute();
    for (const r of rows) {
      const s = await scoreAccount(trx, tenantId, r.customer_id);
      if (!s) continue;
      let hot_since = r.hot_since;
      if (!hot_since && s.score >= HOT) { hot_since = new Date(); if (r.owner_id) wentHot.push({ id: r.id, name: r.name, owner: r.owner_id, score: s.score }); }
      else if (hot_since && s.score < COOL) hot_since = null;
      await trx.updateTable('pulse_target_accounts').set({ score: s.score, score_detail: JSON.stringify(s.detail), scored_at: new Date(), hot_since })
        .where('id', '=', r.id).execute();
    }
  });
  for (const h of wentHot) {
    await NotificationService.notifyUsers(tenantId, [h.owner], {
      app: 'pulse', type: 'success', title: `${h.name} is warming up`,
      message: `Engagement score ${h.score}/100 — people there are opening, clicking or asking. A good moment to reach out.`,
      link: `/pulse/accounts/${h.id}`, entityType: 'pulse_target_account', entityId: h.id, entityLabel: h.name,
    } as any).catch(() => {});
  }
}

/** Hourly. */
export async function runPulseAbmJob() {
  const tenants = await dbPlatform.selectFrom('pulse_target_accounts').select('tenant_id').distinct().execute();
  for (const t of tenants) { try { await rescoreTenant(t.tenant_id); } catch (e: any) { console.error('[Pulse ABM]', e?.message); } }
}
