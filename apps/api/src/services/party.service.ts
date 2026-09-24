import { sql } from 'kysely';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { withTenant } from '../db/client.js';
import { partyVisibleSql, partyEditableSql } from '../lib/party-visibility.js';

export type PartyActor = { id: string; tenantId: string; role?: string };

export class PartyError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
type Trx = Transaction<Database>;

/** Escape LIKE metacharacters so a search for "50%" or "a_b" matches literally. */
const likeOf = (term: string) => `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

export class PartyService {
  static normalizeChannel(type: string, value: string) {
    const trimmed = value.trim();
    if (type === 'EMAIL') return trimmed.toLowerCase();
    if (['PHONE', 'MOBILE', 'WHATSAPP'].includes(type)) return trimmed.replace(/[^0-9+]/g, '');
    return trimmed.toLowerCase();
  }

  /** A party the actor may see, or a 404. Knowing an id never grants access. */
  private static async visibleParty(trx: Trx, actor: PartyActor, id: string) {
    const party = await trx.selectFrom('parties').selectAll()
      .where('parties.id', '=', id).where('parties.tenant_id', '=', actor.tenantId)
      .where(partyVisibleSql(actor)).executeTakeFirst();
    if (!party) throw new PartyError(404, 'NOT_FOUND', 'Party not found.');
    return party;
  }

  /** Visible AND editable (see partyEditableSql for exactly what counts). */
  private static async editableParty(trx: Trx, actor: PartyActor, id: string) {
    const party = await this.visibleParty(trx, actor, id);
    if (party.status === 'MERGED') throw new PartyError(409, 'MERGED', 'This party was merged into another one.');
    const ok = await trx.selectFrom('parties').select('parties.id').where('parties.id', '=', id).where('parties.tenant_id', '=', actor.tenantId)
      .where(partyEditableSql(actor)).executeTakeFirst();
    if (!ok) throw new PartyError(403, 'READ_ONLY', 'You can view this party but not change it.');
    return party;
  }

  private static canManage(actor: PartyActor, party: { owner_user_id: string | null; created_by: string | null }) {
    return party.owner_user_id === actor.id || party.created_by === actor.id || ADMIN_ROLES.includes(actor.role ?? '');
  }

  static list(actor: PartyActor, input: { q?: string; type?: 'PERSON' | 'ORGANIZATION'; limit?: number; offset?: number; includeArchived?: boolean }) {
    return withTenant(actor.tenantId, async trx => {
      let query = trx.selectFrom('parties').selectAll()
        .where('parties.tenant_id', '=', actor.tenantId).where('parties.status', '!=', 'MERGED')
        .where(partyVisibleSql(actor));
      if (!input.includeArchived) query = query.where('parties.status', '!=', 'ARCHIVED');
      if (input.type) query = query.where('parties.party_type', '=', input.type);
      const term = input.q?.trim();
      if (term) {
        const like = likeOf(term);
        query = query.where(eb => eb.or([
          eb('parties.display_name', 'ilike', like),
          eb('parties.id', 'in', trx.selectFrom('party_channels').select('party_id')
            .where('tenant_id', '=', actor.tenantId).where('status', '=', 'ACTIVE').where('normalized_value', 'ilike', like)),
        ]));
      }
      const rows = await query.orderBy('parties.display_name').limit(Math.min(input.limit ?? 50, 100)).offset(input.offset ?? 0).execute();
      if (!rows.length) return [];
      // A company confirmed to be the same real-world organization (customer AND supplier) appears
      // once: the secondary is hidden when its primary is visible to this user, and the roles of both
      // are shown on the one row.
      const links = await this.linksFor(trx, actor, rows.map(r => r.id));
      const partnerIds = [...new Set([...links.values()].flat().map(l => l.otherId))];
      const visiblePartners = new Set(partnerIds.length
        ? (await trx.selectFrom('parties').select('parties.id').where('parties.tenant_id', '=', actor.tenantId)
            .where('parties.id', 'in', partnerIds).where('parties.status', '!=', 'MERGED').where(partyVisibleSql(actor)).execute()).map(r => r.id)
        : []);
      const shown = rows.filter(r => !(links.get(r.id) ?? []).some(l => l.isSecondary && visiblePartners.has(l.otherId)));
      const ids = [...new Set([...shown.map(r => r.id), ...partnerIds.filter(p => visiblePartners.has(p))])];
      const roles = await this.rolesOf(trx, actor.tenantId, ids);
      return shown.map(r => {
        const own = roles.get(r.id) ?? { customer: false, supplier: false };
        const partners = (links.get(r.id) ?? []).filter(l => visiblePartners.has(l.otherId)).map(l => roles.get(l.otherId) ?? { customer: false, supplier: false });
        return {
          ...r,
          is_customer: own.customer || partners.some(p => p.customer),
          is_supplier: own.supplier || partners.some(p => p.supplier),
          same_as: (links.get(r.id) ?? []).filter(l => visiblePartners.has(l.otherId)).map(l => l.otherId),
        };
      });
    });
  }

  /** customers / suppliers rows that make each party a customer and/or a supplier. */
  private static async rolesOf(trx: Trx, tenantId: string, ids: string[]) {
    const out = new Map<string, { customer: boolean; supplier: boolean }>();
    if (!ids.length) return out;
    const [customers, suppliers] = await Promise.all([
      trx.selectFrom('customers').select('party_id').where('tenant_id', '=', tenantId).where('party_id', 'in', ids).execute(),
      trx.selectFrom('suppliers').select('party_id').where('tenant_id', '=', tenantId).where('party_id', 'in', ids).execute(),
    ]);
    for (const id of ids) out.set(id, { customer: false, supplier: false });
    for (const c of customers) if (c.party_id) out.get(c.party_id)!.customer = true;
    for (const s of suppliers) if (s.party_id) out.get(s.party_id)!.supplier = true;
    return out;
  }

  /** Confirmed SAME_ORGANIZATION links touching these parties. By convention from < to (by id); `to` is the secondary. */
  private static async linksFor(trx: Trx, actor: PartyActor, ids: string[]) {
    const out = new Map<string, { otherId: string; isSecondary: boolean }[]>();
    if (!ids.length) return out;
    const rows = await trx.selectFrom('party_relationships').select(['from_party_id', 'to_party_id'])
      .where('tenant_id', '=', actor.tenantId).where('relationship_type', '=', 'SAME_ORGANIZATION').where('status', '=', 'ACTIVE')
      .where(eb => eb.or([eb('from_party_id', 'in', ids), eb('to_party_id', 'in', ids)])).execute();
    const add = (id: string, otherId: string, isSecondary: boolean) => out.set(id, [...(out.get(id) ?? []), { otherId, isSecondary }]);
    for (const r of rows) { add(r.from_party_id, r.to_party_id, false); add(r.to_party_id, r.from_party_id, true); }
    return out;
  }

  // ── Same company as customer AND supplier: a deliberate, reviewed link ─────────────────
  // Never an automatic name match — two firms can share a name. Suggestions are only
  // candidates (same tax id / registration number / normalized name / shared email or phone);
  // a manager confirms each one, or marks it "not the same" so it stops being suggested.

  static linkSuggestions(actor: PartyActor) {
    return withTenant(actor.tenantId, async trx => {
      const t = actor.tenantId;
      // Lowercase, drop punctuation and company-form words ("Ltd", "Limited", "Co", "Company", "Inc", "LLC", "PLC").
      const norm = (col: string) => sql.raw(`btrim(regexp_replace(regexp_replace(lower(${col}), '[^a-z0-9 ]', '', 'g'), '[[:<:]](ltd|limited|co|company|inc|llc|plc)[[:>:]]', '', 'g'))`);
      const rows = await sql<{ a_id: string; a_name: string; b_id: string; b_name: string; reason: string }>`
        SELECT a.id AS a_id, a.display_name AS a_name, b.id AS b_id, b.display_name AS b_name,
          CASE
            WHEN oa.tax_identifier IS NOT NULL AND btrim(oa.tax_identifier) <> '' AND lower(oa.tax_identifier) = lower(ob.tax_identifier) THEN 'Same tax ID'
            WHEN oa.registration_number IS NOT NULL AND btrim(oa.registration_number) <> '' AND lower(oa.registration_number) = lower(ob.registration_number) THEN 'Same registration number'
            WHEN ${norm('a.display_name')} <> '' AND ${norm('a.display_name')} = ${norm('b.display_name')} THEN 'Same name'
            ELSE 'Shared email or phone'
          END AS reason
        FROM parties a
        JOIN parties b ON b.tenant_id = a.tenant_id AND a.id < b.id
        LEFT JOIN party_organizations oa ON oa.party_id = a.id
        LEFT JOIN party_organizations ob ON ob.party_id = b.id
        WHERE a.tenant_id = ${t} AND a.party_type = 'ORGANIZATION' AND b.party_type = 'ORGANIZATION'
          AND a.status = 'ACTIVE' AND b.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM party_relationships r WHERE r.tenant_id = ${t} AND r.relationship_type IN ('SAME_ORGANIZATION', 'NOT_SAME_ORGANIZATION')
              AND r.from_party_id = a.id AND r.to_party_id = b.id)
          AND (
            (oa.tax_identifier IS NOT NULL AND btrim(oa.tax_identifier) <> '' AND lower(oa.tax_identifier) = lower(ob.tax_identifier))
            OR (oa.registration_number IS NOT NULL AND btrim(oa.registration_number) <> '' AND lower(oa.registration_number) = lower(ob.registration_number))
            OR (${norm('a.display_name')} <> '' AND ${norm('a.display_name')} = ${norm('b.display_name')})
            OR EXISTS (SELECT 1 FROM party_channels ca JOIN party_channels cb
                         ON cb.tenant_id = ca.tenant_id AND cb.channel_type = ca.channel_type AND cb.normalized_value = ca.normalized_value
                       WHERE ca.party_id = a.id AND cb.party_id = b.id AND ca.channel_type IN ('EMAIL', 'PHONE') AND ca.status = 'ACTIVE' AND cb.status = 'ACTIVE')
          )
          AND a.id IN (SELECT parties.id FROM parties WHERE parties.tenant_id = ${t} AND ${partyVisibleSql(actor)})
          AND b.id IN (SELECT parties.id FROM parties WHERE parties.tenant_id = ${t} AND ${partyVisibleSql(actor)})
        ORDER BY a.display_name LIMIT 50`.execute(trx);
      const ids = [...new Set(rows.rows.flatMap(r => [r.a_id, r.b_id]))];
      const roles = await this.rolesOf(trx, t, ids);
      const roleLabel = (id: string) => [roles.get(id)?.customer ? 'Customer' : null, roles.get(id)?.supplier ? 'Supplier' : null].filter(Boolean).join(' · ') || 'Organization';
      return rows.rows.map(r => ({
        a: { id: r.a_id, name: r.a_name, roles: roleLabel(r.a_id) },
        b: { id: r.b_id, name: r.b_name, roles: roleLabel(r.b_id) },
        reason: r.reason,
      }));
    });
  }

  /** All confirmed SAME_ORGANIZATION links visible to this actor, with display names and roles. */
  static linkedPairs(actor: PartyActor) {
    return withTenant(actor.tenantId, async trx => {
      const rows = await trx.selectFrom('party_relationships')
        .innerJoin('parties as pa', 'pa.id', 'party_relationships.from_party_id')
        .innerJoin('parties as pb', 'pb.id', 'party_relationships.to_party_id')
        .select(['pa.id as a_id', 'pa.display_name as a_name', 'pb.id as b_id', 'pb.display_name as b_name'])
        .where('party_relationships.tenant_id', '=', actor.tenantId).where('party_relationships.relationship_type', '=', 'SAME_ORGANIZATION')
        .where('party_relationships.status', '=', 'ACTIVE')
        .where('pa.id', 'in', trx.selectFrom('parties').select('id').where('tenant_id', '=', actor.tenantId).where(partyVisibleSql(actor)))
        .where('pb.id', 'in', trx.selectFrom('parties').select('id').where('tenant_id', '=', actor.tenantId).where(partyVisibleSql(actor)))
        .execute();
      const ids = [...new Set(rows.flatMap(r => [r.a_id, r.b_id]))];
      const roles = await this.rolesOf(trx, actor.tenantId, ids);
      const label = (id: string) => [roles.get(id)?.customer ? 'Customer' : null, roles.get(id)?.supplier ? 'Supplier' : null].filter(Boolean).join(' · ') || 'Organization';
      return rows.map(r => ({ a: { id: r.a_id, name: r.a_name, roles: label(r.a_id) }, b: { id: r.b_id, name: r.b_name, roles: label(r.b_id) } }));
    });
  }

  private static async pairOf(trx: Trx, actor: PartyActor, x: string, y: string) {
    if (x === y) throw new PartyError(400, 'SAME_PARTY', 'Choose two different companies.');
    const [a, b] = x < y ? [x, y] : [y, x];
    const pa = await this.editableParty(trx, actor, a);
    const pb = await this.editableParty(trx, actor, b);
    if (pa.party_type !== 'ORGANIZATION' || pb.party_type !== 'ORGANIZATION') throw new PartyError(400, 'TYPE_MISMATCH', 'Only organizations can be linked as the same company.');
    return { a, b };
  }

  private static requireManager(actor: PartyActor) {
    if (!ADMIN_ROLES.includes(actor.role ?? '')) throw new PartyError(403, 'FORBIDDEN', 'Linking companies is limited to management roles.');
  }

  private static async setPairRelationship(trx: Trx, actor: PartyActor, a: string, b: string, type: 'SAME_ORGANIZATION' | 'NOT_SAME_ORGANIZATION') {
    await trx.deleteFrom('party_relationships').where('tenant_id', '=', actor.tenantId).where('from_party_id', '=', a).where('to_party_id', '=', b)
      .where('relationship_type', 'in', ['SAME_ORGANIZATION', 'NOT_SAME_ORGANIZATION']).execute();
    await trx.insertInto('party_relationships').values({
      tenant_id: actor.tenantId, from_party_id: a, to_party_id: b, relationship_type: type, created_by: actor.id,
    } as any).execute();
  }

  /** Confirm two organizations are the same real-world company (e.g. a customer that is also a supplier). Both records keep their own ids. */
  static linkOrganizations(actor: PartyActor, x: string, y: string) {
    this.requireManager(actor);
    return withTenant(actor.tenantId, async trx => {
      const { a, b } = await this.pairOf(trx, actor, x, y);
      await this.setPairRelationship(trx, actor, a, b, 'SAME_ORGANIZATION');
      return { linked: [a, b] };
    });
  }

  /** "These are different companies" — stops the pair being suggested again. */
  static dismissLink(actor: PartyActor, x: string, y: string) {
    this.requireManager(actor);
    return withTenant(actor.tenantId, async trx => {
      const { a, b } = await this.pairOf(trx, actor, x, y);
      await this.setPairRelationship(trx, actor, a, b, 'NOT_SAME_ORGANIZATION');
      return { dismissed: [a, b] };
    });
  }

  /** Undo a confirmed link. */
  static unlinkOrganizations(actor: PartyActor, x: string, y: string) {
    this.requireManager(actor);
    return withTenant(actor.tenantId, async trx => {
      const { a, b } = await this.pairOf(trx, actor, x, y);
      await trx.deleteFrom('party_relationships').where('tenant_id', '=', actor.tenantId).where('from_party_id', '=', a).where('to_party_id', '=', b)
        .where('relationship_type', '=', 'SAME_ORGANIZATION').execute();
      return { unlinked: [a, b] };
    });
  }

  /**
   * Where a party is used across the platform — the cross-app view that the shared id makes possible.
   * Apps keep their own snapshots (an invoice's client name is a legal record) but every one of them
   * also holds the customer/supplier/contact id, which is this party's id. For a company confirmed as
   * the same as another, counts cover both.
   */
  static references(actor: PartyActor, id: string) {
    return withTenant(actor.tenantId, async trx => {
      const party = await this.visibleParty(trx, actor, id);
      const links = await this.linksFor(trx, actor, [id]);
      const partners = (links.get(id) ?? []).map(l => l.otherId);
      const visiblePartners = partners.length
        ? (await trx.selectFrom('parties').select('parties.id').where('parties.tenant_id', '=', actor.tenantId).where('parties.id', 'in', partners).where(partyVisibleSql(actor)).execute()).map(r => r.id)
        : [];
      const all = [id, ...visiblePartners];
      const t = actor.tenantId;
      const list = sql.join(all.map(a => sql`${a}::uuid`));
      // Each subquery is tenant-scoped explicitly. Only a missing table/column (an app not deployed
      // here) is skipped; any other error is a real bug and must surface, not read as "zero uses".
      const count = async (label: string, query: ReturnType<typeof sql>) => {
        try { const r = await (query as any).execute(trx); return [label, Number(r.rows[0]?.n ?? 0)] as const; }
        catch (err: any) { if (err?.code === '42P01' || err?.code === '42703') return [label, 0] as const; throw err; }
      };
      const entries = await Promise.all([
        count('contacts', sql`SELECT count(*) AS n FROM contacts WHERE tenant_id = ${t} AND party_id IN (${list})`),
        count('customer_records', sql`SELECT count(*) AS n FROM customers WHERE tenant_id = ${t} AND party_id IN (${list})`),
        count('supplier_records', sql`SELECT count(*) AS n FROM suppliers WHERE tenant_id = ${t} AND party_id IN (${list})`),
        count('sales_invoices', sql`SELECT count(*) AS n FROM sales_invoices WHERE tenant_id = ${t} AND customer_id IN (${list})`),
        count('credit_notes', sql`SELECT count(*) AS n FROM credit_notes WHERE tenant_id = ${t} AND customer_id IN (${list})`),
        count('quotations', sql`SELECT count(*) AS n FROM quotations WHERE tenant_id = ${t} AND customer_id IN (${list})`),
        count('shipments', sql`SELECT count(*) AS n FROM shipment_cases WHERE tenant_id = ${t} AND customer_id IN (${list})`),
        count('support_tickets', sql`SELECT count(*) AS n FROM support_tickets WHERE tenant_id = ${t} AND customer_id IN (${list})`),
        count('projects', sql`SELECT count(*) AS n FROM projects WHERE tenant_id = ${t} AND customer_id IN (${list})`),
        count('supplier_bills', sql`SELECT count(*) AS n FROM supplier_bills WHERE tenant_id = ${t} AND supplier_id IN (${list})`),
        count('purchase_orders', sql`SELECT count(*) AS n FROM purchase_orders WHERE tenant_id = ${t} AND supplier_id IN (${list})`),
        count('leads', sql`SELECT count(*) AS n FROM leads WHERE tenant_id = ${t} AND (organization_party_id IN (${list}) OR contact_party_id IN (${list}))`),
        count('esign_recipients', sql`SELECT count(*) AS n FROM sign_recipients WHERE tenant_id = ${t} AND party_id IN (${list})`),
        count('files', sql`SELECT count(*) AS n FROM resource_file_links WHERE tenant_id = ${t} AND resource_id IN (${list})`),
      ]);
      return { party_id: party.id, same_as: visiblePartners, references: Object.fromEntries(entries) };
    });
  }

  /** People, teams and departments a share can name — this workspace only. */
  static principals(actor: PartyActor, q?: string) {
    return withTenant(actor.tenantId, async trx => {
      const like = q?.trim() ? likeOf(q.trim()) : null;
      let users = trx.selectFrom('users').select(['id', 'name', 'email']).where('tenant_id', '=', actor.tenantId).where('active', '=', true);
      let teams = trx.selectFrom('hr_teams').select(['id', 'name']).where('tenant_id', '=', actor.tenantId);
      let departments = trx.selectFrom('hr_departments').select(['id', 'name']).where('tenant_id', '=', actor.tenantId);
      if (like) {
        users = users.where(eb => eb.or([eb('name', 'ilike', like), eb('email', 'ilike', like)]));
        teams = teams.where('name', 'ilike', like);
        departments = departments.where('name', 'ilike', like);
      }
      const [u, t, d] = await Promise.all([users.orderBy('name').limit(25).execute(), teams.orderBy('name').limit(25).execute(), departments.orderBy('name').limit(25).execute()]);
      return { users: u, teams: t, departments: d };
    });
  }

  static get(actor: PartyActor, id: string) {
    return withTenant(actor.tenantId, async trx => {
      const party = await trx.selectFrom('parties').selectAll().where('parties.id', '=', id)
        .where('parties.tenant_id', '=', actor.tenantId).where(partyVisibleSql(actor)).executeTakeFirst();
      if (!party) return null;
      const [person, organization, allChannels, affiliations, relationships] = await Promise.all([
        party.party_type === 'PERSON' ? trx.selectFrom('party_people').selectAll().where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).executeTakeFirst() : null,
        party.party_type === 'ORGANIZATION' ? trx.selectFrom('party_organizations').selectAll().where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).executeTakeFirst() : null,
        trx.selectFrom('party_channels').selectAll().where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).where('status', '=', 'ACTIVE').orderBy('is_primary', 'desc').execute(),
        trx.selectFrom('party_affiliations').selectAll().where('tenant_id', '=', actor.tenantId)
          .where(eb => eb.or([eb('person_party_id', '=', id), eb('organization_party_id', '=', id)])).orderBy('created_at', 'desc').execute(),
        trx.selectFrom('party_relationships').selectAll().where('tenant_id', '=', actor.tenantId)
          .where(eb => eb.or([eb('from_party_id', '=', id), eb('to_party_id', '=', id)])).where('status', '=', 'ACTIVE').execute(),
      ]);

      // A channel more restrictive than its party (e.g. a PRIVATE number on a
      // tenant-wide person) is shown only to the owner/creator.
      const isOwner = party.owner_user_id === actor.id || party.created_by === actor.id;
      const channels = allChannels.filter(c => isOwner || c.visibility === 'TENANT' || c.visibility === party.visibility);

      // Relationships/affiliations that point at a party the actor may not see are dropped, not exposed by id.
      const otherIds = new Set<string>();
      for (const a of affiliations) otherIds.add(a.person_party_id === id ? a.organization_party_id : a.person_party_id);
      for (const r of relationships) otherIds.add(r.from_party_id === id ? r.to_party_id : r.from_party_id);
      const visibleOthers = new Set<string>();
      if (otherIds.size) {
        const rows = await trx.selectFrom('parties').select('parties.id').where('parties.tenant_id', '=', actor.tenantId)
          .where('parties.id', 'in', [...otherIds]).where(partyVisibleSql(actor)).execute();
        for (const r of rows) visibleOthers.add(r.id);
      }
      return {
        ...party, person, organization, channels,
        affiliations: affiliations.filter(a => visibleOthers.has(a.person_party_id === id ? a.organization_party_id : a.person_party_id)),
        relationships: relationships.filter(r => visibleOthers.has(r.from_party_id === id ? r.to_party_id : r.from_party_id)),
      };
    });
  }

  /**
   * Creates the canonical party AND its compatibility record, so a person made
   * through a picker shows up in Contacts and an organization in Customers —
   * one identity, not a second directory. (Customers get their party from the
   * customers trigger, migration 505; people are written here.)
   */
  static create(actor: PartyActor, input: any) {
    return withTenant(actor.tenantId, async trx => {
      const visibility = input.visibility ?? 'TENANT';
      const ownerId = visibility === 'TENANT' ? null : actor.id;
      const emailCh = (input.channels ?? []).find((c: any) => c.type === 'EMAIL');
      const phoneCh = (input.channels ?? []).find((c: any) => c.type === 'PHONE' || c.type === 'MOBILE');
      let partyId: string;

      if (input.type === 'PERSON') {
        const displayName = [input.first_name, input.last_name].filter(Boolean).join(' ').trim();
        const party = await trx.insertInto('parties').values({
          tenant_id: actor.tenantId, party_type: 'PERSON', display_name: displayName, visibility, owner_user_id: ownerId,
          source_system: input.source_system ?? 'MANUAL', created_by: actor.id,
        }).returning('id').executeTakeFirstOrThrow();
        partyId = party.id;
        await trx.insertInto('party_people').values({
          tenant_id: actor.tenantId, party_id: partyId, first_name: input.first_name, middle_name: input.middle_name ?? null,
          last_name: input.last_name ?? null, preferred_name: input.preferred_name ?? null, title: input.title ?? null,
          birthday: input.birthday ?? null, avatar_url: null,
        }).execute();
        await trx.insertInto('contacts').values({
          id: partyId, party_id: partyId, tenant_id: actor.tenantId, first_name: input.first_name, last_name: input.last_name ?? null,
          email: emailCh?.value ?? null, phone: phoneCh?.value ?? null, job_title: input.title ?? null,
          birthday: input.birthday ?? null, status: 'ACTIVE', source: 'party',
        } as any).execute();
      } else {
        // The customers / suppliers trigger creates the ORGANIZATION party (id = record id) with its email/phone channels.
        if (input.role === 'supplier') {
          const supplier = await trx.insertInto('suppliers').values({
            tenant_id: actor.tenantId, name: String(input.legal_name).trim(), email: emailCh?.value ?? null, phone: phoneCh?.value ?? null,
            tax_id: input.tax_identifier ?? null, created_by: actor.id,
          } as any).returning('id').executeTakeFirstOrThrow();
          partyId = supplier.id;
        } else {
          const customer = await trx.insertInto('customers').values({
            tenant_id: actor.tenantId, name: String(input.legal_name).trim(), email: emailCh?.value ?? null, phone: phoneCh?.value ?? null,
            registry_number: input.registration_number ?? null, tax_id: input.tax_identifier ?? null, website: input.website ?? null, source: 'party',
          } as any).returning('id').executeTakeFirstOrThrow();
          partyId = customer.id;
        }
        await trx.updateTable('parties').set({ visibility, owner_user_id: ownerId, created_by: actor.id, source_system: input.source_system ?? 'MANUAL' })
          .where('id', '=', partyId).where('tenant_id', '=', actor.tenantId).execute();
        await trx.updateTable('party_organizations').set({ trading_name: input.trading_name ?? null, industry: input.industry ?? null })
          .where('party_id', '=', partyId).where('tenant_id', '=', actor.tenantId).execute();
      }

      for (const channel of input.channels ?? []) {
        await trx.insertInto('party_channels').values({
          tenant_id: actor.tenantId, party_id: partyId, channel_type: channel.type, value: channel.value,
          normalized_value: this.normalizeChannel(channel.type, channel.value), label: channel.label ?? 'work',
          context: channel.context ?? (input.type === 'ORGANIZATION' ? 'ORGANIZATION' : 'WORK'), is_primary: !!channel.is_primary,
          visibility: channel.visibility ?? visibility,
        }).onConflict(oc => oc.columns(['tenant_id', 'party_id', 'channel_type', 'normalized_value']).doNothing()).execute();
      }
      return trx.selectFrom('parties').selectAll().where('id', '=', partyId).where('tenant_id', '=', actor.tenantId).executeTakeFirstOrThrow();
    });
  }

  static update(actor: PartyActor, id: string, patch: any) {
    return withTenant(actor.tenantId, async trx => {
      const party = await this.editableParty(trx, actor, id);
      if ((patch.visibility !== undefined && patch.visibility !== party.visibility) && !this.canManage(actor, party)) {
        throw new PartyError(403, 'NOT_OWNER', 'Only the owner or an admin can change who can see this party.');
      }
      const set: Record<string, unknown> = { updated_at: new Date() };
      let displayName = party.display_name;

      if (party.party_type === 'PERSON') {
        const cur = await trx.selectFrom('party_people').selectAll().where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).executeTakeFirstOrThrow();
        const next = {
          first_name: patch.first_name ?? cur.first_name, last_name: patch.last_name !== undefined ? (patch.last_name || null) : cur.last_name,
          middle_name: patch.middle_name !== undefined ? (patch.middle_name || null) : cur.middle_name,
          preferred_name: patch.preferred_name !== undefined ? (patch.preferred_name || null) : cur.preferred_name,
          title: patch.title !== undefined ? (patch.title || null) : cur.title,
          birthday: patch.birthday !== undefined ? (patch.birthday || null) : cur.birthday,
        };
        displayName = [next.first_name, next.last_name].filter(Boolean).join(' ').trim();
        await trx.updateTable('party_people').set(next as any).where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
        await trx.updateTable('contacts').set({ first_name: next.first_name, last_name: next.last_name, job_title: next.title, updated_at: new Date() } as any)
          .where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      } else {
        const cur = await trx.selectFrom('party_organizations').selectAll().where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).executeTakeFirstOrThrow();
        const next = {
          legal_name: patch.legal_name ?? cur.legal_name,
          trading_name: patch.trading_name !== undefined ? (patch.trading_name || null) : cur.trading_name,
          registration_number: patch.registration_number !== undefined ? (patch.registration_number || null) : cur.registration_number,
          tax_identifier: patch.tax_identifier !== undefined ? (patch.tax_identifier || null) : cur.tax_identifier,
          website: patch.website !== undefined ? (patch.website || null) : cur.website,
          industry: patch.industry !== undefined ? (patch.industry || null) : cur.industry,
        };
        displayName = next.legal_name;
        await trx.updateTable('party_organizations').set(next).where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
        // The customers trigger mirrors name/registry/tax/website back onto the party; keep the customer in step.
        await trx.updateTable('customers').set({ name: next.legal_name, registry_number: next.registration_number, tax_id: next.tax_identifier, website: next.website, updated_at: new Date() } as any)
          .where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
        await trx.updateTable('suppliers').set({ name: next.legal_name, tax_id: next.tax_identifier, updated_at: new Date() } as any)
          .where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      }
      set.display_name = displayName;
      if (patch.visibility !== undefined) {
        set.visibility = patch.visibility;
        // A restricted party needs an owner; a tenant-wide one does not.
        set.owner_user_id = patch.visibility === 'TENANT' ? null : (party.owner_user_id ?? party.created_by ?? actor.id);
      }
      await trx.updateTable('parties').set(set as any).where('id', '=', id).where('tenant_id', '=', actor.tenantId).execute();

      if (Array.isArray(patch.channels)) {
        await trx.deleteFrom('party_channels').where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
        for (const c of patch.channels) {
          await trx.insertInto('party_channels').values({
            tenant_id: actor.tenantId, party_id: id, channel_type: c.type, value: c.value, normalized_value: this.normalizeChannel(c.type, c.value),
            label: c.label ?? 'work', context: c.context ?? (party.party_type === 'ORGANIZATION' ? 'ORGANIZATION' : 'WORK'),
            is_primary: !!c.is_primary, visibility: c.visibility ?? (patch.visibility ?? party.visibility),
          }).onConflict(oc => oc.columns(['tenant_id', 'party_id', 'channel_type', 'normalized_value']).doNothing()).execute();
        }
      }
      return trx.selectFrom('parties').selectAll().where('id', '=', id).where('tenant_id', '=', actor.tenantId).executeTakeFirstOrThrow();
    });
  }

  /** Archive/restore a party and keep its Contacts / Customers record in step. */
  static setArchived(actor: PartyActor, id: string, archived: boolean) {
    return withTenant(actor.tenantId, async trx => {
      const party = await this.editableParty(trx, actor, id);
      await trx.updateTable('parties').set({ status: archived ? 'ARCHIVED' : 'ACTIVE', updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      if (party.party_type === 'PERSON') {
        await trx.updateTable('contacts').set({ status: archived ? 'TRASHED' : 'ACTIVE', updated_at: new Date() } as any).where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      } else {
        await trx.updateTable('customers').set({ active: !archived, updated_at: new Date() } as any).where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
        await trx.updateTable('suppliers').set({ status: archived ? 'inactive' : 'active', updated_at: new Date() } as any).where('party_id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      }
      return { id, status: archived ? 'ARCHIVED' : 'ACTIVE' };
    });
  }

  /** Replace the share list. Only the owner/creator/an admin may share; principals must exist in this tenant. */
  static setShares(actor: PartyActor, id: string, shares: { principal_type: 'USER' | 'TEAM' | 'DEPARTMENT'; principal_id: string; permission?: 'VIEW' | 'EDIT' | 'MANAGE' }[]) {
    return withTenant(actor.tenantId, async trx => {
      const party = await this.visibleParty(trx, actor, id);
      if (!this.canManage(actor, party)) throw new PartyError(403, 'NOT_OWNER', 'Only the owner or an admin can change sharing.');
      for (const s of shares) {
        const ok = s.principal_type === 'USER'
          ? await trx.selectFrom('users').select('id').where('id', '=', s.principal_id).where('tenant_id', '=', actor.tenantId).executeTakeFirst()
          : s.principal_type === 'TEAM'
            ? await trx.selectFrom('hr_teams').select('id').where('id', '=', s.principal_id).where('tenant_id', '=', actor.tenantId).executeTakeFirst()
            : await trx.selectFrom('hr_departments').select('id').where('id', '=', s.principal_id).where('tenant_id', '=', actor.tenantId).executeTakeFirst();
        if (!ok) throw new PartyError(400, 'BAD_PRINCIPAL', `${s.principal_type.toLowerCase()} not found in this workspace.`);
      }
      await trx.deleteFrom('party_shares').where('tenant_id', '=', actor.tenantId).where('party_id', '=', id).execute();
      for (const s of shares) {
        await trx.insertInto('party_shares').values({
          tenant_id: actor.tenantId, party_id: id, principal_type: s.principal_type, principal_id: s.principal_id,
          permission: s.permission ?? 'VIEW', created_by: actor.id,
        }).onConflict(oc => oc.columns(['tenant_id', 'party_id', 'principal_type', 'principal_id']).doUpdateSet({ permission: s.permission ?? 'VIEW' })).execute();
      }
      // Sharing a PRIVATE party makes it an explicit-share party; removing every share reverts it.
      if (shares.length && party.visibility === 'PRIVATE') {
        await trx.updateTable('parties').set({ visibility: 'EXPLICIT_SHARE', updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      } else if (!shares.length && party.visibility === 'EXPLICIT_SHARE') {
        await trx.updateTable('parties').set({ visibility: 'PRIVATE', updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      }
      return trx.selectFrom('party_shares').selectAll().where('tenant_id', '=', actor.tenantId).where('party_id', '=', id).execute();
    });
  }

  static getShares(actor: PartyActor, id: string) {
    return withTenant(actor.tenantId, async trx => {
      const party = await this.visibleParty(trx, actor, id);
      if (!this.canManage(actor, party)) throw new PartyError(403, 'NOT_OWNER', 'Only the owner or an admin can see sharing.');
      return trx.selectFrom('party_shares').selectAll().where('tenant_id', '=', actor.tenantId).where('party_id', '=', id).execute();
    });
  }

  /**
   * Merge duplicates into a primary, transactionally. Everything that pointed
   * at a duplicate (channels, affiliations, relationships, shares, file links,
   * lead references) is re-pointed; the duplicate stays as a MERGED tombstone
   * with merged_into_id so old references still resolve.
   *
   * Refused where a merge would rewrite commercial history: an ORGANIZATION
   * that is a customer (invoices, shipments and contracts reference the
   * customer id) must be merged from Customers, not silently here.
   */
  static merge(actor: PartyActor, primaryId: string, duplicateIds: string[]) {
    if (!ADMIN_ROLES.includes(actor.role ?? '')) throw new PartyError(403, 'FORBIDDEN', 'Merging is limited to management roles.');
    const dups = [...new Set(duplicateIds)].filter(d => d !== primaryId);
    if (!dups.length) throw new PartyError(400, 'NO_DUPLICATES', 'Choose at least one different party to merge.');
    return withTenant(actor.tenantId, async trx => {
      const primary = await this.editableParty(trx, actor, primaryId);
      const rows = [];
      for (const d of dups) rows.push(await this.editableParty(trx, actor, d));
      if (rows.some(r => r.party_type !== primary.party_type)) throw new PartyError(400, 'TYPE_MISMATCH', 'Only parties of the same type can be merged.');
      if (primary.party_type === 'ORGANIZATION') {
        const customers = await trx.selectFrom('customers').select('id').where('tenant_id', '=', actor.tenantId).where('party_id', 'in', dups).execute();
        if (customers.length) throw new PartyError(409, 'IS_CUSTOMER', 'A duplicate is a customer with business history. Merge customers from the Customers app.');
        const suppliers = await trx.selectFrom('suppliers').select('id').where('tenant_id', '=', actor.tenantId).where('party_id', 'in', dups).execute();
        if (suppliers.length) throw new PartyError(409, 'IS_SUPPLIER', 'A duplicate is a supplier with bills and orders. Merge suppliers from the Vendors app.');
      }
      const t = actor.tenantId;
      const list = sql.join(dups.map(d => sql`${d}::uuid`));
      // Channels: move those the primary does not already have, drop the rest.
      await sql`UPDATE party_channels pc SET party_id = ${primaryId}, is_primary = false
        WHERE pc.tenant_id = ${t} AND pc.party_id IN (${list})
          AND NOT EXISTS (SELECT 1 FROM party_channels x WHERE x.tenant_id = ${t} AND x.party_id = ${primaryId} AND x.channel_type = pc.channel_type AND x.normalized_value = pc.normalized_value)`.execute(trx);
      await sql`DELETE FROM party_channels WHERE tenant_id = ${t} AND party_id IN (${list})`.execute(trx);
      // Shares: same idea, keyed by principal.
      await sql`UPDATE party_shares ps SET party_id = ${primaryId}
        WHERE ps.tenant_id = ${t} AND ps.party_id IN (${list})
          AND NOT EXISTS (SELECT 1 FROM party_shares x WHERE x.tenant_id = ${t} AND x.party_id = ${primaryId} AND x.principal_type = ps.principal_type AND x.principal_id = ps.principal_id)`.execute(trx);
      await sql`DELETE FROM party_shares WHERE tenant_id = ${t} AND party_id IN (${list})`.execute(trx);
      // Affiliations and relationships: re-point, skipping rows that would become self-links.
      await sql`UPDATE party_affiliations SET person_party_id = ${primaryId}, updated_at = now() WHERE tenant_id = ${t} AND person_party_id IN (${list})`.execute(trx);
      await sql`UPDATE party_affiliations SET organization_party_id = ${primaryId}, updated_at = now() WHERE tenant_id = ${t} AND organization_party_id IN (${list})`.execute(trx);
      await sql`DELETE FROM party_relationships WHERE tenant_id = ${t}
        AND ((from_party_id IN (${list}) AND to_party_id = ${primaryId}) OR (to_party_id IN (${list}) AND from_party_id = ${primaryId}) OR (from_party_id IN (${list}) AND to_party_id IN (${list})))`.execute(trx);
      await sql`UPDATE party_relationships SET from_party_id = ${primaryId}, updated_at = now() WHERE tenant_id = ${t} AND from_party_id IN (${list})`.execute(trx);
      await sql`UPDATE party_relationships SET to_party_id = ${primaryId}, updated_at = now() WHERE tenant_id = ${t} AND to_party_id IN (${list})`.execute(trx);
      await sql`UPDATE party_external_refs SET party_id = ${primaryId} WHERE tenant_id = ${t} AND party_id IN (${list})`.execute(trx);
      // File links keyed by the duplicate's contact/customer/party id follow to the primary.
      await sql`UPDATE resource_file_links l SET resource_id = ${primaryId}
        WHERE l.tenant_id = ${t} AND l.resource_type IN ('contact', 'customer', 'party') AND l.resource_id IN (${list})
          AND NOT EXISTS (SELECT 1 FROM resource_file_links x WHERE x.tenant_id = ${t} AND x.file_id = l.file_id AND x.resource_type = l.resource_type AND x.resource_id = ${primaryId} AND x.relationship_type = l.relationship_type)`.execute(trx);
      await sql`UPDATE leads SET contact_party_id = ${primaryId} WHERE tenant_id = ${t} AND contact_party_id IN (${list})`.execute(trx);
      await sql`UPDATE leads SET organization_party_id = ${primaryId} WHERE tenant_id = ${t} AND organization_party_id IN (${list})`.execute(trx);
      // The duplicates' Contacts rows go to Trash (reversible) — their party is a tombstone now.
      await sql`UPDATE contacts SET status = 'TRASHED', updated_at = now() WHERE tenant_id = ${t} AND party_id IN (${list})`.execute(trx);
      await sql`UPDATE parties SET status = 'MERGED', merged_into_id = ${primaryId}, updated_at = now() WHERE tenant_id = ${t} AND id IN (${list})`.execute(trx);
      return { primary_id: primaryId, merged: dups };
    });
  }

  static duplicateCandidates(actor: PartyActor, email?: string, phone?: string) {
    return withTenant(actor.tenantId, async trx => {
      const values = [email ? this.normalizeChannel('EMAIL', email) : null, phone ? this.normalizeChannel('PHONE', phone) : null].filter(Boolean) as string[];
      if (!values.length) return [];
      return trx.selectFrom('parties').innerJoin('party_channels', 'party_channels.party_id', 'parties.id')
        .select(['parties.id', 'parties.party_type', 'parties.display_name', 'party_channels.channel_type', 'party_channels.value'])
        .where('parties.tenant_id', '=', actor.tenantId).where('party_channels.tenant_id', '=', actor.tenantId)
        .where('parties.status', 'not in', ['MERGED', 'ARCHIVED'])
        .where('party_channels.normalized_value', 'in', values).where(partyVisibleSql(actor)).limit(20).execute();
    });
  }
}
