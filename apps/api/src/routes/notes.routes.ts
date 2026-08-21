import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as NotesService from '../services/notes.service.js';

const checklistItemSchema = z.object({ id: z.string(), text: z.string(), completed: z.boolean() });

const noteInputSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(20000).optional(),
  color: z.string().max(20).optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  checklist: z.array(checklistItemSchema).optional(),
  images: z.array(z.string()).max(20).optional(),
  drawing: z.string().nullable().optional(),
  reminderAt: z.string().nullable().optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  subjectType: z.string().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
});

export async function notesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request: any, reply) => {
    const { subject_type, subject_id } = request.query as { subject_type?: string; subject_id?: string };
    try {
      return await NotesService.listNotes(request.user.tenant_id, { subjectType: subject_type, subjectId: subject_id });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const input = noteInputSchema.parse(request.body);
    try {
      return reply.status(201).send(await NotesService.createNote(request.user.tenant_id, request.user.sub, input));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const input = noteInputSchema.parse(request.body);
    try {
      return await NotesService.updateNote(request.user.tenant_id, request.params.id, input);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id/trash', async (request: any, reply) => {
    try {
      return await NotesService.trashNote(request.user.tenant_id, request.params.id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id/restore', async (request: any, reply) => {
    try {
      return await NotesService.restoreNote(request.user.tenant_id, request.params.id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    try {
      await NotesService.deleteNotePermanently(request.user.tenant_id, request.params.id);
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/empty-trash', async (request: any, reply) => {
    try {
      await NotesService.emptyTrash(request.user.tenant_id);
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Labels ──────────────────────────────────────────────────────────────
  fastify.get('/labels', async (request: any, reply) => {
    try {
      return await NotesService.listLabels(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/labels', async (request: any, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
    try {
      return reply.status(201).send(await NotesService.createLabel(request.user.tenant_id, request.user.sub, name));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/labels/:id', async (request: any, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
    try {
      return await NotesService.updateLabel(request.user.tenant_id, request.params.id, name);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/labels/:id', async (request: any, reply) => {
    try {
      await NotesService.deleteLabel(request.user.tenant_id, request.params.id);
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
