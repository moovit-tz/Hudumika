# Workspace mail setup

Tenant administrators configure **Workspace → Mail providers** at `/workspace/mail-providers`. Each workspace owns its encrypted provider connections. They are reused across that workspace’s matching Onsite email domains, and are never returned to the browser. This page also provides historical delivery reconciliation preview and apply actions; neither resends mail.

## Provider administration

- **cPanel:** HTTPS cPanel origin, account username and API token, plus provider-issued IMAP/SMTP hosts. Provisioning uses UAPI Email `add_pop`. Linked users receive the created mailbox’s SMTP/IMAP connection when they have no conflicting existing identity.
- **Google Workspace:** service-account email, private key and delegated administrator. Enable Directory API and authorize domain-wide delegation for `admin.directory.user` and `admin.directory.domain.readonly`. Account creation does not activate Gmail or grant a Workspace subscription. Check activation reads Directory’s `isMailboxSetup` rather than assuming account creation proves mail availability.
- **Microsoft 365:** directory/application IDs, client secret, Exchange-bearing license SKU and usage country. Grant application permissions `User.ReadWrite.All`, `LicenseAssignment.ReadWrite.All` and `Domain.Read.All` with admin consent. Provisioning creates the user and assigns the specified license. Exchange activation remains in review until the linked user completes live mail verification.

Open **Onsite → Emails → Mail setup** for a domain. Check administration access, review/save exact DNS expectations, and provision mailbox records with an initial password. An uncertain provisioning outcome remains in review; **Check activation** reads the provider account instead of blindly retrying creation. External accounts, aliases, groups and catch-all policies remain managed by their provider.

## DNS

Publish records through the domain’s authoritative DNS provider. Saving expected values in Hudumika does not publish DNS. Microsoft can discover MX/SPF records through Graph; DKIM, DMARC and other provider values must be entered from the provider’s administration console. Verification compares published MX priorities/hosts, TXT values and CNAME targets. Empty or placeholder values never produce an active domain.

## User mailbox connection and verification

Connect the user’s outgoing identity and IMAP mailbox in **Email → Settings**. Google/Microsoft personal OAuth is distinct from provider administration credentials. Configure the existing workspace Email OAuth client settings and reconnect Microsoft identities created before IMAP permission was added.

The worker inventories every selectable IMAP folder, imports read and unread history in batches, maps standard special-use folders, and treats custom folders as Archive. It deduplicates RFC message IDs and tracks remote UID/UIDVALIDITY memberships, flags, moves and deletions. Local read/star/move/delete actions are queued for the provider. Incomplete inventory defers deletion reconciliation; historical imports suppress automatic forwarding/vacation replies. Draft body edits and local labels are not uploaded to provider drafts or labels.

**Sync mailbox now** runs the same worker. **Verify send and receive** sends a uniquely tracked email to the connected mailbox. Sent means provider acceptance; Received requires successful outgoing provider evidence and an IMAP Inbox receipt. Mocked checks cannot prove real delivery. Actual provisioning, DNS publication and live verification require credentials entered by the tenant administrator.

Migrations 600 and 601 add synchronization memberships/claims, provider setup state, live checks and tenant provider connections. Production must supply its existing `ONSITE_SECRETS_KEY` encryption key.

## Verification

Use `npm run typecheck` and `npm run test -w apps/api -- src/tests/email-operations.test.ts src/tests/email-delivery.test.ts src/tests/email.test.ts --hookTimeout 60000`. Tests use disposable tenants, mocked provider/IMAP/DNS responses, and the real local database; they do not provision external accounts or send real mail.

The repository guidance’s API URL default description has drifted: the current `apps/web/src/lib/api.ts` defaults to same-origin and Vite proxies `/v1` to port 3001. This implementation follows the current helper.
