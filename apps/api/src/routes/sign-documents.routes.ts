import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { COUNTRIES, expandSignDocument } from '@hudumika/types';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { documentDefinitionSchema, documentStarters, renderDocument, buildDocumentPdf } from '../services/sign-document.service.js';

const idSchema = z.string().uuid();
const answersSchema = z.record(z.string().max(10000)).refine(value => Object.keys(value).length <= 100, 'Too many answers');
const documentSchema = z.object({
  title: z.string().trim().min(1).max(250),
  jurisdiction: z.string().trim().min(1).max(120),
  answers: answersSchema,
  language: z.enum(['en','sw','zh']).optional(),
  body: z.string().trim().min(1).max(100000).optional(),
});

export async function signDocumentsRoutes(server: FastifyInstance) {
  server.addHook('preHandler', server.authenticate);
  server.addHook('preHandler', requireEntitlement('sign'));

  server.get('/document-library', async req => withTenant(req.user.tenant_id, async trx => {
    const company = await trx.selectFrom('sign_templates').selectAll().where('tenant_id', '=', req.user.tenant_id).where('document_definition', 'is not', null).orderBy('updated_at', 'desc').execute();
    return { starters: documentStarters, company };
  }));

  server.post('/document-library', async (req, reply) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(180), description: z.string().max(1000), document_definition: documentDefinitionSchema }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    return withTenant(req.user.tenant_id, async trx => {
      const row = await trx.insertInto('sign_templates').values({ tenant_id: req.user.tenant_id, created_by: req.user.sub, name: parsed.data.name, description: parsed.data.description, document_definition: JSON.stringify(parsed.data.document_definition), fields: '[]', recipients: '[]', file_id: null, file_name: null }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  server.post('/generated-documents', async (req,reply) => {
    const parsed=z.object({title:z.string().trim().min(1).max(250),definition:documentDefinitionSchema}).safeParse(req.body);
    if(!parsed.success)return reply.status(400).send({error:parsed.error.issues[0].message});
    return withTenant(req.user.tenant_id, async trx => {
      const row=await trx.insertInto('sign_generated_documents').values({tenant_id:req.user.tenant_id,created_by:req.user.sub,template_id:null,template_name:parsed.data.title,title:parsed.data.title,definition:JSON.stringify(parsed.data.definition),jurisdiction:'',answers:'{}',body:expandSignDocument(parsed.data.definition,{},'',parsed.data.definition.language || 'en',true)}).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  server.get('/generated-documents', async req => withTenant(req.user.tenant_id, trx => trx.selectFrom('sign_generated_documents')
    .select(['id', 'title', 'jurisdiction', 'template_name', 'template_id', 'updated_at'])
    .select([sql<string[]>`coalesce(definition->'apps', '[]'::jsonb)`.as('apps'), sql<string>`definition->>'category'`.as('category'), sql<string>`definition->>'document_type'`.as('document_type')]).where('tenant_id', '=', req.user.tenant_id).where('created_by', '=', req.user.sub).orderBy('updated_at', 'desc').execute()));

  server.post<{ Params: { id: string } }>('/document-library/:id/generate', async (req, reply) => {
    const parsed = documentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    const starter = documentStarters.find(item => item.id === req.params.id);
    if (!starter && !idSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Template not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const template = starter ?? await trx.selectFrom('sign_templates').selectAll().where('id', '=', req.params.id).where('tenant_id', '=', req.user.tenant_id).executeTakeFirst();
      if (!template) return reply.status(404).send({ error: 'Template not found' });
      const definition = documentDefinitionSchema.safeParse(template.document_definition);
      if (!definition.success) return reply.status(400).send({ error: 'This template has no document definition' });
      let body: string;
      try { body = renderDocument(definition.data, parsed.data.answers, parsed.data.jurisdiction, parsed.data.language); }
      catch (error) { return reply.status(400).send({ error: (error as Error).message }); }
      const row = await trx.insertInto('sign_generated_documents').values({
        tenant_id: req.user.tenant_id, created_by: req.user.sub,
        template_id: starter ? null : req.params.id, template_name: template.name,
        definition: JSON.stringify({...definition.data,...(parsed.data.language ? {language:parsed.data.language} : {})}), title: parsed.data.title, jurisdiction: parsed.data.jurisdiction,
        answers: JSON.stringify(parsed.data.answers), body,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  server.get<{ Params: { id: string } }>('/generated-documents/:id', async (req, reply) => {
    if (!idSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Document not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const row = await trx.selectFrom('sign_generated_documents').selectAll().where('id', '=', req.params.id).where('tenant_id', '=', req.user.tenant_id).where('created_by', '=', req.user.sub).executeTakeFirst();
      return row ?? reply.status(404).send({ error: 'Document not found' });
    });
  });

  server.patch<{ Params: { id: string } }>('/generated-documents/:id', async (req, reply) => {
    const parsed = documentSchema.extend({ body: z.string().trim().min(1).max(100000) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    if (!idSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Document not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const existing = await trx.selectFrom('sign_generated_documents').selectAll().where('id', '=', req.params.id).where('tenant_id', '=', req.user.tenant_id).where('created_by', '=', req.user.sub).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Document not found' });
      const definition = documentDefinitionSchema.parse(existing.definition);
      let rendered: string;
      try { rendered = renderDocument(definition, parsed.data.answers, parsed.data.jurisdiction, parsed.data.language); }
      catch (error) { return reply.status(400).send({ error: (error as Error).message }); }
      return trx.updateTable('sign_generated_documents').set({ title:parsed.data.title,jurisdiction:parsed.data.jurisdiction,body:definition.jurisdiction_clauses ? rendered : parsed.data.body, definition:JSON.stringify({...definition,...(parsed.data.language ? {language:parsed.data.language} : {})}), answers: JSON.stringify(parsed.data.answers), updated_at: new Date() }).where('id', '=', req.params.id).where('tenant_id', '=', req.user.tenant_id).where('created_by', '=', req.user.sub).returningAll().executeTakeFirstOrThrow();
    });
  });

  server.get<{ Params: { id: string }; Querystring: { format?: string } }>('/generated-documents/:id/pdf', async (req, reply) => {
    if (!idSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Document not found' });
    const row = await withTenant(req.user.tenant_id, trx => trx.selectFrom('sign_generated_documents').selectAll().where('id', '=', req.params.id).where('tenant_id', '=', req.user.tenant_id).where('created_by', '=', req.user.sub).executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Document not found' });
    const pdf = await buildDocumentPdf(row.title, row.body);
    if (req.query.format === 'source') return { title: row.title, document_data: `data:application/pdf;base64,${pdf.toString('base64')}`, file_name: `${row.title}.pdf`, jurisdiction: row.jurisdiction, jurisdiction_code: COUNTRIES.find(country => country.name === row.jurisdiction || country.code === row.jurisdiction)?.code ?? null };
    return reply.type('application/pdf').header('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(row.title)}.pdf`).send(pdf);
  });
}
