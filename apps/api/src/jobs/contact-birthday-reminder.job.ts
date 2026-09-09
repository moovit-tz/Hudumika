import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';
import { ContactsService } from '../services/contacts.service.js';

/**
 * Contact birthday reminders — closes a real gap: `contacts.birthday` (029)
 * was captured and displayed, but nothing ever read it back for a
 * reminder. Unlike task/notes/calendar reminders (a one-time
 * notified_at timestamp), a birthday recurs every year, so this tracks
 * birthday_notified_year (439) and checks it against the current year
 * rather than "has this ever fired" — the same reminder must fire again
 * next year.
 *
 * Notified: the contact's sales_owner_id, if one is set — the real user
 * reference migration 438 added. A contact with no owner (freeform
 * sales_owner text that never resolved to a real account, or no owner at
 * all) is skipped rather than guessing who should be told; there is no
 * platform-wide "creator" column on contacts to fall back to.
 *
 * Fires once, on the day itself — not a 7-day-advance warning, to avoid
 * the two-stage dedup tracking that would need without adding real value
 * "keep in touch" reminders don't usually need.
 */
export async function runContactBirthdayReminderJob(): Promise<void> {
  console.log('⏳ Running background job: Contact birthday reminders...');
  try {
    const tenants = await dbPlatform.selectFrom('tenants').select('id').where('active', '=', true).execute();
    const currentYear = new Date().getFullYear();
    let sent = 0;

    for (const tenant of tenants) {
      const upcoming = await ContactsService.getUpcomingBirthdays(tenant.id, 0); // 0 = today only
      if (!upcoming.length) continue;

      await withTenant(tenant.id, async (trx) => {
        for (const contact of upcoming) {
          const full = await trx.selectFrom('contacts').select(['sales_owner_id', 'birthday_notified_year'])
            .where('id', '=', contact.id).where('tenant_id', '=', tenant.id).executeTakeFirst();
          if (!full?.sales_owner_id) continue; // no real owner to notify
          if (full.birthday_notified_year === currentYear) continue; // already fired this year

          await NotificationService.createNotification({
            tenantId: tenant.id,
            userId: full.sales_owner_id,
            app: 'contacts',
            type: 'info',
            title: 'Contact birthday today',
            message: `${contact.first_name} ${contact.last_name || ''}`.trim() + "'s birthday is today.",
            link: '/contacts',
            entityType: 'contact',
            entityId: contact.id,
          });
          await trx.updateTable('contacts').set({ birthday_notified_year: currentYear })
            .where('id', '=', contact.id).where('tenant_id', '=', tenant.id).execute();
          sent++;
        }
      });
    }

    if (sent === 0) console.log('📝 No contact birthdays today with a real owner to notify.');
    else console.log(`✅ Contact birthday reminders job completed — ${sent} notification(s) sent.`);
  } catch (error) {
    console.error('❌ Contact birthday reminder job failed:', error);
  }
}
