from pathlib import Path
p=Path('apps/api/src/routes/tracker.routes.ts');s=p.read_text(encoding='utf-8');s=s.replace("z.string().datetime({offset:true}).nullable().optional()", "z.string().refine(v => Number.isFinite(Date.parse(v)), 'Invalid tracking date').nullable().optional()");s=s.replace('eta:              body.eta ?? null,', 'eta:              body.eta ? new Date(body.eta) : null,').replace('eta_initial:      body.eta_initial ?? body.eta ?? null,', 'eta_initial:      body.eta_initial || body.eta ? new Date((body.eta_initial || body.eta)!) : null,');s=s.replace("    if ('events' in body)", "    if ('eta' in body) patch.eta = body.eta ? new Date(body.eta) : null;\n    if ('events' in body)");p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/services/demurrage.service.ts');s=p.read_text(encoding='utf-8').replace('if (!row.discharge_date || frozen.has(row.id))', 'if (!row.discharge_date || new Date(row.discharge_date) > new Date() || frozen.has(row.id))');p.write_text(s,encoding='utf-8')
# Bind currencies in both dashboards, rather than attaching a USD formatter to mixed amounts.
p=Path('apps/web/src/pages/Demurrage.tsx');s=p.read_text(encoding='utf-8');s=s.replace('formatCurrency(data.cost)', "data.cost.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})").replace('formatCurrency(v.cost)', "v.cost.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})");p.write_text(s,encoding='utf-8')
# provider proof rejection regression test
p=Path('apps/api/src/tests/safetracker-integrity.test.ts');s=p.read_text(encoding='utf-8');s=s.replace(" expect((await req('POST','/v1/tracker/snapshots',{tracking_type:'BL',tracking_number:'FAKE',source:'mock'})).statusCode).toBe(400);", " expect((await req('POST','/v1/tracker/snapshots',{tracking_type:'BL',tracking_number:'FAKE',source:'mock'})).statusCode).toBe(400);\n expect((await req('POST','/v1/tracker/snapshots',{tracking_type:'BL',tracking_number:'FORGED',source:'live',provider:'shipsgo'})).statusCode).toBe(400);")
s += '''
it('pins charge rates against later tariff edits and refreshes unposted accruals',async()=>{
 const rules={carrier_name:'Pinned tariff',container_size:'20FT',free_days:0,rate_tiers:[{from_day:1,to_day:10000,daily_rate:10}],currency:'EUR',effective_from:'2020-01-01'};
 const tariff=await req('POST','/v1/demurrage/tariffs',rules);expect(tariff.statusCode,tariff.body).toBe(201);
 const added=await req('POST','/v1/demurrage/containers',{shipment_id:shipment,container_number:num,container_size:'20FT',carrier_name:rules.carrier_name,discharge_date:'2026-10-01',free_days:0});expect(added.statusCode,added.body).toBe(201);
 await req('PATCH',`/v1/demurrage/tariffs/${tariff.json().id}`,{rate_tiers:[{from_day:1,to_day:10000,daily_rate:999}],currency:'USD'});
 const list=await req('GET','/v1/demurrage/containers');expect(list.statusCode,list.body).toBe(200);expect(list.json().find((r:any)=>r.id===added.json().id).demurrage_currency).toBe('EUR');
 const returned=await req('PATCH',`/v1/demurrage/containers/${added.json().id}/return`,{return_date:'2026-10-11'});expect(returned.statusCode,returned.body).toBe(200);expect(Number(returned.json().demurrage_cost)).toBe(100);expect(returned.json().demurrage_currency).toBe('EUR');
});
''';p.write_text(s,encoding='utf-8')
