# Obligations register redesign

Replaced four metric cards and separate agency cards with a single register. Status counts are interactive filters; reference/name/agency/frequency search and an agency selector narrow the register. Agency subheadings organise compact rows with names, reference/frequency, recorded deadline, status and fulfilment/delete actions. Rows wrap into readable mobile layouts without page scrolling horizontally.

Preserved the real API-backed fulfilment/delete actions, existing deep-link focus and the full-page add wizard. The UI explains that manually recording fulfilment neither verifies an authority submission nor advances a recurring deadline. No backend or automatic-renewal behaviour changed.

Verification: web TypeScript check; disposable-tenant browser checks at 1440/768/390 widths, status and search filters, agency selection, fulfilment persistence, focused deep links and add wizard. Details in COMPLYOS_OBLIGATIONS_REDESIGN_BROWSER_2026-10-30.json.
