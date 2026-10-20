# Fleet partner categories — 20 October 2026

Implemented 18 shared category codes in @hudumika/types. Garage/workshop remains WORKSHOP for compatibility. A company can have a primary category and multiple additional service capabilities. Existing records retain their category and receive an empty capability list.

Migration 611 adds a non-null text array with a bounded size. Existing tenant isolation and explicit tenant filters cover vendor create, update, list and detail. API validation accepts only the shared categories, bounds the list and deduplicates selections. Active status is respected on creation.

Both forms persist capabilities. Directory filtering and search include secondary capabilities. Profiles show category guidance without inventing service contracts, approvals or accounting balances. Category controls wrap; forms have bounded vertical scrolling.

Verification:
- Migration 611 applied successfully to the local database.
- Freight integration suite: 12/12 tests passed. New test covers all 18 categories, capabilities, deduplication, update/read persistence, unknown-code rejection and foreign-tenant access rejection.
- Signed-in browser: all categories visible; garage multi-service controls work. No test vendor added to the user's workspace.
- At 375px, directory and form document widths equal viewport width (no horizontal page overflow).
- Full npm run typecheck passed: API and web TypeScript, Studio triggers, design-system contract and encoding checks.

Scope: this is the partner directory feature. Actual supplier onboarding, authorisation evidence, contracts, bills, payments and provider integrations require their own real records. Category membership does not assert approval, manufacturer authorisation or an integration.

