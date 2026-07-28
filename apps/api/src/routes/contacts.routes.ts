import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { ContactsService } from '../services/contacts.service.js';
import { parse } from 'csv-parse/sync';

export async function contactsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('contacts'));

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
    try {
      const tenantId = request.user.tenant_id;
      const { primary_id, duplicate_ids } = request.body as { primary_id: string; duplicate_ids: string[] };
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

  // Create a label
  fastify.post('/labels', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { name } = request.body as { name: string };
      return await ContactsService.createLabel(tenantId, name);
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
    try {
      const tenantId = request.user.tenant_id;
      const { ids, status } = request.body as { ids: string[]; status: 'TRASHED' | 'ACTIVE' | 'DELETE' };
      return await ContactsService.bulkDelete(tenantId, ids, status);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Bulk Label mapping
  fastify.post('/bulk-label', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { contact_ids, label_id, action } = request.body as { contact_ids: string[]; label_id: string; action: 'ADD' | 'REMOVE' };
      return await ContactsService.bulkLabel(tenantId, contact_ids, label_id, action);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
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
