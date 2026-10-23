import * as aiAssist from '../services/sign-ai-assist.service.js';
import { randomUUID } from 'node:crypto';
import { it,expect,vi } from 'vitest';
import { getApp,createTestTenant,authHeaders } from './helpers.js';
import { dbPlatform } from '../db/client.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { MinioIntegration } from '../integrations/minio.js';

it('keeps real mirrored personnel bytes private across Cloud and HR alternative paths',async()=>{
 const t=await createTestTenant();let storageKey:string|null=null;
 try {
  const app=await getApp(),employee=await t.addUser('JUNIOR'),manager=await t.addUser('MANAGER');
  await dbPlatform.insertInto('tenant_settings').values({tenant_id:t.tenantId,settings:JSON.stringify({'enabled-apps':{cloud:true,sign:true,bliss:true}})}).execute();
  const content=Buffer.from('PRIVATE PERSONNEL RECORD — disposable integration fixture');
  await CloudSync.syncEmployeeDoc(t.tenantId,{userId:employee.userId,filename:'private-personnel.txt',buffer:content,mime:'text/plain'});
  const file=await dbPlatform.selectFrom('cloud_files').selectAll().where('tenant_id','=',t.tenantId).where('entity_type','=','employee').where('entity_id','=',employee.userId).where('type','!=','folder').executeTakeFirstOrThrow();
  storageKey=file.storage_key;
  expect(storageKey).toBeTruthy();
  const drive=await dbPlatform.selectFrom('cloud_drives').selectAll().where('tenant_id','=',t.tenantId).where('id','=',file.drive_id).executeTakeFirstOrThrow();
  expect(drive.managed_purpose).toBe('nexushr');expect(drive.type).toBe('shared');
  const twin=await t.addUser('JUNIOR');
  await CloudSync.ensureEmployeeFolder(t.tenantId,twin.userId,'Test JUNIOR');
  const twinFolder=await dbPlatform.selectFrom('cloud_files').select('id').where('tenant_id','=',t.tenantId).where('entity_type','=','employee').where('entity_id','=',twin.userId).where('type','=','folder').executeTakeFirstOrThrow();
  expect(twinFolder.id).not.toBe(file.parent_id);
  const business=await dbPlatform.insertInto('cloud_drives').values({tenant_id:t.tenantId,name:'Disposable business drive',type:'business',owner_name:'System'}).returning('id').executeTakeFirstOrThrow();
  await expect(dbPlatform.updateTable('cloud_files').set({drive_id:business.id,parent_id:null,entity_type:null,entity_id:null}).where('tenant_id','=',t.tenantId).where('id','=',file.id).execute()).rejects.toMatchObject({code:'23514'});
  await expect(dbPlatform.insertInto('cloud_files').values({tenant_id:t.tenantId,drive_id:business.id,name:'Misfiled personnel record',type:'txt',size:0,entity_type:'employee',entity_id:employee.userId}).execute()).rejects.toMatchObject({code:'23514'});


  await dbPlatform.updateTable('cloud_files').set({scan_status:'clean'}).where('tenant_id','=',t.tenantId).where('id','=',file.id).execute();
  const call=(token:string,url:string,method:'GET'|'POST'='GET',payload?:object)=>app.inject({method,url,headers:authHeaders(token),...(payload ? {payload} : {})});
  for(const token of [manager.token,employee.token]) {
   const denied=await call(token,`/v1/files/${file.id}/download`);expect(denied.statusCode,denied.body).toBe(403);
   expect((await call(token,`/v1/files?drive_id=${drive.id}`)).statusCode).toBe(404);
   const entity=await call(token,`/v1/files?entity_type=employee&entity_id=${employee.userId}`);expect(entity.statusCode,entity.body).toBe(200);expect(entity.json()).toEqual([]);
   const search=await call(token,'/v1/files?q=private-personnel');expect(search.statusCode,search.body).toBe(200);expect(search.json()).toEqual([]);
  }
  expect((await call(manager.token,`/v1/files/employee-folder/${employee.userId}`)).statusCode).toBe(403);
  const aiSpy=vi.spyOn(aiAssist,'analyzeDocumentForSigningAssist').mockRejectedValue(new Error('Forbidden provider call'));
  try {const assist=await call(manager.token,'/v1/sign/ai-assist/analyze','POST',{file_id:file.id});expect(assist.statusCode,assist.body).toBe(404);expect(aiSpy).not.toHaveBeenCalled();}finally{aiSpy.mockRestore();}
  const envelope=await call(manager.token,'/v1/sign/envelopes','POST',{title:'Forbidden personnel copy',file_id:file.id,recipients:[{name:'Test recipient',email:'recipient@hr-test.invalid'}]});expect(envelope.statusCode,envelope.body).toBe(404);
  const sent=await call(manager.token,`/v1/support/tickets/${randomUUID()}/messages`,'POST',{content:'Must not be delivered',channel:'EMAIL',attachment_file_ids:[file.id]});expect(sent.statusCode,sent.body).toBe(403);

  const token=randomUUID();
  await dbPlatform.updateTable('cloud_files').set({share_token:token}).where('tenant_id','=',t.tenantId).where('id','=',file.id).execute();
  await dbPlatform.insertInto('cloud_file_shares').values({tenant_id:t.tenantId,file_id:file.id,principal_type:'user',principal_id:manager.userId,person_name:'Test manager',role:'Viewer'}).execute();
  expect((await call(manager.token,`/v1/files/${file.id}/download`)).statusCode).toBe(403);
  expect((await call(manager.token,'/v1/files/shared-with-me')).json().data).toEqual([]);
  expect((await app.inject({method:'GET',url:`/v1/files-public/${token}/download`})).statusCode).toBe(404);
  const doc=await dbPlatform.insertInto('hr_documents').values({tenant_id:t.tenantId,user_id:employee.userId,name:file.name,type:'CONTRACT',storage_key:storageKey!}).returning('id').executeTakeFirstOrThrow();
  expect((await call(manager.token,`/v1/hr/documents/${doc.id}/download`)).statusCode).toBe(403);
  const own=await call(employee.token,`/v1/hr/documents/${doc.id}/download`);expect(own.statusCode,own.body).toBe(200);expect(own.rawPayload.equals(content)).toBe(true);
  const role=await dbPlatform.insertInto('ondi_org_roles').values({tenant_id:t.tenantId,name:'HR document specialist',permissions:JSON.stringify(['hr.documents.manage']),created_by:t.userId}).returning('id').executeTakeFirstOrThrow();
  await dbPlatform.insertInto('ondi_org_role_members').values({tenant_id:t.tenantId,role_id:role.id,user_id:manager.userId,granted_by:t.userId}).execute();
  const hr=await call(manager.token,`/v1/files/${file.id}/download`);expect(hr.statusCode,hr.body).toBe(200);expect(hr.rawPayload.equals(content)).toBe(true);
  expect((await call(manager.token,`/v1/files/${file.id}/signed-url`)).statusCode).toBe(403);
  expect((await call(manager.token,`/v1/files/${file.id}/public-link`,'POST',{})).statusCode).toBe(403);
 } finally {if(storageKey) await MinioIntegration.deleteDocument(t.tenantId,storageKey);await t.cleanup();}
},60000);
