# Hudumika Lens — Production Operational Runbook

## 1. Architecture Overview
Hudumika Lens is the central platform engineering management application for bug tracking, defect triage, issue lifecycle management, repository snapshots, and provider integrations.

- **Access Policy:** Platform-level engineering records are restricted to `SUPER_ADMIN`.
- **Intake Policy:** All authenticated users across all 38 Hudumika apps can submit reports via `POST /v1/lens/reports` or the `AppHeader` Defect Report modal.
- **Webhook Gateway:** Public receiver `POST /v1/lens/webhooks/:provider` with deduplication and HMAC signature validation.
- **Asynchronous Processing:** Transactional outbox with leasing worker `processLensOutbox()` ensuring at-least-once delivery with exponential backoff.

---

## 2. Deployment & Migration Sequence
1. **Apply Database Migration:**
   ```bash
   npm run db:migrate
   ```
   Ensures migration `918_lens_production_architecture.sql` applies tables (`lens_projects`, `lens_repositories`, `lens_connection_instances`, `lens_releases`, `lens_reports`, `lens_snapshots`, `lens_webhooks_inbox`, `lens_outbox_events`, `lens_comments`, `lens_item_relations`).

2. **Run Release Verification Tests:**
   ```bash
   npm run test -w apps/api -- src/tests/lens-production.test.ts
   npm run typecheck
   npm run check:design-system
   npm run check:encoding
   npm run check:triggers -w apps/api
   ```

3. **Verify Dev / Production Build:**
   ```bash
   npm run build
   ```

---

## 3. Snapshot Capture & Restore Drills
### Local Snapshot Capture
For uncommitted working trees or developer workstations:
```bash
npx tsx scripts/lens-capture.ts
```
Outputs:
- SHA-256 verified working tree patch in `out/lens-snapshots/patch-<commit>-<timestamp>.patch`
- Manifest file containing commit SHA, branch, file list, and byte size in `out/lens-snapshots/manifest-<commit>-<timestamp>.json`

### Remote Snapshot Capture & Restore Verification
1. Trigger snapshot capture:
   ```http
   POST /v1/lens/snapshots
   Authorization: Bearer <SUPER_ADMIN_JWT>
   Content-Type: application/json

   {
     "repository_id": "<REPO_UUID>",
     "scope": "patch",
     "commit_sha": "7297010f5905ffb31162715f78d9165d08a00b4a",
     "branch": "master",
     "content": "<PATCH_STRING>"
   }
   ```
2. Verify restore preview:
   ```http
   GET /v1/lens/snapshots/:id/restore-preview
   Authorization: Bearer <SUPER_ADMIN_JWT>
   ```
   Returns git diff stats, affected file manifest, and target restore branch name.

---

## 4. Webhook Inbox Deduplication & Queue Lag
- Inbound webhooks are recorded in `lens_webhooks_inbox` with unique constraint `(provider, delivery_id)`.
- If an external provider re-transmits a duplicate delivery ID, the inbox returns `{ accepted: true, status: 'duplicate_ignored' }` without duplicating events or item transitions.
- Delivery lag metric:
  ```sql
  SELECT provider, count(*) AS pending_deliveries,
         max(extract(epoch from (now() - created_at))) AS max_lag_seconds
  FROM lens_webhooks_inbox
  WHERE status = 'PENDING'
  GROUP BY provider;
  ```

---

## 5. Outbox Lease Recovery
- Outbox events in `lens_outbox_events` are locked during dispatch with `lease_token` and `lease_expires_at` (60-second leases).
- If a worker crashes mid-delivery, the lease expires automatically; subsequent worker runs reclaim expired leases:
  ```sql
  SELECT id, event_type, retry_count, last_error
  FROM lens_outbox_events
  WHERE status = 'FAILED' OR (status = 'PROCESSING' AND lease_expires_at < now());
  ```
- Trigger manual outbox flush:
  ```http
  POST /v1/lens/outbox/process
  Authorization: Bearer <SUPER_ADMIN_JWT>
  ```

---

## 6. Rollback Procedures
1. In the event of an unexpected schema or routing failure, Lens operations are isolated to the `lens_*` platform tables and do not interfere with business applications (ClearOS, FinOps, ComplyOS).
2. Report intake gracefully handles transient database stalls by logging errors while keeping user sessions responsive.
