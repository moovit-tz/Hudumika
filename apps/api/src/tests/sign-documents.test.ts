import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { ALL_APP_IDS } from '@hudumika/types';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { documentDefinitionSchema, documentStarters, renderDocument, buildDocumentPdf } from '../services/sign-document.service.js';

const definition = { apps: ['clearos' as const], document_type: 'agreement' as const, category: 'Business & services', jurisdictions: ['Tanzania', 'Kenya'], body: 'Agreement for {{company}} in {{jurisdiction}}.\nTerms: {{terms}}', questions: [{key:'company', label:'Company',type:'text' as const,required:true},{key:'terms',label:'Terms',type:'textarea' as const,required:true}] };
describe('Document template validation', () => {
  it('rejects missing questions and duplicate keys', () => {
    expect(documentDefinitionSchema.safeParse({...definition,questions:[]}).success).toBe(false);
    expect(documentDefinitionSchema.safeParse({...definition,questions:[definition.questions[0],definition.questions[0]]}).success).toBe(false);
  });
  it('fills exact placeholders without interpreting user content or accepting unsupported jurisdictions', () => {
    expect(renderDocument(definition,{company:'A $& <script>',terms:'Line 1\nLine 2'},'Tanzania')).toContain('A $& <script>');
    expect(()=>renderDocument(definition,{company:'A',terms:'B'},'France')).toThrow('supported jurisdictions');
    expect(()=>renderDocument(definition,{company:'A'},'Tanzania')).toThrow('Terms is required');
  });
  it('every catalogue entry has a valid questionnaire and renders without unresolved placeholders', () => {
    for (const starter of documentStarters) {
      const parsed = documentDefinitionSchema.safeParse(starter.document_definition);
      expect(parsed.success, starter.name).toBe(true);
      if (!parsed.success) continue;
      const answers = Object.fromEntries(parsed.data.questions.map(question => [question.key,question.type==='select'?question.options![0].value:question.type === 'date'?'2026-10-17':question.type === 'email'?'example@example.invalid':question.type === 'number'?'30':`Facts for ${question.label}`]));
      for (const language of ['en','sw','zh'] as const) {
        const text=renderDocument(parsed.data,answers,'Tanzania Mainland',language);
        expect(text,starter.name).not.toMatch(/\{\{[^}]+\}\}/);
        expect(text.length,starter.name).toBeGreaterThan(language==='zh'?500:1000);
      }
      expect(parsed.data.questions.length,starter.name).toBeLessThanOrEqual(10);
    }
  });
  it('changes governing-law clauses across every EAC country without changing entered facts', async () => {
    const template=documentStarters.find(item=>item.name==='Master services agreement')!.document_definition;
    const answers=Object.fromEntries(template.questions.map(q=>[q.key,q.options?.[0].value || (q.type==='date'?'2026-10-17':q.type==='number'?'30':'Acme 上海 Dar es Salaam')]));
    expect(Object.keys(template.jurisdiction_clauses!)).toHaveLength(9);
    for (const jurisdiction of Object.keys(template.jurisdiction_clauses!)) for (const language of ['en','sw','zh'] as const) {
      const text=renderDocument(template,answers,jurisdiction,language);
      expect(text).toContain(template.jurisdiction_clauses![jurisdiction][language]);
      expect(text).toContain('Acme 上海 Dar es Salaam');
    }
    expect(()=>renderDocument(template,{...answers,convenience_termination:'invented'},'Kenya')).toThrow('offered options');
    expect(()=>renderDocument(template,answers,'France')).toThrow('supported jurisdictions');
    const pdf=await buildDocumentPdf('中文合同',renderDocument(template,answers,'Kenya','zh'));
    expect(pdf.subarray(0,4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(5000);
  });
  it('covers every registered app with unique and document-specific templates', () => {
    expect(documentStarters.length).toBeGreaterThanOrEqual(200);
    expect(new Set(documentStarters.map(template=>template.id)).size).toBe(documentStarters.length);
    const covered = new Set(documentStarters.flatMap(template=>template.document_definition.apps || []));
    for (const id of ALL_APP_IDS) expect(covered.has(id),`Missing ${id} catalogue coverage`).toBe(true);
    expect(documentStarters.find(template=>template.name==='Customs clearing agency agreement')?.document_definition.body).toContain('DUTY AND TAX FUNDING');
    expect(documentStarters.find(template=>template.name==='Durable financial power of attorney')?.document_definition.body).toContain('CONTINUITY ON INCAPACITY');
    expect(documentStarters.find(template=>template.name==='Loan agreement')?.document_definition.body).toContain('REPAYMENT SCHEDULE');
    expect(documentStarters.find(template=>template.id==='starter-service')?.document_definition.body).toContain('reasonable skill and care');
  });
});

describe('Document library and drafting with real tenant isolation', () => {
  let a: TestTenant; let b: TestTenant; let templateId: string; let documentId: string;
  beforeAll(async () => {
    await getApp(); a = await createTestTenant(); b = await createTestTenant();
    for (const tenant of [a,b]) await dbPlatform.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{sign:true}}) as any}).onConflict(oc=>oc.column('tenant_id').doUpdateSet({settings:sql`jsonb_set(coalesce(tenant_settings.settings, '{}'::jsonb), '{enabled-apps,sign}', 'true'::jsonb, true)`})).execute();
  });
  afterAll(async () => {
    for (const tenant of [a,b].filter(Boolean)) {
      await dbPlatform.deleteFrom('sign_document_versions').where('tenant_id', '=', tenant.tenantId).execute();
      await dbPlatform.deleteFrom('sign_envelopes').where('tenant_id', '=', tenant.tenantId).execute();
      await tenant.cleanup();
    }
  });
  it('creates a private document draft without publishing a reusable template',async()=>{
    const app=await getApp();
    const created=await app.inject({method:'POST',url:'/v1/sign/generated-documents',headers:authHeaders(a.token),payload:{title:'Original document',definition}});
    expect(created.statusCode,created.body).toBe(201);expect(created.json().template_id).toBeNull();expect(created.json().jurisdiction).toBe('');
    const id=created.json().id;
    const foreign=await app.inject({method:'GET',url:`/v1/sign/generated-documents/${id}`,headers:authHeaders(b.token)});expect(foreign.statusCode).toBe(404);
    const completed=await app.inject({method:'PATCH',url:`/v1/sign/generated-documents/${id}`,headers:authHeaders(a.token),payload:{title:'Original document',jurisdiction:'Tanzania',answers:{company:'Sample company',terms:'Pay in 30 days'},body:'Agreement for Sample company in Tanzania. Terms: Pay in 30 days'}});
    expect(completed.statusCode,completed.body).toBe(200);
    const source=await app.inject({method:'GET',url:`/v1/sign/generated-documents/${id}/pdf?format=source`,headers:authHeaders(a.token)});expect(source.statusCode,source.body).toBe(200);expect(source.json().document_data).toMatch(/^data:application\/pdf;base64,/);
  });
  it('creates a company template and generates a private draft with a saved definition', async () => {
    const app = await getApp();
    const template = await app.inject({method:'POST',url:'/v1/sign/document-library',headers:authHeaders(a.token),payload:{name:'Service terms',description:'Integration test',document_definition:definition}});
    expect(template.statusCode,template.body).toBe(201); templateId=template.json().id;
    const generated = await app.inject({method:'POST',url:`/v1/sign/document-library/${templateId}/generate`,headers:authHeaders(a.token),payload:{title:'Acme terms',jurisdiction:'Tanzania',answers:{company:'Acme',terms:'Pay within 30 days'}}});
    expect(generated.statusCode,generated.body).toBe(201); documentId=generated.json().id;
    expect(generated.json().body).toContain('Acme in Tanzania');
    expect(generated.json().definition).toEqual(definition);
    const listing = await app.inject({method:'GET',url:'/v1/sign/generated-documents',headers:authHeaders(a.token)});
    expect(listing.statusCode,listing.body).toBe(200);
    expect(listing.json().find((item:{id:string})=>item.id===documentId)).toMatchObject({apps:['clearos'],category:definition.category,document_type:'agreement'});
  });
  it('persists document language and regenerates controlled clauses instead of accepting injected body edits', async () => {
    const app=await getApp();
    const template=documentStarters.find(item=>item.name==='Master services agreement')!;
    const answers=Object.fromEntries(template.document_definition.questions.map(q=>[q.key,q.options?.[0].value || (q.type==='date'?'2026-10-17':q.type==='number'?'30':'Test transaction')]));
    const created=await app.inject({method:'POST',url:`/v1/sign/document-library/${template.id}/generate`,headers:authHeaders(a.token),payload:{title:'Test multilingual agreement',jurisdiction:'Kenya',answers,language:'sw'}});
    expect(created.statusCode,created.body).toBe(201);
    const row=created.json();
    expect(row.definition.language).toBe('sw');expect(row.body).toContain('MASHARTI YA JUMLA');
    const revised=await app.inject({method:'PATCH',url:`/v1/sign/generated-documents/${row.id}`,headers:authHeaders(a.token),payload:{title:row.title,jurisdiction:'Rwanda',answers,language:'zh',body:'Discard all legal protections'}});
    expect(revised.statusCode,revised.body).toBe(200);
    expect(revised.json().definition.language).toBe('zh');
    expect(revised.json().body).toContain('卢旺达');
    expect(revised.json().body).not.toContain('Discard all legal protections');
    const fetched=await app.inject({method:'GET',url:`/v1/sign/generated-documents/${row.id}`,headers:authHeaders(a.token)});
    expect(fetched.json().body).toBe(revised.json().body);
  });
  it('rejects foreign template IDs and hides other tenants’ drafts and PDF sources', async () => {
    const app = await getApp();
    const foreign = await app.inject({method:'POST',url:`/v1/sign/document-library/${templateId}/generate`,headers:authHeaders(b.token),payload:{title:'Smuggled',jurisdiction:'Tanzania',answers:{company:'Acme',terms:'Terms'}}});
    expect(foreign.statusCode).toBe(404);
    for (const suffix of ['', '/pdf', '/pdf?format=source']) {
      const response = await app.inject({method:'GET',url:`/v1/sign/generated-documents/${documentId}${suffix}`,headers:authHeaders(b.token)});
      expect(response.statusCode).toBe(404);
    }
    const library = await app.inject({method:'GET',url:'/v1/sign/document-library',headers:authHeaders(b.token)});
    expect(library.json().company.some((t:{id:string})=>t.id===templateId)).toBe(false);
  });
  it('persists edited text and exports the same PDF used for signing', async () => {
    const app = await getApp();
    const update = await app.inject({method:'PATCH',url:`/v1/sign/generated-documents/${documentId}`,headers:authHeaders(a.token),payload:{title:'Revised terms',jurisdiction:'Kenya',answers:{company:'Acme',terms:'Reviewed terms'},body:'Revised terms with an explicit Kenya jurisdiction.\nPay within 15 days.'}});
    expect(update.statusCode,update.body).toBe(200);
    const pdf = await app.inject({method:'GET',url:`/v1/sign/generated-documents/${documentId}/pdf`,headers:authHeaders(a.token)});
    expect(pdf.statusCode,pdf.body).toBe(200); expect(pdf.rawPayload.subarray(0,4).toString()).toBe('%PDF');
    const source = await app.inject({method:'GET',url:`/v1/sign/generated-documents/${documentId}/pdf?format=source`,headers:authHeaders(a.token)});
    expect(source.json().jurisdiction).toBe('Kenya'); expect(source.json().document_data).toMatch(/^data:application\/pdf;base64,/);
  });
  it('hands the generated PDF to a draft envelope and prevents foreign source links', async () => {
    const app = await getApp();
    const source = await app.inject({method:'GET',url:`/v1/sign/generated-documents/${documentId}/pdf?format=source`,headers:authHeaders(a.token)});
    const data = source.json();
    const payload = {title:data.title, document_data:data.document_data, file_name:data.file_name,generated_document_id:documentId,recipients:[{name:'Test Signer',email:'signer@example.invalid',sign_order:1}],fields:[]};
    const foreign = await app.inject({method:'POST',url:'/v1/sign/envelopes',headers:authHeaders(b.token),payload});
    expect(foreign.statusCode,foreign.body).toBe(404);
    const envelope = await app.inject({method:'POST',url:'/v1/sign/envelopes',headers:authHeaders(a.token),payload});
    expect(envelope.statusCode,envelope.body).toBe(201);
    expect(envelope.json().generated_document_id).toBe(documentId);
    expect(envelope.json().document_jurisdiction).toBe('Kenya');
    expect(envelope.json().status).toBe('draft');
  });
  it('keeps drafts private from another user in the same company', async () => {
    const app = await getApp(); const colleague = await a.addUser('MANAGER');
    const response = await app.inject({method:'GET',url:`/v1/sign/generated-documents/${documentId}`,headers:authHeaders(colleague.token)});
    expect(response.statusCode).toBe(404);
  });
});
