# ComplyOS portfolio recheck and rework

## Changes
- Added visible comparison by entity, branch/site and jurisdiction, ordered by recorded remaining funding. Rows narrow the scope on click; a Clear scope control resets it.
- Added open commitments from the same verified financial ledger used by renewal finance. Preserved cents and distinguished unknown cost records from zero costs.
- Finance register links carry entity, site, jurisdiction and currency, including unassigned dimensions. The destination labels its filtered rows and provides a reset link; its headline overview remains explicitly workspace-wide.
- Reduced local card/metric spacing and used compact label/value rows on phones. Kept calculation assumptions in an accessible disclosure.
- Preserved a concurrent dashboard rewrite, restored the portfolio section inside it and repaired its unsupported checkSquare icon. Corrected audit-ready/legal-compliance wording that was based only on stored validity records.

## Verification
- Renewal finance integration suite: 17 passed, including tenant isolation and cost availability by currency.
- Focused API service TypeScript check passed.
- Web typecheck passed after resolving the unsupported icon in the concurrent rewrite.
- Disposable-tenant browser checks cover entity comparison, jurisdiction switching, entity/site dependencies, currency separation, empty intersections, record drilldown, and 1440/768/390 widths without horizontal overflow or runtime exceptions. Final browser details in COMPLYOS_PORTFOLIO_REWORK_BROWSER_2026-10-30.json.

## Limits
These are recorded renewal-cycle costs, not a complete legal liability forecast. Unlinked certificates and unrecorded costs are outside the portfolio. Remaining funding uses estimates minus payments; open commitments overlap and must not be added indiscriminately. The underlying register still loads all tenant cycles before local filtering; very large portfolios need server aggregation and paging.
