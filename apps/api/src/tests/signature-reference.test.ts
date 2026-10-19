import forge from 'node-forge';
import { getSigningIdentity } from '../services/pdf-signing-identity.service.js';
import { describe,it,expect,vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { signatureReference } from '../services/signature-reference.js';
vi.mock('../services/pdf-signing-identity.service.js',()=>({getSigningIdentity:vi.fn().mockRejectedValue(new Error('No identity in visual PDF fixture'))}));
import { buildSignedPdf, drawSignatureSpecimen } from '../services/sign-pdf.service.js';

const first='12345678-1234-4234-8234-123456789abc';
const second='12345678-1234-4234-8234-123456789abd';
describe('Signature references',()=>{
  it('keeps the complete persistent UUID and distinguishes signers sharing a prefix',()=>{
    expect(signatureReference(first)).toBe('HSGN-12345678123442348234123456789ABC');
    expect(signatureReference(first)).not.toBe(signatureReference(second));
    expect(()=>signatureReference('client-generated-caption')).toThrow();
  });
  it('embeds the complete reference as readable text inside the signature field',async()=>{
    const doc=await PDFDocument.create();const page=doc.addPage([595,842]);
    const signature=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
    await drawSignatureSpecimen(doc,page,{x:50,y:60,width:215,height:100},signature,first);
    const source=await getDocument({data:await doc.save(),useSystemFonts:true}).promise;
    const parsed=await source.getPage(1);const content=await parsed.getTextContent();
    const text=content.items.map(item=>'str' in item?item.str:'').join('');
    expect(text).toContain('Hudumika signed by:');expect(text).toContain(signatureReference(first));expect(text).not.toContain('…');
    for(const item of content.items){if('str' in item && item.str.startsWith('HSGN-')){expect(item.height).toBeGreaterThanOrEqual(7);expect(item.transform[4]).toBeGreaterThanOrEqual(50);expect(item.transform[5]).toBeGreaterThanOrEqual(60);}}
    await source.destroy();
  });
  it('carries the signer reference from the field into the final audit page',async()=>{
    const source=await PDFDocument.create();source.addPage([595,842]);
    const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey; certificate.serialNumber = '01';
    certificate.validity.notBefore = new Date(); certificate.validity.notAfter = new Date(Date.now() + 86400000);
    const subject = [{ name: 'commonName', value: 'Disposable signature test' }];
    certificate.setSubject(subject); certificate.setIssuer(subject); certificate.sign(keys.privateKey, forge.md.sha256.create());
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], 'test-only', { algorithm: 'aes256' });
    vi.mocked(getSigningIdentity).mockResolvedValueOnce({ p12: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'), password: 'test-only', displayName: 'Disposable signature test' });
    const result=await buildSignedPdf({id:second,title:'Visual fixture',tenant_id:second,file_id:null,document_data:`data:application/pdf;base64,${Buffer.from(await source.save()).toString('base64')}`,verification_code:null,completed_at:new Date()},[{id:first,name:'Sample signer',email:'sample@example.invalid',signature_data:signature}],[{recipient_id:first,field_type:'signature',page:1,x:.1,y:.5,width:.36,height:.12,value:null}],[]);
    const pdf=await getDocument({data:new Uint8Array(result),useSystemFonts:true}).promise;
    expect(pdf.numPages).toBe(2);
    for(const number of [1,2]){const page=await pdf.getPage(number);const text=(await page.getTextContent()).items.map(item=>'str' in item?item.str:'').join('');expect(text).toContain(signatureReference(first));}
    await pdf.destroy();
  });

  it('fails closed when the cryptographic identity is unavailable', async () => {
    await expect(buildSignedPdf({id:second,title:'Fail closed',tenant_id:second,file_id:null,document_data:null,verification_code:null,completed_at:new Date()},[],[],[])).rejects.toThrow('No identity');
  });

});
