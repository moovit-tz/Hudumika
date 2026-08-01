import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';

// Logs a new case assignment against the assigned officer's own HR activity
// feed (hr_activity_log — the same table/shape hr.routes.ts's own
// logActivity helper writes to and GET /activity-log already reads back),
// so a staff member's real workload is visible from HRM without HRM having
// to know anything about ClearOS's shipment model.
registerSubscriber('shipment.case_opened', async (tenantId, event) => {
  const assignedTo = event.payload.assignedTo as string | null | undefined;
  if (!assignedTo) return;
  // Stood down when this tenant has activated the Studio workflow that
  // replaces this handler (migration 165) — otherwise both would run.
  if (await isSupersededByStudio(tenantId, 'hrm.case_opened')) return;

  await withTenant(tenantId, async (trx) => {
    await trx.insertInto('hr_activity_log').values({
      tenant_id: tenantId,
      user_id: assignedTo,
      action: `Assigned to shipment case ${event.payload.refNumber ?? event.entityId}`,
      module: 'ClearOS',
    }).execute();
  });
});
