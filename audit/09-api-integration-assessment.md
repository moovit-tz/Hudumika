# APIs and integrations

Inventory: evidence/api-inventory.json. Reviewed customs/declaration/shipment/sharing boundaries. ClearOS depends on shared reference tariffs, FX upstream, sanctions OFAC/UN sources, AI suggestions, Cloud document storage and notification/event infrastructure.

FX provider has a 6-second request timeout and one-hour cache. The old unverified default and expired-cache success fallback were removed. Fresh response must be a finite positive number; outage requires explicit verified override. Live upstream correctness, bounded response size and non-USD stale-rate metadata remain NOT VERIFIED.

Sanctions fetchText currently lacks an explicit timeout; screenSubject derives clear from no matches without proving a usable fresh corpus. Marked open source-confirmed logic risk, not a reproduced live false-clear against an actual empty production dataset.

Public reports use random token and expiry; creation authenticates/entitlement checks, reads resolve tenant through token. Token revocation, recipient consent, rate/size abuse, malformed unlock fields and full share→lead concurrency were not exercised. External-provider replay, payment webhook authenticity and government API contracts are NOT VERIFIED.
