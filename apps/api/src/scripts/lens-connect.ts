/**
 * Connect a provider to Lens from the terminal, and prove it works.
 *
 * The UI does the same thing, but credentials usually arrive in a terminal —
 * from a password manager, a CI secret store, an ops runbook — and pasting a
 * token into a browser field is the step people put off.
 *
 * Every connection ends with the full preflight, not just an auth check,
 * because a token that authenticates is not a token that works.
 *
 *   npx tsx src/scripts/lens-connect.ts list
 *   npx tsx src/scripts/lens-connect.ts check github
 *   npx tsx src/scripts/lens-connect.ts set github --token ghp_xxx --repo owner/repo
 *   npx tsx src/scripts/lens-connect.ts set slack  --token xoxb-xxx --channel '#platform-dev'
 *   npx tsx src/scripts/lens-connect.ts set jira   --token xxx --site https://x.atlassian.net \
 *                                                  --email you@co.com --project PLAT
 *   npx tsx src/scripts/lens-connect.ts set linear --token lin_api_xxx --team-id UUID
 *   npx tsx src/scripts/lens-connect.ts set circleci --token xxx --project-slug gh/org/repo
 *
 * A token given on the command line lands in your shell history. Prefer
 * --token-env NAME and export the value instead.
 */
import { db } from '../db/client.js';
import { PROVIDERS, PROVIDER_SETUP, listIntegrations, type Provider } from '../services/lens-integration.service.js';
import { preflight } from '../services/lens-preflight.service.js';

const args = process.argv.slice(2);
const cmd = args[0];
const provider = args[1] as Provider | undefined;

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Config flags map to each provider's own field names. */
const CONFIG_FLAGS: Record<Provider, string[]> = {
  github: ['repo'],
  slack: ['channel'],
  jira: ['site', 'email', 'project', 'issue-type'],
  linear: ['team-id'],
  circleci: ['project-slug'],
};

function printPreflight(r: Awaited<ReturnType<typeof preflight>>) {
  console.log('');
  for (const c of r.checks) {
    const mark = c.skipped ? '-' : c.ok ? 'ok  ' : 'FAIL';
    console.log(`  ${mark.padEnd(4)} ${c.name}`);
    console.log(`       ${c.detail}`);
    if (c.remedy) console.log(`       -> ${c.remedy}`);
  }
  console.log('');
  console.log(r.ok
    ? '  Ready — this connection can do what Lens will ask of it.'
    : `  Next: ${r.nextStep}`);
}

async function main() {
  if (cmd === 'list' || !cmd) {
    const rows = await listIntegrations();
    console.log('\nLens integrations:\n');
    for (const r of rows) {
      console.log(`  ${r.provider.padEnd(9)} ${String(r.status).padEnd(13)} credential: ${r.has_credential ? 'stored' : 'none'}`);
      if (r.last_error) console.log(`            last error: ${r.last_error.slice(0, 120)}`);
    }
    console.log('\n  Connect one with:  lens-connect set <provider> --token … [--field value]');
    console.log('  Fields per provider:');
    for (const p of PROVIDERS) {
      console.log(`    ${p.padEnd(9)} ${CONFIG_FLAGS[p].map(f => `--${f}`).join(' ')}`);
    }
    await db.destroy();
    return;
  }

  if (!provider || !PROVIDERS.includes(provider)) {
    console.error(`Unknown provider. One of: ${PROVIDERS.join(', ')}`);
    await db.destroy();
    process.exit(1);
  }

  if (cmd === 'check') {
    printPreflight(await preflight(provider));
    await db.destroy();
    return;
  }

  if (cmd !== 'set') {
    console.error('Commands: list | set <provider> | check <provider>');
    await db.destroy();
    process.exit(1);
  }

  // A token in argv is a token in shell history. Offer the better route.
  const tokenEnv = flag('token-env');
  const token = tokenEnv ? process.env[tokenEnv] : flag('token');
  if (!token) {
    console.error(tokenEnv
      ? `Environment variable ${tokenEnv} is empty.`
      : `Missing --token (or --token-env NAME, which keeps it out of shell history).\n` +
        `  ${PROVIDER_SETUP[provider].label} wants: ${PROVIDER_SETUP[provider].credentialLabel}\n` +
        `  ${PROVIDER_SETUP[provider].docs}`);
    await db.destroy();
    process.exit(1);
  }

  const existing = await db.selectFrom('lens_integrations').select('config')
    .where('provider', '=', provider).executeTakeFirst();
  const config: Record<string, string> = { ...((existing?.config as any) ?? {}) };
  for (const f of CONFIG_FLAGS[provider]) {
    const v = flag(f);
    if (v !== undefined) config[f.replace(/-/g, '_')] = v;
  }

  const values = {
    provider, config: JSON.stringify(config) as any,
    credential: token, status: 'disconnected' as const, updated_at: new Date(),
  };
  await db.insertInto('lens_integrations').values(values)
    .onConflict(oc => oc.column('provider').doUpdateSet(values)).execute();

  console.log(`\nStored ${provider} credential and config: ${JSON.stringify(config)}`);
  console.log('Running the full check — authentication alone would not tell you much.');
  printPreflight(await preflight(provider));

  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
