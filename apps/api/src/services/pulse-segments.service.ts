import { sql, type Transaction, type RawBuilder } from 'kysely';
import type { Database, PulseSource, PulseChannel } from '../db/client.js';
import { ContactsService } from './contacts.service.js';
import { normalizePhone } from '../lib/phone.js';

/**
 * Pulse segments: a saved question over contacts, CRM leads or customers.
 *
 * Rules use the same { field, op, value } shape as Contacts smart groups. For
 * the contacts source every Contacts field compiles through
 * ContactsService.compileSmartRule, so a segment and a smart group can never
 * disagree about what "city = Arusha" means. Leads and customers have their
 * own catalogs below. Engagement rules (opened / clicked / received a Pulse
 * campaign) work on every source, because pulse_sends records which source
 * row each send went to.
 *
 * Nothing outside these catalogs compiles: a rule naming an unknown field or
 * operator is rejected on save and ignored on evaluation.
 */

type Kind = 'text' | 'choice' | 'uuid' | 'bool' | 'date' | 'number';
interface FieldSpec { kind: Kind; col: string; ops: string[]; label: string }

const TEXT_OPS = ['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_empty'];

const LEAD_FIELDS: Record<string, FieldSpec> = {
  stage:          { kind: 'choice', col: 'stage',          ops: ['eq', 'neq'], label: 'Stage' },
  source:         { kind: 'choice', col: 'source',         ops: ['eq', 'neq'], label: 'Lead source' },
  priority:       { kind: 'choice', col: 'priority',       ops: ['eq', 'neq'], label: 'Priority' },
  company:        { kind: 'text',   col: 'company',        ops: TEXT_OPS, label: 'Company' },
  industry:       { kind: 'text',   col: 'industry',       ops: TEXT_OPS, label: 'Industry' },
  location:       { kind: 'text',   col: 'location',       ops: TEXT_OPS, label: 'Location' },
  assigned_to_id: { kind: 'uuid',   col: 'assigned_to_id', ops: ['eq', 'neq', 'is_set', 'is_empty'], label: 'Owner' },
  territory_id:   { kind: 'uuid',   col: 'territory_id',   ops: ['eq', 'neq', 'is_set', 'is_empty'], label: 'Territory' },
  value:          { kind: 'number', col: 'value',          ops: ['gte', 'lte'], label: 'Deal value' },
  has_email:      { kind: 'bool',   col: 'contact_email',  ops: ['is_true', 'is_false'], label: 'Has email' },
  has_phone:      { kind: 'bool',   col: 'contact_phone',  ops: ['is_true', 'is_false'], label: 'Has phone' },
  created:        { kind: 'date',   col: 'created_at',     ops: ['within_days', 'before_days'], label: 'Created' },
  updated:        { kind: 'date',   col: 'updated_at',     ops: ['within_days', 'before_days'], label: 'Last updated' },
};

const CUSTOMER_FIELDS: Record<string, FieldSpec> = {
  name:                { kind: 'text',   col: 'name',                ops: TEXT_OPS, label: 'Company name' },
  city:                { kind: 'text',   col: 'city',                ops: TEXT_OPS, label: 'City' },
  country:             { kind: 'text',   col: 'country',             ops: TEXT_OPS, label: 'Country' },
  category:            { kind: 'choice', col: 'category',            ops: ['eq', 'neq'], label: 'Category' },
  client_type:         { kind: 'choice', col: 'client_type',         ops: ['eq', 'neq'], label: 'Client type' },
  account_status:      { kind: 'choice', col: 'account_status',      ops: ['eq', 'neq'], label: 'Account status' },
  assigned_officer_id: { kind: 'uuid',   col: 'assigned_officer_id', ops: ['eq', 'neq', 'is_set', 'is_empty'], label: 'Account officer' },
  is_partner:          { kind: 'bool',   col: 'is_partner',          ops: ['is_true', 'is_false'], label: 'Is a partner' },
  has_email:           { kind: 'bool',   col: 'email',               ops: ['is_true', 'is_false'], label: 'Has email' },
  has_phone:           { kind: 'bool',   col: 'phone',               ops: ['is_true', 'is_false'], label: 'Has phone' },
  created:             { kind: 'date',   col: 'created_at',          ops: ['within_days', 'before_days'], label: 'Created' },
};

/** Engagement with Pulse itself, on every source. */
const ENGAGEMENT_FIELDS: Record<string, { ops: string[]; label: string }> = {
  campaign:   { ops: ['received', 'not_received', 'opened', 'clicked'], label: 'Campaign' },
  engagement: { ops: ['opened_within_days', 'clicked_within_days', 'not_opened_within_days'], label: 'Email engagement' },
  target_account: { ops: ['is_target', 'is_hot', 'tier_is'], label: 'Target account' },
};

const SOURCE_TABLE: Record<PulseSource, 'contacts' | 'leads' | 'customers'> = {
  contacts: 'contacts', leads: 'leads', customers: 'customers',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SegmentDef { source: PulseSource; match_type: 'all' | 'any'; rules: any[] }

export interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  kind: 'person' | 'company';
}

function bailer(strict: boolean) {
  return (msg: string): null => { if (strict) throw new Error(msg); return null; };
}

function compileCatalogRule(table: string, spec: FieldSpec, rule: any, strict: boolean): RawBuilder<boolean> | null {
  const bail = bailer(strict);
  const col = sql.ref(`${table}.${spec.col}`);
  const op = rule.op;
  const raw = typeof rule.value === 'string' ? rule.value.trim() : rule.value;

  if (spec.kind === 'text' || spec.kind === 'choice') {
    if (op === 'is_set') return sql<boolean>`(${col} IS NOT NULL AND ${col}::text <> '')`;
    if (op === 'is_empty') return sql<boolean>`(${col} IS NULL OR ${col}::text = '')`;
    const v = typeof raw === 'string' ? raw : '';
    if (!v) return bail(`"${spec.label}" needs a value`);
    if (v.length > 200) return bail('Filter value is too long');
    if (op === 'eq') return sql<boolean>`lower(${col}::text) = lower(${v})`;
    if (op === 'neq') return sql<boolean>`(${col} IS NULL OR lower(${col}::text) <> lower(${v}))`;
    const like = `%${v.replace(/[\\%_]/g, (m: string) => '\\' + m)}%`;
    if (op === 'contains') return sql<boolean>`${col}::text ILIKE ${like}`;
    if (op === 'not_contains') return sql<boolean>`(${col} IS NULL OR ${col}::text NOT ILIKE ${like})`;
  }
  if (spec.kind === 'uuid') {
    if (op === 'is_set') return sql<boolean>`${col} IS NOT NULL`;
    if (op === 'is_empty') return sql<boolean>`${col} IS NULL`;
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) return bail(`"${spec.label}" needs a valid selection`);
    if (op === 'eq') return sql<boolean>`${col} = ${raw}::uuid`;
    if (op === 'neq') return sql<boolean>`(${col} IS NULL OR ${col} <> ${raw}::uuid)`;
  }
  if (spec.kind === 'bool') {
    const truthy = spec.col.startsWith('is_')
      ? sql<boolean>`${col} IS TRUE`
      : sql<boolean>`(${col} IS NOT NULL AND ${col} <> '')`;
    if (op === 'is_true') return truthy;
    if (op === 'is_false') return sql<boolean>`NOT (${truthy})`;
  }
  if (spec.kind === 'date') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 3650) return bail(`"${spec.label}" needs a whole number of days (0–3650)`);
    if (op === 'within_days') return sql<boolean>`${col} >= now() - make_interval(days => ${n})`;
    if (op === 'before_days') return sql<boolean>`${col} < now() - make_interval(days => ${n})`;
  }
  if (spec.kind === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return bail(`"${spec.label}" needs a number`);
    if (op === 'gte') return sql<boolean>`coalesce(${col}::numeric, 0) >= ${n}`;
    if (op === 'lte') return sql<boolean>`coalesce(${col}::numeric, 0) <= ${n}`;
  }
  return bail(`Unhandled operator "${op}"`);
}

function compileEngagementRule(source: PulseSource, rule: any, strict: boolean): RawBuilder<boolean> | null {
  const bail = bailer(strict);
  const table = SOURCE_TABLE[source];
  const base = sql`s.tenant_id = ${sql.ref(`${table}.tenant_id`)} AND s.source = ${source} AND s.source_id = ${sql.ref(`${table}.id`)}`;
  const raw = typeof rule.value === 'string' ? rule.value.trim() : rule.value;

  if (rule.field === 'campaign') {
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) return bail('Pick a campaign for this rule');
    const extra = { received: sql`s.status = 'sent'`, not_received: sql`s.status = 'sent'`, opened: sql`s.opened_at IS NOT NULL`, clicked: sql`s.clicked_at IS NOT NULL` }[rule.op as string];
    if (!extra) return bail(`Unhandled operator "${rule.op}"`);
    const exists = sql<boolean>`EXISTS (SELECT 1 FROM pulse_sends s WHERE ${base} AND s.campaign_id = ${raw}::uuid AND ${extra})`;
    return rule.op === 'not_received' ? sql<boolean>`NOT ${exists}` : exists;
  }
  if (rule.field === 'target_account') {
    // The person's company is a Pulse target account (account-based marketing).
    const company = source === 'customers' ? sql`t.customer_id = customers.id`
      : source === 'contacts' ? sql`t.customer_id = contacts.company_id`
        : sql`EXISTS (SELECT 1 FROM customers c WHERE c.id = t.customer_id AND (lower(c.name) = lower(leads.company) OR (c.party_id IS NOT NULL AND c.party_id = leads.organization_party_id)))`;
    const tbl = sql.ref(`${table}.tenant_id`);
    if (rule.op === 'is_target') return sql<boolean>`EXISTS (SELECT 1 FROM pulse_target_accounts t WHERE t.tenant_id = ${tbl} AND ${company})`;
    if (rule.op === 'is_hot') return sql<boolean>`EXISTS (SELECT 1 FROM pulse_target_accounts t WHERE t.tenant_id = ${tbl} AND t.hot_since IS NOT NULL AND ${company})`;
    const tier = Number(raw);
    if (!Number.isInteger(tier) || tier < 1 || tier > 3) return bail('Choose tier 1, 2 or 3');
    return sql<boolean>`EXISTS (SELECT 1 FROM pulse_target_accounts t WHERE t.tenant_id = ${tbl} AND t.tier = ${tier} AND ${company})`;
  }
  if (rule.field === 'engagement') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return bail('Engagement needs a whole number of days (1–3650)');
    const window = sql`make_interval(days => ${n})`;
    if (rule.op === 'opened_within_days') return sql<boolean>`EXISTS (SELECT 1 FROM pulse_sends s WHERE ${base} AND s.opened_at >= now() - ${window})`;
    if (rule.op === 'clicked_within_days') return sql<boolean>`EXISTS (SELECT 1 FROM pulse_sends s WHERE ${base} AND s.clicked_at >= now() - ${window})`;
    if (rule.op === 'not_opened_within_days') return sql<boolean>`NOT EXISTS (SELECT 1 FROM pulse_sends s WHERE ${base} AND s.opened_at >= now() - ${window})`;
  }
  return bail(`Unhandled operator "${rule.op}"`);
}

function compileRule(source: PulseSource, rule: any, strict: boolean): RawBuilder<boolean> | null {
  const bail = bailer(strict);
  if (!rule || typeof rule !== 'object' || typeof rule.field !== 'string') return bail('Malformed rule');
  const eng = ENGAGEMENT_FIELDS[rule.field];
  if (eng) {
    if (!eng.ops.includes(rule.op)) return bail(`Operator "${rule.op}" is not valid for "${eng.label}"`);
    return compileEngagementRule(source, rule, strict);
  }
  if (source === 'contacts') return ContactsService.compileSmartRule(rule, strict);
  const catalog = source === 'leads' ? LEAD_FIELDS : CUSTOMER_FIELDS;
  const spec = catalog[rule.field];
  if (!spec) return bail(`Unknown filter field "${rule.field}"`);
  if (!spec.ops.includes(rule.op)) return bail(`Operator "${rule.op}" is not valid for "${spec.label}"`);
  return compileCatalogRule(SOURCE_TABLE[source], spec, rule, strict);
}

/** One predicate for the whole segment. Strict throws on the first bad rule
 *  (the save path); lenient drops bad rules and, if none survive, matches
 *  nobody — an empty or broken segment must never mean "everyone". */
export function segmentPredicate(def: SegmentDef, strict: boolean): RawBuilder<boolean> {
  const rules = Array.isArray(def.rules) ? def.rules : [];
  if (strict && rules.length === 0) throw new Error('Add at least one rule');
  if (rules.length > 25) throw new Error('A segment can have at most 25 rules');
  const parts = rules.map((r) => compileRule(def.source, r, strict)).filter((p): p is RawBuilder<boolean> => p != null);
  if (parts.length === 0) return sql<boolean>`false`;
  return sql<boolean>`(${sql.join(parts, def.match_type === 'any' ? sql` OR ` : sql` AND `)})`;
}

/** Throws a readable message when any rule is invalid. */
export function validateSegment(def: SegmentDef): void {
  segmentPredicate(def, true);
}

function baseQuery(trx: Transaction<Database>, tenantId: string, def: SegmentDef) {
  const pred = segmentPredicate(def, false);
  if (def.source === 'contacts') {
    return trx.selectFrom('contacts').where('contacts.tenant_id', '=', tenantId)
      .where('contacts.status', '=', 'ACTIVE').where(pred)
      .select([
        'contacts.id as id',
        sql<string>`trim(contacts.first_name || ' ' || coalesce(contacts.last_name, ''))`.as('name'),
        'contacts.email as email', 'contacts.phone as phone', 'contacts.avatar_url as avatar_url',
        sql<string>`'person'`.as('kind'),
      ]);
  }
  if (def.source === 'leads') {
    return trx.selectFrom('leads').where('leads.tenant_id', '=', tenantId).where(pred)
      .select([
        'leads.id as id', sql<string>`coalesce(nullif(leads.contact_name, ''), leads.company)`.as('name'),
        'leads.contact_email as email', 'leads.contact_phone as phone', sql<string | null>`null`.as('avatar_url'),
        sql<string>`'person'`.as('kind'),
      ]);
  }
  return trx.selectFrom('customers').where('customers.tenant_id', '=', tenantId)
    .where('customers.deleted_at', 'is', null).where(pred)
    .select([
      'customers.id as id', 'customers.name as name', 'customers.email as email', 'customers.phone as phone',
      'customers.logo_url as avatar_url', sql<string>`'company'`.as('kind'),
    ]);
}

export const PulseSegments = {
  catalog() {
    const pick = (c: Record<string, FieldSpec>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { kind: v.kind, ops: v.ops, label: v.label }]));
    const contacts = Object.fromEntries(Object.entries(ContactsService.SMART_FIELDS).map(([k, v]) => [k, { kind: v.kind, ops: v.ops }]));
    return { contacts, leads: pick(LEAD_FIELDS), customers: pick(CUSTOMER_FIELDS), engagement: ENGAGEMENT_FIELDS };
  },

  async members(trx: Transaction<Database>, tenantId: string, def: SegmentDef, opts: { limit?: number; offset?: number; q?: string } = {}): Promise<Member[]> {
    let q = baseQuery(trx, tenantId, def) as any;
    if (opts.q) {
      const like = `%${opts.q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      const t = SOURCE_TABLE[def.source];
      const nameCol = def.source === 'contacts' ? sql`(contacts.first_name || ' ' || coalesce(contacts.last_name, ''))` : def.source === 'leads' ? sql.ref('leads.contact_name') : sql.ref('customers.name');
      const emailCol = sql.ref(def.source === 'leads' ? 'leads.contact_email' : `${t}.email`);
      q = q.where(sql<boolean>`(${nameCol} ILIKE ${like} OR ${emailCol} ILIKE ${like})`);
    }
    return q.orderBy('name').limit(Math.min(opts.limit ?? 50, 5000)).offset(opts.offset ?? 0).execute();
  },

  /** Total plus how many can actually be reached on each channel. */
  async stats(trx: Transaction<Database>, tenantId: string, def: SegmentDef) {
    const inner = baseQuery(trx, tenantId, def) as any;
    const row = await trx.selectFrom(inner.as('m'))
      .select([
        sql<string>`count(*)`.as('total'),
        sql<string>`count(*) FILTER (WHERE m.email IS NOT NULL AND m.email <> '')`.as('with_email'),
        sql<string>`count(*) FILTER (WHERE m.phone IS NOT NULL AND m.phone <> '')`.as('with_phone'),
        sql<string>`count(*) FILTER (WHERE m.email IS NOT NULL AND EXISTS (SELECT 1 FROM pulse_consents c WHERE c.tenant_id = ${tenantId} AND c.channel = 'email' AND c.address = lower(trim(m.email)) AND c.status <> 'subscribed'))`.as('email_suppressed'),
      ])
      .executeTakeFirst() as any;
    return {
      total: Number(row?.total ?? 0),
      with_email: Number(row?.with_email ?? 0),
      with_phone: Number(row?.with_phone ?? 0),
      email_suppressed: Number(row?.email_suppressed ?? 0),
    };
  },
};

// ── Consent ────────────────────────────────────────────────────────────────

export function consentKey(channel: PulseChannel, raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (channel === 'email') {
    const e = raw.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  }
  return normalizePhone(raw);
}

export const PulseConsent = {
  /** Addresses (by consent key) that must not be sent to on this channel. */
  async blocked(trx: Transaction<Database>, tenantId: string, channel: PulseChannel, keys: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    if (!keys.length) return out;
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const rows = await trx.selectFrom('pulse_consents').select('address')
        .where('tenant_id', '=', tenantId).where('channel', '=', channel)
        .where('status', '<>', 'subscribed').where('address', 'in', chunk).execute();
      rows.forEach((r) => out.add(r.address));
      if (channel !== 'email') {
        const opt = await trx.selectFrom('sms_opt_outs').select('phone_normalized')
          .where('tenant_id', '=', tenantId).where('phone_normalized', 'in', chunk).execute();
        opt.forEach((r) => r.phone_normalized && out.add(r.phone_normalized));
      }
    }
    return out;
  },

  async set(trx: Transaction<Database>, tenantId: string, input: {
    channel: PulseChannel; address: string; status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained';
    source: string; evidence?: Record<string, unknown>; changedBy?: string | null;
  }) {
    const key = consentKey(input.channel, input.address);
    if (!key) throw new Error(input.channel === 'email' ? 'Enter a valid email address' : 'Enter a valid phone number');
    return trx.insertInto('pulse_consents').values({
      tenant_id: tenantId, channel: input.channel, address: key, status: input.status,
      source: input.source, evidence: JSON.stringify(input.evidence ?? {}), changed_by: input.changedBy ?? null,
    }).onConflict((oc) => oc.columns(['tenant_id', 'channel', 'address']).doUpdateSet({
      status: input.status, source: input.source, evidence: JSON.stringify(input.evidence ?? {}),
      changed_by: input.changedBy ?? null, updated_at: new Date(),
    })).returningAll().executeTakeFirstOrThrow();
  },
};
