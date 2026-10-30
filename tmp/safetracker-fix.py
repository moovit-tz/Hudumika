from pathlib import Path
p=Path('apps/api/src/routes/tracker.routes.ts');s=p.read_text(encoding='utf-8')
s="import { z } from 'zod';\nimport { validateContainerNumber } from '@hudumika/types';\nimport { requireTrackerAccess, validateTrackerReferences, containerWriteSchema, lifecycleStages } from '../services/tracker-integrity.js';\n"+s
start=s.index("  fastify.addHook('preHandler', async (request: any, reply) => {");end=s.index('\n\n  // POST /v1/tracker/track',start)
s=s[:start]+"  fastify.addHook('preHandler', requireTrackerAccess);\n  fastify.addHook('preHandler', async (req) => {\n    if (req.body && typeof req.body === 'object') await withTenant((req as any).user.tenant_id, trx => validateTrackerReferences(trx, (req as any).user.tenant_id, req.body));\n  });"+s[end:]
s=s.replace("const { number, type } = req.body as { number: string; type?: 'AWB' | 'BL' };", "const { number, type } = z.object({ number: z.string().trim().min(1).max(100), type: z.enum(['AWB', 'BL']).optional() }).parse(req.body);")
s=s.replace("} catch { /* no settings — use mock */ }", "} catch { return reply.code(503).send({ error: 'Tracking configuration could not be loaded' }); }")
s=s.replace("result = buildMockResult(normalized, resolvedType);", "return reply.code(503).send({ error: shipsgoKey || ship24Key ? 'Tracking provider unavailable or shipment not found. No tracking result was saved.' : 'Configure a tracking provider before tracking shipments.' });")
# Remove all carrier/spec inference from operational API.
a=s.index('  // Pure function: derive carrier defaults');b=s.index('  // GET /v1/tracker/containers/:number',a);s=s[:a]+s[b:]
s=s.replace("'tc.dimensions', 'tc.compliance', 'tc.current_depot', 'tc.notes',", "'tc.dimensions', 'tc.compliance', 'tc.current_depot', 'tc.notes', 'tc.cargo_breakdown', 'tc.classification',")
s=s.replace('    ).catch(() => null);','    );\n    if (!row) return reply.code(404).send({ error: \'Container not found\' });',1)
a=s.index('    const carrier = detectCarrier(contNum);');b=s.index('\n    return reply.send(result);',a)
s=s[:a]+'''    const result = {
      ...row, db_id: row.id, carrier: row.carrier_name,
      ...row.dimensions,
      status: row.lifecycle_stage,
      voyage: {},
      location_info: row.current_depot,
      cargo_worthy: {
        grade: surveys[0]?.grade ?? null,
        last_survey_date: surveys[0]?.survey_date ?? null,
        surveyor_name: surveys[0]?.surveyor_name ?? null,
        survey_notes: surveys[0]?.surveyor_notes ?? null,
        inspection_photos: surveys[0]?.photos ?? [],
        repair_history: repairs,
      },
      survey_report: {
        grade: surveys[0]?.grade ?? '', rating_label: surveys[0]?.rating_label ?? '',
        last_survey_date: surveys[0]?.survey_date ?? '', surveyor_notes: surveys[0]?.surveyor_notes ?? '',
        photos: surveys[0]?.photos ?? [],
        repairs: repairs.map(r => ({ id: r.id, title: r.description, date: r.repair_date, completed: r.resolved, type: r.repair_type })),
      },
      stage_history: history.map(h => ({ stage: h.stage, label: h.stage.replace(/_/g, ' '), timestamp: h.recorded_at, location: h.location, actor: h.actor_name, notes: h.notes })),
    };
''' +s[b:]
s=s.replace('const body = req.body as any;\n    if (!body?.container_number)', 'const body = containerWriteSchema.parse(req.body);\n    if (!body?.container_number)',1)
s=s.replace('    const carrier = detectCarrier(contNum);\n    const specs = deriveSpecs(contNum);','')
a=s.index('        iso_code: body.iso_code');b=s.index('        updated_at: new Date(),',a)
s=s[:a]+'''        iso_code: body.iso_code ?? existing?.iso_code ?? '',
        size_type: body.size_type ?? existing?.size_type ?? '',
        ownership: body.ownership ?? existing?.ownership ?? '',
        condition: body.condition ?? existing?.condition ?? 'UNKNOWN',
        carrier_name: body.carrier_name ?? body.carrier ?? existing?.carrier_name ?? null,
        carrier_code: body.carrier_code ?? existing?.carrier_code ?? null,
        color_hex: body.color_hex ?? existing?.color_hex ?? null,
        lifecycle_stage: existing?.lifecycle_stage ?? 'AVAILABLE_AT_DEPOT',
        shipment_id: 'shipment_id' in body ? body.shipment_id : existing?.shipment_id ?? null,
        customer_id: 'customer_id' in body ? body.customer_id : existing?.customer_id ?? null,
        dimensions: { ...(existing?.dimensions ?? {}), ...(body.dimensions ?? {}), ...Object.fromEntries(['tare_weight_kg','max_gross_weight_kg','payload_capacity_kg','cubic_capacity_cbm','floor_type','manufacture_year','manufacturer','design_validity_years'].filter(k => k in body).map(k => [k, (body as any)[k]])) },
        compliance: body.compliance ?? existing?.compliance ?? {},
        current_depot: body.current_depot ?? existing?.current_depot ?? {},
        cargo_breakdown: JSON.stringify(body.cargo_breakdown ?? existing?.cargo_breakdown ?? []),
        classification: body.classification ?? existing?.classification ?? {},
        notes: 'notes' in body ? body.notes : existing?.notes ?? null,
''' +s[b:]
# all container update predicates retain explicit tenant scope
s=s.replace(".where('id', '=', existing.id)\n", ".where('id', '=', existing.id).where('tenant_id', '=', user.tenant_id)\n")
s=s.replace(".where('id', '=', tc.id)\n", ".where('id', '=', tc.id).where('tenant_id', '=', user.tenant_id)\n")
a=s.index('    const body = req.body as any;',s.index("fastify.patch('/containers/:number',"));s=s[:a]+s[a:].replace('const body = req.body as any;', 'const body = containerWriteSchema.partial().parse(req.body);',1)
s=s.replace("'color_hex', 'lifecycle_stage', 'shipment_id'", "'color_hex', 'shipment_id'")
s=s.replace('if (body[k] !== undefined) patch[k] = body[k];', "if ((body as any)[k] !== undefined) patch[k] = k === 'cargo_breakdown' ? JSON.stringify((body as any)[k]) : (body as any)[k];")
# Stage handler rewrite, row lock, no implicit creation, transition notes required.
a=s.index("    const { stage, notes, location } = req.body as any;");b=s.index("      await trx.insertInto('container_stage_history')",a)
s=s[:a]+'''    const { stage, notes, location } = z.object({ stage: z.enum(lifecycleStages), notes: z.string().trim().min(1).max(4000), location: z.string().trim().min(1).max(300) }).parse(req.body);
    const contNum = String(number).trim().toUpperCase().replace(/\\s/g, '');
    const result = await withTenant(user.tenant_id, async (trx) => {
      const tc = await trx.selectFrom('tracked_containers').select(['id', 'lifecycle_stage'])
        .where('tenant_id', '=', user.tenant_id).where('container_number', '=', contNum).forUpdate().executeTakeFirst();
      if (!tc) throw Object.assign(new Error('Container not found'), { statusCode: 404 });
      if (tc.lifecycle_stage === stage) return { container_number: contNum, lifecycle_stage: stage };
      const previous = lifecycleStages.indexOf(tc.lifecycle_stage as any);
      if (lifecycleStages.indexOf(stage) !== previous + 1) throw Object.assign(new Error('Only the next lifecycle stage may be recorded'), { statusCode: 409 });
      await trx.updateTable('tracked_containers').set({ lifecycle_stage: stage, updated_at: new Date(), updated_by: user.sub })
        .where('id', '=', tc.id).where('tenant_id', '=', user.tenant_id).execute();
''' +s[b:]
# provenance, validation and public DTO
s=s.replace('const body = req.body as any;', 'const body = snapshotSchema.parse(req.body);',1)
s=s.replace('        created_by:       user.sub,', "        source: body.source, provider: body.provider ?? null, fetched_at: new Date(),\n        share_expires_at: new Date(Date.now() + 7 * 86400000),\n        created_by:       user.sub,",1)
s=s.replace("'eta', 'progress_pct'] as const", "'eta', 'progress_pct', 'source', 'provider'] as const")
s=s.replace('    if (patch.tracking_number)', "    if ('events' in body) patch.events = JSON.stringify(z.array(eventSchema).max(500).parse(body.events));\n    if ('source' in body) patch.source = z.enum(['live', 'manual']).parse(body.source);\n    if (body.source === 'live') patch.fetched_at = new Date();\n    if ('progress_pct' in body) z.number().min(0).max(100).parse(body.progress_pct);\n    if (patch.tracking_number)")
s=s.replace("    if (!snap) return reply.code(404)", "    if (!snap || snap.share_revoked || !snap.share_expires_at || new Date(snap.share_expires_at).getTime() <= Date.now()) return reply.code(404)")
s=s.replace('    return snap;\n', "    const { id, tenant_id, created_by, shipment_id, share_token, share_revoked, ...publicSnapshot } = snap;\n    return publicSnapshot;\n")
# share lifecycle
idx=s.index('  // DELETE /v1/tracker/snapshots/:id')
s=s[:idx]+'''  fastify.post('/snapshots/:id/share', async (req, reply) => {
    const { revoke } = z.object({ revoke: z.boolean().default(false) }).parse(req.body ?? {});
    const row = await withTenant(req.user.tenant_id, trx => trx.updateTable('tracking_snapshots')
      .set({ share_revoked: revoke, share_token: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''), share_expires_at: new Date(Date.now() + 7 * 86400000) })
      .where('tenant_id', '=', req.user.tenant_id).where('id', '=', z.string().uuid().parse((req.params as any).id)).returning(['share_token','share_expires_at','share_revoked']).executeTakeFirst());
    if (!row) return reply.code(404).send({ error: 'Snapshot not found' });
    return row;
  });

''' +s[idx:]
s="import { randomUUID } from 'node:crypto';\n"+s
idx=s.index('// ── Types')
s=s[:idx]+'''const eventSchema = z.object({ timestamp: z.string().max(100), location: z.string().max(500), description: z.string().max(4000), status_code: z.string().max(100).optional() });
const snapshotSchema = z.object({ tracking_type: z.enum(['AWB','BL']), tracking_number: z.string().trim().min(1).max(100), source: z.enum(['live','manual']), provider: z.enum(['ship24','shipsgo']).nullable().optional(), shipment_id: z.string().uuid().nullable().optional(), events: z.array(eventSchema).max(500).optional(), progress_pct: z.number().min(0).max(100).optional() }).passthrough();

''' +s[idx:]
p.write_text(s,encoding='utf-8')
Path('apps/api/src/services/tracker-integrity.ts').write_text('''import { z } from 'zod';
import { validateContainerNumber } from '@hudumika/types';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export const lifecycleStages = ['AVAILABLE_AT_DEPOT','DEPOT_ALLOCATED','GATE_IN_ORIGIN','VESSEL_LOADED','OCEAN_TRANSIT','PORT_DISCHARGED','CUSTOMS_RELEASE','GATE_OUT_PORT','ONLAND_TRANSIT','AT_CONSIGNEE','DEVANNED','EMPTY_RETURNED'] as const;
export async function requireTrackerAccess(req: FastifyRequest, reply: FastifyReply) {
  const reads = ['SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','SENIOR','JUNIOR','OFFICER','FINANCE','SALES'];
  const writes = ['SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','SENIOR','JUNIOR','OFFICER'];
  const read = req.method === 'GET' || req.method === 'HEAD' || req.routeOptions.url?.endsWith('/track') || req.routeOptions.url?.endsWith('/calculate');
  if (!(read ? reads : writes).includes(req.user.role)) return reply.code(403).send({ error: 'Operations permission required' });
}
export async function validateTrackerReferences(trx: Transaction<Database>, tenantId: string, body: any) {
  for (const [key, table] of [['customer_id','customers'],['shipment_id','shipment_cases'],['carrier_id','carriers'],['rate_card_id','freight_rate_cards']] as const) {
    if (body[key] == null || body[key] === '') continue;
    const id = z.string().uuid().parse(body[key]);
    const row = await trx.selectFrom(table).select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (!row) throw Object.assign(new Error(`Invalid ${key} for this workspace`), { statusCode: 400 });
  }
}
const obj = z.record(z.unknown());
export const containerWriteSchema = z.object({
  container_number: z.string().transform(s => s.trim().toUpperCase().replace(/\\s/g,'')).refine(s => validateContainerNumber(s).valid, 'Invalid ISO 6346 container number or check digit'),
  iso_code: z.string().max(30).optional(), size_type: z.string().max(200).optional(), ownership: z.string().max(100).optional(), condition: z.string().max(100).optional(),
  carrier: z.string().max(200).optional(), carrier_name: z.string().max(200).nullable().optional(), carrier_code: z.string().max(30).nullable().optional(), color_hex: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  lifecycle_stage: z.enum(lifecycleStages).optional(), customer_id: z.string().uuid().nullable().optional(), shipment_id: z.string().uuid().nullable().optional(),
  dimensions: obj.optional(), compliance: obj.optional(), current_depot: obj.optional(), classification: obj.optional(), cargo_breakdown: z.union([z.array(obj), obj]).optional(), notes: z.string().max(10000).nullable().optional(),
  tare_weight_kg: z.number().nonnegative().optional(), max_gross_weight_kg: z.number().nonnegative().optional(), payload_capacity_kg: z.number().nonnegative().optional(), cubic_capacity_cbm: z.number().nonnegative().optional(),
  floor_type: z.string().max(200).optional(), manufacture_year: z.number().int().min(0).max(2200).optional(), manufacturer: z.string().max(200).optional(), design_validity_years: z.number().nonnegative().optional(),
});
''',encoding='utf-8')
# add DB provenance columns
p=Path('apps/api/src/db/client.ts');s=p.read_text(encoding='utf-8');s=s.replace('export interface TrackingSnapshotsTable {','''export interface TrackingSnapshotsTable {
  source: Generated<string>;
  provider: Generated<string | null>;
  fetched_at: Generated<Date | null>;
  share_expires_at: Generated<Date | null>;
  share_revoked: Generated<boolean>;''');p.write_text(s,encoding='utf-8')
Path('apps/api/src/db/migrations/626_safetracker_provenance_and_sharing.sql').write_text('''ALTER TABLE tracking_snapshots
 ADD COLUMN source text NOT NULL DEFAULT 'unknown' CHECK (source IN ('unknown','live','manual','mock')),
 ADD COLUMN provider text,
 ADD COLUMN fetched_at timestamptz,
 ADD COLUMN share_expires_at timestamptz,
 ADD COLUMN share_revoked boolean NOT NULL DEFAULT false;
-- Existing shares have unknown provenance; require an explicit new share.
ALTER TABLE tracked_containers ALTER COLUMN condition SET DEFAULT 'UNKNOWN';
ALTER TABLE container_survey_reports ALTER COLUMN grade SET DEFAULT 'UNASSESSED';
''',encoding='utf-8')
