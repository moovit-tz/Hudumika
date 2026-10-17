import { describe,it,expect,beforeAll,afterAll,vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { sql } from 'kysely';
import { getApp,createTestTenant,authHeaders,type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
import { EmailIntegration } from '../integrations/email.js';

describe('Signing editor persistence and review/send flow',()=>{
  let tenant:TestTenant;let other:TestTenant;let id:string;let documentData:string;
  const email=vi.spyOn(EmailIntegration,'sendEmail').mockResolvedValue({success:true,messageId:'local-editor-test'});
  const recipients=[{name:'First test signer',email:'first@editor-test.invalid',sign_order:1},{name:'Second test signer',email:'second@editor-test.invalid',sign_order:2}];
  const fields=[{field_type:'signature',recipient_index:0,page:1,x:.1,y:.65,width:.34,height:.09,required:true},{field_type:'text',recipient_index:1,page:2,x:.2,y:.3,width:.25,height:.04,required:true,placeholder:'Reference'}];
  beforeAll(async()=>{
    await getApp();tenant=await createTestTenant();other=await createTestTenant();
    for(const item of [tenant,other])await dbPlatform.insertInto('tenant_settings').values({tenant_id:item.tenantId,settings:JSON.stringify({'enabled-apps':{sign:true}}) as any}).onConflict(oc=>oc.column('tenant_id').doUpdateSet({settings:sql`jsonb_set(coalesce(tenant_settings.settings,'{}'::jsonb),'{enabled-apps,sign}','true'::jsonb,true)`})).execute();
    const pdf=await PDFDocument.create();pdf.addPage().drawText('Disposable editor integration test');pdf.addPage().drawText('Second test page');documentData=`data:application/pdf;base64,${Buffer.from(await pdf.save()).toString('base64')}`;
  });
  afterAll(async()=>{vi.restoreAllMocks();for(const item of [tenant,other].filter(Boolean)){await dbPlatform.deleteFrom('sign_document_versions').where('tenant_id','=',item.tenantId).execute();await dbPlatform.deleteFrom('sign_envelopes').where('tenant_id','=',item.tenantId).execute();await item.cleanup();}});
  it('creates a real multi-page draft with recipient assignments and document history',async()=>{
    const app=await getApp();const created=await app.inject({method:'POST',url:'/v1/sign/envelopes',headers:authHeaders(tenant.token),payload:{title:'Editor test draft',file_name:'editor-test.pdf',document_data:documentData,order_mode:'sequential',recipients,fields}});
    expect(created.statusCode,created.body).toBe(201);id=created.json().id;
    const fetched=await app.inject({method:'GET',url:`/v1/sign/envelopes/${id}`,headers:authHeaders(tenant.token)});const draft=fetched.json();
    expect(draft.status).toBe('draft');expect(draft.fields).toHaveLength(2);expect(draft.fields.find((f:{page:number})=>f.page===2).recipient_id).toBe(draft.recipients.find((r:{email:string})=>r.email===recipients[1].email).id);
    const versions=await app.inject({method:'GET',url:`/v1/sign/envelopes/${id}/versions`,headers:authHeaders(tenant.token)});expect(versions.json().data).toHaveLength(1);expect(email).not.toHaveBeenCalled();
  });
  it('persists repositioned and resized fields against replacement recipient IDs',async()=>{
    const app=await getApp();const updated=await app.inject({method:'PUT',url:`/v1/sign/envelopes/${id}`,headers:authHeaders(tenant.token),payload:{title:'Reviewed editor draft',message:'Test invitation',recipients,fields:[{...fields[0],recipient_index:1,x:.3,width:.4},fields[1]]}});
    expect(updated.statusCode,updated.body).toBe(200);const draft=updated.json();const field=draft.fields.find((f:{field_type:string})=>f.field_type==='signature');expect(Number(field.x)).toBe(.3);expect(Number(field.width)).toBe(.4);expect(field.recipient_id).toBe(draft.recipients.find((r:{email:string})=>r.email===recipients[1].email).id);
  });
  it('rejects invalid geometry, assignments, recipients and foreign linked users without mutating the draft',async()=>{
    const app=await getApp();for(const patch of [{fields:[{...fields[0],x:.9}]},{fields:[{...fields[0],recipient_index:99}]},{fields:[{...fields[0],page:0}]},{recipients:[]},{title:' '},{recipients:[{name:'Bad email',email:'invalid'}],fields:[]}]) {
      const response=await app.inject({method:'PUT',url:`/v1/sign/envelopes/${id}`,headers:authHeaders(tenant.token),payload:patch});expect(response.statusCode,response.body).toBe(400);
    }
    const foreign=await app.inject({method:'PUT',url:`/v1/sign/envelopes/${id}`,headers:authHeaders(tenant.token),payload:{recipients:[{...recipients[0],user_id:other.userId}],fields:[]}});expect(foreign.statusCode,foreign.body).toBe(404);
    const fetched=await app.inject({method:'GET',url:`/v1/sign/envelopes/${id}`,headers:authHeaders(tenant.token)});expect(fetched.json().fields).toHaveLength(2);expect(fetched.json().title).toBe('Reviewed editor draft');
  });
  it('protects tenant boundaries and prevents recipient replacement from silently deleting fields',async()=>{
    const app=await getApp();const dropped=await app.inject({method:'PUT',url:`/v1/sign/envelopes/${id}`,headers:authHeaders(tenant.token),payload:{recipients}});expect(dropped.statusCode).toBe(400);
    for(const method of ['GET','PUT','POST'] as const){const response=await app.inject({method,url:`/v1/sign/envelopes/${id}${method==='POST'?'/send':''}`,headers:authHeaders(other.token),...(method==='PUT'?{payload:{title:'Foreign change'}}:{})});expect(response.statusCode,response.body).toBe(404);}
    expect(email).not.toHaveBeenCalled();
  });
  it('preserves oath roles, official credentials and both stamp types',async()=>{
    const app=await getApp();
    const response=await app.inject({method:'POST',url:'/v1/sign/envelopes',headers:authHeaders(tenant.token),payload:{title:'Disposable oath and stamp draft',document_data:documentData,recipients:[{...recipients[0],execution_role:'AFFIANT'},{...recipients[1],execution_role:'CERTIFIER',is_certifier:true,certifier_title:'Commissioner for Oaths',certifier_roll_number:'TEST-ONLY-001',certifier_firm:'Example office'}],fields:[{...fields[0],field_type:'stamp'},{...fields[1],field_type:'certification_stamp',recipient_index:1}]}});
    expect(response.statusCode,response.body).toBe(201);
    const saved=await app.inject({method:'GET',url:`/v1/sign/envelopes/${response.json().id}`,headers:authHeaders(tenant.token)});
    const draft=saved.json();
    expect(draft.recipients.find((r:{execution_role:string})=>r.execution_role==='AFFIANT')).toBeTruthy();
    const official=draft.recipients.find((r:{execution_role:string})=>r.execution_role==='CERTIFIER');
    expect(official.is_certifier).toBe(true);expect(official.certifier_title).toBe('Commissioner for Oaths');expect(official.certifier_roll_number).toBe('TEST-ONLY-001');
    expect(draft.fields.find((f:{field_type:string})=>f.field_type==='certification_stamp').recipient_id).toBe(official.id);
    expect(draft.fields.some((f:{field_type:string})=>f.field_type==='stamp')).toBe(true);
    expect(email).not.toHaveBeenCalled();
  });
  it('saves and reimports uploaded template content with role and stamp assignments',async()=>{
    const app=await getApp();
    const payload={name:'Uploaded reusable document',document_data:documentData,file_name:'source.pdf',recipients:[{name:'',email:'',execution_role:'AFFIANT',sign_order:1},{name:'',email:'',execution_role:'CERTIFIER',is_certifier:true,certifier_title:'Commissioner for Oaths',sign_order:2}],fields:[{...fields[0],field_type:'stamp'},{...fields[1],field_type:'certification_stamp'}]};
    const created=await app.inject({method:'POST',url:'/v1/sign/templates',headers:authHeaders(tenant.token),payload});
    expect(created.statusCode,created.body).toBe(201);
    const fetched=await app.inject({method:'GET',url:`/v1/sign/templates/${created.json().id}`,headers:authHeaders(tenant.token)});
    expect(fetched.json().document_data).toBe(documentData);expect(fetched.json().recipients[1].execution_role).toBe('CERTIFIER');expect(fetched.json().fields[1].field_type).toBe('certification_stamp');
    const foreign=await app.inject({method:'GET',url:`/v1/sign/templates/${created.json().id}`,headers:authHeaders(other.token)});expect(foreign.statusCode).toBe(404);
    const invalid=await app.inject({method:'POST',url:'/v1/sign/templates',headers:authHeaders(tenant.token),payload:{...payload,fields:[{...fields[0],recipient_index:50}]}});expect(invalid.statusCode).toBe(400);
  });
  it('sends only after review submission, persists audit state, and prevents duplicate invitations',async()=>{
    const app=await getApp();const sent=await app.inject({method:'POST',url:`/v1/sign/envelopes/${id}/send`,headers:authHeaders(tenant.token)});
    expect(sent.statusCode,sent.body).toBe(200);expect(sent.json().status).toBe('sent');expect(sent.json().signing_links).toHaveLength(2);expect(email).toHaveBeenCalledTimes(1);expect(email.mock.calls[0][0].to).toBe(recipients[0].email);
    expect(await dbPlatform.selectFrom('sign_events').select('id').where('tenant_id','=',tenant.tenantId).where('envelope_id','=',id).where('event_type','=','sent').executeTakeFirst()).toBeTruthy();
    const again=await app.inject({method:'POST',url:`/v1/sign/envelopes/${id}/send`,headers:authHeaders(tenant.token)});expect(again.statusCode).toBe(409);expect(email).toHaveBeenCalledTimes(1);
    const edit=await app.inject({method:'PUT',url:`/v1/sign/envelopes/${id}`,headers:authHeaders(tenant.token),payload:{title:'After sending'}});expect(edit.statusCode).toBe(409);
  });
});
