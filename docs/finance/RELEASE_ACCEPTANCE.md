# Finance release acceptance

This is an execution checklist, not a completed certification. Record each run's commit, environment, dataset, duration, measurements and evidence files. Local regression tests do not establish production capacity.

## Provider acceptance

Local check on 8 October 2026 found no configured QuickBooks or Xero client ID/secret. Do not use production financial records to stand in for a sandbox. Use isolated test organizations with approved sandbox credentials, supported currencies and account/tax mappings.

For each supported document/payment path, prove: create, duplicate request, concurrent workers, expired token, rate limiting, timeout after acceptance, crash before local acknowledgement, restart, changed organization, wrong-currency/contact readback and reconciliation. Confirm provider records and local journals after every case. Keep credentials and raw personal/financial data out of evidence artifacts.

Xero invoice readback uses the official invoice endpoint: https://developer.xero.com/documentation/api/accounting/invoices. Current reconciliation requires an existing provider ID and exact number/contact/currency/total plus an authorized/paid status. It does not prove line-level tax mapping fidelity. QuickBooks AP exports and payment/bill reconciliation remain gated until supported adapters and acceptance evidence exist.

## Durable cross-app events

Before enabling redelivery, assign stable subscriber identities and prove idempotency for each handler. Persist event and per-consumer delivery state in the owning transaction. Dispatch only committed events; lease work with bounded tenant-scoped claims. Simulate crash after side effect before acknowledgement. A persistent event log alone is not a delivery guarantee. Marketplace webhooks need signed delivery identity, bounded timeouts, retries, dead-letter review and destination/entitlement checks.

## Capacity and noisy neighbors

Run against a production-equivalent isolated deployment with realistic tenant counts, 5,000-employee organization data, document/line/history sizes and skew. Employee count alone does not define concurrent load. Specify active sessions and requests/second before interpreting results.

Measure invoice/bill search, recurring pages, payment posting, aggregate cards, exports, outbox backlog and worker recovery. Include bursts, a sustained soak and one tenant exhausting its quota. Record p50/p95/p99 latency, errors, pool wait time, queue age, locks, CPU/memory/IO and tenant fairness. Verify accounting totals and exactly-once financial effects after the run. The chosen SLA and measured deployment capacity must accompany approval; no local in-process test is a substitute.

## Restore and failover

Use a separately provisioned empty recovery database and storage namespace. Never restore over the working or production database for an acceptance exercise. Restore an encrypted backup with its roles, migrations, objects and attachments; verify RLS, tenant counts, trial-balance equality, payment request keys, queued deliveries and audit records. Measure actual recovery time and data-loss window against the deployment's RTO/RPO.

On the isolated deployment, interrupt a worker and database connection during payment posting and external delivery. Verify rollback or confirmed committed state, restart recovery, uncertain-write quarantine and no duplicates. Record failover routing and pool reconnection evidence. Backup configuration and a successful dump do not prove restoreability.

## Security and accounting acceptance

Run tenant-ID smuggling, foreign-ID references, role/entitlement denial, customer-portal isolation, CSRF/session expiry, secret redaction and export access checks. Reconcile journals, invoice/bill balances, withholding tax, partial payments, void/corrections and period locks. Validate industry-specific contracts and Tanzania tax/provider behavior with the responsible accounting/compliance owner. Record exceptions; automated checks are not legal or regulatory certification.

## Local regression commands

```
npm run test --workspace=@hudumika/api -- src/tests/finance-accounting-outbox.test.ts src/tests/finance-accounting-sync.test.ts src/tests/finance-payment-integrity.test.ts src/tests/invoice-totals.test.ts src/tests/finance-date.test.ts src/tests/finance-recurring-pages.test.ts
npm run typecheck
```

A release requires passing checks on the exact deployed revision, completed external/infrastructure evidence and no unresolved blocking financial-integrity or security finding.
