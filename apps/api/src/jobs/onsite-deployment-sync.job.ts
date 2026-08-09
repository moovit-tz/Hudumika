/**
 * Ask the CI provider what happened to the deployments that are still running.
 *
 * The deploy route hands a pipeline to the provider and stops there, at
 * `building`. Something has to close the loop, and it cannot be a timer that
 * assumes success — that was the original defect: a setTimeout wrote
 * 'succeeded' 1.5 seconds after the request, with nothing built.
 *
 * So this polls, and it only ever writes what the provider reports. A
 * deployment whose provider has no opinion yet keeps the status it has; a
 * deployment the provider cannot be reached about keeps its status too, and
 * stays in this job's queue until it can be.
 */
import { db } from '../db/client.js';
import { resolveCIProvider } from '../services/onsite-ci.service.js';

/** Past this, a run that never reported is stale rather than in progress. */
const ABANDON_AFTER_MS = 6 * 60 * 60 * 1000;

const IN_FLIGHT = ['queued', 'building', 'deploying'];

export async function runOnsiteDeploymentSyncJob(): Promise<void> {
  const open = await db.selectFrom('onsite_deployments')
    .select(['id', 'tenant_id', 'application_id', 'ci_pipeline_id', 'status', 'queued_at', 'created_at'])
    .where('status', 'in', IN_FLIGHT)
    .where('ci_pipeline_id', 'is not', null)
    .orderBy('created_at', 'asc')
    .limit(200)
    .execute();

  if (open.length === 0) return;

  // One provider per tenant, resolved once — each resolve decrypts a
  // credential, and a tenant with 30 open deployments should not do that 30
  // times.
  const providers = new Map<string, Awaited<ReturnType<typeof resolveCIProvider>>>();

  for (const d of open) {
    try {
      if (!providers.has(d.tenant_id)) {
        providers.set(d.tenant_id, await resolveCIProvider(d.tenant_id));
      }
      const ci = providers.get(d.tenant_id);

      // A disconnected provider is not a failed deployment — the run may well
      // be finishing right now. Only age decides that.
      if (!ci) {
        await abandonIfStale(d);
        continue;
      }

      const state = await ci.poll(d.ci_pipeline_id!);
      if (!state) {
        await abandonIfStale(d);
        continue;
      }
      if (state.status === d.status) continue;

      const terminal = ['succeeded', 'failed', 'cancelled'].includes(state.status);

      await db.updateTable('onsite_deployments')
        .set({
          status: state.status,
          ...(state.url ? { ci_build_url: state.url } : {}),
          ...(terminal ? { completed_at: new Date() } : {}),
          ...(state.error ? { error_message: state.error.slice(0, 500) } : {}),
        })
        .where('id', '=', d.id)
        .where('tenant_id', '=', d.tenant_id)
        .execute();

      /**
       * An application is only "active" on a deployment the provider actually
       * finished, and its version is the pipeline that produced it rather than
       * a number derived from the clock.
       */
      if (state.status === 'succeeded') {
        await db.updateTable('onsite_applications')
          .set({
            status: 'active',
            current_version: d.ci_pipeline_id,
            last_deployed_at: new Date(),
          })
          .where('id', '=', d.application_id)
          .where('tenant_id', '=', d.tenant_id)
          .execute();
      }
    } catch (err) {
      // One unreachable tenant must not stop the sweep for the rest. The
      // deployment keeps its status and is picked up next pass.
      console.error(`[onsite-deployment-sync] ${d.id}:`, err);
    }
  }
}

/**
 * Close out a run nothing can report on any more.
 *
 * Marked failed with the reason stated, not succeeded — an unknown outcome is
 * not a good one, and leaving it "building" forever would be its own kind of
 * lie.
 */
async function abandonIfStale(d: { id: string; tenant_id: string; queued_at: Date | null; created_at: Date }): Promise<void> {
  const started = (d.queued_at ?? d.created_at).getTime();
  if (Date.now() - started < ABANDON_AFTER_MS) return;

  await db.updateTable('onsite_deployments')
    .set({
      status: 'failed',
      completed_at: new Date(),
      error_message: 'No status was reported by the CI provider within 6 hours. The outcome of this run is unknown.',
    })
    .where('id', '=', d.id)
    .where('tenant_id', '=', d.tenant_id)
    .execute();
}
