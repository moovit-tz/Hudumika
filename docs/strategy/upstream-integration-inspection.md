# Source inspection notes for the Claude implementation prompt

Inspected on 2 November 2026. Read-only Git retrieval; no upstream install, build, test, migration or deployment scripts were executed. No source app was integrated in this step.

## Access and provenance

The GitHub connector returned reauthentication-required errors. Local Git access succeeded for all four repositories. Inspection used shallow, filtered, no-checkout clones in a temporary review directory; the implementation must retrieve/pin its own durable sources.

| Repository | main HEAD inspected | Product observation |
|---|---|---|
| moovit-tz/tuma-web | 1af95b0a3c436c1c311c8e154ba8b4681e31dc09 | Next.js/React frontend; MySafari parcel portal package naming |
| moovit-tz/tuma-api | 9025f305e58869fc6657cd36ddc35932b00f46e5 | Express/Prisma/Postgres parcel backend; one product with tuma-web |
| moovit-tz/LexCore | 4875f43f2a69b6fe9874f1b839fdb44646ca3270 | Fastify/React-Vite/Prisma monorepo with legal and privacy models |
| moovit-tz/ngao | 3cebb9b024207345b589aaeeb7c6d45f552ba069 | Closely overlapping LexCore monorepo; same package naming and Ngao roadmap |

## Significant integration finding

At these commits, recursive Git tree/blob comparison found only five differing file paths between LexCore and Ngao:

1. apps/api/.env.example
2. apps/api/src/app.ts
3. apps/api/src/config.ts
4. apps/api/src/lib/flutterwave/index.ts
5. apps/api/src/routes/billing/index.ts

Tree SHAs:
- LexCore: d98736384b59b97c68471bba2a387a10f57eeab1
- Ngao: 67c028dcdbe9a43dbb6d65990787259f227d1c5b

This demonstrates source overlap, not functional equivalence, a canonical upstream choice or production readiness. No secret values from environment files were inspected or copied. Root README.md was absent in both.

The prompt requires separate app experiences where justified, shared implementation for common functionality, and explicit review of authentication, provider and billing differences. It does not instruct Claude to delete one requested app or to import two copies of the same platform.

## Domain observations

Tuma schema/routes include parcels, tracking, companies, booking offices, users/admins, roles, shifts, handovers, floats, beneficiaries/commissions and invoices. Its actual scope exceeds the earlier strategy's last-mile assumption.

LexCore/Ngao schemas include legal clients/matters/court events, deadlines/time/disbursements/invoices, trust accounts/transactions, conflicts/KYC, documents, privacy assessments, processing activities, incidents and rights requests. Trust funds and legal confidentiality require explicit preservation.

These are static source observations. No source feature was functionally certified. Legal roadmap text is not authoritative regulatory guidance.

## Deliverable

Use claude-hudumika-platform-implementation-prompt.md as the copy-ready implementation brief. It includes the evidence above, native integration requirements, billing/tenant invariants, data migration boundaries and acceptance gates. The HTML strategy remains a design proposal; its sample rates are not approved production pricing.

