# SEAL action recheck — 2 November 2026

This is an action-level recheck following the missing lot editor. A page rendering
is not evidence that its forms save correctly. The coverage below distinguishes
browser interactions from API integration tests against isolated real tenants.

## Corrections implemented

- Lots have an Edit Lot action and a dedicated three-step route at
  `/seal/lots/:id/edit`: details, storage/handling, review and correction reason.
  The detail page displays batch, serial, expiry, measurements, destination and
  marks, and provides an Edit History tab with the actor and before/after values.
- Updates validate product ownership, classifications, dates and measurements.
  A version timestamp prevents concurrent edits from overwriting newer changes.
  Physical quantity, units, owner, receipt date, location, customs state and fiscal
  values cannot be changed through this metadata endpoint.
- Returns use the supported return movement type, require a reference and cannot
  exceed recorded issues. Pure moves cannot inject quantity changes. Customs
  transitions require a reference.
- Appointments now save vehicle/driver/notes, support rescheduling on a dedicated
  page, filter the selected warehouse/date and enforce valid gate status changes.
- Consignment creation and tally forms accept their actual nullable optional
  fields. Gate-in is transactional and repeat-safe. Tallying is atomic, derives the
  entry status from the facility type, records completion per container, and blocks
  duplicate receipt of the same container. The UI marks tallied containers.
- Consignment lists use the warehouse scope and real container gross weights.
- Missing lot, consignment and fulfillment records show errors instead of an
  indefinite spinner. Document-load failures are also visible.
- SEAL JSON form references are checked against the signed-in tenant. Container
  creation verifies its parent consignment. Document lists/uploads verify parent
  ownership; document queries explicitly include the tenant filter.
- Blank guarantee issuer and declaration origin/reference fields now match the
  payloads sent by their forms.

## Verification coverage

`apps/api/src/tests/seal-operations-integrity.test.ts` contains 15 passing tests.
They exercise:

| Area | Actions exercised against the database |
| --- | --- |
| Receipt / stock | Receive, read balances, warehouse scoping, tenant isolation |
| Lot editing | Save metadata, read actor/reason/history, protect immutable fields, reject invalid dates, reject stale/concurrent/foreign edits |
| Storage | Fix missing CBM, calculate charges, generate/list invoices, prevent duplicate billing |
| Counts | Snapshot, record quantities, reconcile, reject stale counts, avoid double posting |
| Transfers | Request, approve, execute, move the lot, verify movement chain |
| Fulfillment | Reserve, reject overbooking, pick, pack, dispatch, cancel and release reservation |
| Returns | Restore issued stock; reject excessive returns and invalid move deltas |
| Receiving | Create consignment/container, gate in, roll back an invalid tally, tally successfully, reject duplicate tally |
| Appointments | Save details, filter warehouse/date, reschedule, check in, dock, complete, reject invalid transitions |
| Operations | Create/update task, reject foreign assignment, create yard slot, create equipment and log maintenance |
| Automation | Create a low-stock rule and evaluate it to create real tasks |
| Customs | Create guarantee/declaration, record manual submission/selectivity, block assessment pending examination, complete examination, assess/pay/release |
| Stock account | Generate a period and record its manual submission reference |
| Documents | Upload, download, verify, delete; reject access to another tenant's parent |

Browser checks against the running API covered lot Edit → Next → Review → Save,
reload persistence, edit history, a return, appointment creation/rescheduling and
its gate lifecycle, mobile rendering, and missing-record handling. Menu rendering
and mixed standard/bonded navigation are checked separately; they are not presented
as substitutes for mutation tests.

## Boundaries retained

- Historical FinOps/production item stock and SEAL lot stock remain separate;
  no speculative balance merger or ownership backfill was performed.
- Transfers move whole lots. Partial-lot splitting is not implemented.
- Customs submissions and stock-account filing record human-provided references;
  these checks do not transmit declarations to a government system.
- Stock-account quantities are reconstructed from movements. Its duty/tax
  exposure fields still use current lot values, as documented by the existing
  stock-account service; historical fiscal reconstruction is not implemented.
- External storage/Drive configuration and live government/third-party systems
  are not certified by the local integration suite.

Verification tenants are disabled after tests. Their immutable movement records
are retained rather than weakening append-only database protections for cleanup.
