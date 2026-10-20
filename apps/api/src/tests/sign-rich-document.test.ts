import { describe, it, expect } from 'vitest';
import { sanitizeDocumentHtml, documentHtmlText, buildRichDocumentPdf } from '../services/sign-rich-document.service.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('Rich document content', () => {
  it('removes active content, event handlers, unsafe links and remote images', () => {
    const html=sanitizeDocumentHtml('<p onclick="evil()">Hello <b>world</b></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="https://localhost/private"><iframe src="/admin"></iframe><pre><code>const x = 1;</code></pre>');
    expect(html).not.toMatch(/onclick|script|iframe|javascript|https:\/\/localhost/);
    expect(html).toContain('<b>world</b>');expect(html).toContain('<pre><code>');
    expect(documentHtmlText(html)).toContain('Hello world');
  });
  it('renders embedded images while refusing malformed image data',async()=>{
    const image=await sharp({create:{width:8,height:8,channels:3,background:'#006655'}}).png().toBuffer();
    const pdf=await buildRichDocumentPdf('Image draft',`<p>Logo</p><img src="data:image/png;base64,${image.toString('base64')}"><p>Terms follow.</p>`);
    expect(pdf.toString('latin1')).toContain('/Subtype /Image');
    await expect(buildRichDocumentPdf('Bad image','<img src="data:image/png;base64,YmFk">')).rejects.toThrow();
  });
  it('bounds embedded-image work before decoding repeated images', async () => {
    const images = '<img src="data:image/png;base64,YmFk">'.repeat(21);
    await expect(buildRichDocumentPdf('Too many images', `<p>Text</p>${images}`)).rejects.toThrow('at most 20');
  });
  it('renders multi-page formatted text, links and code to a PDF',async()=>{
    const pdf=await buildRichDocumentPdf('Draft','<h2>Terms</h2>'+ '<p>A <b>binding</b> clause with a <a href="https://example.com">link</a>.</p>'.repeat(80)+'<pre>const id = 1;</pre>');
    expect(pdf.subarray(0,4).toString()).toBe('%PDF');expect(pdf.length).toBeGreaterThan(3000);
  });
  it('preserves table cells and heading text in the exported PDF', async () => {
    const bytes = await buildRichDocumentPdf('Table draft', '<h4>PAYMENT SCHEDULE</h4><table><tr><th>Milestone</th><th>Amount</th></tr><tr><td>Deposit</td><td>1,000</td></tr><tr><td>Completion</td><td>2,000</td></tr></table><ol><li>First clause</li><li>Second clause</li></ol><p><i>Review</i> <s>old wording</s> before signing.</p>');
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    try {
      const page = await pdf.getPage(1);
      const text = (await page.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ');
      for (const value of ['PAYMENT SCHEDULE', 'Milestone', 'Amount', 'Deposit', '1,000', 'Completion', '2,000', '1. First clause', '2. Second clause', 'before signing.']) expect(text).toContain(value);
    } finally { await pdf.destroy(); }
    expect(documentHtmlText('<h4>Heading</h4><table><tr><td>One</td><td>Two</td></tr></table>')).toBe('Heading\nOne\tTwo');
  });
});
import { beforeAll, afterAll } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
import sharp from 'sharp';

describe('Rich document persistence and isolation',()=>{
  let owner:TestTenant,other:TestTenant;
  beforeAll(async()=>{await getApp();owner=await createTestTenant();other=await createTestTenant();for(const tenant of [owner,other])await dbPlatform.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{sign:true}}) as any}).onConflict(oc=>oc.column('tenant_id').doUpdateSet({settings:JSON.stringify({'enabled-apps':{sign:true}}) as any})).execute();});
  afterAll(async()=>{for(const tenant of [owner,other].filter(Boolean))await tenant.cleanup();});
  it('saves sanitized HTML, reloads it, exports and blocks foreign tenants',async()=>{
    const app=await getApp();const created=await app.inject({method:'POST',url:'/v1/sign/generated-documents',headers:authHeaders(owner.token),payload:{title:'Rich draft',definition:{category:'Business',jurisdictions:[],body:'Draft text',questions:[]}}});expect(created.statusCode,created.body).toBe(201);const id=created.json().id;
    const payload={title:'Rich draft',jurisdiction:'Kenya',html:'<h2>Scope</h2><p onclick="bad()">Services <b>and fees</b></p><script>bad()</script>'};
    const foreign=await app.inject({method:'PUT',url:`/v1/sign/generated-documents/${id}/content`,headers:authHeaders(other.token),payload});expect(foreign.statusCode).toBe(404);
    const saved=await app.inject({method:'PUT',url:`/v1/sign/generated-documents/${id}/content`,headers:authHeaders(owner.token),payload});expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().definition.editor_html).not.toMatch(/onclick|script/);expect(saved.json().body).toContain('Services and fees');
    const reopened=await app.inject({method:'GET',url:`/v1/sign/generated-documents/${id}`,headers:authHeaders(owner.token)});expect(reopened.json().definition.editor_html).toContain('<b>and fees</b>');
    const pdf=await app.inject({method:'GET',url:`/v1/sign/generated-documents/${id}/pdf`,headers:authHeaders(owner.token)});expect(pdf.statusCode,pdf.body).toBe(200);expect(pdf.rawPayload.subarray(0,4).toString()).toBe('%PDF');
  });
  it('creates a complete sanitized rich draft in one request and preserves metadata', async () => {
    const app = await getApp();
    const created = await app.inject({ method: 'POST', url: '/v1/sign/generated-documents', headers: authHeaders(owner.token), payload: {
      title: 'Atomic draft', jurisdiction: 'Kenya', definition: { category: 'Business', jurisdictions: [], body: 'Untrusted fallback', questions: [], language: 'sw', editor_html: '<h4>Heading</h4><p>Terms <s>removed</s></p><script>bad()</script>' },
    } });
    expect(created.statusCode, created.body).toBe(201);
    const draft = created.json();
    expect(draft.jurisdiction).toBe('Kenya');
    expect(draft.definition.language).toBe('sw');
    expect(draft.definition.editor_html).toContain('<h4>Heading</h4>');
    expect(draft.definition.editor_html).toContain('<s>removed</s>');
    expect(draft.definition.editor_html).not.toContain('script');
    expect(draft.body).toContain('Heading');
    expect(draft.body).not.toContain('Untrusted fallback');
    const plainUpdate = await app.inject({ method: 'PATCH', url: `/v1/sign/generated-documents/${draft.id}`, headers: authHeaders(owner.token), payload: { title: draft.title, jurisdiction: 'Kenya', answers: {}, body: 'Different text' } });
    expect(plainUpdate.statusCode, plainUpdate.body).toBe(409);
    const pdf = await app.inject({ method: 'GET', url: `/v1/sign/generated-documents/${draft.id}/pdf?format=source`, headers: authHeaders(owner.token) });
    expect(pdf.statusCode, pdf.body).toBe(200);
    expect(pdf.json().document_data).toMatch(/^data:application\/pdf;base64,/);
    expect(pdf.json().jurisdiction_code).toBe('KE');
  });
  it('rejects content that becomes empty after sanitization without creating a draft', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'POST', url: '/v1/sign/generated-documents', headers: authHeaders(owner.token), payload: { title: 'Empty', jurisdiction: 'Kenya', definition: { category: 'Business', jurisdictions: [], body: 'Fallback', questions: [], editor_html: '<script>bad()</script><p><br></p>' } } });
    expect(response.statusCode, response.body).toBe(400);
  });
  it('refuses stale saves and other users in the same tenant', async () => {
    const app = await getApp();
    const created = await app.inject({ method: 'POST', url: '/v1/sign/generated-documents', headers: authHeaders(owner.token), payload: { title: 'Versioned draft', definition: { category: 'Business', jurisdictions: [], body: 'Original', questions: [] } } });
    const draft = created.json();
    const payload = { title: 'Updated', jurisdiction: 'Kenya', html: '<p>First save</p>', expected_updated_at: draft.updated_at };
    const saved = await app.inject({ method: 'PUT', url: `/v1/sign/generated-documents/${draft.id}/content`, headers: authHeaders(owner.token), payload });
    expect(saved.statusCode, saved.body).toBe(200);
    const stale = await app.inject({ method: 'PUT', url: `/v1/sign/generated-documents/${draft.id}/content`, headers: authHeaders(owner.token), payload: { ...payload, html: '<p>Stale overwrite</p>' } });
    expect(stale.statusCode, stale.body).toBe(409);
    const coworker = await owner.addUser('TENANT_ADMIN');
    for (const suffix of ['', '/pdf', '/pdf?format=source']) {
      const denied = await app.inject({ method: 'GET', url: `/v1/sign/generated-documents/${draft.id}${suffix}`, headers: authHeaders(coworker.token) });
      expect(denied.statusCode, denied.body).toBe(404);
    }
    const deniedSave = await app.inject({ method: 'PUT', url: `/v1/sign/generated-documents/${draft.id}/content`, headers: authHeaders(coworker.token), payload });
    expect(deniedSave.statusCode).toBe(404);
    const reopened = await app.inject({ method: 'GET', url: `/v1/sign/generated-documents/${draft.id}`, headers: authHeaders(owner.token) });
    expect(reopened.json().body).toBe('First save');
  });
  it('returns a recoverable error for malformed embedded images', async () => {
    const app = await getApp();
    const created = await app.inject({ method: 'POST', url: '/v1/sign/generated-documents', headers: authHeaders(owner.token), payload: { title: 'Image draft', definition: { category: 'Business', jurisdictions: [], body: 'Text', questions: [], editor_html: '<p>Text</p><img src="data:image/png;base64,YmFk">' } } });
    const response = await app.inject({ method: 'GET', url: `/v1/sign/generated-documents/${created.json().id}/pdf`, headers: authHeaders(owner.token) });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json().error).toContain('could not be exported');
  });
  it('carries Tanzania Mainland into the signing source jurisdiction', async () => {
    const app = await getApp();
    const created = await app.inject({ method: 'POST', url: '/v1/sign/generated-documents', headers: authHeaders(owner.token), payload: { title: 'Mainland draft', jurisdiction: 'Tanzania Mainland', definition: { category: 'Business', jurisdictions: [], body: 'Terms', questions: [], editor_html: '<p>Terms</p>' } } });
    expect(created.statusCode, created.body).toBe(201);
    const source = await app.inject({ method: 'GET', url: `/v1/sign/generated-documents/${created.json().id}/pdf?format=source`, headers: authHeaders(owner.token) });
    expect(source.statusCode, source.body).toBe(200);
    expect(source.json().jurisdiction_code).toBe('TZ');
    expect(source.json().jurisdiction).toBe('Tanzania Mainland');
  });
});
