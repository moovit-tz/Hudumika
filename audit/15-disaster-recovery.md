# Disaster recovery

BLOCKED for operational demonstration: no isolated production-equivalent backup set, restore credentials/host or approved disposable target was established. Do not restore over the shared local DB. No production infrastructure contacted.

Reviewed deploy/contabo/restore-check.sh: restores latest restic database dump into a generated isolated database, counts migrations and drops that test DB on exit. This script's existence is not evidence that it ran, that objects/secrets were recovered, or that business invariants reconciled.

Required release evidence: timestamped successful restore exercise, source/restore checksums and business counts, Cloud object verification, role/policy/migration parity, actual RTO/RPO, restored app login and representative workflows, secret/config reconstruction, corruption recovery and failback/rollback validation.
