# Cloud production-readiness audit — 19 October 2026

**Verdict: request changes before production use with sensitive documents.** The core product is functional, but passing the existing tests does not cover several privacy, authorization, data lifecycle and concurrency gaps. No audit can establish “100% production ready”; the release gates below provide measurable acceptance criteria.

## Scope and evidence

- Reviewed Cloud home, grid/list browser, PDF viewer, sharing UI, drive context and route wiring.
- Reviewed files/drives routes, file/drive authorization, uploads, versions, anonymous links/invitations, OAuth connectors, scanning, retention, object storage and scheduled maintenance.
- Browser: signed-in home loaded 408 items; root folder listing rendered; list mode and details panel opened; actual PDF viewer rendered a three-page document and moved to page 2. Viewed mobile at 390px. No existing user file was edited, shared, deleted or uploaded during this audit.
- Existing automated suite: **7 files / 66 tests passed**, runner exit 0; hook timeout 60 seconds. Files: cloud-authz-hardening, cloud-drive-personal-isolation, cloud-drive-rls, cloud-uploads-and-invites, cloud-scanning-and-streaming, storage-quota-accounting, storage-product-billing-retention.
- **Full `npm run typecheck` passed**, including API/web, 106 workflow-trigger checks, 19 design-system checks and encoding check.
- Five temporary diagnostic probes used disposable tenants. Four exposed defects below. A concurrent completion probe returned one success and one 404; it did **not** demonstrate duplicate creation. Probes recorded observed behavior rather than asserting secure behavior. Fixtures and their explicitly created object keys were cleaned up; the temporary test source was removed after review.
- Live `GET /health`: `status=healthy`, `antivirus=not_configured`. This is local-environment evidence, not a claim about a separate production deployment.
- Audit was read-only against product code. Existing unrelated working-tree changes were preserved.

## What works, and limits of that statement

| Capability | Evidence | Qualification |
|---|---|---|
| Home and grid/list browser | Live browser | Large-drive behavior needs the scaling fixes below. |
| Real PDF preview, pages and zoom controls | Browser: 3 pages, navigation to page 2 | Card thumbnails are not real PDF thumbnails. |
| Personal/shared drive isolation on normal paths | Existing integration tests | Entity-filter path bypasses the normal access gate (F01). |
| Direct download, exact-file shares and comment/version gates | Existing authorization tests | Permission inconsistencies and historical scan gaps remain. |
| Uploads, resumable sessions and invitations | Existing API tests | Concurrency, parent validation and retry issues remain. |
| Content search | Existing test finds content text | Limited result window and home-page search wiring remain. |
| Storage usage, versions/trash accounting and add-on billing logic | Existing isolated tests | No atomic quota reservation; orphaned bytes escape accounting. These tests do not validate real payment processing. |
| Legal holds and retention checks | Existing tests | Does not prove immutable/WORM storage or legally sufficient retention. |
| Scan integration and pending/infected blocking | Existing scanner/policy tests | No real scanner configured locally; legacy/internal/version bypasses remain. |
| Expiring/revocable external invitations | Existing isolated tests | Real SMTP delivery and recipient identity assurance were not tested. A bearer link can be forwarded. |
| OneDrive integration | Real OAuth/Graph implementation in source | Not connected in the audited workspace; OAuth must be repaired before live sign-off. |
| Box / Dropbox / Mega | Explicit unsupported-sync response | These are bookmarks, not working storage integrations. |

## Confirmed and source-supported findings

Priority: **P1** = release blocker for sensitive-document use; **P2** = required correctness/usability/scaling work. “Reproduced” means an isolated diagnostic or live browser observation. “Source-confirmed” identifies the exact implementation; it is not a claim that a live exploit was attempted.

### F01 — P1: entity-filter listing bypasses personal/shared-drive access [reproduced]

**Source:** `apps/api/src/routes/files.routes.ts:433` (entity-filter branch), `:454` (generic entity query); comparison normal drive gate at `:540`.

The `entity_type` + `entity_id` path scopes by tenant but does not apply drive membership or exact-file sharing. A SALES user queried employee-tagged files and received a record stored in another user's private personal drive: **HTTP 200, private row present=true**. Serialization includes metadata such as owner, storage key and potentially share token. This is same-tenant privacy failure; the audit did not demonstrate a cross-tenant read.

**Fix:** one shared visibility predicate for normal listings, entity listings and search; validate entity access too. Return only client-required metadata. Test private and restricted shared drives under every query mode.

### F02 — P1: uploads accept an inaccessible or mismatched parent folder [reproduced]

**Source:** `files.routes.ts:745`, `:755`, `:763`; session creation `:864`.

Ingest checks the chosen drive but assigns the supplied `parent_id` without requiring a live folder in that same drive and accessible tenant context. Probe: Bob uploaded to Bob's drive with Alice's private-folder ID as parent; **HTTP 200**, both mismatched IDs persisted. Parent counts/entity inheritance can also touch the other folder. A global parent FK is not authorization.

**Fix:** validate parent tenant, drive, type, trash state and write permission before scanning/staging/insert. Validate supplied entity references and enforce hierarchy invariants in the DB where possible. Cover single uploads and resumed completion.

### F03 — P1: OAuth state is generated but never validated [source-confirmed]

**Source:** `files.routes.ts:2056`, `:2062`, `:2073`; `apps/web/src/pages/cloud/ConnectorOAuthCallback.tsx:24`.

The authorization URL includes random state, but it is not stored as a user/session-bound single-use challenge. The browser callback forwards only the code; the API exchanges that code without validating state. General API CSRF protection does not bind the provider authorization response to its initiating login session. This permits account-linking/login-CSRF scenarios.

**Fix:** expiring, single-use server-side state bound to tenant, actor, session and provider; reject missing/mismatched/replayed state before exchange; add PKCE where supported; validate callback provider and redirect URI. Test malicious/replayed callbacks without contacting a real account.

### F04 — P1: ordinary staff can mutate tenant-wide storage connections [reproduced]

**Source:** `files.routes.ts:2043`, `:2062`, `:2103`, `:2148`, `:2173`.

Only credential configuration requires admin status. Other connector mutation routes exclude CUSTOMER but permit ordinary staff. A SALES user disconnected the disposable tenant's OneDrive connection with **HTTP 200**. OAuth callback can replace the tenant-wide linked account; external-file listing is tenant-wide, not per drive/member. Some mutation responses return `selectAll()` including encrypted credential fields, although listing carefully strips them.

**Fix:** explicit connector-manager authorization for consent, callback, connect/disconnect and sync; decide shared versus personal connector ownership. Use one safe response serializer that never returns secret/token ciphertext.

### F05 — P1: malware policy does not cover legacy, internal and historical content consistently [source-confirmed]

**Source:** `apps/api/src/lib/cloud-scan-policy.ts:37`; `apps/api/src/services/cloud-sync.service.ts:186`; `files.routes.ts:1819`, `:1838`, `:1885`; migration `236_cloud_file_versions.sql`.

`servingBlock()` rejects only `infected` and `pending`: null/unknown/`skipped` remain downloadable even when scanning is required. App-generated/synchronized Cloud rows can arrive without scan metadata. Versions store no independent scan result. Version download checks the current file's scan status, and restore copies historical bytes without scanning or replacing scan metadata/search text. A clean current file does not attest to an older version's bytes. Restoring older text also leaves search indexed against the replaced content.

**Fix:** explicit policy for trusted internally generated content; fail closed for unknown/unscanned external bytes under required scanning. Track immutable per-version digest, scan result and scan time; verify/rescan restored bytes; update current scan and search metadata atomically. Test legacy/null rows, historical pending bytes and restored content search.

### F06 — P1: replacing/restoring a version can leave the DB pointing to missing or incorrect bytes [source-confirmed]

**Source:** `files.routes.ts:1766–1783`, `:1869–1895`.

Version upload archives old bytes, deletes the live object and writes to the canonical live path before the SQL transaction commits. A failed upload/commit rolls back database metadata but cannot roll back object deletion/overwrite. Restore similarly overwrites the live object. Concurrent writers are not serialized with a row lock/version precondition.

**Fix:** write new immutable object keys, verify bytes, lock or compare document revision, commit the DB pointer, then retire old keys through a retryable outbox/GC process. Inject storage failures and DB commit failures into tests; test concurrent updates and stale revisions.

### F07 — P1: permanent deletion leaves archived objects behind [reproduced mechanism; deletion paths confirmed]

**Source:** `files.routes.ts:1321`, `:1353`; `apps/api/src/jobs/cloud-trash-expiry.job.ts:49`; migration `236_cloud_file_versions.sql:14`.

Deletion removes the current object and file row. Version rows cascade away, but their archived object keys are not deleted. A disposable version object remained readable after its parent metadata/version rows were removed: **object remains=true**. This leaves retained private bytes, orphaned storage costs and usage that disappears from SQL accounting despite bytes still existing. Office preview-cache objects also need a lifecycle policy.

**Fix:** enumerate live/version/preview/chunk objects before metadata deletion, queue reliable deletion and retain tombstones until confirmed. Exercise manual purge, empty Trash, expiry and tenant deletion, including failure/retry and legal holds.

### F08 — P1: CUSTOMER permanent-delete rule does not enforce uploader ownership [source-confirmed]

**Source:** `files.routes.ts:1337`, especially customer branch around `:1346`.

The route comment says customers may delete only files they uploaded. The implementation checks only `entity_type='customer'` and that customer's ID. A staff-uploaded document tagged to that customer satisfies the same condition; no original-uploader check distinguishes it. This can permit a customer to permanently remove staff-provided records unless separately retained.

**Fix:** persist and verify immutable uploader identity/source and a deletion capability; entity association alone is not ownership. Test customer-uploaded versus staff-provided files, legal hold and retention.

### F09 — P1: rescan queue can permanently starve pending files [source-confirmed]

**Source:** `apps/api/src/jobs/cloud-storage-maintenance.job.ts:24–44`.

The job takes the oldest 50 rows, then skips anything over 25 MB or with missing bytes. Those skipped rows remain at the head of the next batch. Fifty such rows can prevent all newer files from being scanned. Large uploads are supported up to 1 GB, but files over 25 MB have no recovery path in this rescan job. A missing scanner at upload time can therefore strand valid documents indefinitely.

**Fix:** filter eligible work before LIMIT, schedule retry/error state and fair ordering, support scanner-configured size limits/streaming, and alert on queue age/backlog. Test >50 ineligible rows followed by an eligible file.

### F10 — P1/P2: quota and resumable upload concurrency are not atomic [source-confirmed; limited completion probe]

**Source:** `apps/api/src/lib/storage-quota.ts:176`; `files.routes.ts:713`, `:921`, `:927–960`.

Quota is a read/sum followed by an independent write, so concurrent uploads can each pass against the same remaining allowance. Staged chunks are not reserved as used storage. Chunk receipt performs read/modify/write of a JSON array with no lock/atomic set, allowing lost receipt entries. Completion has no atomic state claim and does not return the completed file for a safe retry. The diagnostic concurrent completion returned **200 + 404**; duplicate completion was **not** reproduced and remains a code-level race risk, not a demonstrated exploit.

**Fix:** tenant quota reservations/serialized accounting, atomic per-chunk rows or updates, idempotent completion with a unique committed result and bounded session/tenant staging budgets. Test parallel chunks, lost HTTP responses, repeated completion, multi-process writers and quota boundaries.

### F11 — P2: folder sharing and folder Trash behavior are incomplete [source-confirmed]

**Source:** `apps/api/src/lib/cloud-file-access.ts:42`; `files.routes.ts:540`, `:1248`; `apps/web/src/pages/cloud/modals/ShareModal.tsx`.

Shares resolve on the exact file only. Sharing a folder does not grant its children or the drive listing needed to browse them. Trashing a folder marks just that row, leaving children non-trashed and available to search/direct reads/links. Deleting the folder later uses `ON DELETE SET NULL` for children, resurfacing them at root instead of deleting the subtree.

**Fix:** define folder inheritance and subtree trash/restore semantics, then implement consistently across list/search/download/share/delete and retention. Until supported, disable folder sharing with an explicit explanation.

### F12 — P2: non-image thumbnails show fabricated document content [live UI + source]

**Source:** `apps/web/src/pages/cloud/components/DocThumbnail.tsx:38–99`.

PDF/Word cards draw hardcoded CONFIDENTIAL, Authorized Signatory and SEAL markings. Spreadsheet cards draw Widget A/B prices and a USD 1,500 total unrelated to the actual file. The live browser exposed this in the accessibility tree. Actual PDF viewing works, but the card artwork can mislead users about document contents and signature status.

**Fix:** real sanitized thumbnails generated from file bytes/version, or honest file-type placeholders. Never fabricate signatures, seals, classifications or amounts; mark decorative artwork aria-hidden if retained solely as an icon.

### F13 — P2: unsupported connectors appear successfully synced [live UI + source]

**Source:** `files.routes.ts:2103`, `:2173`; `apps/web/src/pages/cloud/home/ConnectedStorageCards.tsx:65`.

The home page showed Dropbox “0 files — synced”. Box/Dropbox/Mega have no transfer integration; their connect route stores a bookmark and sync returns 501. OneDrive is the only real integration in this implementation.

**Fix:** call these external shortcuts/bookmarks, show “sync unavailable”, and remove successful sync wording/actions until a real integration exists. Test actual provider failure/revocation and refresh behavior before claiming OneDrive production support.

### F14 — P2: pagination does not bound total data loading; search truncates silently [source-confirmed]

**Source:** `apps/web/src/shells/cloud-context.tsx:512`; `apps/web/src/pages/cloud/FileBrowser.tsx:89`; `files.routes.ts:528`.

The provider still loads the entire flat drive on mount even though the main folder list uses pages. Home, recent, stars, trash and various selectors depend on the full in-memory copy. Search caps at 60 results (other filters 200) without a result cursor. Large drives therefore retain high DB/network/browser cost and users cannot reach every search match.

**Fix:** dedicated paginated endpoints for folder/recent/starred/trash/search plus aggregate summaries; cancel/stamp stale folder requests during navigation; load details on demand; performance tests with realistic 10k/100k-file datasets. Keep counts and navigation stable under mutation.

### F15 — P2: UI capabilities, keyboard access and mobile viewer controls need completion [source/browser]

**Source:** `apps/web/src/pages/cloud/components/FileMenu.tsx:25`; `components/FolderCard.tsx:25`; `components/FileCard.tsx:31`; `Cloud.css:506`; `CloudShell.tsx:20` and `CloudHome.tsx:52`.

- Most file menus show Rename/Share/Move/Trash without receiving effective capabilities; read-only users can be offered actions the API rejects.
- File/folder cards are clickable/draggable non-button surfaces without a keyboard open interaction. A menu alone does not make card/folder navigation equivalent.
- Mobile PDF toolbar overflows horizontally and hides its scrollbar, so actions such as Close/Share may require an undiscoverable horizontal swipe. Details view also leaves the floating upload control over content.
- Home binds header search state but does not render the file-browser search results or navigate to them. File-level Editor sharing and drive-only rename gates also need one consistent capability contract.

**Fix:** return effective file capabilities, apply them everywhere, add keyboard navigation and focus management, use a mobile actions menu with a persistent close control, and connect home search to visible results. Add role-based browser tests at 320/390/768 widths and keyboard-only navigation.

## Operational release gates — not established by this local audit

1. **Malware service:** configure real ClamAV, test real clean/infected/timeout/oversized scenarios, monitor queue age and fail readiness appropriately when required scanning cannot operate. Local health currently says healthy while scanner is absent.
2. **Durability:** verify chosen object-store configuration, encryption, restricted bucket policy, versioning/replication, key management, backups and a timed restore drill. Database backup alone cannot recover document bytes.
3. **Connectors:** repair OAuth/authorization first, then test a disposable real OneDrive account through connect, listing, token refresh, revoke, reconnect and sync failures. Do not touch customer production accounts for these checks.
4. **Invitations/mail:** verify SMTP delivery/bounces/retries, link expiry/revocation, anti-abuse limits and intended authentication level. An emailed bearer link is not proof the named person opened it.
5. **Deployment:** verify TLS/reverse-proxy body limits, streamed downloads/range support for large media, horizontal-worker coordination, cron singleton/locking and resource budgets. Download/preview/public-link paths currently buffer complete files, so 1 GB uploads do not imply safe 1 GB viewing under load.
6. **Data governance:** approve Business Records visibility: current business-drive policy grants all staff read/write, including app-managed employee records. Decide HR/finance/customer confidentiality boundaries and tenant-admin authority before handling sensitive content.
7. **Observability:** storage/DB reconciliation, failed deletes, orphan counts, upload error rate, queue lag, quota drift, provider failures, security events and alert ownership. Prove alerts through injected failures.
8. **Release tests:** convert findings into tests that assert denial/atomicity/recovery; repeat isolated security tests after fixes and run an end-to-end disposable-tenant workflow. Existing 66 passing tests are a baseline, not release approval.

## Suggested delivery order

1. **Privacy and access:** F01–F04, F08; settle Business Records visibility.
2. **Trust and data safety:** F05–F09, object lifecycle, immutable version writes, real scanner and restore drill.
3. **Reliability at scale:** F10–F11, F14, full-file buffering, observability and failure injection.
4. **Truthful and usable UI:** F12–F13, F15, keyboard/mobile/capability checks.
5. Run the complete acceptance workflow and obtain deployment evidence before release. Do not represent this audit as a certification or a guarantee of zero defects.
