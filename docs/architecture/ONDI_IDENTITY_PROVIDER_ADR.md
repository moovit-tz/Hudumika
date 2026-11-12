# ADR: Ondi as Hudumika's identity provider

**Status:** Accepted product direction; implementation gates pending  
**Date:** 2026-11-11  
**Decider:** Hudumika product owner

## Context

The current “Company SSO” sign-in path asks a tenant to configure an external
SAML identity provider. The attached screenshots show the result when no such
provider is configured. That makes an external identity system a prerequisite
for a feature that should be served by Ondi itself.

There is already meaningful identity infrastructure in the repository:

- `ondi-oauth.routes.ts`, `oidc-discovery.routes.ts`, and `lib/oidc.ts` implement
  parts of an OAuth 2.0 / OIDC issuer, including authorization codes, PKCE,
  RS256 tokens, discovery, JWKS, consent, introspection, and revocation.
- The authorization endpoints currently require a pre-existing Hudumika
  session. They are not yet a standalone Ondi sign-in session for external
  applications.
- `ondi-saml.routes.ts` accepts assertions from customer-managed IdPs. In
  that relationship Hudumika is the SAML service provider (SP), not the IdP.
- The Ondi SSO screen registers upstream IdPs and outbound OAuth/OIDC clients;
  a SAML identity-provider endpoint that issues assertions to customer apps
  does not exist yet.
- The `users` table and tenant-scoped memberships remain the source of
  workspace roles and authorization. Ondi tokens must not make a client app's
  access to another tenant's data implicit.

### Current implementation audit

- Native email/password login, password reset, account sessions, and logout
  already exist in `auth.routes.ts`; these can support independent Ondi
  accounts without a social identity provider.
- Ondi has OTP, magic-link, TOTP, and passkey flows, but some entry points are
  currently hidden by UI feature flags. Verify their recovery, MFA policy, and
  deployment dependencies before making them the only login path.
- The OIDC discovery, JWKS, token, userinfo, consent, introspection, and
  revocation routes exist. The authorize info/approval endpoints are protected
  by the platform `authenticate` pre-handler, so a user must already hold a
  Hudumika API session before Ondi can issue an app authorization code.
- The current SAML `/metadata`, `/login`, and `/acs` routes are inbound SP
  endpoints. They consume an upstream identity provider's assertion and must
  not be relabeled as Ondi SAML IdP support.
- The SuperAdmin `sso_enabled` setting selects the default unauthenticated
  login page. Turning it on alone does not provide an independent Ondi session,
  complete OIDC sign-in, or SAML IdP behavior; it should stay dark until those
  acceptance gates pass.

## Decision

Make Ondi the first-party identity authority for Hudumika and its independent
apps. A user should be able to authenticate to Ondi with a Hudumika account
without first authenticating at Google, Microsoft, Apple, or the customer's
IdP. First-party apps should use Ondi OIDC for sign-in and receive only the
tenant membership and scopes the user is authorized to use.

Offer SAML 2.0 IdP and OIDC provider capabilities to customer applications as
protocols backed by the same Ondi users, sessions, policy, and audit trail.
Keep upstream Google/Microsoft/Apple and customer SAML federation as optional
ways to authenticate or link an account, rather than prerequisites for Ondi.

Keep the existing inbound SAML SP integration as a compatibility option for
customers that require their corporate identity system to remain authoritative.
Label and administer that direction separately from “Ondi SSO / Identity
Provider” so users can see which system is authenticating them.

Use one production issuer origin, proposed as `https://id.hudumika.tz`, for
OIDC discovery, authorization, token, userinfo, JWKS, and SAML IdP metadata and
SSO endpoints. Treat this hostname as a deployment decision: DNS, TLS, proxy,
cookie, and recovery configuration must be validated before production rollout.

## Options considered

### A. Keep customer-managed IdPs as the default

| Dimension | Assessment |
|---|---|
| Complexity | Low short term; every new workspace still needs provider setup |
| Cost | Depends on each customer's provider |
| Control | External directory controls sign-in and lifecycle |
| Fit | Does not meet the product requirement |

### B. Make Ondi the first-party authority; retain upstream federation optionally

| Dimension | Assessment |
|---|---|
| Complexity | High; requires a standalone issuer session, protocol support, lifecycle controls, and migration |
| Cost | Platform-owned security, availability, email/SMS delivery, key management, and support |
| Control | Ondi owns account policy, sessions, and app federation; customer IdPs can remain optional |
| Fit | Meets the product requirement and reuses the OIDC work already present |

**Decision:** Option B.

## Implementation sequence and acceptance gates

1. **Establish the native Ondi session.** Give the identity issuer its own
   production origin and host-scoped, secure, HttpOnly session cookies. Add
   native account sign-in, verification, recovery, MFA/passkey enrollment,
   session listing/revocation, logout, and abuse/rate controls. Do not share a
   broad parent-domain cookie with every app.
2. **Complete first-party OIDC.** Make discovery advertise only implemented
   behavior; support standard authorization redirects and account selection,
   exact redirect URI matching, PKCE for public clients, approved client
   authentication, nonce/state checks, consent, token rotation/revocation,
   signing-key rotation with overlapping JWKS keys, and issuer/audience checks.
   The authorize flow must use the Ondi session, not require a Hudumika API
   bearer token from another app.
3. **Migrate Hudumika apps to OIDC.** Use Authorization Code + PKCE for browser
   clients and server-side token handling for confidential app backends. Map
   the authenticated Ondi subject to an explicit tenant membership; maintain
   each app's existing authorization and entitlement checks. Do not place
   refresh tokens in browser storage.
4. **Add SAML 2.0 IdP.** Implement metadata, SP registration, SSO response
   creation, assertion signing, request/recipient/audience validation, replay
   protection, destination and time-window checks, certificate/key lifecycle,
   and audited logout/revocation behavior. Keep inbound SP routes separate.
5. **Add enterprise lifecycle and policy.** Add domain verification and
   workspace discovery, group-to-role mapping, SCIM provisioning/deprovisioning
   if it is part of the supported package, enforced MFA/session policies,
   emergency recovery, and administrator audit/export. Deprovisioning must
   revoke Ondi sessions and app grants promptly.
6. **Dark-launch and migrate.** Exercise test issuers, all first-party app
   callbacks, multi-tenant access boundaries, account recovery, key rotation,
   and logout. Roll out behind a platform switch, preserve the existing
   password/login fallback, and keep upstream SAML federation available as an
   opt-in compatibility path until customers have migrated.

## Security and rollout constraints

- Do not create one global account solely because an email address matches
  across tenants. Tenant membership and verified domain ownership must be
  explicit.
- Keep identity authentication separate from API authorization. An OIDC ID
  token is for sign-in; scoped access tokens and the existing tenant/role gates
  control API access.
- Protect signing keys at rest, expose public keys only, support rotation and
  emergency rollover, and never reuse document-signing certificates for OIDC
  or SAML assertion signing.
- Use generic account-recovery responses, rate limits, audit events, CSRF/state
  protections, exact redirect allowlists, and replay-resistant one-time codes.
- Email/SMS gateways may still deliver verification and recovery messages;
  they are delivery services, not identity providers.
- Do not switch the production sign-in default until all first-party clients
  and recovery operations pass the rollout acceptance gate.

## Consequences

- New Hudumika workspaces can use Ondi accounts without configuring Google,
  Microsoft, Apple, or an external corporate SAML IdP.
- First-party apps share one identity and sign-in experience while retaining
  their own data and permission boundaries.
- Customers can connect their own apps to Ondi through SAML or OIDC.
- Hudumika assumes responsibility for account security, federation behavior,
  key custody, operational uptime, support, and tenant lifecycle correctness.
- Existing inbound SAML remains useful for regulated or centrally managed
  customers, but becomes optional and clearly distinguished from Ondi acting
  as an IdP.

## Immediate follow-up

- Audit password enrollment, email verification, recovery, and active session
  revocation against the first implementation gate.
- Audit OIDC protocol behavior and current tests against the second gate.
- Write an endpoint/data-flow spec for the standalone Ondi session and SAML
  IdP before changing the login default or enabling customer configuration.
- Confirm whether `id.hudumika.tz` is the production issuer hostname and whether
  SCIM is in the initial customer offer or a later enterprise capability.
