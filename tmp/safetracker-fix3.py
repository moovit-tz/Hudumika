from pathlib import Path
p=Path('apps/api/src/services/demurrage.service.ts');s=p.read_text(encoding='utf-8');s="import { z } from 'zod';\nimport { validateTrackerReferences } from './tracker-integrity.js';\n"+s
# validation is applied to direct service callers as well as routes
idx=s.index('interface RateTier');s=s[:idx]+'''const validDate = z.string().refine(v => /^\\d{4}-\\d{2}-\\d{2}/.test(v) && Number.isFinite(Date.parse(v)), 'Invalid date');
const freeDaysSchema = z.number().int().min(0).max(3650);
const tiersSchema = z.array(z.object({ from_day: z.number().int().min(1), to_day: z.number().int().min(1), daily_rate: z.number().finite().min(0) })).min(1).max(100).superRefine((tiers, ctx) => {
  let next = 1;
  for (const tier of [...tiers].sort((a,b) => a.from_day-b.from_day)) {
    if (tier.from_day !== next || tier.to_day < tier.from_day) ctx.addIssue({ code: 'custom', message: 'Tiers must cover consecutive days starting at 1 without gaps or overlaps' });
    next = tier.to_day + 1;
  }
});
function validateInput(data: any) {
  if ('free_days' in data) freeDaysSchema.parse(data.free_days);
  for (const k of ['discharge_date','return_date','effective_from']) if (data[k] != null) validDate.parse(data[k]);
  if (data.currency !== undefined) z.string().regex(/^[A-Z]{3}$/).parse(data.currency);
  if ('rate_tiers' in data) tiersSchema.parse(data.rate_tiers);
}
''' +s[idx:]
s=s.replace('  const diffMs = end.getTime() - start.getTime();\n  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));', '''  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) throw Object.assign(new Error('End date must be on or after discharge date'), { statusCode: 400 });
  // Tariffs use UTC calendar dates; partial elapsed days are not extra chargeable days.
  return Math.floor((Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate()) - Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate())) / 86400000);''')
for name in ['createTariff','updateTariff','addContainer','updateContainer','quickCalculate']:
 a=s.index('    return withTenant(tenantId, async (trx) => {',s.index('  async '+name));a+=len('    return withTenant(tenantId, async (trx) => {');s=s[:a]+"\n      validateInput(data);\n      await validateTrackerReferences(trx, tenantId, data);"+s[a:]
s=s.replace('const freeDays = data.free_days || 7;', 'const freeDays = data.free_days ?? 7;\n      let currency = \'USD\';')
# each tariff uses discharge-date version, deterministically latest applicable
positions=[('async addContainer','new Date(data.discharge_date!)'),('async markReturned','new Date(container.discharge_date!)'),('async updateContainer','new Date(dischargeDate!)'),('async quickCalculate','new Date(data.discharge_date)')]
for name,date in positions:
 a=s.index(".where('active', '=', true)",s.index(name));b=a+len(".where('active', '=', true)");s=s[:b]+f"\n            .where('effective_from', '<=', {date})\n            .orderBy('effective_from','desc').orderBy('created_at','desc')"+s[b:]
s=s.replace('            demurrageCost = calculateDemurrageCost(demurrageDays, tiers);','            demurrageCost = calculateDemurrageCost(demurrageDays, tiers);\n            currency = tariff.currency;',1)
s=s.replace("demurrage_currency: 'USD',", "demurrage_currency: currency,")
s=s.replace('      const returnDt = new Date(returnDate);', "      validDate.parse(returnDate);\n      const returnDt = new Date(returnDate);")
s=s.replace('      let demurrageCost = 0;\n      if (demurrageDays > 0 && container.carrier_name)', "      let demurrageCost = 0;\n      let currency = container.demurrage_currency;\n      if (demurrageDays > 0 && container.carrier_name)")
a=s.index('  async markReturned');b=s.index('  async updateContainer');t=s[a:b].replace('demurrageCost = calculateDemurrageCost(demurrageDays, tiers);','demurrageCost = calculateDemurrageCost(demurrageDays, tiers);\n          currency = tariff.currency;').replace('demurrage_cost: demurrageCost,','demurrage_cost: demurrageCost,\n          demurrage_currency: currency,');s=s[:a]+t+s[b:]
# freeze all financially meaningful mutations after posting, not just waiver
s=s.replace("if ('liable_party' in data || 'liability_reason' in data || ('status' in data && data.status === 'WAIVED'))", 'if (Object.keys(data).length > 0)')
a=s.index('  async updateContainer');b=s.index('  async deleteContainer');t=s[a:b].replace('demurrageCost = calculateDemurrageCost(demurrageDays, tiers);','demurrageCost = calculateDemurrageCost(demurrageDays, tiers);\n            patch.demurrage_currency = tariff.currency;');s=s[:a]+t+s[b:]
# reject settling/deleting posted charge
for name in ['markReturned','deleteContainer']:
 a=s.index('    return withTenant(tenantId, async (trx) => {',s.index('  async '+name));a+=len('    return withTenant(tenantId, async (trx) => {');s=s[:a]+'''\n      const posted = await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenantId).where('source_module','=','EXPENSE').where('source_id','=',containerId).where('status','<>','VOIDED').executeTakeFirst();
      if (posted) throw Object.assign(new Error('Charge already posted; void the journal before changing it'), { statusCode: 409 });
''' +s[a:]
# group currencies instead of silently adding incompatible amounts
s=s.replace('const totalCost = containers.reduce', 'const currencies = [...new Set(containers.map(c => c.demurrage_currency))];\n      const totalCost = containers.reduce')
s=s.replace('total_demurrage_cost: totalCost,','total_demurrage_cost: currencies.length <= 1 ? totalCost : null,\n        currency: currencies.length === 1 ? currencies[0] : null,\n        by_currency: Object.fromEntries(currencies.map(currency => [currency, containers.filter(c => c.demurrage_currency === currency).reduce((n,c) => n + Number(c.demurrage_cost),0)])),')
s=s.replace('active_demurrage_cost: activeCost,','active_demurrage_cost: currencies.length <= 1 ? activeCost : null,')
s=s.replace("const carrier = c.carrier_name || 'Unknown';", "const carrier = `${c.carrier_name || 'Unknown'} (${c.demurrage_currency})`;")
p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/routes/demurrage.routes.ts');s=p.read_text(encoding='utf-8');s="import { requireTrackerAccess } from '../services/tracker-integrity.js';\n"+s;a=s.index("  app.addHook('preHandler', async (req: any, reply: any)");b=s.index('\n\n',a);s=s[:a]+"  app.addHook('preHandler', requireTrackerAccess);"+s[b:];s=s.replace("'SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER'", "'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'");p.write_text(s,encoding='utf-8')
# Analytics only uses provable live data; registry counts not demurrage records
p=Path('apps/api/src/services/cargoAnalytics.service.ts');s=p.read_text(encoding='utf-8');s=s.replace("selectFrom('tracking_snapshots')\n        .where('tenant_id', '=', tenantId)", "selectFrom('tracking_snapshots')\n        .where('tenant_id', '=', tenantId).where('source','=','live')");s=s.replace("selectFrom('container_tracking')", "selectFrom('tracked_containers')").replace(".select(['status'])", ".select(['id'])");p.write_text(s,encoding='utf-8')
# Print data sanitization using one escaped-data boundary for both existing templates.
Path('apps/web/src/lib/print-data.ts').write_text('''export function escapePrintData<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)) as T;
  if (Array.isArray(value)) return value.map(escapePrintData) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,escapePrintData(v)])) as T;
  return value;
}
export function safePrintImage(value: string): string {
  try { const url = new URL(value, window.location.origin); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
''',encoding='utf-8')
p=Path('apps/web/src/pages/Tracker.tsx');s=p.read_text(encoding='utf-8');s="import { escapePrintData, safePrintImage } from '../lib/print-data.js';\n"+s;s=s.replace('  const co  = getCompany();','  result = escapePrintData(result);\n  const company = getCompany();\n  const co = escapePrintData({ ...company, logoUrl: safePrintImage(company.logoUrl || \'\') });');p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/components/container/ContainerTrackerCard.tsx');s=p.read_text(encoding='utf-8');s="import { escapePrintData } from '../../lib/print-data.js';\nimport { apiFetch } from '../../lib/api.js';\nimport { showAlert } from '../../lib/dialogs.js';\n"+s
# dialogs import path will be verified by typecheck
s=s.replace("const statusLabel = (container.status ?? 'AVAILABLE')", "const statusLabel = (container.status || 'UNKNOWN')").replace("const conditionLabel = (container.condition ?? 'GOOD')", "const conditionLabel = (container.condition || 'UNKNOWN')")
a=s.index('  const toggleRepair');b=s.index('  const handlePrintSurveyReport',a)
s=s[:a]+'''  const toggleRepair = async (id: string) => {
    const repair = repairs.find(r => r.id === id);
    if (!repair) return;
    try {
      await apiFetch(`/v1/tracker/containers/${container.container_number}/repairs/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved: !repair.completed }) });
      setRepairs(prev => prev.map(r => r.id === id ? { ...r, completed: !r.completed } : r));
    } catch (error: any) { showAlert(error.message || 'Could not save repair'); }
  };

''' +s[b:]
s=s.replace("  const handlePrintSurveyReport = () => {", "  const handlePrintSurveyReport = () => {\n    if (!container.survey_report?.last_survey_date || !container.survey_report?.grade) { showAlert('Record a survey before printing a report'); return; }\n    const printable = escapePrintData(container);")
a=s.index('    const html = `');b=s.index('    w.document.write',a);t=s[a:b].replace('container.','printable.').replace('ClearOS · Hudumika','Safetracker · Hudumika').replace('Hudumika ClearOS Container Report','Hudumika Safetracker Container Report').replace("'Grade A'", "'Unassessed'").replace("'Cargo Worthy'", "'Not assessed'").replace('Container inspected and certified in compliance with ISO 1496 and CSC safety regulations.','No survey notes recorded.').replace('ISO Container Inspection &amp; Survey Certificate','Recorded Container Survey Report').replace('Official Digital Record','Recorded survey information');s=s[:a]+t+s[b:]
s=s.replace("|| 'Cargo Worthy'", "|| 'Not assessed'").replace("|| 'Grade A'", "|| 'Unassessed'");p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/Demurrage.tsx');s=p.read_text(encoding='utf-8');s=s.replace('  total_demurrage_cost: number;', '  total_demurrage_cost: number | null;\n  currency?: string;\n  by_currency?: Record<string, number>;');s=s.replace("String(Math.floor((summary?.active_containers || 0) * 0.4))", "'—'").replace("'2.4 avg'", "'—'");s=s.replace('value: formatCurrency(summary?.total_demurrage_cost || 0),', "value: summary?.total_demurrage_cost === null ? 'Multiple currencies' : formatCurrency(summary?.total_demurrage_cost || 0, summary?.currency),");s=s.replace("sub1Label: 'THIS MONTH', sub1Value: formatCurrency((summary?.total_demurrage_cost || 0) * 0.35)", "sub1Label: 'CURRENCIES', sub1Value: Object.keys(summary?.by_currency || {}).join(', ') || '—'");s=s.replace('JSON.parse(t.rate_tiers)', "(typeof t.rate_tiers === 'string' ? JSON.parse(t.rate_tiers) : t.rate_tiers)");p.write_text(s,encoding='utf-8')
