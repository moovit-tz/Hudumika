import { getIntegration, type Provider } from './lens-integration.service.js';

/**
 * Can this connection actually do the thing we will ask of it?
 *
 * A token that authenticates is not a token that works. The failures that
 * matter all happen *after* auth succeeds: the PAT is valid but has no `repo`
 * scope; the Slack bot is real but was never invited to the channel; the Jira
 * project key is a typo; the Linear team ID belongs to another workspace. Every
 * one of those passes a naive "test connection" and then fails on first use,
 * which is how integrations end up quietly broken for weeks.
 *
 * So preflight runs the checks in the order they can fail — credential shape,
 * then authentication, then does the target exist, then may we write to it —
 * and stops at the first failure with a specific remedy. Each check reports the
 * provider's own words; none of them guesses.
 *
 * The write check is deliberately non-destructive everywhere. It asks whether a
 * write *would* be permitted rather than performing one — nobody wants
 * "verifying the connection" to leave a stray issue in their tracker.
 */

export interface Check {
  name: string;
  ok: boolean;
  /** What the provider said, or why we did not ask. */
  detail: string;
  /** What to do about it — specific, not "check your settings". */
  remedy?: string;
  /** True when the check could not run because an earlier one failed. */
  skipped?: boolean;
}

export interface Preflight {
  provider: Provider;
  ok: boolean;
  checks: Check[];
  /** The one thing to do next, when something failed. */
  nextStep: string | null;
}

/**
 * A request that never reached the provider is not a provider verdict.
 *
 * `status: 0` means DNS, TLS, a proxy or a timeout — telling someone their
 * token was rejected in that case sends them to regenerate a credential that
 * was never actually tried.
 */
function transportRemedy(status: number, text: string): string | null {
  if (status !== 0) return null;
  return `The request never reached the provider (${text}). Check outbound network `
       + `access and any proxy or firewall rules before touching the credential.`;
}

async function req(url: string, init: RequestInit, timeoutMs = 15000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    let data: any; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data, text };
  } catch (e: any) {
    return {
      status: 0, ok: false, data: null,
      text: e?.name === 'AbortError' ? `No response within ${timeoutMs}ms` : (e?.message ?? 'Request failed'),
    };
  } finally { clearTimeout(timer); }
}

/**
 * Obvious mistakes, caught before spending a network round trip on them.
 * A Slack user token pasted where a bot token belongs is the single most common
 * one, and its error from Slack is unhelpful.
 */
function checkShape(provider: Provider, credential: string, cfg: Record<string, string>): Check {
  const has = (k: string) => !!String(cfg[k] ?? '').trim();

  switch (provider) {
    case 'github':
      if (!/^(ghp_|github_pat_|gho_|ghs_)/.test(credential)) {
        return { name: 'Credential shape', ok: false,
          detail: 'This does not look like a GitHub token.',
          remedy: 'Personal access tokens start with ghp_ (classic) or github_pat_ (fine-grained).' };
      }
      if (!has('repo') || !/^[^/\s]+\/[^/\s]+$/.test(cfg.repo)) {
        return { name: 'Credential shape', ok: false, detail: 'Repository is missing or malformed.',
          remedy: 'Use owner/repo — for example hudumika/platform.' };
      }
      return { name: 'Credential shape', ok: true, detail: 'Token prefix and owner/repo look right.' };

    case 'slack':
      if (!credential.startsWith('xoxb-')) {
        return { name: 'Credential shape', ok: false,
          detail: credential.startsWith('xoxp-')
            ? 'That is a user token (xoxp-), not a bot token.'
            : 'This does not look like a Slack bot token.',
          remedy: 'Use the Bot User OAuth Token from OAuth & Permissions — it starts with xoxb-.' };
      }
      if (!has('channel')) {
        return { name: 'Credential shape', ok: false, detail: 'No channel configured.',
          remedy: 'Give a channel name (#platform-dev) or ID (C0123456).' };
      }
      return { name: 'Credential shape', ok: true, detail: 'Bot token and channel present.' };

    case 'jira':
      if (!has('site') || !/^https?:\/\//.test(cfg.site)) {
        return { name: 'Credential shape', ok: false, detail: 'Site URL is missing or not a URL.',
          remedy: 'Use the full URL, e.g. https://your-org.atlassian.net.' };
      }
      if (!has('email') || !cfg.email.includes('@')) {
        return { name: 'Credential shape', ok: false, detail: 'Account email is missing or malformed.',
          remedy: 'Jira authenticates with your account email plus the API token, not the token alone.' };
      }
      if (!has('project')) {
        return { name: 'Credential shape', ok: false, detail: 'No project key.',
          remedy: 'The short key from the project URL, e.g. PLAT.' };
      }
      return { name: 'Credential shape', ok: true, detail: 'Site, email and project key present.' };

    case 'linear':
      if (!has('team_id')) {
        return { name: 'Credential shape', ok: false, detail: 'No team ID configured.',
          remedy: 'Linear settings → Teams → the team → copy its ID.' };
      }
      return { name: 'Credential shape', ok: true, detail: 'API key and team ID present.' };

    case 'circleci':
      if (!has('project_slug') || cfg.project_slug.split('/').length !== 3) {
        return { name: 'Credential shape', ok: false, detail: 'Project slug is missing or malformed.',
          remedy: 'Three parts: vcs/org/repo — for example gh/hudumika/platform.' };
      }
      return { name: 'Credential shape', ok: true, detail: 'Token and project slug present.' };
  }
}

export async function preflight(provider: Provider): Promise<Preflight> {
  const row = await getIntegration(provider);
  const checks: Check[] = [];

  if (!row?.credential) {
    return {
      provider, ok: false,
      checks: [{ name: 'Credential stored', ok: false, detail: 'No credential has been saved.',
                 remedy: 'Paste the token and save.' }],
      nextStep: 'Save a credential for this provider.',
    };
  }
  const token = row.credential;
  const cfg = (row.config ?? {}) as Record<string, string>;

  const shape = checkShape(provider, token, cfg);
  checks.push(shape);
  const skipRest = (why: string) => {
    for (const n of ['Authentication', 'Target exists', 'Write permission']) {
      if (!checks.find(c => c.name === n)) {
        checks.push({ name: n, ok: false, skipped: true, detail: why });
      }
    }
    // The next step is the remedy for whatever actually failed, not the reason
    // the later checks were skipped. Reporting "authentication failed" as the
    // next step tells you what happened and not what to do about it.
    const failed = checks.find(c => !c.ok && !c.skipped);
    return { provider, ok: false, checks, nextStep: failed?.remedy ?? failed?.detail ?? why };
  };
  if (!shape.ok) return skipRest('Not attempted — the credential or config is malformed.');

  switch (provider) {
    case 'github': {
      const me = await req('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      checks.push({
        name: 'Authentication', ok: me.ok,
        detail: me.ok ? `Authenticated as ${me.data?.login}` : String(me.text).slice(0, 200),
        remedy: me.ok ? undefined
          : (transportRemedy(me.status, me.text)
             ?? 'The token is rejected — regenerate it, or check it has not expired.'),
      });
      if (!me.ok) return skipRest('Not attempted — authentication failed.');

      const repo = await req(`https://api.github.com/repos/${cfg.repo}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      checks.push({
        name: 'Target exists', ok: repo.ok,
        detail: repo.ok ? `${cfg.repo} is visible to this token` : String(repo.text).slice(0, 200),
        remedy: repo.ok ? undefined
          : 'Either the repository name is wrong, or the token cannot see it. A fine-grained token must list this repository explicitly.',
      });
      if (!repo.ok) return skipRest('Not attempted — the repository is not reachable.');

      // GitHub reports push/admin on the repo itself, so this needs no write.
      const perms = repo.data?.permissions ?? {};
      const canWrite = !!(perms.push || perms.admin || perms.maintain);
      const issuesOn = repo.data?.has_issues !== false;
      checks.push({
        name: 'Write permission', ok: canWrite && issuesOn,
        detail: !issuesOn ? 'Issues are disabled on this repository.'
          : canWrite ? 'Token has push access, so it can open issues.'
          : 'Token has read access only.',
        remedy: !issuesOn ? 'Enable Issues in the repository settings.'
          : canWrite ? undefined : 'Grant the repo scope (classic) or Issues: Read and write (fine-grained).',
      });
      break;
    }

    case 'slack': {
      const auth = await req('https://slack.com/api/auth.test', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const authOk = auth.ok && auth.data?.ok === true;
      checks.push({
        name: 'Authentication', ok: authOk,
        detail: authOk ? `Authenticated as ${auth.data.user} in ${auth.data.team}`
          : `Slack: ${auth.data?.error ?? auth.text}`,
        remedy: authOk ? undefined
          : (transportRemedy(auth.status, auth.text)
             ?? 'Reinstall the app to the workspace and copy a fresh bot token.'),
      });
      if (!authOk) return skipRest('Not attempted — authentication failed.');

      // conversations.info tells us the channel exists and whether the bot is a
      // member — the actual reason chat.postMessage fails in practice.
      const ch = await req(
        `https://slack.com/api/conversations.info?channel=${encodeURIComponent(cfg.channel.replace(/^#/, ''))}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const chOk = ch.ok && ch.data?.ok === true;
      checks.push({
        name: 'Target exists', ok: chOk,
        detail: chOk ? `#${ch.data.channel?.name} found` : `Slack: ${ch.data?.error ?? ch.text}`,
        remedy: chOk ? undefined
          : ch.data?.error === 'channel_not_found'
            ? 'Use the channel ID (C…) rather than the name, or check the bot can see it — private channels need an invite.'
            : 'Add the channels:read scope so the app can look the channel up.',
      });
      if (!chOk) return skipRest('Not attempted — the channel is not reachable.');

      const isMember = ch.data.channel?.is_member === true;
      checks.push({
        name: 'Write permission', ok: isMember,
        detail: isMember ? 'The bot is in the channel and can post.' : 'The bot is not a member of this channel.',
        remedy: isMember ? undefined : `Invite it: /invite @your-app in ${cfg.channel}.`,
      });
      break;
    }

    case 'jira': {
      const basic = `Basic ${Buffer.from(`${cfg.email}:${token}`).toString('base64')}`;
      const site = cfg.site.replace(/\/$/, '');
      const me = await req(`${site}/rest/api/3/myself`, { headers: { Authorization: basic, Accept: 'application/json' } });
      checks.push({
        name: 'Authentication', ok: me.ok,
        detail: me.ok ? `Authenticated as ${me.data?.displayName ?? cfg.email}` : String(me.text).slice(0, 200),
        remedy: me.ok ? undefined
          : (transportRemedy(me.status, me.text)
             ?? 'Jira uses the account email with the API token as basic auth. A wrong email fails the same way a wrong token does.'),
      });
      if (!me.ok) return skipRest('Not attempted — authentication failed.');

      const proj = await req(`${site}/rest/api/3/project/${encodeURIComponent(cfg.project)}`,
        { headers: { Authorization: basic, Accept: 'application/json' } });
      checks.push({
        name: 'Target exists', ok: proj.ok,
        detail: proj.ok ? `${proj.data?.name} (${proj.data?.key})` : String(proj.text).slice(0, 200),
        remedy: proj.ok ? undefined : 'Check the project key — it is the short prefix on issue numbers, not the project name.',
      });
      if (!proj.ok) return skipRest('Not attempted — the project is not reachable.');

      // createmeta says what this user may actually create, without creating.
      const wanted = cfg.issue_type || 'Task';
      const meta = await req(
        `${site}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(cfg.project)}&expand=projects.issuetypes`,
        { headers: { Authorization: basic, Accept: 'application/json' } });
      const types: string[] = meta.data?.projects?.[0]?.issuetypes?.map((t: any) => t.name) ?? [];
      const hasType = types.some(t => t.toLowerCase() === wanted.toLowerCase());
      checks.push({
        name: 'Write permission', ok: meta.ok && hasType,
        detail: !meta.ok ? String(meta.text).slice(0, 200)
          : hasType ? `Can create "${wanted}" in ${cfg.project}`
          : `"${wanted}" is not available. This project offers: ${types.join(', ') || 'nothing this account can create'}`,
        remedy: !meta.ok ? 'The account lacks Create Issues permission on this project.'
          : hasType ? undefined : `Set the issue type to one of: ${types.join(', ')}`,
      });
      break;
    }

    case 'linear': {
      const me = await req('https://api.linear.app/graphql', {
        method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { id name } }' }) });
      const meOk = me.ok && !me.data?.errors;
      checks.push({
        name: 'Authentication', ok: meOk,
        detail: meOk ? `Authenticated as ${me.data?.data?.viewer?.name}`
          : `Linear: ${me.data?.errors?.[0]?.message ?? me.text}`,
        remedy: meOk ? undefined
          : (transportRemedy(me.status, me.text)
             ?? 'Create a new API key in Linear settings → API.'),
      });
      if (!meOk) return skipRest('Not attempted — authentication failed.');

      const team = await req('https://api.linear.app/graphql', {
        method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query($id: String!) { team(id: $id) { id key name } }',
          variables: { id: cfg.team_id } }) });
      const t = team.data?.data?.team;
      checks.push({
        name: 'Target exists', ok: !!t,
        detail: t ? `${t.name} (${t.key})` : `Linear: ${team.data?.errors?.[0]?.message ?? 'Team not found'}`,
        remedy: t ? undefined : 'The team ID is wrong, or the key belongs to a different workspace.',
      });
      if (!t) return skipRest('Not attempted — the team is not reachable.');

      // An API key that can read a team can create issues in it; Linear has no
      // finer-grained read-only key, so this is stated rather than probed.
      checks.push({
        name: 'Write permission', ok: true,
        detail: 'Linear API keys carry the permissions of the user who made them — reading this team implies writing to it.',
      });
      break;
    }

    case 'circleci': {
      const me = await req('https://circleci.com/api/v2/me', { headers: { 'Circle-Token': token } });
      checks.push({
        name: 'Authentication', ok: me.ok,
        detail: me.ok ? `Authenticated as ${me.data?.login ?? me.data?.name}` : String(me.text).slice(0, 200),
        remedy: me.ok ? undefined
          : (transportRemedy(me.status, me.text)
             ?? 'Create a personal API token in CircleCI → User Settings → Personal API Tokens.'),
      });
      if (!me.ok) return skipRest('Not attempted — authentication failed.');

      const proj = await req(
        `https://circleci.com/api/v2/project/${encodeURIComponent(cfg.project_slug)}`,
        { headers: { 'Circle-Token': token } });
      checks.push({
        name: 'Target exists', ok: proj.ok,
        detail: proj.ok ? `${proj.data?.slug}` : String(proj.text).slice(0, 200),
        remedy: proj.ok ? undefined : 'Check the slug format — vcs/org/repo, e.g. gh/hudumika/platform.',
      });
      if (!proj.ok) return skipRest('Not attempted — the project is not reachable.');

      checks.push({
        name: 'Write permission', ok: true,
        detail: 'Not applicable — Lens only reads build status from CircleCI and never triggers a pipeline.',
      });
      break;
    }
  }

  const failed = checks.find(c => !c.ok);
  return {
    provider,
    ok: !failed,
    checks,
    nextStep: failed ? (failed.remedy ?? failed.detail) : null,
  };
}
