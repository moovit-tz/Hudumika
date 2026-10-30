from pathlib import Path
p=Path('apps/api/src/routes/tracker.routes.ts');s=p.read_text(encoding='utf-8');s="import { parseTrackerPage, trackerPage } from '../services/tracker-pagination.js';\n"+s
s=s.replace("const listPage = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).max(1000000).default(0) });\n",'')
a=s.index("  fastify.get('/snapshots',");b=s.index('  // GET /v1/tracker/snapshots/by-shipment',a);s=s[:a]+'''  fastify.get('/snapshots', async req => {
    return withTenant(req.user.tenant_id, trx => trackerPage(trx,req.user.tenant_id,
      trx.selectFrom('tracking_snapshots').selectAll().where('tenant_id','=',req.user.tenant_id),
      'tracking_snapshots','created_at','desc',parseTrackerPage(req.query)));
  });

''' +s[b:]
a=s.index("  fastify.get('/containers',");b=s.index('\n}',a);t=s[a:b].replace('const { limit, offset } = listPage.parse(req.query);', 'const page = parseTrackerPage(req.query);').replace("      trx.selectFrom('tracked_containers as tc')", "      trackerPage(trx,user.tenant_id,trx.selectFrom('tracked_containers')").replace(".leftJoin('customers as c', 'c.id', 'tc.customer_id')", ".leftJoin('customers as c', 'c.id', 'tracked_containers.customer_id')").replace("'tc.","'tracked_containers.").replace(".orderBy('tracked_containers.updated_at', 'desc').orderBy('tc.id','desc').limit(limit).offset(offset)\n        .execute()", ",'tracked_containers','updated_at','desc',page)")
# Some orderBy retains tc alias inside replacement, remove remaining clause explicitly.
t=t.replace(".orderBy('tracked_containers.updated_at', 'desc').orderBy('tracked_containers.id','desc').limit(limit).offset(offset)\n        .execute()", ",'tracked_containers','updated_at','desc',page)");s=s[:a]+t+s[b:]
# Reject malformed IDs on all snapshot subroutes.
s=s.replace("if (params?.id) z.string().uuid().parse(params.id);", "if (params?.id) z.string().uuid().parse(params.id); if(params?.shipmentId) z.string().uuid().parse(params.shipmentId);")
s=s.replace('    const { shipment_id } = req.body as any;', '    const { shipment_id } = z.object({shipment_id:z.string().uuid().nullable()}).parse(req.body);')
p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/services/freightBooking.service.ts');s=p.read_text(encoding='utf-8');s="import { trackerPage, type TrackerPage } from './tracker-pagination.js';\n"+s;s=s.replace('activeOnly = false)', 'activeOnly = false, page?: TrackerPage)')
s=s.replace("return query.orderBy('name', 'asc').execute();", "return trackerPage(trx,tenantId,query,'carriers','name','asc',page);")
for name,table,order in [('listRateCards','freight_rate_cards','created_at'),('listRateContracts','carrier_rate_contracts','created_at'),('listBookings','freight_bookings','created_at')]:
 a=s.index('  async '+name);b=s.index('\n  },',a)+len('\n  },');t=s[a:b];t=t.replace(' }) {', ' }, page?: TrackerPage) {',1);t=t.replace(f"return query.orderBy('{table}.{order}', 'desc').execute();",f"return trackerPage(trx,tenantId,query,'{table}','{order}','desc',page);");s=s[:a]+t+s[b:]
p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/routes/freight-booking.routes.ts');s=p.read_text(encoding='utf-8');s="import { parseTrackerPage } from '../services/tracker-pagination.js';\n"+s;s=s.replace("  fastify.addHook('preHandler', requireTrackerAccess);", "  fastify.addHook('preHandler', requireTrackerAccess);\n  fastify.addHook('preHandler', async req => {const params=req.params as any;for(const key of ['id','shipmentId'])if(params?.[key])z.string().uuid().parse(params[key]);});")
s=s.replace("active_only === 'true');", "active_only === 'true', parseTrackerPage(request.query));")
for name in ['listRateCards','listRateContracts','listBookings']:s=s.replace(f'{name}(request.user.tenant_id, q);',f'{name}(request.user.tenant_id, q, parseTrackerPage(request.query));')
p.write_text(s,encoding='utf-8')
# Convert current load-more controls to the platform cursor contract.
p=Path('apps/web/src/pages/Tracker.tsx');s=p.read_text(encoding='utf-8');s=s.replace('  const [hasMoreFleet',"  const [fleetCursor,setFleetCursor] = useState<string>();\n  const [snapshotCursor,setSnapshotCursor] = useState<string>();\n  const [hasMoreFleet");s=s.replace('async (offset = 0)', "async (cursor?: string)")
s=s.replace('`/v1/tracker/containers?limit=100&offset=${offset}`', "`/v1/tracker/containers?paged=true&limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`").replace('`/v1/tracker/snapshots?limit=100&offset=${offset}`', "`/v1/tracker/snapshots?paged=true&limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`")
s=s.replace('setFleetContainers(prev=>offset?[...prev,...rows]:rows); setHasMoreFleet(rows.length===100);', 'setFleetContainers(prev=>cursor?[...prev,...rows.data]:rows.data); setHasMoreFleet(rows.has_more); setFleetCursor(rows.cursor);').replace('setSnapshots(prev=>offset?[...prev,...rows]:rows); setHasMoreSnapshots(rows.length===100);', 'setSnapshots(prev=>cursor?[...prev,...rows.data]:rows.data); setHasMoreSnapshots(rows.has_more); setSnapshotCursor(rows.cursor);')
s=s.replace('loadSnapshots(snapshots.length)','loadSnapshots(snapshotCursor)').replace('loadFleet(fleetContainers.length)','loadFleet(fleetCursor)');p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/ContainerListPage.tsx');s=p.read_text(encoding='utf-8');s=s.replace('const [offset,setOffset] = useState(0);', "const [cursor,setCursor] = useState<string>();\n  const [nextCursor,setNextCursor] = useState<string>();");s=s.replace('`/v1/tracker/containers?limit=100&offset=${offset}`',"`/v1/tracker/containers?paged=true&limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`").replace('setContainers(prev=>offset?[...prev,...data]:data); setHasMore(data.length===100);','setContainers(prev=>cursor?[...prev,...data.data]:data.data); setHasMore(data.has_more); setNextCursor(data.cursor);').replace('}, [offset]);','}, [cursor]);').replace('setOffset(containers.length)','setCursor(nextCursor)');p.write_text(s,encoding='utf-8')
