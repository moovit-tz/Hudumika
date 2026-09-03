import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';

/**
 * Turns a tenant's onboarding/offboarding template (hr-checklists.routes.ts)
 * into a real per-person checklist the moment someone actually joins or is
 * deactivated — reacting to the same user.joined / hr.staff_deactivated
 * events Ondi's joiner/leaver automation already listens for (see
 * ondi.subscribers.ts), not a new trigger. A tenant with no template
 * configured for that type gets no checklist — never a fabricated default
 * list of tasks nobody asked for.
 */
async function createChecklistFromTemplate(tenantId: string, employeeId: string, type: 'onboarding' | 'offboarding') {
  await withTenant(tenantId, async (trx) => {
    const template = await trx.selectFrom('hr_checklist_templates').select('id')
      .where('tenant_id', '=', tenantId).where('type', '=', type).executeTakeFirst();
    if (!template) return;

    const items = await trx.selectFrom('hr_checklist_template_items').select(['label', 'sort_order'])
      .where('template_id', '=', template.id).orderBy('sort_order').execute();
    if (items.length === 0) return;

    // At most one active checklist of a type per person (migration 385's
    // unique index) — a second join/deactivate event for the same person
    // while one is still in progress is a no-op, not a duplicate.
    const existing = await trx.selectFrom('hr_checklists').select('id')
      .where('tenant_id', '=', tenantId).where('employee_id', '=', employeeId)
      .where('type', '=', type).where('status', '=', 'in_progress').executeTakeFirst();
    if (existing) return;

    const checklist = await trx.insertInto('hr_checklists').values({
      tenant_id: tenantId, employee_id: employeeId, type,
    }).returningAll().executeTakeFirstOrThrow();

    await trx.insertInto('hr_checklist_items').values(
      items.map(i => ({ tenant_id: tenantId, checklist_id: checklist.id, label: i.label, sort_order: i.sort_order }))
    ).execute();
  });
}

registerSubscriber('user.joined', async (tenantId, event) => {
  if (await isSupersededByStudio(tenantId, 'nexushr.onboarding_checklist')) return;
  const userId = event.payload.userId as string | undefined;
  if (!userId) return;
  await createChecklistFromTemplate(tenantId, userId, 'onboarding');
});

registerSubscriber('hr.staff_deactivated', async (tenantId, event) => {
  if (await isSupersededByStudio(tenantId, 'nexushr.offboarding_checklist')) return;
  const userId = event.payload.userId as string | undefined;
  if (!userId) return;
  await createChecklistFromTemplate(tenantId, userId, 'offboarding');
});
