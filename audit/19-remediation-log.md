# Remediation log

Source changes only: apps/api/src/services/declaration.service.ts; apps/api/src/services/customs.service.ts. New tests: clearos-production-boundaries.test.ts, clearos-fx-failure.test.ts, clearos-browser-audit.test.ts. Audit documentation/evidence added. No migration, dependency, deployment or existing customer mutation.

1. Reproduced foreign/missing shipment acceptance. Added scoped lookup + row lock and explicit tenant predicate on shipment update. Boundary tests pass.
2. Reproduced draft→PAID acceptance. Added PAID requires ASSESSED / RELEASED requires PAID and same-status idempotency. Full lifecycle remains open; this is partial remediation, not a complete customs authority workflow.
3. Reproduced invented2540 FX on upstream failure. Removed invented/stale success fallback, validate finite positive provider rate, require verified override on failure. Test passes.
4. Source-confirmed unawaited transactional release event/chain-tip race. Await release insertion and dispatch only after commit; lock chain parent and status writer. Concurrent PAID chain and post-commit release-subscriber tests pass. Release-event rollback/fault injection NOT VERIFIED.
5. Corrected touched stale service comment about superuser RLS. No assumption that all stale documentation is corrected.

Evidence: before logs and declaration-probes-before.json retained; final regression log. Source rollback should use exact reviewed changes only; baseline contains pre-existing user edits in other files.
