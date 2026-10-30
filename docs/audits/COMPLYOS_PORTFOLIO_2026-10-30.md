# ComplyOS compact portfolio dashboard

- Reduced local card, header, queue and rail padding using shared spacing tokens.
- Added renewal portfolio filters for stable legal entity and site IDs, jurisdiction and currency, backed by the existing tenant-scoped renewal register.
- Added recorded estimates, approved budgets, net paid and remaining funding; zero-priced lines are distinguished from missing cost records using a backend cost-line count.
- Entity-specific branch options, explicit unassigned dimensions and expandable scoped record links.
- Workspace-wide legacy work queue remains clearly labelled: certificates/applications do not carry the canonical cycle organisation links.
- Filters cover linked renewal cycles, not every company/site in the organisation directory. Amounts exclude unrecorded costs/penalties and do not combine currencies. Full ledger paging/server-side aggregation remains a scalability improvement for very large portfolios.

## Verification

- Web TypeScript check passed.
- Focused renewal finance service TypeScript check passed. A broader isolated route check encounters existing Fastify auth/JWT augmentation errors.
- Renewal finance integrity suite: 17/17 passed, including stable dimension IDs, unpriced currency scope and cross-tenant isolation.
- Browser fixture: actual disposable database tenant; entity, site, jurisdiction, currency and scoped record checks. 1440/768/390 widths with no horizontal overflow or runtime errors. Tenant cleaned in finally.
- Browser report: COMPLYOS_PORTFOLIO_BROWSER_2026-10-30.json.
