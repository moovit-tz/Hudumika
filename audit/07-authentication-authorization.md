# Authentication and authorization

Inspected shared authenticate, role middleware, ClearOS entitlement hooks and declaration/customer guards. JWT sub is the actor identity. Frontend uses role-gated routes; APIs must independently authorize.

PASS (narrow checks): SALES transit-rate write rejected; management write accepted; foreign declaration GET returns 404; CUSTOMER declaration list denied; runtime DB role non-superuser/non-BYPASSRLS. Foreign/missing shipment POST now rejects before persistence.

NOT VERIFIED: full role-by-endpoint/field matrix; every customer shipment access path; auth issuance/reset/MFA/SSO/session revocation; cookie CSRF across deployed origins; delegated administrators; cache/jobs/storage isolation; platform impersonation. Synthetic JWTs bypass the login process and do not verify login security.

Documentation discrepancy: supplied AGENTS wording says RLS does not protect by itself; CLAUDE and client now enforce restricted role/FORCE RLS. Legacy declaration comments claiming postgres/BYPASSRLS were stale; one touched service comment corrected. Explicit tenant predicates and withTenant remain required.
