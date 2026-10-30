# Renewal finance register redesign

Replaced nine metric cards with one funding-outlook panel containing three inline figures: 30-day funding, open commitments and net paid YTD. Longer forecasts, budgets, variance, due payables and calculation assumptions remain available in a disclosure.

The renewal register is the primary work surface, with an integrated search/status toolbar, record count, and eight columns instead of eleven. Entity/site/jurisdiction details sit beneath the permit; budget variance and committed amounts sit beneath their related monetary fields. Known zero costs differ from unknown costs, cents are preserved, and cost actions are semantic links rather than nested interactive elements.

Existing dashboard scopes, currency selection and actual API hooks remain connected. Loading hides stale values during currency transitions. No backend logic changed.

Verification: web TypeScript passed; disposable-tenant browser checks passed at 1440, 768 and 390 pixels without page overflow or runtime errors. Verified branch search, unpriced filtering, currency changes, expanded details and a real cost detail route. See COMPLYOS_FINANCE_REDESIGN_BROWSER_2026-10-30.json.
