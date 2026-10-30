from pathlib import Path
p=Path('apps/api/src/routes/tracker.routes.ts');s=p.read_text(encoding='utf-8');a=s.index('const snapshotSchema =');b=s.index('\n\n// ── Types',a);s=s[:a]+'''const snapshotSchema = z.object({
 tracking_type: z.enum(['AWB','BL']), tracking_number: z.string().trim().min(1).max(100), source: z.enum(['live','manual']), provider: z.enum(['ship24','shipsgo']).nullable().optional(), proof: z.string().max(4000).optional(), shipment_id: z.string().uuid().nullable().optional(),
 carrier: z.string().max(200).nullable().optional(), origin_name: z.string().max(300).nullable().optional(), origin_code: z.string().max(20).nullable().optional(), dest_name: z.string().max(300).nullable().optional(), dest_code: z.string().max(20).nullable().optional(), current_location: z.string().max(500).nullable().optional(), status: z.string().max(100).nullable().optional(), status_code: z.string().max(100).nullable().optional(), eta: z.string().datetime({offset:true}).nullable().optional(), eta_initial: z.string().datetime({offset:true}).nullable().optional(),
 events: z.array(eventSchema).max(500).optional(), progress_pct: z.number().min(0).max(100).optional(),
});''' +s[b:]
# remove unused demo generator entirely
start=s.index('// ── Mock data');end=s.index('async function trackViaShipsGo',start); # preserve provider section heading not required
s=s[:start]+s[end:];s=s.replace('// Demo fallback','// Provider failure must not become an operational tracking result.');p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/components/container/containerData.ts');s=p.read_text(encoding='utf-8');a=s.index('/** Empty display');p.write_text("import type { ContainerDetails } from './containerTypes.js';\n\n"+s[a:],encoding='utf-8')
p=Path('apps/web/src/pages/RecordContainerPage.tsx');s=p.read_text(encoding='utf-8').replace('getContainerDetails, SAMPLE_CONTAINER_MSCU','getContainerDetails');p.write_text(s,encoding='utf-8')
for file in ['ContainerEvidencePage.tsx','DemurrageTariffPage.tsx']:
 p=Path('apps/web/src/pages')/file;s=p.read_text(encoding='utf-8').replace('DatePicker value={','DatePicker date={');p.write_text(s,encoding='utf-8')
