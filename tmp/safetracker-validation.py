from pathlib import Path
p=Path('apps/api/src/services/demurrage.service.ts');s=p.read_text(encoding='utf-8')
# Require full schema on creates and calculator; route patch IDs are validated separately.
s=s.replace('      validateInput(data);\n      await validateTrackerReferences(trx, tenantId, data);\n      return trx\n        .insertInto(\'demurrage_tariffs\')', "      z.object({ carrier_name: z.string().trim().min(1).max(200), container_size: z.string().trim().min(1).max(30), free_days: freeDaysSchema, rate_tiers: tiersSchema }).parse(data);\n      validateInput(data);\n      await validateTrackerReferences(trx, tenantId, data);\n      return trx\n        .insertInto('demurrage_tariffs')")
s=s.replace('      const now = new Date();', "      z.object({ shipment_id: z.string().uuid(), container_number: z.string().min(1).max(30), container_size: z.string().min(1).max(30) }).parse(data);\n      const now = new Date();",1)
s=s.replace('      const endDate = data.return_date', "      z.object({ carrier_name: z.string().min(1).max(200), container_size: z.string().min(1).max(30), discharge_date: validDate, free_days: freeDaysSchema }).parse(data);\n      const endDate = data.return_date")
# Date-only validation rejects rolled-over dates.
s=s.replace("Number.isFinite(Date.parse(v))", "Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v.slice(0,10)")
# In absence of a tariff, never save a zero-cost charge as if priced.
a=s.index('  async addContainer');b=s.index('  async markReturned');t=s[a:b];t=t.replace('      let currency = \'USD\';', "      let currency = 'USD';\n      let tariffFound = false;")
t=t.replace('            currency = tariff.currency;', '            currency = tariff.currency; tariffFound = true;')
t=t.replace("      return trx\n        .insertInto('container_tracking')", "      if (demurrageDays > 0 && !tariffFound) throw Object.assign(new Error('No applicable tariff; configure a tariff effective on the discharge date before recording charges'), { statusCode: 400 });\n      return trx\n        .insertInto('container_tracking')")
s=s[:a]+t+s[b:]
# Always select tariff even inside free period so currency is known.
s=s.replace('if (demurrageDays > 0 && data.carrier_name)', 'if (data.carrier_name)').replace('if (demurrageDays > 0 && container.carrier_name)', 'if (container.carrier_name)').replace('if (demurrageDays > 0 && carrier)', 'if (carrier)')
s=s.replace(".selectAll()\n        .executeTakeFirstOrThrow();\n\n      if (!container.discharge_date)", ".selectAll().forUpdate()\n        .executeTakeFirstOrThrow();\n\n      if (!container.discharge_date)")
s=s.replace(".selectAll()\n        .executeTakeFirstOrThrow();\n\n      if ('liable_party'", ".selectAll().forUpdate()\n        .executeTakeFirstOrThrow();\n\n      if ('liable_party'")
p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/routes/demurrage.routes.ts');s=p.read_text(encoding='utf-8');s="import { z } from 'zod';\n"+s;a=s.index("  app.addHook('preHandler', requireTrackerAccess);")+len("  app.addHook('preHandler', requireTrackerAccess);");s=s[:a]+"\n  app.addHook('preHandler', async req => { for (const id of Object.values(req.params as Record<string,string>)) z.string().uuid().parse(id); if (req.method === 'POST' || req.method === 'PATCH') z.record(z.unknown()).parse(req.body); });"+s[a:];p.write_text(s,encoding='utf-8')
# Analytics must state what it actually measures; current metric is ETA stability, not arrival performance.
p=Path('apps/web/src/pages/CargoDashboard.tsx');s=p.read_text(encoding='utf-8').replace("header: 'On-time'", "header: 'ETA unchanged/earlier'").replace('carrier reliability','carrier ETA changes').replace('Carrier Reliability','Carrier ETA Changes').replace('reliability by carrier','ETA changes by carrier');s=s.replace('formatCurrency(v.cost)', "`${v.cost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`").replace('formatCurrency(m.cost)', "`${m.cost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`");p.write_text(s,encoding='utf-8')
