import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { convertToPdf, officeConfigured } from '../integrations/office-convert.js';
import { sanitizeDocumentHtml, documentHtmlText, buildRichDocumentPdf } from '../services/sign-rich-document.service.js';
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

  server.put<{ Params: { id: string } }>('/generated-documents/:id/content', async (req, reply) => {
    const parsed = z.object({ title: z.string().trim().min(1).max(250), html: z.string().min(1).max(5000000), jurisdiction: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(80).optional(), document_type: z.enum(['agreement','letter','policy','record','form']).optional(), language: z.enum(['en','sw','zh']).optional() }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Enter a title, jurisdiction and document content within the size limit.' });
    if (!idSchema.safeParse(req.params.id).success) return reply.status(404).send({ error: 'Document not found' });
    return withTenant(req.user.tenant_id, async trx => {
      const existing = await trx.selectFrom('sign_generated_documents').selectAll().where('id', '=', req.params.id).where('tenant_id', '=', req.user.tenant_id).where('created_by', '=', req.user.sub).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Document not found' });
      const definition = documentDefinitionSchema.parse(existing.definition);
      if (definition.jurisdiction_clauses) return reply.status(409).send({ error: 'Complete this controlled template through its decision questions first.' });
      const html = sanitizeDocumentHtml(parsed.data.html);
      const body = documentHtmlText(html);
      if (!body.trim()) return reply.status(400).send({ error: 'Add document text before saving.' });
      return trx.updateTable('sign_generated_documents').set({ title: parsed.data.title, jurisdiction: parsed.data.jurisdiction, body, definition: JSON.stringify({ ...definition, body, editor_html: html, category: parsed.data.category ?? definition.category, document_type: parsed.data.document_type ?? definition.document_type, language: parsed.data.language ?? definition.language }), updated_at: new Date() }).where('id', '=', req.params.id).where('tenant_id', '=', req.user.tenant_id).where('created_by', '=', req.user.sub).returningAll().executeTakeFirstOrThrow();
    });
  });

  server.post('/import-document', { bodyLimit: 72 * 1024 * 1024 }, async (req, reply) => {
    const parsed = z.object({ extension: z.enum(['doc','docx']), data: z.string().max(70 * 1024 * 1024) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Choose a Word document under 50 MB.' });
    if (!officeConfigured()) return reply.status(503).send({ error: 'Word conversion is not configured. Upload a PDF instead, or ask your administrator to configure LibreOffice.' });
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]+={0,2})$/.exec(parsed.data.data);
    if (!match) return reply.status(400).send({ error: 'Invalid document data' });
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length > 50 * 1024 * 1024 || (parsed.data.extension === 'docx' ? bytes.subarray(0,2).toString() !== 'PK' : bytes.subarray(0,4).toString('hex') !== 'd0cf11e0')) return reply.status(400).send({ error: 'Invalid Word document' });
    try { const pdf = await convertToPdf(bytes, parsed.data.extension); return { document_data: `data:application/pdf;base64,${pdf.toString('base64')}` }; }
    catch { return reply.status(422).send({ error: 'Could not convert this Word document. Export it to PDF and upload again.' }); }
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
    const definition = documentDefinitionSchema.parse(row.definition);
    const pdf = definition.editor_html ? await buildRichDocumentPdf(row.title, definition.editor_html) : await buildDocumentPdf(row.title, row.body);
    if (req.query.format === 'source') return { title: row.title, document_data: `data:application/pdf;base64,${pdf.toString('base64')}`, file_name: `${row.title}.pdf`, jurisdiction: row.jurisdiction, jurisdiction_code: COUNTRIES.find(country => country.name === row.jurisdiction || country.code === row.jurisdiction)?.code ?? null };
    return reply.type('application/pdf').header('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(row.title)}.pdf`).send(pdf);
  });
}
