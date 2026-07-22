import { db, withTenant } from '../db/client.js';

export class AccountingIntegrationService {
  /** Get status of all integrations for a tenant */
  static async getIntegrations(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('accounting_integrations')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();

      const providers = ['XERO', 'SAGE', 'QUICKBOOKS', 'TALLY'] as const;
      const result = providers.map(p => {
        const found = rows.find(r => r.provider === p);
        return {
          provider: p,
          status: found?.status ?? 'DISCONNECTED',
          last_sync_at: found?.last_sync_at ?? null,
          config: found ? {
            client_id: found.config.client_id ?? '',
            organization_id: found.config.organization_id ?? '',
            base_url: found.config.base_url ?? '',
          } : null
        };
      });

      // Also fetch recent sync logs
      const logs = await trx
        .selectFrom('accounting_sync_logs')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('synced_at', 'desc')
        .limit(20)
        .execute();

      return { integrations: result, logs };
    });
  }

  /** Connect/Configure an integration */
  static async connect(tenantId: string, provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY', config: any) {
    return withTenant(tenantId, async (trx) => {
      const existing = await trx
        .selectFrom('accounting_integrations')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('provider', '=', provider)
        .executeTakeFirst();

      if (existing) {
        await trx
          .updateTable('accounting_integrations')
          .set({
            status: 'CONNECTED',
            config: JSON.stringify(config) as any,
            updated_at: new Date()
          })
          .where('id', '=', existing.id)
          .execute();
      } else {
        await trx
          .insertInto('accounting_integrations')
          .values({
            tenant_id: tenantId,
            provider,
            status: 'CONNECTED',
            config: JSON.stringify(config) as any
          })
          .execute();
      }

      return { success: true };
    });
  }

  /** Disconnect an integration */
  static async disconnect(tenantId: string, provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY') {
    return withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('accounting_integrations')
        .where('tenant_id', '=', tenantId)
        .where('provider', '=', provider)
        .execute();

      return { success: true };
    });
  }

  /** Sync Chart of Accounts from external provider (simulated) */
  static async syncCOA(tenantId: string, provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY') {
    return withTenant(tenantId, async (trx) => {
      // Check if connected
      const integration = await trx
        .selectFrom('accounting_integrations')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('provider', '=', provider)
        .executeTakeFirst();

      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error(`Integration ${provider} is not connected.`);
      }

      try {
        // Simulate pulling external accounts
        // We'll insert a few mock accounts into the chart of accounts
        const mockAccounts = [
          { code: '1110', name: `Receivables Clearing (${provider})`, type: 'ASSET' as const, subtype: 'CURRENT_ASSET', normal_balance: 'DEBIT' as const },
          { code: '2210', name: `VAT Clearing (${provider})`, type: 'LIABILITY' as const, subtype: 'CURRENT_LIABILITY', normal_balance: 'CREDIT' as const },
          { code: '4010', name: `External Revenue (${provider})`, type: 'REVENUE' as const, subtype: 'OPERATING_REVENUE', normal_balance: 'CREDIT' as const },
        ];

        for (const acc of mockAccounts) {
          const exists = await trx
            .selectFrom('chart_of_accounts')
            .select('id')
            .where('tenant_id', '=', tenantId)
            .where('code', '=', acc.code)
            .executeTakeFirst();

          if (!exists) {
            await trx
              .insertInto('chart_of_accounts')
              .values({
                tenant_id: tenantId,
                code: acc.code,
                name: acc.name,
                type: acc.type,
                subtype: acc.subtype,
                normal_balance: acc.normal_balance,
                is_system: false,
                is_active: true
              })
              .execute();
          }
        }

        // Log success
        await trx
          .insertInto('accounting_sync_logs')
          .values({
            tenant_id: tenantId,
            provider,
            entity_type: 'COA',
            entity_id: integration.id,
            external_id: `${provider}-COA-SYNC`,
            status: 'SUCCESS'
          })
          .execute();

        // Update last sync
        await trx
          .updateTable('accounting_integrations')
          .set({ last_sync_at: new Date() })
          .where('id', '=', integration.id)
          .execute();

        return { success: true };
      } catch (err: any) {
        // Log failure
        await trx
          .insertInto('accounting_sync_logs')
          .values({
            tenant_id: tenantId,
            provider,
            entity_type: 'COA',
            entity_id: integration.id,
            status: 'FAILED',
            error_message: err.message
          })
          .execute();

        throw err;
      }
    });
  }

  /** Sync Sales Invoice (simulated) */
  static async syncInvoice(tenantId: string, invoiceId: string) {
    return withTenant(tenantId, async (trx) => {
      // Find connected integrations
      const connected = await trx
        .selectFrom('accounting_integrations')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'CONNECTED')
        .execute();

      if (connected.length === 0) return;

      const invoice = await trx
        .selectFrom('sales_invoices')
        .selectAll()
        .where('id', '=', invoiceId)
        .executeTakeFirst();

      if (!invoice) return;

      for (const integration of connected) {
        try {
          // Simulate API call and generate an external ID
          const externalId = `${integration.provider}-INV-${invoice.invoice_number}`;
          
          await trx
            .insertInto('accounting_sync_logs')
            .values({
              tenant_id: tenantId,
              provider: integration.provider,
              entity_type: 'INVOICE',
              entity_id: invoiceId,
              external_id: externalId,
              status: 'SUCCESS'
            })
            .execute();
        } catch (err: any) {
          await trx
            .insertInto('accounting_sync_logs')
            .values({
              tenant_id: tenantId,
              provider: integration.provider,
              entity_type: 'INVOICE',
              entity_id: invoiceId,
              status: 'FAILED',
              error_message: err.message
            })
            .execute();
        }
      }
    });
  }

  /** Sync Supplier Bill (simulated) */
  static async syncBill(tenantId: string, billId: string) {
    return withTenant(tenantId, async (trx) => {
      const connected = await trx
        .selectFrom('accounting_integrations')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'CONNECTED')
        .execute();

      if (connected.length === 0) return;

      const bill = await trx
        .selectFrom('supplier_bills')
        .selectAll()
        .where('id', '=', billId)
        .executeTakeFirst();

      if (!bill) return;

      for (const integration of connected) {
        try {
          const externalId = `${integration.provider}-BILL-${bill.bill_number}`;
          
          await trx
            .insertInto('accounting_sync_logs')
            .values({
              tenant_id: tenantId,
              provider: integration.provider,
              entity_type: 'BILL',
              entity_id: billId,
              external_id: externalId,
              status: 'SUCCESS'
            })
            .execute();
        } catch (err: any) {
          await trx
            .insertInto('accounting_sync_logs')
            .values({
              tenant_id: tenantId,
              provider: integration.provider,
              entity_type: 'BILL',
              entity_id: billId,
              status: 'FAILED',
              error_message: err.message
            })
            .execute();
        }
      }
    });
  }

  /** Sync Payment (simulated) */
  static async syncPayment(tenantId: string, paymentId: string, type: 'INVOICE' | 'BILL') {
    return withTenant(tenantId, async (trx) => {
      const connected = await trx
        .selectFrom('accounting_integrations')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'CONNECTED')
        .execute();

      if (connected.length === 0) return;

      for (const integration of connected) {
        try {
          const externalId = `${integration.provider}-PAY-${paymentId}`;
          
          await trx
            .insertInto('accounting_sync_logs')
            .values({
              tenant_id: tenantId,
              provider: integration.provider,
              entity_type: 'PAYMENT',
              entity_id: paymentId,
              external_id: externalId,
              status: 'SUCCESS'
            })
            .execute();
        } catch (err: any) {
          await trx
            .insertInto('accounting_sync_logs')
            .values({
              tenant_id: tenantId,
              provider: integration.provider,
              entity_type: 'PAYMENT',
              entity_id: paymentId,
              status: 'FAILED',
              error_message: err.message
            })
            .execute();
        }
      }
    });
  }
}
