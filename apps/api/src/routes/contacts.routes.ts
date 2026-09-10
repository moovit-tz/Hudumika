import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ContactsService } from '../services/contacts.service.js';
import { parse } from 'csv-parse/sync';

const mergeSchema = z.object({
  primary_id: z.string().min(1),
  duplicate_ids: z.array(z.string()).min(1),
});
const labelCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parent_id: z.string().uuid().nullish(),
});
const labelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  // present-but-null = move to top level; absent = leave where it is
  parent_id: z.string().uuid().nullable().optional(),
}).refine(d => d.name !== undefined || d.parent_id !== undefined, { message: 'Nothing to update' });

const smartRuleSchema = z.object({
  field: z.string().min(1).max(40),
  op: z.string().min(1).max(20),
  value: z.union([z.string().max(200), z.number(), z.boolean(), z.null()]).optional(),
});
const smartGroupCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  match_type: z.enum(['all', 'any']).optional(),
  rules: z.array(smartRuleSchema).max(25).optional(),
});
const smartGroupUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  match_type: z.enum(['all', 'any']).optional(),
  rules: z.array(smartRuleSchema).max(25).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Nothing to update' });

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
  status: z.enum(['TRASHED', 'ACTIVE', 'DELETE']),
});
const bulkLabelSchema = z.object({
  contact_ids: z.array(z.string()).min(1),
  label_id: z.string().min(1),
  action: z.enum(['ADD', 'REMOVE']),
});

export async function contactsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('contacts'));
  // Production-readiness audit HUD-0024/0027: Contacts has no per-route role
  // check anywhere in this file (neither does the frontend — it's a flat,
  // shared address book any internal staff role can manage, by design). But
  // "any authenticated tenant member" also includes CUSTOMER — an external
  // portal account — which had no route to this at all otherwise. Proven
  // live: a CUSTOMER JWT could GET /v1/contacts (200, this tenant's contacts
  // happened to be empty) and, by the same missing check, bulk-delete/
  // import/merge them. This blocks only the external role; every internal
  // role keeps exactly the flat access it already had.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // Get all contacts (optional status query: ACTIVE or TRASHED)
  fastify.get('/', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { status } = request.query as { status?: string };
      return await ContactsService.getContacts(tenantId, status || 'ACTIVE');
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Create a contact
  fastify.post('/', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const actor = { id: request.user.sub, name: request.user.name };
      return await ContactsService.createContact(tenantId, request.body, actor);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Update a contact
  fastify.patch('/:id', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      const actor = { id: request.user.sub, name: request.user.name };
      return await ContactsService.updateContact(tenantId, id, request.body, actor);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Get activity log for a contact
  fastify.get('/:id/activity', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      return await ContactsService.getActivityLog(tenantId, id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Delete a contact (optional hard delete query)
  fastify.delete('/:id', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      const { hard } = request.query as { hard?: string };
      return await ContactsService.deleteContact(tenantId, id, hard === 'true');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Restore a contact from trash
  fastify.post('/:id/restore', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      return await ContactsService.restoreContact(tenantId, id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Get duplicate suggestions
  fastify.get('/duplicates', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await ContactsService.getDuplicates(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Merge duplicate contacts
  fastify.post('/merge', async (request: any, reply) => {
    const { primary_id, duplicate_ids } = mergeSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      return await ContactsService.mergeContacts(tenantId, primary_id, duplicate_ids);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Get all labels
  fastify.get('/labels', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await ContactsService.getLabels(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Create a label (optional parent_id nests it under another label)
  fastify.post('/labels', async (request: any, reply) => {
    const { name, parent_id } = labelCreateSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      return await ContactsService.createLabel(tenantId, name, parent_id ?? null);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Rename and/or re-parent a label
  fastify.patch('/labels/:id', async (request: any, reply) => {
    const body = labelUpdateSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      return await ContactsService.updateLabel(tenantId, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Delete a label
  fastify.delete('/labels/:id', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      return await ContactsService.deleteLabel(tenantId, id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Bulk Delete
  fastify.post('/bulk-delete', async (request: any, reply) => {
    const { ids, status } = bulkDeleteSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      return await ContactsService.bulkDelete(tenantId, ids, status);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Bulk Label mapping
  fastify.post('/bulk-label', async (request: any, reply) => {
    const { contact_ids, label_id, action } = bulkLabelSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      return await ContactsService.bulkLabel(tenantId, contact_ids, label_id, action);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── Smart groups — saved filters with computed membership ───────────────

  fastify.get('/smart-groups', async (request: any, reply) => {
    try {
      return await ContactsService.listSmartGroups(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/smart-groups', async (request: any, reply) => {
    const body = smartGroupCreateSchema.parse(request.body);
    try {
      return await ContactsService.createSmartGroup(request.user.tenant_id, body, { id: request.user.sub });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/smart-groups/:id', async (request: any, reply) => {
    const body = smartGroupUpdateSchema.parse(request.body);
    try {
      const { id } = request.params as { id: string };
      return await ContactsService.updateSmartGroup(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/smart-groups/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await ContactsService.deleteSmartGroup(request.user.tenant_id, id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // The evaluated contact list for one group — same enriched shape as GET /
  fastify.get('/smart-groups/:id/contacts', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await ContactsService.getSmartGroupContacts(request.user.tenant_id, id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Export contacts — mirrors the CSV/vCard shapes /import already accepts,
  // so a round-trip (export, edit, re-import) works. `?ids=` is an optional
  // comma-separated list to export a selection; omitted means "all active".
  fastify.get('/export.csv', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { ids } = request.query as { ids?: string };
      const csv = await ContactsService.exportToCSV(tenantId, ids ? ids.split(',').filter(Boolean) : undefined);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/export.vcf', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { ids } = request.query as { ids?: string };
      const vcf = await ContactsService.exportToVCard(tenantId, ids ? ids.split(',').filter(Boolean) : undefined);
      reply.header('Content-Type', 'text/vcard; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.vcf"`);
      return reply.send(vcf);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Upcoming birthdays — powers a "Birthdays" widget; the actual reminder
  // notification is a separate daily job (contact-birthday-reminder.job.ts),
  // this just lets the UI show what's coming without waiting for that job.
  fastify.get('/birthdays', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { within } = request.query as { within?: string };
      const withinDays = within ? Math.max(0, Math.min(365, parseInt(within, 10) || 30)) : 30;
      return await ContactsService.getUpcomingBirthdays(tenantId, withinDays);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Import contacts — real multipart file upload (CSV or vCard .vcf), not
  // the old client-parsed-JSON-array shape. Any contact manager that can
  // export CSV or .vcf (Outlook, Apple Contacts, phone contact apps, a
  // second Google export path, etc.) works here without its own OAuth
  // integration — see contacts-sync.routes.ts for the real Google OAuth sync.
  fastify.post('/import', async (request, reply) => {
    const user = request.user;
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    const buf = await file.toBuffer();
    const isVcard = /\.vcf$/i.test(file.filename || '') || buf.toString('utf8', 0, 20).includes('BEGIN:VCARD');

    const rows: { first_name: string; last_name: string | null; email: string | null; phone: string | null; company: string | null; job_title: string | null }[] = [];

    if (isVcard) {
      const text = buf.toString('utf8');
      const cards = text.split(/BEGIN:VCARD/i).slice(1);
      for (const card of cards) {
        const line = (prefix: string) => card.split(/\r?\n/).find((l) => l.toUpperCase().startsWith(prefix));
        const getValue = (prefix: string) => { const l = line(prefix); return l ? l.slice(l.indexOf(':') + 1).trim() : null; };

        const fn = getValue('FN:');
        const n = line('N:');
        let firstName = fn || '';
        let lastName: string | null = null;
        if (n) {
          const parts = n.slice(n.indexOf(':') + 1).split(';');
          lastName = parts[0]?.trim() || null;
          firstName = parts[1]?.trim() || fn || '';
        }
        if (!firstName && !lastName) continue;

        rows.push({
          first_name: firstName || lastName || 'Unnamed',
          last_name: lastName,
          email: getValue('EMAIL'),
          phone: getValue('TEL'),
          company: getValue('ORG'),
          job_title: getValue('TITLE:'),
        });
      }
    } else {
      let records: Record<string, unknown>[];
      try {
        records = parse(buf, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[];
      } catch (e: any) {
        return reply.status(400).send({ error: 'Could not parse file: ' + (e.message || 'invalid CSV format') });
      }

      const norm = (row: Record<string, unknown>) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          const key = k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          out[key] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
        }
        return out;
      };
      const pick = (r: Record<string, string>, aliases: string[]) => {
        for (const a of aliases) { if (r[a]) return r[a]; }
        return null;
      };

      for (const raw of records) {
        const r = norm(raw);
        // Google Contacts CSV export uses "First Name"/"Last Name"; Outlook uses similar; a plain "Name" column gets split naively.
        let firstName = pick(r, ['first_name', 'given_name']);
        let lastName = pick(r, ['last_name', 'family_name', 'surname']);
        if (!firstName && !lastName) {
          const full = pick(r, ['name', 'full_name']);
          if (full) { const parts = full.split(' '); firstName = parts[0]; lastName = parts.slice(1).join(' ') || null; }
        }
        if (!firstName) continue;

        rows.push({
          first_name: firstName,
          last_name: lastName,
          email: pick(r, ['email', 'e_mail_address', 'e_mail_1_value']),
          phone: pick(r, ['phone', 'phone_number', 'phone_1_value']),
          company: pick(r, ['company', 'organization', 'organization_1_name']),
          job_title: pick(r, ['job_title', 'title', 'organization_1_title']),
        });
      }
    }

    if (rows.length === 0) {
      return reply.status(400).send({ error: 'No usable contacts found in that file (need at least a name).' });
    }

    const tenantId = user.tenant_id;
    const actor = { id: user.sub, name: user.name };
    let inserted = 0;
    for (const row of rows) {
      await ContactsService.createContact(tenantId, { ...row, source: isVcard ? 'vcard_import' : 'csv_import' }, actor);
      inserted++;
    }
    return { imported: inserted, total: rows.length };
  });
}
