# Frontend, UX and accessibility

Frontend TypeScript result is recorded in evidence/web-typecheck-after.log. Browser harness uses Chromium and real Fastify handlers against a disposable tenant, forwarding browser requests via inject rather than mocking successful API responses. Third-party hosts are blocked. Routes attempted: operations, duty check, estimate history, sanctions screening and rate card at 1440/390. Actual outcomes, errors and overflow are in evidence/browser-results.json; see browser-test.log and screenshots.

An initial harness read the heading before authentication/data loading completed, failed, and was corrected to wait for visible heading (evidence/browser-test-initial.log retained). This is a test-timing correction, not a product fix or weakened product assertion.

These checks establish only rendering/runtime smoke behavior. Full keyboard/focus, screen-reader, contrast, 200% text scaling, RTL, all mobile breakpoints, error/offline recovery, populated records and PDF visual regression are NOT VERIFIED. No broad aesthetic redesign performed. Landed-cost four-card/report template untouched.
