/**
 * Onsite's CI provider seam.
 *
 * A deployment used to be a lie. POST /applications/:id/deploy inserted a row,
 * set a 1.5-second setTimeout, and then wrote `status: 'succeeded'`,
 * `application.status: 'active'` and a `current_version` of
 * `v1.0.${Date.now()/1000 % 10000}`. Nothing was built, nothing was shipped,
 * and no CI system was ever contacted — but the console told you your
 * application was deployed and running. That is the worst thing an
 * infrastructure control plane can do, because the whole reason to look at one
 * is to find out what is actually true about production.
 *
 * Onsite is a control plane, not an infrastructure provider (ONSITE.md §97):
 * it asks a real provider to do the work and reports what the provider says.
 * So this file is the seam, not the implementation. `CIProvider` is the
 * contract; CircleCI is the first implementation because it is the CI system
 * Hudumika already uses (see lens-integration.service.ts, which talks to the
 * same v2 API for Lens).
 *
 * When no provider is connected, `resolveCIProvider` returns null and the
 * caller must refuse the deployment. It must never invent one.
 */
import { withTenant } from '../db/client.js';
import { decryptSecret, decryptJson } from './onsite-secrets.service.js';

export type CIStatus = 'queued' | 'building' | 'deploying' | 'succeeded' | 'failed' | 'cancelled';

export interface CIPipelineRef {
  /** The provider's own id for the run, stored in onsite_deployments.ci_pipeline_id. */
  id: string;
  /** A link a human can open. Null when the provider gives us no usable URL. */
  url: string | null;
}

export interface CIPipelineState {
  status: CIStatus;
  url: string | null;
  /** The provider's own explanation when it failed. Never invented here. */
  error: string | null;
}

export interface CIProvider {
  key: string;
  label: string;
  /** Ask the provider to run a pipeline. Throws with the provider's message on refusal. */
  trigger(opts: { branch: string; tag?: string | null }): Promise<CIPipelineRef>;
  /** What the provider says about a run now. Null when it cannot say yet. */
  poll(pipelineId: string): Promise<CIPipelineState | null>;
}

/**
 * CircleCI's own vocabulary, mapped onto the states onsite_deployments accepts.
 *
 * `created` and `pending` are both "the provider has it but has not started",
 * which is `queued` here. Anything unrecognised is deliberately left out of
 * this map so it falls through to null and the deployment keeps its current
 * status rather than being guessed at.
 */
const CIRCLECI_WORKFLOW_STATUS: Record<string, CIStatus> = {
  success: 'succeeded',
  failed: 'failed',
  error: 'failed',
  failing: 'building',
  running: 'building',
  on_hold: 'queued',
  not_run: 'cancelled',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  unauthorized: 'failed',
};

class CircleCIProvider implements CIProvider {
  key = 'circleci';
  label = 'CircleCI';

  constructor(private token: string, private projectSlug: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`https://circleci.com/api/v2${path}`, {
      ...init,
      headers: {
        'Circle-Token': this.token,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep the raw text below */ }
    if (!res.ok) {
      // The provider's own words, not a summary of them — a deployment that
      // failed because a token expired should say so.
      const detail = body?.message || text?.slice(0, 300) || `HTTP ${res.status}`;
      throw new Error(`CircleCI: ${detail}`);
    }
    return body;
  }

  async trigger({ branch, tag }: { branch: string; tag?: string | null }): Promise<CIPipelineRef> {
    const body = await this.api(`/project/${encodeURIComponent(this.projectSlug)}/pipeline`, {
      method: 'POST',
      body: JSON.stringify(tag ? { tag } : { branch }),
    });
    if (!body?.id) throw new Error('CircleCI accepted the request but returned no pipeline id.');
    return {
      id: String(body.id),
      url: body.number ? `https://app.circleci.com/pipelines/${this.projectSlug}/${body.number}` : null,
    };
  }

  async poll(pipelineId: string): Promise<CIPipelineState | null> {
    // A pipeline's state is the state of its workflows; the pipeline object
    // itself only reports whether CircleCI managed to *create* it.
    const wf = await this.api(`/pipeline/${encodeURIComponent(pipelineId)}/workflow`);
    const items: any[] = Array.isArray(wf?.items) ? wf.items : [];
    if (items.length === 0) return null;

    const mapped = items
      .map(w => CIRCLECI_WORKFLOW_STATUS[String(w.status)])
      .filter(Boolean) as CIStatus[];
    if (mapped.length === 0) return null;

    // Worst-case wins, so a pipeline is not called succeeded while one of its
    // workflows is still running or has already failed.
    const rank: CIStatus[] = ['failed', 'cancelled', 'building', 'deploying', 'queued', 'succeeded'];
    const status = rank.find(s => mapped.includes(s)) ?? 'queued';

    const failed = items.find(w => ['failed', 'error', 'unauthorized'].includes(String(w.status)));
    const url = items[0]?.id
      ? `https://app.circleci.com/pipelines/workflows/${items[0].id}`
      : null;

    return {
      status,
      url,
      error: failed ? `CircleCI workflow "${failed.name ?? failed.id}" reported ${failed.status}.` : null,
    };
  }
}

/**
 * The CI provider this tenant has connected, or null.
 *
 * Null is a real answer and callers must handle it by refusing to deploy. The
 * credential is read from onsite_provider_connections and decrypted here so it
 * never leaves this module — never returned, never logged, never put in an API
 * response.
 */
export async function resolveCIProvider(tenantId: string): Promise<CIProvider | null> {
  const row = await withTenant(tenantId, trx => trx.selectFrom('onsite_provider_connections')
    .select(['provider', 'access_token_cipher', 'config_cipher', 'external_id', 'status'])
    .where('tenant_id', '=', tenantId)
    .where('provider', '=', 'circleci')
    // 'active' is the word onsite_provider_connections actually uses — its
    // CHECK constraint allows active/revoked/error/pending, and the create
    // route writes 'active'. Filtering on a status the column cannot hold
    // matches nothing, which would have made every deployment report "no CI
    // provider is connected" no matter how many were.
    .where('status', '=', 'active')
    .executeTakeFirst());

  if (!row?.access_token_cipher) return null;

  let token: string;
  try {
    token = decryptSecret(row.access_token_cipher);
  } catch {
    // A credential that cannot be decrypted is the same as not having one —
    // and saying so beats deploying with an empty token and blaming CircleCI.
    return null;
  }
  if (!token) return null;

  let slug = row.external_id ?? '';
  if (!slug && row.config_cipher) {
    try { slug = String(decryptJson(row.config_cipher).project_slug ?? ''); } catch { /* below */ }
  }
  if (!slug) return null;

  return new CircleCIProvider(token, slug);
}

/**
 * Does this credential actually work?
 *
 * Connecting a provider used to write `status: 'active'` and stamp
 * `last_verified_at` with the current time without contacting anything, so the
 * console reported a live, verified connection for a credential that might be
 * a typo. This asks the provider, and the answer is whatever it says.
 *
 * A provider with no verification path returns ok:false rather than a cheerful
 * default — an unverifiable connection is not a verified one.
 */
export async function verifyProviderConnection(
  provider: string,
  token: string,
): Promise<{ ok: boolean; detail: string; accountName?: string }> {
  try {
    switch (provider) {
      case 'circleci': {
        // The same endpoint lens-integration.service.ts uses to test its own
        // CircleCI credential.
        const res = await fetch('https://circleci.com/api/v2/me', { headers: { 'Circle-Token': token } });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false, detail: `CircleCI rejected the token (HTTP ${res.status}). ${text.slice(0, 200)}` };
        }
        let name: string | undefined;
        try { name = JSON.parse(text)?.name ?? undefined; } catch { /* the check passed either way */ }
        return { ok: true, detail: 'Verified with CircleCI.', accountName: name };
      }
      case 'github': {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false, detail: `GitHub rejected the token (HTTP ${res.status}). ${text.slice(0, 200)}` };
        }
        let name: string | undefined;
        try { name = JSON.parse(text)?.login ?? undefined; } catch { /* the check passed either way */ }
        return { ok: true, detail: 'Verified with GitHub.', accountName: name };
      }
      default:
        return {
          ok: false,
          detail: `Onsite cannot verify a "${provider}" credential yet, so this connection is saved but unverified.`,
        };
    }
  } catch (err: any) {
    // Unreachable is not the same as invalid, and the message says which.
    return { ok: false, detail: `Could not reach ${provider} to verify the credential: ${err?.message ?? err}` };
  }
}

/** Why a deployment cannot start, in words a user can act on. */
export const NO_CI_PROVIDER_MESSAGE =
  'No CI provider is connected for this workspace, so there is nothing to run the build. '
  + 'Connect CircleCI under Onsite → Settings → Provider connections, then deploy again.';
