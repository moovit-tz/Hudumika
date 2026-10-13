import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { extractProjectDocument, parseProjectAnalysis, type ExtractedProjectDocument } from '../services/project-document.service.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { dbPlatform, withTenant } from '../db/client.js';
import * as ai from '../routes/ai.routes.js';
import * as credentials from '../lib/platform-settings.js';
import { MinioIntegration } from '../integrations/minio.js';

const sourceText = 'Supply smart water meters for the Kawe housing project.';
const brief = {
  name: 'Kawe water meters', description: sourceText, industry: 'construction', project_type: 'customer_delivery',
  currency: null, baseline_budget: null, contract_value: null, start_date: null, target_date: null,
  location_address: 'Kawe', client_name: null, tender_reference: null, submission_deadline: '20 May 2025', submission_instructions: null,
  scope: [sourceText], deliverables: ['Installed meters'], requirements: [], risks: [], missing_information: ['Budget is not stated'], tags: ['tender'],
  source_ids: ['file-1'], evidence: [{ file_id: 'file-1', locator: 'Page 1', quote: sourceText }],
};
const doc: ExtractedProjectDocument = { id: 'file-1', name: 'tender.pdf', sha256: 'a'.repeat(64), warnings: [], text: `[Page 1]\n${sourceText}` };
async function pdf(text?: string) {
  const document = await PDFDocument.create();
  const page = document.addPage();
  if (text) page.drawText(text, { font: await document.embedFont(StandardFonts.Helvetica), size: 10 });
  return Buffer.from(await document.save());
}
function multipart(buffer: Buffer, filename = 'tender.pdf') {
  const boundary = 'project-document-test';
  return { body: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`), buffer, Buffer.from(`\r\n--${boundary}--\r\n`)]), type: `multipart/form-data; boundary=${boundary}` };
}

describe('Project document extraction and grounding', () => {
  it('reads PDF text with page references', async () => {
    expect((await extractProjectDocument(await pdf(sourceText), 'tender.pdf', 'file-1')).text).toContain(`[Page 1]\n${sourceText}`);
  });
  it('reads spreadsheet cells and leaves blank prices blank', async () => {
    const buffer = Buffer.from(zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Medicine" r:id="rId1" /></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml" /></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="2"><c r="A2" t="inlineStr"><is><t>Paracetamol</t></is></c><c r="B2"><v>100</v></c><c r="C2" /></row></sheetData></worksheet>'),
    }));
    const result = await extractProjectDocument(buffer, 'annex.xlsx', 'file-1');
    expect(result.text).toContain('[Sheet Medicine]');
    expect(result.text).toContain('A2: Paracetamol | B2: 100 | C2:');
  });
  it('reads Word documents without needing an installed office program', async () => {
    const buffer = Buffer.from(zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>'),
      '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" /></Relationships>'),
      'word/document.xml': strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${sourceText}</w:t></w:r></w:p></w:body></w:document>`),
    }));
    expect((await extractProjectDocument(buffer, 'tender.docx', 'file-1')).text).toContain(sourceText);
  });
  it('rejects unsupported files and unreadable scans without inventing text', async () => {
    await expect(extractProjectDocument(Buffer.from('fake'), 'file.exe', 'file-1')).rejects.toThrow('use PDF');
    await expect(extractProjectDocument(await pdf(), 'scan.pdf', 'file-1')).rejects.toThrow('no readable text');
  });
  it('uses configured recognition for scans and reports the review requirement', async () => {
    const result = await extractProjectDocument(await pdf(), 'scan.pdf', 'file-1', async () => `[Page 1]\n${sourceText}`);
    expect(result.text).toContain(sourceText);
    expect(result.warnings[0]).toContain('scanned pages');
  });
  it('reads scanned pages in mixed PDFs and keeps original page numbers', async () => {
    const document = await PDFDocument.create();
    const typed = document.addPage();
    typed.drawText(sourceText, { font: await document.embedFont(StandardFonts.Helvetica), size: 10 });
    document.addPage();
    const bytes = Buffer.from(await document.save());
    const recognition = vi.fn(async (scan: Buffer) => {
      expect((await PDFDocument.load(scan)).getPageCount()).toBe(1);
      return '[Page 1]\nDelivery is required within thirty days of signing the contract.';
    });
    const result = await extractProjectDocument(bytes, 'mixed.pdf', 'file-1', recognition);
    expect(recognition).toHaveBeenCalledTimes(1);
    expect(result.text).toContain(`[Page 1]\n${sourceText}`);
    expect(result.text).toContain('[Page 2]\nDelivery is required');
    expect(result.warnings[0]).toContain('Pages 2');
    await expect(extractProjectDocument(bytes, 'mixed.pdf', 'file-1', async () => 'Incomplete response')).rejects.toThrow('could not be read completely');
  });
  it('preserves tender deadlines separately and adds actual source metadata', () => {
    const result = parseProjectAnalysis(JSON.stringify({ candidates: [brief], warnings: [] }), [doc]);
    expect(result.candidates[0].target_date).toBeNull();
    expect(result.candidates[0].submission_deadline).toBe('20 May 2025');
    expect(result.candidates[0].sources?.[0].sha256).toBe(doc.sha256);
  });
  it('rejects fabricated quotations, unknown documents and invalid dates', () => {
    expect(() => parseProjectAnalysis(JSON.stringify({ candidates: [{ ...brief, evidence: [{ ...brief.evidence[0], quote: 'This quotation is fabricated.' }] }], warnings: [] }), [doc])).toThrow('could not be matched');
    expect(() => parseProjectAnalysis(JSON.stringify({ candidates: [{ ...brief, source_ids: ['another-tenant-file'] }], warnings: [] }), [doc])).toThrow('unknown document');
    expect(() => parseProjectAnalysis(JSON.stringify({ candidates: [{ ...brief, start_date: '2025-06-01', target_date: '2025-05-01' }], warnings: [] }), [doc])).toThrow('dates');
  });
  it('rejects an incorrect page citation and flags documents omitted from the suggestions', () => {
    expect(() => parseProjectAnalysis(JSON.stringify({ candidates: [{ ...brief, evidence: [{ ...brief.evidence[0], locator: 'Page 2' }] }], warnings: [] }), [doc])).toThrow('indicated page');
    const result = parseProjectAnalysis(JSON.stringify({ candidates: [brief], warnings: [] }), [doc, { ...doc, id: 'file-2', name: 'unmatched-annex.pdf' }]);
    expect(result.warnings[0]).toContain('unmatched-annex.pdf was not linked');
  });
});

describe('Project document API and persistence', () => {
  let tenant: TestTenant;
  let other: TestTenant;
  beforeAll(async () => {
    tenant = await createTestTenant(); other = await createTestTenant();
    const settings = JSON.stringify({ 'enabled-apps': { projects: true, ai: true, cloud: true } });
    for (const current of [tenant, other]) await dbPlatform.insertInto('tenant_settings').values({ tenant_id: current.tenantId, settings }).onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings })).execute();
  }, 60000);
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const current of [tenant, other]) if (current) { await withTenant(current.tenantId, trx => trx.deleteFrom('projects').where('tenant_id', '=', current.tenantId).execute()); await current.cleanup(); }
  }, 60000);
  it('analyses the uploaded text using the workspace provider and grounded output', async () => {
    const provider = vi.spyOn(credentials, 'resolveAiCredentials').mockResolvedValue({ apiKey: 'test-only', model: 'test-model', provider: 'openai', billedToPlatform: false });
    const generate = vi.spyOn(ai, 'callAI').mockResolvedValue(JSON.stringify({ candidates: [brief], warnings: [] }));
    const upload = multipart(await pdf(sourceText));
    const response = await (await getApp()).inject({ method: 'POST', url: '/v1/project-os/document-analysis', headers: { ...authHeaders(tenant.token), 'content-type': upload.type }, payload: upload.body });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().candidates[0].name).toBe(brief.name);
    expect(provider.mock.calls[0][0]).toBe(tenant.tenantId);
    expect(generate.mock.calls[0][3][0].content).toContain(sourceText);
    vi.restoreAllMocks();
  });
  it('refuses unauthenticated and external customer uploads', async () => {
    const app = await getApp();
    expect((await app.inject({ method: 'POST', url: '/v1/project-os/document-analysis' })).statusCode).toBe(401);
    const customer = await tenant.addUser('CUSTOMER');
    expect((await app.inject({ method: 'POST', url: '/v1/project-os/document-analysis', headers: authHeaders(customer.token) })).statusCode).toBe(403);
  });
  it('saves the reviewed brief on the project and prevents cross-tenant access', async () => {
    const app = await getApp(); const id = randomUUID();
    const response = await app.inject({ method: 'POST', url: '/v1/tasks/projects', headers: authHeaders(tenant.token), payload: { id, name: brief.name, description: brief.description, document_brief: brief } });
    expect(response.statusCode, response.body).toBe(201);
    const loaded = await app.inject({ method: 'GET', url: `/v1/tasks/projects/${id}`, headers: authHeaders(tenant.token) });
    expect(loaded.json().data.custom_fields.document_brief.submission_deadline).toBe('20 May 2025');
    expect((await app.inject({ method: 'GET', url: `/v1/tasks/projects/${id}`, headers: authHeaders(other.token) })).statusCode).toBe(404);
  });
  it('stores project originals in Business Records and serves the original bytes to a teammate', async () => {
    const app = await getApp();
    const id = randomUUID();
    const created = await app.inject({ method: 'POST', url: '/v1/tasks/projects', headers: authHeaders(tenant.token), payload: { id, name: brief.name, document_brief: brief } });
    expect(created.statusCode, created.body).toBe(201);
    const drives = await app.inject({ method: 'GET', url: '/v1/drives', headers: authHeaders(tenant.token) });
    expect(drives.statusCode, drives.body).toBe(200);
    const business = drives.json().find((drive: { type: string }) => drive.type === 'business');
    expect(business).toBeTruthy();
    const bytes = await pdf(sourceText);
    const upload = multipart(bytes);
    const response = await app.inject({ method: 'POST', url: `/v1/files/upload?drive_id=${business.id}&entity_type=project&entity_id=${id}`, headers: { ...authHeaders(tenant.token), 'content-type': upload.type }, payload: upload.body });
    expect(response.statusCode, response.body).toBe(200);
    const file = response.json();
    try {
      const event = await withTenant(tenant.tenantId, trx => trx.selectFrom('domain_events').select('id').where('tenant_id', '=', tenant.tenantId).where('entity_id', '=', file.id).where('event_type', '=', 'file.uploaded').executeTakeFirst());
      expect(event).toBeTruthy();
      const teammate = await tenant.addUser('SENIOR');
      const listed = await app.inject({ method: 'GET', url: `/v1/files?entity_type=project&entity_id=${id}`, headers: authHeaders(teammate.token) });
      expect(listed.statusCode, listed.body).toBe(200);
      expect(listed.json().some((item: { id: string }) => item.id === file.id)).toBe(true);
      const downloaded = await app.inject({ method: 'GET', url: `/v1/files/${file.id}/download`, headers: authHeaders(teammate.token) });
      expect(downloaded.statusCode, downloaded.body).toBe(200);
      expect(downloaded.rawPayload.equals(bytes)).toBe(true);
      expect((await app.inject({ method: 'GET', url: `/v1/files/${file.id}/download`, headers: authHeaders(other.token) })).statusCode).toBe(404);
    } finally {
      if (file.storage_key) await MinioIntegration.deleteDocument(tenant.tenantId, file.storage_key);
    }
  });
});
