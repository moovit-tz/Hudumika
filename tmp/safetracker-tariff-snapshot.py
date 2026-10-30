from pathlib import Path
p=Path('apps/api/src/services/demurrage.service.ts');s=p.read_text(encoding='utf-8');s=s.replace("import { db, withTenant }", "import { withTenant }")
# Freeze tariff evidence at first calculation. Updates to published tariffs cannot rewrite a charge.
a=s.index('      let currency = \'USD\';');s=s[:a]+s[a:].replace("      let currency = 'USD';", "      let currency = 'USD';\n      let tariffSnapshot: Record<string, unknown> | null = null;",1);s=s.replace('currency = tariff.currency; tariffFound = true;', 'currency = tariff.currency; tariffFound = true;\n            tariffSnapshot = { id: tariff.id, currency: tariff.currency, rate_tiers: tiers, effective_from: tariff.effective_from };');s=s.replace('demurrage_currency: currency,\n          status:', 'demurrage_currency: currency,\n          tariff_snapshot: tariffSnapshot,\n          status:',1)
# Returning uses frozen rates if present, otherwise a scoped/effective legacy lookup.
a=s.index('  async markReturned');b=s.index('  async updateContainer');t=s[a:b];t=t.replace('const tariff = await trx', 'const tariff = container.tariff_snapshot ?? await trx');t=t.replace("(typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers) as RateTier[]", "tiersSchema.parse(typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers)");t=t.replace('currency = tariff.currency;', 'currency = String(tariff.currency);');t=t.replace('      let currency = container.demurrage_currency;', '      let currency = container.demurrage_currency;\n      let tariffFound = false;');t=t.replace('currency = String(tariff.currency);','currency = String(tariff.currency); tariffFound = true;');t=t.replace("      return trx\n        .updateTable('container_tracking')", "      if (demurrageDays > 0 && !tariffFound) throw Object.assign(new Error('No applicable tariff for this charge'), { statusCode: 400 });\n      return trx\n        .updateTable('container_tracking')");s=s[:a]+t+s[b:]
# Editing a billed/settled record is not allowed; active edits refresh the tariff snapshot explicitly.
a=s.index('  async updateContainer');b=s.index('  async deleteContainer');t=s[a:b].replace("      const patch: Record<string, any>", "      if (existing.status !== 'ACTIVE' && Object.keys(data).some(k => !['notes','liable_party','liability_reason'].includes(k))) throw Object.assign(new Error('Settled charges cannot be recalculated here'), { statusCode: 409 });\n      const patch: Record<string, any>");t=t.replace('const tariff = await trx', "const tariff = (!('carrier_name' in data) && !('container_size' in data) && !('discharge_date' in data) ? existing.tariff_snapshot : null) ?? await trx");t=t.replace('patch.demurrage_currency = tariff.currency;', "patch.demurrage_currency = String(tariff.currency);\n            patch.tariff_snapshot = { id: tariff.id, currency: tariff.currency, rate_tiers: tiers, effective_from: tariff.effective_from };");s=s[:a]+t+s[b:]
# List refreshes active unposted amounts using their frozen tariff. Posting service also calls this.
idx=s.index('  // ── Tariff CRUD');s=s[:idx]+'''  async refreshCharges(tenantId: string) {
    await withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('container_tracking').selectAll().where('tenant_id','=',tenantId).where('status','=','ACTIVE').forUpdate().execute();
      const posted = await trx.selectFrom('journal_entries').select('source_id').where('tenant_id','=',tenantId).where('source_module','=','EXPENSE').where('status','<>','VOIDED').execute();
      const frozen = new Set(posted.map(r => r.source_id));
      for (const row of rows) {
        if (!row.discharge_date || frozen.has(row.id)) continue;
        const total = daysBetween(new Date(row.discharge_date), new Date());
        const days = Math.max(0,total-row.free_days);
        const tariff = row.tariff_snapshot ?? (row.carrier_name ? await trx.selectFrom('demurrage_tariffs').selectAll().where('tenant_id','=',tenantId).where('carrier_name','=',row.carrier_name).where('container_size','=',row.container_size).where('active','=',true).where('effective_from','<=',new Date(row.discharge_date)).orderBy('effective_from','desc').orderBy('created_at','desc').executeTakeFirst() : null);
        if (!tariff) continue;
        const tiers = tiersSchema.parse(typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers);
        await trx.updateTable('container_tracking').set({ total_days: total, demurrage_days: days, demurrage_cost: calculateDemurrageCost(days,tiers), demurrage_currency: String(tariff.currency), tariff_snapshot: { id: tariff.id, currency: tariff.currency, rate_tiers: tiers, effective_from: tariff.effective_from }, updated_at: new Date() }).where('tenant_id','=',tenantId).where('id','=',row.id).execute();
      }
    });
  },
''' +s[idx:]
# list and summary refresh persisted accruals; this may also be scheduled by the host.
for name in ['listContainers','getSummary']:
 a=s.index('    return withTenant(tenantId, async (trx) => {',s.index('  async '+name));s=s[:a]+'    await this.refreshCharges(tenantId);\n'+s[a:]
p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/db/client.ts');s=p.read_text(encoding='utf-8').replace('export interface ContainerTrackingTable {', 'export interface ContainerTrackingTable {\n  tariff_snapshot: Generated<Record<string, unknown> | null>;');p.write_text(s,encoding='utf-8')
Path('apps/api/src/db/migrations/627_safetracker_charge_tariff_snapshot.sql').write_text("ALTER TABLE container_tracking ADD COLUMN tariff_snapshot jsonb;\n",encoding='utf-8')
