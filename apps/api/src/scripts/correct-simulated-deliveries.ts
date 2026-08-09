/**
 * Corrects notification rows that claim a delivery which never happened.
 *
 * WhatsApp and email fall back to a simulation when their credentials are unset
 * or still placeholders, and both returned `{ success: true }` with nothing to
 * distinguish them from a real send. notification.service recorded that as
 * SENT, so the log — the one place anyone looks to answer "did the customer
 * actually get this" — has been answering yes for messages that never left the
 * machine.
 *
 * The send path is fixed (both integrations now return `simulated: true`, and
 * SIMULATED is recorded), but rows written before that fix still assert
 * delivery. This corrects them.
 *
 * Deliberately a script and NOT a migration. A migration would run against
 * every deployment, including one whose credentials were genuinely configured
 * and whose SENT rows are true. Rewriting those would replace a correct record
 * with a false one — the same mistake in the opposite direction.
 *
 * So it proves the claim before making it. If this database shows any sign that
 * real credentials ever existed, it refuses and explains, because at that point
 * only some of the rows are wrong and nothing here can tell which.
 *
 *   npx tsx src/scripts/correct-simulated-deliveries.ts          # report only
 *   PROBE=1 npx tsx src/scripts/correct-simulated-deliveries.ts  # apply
 */
import { db } from '../db/client.js';
import { env } from '../config/env.js';

const WA_PLACEHOLDERS = ['your-meta-whatsapp-token', 'your-phone-number-id'];
const MAIL_PLACEHOLDERS = ['your-email@domain.com', 'your-app-password'];

async function main() {
  const reasons: string[] = [];

  // 1. Platform credentials.
  const waConfigured = !!env.META_WA_TOKEN && !WA_PLACEHOLDERS.includes(env.META_WA_TOKEN)
    && !!env.META_PHONE_NUMBER_ID && !WA_PLACEHOLDERS.includes(env.META_PHONE_NUMBER_ID);
  const mailConfigured = !!env.SMTP_USER && !MAIL_PLACEHOLDERS.includes(env.SMTP_USER)
    && !!env.SMTP_PASS && !MAIL_PLACEHOLDERS.includes(env.SMTP_PASS);
  if (waConfigured) reasons.push('platform WhatsApp credentials are configured');
  if (mailConfigured) reasons.push('platform SMTP credentials are configured');

  // 2. Per-tenant credentials, which override the platform ones.
  const settings = await db.selectFrom('tenant_settings').select(['tenant_id', 'settings']).execute();
  for (const row of settings) {
    const s: any = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    const wa = s?.integrations?.whatsapp ?? s?.whatsapp ?? {};
    const mail = s?.integrations?.email ?? s?.email ?? {};
    if (wa?.token || wa?.phone_number_id || wa?.phoneNumberId) reasons.push(`tenant ${row.tenant_id} has WhatsApp credentials`);
    if (mail?.smtp_host || mail?.smtpHost || mail?.host || mail?.provider) reasons.push(`tenant ${row.tenant_id} has email credentials`);
  }

  const affected = await db
    .selectFrom('notifications')
    .select(['channel'])
    .select(({ fn }) => fn.countAll<string>().as('n'))
    .where('status', '=', 'SENT')
    .where('channel', 'in', ['WHATSAPP', 'EMAIL'])
    .groupBy('channel')
    .execute();

  console.log('\nRows claiming delivery:');
  for (const a of affected) console.log(`  ${String(a.channel ?? '(none)').padEnd(10)} ${a.n}`);
  const total = affected.reduce((t, a) => t + Number(a.n), 0);

  if (reasons.length) {
    console.log('\nRefusing to correct anything — this deployment may really have sent:');
    for (const r of [...new Set(reasons)]) console.log(`  - ${r}`);
    console.log('\nSome of those rows are true and nothing here can tell which. Correct them by hand.');
    await db.destroy();
    return;
  }

  console.log('\nNo WhatsApp or email credentials exist on this platform or on any tenant,');
  console.log('so every one of those sends took the simulation path and none was delivered.');
  console.log('IN_APP is left alone: an in-app notification is delivered by existing.');

  if (process.env.PROBE !== '1') {
    console.log(`\n${total} row(s) would be changed from SENT to SIMULATED. Re-run with PROBE=1 to apply.`);
    await db.destroy();
    return;
  }

  const res = await db
    .updateTable('notifications')
    .set({ status: 'SIMULATED' })
    .where('status', '=', 'SENT')
    .where('channel', 'in', ['WHATSAPP', 'EMAIL'])
    .executeTakeFirst();
  console.log(`\nCorrected ${Number(res.numUpdatedRows)} row(s) to SIMULATED.`);

  const after = await db.selectFrom('notifications')
    .select(['channel', 'status'])
    .select(({ fn }) => fn.countAll<string>().as('n'))
    .groupBy(['channel', 'status']).orderBy('channel').execute();
  console.table(after.map(r => ({ channel: r.channel, status: r.status, rows: Number(r.n) })));
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
