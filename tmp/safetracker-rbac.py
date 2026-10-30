from pathlib import Path
p=Path('apps/api/src/services/tracker-integrity.ts');s=p.read_text(encoding='utf-8');a=s.index('  const reads =');b=s.index('\n}',a);s=s[:a]+'''  const operations = ['SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','SENIOR','JUNIOR','OFFICER'];
  if (!operations.includes(req.user.role)) return reply.code(403).send({ error: 'Operations permission required' });''' +s[b:];p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/routes/cargo-dashboard.routes.ts');s=p.read_text(encoding='utf-8');s="import { requireTrackerAccess } from '../services/tracker-integrity.js';\n"+s;a=s.index("  fastify.addHook('preHandler', async (request: any, reply)");b=s.index('\n\n',a);s=s[:a]+"  fastify.addHook('preHandler', requireTrackerAccess);"+s[b:];p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/tests/safetracker-integrity.test.ts');s=p.read_text(encoding='utf-8');s += '''
it('enforces the operations role boundary consistently for reads and writes',async()=>{
 for(const role of ['SALES','FINANCE','CUSTOMER'] as const){const token=(await tenant.addUser(role)).token;for(const path of ['/v1/tracker/containers','/v1/freight-booking/bookings','/v1/demurrage/containers'])expect((await req('GET',path,undefined,token)).statusCode).toBe(403);}
 const junior=(await tenant.addUser('JUNIOR')).token;expect((await req('GET','/v1/tracker/containers',undefined,junior)).statusCode).toBe(200);
});
''';p.write_text(s,encoding='utf-8')
