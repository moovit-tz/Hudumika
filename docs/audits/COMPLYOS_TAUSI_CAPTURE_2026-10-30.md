# Tausi licence capture and reviewed import

## Working flow
1. Open Tausi in its own tab and sign in there. Hudumika does not receive portal credentials.
2. Display the licence details. Capture licence tab invokes the browser permission picker and captures one video frame, without audio. Tracks stop in finally, including failures.
3. Preview or discard the screenshot locally. Only Extract this screenshot sends it to the configured OCR provider. Document uploads remain available as the fallback.
4. Review and correct licence name, number, council, issue date, expiry and reported cost. Choose an existing customer if appropriate and confirm review.
5. Save to the actual permit vault. New tenant-scoped certificate rows retain source, capture method, reviewer, timestamp, taxpayer details, reported cost and status. Existing numbers are skipped without overwriting records. Repeated or concurrent calls through this endpoint are serialised by a tenant advisory transaction lock.
6. The vault exposes reported cost, import source, expiry and independent verification status.

## Backend
- Empty or malformed captures are rejected. Missing OCR configuration is HTTP 503. Provider errors/invalid licence fields produce HTTP 502. No Tausi demo fallback remains.
- Date/amount/string bounds and max 100 records enforced. Save is atomic; cross-tenant customer links fail before any insert. Existing authentication, ComplyOS entitlement and manage permission hooks protect both endpoints.
- Reported fees are metadata, not automatically posted Finance liabilities. OCR is not authority verification.

## Verification
- 6 capture/related extraction API tests passed using a stub OCR provider: no empty-capture demos, review-only extraction, invalid-provider dates, atomic/concurrent retry semantics, tenant isolation, foreign-customer rejection and preservation of the separate TRA extraction response. The combined capture/dashboard regression run passed 11 tests.
- Browser capture uses a fixture MediaStream and stub OCR response; actual save API and Postgres are used. Capture approval, stopped tracks, required review, edit invalidation, corrected persistence and vault visibility checked. 1440/768/390 initial layouts have no horizontal overflow. Disposable tenants cleaned in finally.
- Web and focused Comply service TypeScript checks passed.
- An OCR key is configured locally; no key printed, no live provider request or Tausi credentials used during these tests.

## Constraints
A normal web page cannot silently read a cross-origin portal iframe. This implements attended tab capture, not automatic government login, all-page crawling or background syncing. Users must capture each visible licence page or upload its complete statement. Native screen capture requires a compatible browser and secure context (HTTPS in deployment; localhost for development). Original screenshots are transient in this flow; only reviewed data/provenance is saved, not a source-document attachment.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
