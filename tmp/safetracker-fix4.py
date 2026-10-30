from pathlib import Path
p=Path('apps/api/src/routes/tracker.routes.ts');s=p.read_text(encoding='utf-8')
# Preserve a consistent edit DTO; immutable lifecycle goes through dedicated transition route.
s=s.replace("      const patch: any = { updated_at: new Date(), updated_by: user.sub };\n      const allowed", "      const patch: any = { updated_at: new Date(), updated_by: user.sub };\n      if (body.lifecycle_stage !== undefined) throw Object.assign(new Error('Use the lifecycle transition action'), { statusCode: 400 });\n      if (body.carrier !== undefined) patch.carrier_name = body.carrier;\n      const weights = Object.fromEntries(['tare_weight_kg','max_gross_weight_kg','payload_capacity_kg','cubic_capacity_cbm','floor_type','manufacture_year','manufacturer','design_validity_years'].filter(k => k in body).map(k => [k,(body as any)[k]]));\n      if (Object.keys(weights).length) {\n        const specs = await trx.selectFrom('tracked_containers').select('dimensions').where('id','=',existing.id).where('tenant_id','=',user.tenant_id).executeTakeFirstOrThrow();\n        patch.dimensions = { ...specs.dimensions, ...(body.dimensions ?? {}), ...weights };\n      }\n      const allowed")
s=s.replace("if ((body as any)[k] !== undefined) patch[k]", "if (k === 'dimensions' && patch.dimensions) continue;\n        if ((body as any)[k] !== undefined) patch[k]")
# generic path schemas (no UUID -> database 500)
a=s.index("  fastify.addHook('preHandler', requireTrackerAccess);")+len("  fastify.addHook('preHandler', requireTrackerAccess);");s=s[:a]+"\n  fastify.addHook('preHandler', async req => { const params = req.params as any; if (params?.id) z.string().uuid().parse(params.id); });"+s[a:]
s=s.replace("const body = req.body as any;\n    const patch: Record<string, any>", "const body = snapshotSchema.partial().parse(req.body);\n    const patch: Record<string, any>")
s=s.replace("'status', 'current_location', 'eta',", "'status', 'status_code', 'current_location', 'eta',")
# persisted survey and repairs, matching existing tables
idx=s.index('  // GET /v1/tracker/containers — List')
s=s[:idx]+'''  fastify.post('/containers/:number/surveys', async (req, reply) => {
    const body = z.object({ grade: z.string().trim().min(1).max(100), rating_label: z.string().max(200).nullable().optional(), survey_date: z.string().date(), surveyor_name: z.string().trim().min(1).max(200), surveyor_notes: z.string().trim().min(1).max(10000), photos: z.array(z.string().url().refine(v => /^https?:/.test(v))).max(30).default([]) }).parse(req.body);
    return withTenant(req.user.tenant_id, async trx => {
      const tc = await trx.selectFrom('tracked_containers').select('id').where('tenant_id','=',req.user.tenant_id).where('container_number','=',(req.params as any).number).executeTakeFirst();
      if (!tc) return reply.code(404).send({ error: 'Container not found' });
      const row = await trx.insertInto('container_survey_reports').values({ ...body, survey_date: new Date(body.survey_date), photos: JSON.stringify(body.photos) as any, tenant_id: req.user.tenant_id, container_id: tc.id }).returningAll().executeTakeFirstOrThrow();
      return reply.code(201).send(row);
    });
  });
  fastify.post('/containers/:number/repairs', async (req, reply) => {
    const body = z.object({ description: z.string().trim().min(1).max(4000), repair_type: z.enum(['cosmetic','paint','scratch','weld','seal','floor']), repair_date: z.string().datetime().optional() }).parse(req.body);
    return withTenant(req.user.tenant_id, async trx => {
      const tc = await trx.selectFrom('tracked_containers').select('id').where('tenant_id','=',req.user.tenant_id).where('container_number','=',(req.params as any).number).executeTakeFirst();
      if (!tc) return reply.code(404).send({ error: 'Container not found' });
      const row = await trx.insertInto('container_repairs').values({ ...body, repair_date: body.repair_date ? new Date(body.repair_date) : new Date(), tenant_id: req.user.tenant_id, container_id: tc.id }).returningAll().executeTakeFirstOrThrow();
      return reply.code(201).send(row);
    });
  });
  fastify.patch('/containers/:number/repairs/:id', async (req, reply) => {
    const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
    return withTenant(req.user.tenant_id, async trx => {
      const tc = await trx.selectFrom('tracked_containers').select('id').where('tenant_id','=',req.user.tenant_id).where('container_number','=',(req.params as any).number).executeTakeFirst();
      if (!tc) return reply.code(404).send({ error: 'Container not found' });
      const row = await trx.updateTable('container_repairs').set({ resolved, resolved_at: resolved ? new Date() : null }).where('tenant_id','=',req.user.tenant_id).where('container_id','=',tc.id).where('id','=',(req.params as any).id).returningAll().executeTakeFirst();
      if (!row) return reply.code(404).send({ error: 'Repair not found' });
      return row;
    });
  });

''' +s[idx:]
p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/ContainerDetailPage.tsx');s=p.read_text(encoding='utf-8').replace("export type LifecycleStage =", "export type LifecycleStage =\n  | 'AVAILABLE_AT_DEPOT'");s=s.replace("const [currentStage, setCurrentStage] = useState<LifecycleStage>('GATE_OUT_PORT')", "const [currentStage, setCurrentStage] = useState<LifecycleStage>('AVAILABLE_AT_DEPOT')");s=s.replace("  if (!rawStage) return 'GATE_OUT_PORT';", "  if (!rawStage || rawStage === 'AVAILABLE_AT_DEPOT') return 'AVAILABLE_AT_DEPOT';");s=s.replace("  return 'GATE_OUT_PORT';\n}", "  return 'AVAILABLE_AT_DEPOT';\n}");s=s.replace('const currentStageIndex = Math.max(0, LIFECYCLE_STAGES.findIndex((stage) => stage.key === currentStage));', 'const currentStageIndex = LIFECYCLE_STAGES.findIndex((stage) => stage.key === currentStage);');p.write_text(s,encoding='utf-8')
