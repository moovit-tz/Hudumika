# ComplyOS — action-first compliance desk

30 October 2026. Replaces the metric-led dashboard with a daily work queue, using existing ComplyOS data and navigation.

## Different approach

- **Daily brief:** a concise summary of expired permits or approaching renewals, with the current date.
- **Unified work queue:** expired and near-term permits followed by draft/rejected applications. Review, Renewals and Applications views share one searchable list. Each row opens the exact underlying record.
- **Planning rail:** deadline buckets, a compact workspace register, approval workload and renewal finances. On phones this moves beneath the queue.
- **One primary action:** New application; refresh reloads the existing data sources. The former KPI-card row and standalone recent-application panel are gone.

Shared `PageHeader`, `Card`, `Tabs`, `SearchToolbar`, `Badge`, `FeaturedIcon`, `Banner` and `Button` components retain the Hudumika design-system settings. Layout styles live in `apps/web/src/pages/ComplyDashboard.css`.

## Data boundaries

The queue displays up to ten matches. Renewal entries and horizon buckets use the existing eight-record deadline preview, explicitly labelled as a preview. Workspace counts use aggregate dashboard statistics. Pending applications are separated from draft/rejected items requiring review. No new authority connection, compliance score, payment or automation capability is implied by the layout.

Unavailable data sources display errors and recovery controls; an empty failed queue is labelled incomplete. No backend service or schema was changed for this redesign.

## Verified

- Web TypeScript check passed.
- Design-system contract (19 checks) and encoding checks passed.
- Browser checks at 1440px, 768px and 390px: one heading, one primary creation link, no document-width overflow, no JavaScript errors.
- Verified queue priority, tab switching and search; exact permit/application links; filtered register links; refresh showing a database edit; application error/retry recovery; profile error handling.
- Disposable test tenant removed. No external submissions, messages or real payments were made.

Evidence: `COMPLYOS_DESK_BROWSER_2026-10-30.json`, `comply-desk-*-2026-10-30.png`, and `.tmp/comply-desk-*-final.log`.
