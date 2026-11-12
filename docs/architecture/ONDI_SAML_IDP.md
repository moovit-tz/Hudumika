# Ondi SAML Identity Provider

Ondi issues its own SAML 2.0 responses. It does not proxy SAML through a third-party identity provider. The implementation uses `samlify` for SAML message parsing, XML signatures, metadata, and response construction; tenant authorization and user identity remain in Hudumika.

## Workspace configuration

Workspace administrators with the Enterprise Identity & Governance entitlement configure applications in **Ondi → SSO & Providers → Ondi as Identity Provider**. Register the exact SP entity ID, HTTPS ACS URL, optional HTTPS SLO URL, and the SP's current RSA X.509 signing certificate. Ondi returns a per-client metadata URL:

```text
https://id.hudumika.tz/v1/ondi/saml/idp/<client-id>/metadata
```

Use that metadata document in the SP. It publishes Ondi's entity ID, SSO/SLO endpoints, and active plus previous signing certificates. The SP should use HTTP-POST for the ACS. Login is SP-initiated and requires signed AuthnRequests; unsolicited IdP-initiated assertions are disabled. The signed-in Ondi user reviews the application and the name/email claims before an assertion is issued.

The API also exposes tenant-scoped CRUD under `/v1/ondi/saml/idp/clients`. Those handlers run under `withTenant`, include explicit tenant predicates, and the tenant-owned records have forced RLS. Metadata and protocol requests are addressed by an unguessable client UUID; user approval checks that the SAML request's tenant equals the authenticated user's tenant.

## Signing key lifecycle

On first use, Ondi generates an RSA-2048 self-signed certificate. The private key is encrypted with the existing `ONSITE_SECRETS_KEY` before it is stored. Keep that encryption key stable and backed up: changing it without re-encrypting the SAML key records makes existing signing keys unreadable.

Only Super Admins can list key IDs/status, rotate, or revoke a previous key:

```text
GET  /v1/ondi/saml/idp/keys
POST /v1/ondi/saml/idp/keys/rotate
POST /v1/ondi/saml/idp/keys/<kid>/revoke
```

Rotation marks the current key as previous, creates a new active key, and publishes both certificates for metadata consumers. Update SP trust from the metadata before revoking the previous key. At most the active key and the two most recently retired keys are advertised. A revoked key is omitted immediately. Key operations are recorded in Ondi's audit chain.

## Logout and replay controls

The IdP stores a tenant-scoped session record for each issued assertion. SP-initiated LogoutRequests must be signed by the registered SP certificate and identify the NameID and SessionIndex. Ondi checks destination, issuer, session/client/tenant ownership, expiry, and one-time request ID before revoking the matching session and returning a signed LogoutResponse. Redis must be available for sign-in transactions and replay protection; the flow fails closed if it is unavailable.

## Deployment

Run database migrations before deploying the API; migrations 749 and 750 create the tenant-scoped SP registry, signing-key ring, and issued-session store. In production, serve the API over HTTPS at the configured Ondi issuer origin and ensure the reverse proxy forwards `/v1/ondi/saml/idp/*` without rewriting the public URLs. Set `PUBLIC_APP_URL` to the public web app origin and include the standalone issuer origin in the web app's `TRUSTED_ONDI_ISSUERS` allowlist when using a separate Ondi process.

The generated certificate is self-signed. SPs must trust Ondi's metadata/certificate explicitly; it is not a public web PKI certificate. Keep the database and `ONSITE_SECRETS_KEY` backups coordinated, and monitor failed SAML login/logout events.
