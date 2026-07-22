import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { ContactsService } from '../services/contacts.service.js';

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

  // Import contacts
  fastify.post('/import', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { contacts } = request.body as { contacts: any[] };
      const actor = { id: request.user.sub, name: request.user.name };
      const results = [];
      for (const contactData of contacts) {
        const res = await ContactsService.createContact(tenantId, contactData, actor);
        results.push(res);
      }
      return { success: true, count: results.length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
