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

      // Attach labels to contacts
      return contacts.map(contact => ({
        ...contact,
        labels: mappings
          .filter(m => m.contact_id === contact.id)
          .map(m => ({ id: m.label_id, name: m.label_name }))
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
          last_contacted_at: data.last_contacted_at ? new Date(data.last_contacted_at) : null,
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
        labels: []
      };
    });
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
      if (data.last_contacted_at !== undefined) updateData.last_contacted_at = data.last_contacted_at ? new Date(data.last_contacted_at) : null;

      const [contact] = await trx
        .updateTable('contacts')
        .set(updateData)
        .where('tenant_id', '=', resolvedTenantId)
        .where('id', '=', id)
        .returningAll()
        .execute();

      if (!contact) throw new Error('Contact not found');

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

      return contact;
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

      if (emailList.length === 0 && phoneList.length === 0) return [];

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

      const matchingContacts = await query.orderBy('first_name', 'asc').execute();

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

      return Object.entries(groups).map(([key, contacts]) => ({
        type: key.split(':')[0],
        value: key.split(':')[1],
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
}
