import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as NotesService from '../services/notes.service.js';
import { NoteForbiddenError, NoteConflictError } from '../services/notes.service.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const checklistItemSchema = z.object({ id: z.string(), text: z.string(), completed: z.boolean() });
const shareEntrySchema = z.object({ userId: z.string().uuid(), permission: z.enum(['view', 'edit']) });

const noteInputSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(20000).optional(),
  color: z.string().max(20).optional(),
  checklist: z.array(checklistItemSchema).optional(),
  images: z.array(z.string()).max(20).optional(),
  drawing: z.string().nullable().optional(),
  reminderAt: z.string().nullable().optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  subjectType: z.string().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  // Real cross-app meeting linking (369_meeting_link_everywhere.sql) — same
  // shape MeetingLinkPanel.tsx writes for calendar events and tasks too.
  meetingUrl: z.string().max(2000).nullable().optional(),
  meetingSettings: z.record(z.any()).optional(),
  blissMeetingId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['team', 'private', 'shared']).optional(),
  shares: z.array(shareEntrySchema).optional(),
  legalHold: z.boolean().optional(),
  expectedUpdatedAt: z.string().optional(),
});

/** Every failure path a note mutator can throw, mapped to the right status
 *  once instead of repeated in every handler. */
function sendNoteError(reply: any, err: any) {
  if (err instanceof NoteForbiddenError) {
    return reply.status(403).send({ error: err.message });
  }
  if (err instanceof NoteConflictError) {
    return reply.status(409).send({ error: err.message, current: err.current, code: 'NOTE_CONFLICT' });
  }
  return reply.status(400).send({ error: err.message });
}

export async function notesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // 'notes' is a free/base app on every plan (265_notes_app.sql), so this
  // never blocks anyone entitled today — what it adds is the standard
  // per-tenant enable/disable switch and per-app quota metering every other
  // app already gets (middleware/entitlement.ts), which this route never
  // had until now.
  fastify.addHook('preHandler', requireEntitlement('notes'));

  fastify.get('/', async (request: any, reply) => {
    const { subject_type, subject_id, search, limit, offset } = request.query as {
      subject_type?: string; subject_id?: string; search?: string; limit?: string; offset?: string;
    };
    try {
      return await NotesService.listNotes(request.user.tenant_id, request.user.sub, {
        subjectType: subject_type,
        subjectId: subject_id,
        search,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const input = noteInputSchema.parse(request.body);
    try {
      return reply.status(201).send(await NotesService.createNote(request.user.tenant_id, request.user.sub, input));
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const input = noteInputSchema.parse(request.body);
    try {
      return await NotesService.updateNote(request.user.tenant_id, request.user.sub, request.params.id, input);
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  // Pin/archive are a personal view preference (note_user_state), not a
  // property of the note — deliberately their own endpoints rather than
  // fields on the generic PATCH above, so they can never collide with the
  // optimistic-lock / revision-snapshot logic that only makes sense for
  // actual content changes.
  fastify.patch('/:id/pin', async (request: any, reply) => {
    const { pinned } = z.object({ pinned: z.boolean() }).parse(request.body);
    try {
      return await NotesService.setPinned(request.user.tenant_id, request.user.sub, request.params.id, pinned);
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  fastify.patch('/:id/archive', async (request: any, reply) => {
    const { archived } = z.object({ archived: z.boolean() }).parse(request.body);
    try {
      return await NotesService.setArchived(request.user.tenant_id, request.user.sub, request.params.id, archived);
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  fastify.patch('/:id/trash', async (request: any, reply) => {
    try {
      return await NotesService.trashNote(request.user.tenant_id, request.user.sub, request.params.id);
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  fastify.patch('/:id/restore', async (request: any, reply) => {
    try {
      return await NotesService.restoreNote(request.user.tenant_id, request.user.sub, request.params.id);
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    try {
      await NotesService.deleteNotePermanently(request.user.tenant_id, request.user.sub, request.params.id);
      reply.status(204);
      return null;
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  fastify.post('/empty-trash', async (request: any, reply) => {
    try {
      await NotesService.emptyTrash(request.user.tenant_id, request.user.sub);
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Version history ────────────────────────────────────────────────────
  fastify.get('/:id/revisions', async (request: any, reply) => {
    try {
      return await NotesService.listRevisions(request.user.tenant_id, request.user.sub, request.params.id);
    } catch (err: any) {
      return sendNoteError(reply, err);
    }
  });

  fastify.post('/:id/revisions/:revisionId/restore', async (request: any, reply) => {
    const { expectedUpdatedAt } = z.object({ expectedUpdatedAt: z.string().optional() }).parse(request.body ?? {});
    try {
      return await NotesService.restoreRevision(request.user.tenant_id, request.user.sub, request.params.id, request.params.revisionId, expectedUpdatedAt);
    } catch (err: any) {
      return sendNoteError(reply, err);
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
