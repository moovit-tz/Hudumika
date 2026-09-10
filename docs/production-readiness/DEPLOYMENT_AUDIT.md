# Hudumika — Deployment & CI/CD Audit

Snapshot 2026-09-10.

## CI (HUD-0006 — HIGH)

`.github/workflows/` = **one** workflow, `dependency-audit.yml`:
- Triggers: push/PR touching `package.json` / lockfile, weekly cron, manual.
- Runs `npm ci` then `npm audit --audit-level=high` with `continue-on-error: true`.

There is **no** workflow that runs typecheck, lint, `vitest`, `npm run build`,
`check:triggers`, or migration validation. A green check means only that `npm ci`
resolved. This does not satisfy "a green pipeline must mean something".

### Recommended `ci.yml`

```
jobs:
  verify:
    - npm ci
    - npm -w packages/types run build && npm -w packages/ui run build
    - npm -w apps/api run typecheck          # tsc --noEmit + check:triggers
    - npx tsc --noEmit -p apps/web/tsconfig.json
    - npm run lint
    - services: postgres:13
    - npm -w apps/api run db:migrate         # dry-run on empty DB (also catches HUD-0009)
    - npm -w apps/api test
    - npm -w apps/web test                   # once web tests exist (HUD-0005)
    - npm run build
```

## Environment (HUD-0015 / HUD-0016 — LOW)

- Real config is the **root `.env`** (`DATABASE_URL=postgresql://postgres@localhost:5433/clearos`,
  `JWT_SECRET`, MinIO, Meta WA, SMTP, AIS, the 3 extra DB roles). `apps/api/.env` only holds
  `ANTHROPIC_API_KEY`.
- `config/env.ts` defaults are stale: default `DATABASE_URL` points at
  `clearos:clearos_pass@localhost:5432` which fails auth. A dev relying on defaults is broken.
- Confirm `.env.example` enumerates every key a fresh clone needs (roles, JWT, storage, comms).

## Migrations (HUD-0009 — FIXED, VERIFIED)

Forward-only plain SQL, one txn per file, tracked by filename in `_migrations`.
479 applied vs 470 on disk pointed at real drift, confirmed by actually running
`db:migrate` against a from-scratch database: 2 real bugs (a fresh-install-unsafe
seed insert, and a table with no creating migration) — both fixed, see
AUDIT_REGISTER.md HUD-0009. **A clean `db:migrate` now reproduces production's
schema exactly** (474/474 apply, 0-diff against live). Still add the CI dry-run
above so this can't silently regress.

## Not yet audited

- Staging vs. production parity (URLs, secrets, CORS origins, webhook endpoints, cron
  workers, background job runner, object storage bucket).
- Container / process model for the API + job scheduler in production.
- Zero-downtime migration story for the `text`→`uuid` `tenant_id` change (HUD-0007).
- Health/readiness probes beyond `/health` (DB, Redis, MinIO reachability).
- Log shipping / retention; `api_dev.log` at 27 MB locally suggests unbounded local logging.
