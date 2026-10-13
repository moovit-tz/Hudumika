# Email and workspace communication audit — 13 October 2026

## Delivery reliability follow-up

The interrupted implementation was resumed and reviewed on 13 October. Current delivery code preserves multiple attachments, BCC, sender references and threading metadata; blocks sends with unavailable attachments; renews worker claims and checks ownership before saving results; and hands scheduled messages to the outbox atomically. Communication dispatch now commits its outbox envelope, log link and initial attempt together, preventing a worker's completed status from being overwritten by dispatch.

Verification: all 12 tests across Email, durable delivery and communication registry passed with a 60-second database hook timeout. The initial run passed every test case but exceeded the default 20-second cleanup hook timeout. An additional delivery-log reconciliation regression then passed with the six-test durable delivery suite. Transport and file reads are mocked in delivery tests; these results establish database/worker behavior, not external delivery.

The full repository `npm run typecheck` also passed, including 106 Studio trigger mappings, 19 design-system checks and the encoding check.

Remaining work includes full IMAP folder/flag/deletion synchronization, provider-backed mailbox provisioning and authoritative DNS values, historical delivery-log reconciliation, inbound business-record reply links, and live send/receive/reply verification with configured credentials. The older findings below are an audit history and should not be read as the current implementation status.

## Recheck after subsequent code changes

The findings below describe the original audit; this section records changes observed in the later recheck on 13 October 2026.

Improved in current source: missing transport now returns failure (development simulation returns `success: false`); MailService/outbox explicitly store simulated outcomes; BCC, personal sender references and threading metadata are persisted; scheduled sends pass BCC; Onsite account placeholders start with IMAP disabled and clearer credential-required wording; DNS activation requires all four checks and MX comparison accepts an expected host. These are partial fixes, not verified live delivery.

Still blocking:

- Migration 598 exists in source, but none of its queried envelope columns exist in the local database. Source and database are out of sync; the new send path cannot be called deployed until migration and worker tests pass.
- The scheduled worker writes `folder = 'sending'`; the latest declared folder constraint (migration 462) does not allow that value, and migration 598 does not change it. The worker also has no recovery selection for interrupted sending rows.
- Outbox row locking was added, but the claim does not advance `next_attempt_at`. A sending row whose previous timestamp is already due becomes selectable immediately after the claim transaction commits, so another worker can still resend it. A real lease and completion ownership checks are needed.
- Reconciliation targets `communication_deliveries`, which is absent in the local database and has no matching migration/type. The actual logs are `comm_delivery_log`; dispatch does not populate the new `communication_delivery_id` link. Reconciliation remains incomplete.
- Multiple attachments still are not fully preserved for retry, and missing attachments can be omitted.
- Real Onsite mailbox-provider provisioning and credentials remain absent. DNS still uses generic/assumed setup values and a fixed DKIM selector; checking existence of SPF/DKIM/DMARC is not validating provider correctness.
- No Studio email-send action was found in the action registry.

Workspace configuration is unchanged: no tenant/platform/environment mail credentials, no user accounts, no Onsite mailboxes/domains, and the historical 660 sent statuses still do not prove real delivery. All seven existing Email/communication-registry tests passed again; they cover scheduled enqueue/cancel rather than worker execution and therefore do not establish that these new delivery paths work. This recheck did not send external emails, apply migrations or modify application code.

Scope: current source code, the local Msomi demo workspace, read-only configuration/history checks, browser visits, and existing regression tests. No external emails were sent, credentials changed, or hosting accounts provisioned. This is an implementation/configuration audit, not a live deliverability certification.

## Current workspace

- No personal `user_email_accounts` records.
- No tenant outgoing-email configuration, Gmail authorization or Outlook authorization.
- No configured platform SMTP credentials and only placeholder environment SMTP credentials.
- No Onsite email domains or mailboxes. Platform IMAP/SMTP host environment variables are unset.
- 660 outbox rows are marked sent. Without a configured transport, `EmailIntegration` returns simulated success; `MailService` and the outbox worker do not persist a separate simulated status. These records cannot certify external delivery.
- 58 communication delivery records remain queued. The outbox worker updates `email_outbox` but not the corresponding communication delivery logs/attempts; the log reader returns the stored statuses directly.
- The live Email, Templates and Onsite Emails shells rendered without captured JavaScript errors. Some data loads were still pending during browser snapshots; this does not verify every control or external connection.
- The browser displayed an overdue-subscription notice blocking Cloud uploads. Attachment-dependent communication needs the workspace's billing/storage restrictions checked as well.

## Implemented functionality

Email has message folders, drafts, compose/replies, stored threading references, scheduled sending and cancellation, pagination/search, labels, bulk actions, signatures, sender identities, filters, forwarding and vacation-reply settings. Incoming message parsing stores attachments in Cloud and applies filtering/spam rules. Account settings include IMAP and SMTP connection tests; Gmail/Outlook OAuth sending paths exist.

The shared sending stack supports tenant-branded templates, workspace/system sender settings, an outbox, bounded retries with backoff, and communication event configuration/recipient resolution. Personal messages use an individual sender when its transport can be resolved; business-generated messages normally use the workspace/system identity.

Verified in this audit: all seven existing tests in `email.test.ts` and `comm-event-registry.test.ts` passed, covering mailbox isolation, scheduled-send cancellation, bulk labels/read/trash, pagination and registry consistency. These tests do not verify live SMTP, IMAP, OAuth, mailbox provisioning, spam placement or delivery to an external inbox.

## App connections

| Area | Existing connection | Remaining limitation |
|---|---|---|
| ClearOS | Workflow messages, shipment updates/reports, communication events | Some legacy sends bypass centralized event settings |
| CRM | Email composer/activity sending, contact/lead navigation | Sender drawer links are shortcuts, not complete record/thread synchronization |
| NexusHR/payroll/Ondi | Invitations, onboarding, payslips and account communications | Live sender and delivery verification missing |
| Tasks/Projects | Task and project-related mail call sites; event/template definitions | Registry entries are not evidence that every described event is emitted |
| eSign/ComplyOS | Signature and compliance communication call sites | Delivery status consistency and retry safety need completion |
| Calendar | Booking/invitation communication and email-to-calendar navigation | Inbox does not provide full calendar/provider synchronization |
| Support/Bliss | Ticket updates/broadcasts and a separate IMAP ticket-ingestion job | Public-support direct sends bypass the shared outbox |
| Cloud | Email attachment storage and saving messages' attachments to Drive | Storage permissions, billing and scan configuration apply |
| Onsite | Domain/mailbox metadata, DNS checks, linked-user account settings; agency emails | No real mailbox-server provisioning in the mailbox creation path |
| Studio | Workflow/domain-event infrastructure and notification actions | The current action registry does not expose a registered email-send action; listing Studio email templates does not wire execution |
| Remaining apps | Many default templates and communication event definitions exist | Audit each real business trigger before calling it connected |

`COMM_EVENT_REGISTRY` includes definitions generated from default templates. A template catalogue alone is not automatic cross-app communication. Email UI navigation to another app also does not mean inbound replies update that app's business records.

## Onsite mailbox flow: current gap

Creating a platform mailbox linked to a user writes or updates that user's Email IMAP/SMTP settings. It does not call a mail-server/provider API, create a mailbox password, or populate IMAP/SMTP passwords. The ingestion worker skips incomplete account credentials. The outgoing transport can fall back to a different workspace/system sender. Google/Microsoft mailbox records are informational and are not provisioned by this service.

The current UI overstates this: a linked mailbox is described as able to send/receive, and connecting Gmail/Outlook is described as hosting/routing the Onsite mailboxes. Those statements are not supported by the provisioning code. Linking another mailbox can overwrite an existing user's account settings; the current model is one primary account per user.

DNS setup also needs correction: required records contain a placeholder DKIM public key, assume a Microsoft MX target from the domain's first label, and construct a generic SPF include from the mail host. Verification only checks that records exist, uses a fixed `default` DKIM selector, and marks the email domain active when any MX exists. It does not establish that records match the intended provider, sender or DKIM key. Provider-issued DNS values are required.

## Reliability gaps

1. Simulation is recorded as sent. Fail clearly when real transport is missing; preserve an explicit test/simulated outcome.
2. Outbox selection/updates are not atomic worker claims. Concurrent workers can select the same message; crashed `sending` messages lack recovery. Scheduled-send rows also lack an atomic claim.
3. Delivery logs and attempt histories are not updated after actual outbox sends. Link queued, sending, accepted, failed and exhausted outcomes; do not claim inbox delivery merely from SMTP acceptance.
4. A failed personal send may be retried through the workspace identity because outbox rows do not retain personal sender identity, all attachments, threading headers or BCC. The scheduled worker does not pass stored BCC to the transport. Preserve the complete delivery envelope.
5. Missing stored attachments can be silently omitted. Required invoice/report attachments should block delivery with an actionable error.
6. IMAP imports unread INBOX messages only. It is not full mailbox synchronization: existing read mail, Sent folders, remote moves/deletes and flag changes are not synchronized. Processing failures can still be followed by marking the source message read.
7. Gmail/Outlook authorization configures sending; incoming mail still depends on the separate IMAP account/credential flow. A Gmail/Outlook badge is not proof of two-way mailbox operation.
8. Some queries rely on user IDs/RLS without the explicit tenant predicate required by CLAUDE.md (examples in Email account tests/settings and reply/draft lookup). Finish the tenant-query audit.
9. Bounce/complaint feedback, suppression handling and verified external delivery were not established by the reviewed mail pipeline. Read-receipt pixels are not dependable delivery proof.

## Configuration and implementation order

1. Choose the actual mail host/provider and configure a real workspace system sender, its credentials, encryption, From address and Reply-To policy. Keep platform/security sender policy explicit.
2. Obtain the provider's actual domain verification/MX/SPF/DKIM/DMARC values. Verify correctness, not existence; show setup/verified/failed states accurately.
3. Implement the documented provider's real mailbox create/change/delete operations, or clearly require external mailbox creation. Do not pretend a database row creates hosting.
4. Connect real user accounts with their credentials/OAuth, verify incoming and outgoing access, and then enable inbox ingestion. Prevent accidental replacement of an existing account.
5. Make outbox/scheduled delivery atomic and recoverable, persist full sender/envelope/attachments, reconcile delivery logs, and remove false sent/success states.
6. Route business-app sends through one communication dispatch contract: tenant + event + record + recipients + template + idempotency key. Wire the actual app triggers and a Studio communication action; preserve user mailbox sending as a separate choice.
7. Link incoming replies to original communication/business records using Message-ID/threading and stored record references, with access checks. Add shared department inbox permissions where needed.
8. Add a workspace readiness screen covering domain verification, sender connection, user mailbox health, worker heartbeat/backlog, delivery failures and storage/billing restrictions.
9. Verify approved real send/receive/reply/attachment flows for each connected app, including provider failures, duplicate jobs, restart recovery and tenant isolation. The workspace is not production ready for email until these checks pass.

Principal evidence: `integrations/email.ts`, `services/mail.service.ts`, `services/comm-events.service.ts`, `jobs/mail-outbox.job.ts`, `jobs/scheduled-email-send.job.ts`, `jobs/imap-email-ingest.job.ts`, `services/onsite-email-provisioning.service.ts`, `services/onsite-email.service.ts`, `routes/onsite.routes.ts`, and the Email/Onsite frontend pages.
