import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export async function readFleetDocuments(trx: Transaction<Database>, tenantId: string, vehicleId?: string) {
  let query = trx.selectFrom('vehicle_documents as d')
    .leftJoin('comply_certificates as c', join => join.onRef('c.id', '=', 'd.comply_certificate_id').on('c.tenant_id', '=', tenantId))
    .selectAll('d').select(['c.cert_number as source_number', 'c.issued_date as source_issued', 'c.expiry_date as source_expiry', 'c.status as source_status', 'c.document_url as source_file'])
    .where('d.tenant_id', '=', tenantId);
  if (vehicleId) query = query.where('d.vehicle_id', '=', vehicleId);
  const rows = await query.execute();
  return rows.map(row => ({ ...row, ...(row.comply_certificate_id ? { doc_number: row.source_number, issued_date: row.source_issued, expiry_date: row.source_expiry, file_url: row.source_file || row.file_url } : {}) }))
    .sort((a, b) => (a.expiry_date ? +new Date(a.expiry_date) : Infinity) - (b.expiry_date ? +new Date(b.expiry_date) : Infinity));
}
