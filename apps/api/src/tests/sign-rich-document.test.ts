import { describe, it, expect } from 'vitest';
import { sanitizeDocumentHtml, documentHtmlText, buildRichDocumentPdf } from '../services/sign-rich-document.service.js';

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
  it('renders multi-page formatted text, links and code to a PDF',async()=>{
    const pdf=await buildRichDocumentPdf('Draft','<h2>Terms</h2>'+ '<p>A <b>binding</b> clause with a <a href="https://example.com">link</a>.</p>'.repeat(80)+'<pre>const id = 1;</pre>');
    expect(pdf.subarray(0,4).toString()).toBe('%PDF');expect(pdf.length).toBeGreaterThan(3000);
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
});
