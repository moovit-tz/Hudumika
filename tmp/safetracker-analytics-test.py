from pathlib import Path
p=Path('apps/api/src/tests/safetracker-integrity.test.ts');s=p.read_text(encoding='utf-8');needle="  expect((await req('POST','/v1/tracker/snapshots',result,other.token)).statusCode).toBe(400);";s=s.replace(needle,'''  const legacy=await req('POST','/v1/tracker/snapshots',{tracking_number:'TEST-PROVIDER',tracking_type:'BL',source:'manual',eta:'2099-01-01T00:00:00Z'});expect(legacy.statusCode,legacy.body).toBe(201);
  const refreshed=await req('PATCH',`/v1/tracker/snapshots/${legacy.json().id}`,result);expect(refreshed.statusCode,refreshed.body).toBe(200);expect(refreshed.json().eta_initial).toBe(null);
  const summary=await req('GET','/v1/cargotracker/dashboard/summary');expect(summary.statusCode,summary.body).toBe(200);expect(summary.json().shipments).toBe(1);
  for(const path of ['carrier-analysis','lane-analysis','regional-analysis','demurrage-analysis']){const report=await req('GET',`/v1/cargotracker/dashboard/${path}`);expect(report.statusCode,report.body).toBe(200);}
''' +needle);p.write_text(s,encoding='utf-8')
