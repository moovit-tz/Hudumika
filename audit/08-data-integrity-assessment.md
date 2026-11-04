# Data integrity

Confirmed before fix: declaration rows accepted foreign and nonexistent shipment ids. Fixed at service boundary using tenant-scoped parent lookup/lock; shipment-link UPDATE now has explicit tenant predicate. No schema migration applied. Defense-in-depth composite FK and remediation of historical orphan/mismatched rows require separate design and read-only reconciliation.

Declaration event append-only triggers exist in migration 130. Audit fixtures that wrote ledger events are retained disabled with users inactive; triggers were never bypassed. This also means cascade deletion cannot be assumed to implement retention.

Status updates now lock the declaration, deduplicate same-status writes, enforce assessed→paid and paid→released, and serialize event-chain tip selection. Test: three concurrent PAID requests produce one PAID event and valid chain. Release event is awaited in the transaction.

Open: complete graph (e.g. draft→assessed), evidence of external assessment/payment, concurrent whole-form upsert/item replacement, item-number allocation, idempotent creation, immutable released content, notices/attachments, monetary fixed-point policy and audit completeness. No database crash, partition, deadlock or migration fault injection performed on shared local DB. Backup restoration NOT VERIFIED.
