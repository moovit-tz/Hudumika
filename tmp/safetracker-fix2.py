from pathlib import Path
p=Path('apps/api/src/services/freightBooking.service.ts');s=p.read_text(encoding='utf-8');s="import { sql } from 'kysely';\nimport { randomUUID } from 'node:crypto';\nimport { validateTrackerReferences } from './tracker-integrity.js';\n"+s
# Validate all foreign refs within transaction, including service callers.
for name,ref in [('createBooking','customer_id'),('createRateCard','carrier_id'),('createRateContract','carrier_id'),('quoteBooking','carrier_id')]:
 a=s.index('    return withTenant(tenantId, async (trx) => {',s.index('  async '+name));a+=len('    return withTenant(tenantId, async (trx) => {');s=s[:a]+"\n      await validateTrackerReferences(trx, tenantId, data);"+s[a:]
a=s.index('      const count = await trx',s.index('  async createBooking'));b=s.index("\n      return trx.insertInto('freight_bookings')",a)
s=s[:a]+'''      // A durable tenant/year counter is seeded from existing numbers under the same lock.
      const year = new Date().getUTCFullYear();
      await sql`select pg_advisory_xact_lock(hashtextextended(${`freight-number:${tenantId}:${year}`},0))`.execute(trx);
      const existing = await trx.selectFrom('freight_bookings').select('booking_number').where('tenant_id','=',tenantId).where('booking_number','like',`FB-${year}-%`).execute();
      const highest = existing.reduce((n,r) => Math.max(n, Number(r.booking_number.split('-').pop()) || 0),0);
      const counter = await trx.insertInto('freight_booking_sequences').values({ tenant_id: tenantId, year, last_number: highest + 1 })
        .onConflict(oc => oc.columns(['tenant_id','year']).doUpdateSet({ last_number: sql<number>`greatest(freight_booking_sequences.last_number, ${highest}) + 1` }))
        .returning('last_number').executeTakeFirstOrThrow();
      const bookingNumber = `FB-${year}-${String(counter.last_number).padStart(4,'0')}`;
''' +s[b:]
s=s.replace(".selectAll().executeTakeFirstOrThrow();\n      if (booking.status", ".selectAll().forUpdate().executeTakeFirstOrThrow();\n      if (booking.status")
s=s.replace("      if (booking.status !== 'RATE_QUOTED')", "      if (booking.status === 'CONFIRMED' && booking.converted_shipment_id) {\n        const shipment = await trx.selectFrom('shipment_cases').selectAll().where('id','=',booking.converted_shipment_id).where('tenant_id','=',tenantId).executeTakeFirstOrThrow();\n        return { booking, shipment };\n      }\n      if (booking.status !== 'RATE_QUOTED')")
s=s.replace(".where('id', '=', bookingId)\n", ".where('id', '=', bookingId).where('tenant_id', '=', tenantId)\n")
s=s.replace(".where('id', '=', booking.carrier_id).executeTakeFirst()", ".where('id', '=', booking.carrier_id).where('tenant_id','=',tenantId).executeTakeFirst()")
a=s.index('      const count = await trx',s.index('  async confirmBooking'));b=s.index('\n      const shipmentType',a)
s=s[:a]+"      const refNumber = `CLR-${new Date().getUTCFullYear()}-${randomUUID()}`;\n"+s[b:]
s=s.replace(".orderBy('carrier_rate_contracts.buy_rate', 'asc')", ".orderBy('carrier_rate_contracts.currency', 'asc').orderBy('carrier_rate_contracts.buy_rate', 'asc')")
p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/routes/freight-booking.routes.ts');s=p.read_text(encoding='utf-8');s="import { requireTrackerAccess } from '../services/tracker-integrity.js';\n"+s;a=s.index("  fastify.addHook('preHandler', async (request: any, reply)");b=s.index('\n\n',a);s=s[:a]+"  fastify.addHook('preHandler', requireTrackerAccess);"+s[b:];p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/db/client.ts');s=p.read_text(encoding='utf-8').replace('  tracking_snapshots: TrackingSnapshotsTable;', '  freight_booking_sequences: { tenant_id: string; year: number; last_number: number };\n  tracking_snapshots: TrackingSnapshotsTable;');p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/db/migrations/626_safetracker_provenance_and_sharing.sql');s=p.read_text();s+='''
CREATE TABLE freight_booking_sequences (
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 year integer NOT NULL, last_number integer NOT NULL,
 PRIMARY KEY(tenant_id,year)
);
ALTER TABLE freight_booking_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_booking_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON freight_booking_sequences USING (tenant_id = current_setting('app.tenant_id',true)::uuid);
CREATE UNIQUE INDEX freight_bookings_number_unique ON freight_bookings(tenant_id,booking_number);
''';p.write_text(s,encoding='utf-8')
# Frontend remove synthetic seed data from every operational getContainerDetails consumer.
p=Path('apps/web/src/components/container/containerData.ts');s=p.read_text(encoding='utf-8');a=s.index('/**\n * Look up or dynamically');s=s[:a]+'''/** Empty display shape only: operational facts must come from persisted/provider evidence. */
export function getContainerDetails(containerNumber: string, overrides?: Partial<ContainerDetails>): ContainerDetails {
  return {
    container_number: containerNumber.trim().toUpperCase().replace(/\\s/g,''),
    iso_code: '', size_type: 'Not recorded', ownership: '' as any, condition: 'UNKNOWN' as any, status: 'UNKNOWN' as any,
    max_gross_weight_kg: 0, tare_weight_kg: 0, payload_capacity_kg: 0, cubic_capacity_cbm: 0,
    floor_type: '', manufacture_year: 0, manufacturer: '', design_validity_years: 0,
    dimensions: { height_m: 0, width_m: 0, length_m: 0 },
    current_depot: { name: '', code: '', date: '', state: '' as any },
    classification: { category: '', cargo_types: [], certifications: [] },
    survey_report: { grade: '', rating_label: '', last_survey_date: '', surveyor_notes: '', photos: [], repairs: [] },
    compliance: { csc_cert_date: '', csc_expiry_date: '', acep_ccep: '', customs_seal_no: '' },
    voyage: { pol_city: '', pol_country: '', pod_city: '', pod_country: '', voyage_no: '', vessel_name: '', etd: '', eta: '', current_location: '' },
    customer: { name: '', role: 'Consignee', email: '', phone: '' }, cargo_breakdown: [], timeline: [],
    ...overrides,
  };
}
''';p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/RecordContainerPage.tsx');s=p.read_text(encoding='utf-8');a=s.index('  const [formData, setFormData]');b=s.index('\n  const [validationError',a);s=s[:a]+"  const [formData, setFormData] = useState<ContainerDetails>(() => getContainerDetails(''));\n"+s[b:];s=s.replace('.catch(() => setFormData(getContainerDetails(number)))', ".catch((error) => setValidationError(error.message || 'Could not load container'))");p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/ContainerDetailPage.tsx');s=p.read_text(encoding='utf-8');a=s.index('          setStageHistory([',s.index('// Use real stage history'));b=s.index('\n        }',a);s=s[:a]+'          setStageHistory([]);'+s[b:];s=s.replace('setContainer(getContainerDetails(number) as any);','setContainer(null);');a=s.index('    setCurrentStage(nextStage);',s.index('const handleAdvanceStage'));b=s.index('\n    try {',a);s=s[:a]+s[b:];s=s.replace('''    } catch {
      // Local state already updated
    }
    showAlert''','''      await loadContainer();
    } catch (error: any) {
      showAlert(error.message || 'Lifecycle update failed');
      return;
    }
    showAlert''');s=s.replace('    setCustomColorHex(colorHex);\n','');s=s.replace('''    } catch {
      // ignore
    }''','''      setCustomColorHex(colorHex);
    } catch (error: any) {
      showAlert(error.message || 'Could not save colour');
    }''');s=s.replace('    setLinkedCustomerId(customerId);\n    setLinkedCustomerName(customerName);\n','').replace('    setLinkedShipmentId(shipmentId);\n','');s=s.replace("body: JSON.stringify({ customer_id: customerId }),\n      });", "body: JSON.stringify({ customer_id: customerId }),\n      });\n      setLinkedCustomerId(customerId); setLinkedCustomerName(customerName);");s=s.replace("body: JSON.stringify({ shipment_id: shipmentId }),\n      });", "body: JSON.stringify({ shipment_id: shipmentId }),\n      });\n      setLinkedShipmentId(shipmentId);");a=s.index('    showAlert(`Polling carrier');b=s.index('\n  };',a);s=s[:a]+'    await loadContainer();'+s[b:];s=s.replace('API Sync','Reload record');p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/Tracker.tsx');s=p.read_text(encoding='utf-8');s=s.replace("r.voyage_number || 'VOY-2026/09'", "r.voyage_number || ''").replace("result?.voyage_number || 'VOY-2026/09'", "result?.voyage_number || ''");s=s.replace("r.vessel_name || `${r.carrier?.split(' ')[0] || 'Vessel'} INTEGRITY`", "r.vessel_name || ''").replace("result?.vessel_name || `${result?.carrier?.split(' ')[0] || 'Vessel'} INTEGRITY`", "result?.vessel_name || ''");import re
s=re.sub(r"etd: r.eta \? new Date\(Date.now\(\) - 12 \* 86_400_000\).+? : '',", "etd: '',",s)
a=s.index('          current_depot: {',s.index('const voyageOverride'));b=s.index('\n          },',a)+len('\n          },');s=s[:a]+s[b:]
s=s.replace('body: JSON.stringify({ status: r.status, current_location: r.current_location, eta: r.eta, progress_pct: r.progress_pct })', 'body: JSON.stringify({ status: r.status, status_code: r.status_code, current_location: r.current_location, eta: r.eta, progress_pct: r.progress_pct, events: r.events, source: r.source, provider: r.provider })')
p.write_text(s,encoding='utf-8')
