import { db, withTenant } from '../db/client.js';
import { sql } from 'kysely';

export class ContactsService {
  private static async resolveTenantId(trx: any, tenantId: string): Promise<string> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!tenantId || !uuidRegex.test(tenantId)) {
      const firstTenant = await trx.selectFrom('tenants').select('id').executeTakeFirst();
      return firstTenant ? firstTenant.id : tenantId;
    }
    const exists = await trx.selectFrom('tenants').select('id').where('id', '=', tenantId).executeTakeFirst();
    if (exists) return tenantId;
    
    const firstTenant = await trx.selectFrom('tenants').select('id').executeTakeFirst();
    return firstTenant ? firstTenant.id : tenantId;
  }

  static async getContacts(tenantId: string, status: string = 'ACTIVE') {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      // Fetch contacts
      const contacts = await trx
        .selectFrom('contacts')
        .selectAll()
        .where('tenant_id', '=', resolvedTenantId)
        .where('status', '=', status)
        .orderBy('first_name', 'asc')
        .execute();

      if (contacts.length === 0) return [];

      // Fetch all label mappings for this tenant's contacts
      const mappings = await trx
        .selectFrom('contact_label_mappings')
        .innerJoin('contact_labels', 'contact_labels.id', 'contact_label_mappings.label_id')
        .select([
          'contact_label_mappings.contact_id',
          'contact_labels.id as label_id',
          'contact_labels.name as label_name'
        ])
        .where('contact_labels.tenant_id', '=', resolvedTenantId)
        .execute();

      // Bulk-fetch every additional email/phone for this tenant's contacts —
      // one query each, same "fetch all, group in memory" shape the label
      // mappings above already use, not N+1 per-contact queries.
      const [allEmails, allPhones] = await Promise.all([
        trx.selectFrom('contact_emails').selectAll().where('tenant_id', '=', resolvedTenantId).execute(),
        trx.selectFrom('contact_phones').selectAll().where('tenant_id', '=', resolvedTenantId).execute(),
      ]);

      // Attach labels/emails/phones to contacts
      return contacts.map(contact => ({
        ...contact,
        labels: mappings
          .filter(m => m.contact_id === contact.id)
          .map(m => ({ id: m.label_id, name: m.label_name })),
        emails: allEmails.filter(e => e.contact_id === contact.id),
        phones: allPhones.filter(p => p.contact_id === contact.id),
      }));
    });
  }

  static async logActivity(trx: any, params: {
    tenantId: string; contactId: string; actorId?: string | null; actorName?: string | null;
    action: string; detail?: string | null;
  }) {
    await trx
      .insertInto('contact_activity_log')
      .values({
        tenant_id: params.tenantId,
        contact_id: params.contactId,
        actor_id: params.actorId || null,
        actor_name: params.actorName || null,
        action: params.action,
        detail: params.detail || null,
      })
      .execute();
  }

  static async createContact(tenantId: string, data: any, actor?: { id?: string; name?: string }) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      const [contact] = await trx
        .insertInto('contacts')
        .values({
          tenant_id: resolvedTenantId,
          first_name: data.first_name,
          last_name: data.last_name || null,
          email: data.email || null,
          phone: data.phone || null,
          company: data.company || null,
          company_id: data.company_id || null,
          job_title: data.job_title || null,
          notes: data.notes || null,
          birthday: data.birthday ? new Date(data.birthday) : null,
          is_favorite: data.is_favorite ?? false,
          avatar_url: data.avatar_url || null,
          website: data.website || null,
          location: data.location || null,
          industry: data.industry || null,
          company_size: data.company_size || null,
          sales_owner: data.sales_owner || null,
          sales_owner_id: data.sales_owner_id || null,
          last_contacted_at: data.last_contacted_at ? new Date(data.last_contacted_at) : null,
          address_street: data.address_street || null,
          address_city: data.address_city || null,
          address_state: data.address_state || null,
          address_postal_code: data.address_postal_code || null,
          address_country: data.address_country || null,
          status: 'ACTIVE',
          source: data.source || 'manual',
        })
        .returningAll()
        .execute();

      // Add label mappings if provided
      if (Array.isArray(data.label_ids) && data.label_ids.length > 0) {
        await trx
          .insertInto('contact_label_mappings')
          .values(data.label_ids.map((labelId: string) => ({
            contact_id: contact.id,
            label_id: labelId
          })))
          .execute();
      }

      // Additional emails/phones beyond the primary (which lives on the
      // contact row itself, set above) — see syncEmailsAndPhones's own
      // header for why this is app logic and not a trigger.
      await this.syncEmailsAndPhones(trx, resolvedTenantId, contact.id, contact.email, contact.phone, data.emails, data.phones);

      await this.logActivity(trx, {
        tenantId: resolvedTenantId, contactId: contact.id,
        actorId: actor?.id, actorName: actor?.name,
        action: 'created', detail: 'Contact created',
      });
      if (data.company) {
        await this.logActivity(trx, {
          tenantId: resolvedTenantId, contactId: contact.id,
          actorId: actor?.id, actorName: actor?.name,
          action: 'company_linked', detail: `Linked to company "${data.company}"`,
        });
      }

      return {
        ...contact,
        labels: [],
        emails: await this.getEmails(trx, contact.id),
        phones: await this.getPhones(trx, contact.id),
      };
    });
  }

  // ─── MULTI-VALUE EMAIL/PHONE (migration 438) ────────────────────────────────
  // contacts.email/contacts.phone stay the primary value so every existing
  // dedup/import/sync path (all written against those two scalar columns)
  // keeps working unmodified. These tables hold every value beyond the
  // first; this function is the one place that keeps a contact's primary
  // scalar column and its "is_primary" row in contact_emails/contact_phones
  // pointed at the same value, called from both create and update rather
  // than left to drift as two independently-editable representations.

  static async getEmails(trx: any, contactId: string) {
    return trx.selectFrom('contact_emails').selectAll().where('contact_id', '=', contactId).orderBy('is_primary', 'desc').orderBy('created_at', 'asc').execute();
  }

  static async getPhones(trx: any, contactId: string) {
    return trx.selectFrom('contact_phones').selectAll().where('contact_id', '=', contactId).orderBy('is_primary', 'desc').orderBy('created_at', 'asc').execute();
  }

  private static async syncEmailsAndPhones(
    trx: any, tenantId: string, contactId: string,
    primaryEmail: string | null, primaryPhone: string | null,
    emails?: Array<{ label?: string; email: string }>,
    phones?: Array<{ label?: string; phone: string }>,
  ) {
    if (Array.isArray(emails)) {
      await trx.deleteFrom('contact_emails').where('contact_id', '=', contactId).execute();
      const rows = emails
        .filter(e => e.email && e.email.trim())
        .map(e => ({
          tenant_id: tenantId, contact_id: contactId,
          label: (e.label as any) || 'other', email: e.email.trim(),
          is_primary: primaryEmail ? e.email.trim().toLowerCase() === primaryEmail.toLowerCase() : false,
        }));
      if (rows.length) await trx.insertInto('contact_emails').values(rows).execute();
    }
    if (Array.isArray(phones)) {
      await trx.deleteFrom('contact_phones').where('contact_id', '=', contactId).execute();
      const rows = phones
        .filter(p => p.phone && p.phone.trim())
        .map(p => ({
          tenant_id: tenantId, contact_id: contactId,
          label: (p.label as any) || 'other', phone: p.phone.trim(),
          is_primary: primaryPhone ? p.phone.trim() === primaryPhone.trim() : false,
        }));
      if (rows.length) await trx.insertInto('contact_phones').values(rows).execute();
    }
  }

  static async updateContact(tenantId: string, id: string, data: any, actor?: { id?: string; name?: string }) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      const existing = await trx
        .selectFrom('contacts')
        .select(['company', 'company_id'])
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', '=', id)
        .executeTakeFirst();

      const updateData: any = {
        updated_at: new Date()
      };

      if (data.first_name !== undefined) updateData.first_name = data.first_name;
      if (data.last_name !== undefined) updateData.last_name = data.last_name || null;
      if (data.email !== undefined) updateData.email = data.email || null;
      if (data.phone !== undefined) updateData.phone = data.phone || null;
      if (data.company !== undefined) updateData.company = data.company || null;
      if (data.company_id !== undefined) updateData.company_id = data.company_id || null;
      if (data.job_title !== undefined) updateData.job_title = data.job_title || null;
      if (data.notes !== undefined) updateData.notes = data.notes || null;
      if (data.birthday !== undefined) updateData.birthday = data.birthday ? new Date(data.birthday) : null;
      if (data.is_favorite !== undefined) updateData.is_favorite = data.is_favorite;
      if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url || null;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.website !== undefined) updateData.website = data.website || null;
      if (data.location !== undefined) updateData.location = data.location || null;
      if (data.industry !== undefined) updateData.industry = data.industry || null;
      if (data.company_size !== undefined) updateData.company_size = data.company_size || null;
      if (data.sales_owner !== undefined) updateData.sales_owner = data.sales_owner || null;
      if (data.sales_owner_id !== undefined) updateData.sales_owner_id = data.sales_owner_id || null;
      if (data.last_contacted_at !== undefined) updateData.last_contacted_at = data.last_contacted_at ? new Date(data.last_contacted_at) : null;
      if (data.address_street !== undefined) updateData.address_street = data.address_street || null;
      if (data.address_city !== undefined) updateData.address_city = data.address_city || null;
      if (data.address_state !== undefined) updateData.address_state = data.address_state || null;
      if (data.address_postal_code !== undefined) updateData.address_postal_code = data.address_postal_code || null;
      if (data.address_country !== undefined) updateData.address_country = data.address_country || null;

      const [contact] = await trx
        .updateTable('contacts')
        .set(updateData)
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', '=', id)
        .returningAll()
        .execute();

      if (!contact) throw new Error('Contact not found');

      if (data.emails !== undefined || data.phones !== undefined) {
        await this.syncEmailsAndPhones(trx, resolvedTenantId, id, contact.email, contact.phone, data.emails, data.phones);
      }

      // Log company link/switch/unlink whenever the company changed
      if (data.company !== undefined || data.company_id !== undefined) {
        const prevCompany = existing?.company || null;
        const nextCompany = contact.company || null;
        if (prevCompany !== nextCompany) {
          const action = !prevCompany ? 'company_linked' : !nextCompany ? 'company_unlinked' : 'company_changed';
          const detail = !prevCompany
            ? `Linked to company "${nextCompany}"`
            : !nextCompany
              ? `Removed company "${prevCompany}"`
              : `Company changed from "${prevCompany}" to "${nextCompany}"`;
          await this.logActivity(trx, {
            tenantId: resolvedTenantId, contactId: id,
            actorId: actor?.id, actorName: actor?.name,
            action, detail,
          });
        }
      }

      // Update labels if provided
      if (Array.isArray(data.label_ids)) {
        // Clear existing
        await trx
          .deleteFrom('contact_label_mappings')
          .where('contact_id', '=', id)
          .execute();

        // Insert new
        if (data.label_ids.length > 0) {
          await trx
            .insertInto('contact_label_mappings')
            .values(data.label_ids.map((labelId: string) => ({
              contact_id: id,
              label_id: labelId
            })))
            .execute();
        }
      }

      return {
        ...contact,
        emails: await this.getEmails(trx, id),
        phones: await this.getPhones(trx, id),
      };
    });
  }

  static async getActivityLog(tenantId: string, contactId: string) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      return await trx
        .selectFrom('contact_activity_log')
        .selectAll()
        .where('tenant_id', '=', resolvedTenantId)
        .where('contact_id', '=', contactId)
        .orderBy('created_at', 'asc')
        .execute();
    });
  }

  static async deleteContact(tenantId: string, id: string, hard: boolean = false) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      if (hard) {
        await trx
          .deleteFrom('contacts')
          .where('tenant_id', '=', resolvedTenantId)
          .where('id', '=', id)
          .execute();
      } else {
        await trx
          .updateTable('contacts')
          .set({ status: 'TRASHED', updated_at: new Date() })
          .where('tenant_id', '=', resolvedTenantId)
          .where('id', '=', id)
          .execute();
      }
      return { success: true };
    });
  }

  static async restoreContact(tenantId: string, id: string) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      await trx
        .updateTable('contacts')
        .set({ status: 'ACTIVE', updated_at: new Date() })
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', '=', id)
        .execute();
      return { success: true };
    });
  }

  // ─── LABELS ────────────────────────────────────────────────────────────────

  static async getLabels(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      return await trx
        .selectFrom('contact_labels')
        .selectAll()
        .where('tenant_id', '=', resolvedTenantId)
        .orderBy('name', 'asc')
        .execute();
    });
  }

  static async createLabel(tenantId: string, name: string) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      const [label] = await trx
        .insertInto('contact_labels')
        .values({
          tenant_id: resolvedTenantId,
          name: name
        })
        .returningAll()
        .execute();
      return label;
    });
  }

  static async deleteLabel(tenantId: string, id: string) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      await trx
        .deleteFrom('contact_labels')
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', '=', id)
        .execute();
      return { success: true };
    });
  }

  // ─── BULK OPERATIONS ───────────────────────────────────────────────────────

  static async bulkDelete(tenantId: string, ids: string[], status: 'TRASHED' | 'ACTIVE' | 'DELETE') {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      if (ids.length === 0) return { success: true };
      
      if (status === 'DELETE') {
        await trx
          .deleteFrom('contacts')
          .where('tenant_id', '=', resolvedTenantId)
          .where('id', 'in', ids)
          .execute();
      } else {
        await trx
          .updateTable('contacts')
          .set({ status, updated_at: new Date() })
          .where('tenant_id', '=', resolvedTenantId)
          .where('id', 'in', ids)
          .execute();
      }
      return { success: true };
    });
  }

  static async bulkLabel(tenantId: string, contactIds: string[], labelId: string, action: 'ADD' | 'REMOVE') {
    return withTenant(tenantId, async (trx) => {
      if (contactIds.length === 0) return { success: true };

      if (action === 'REMOVE') {
        await trx
          .deleteFrom('contact_label_mappings')
          .where('label_id', '=', labelId)
          .where('contact_id', 'in', contactIds)
          .execute();
      } else {
        // Find existing mappings to avoid duplicate inserts
        const existing = await trx
          .selectFrom('contact_label_mappings')
          .select('contact_id')
          .where('label_id', '=', labelId)
          .where('contact_id', 'in', contactIds)
          .execute();

        const existingIds = new Set(existing.map(e => e.contact_id));
        const toInsert = contactIds.filter(id => !existingIds.has(id));

        if (toInsert.length > 0) {
          await trx
            .insertInto('contact_label_mappings')
            .values(toInsert.map(contactId => ({
              contact_id: contactId,
              label_id: labelId
            })))
            .execute();
        }
      }
      return { success: true };
    });
  }

  // ─── MERGE & FIX ───────────────────────────────────────────────────────────

  static async getDuplicates(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      // Subquery to find duplicate emails
      const dupEmails = await trx
        .selectFrom('contacts')
        .select('email')
        .where('tenant_id', '=', resolvedTenantId)
        .where('status', '=', 'ACTIVE')
        .where('email', 'is not', null)
        .groupBy('email')
        .having(sql`count(*)`, '>', 1)
        .execute();

      // Subquery to find duplicate phones
      const dupPhones = await trx
        .selectFrom('contacts')
        .select('phone')
        .where('tenant_id', '=', resolvedTenantId)
        .where('status', '=', 'ACTIVE')
        .where('phone', 'is not', null)
        .groupBy('phone')
        .having(sql`count(*)`, '>', 1)
        .execute();

      const emailList = dupEmails.map(d => d.email).filter(Boolean) as string[];
      const phoneList = dupPhones.map(d => d.phone).filter(Boolean) as string[];

      // No early return here even when both lists are empty — the fuzzy
      // name-similarity and normalized-phone passes below are independent
      // detection methods that can still find real matches an exact-string
      // comparison misses entirely (that's the whole point of adding them).
      let matchingContacts: any[] = [];
      if (emailList.length > 0 || phoneList.length > 0) {
        let query = trx
          .selectFrom('contacts')
          .selectAll()
          .where('tenant_id', '=', resolvedTenantId)
          .where('status', '=', 'ACTIVE');

        if (emailList.length > 0 && phoneList.length > 0) {
          query = query.where((eb) =>
            eb.or([
              eb('email', 'in', emailList),
              eb('phone', 'in', phoneList)
            ])
          );
        } else if (emailList.length > 0) {
          query = query.where('email', 'in', emailList);
        } else {
          query = query.where('phone', 'in', phoneList);
        }

        matchingContacts = await query.orderBy('first_name', 'asc').execute();
      }

      // Group them by duplicate criteria (email or phone)
      const groups: Record<string, any[]> = {};

      for (const contact of matchingContacts) {
        const emailKey = contact.email ? `email:${contact.email}` : null;
        const phoneKey = contact.phone ? `phone:${contact.phone}` : null;

        if (emailKey) {
          if (!groups[emailKey]) groups[emailKey] = [];
          groups[emailKey].push(contact);
        }
        if (phoneKey && (!emailKey || !groups[emailKey])) {
          if (!groups[phoneKey]) groups[phoneKey] = [];
          groups[phoneKey].push(contact);
        }
      }

      const exactContactIds = new Set(matchingContacts.map(c => c.id));

      // ── Normalized-phone matches — the last 9 digits, so "+255712345678",
      // "255712345678" and "0712345678" (the same real Tanzanian number,
      // three formats) are caught even though the exact-match pass above
      // treats them as unrelated strings.
      const normPhoneRows = await sql<{ norm: string; ids: string[] }>`
        SELECT right(regexp_replace(phone, '\D', '', 'g'), 9) AS norm, array_agg(id::text) AS ids
        FROM contacts
        WHERE tenant_id = ${resolvedTenantId} AND status = 'ACTIVE' AND phone IS NOT NULL
          AND length(regexp_replace(phone, '\D', '', 'g')) >= 9
        GROUP BY norm
        HAVING count(*) > 1
      `.execute(trx);

      // ── Fuzzy name matches — real pg_trgm trigram similarity (same
      // mechanism sanctions screening already uses, see that service's own
      // header), not a fabricated "close enough" heuristic. 0.5 is a
      // stricter bar than sanctions screening's 0.45 flag threshold —
      // false positives here just mean a suggested merge, not a compliance
      // flag, but a chattier list is a worse experience, not a safer one.
      const fuzzyRows = await sql<{ id: string; first_name: string; last_name: string | null; other_id: string; score: number }>`
        SELECT a.id, a.first_name, a.last_name, b.id AS other_id,
               similarity(a.first_name || ' ' || coalesce(a.last_name, ''), b.first_name || ' ' || coalesce(b.last_name, '')) AS score
        FROM contacts a
        JOIN contacts b ON b.tenant_id = a.tenant_id AND b.id > a.id AND b.status = 'ACTIVE'
        WHERE a.tenant_id = ${resolvedTenantId} AND a.status = 'ACTIVE'
          AND similarity(a.first_name || ' ' || coalesce(a.last_name, ''), b.first_name || ' ' || coalesce(b.last_name, '')) >= 0.5
      `.execute(trx);

      const extraIds = new Set<string>();
      for (const r of normPhoneRows.rows) for (const id of r.ids) extraIds.add(id);
      for (const r of fuzzyRows.rows) { extraIds.add(r.id); extraIds.add(r.other_id); }
      const newIds = [...extraIds].filter(id => !exactContactIds.has(id));
      const extraContacts = newIds.length
        ? await trx.selectFrom('contacts').selectAll().where('id', 'in', newIds).where('tenant_id', '=', resolvedTenantId).execute()
        : [];
      const byId = new Map([...matchingContacts, ...extraContacts].map(c => [c.id, c]));

      for (const r of normPhoneRows.rows) {
        const key = `phone_normalized:${r.norm}`;
        groups[key] = r.ids.map(id => byId.get(id)).filter(Boolean);
      }
      for (const r of fuzzyRows.rows) {
        const key = `name_similarity:${[r.id, r.other_id].sort().join('|')}`;
        if (!groups[key]) groups[key] = [byId.get(r.id), byId.get(r.other_id)].filter(Boolean);
      }

      return Object.entries(groups).filter(([, contacts]) => contacts.length > 1).map(([key, contacts]) => ({
        type: key.split(':')[0],
        value: key.split(':').slice(1).join(':'),
        contacts
      }));
    });
  }

  static async mergeContacts(tenantId: string, primaryId: string, duplicateIds: string[]) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);

      // Get the primary contact
      const primary = await trx
        .selectFrom('contacts')
        .selectAll()
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', '=', primaryId)
        .executeTakeFirstOrThrow();

      // Get the duplicate contacts
      const duplicates = await trx
        .selectFrom('contacts')
        .selectAll()
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', 'in', duplicateIds)
        .execute();

      // Aggregate details (notes, phone, company, etc. if missing on primary)
      const mergedData: any = {};
      
      for (const dup of duplicates) {
        if (!primary.phone && dup.phone) mergedData.phone = dup.phone;
        if (!primary.email && dup.email) mergedData.email = dup.email;
        if (!primary.company && dup.company) mergedData.company = dup.company;
        if (!primary.job_title && dup.job_title) mergedData.job_title = dup.job_title;
        if (!primary.notes && dup.notes) mergedData.notes = dup.notes;
        else if (primary.notes && dup.notes && !primary.notes.includes(dup.notes)) {
          mergedData.notes = `${primary.notes}\n\nMerged Note:\n${dup.notes}`;
        }
      }

      if (Object.keys(mergedData).length > 0) {
        await trx
          .updateTable('contacts')
          .set(mergedData)
          .where('id', '=', primaryId).where('tenant_id', '=', tenantId)
          .execute();
      }

      // Merge labels: copy all label mappings from duplicates to primary
      const dupMappings = await trx
        .selectFrom('contact_label_mappings')
        .select('label_id')
        .where('contact_id', 'in', duplicateIds)
        .execute();

      const labelIds = [...new Set(dupMappings.map(m => m.label_id))];
      if (labelIds.length > 0) {
        for (const labelId of labelIds) {
          try {
            await trx
              .insertInto('contact_label_mappings')
              .values({ contact_id: primaryId, label_id: labelId })
              .execute();
          } catch {
            // Ignore duplicate key errors if primary already has the label
          }
        }
      }

      // Delete duplicate contacts
      await trx
        .deleteFrom('contacts')
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', 'in', duplicateIds)
        .execute();

      return { success: true };
    });
  }

  // ─── EXPORT ──────────────────────────────────────────────────────────────
  // Import (CSV/vCard) already existed; export never did — this closes that
  // gap the other direction. Headers deliberately match what the import
  // parser already reads ("First Name"/"Last Name"/etc., same convention
  // Google Contacts' own CSV export uses per that parser's own comment), so
  // exporting from here and re-importing elsewhere round-trips cleanly.

  private static csvField(v: unknown): string {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  static async exportToCSV(tenantId: string, contactIds?: string[]): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);
      let query = trx.selectFrom('contacts').selectAll().where('tenant_id', '=', resolvedTenantId).where('status', '=', 'ACTIVE');
      if (contactIds?.length) query = query.where('id', 'in', contactIds);
      const contacts = await query.orderBy('first_name', 'asc').execute();

      const headers = [
        'First Name', 'Last Name', 'E-mail Address', 'Phone Number', 'Organization Name', 'Job Title',
        'Website', 'Birthday', 'Street', 'City', 'State/Province', 'Postal Code', 'Country', 'Notes',
      ];
      const lines = [headers.join(',')];
      for (const c of contacts) {
        lines.push([
          c.first_name, c.last_name, c.email, c.phone, c.company, c.job_title,
          c.website, c.birthday ? new Date(c.birthday).toISOString().slice(0, 10) : '',
          c.address_street, c.address_city, c.address_state, c.address_postal_code, c.address_country, c.notes,
        ].map(v => this.csvField(v)).join(','));
      }
      return lines.join('\r\n');
    });
  }

  private static vcardEscape(v: unknown): string {
    return v == null ? '' : String(v).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  }

  static async exportToVCard(tenantId: string, contactIds?: string[]): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);
      let query = trx.selectFrom('contacts').selectAll().where('tenant_id', '=', resolvedTenantId).where('status', '=', 'ACTIVE');
      if (contactIds?.length) query = query.where('id', 'in', contactIds);
      const contacts = await query.orderBy('first_name', 'asc').execute();

      const cards = contacts.map(c => {
        const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
        lines.push(`N:${this.vcardEscape(c.last_name)};${this.vcardEscape(c.first_name)};;;`);
        lines.push(`FN:${this.vcardEscape(`${c.first_name} ${c.last_name || ''}`.trim())}`);
        if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${this.vcardEscape(c.email)}`);
        if (c.phone) lines.push(`TEL;TYPE=CELL:${this.vcardEscape(c.phone)}`);
        if (c.company) lines.push(`ORG:${this.vcardEscape(c.company)}`);
        if (c.job_title) lines.push(`TITLE:${this.vcardEscape(c.job_title)}`);
        if (c.website) lines.push(`URL:${this.vcardEscape(c.website)}`);
        if (c.birthday) lines.push(`BDAY:${new Date(c.birthday).toISOString().slice(0, 10).replace(/-/g, '')}`);
        if (c.address_street || c.address_city || c.address_country) {
          lines.push(`ADR;TYPE=WORK:;;${this.vcardEscape(c.address_street)};${this.vcardEscape(c.address_city)};${this.vcardEscape(c.address_state)};${this.vcardEscape(c.address_postal_code)};${this.vcardEscape(c.address_country)}`);
        }
        if (c.notes) lines.push(`NOTE:${this.vcardEscape(c.notes)}`);
        lines.push('END:VCARD');
        return lines.join('\r\n');
      });
      return cards.join('\r\n');
    });
  }

  // ─── BIRTHDAY REMINDERS (used by jobs/contact-birthday-reminders.job.ts) ──
  // Real, stored birthday column (029) that nothing ever read back — this
  // is the query that job runs daily. "Days until" is computed in JS, not
  // SQL date arithmetic across a year boundary — deliberately: a birthday
  // is a month/day, and the actual year on the stored date is irrelevant
  // (someone born in 1990 still turns a year older on the same calendar
  // day every year), which is far easier to get right comparing two
  // month/day pairs in JS than folding "wrap around Dec 31" into one SQL
  // expression.
  static async getUpcomingBirthdays(tenantId: string, withinDays: number = 7) {
    return withTenant(tenantId, async (trx) => {
      const resolvedTenantId = await this.resolveTenantId(trx, tenantId);
      const rows = await trx.selectFrom('contacts')
        .select(['id', 'first_name', 'last_name', 'birthday'])
        .where('tenant_id', '=', resolvedTenantId).where('status', '=', 'ACTIVE').where('birthday', 'is not', null)
        .execute();

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayY = today.getFullYear();
      return rows
        .map(r => {
          const b = new Date(r.birthday as unknown as string);
          let next = new Date(todayY, b.getMonth(), b.getDate());
          if (next < today) next = new Date(todayY + 1, b.getMonth(), b.getDate());
          const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
          return { ...r, days_until: daysUntil };
        })
        .filter(r => r.days_until >= 0 && r.days_until <= withinDays)
        .sort((a, b) => a.days_until - b.days_until);
    });
  }
}
