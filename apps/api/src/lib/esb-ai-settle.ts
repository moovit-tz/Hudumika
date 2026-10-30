import { meterAfter } from './provider-metering.js';
import { withTenant } from '../db/client.js';

/**
 * Settles an ESB operation after an AI call completes.
 * Call this in the finally/catch blocks of every AI route that uses
 * resolveAiCredentials, passing the esbOperationId from creds.
 *
 * No-op if esbOperationId is undefined (non-ESB-metered call).
 */
export async function settleAiCall(tenantId: string, esbOperationId: string | undefined, success: boolean, failureReason?: string): Promise<void> {
  if (!esbOperationId) return;

  if (success) {
    // Successful call: capture at the full quoted amount (flat rate per call).
    // Read the quoted amount from the operation so we capture the right figure.
    const op = await withTenant(tenantId, trx =>
      trx.selectFrom('esb_operations').select('quoted_amount')
        .where('id', '=', esbOperationId).where('tenant_id', '=', tenantId)
        .executeTakeFirst()
    );
    await meterAfter({
      tenantId,
      operationId: esbOperationId,
      success: true,
      actualAmount: op ? Number(op.quoted_amount) : 0,
    });
  } else {
    // Failed call: release the reservation (provider failed, no charge)
    await meterAfter({
      tenantId,
      operationId: esbOperationId,
      success: false,
      failureReason,
    });
  }
}
