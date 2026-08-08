# Security

## Tenant Isolation
Every row in Lens tables must include `tenant_id`. All API queries must explicitly include `where('tenant_id', '=', req.user.tenant_id)`. **RLS** (Row Level Security) is enabled as a defense-in-depth measure, but application-level scoping is mandatory.

## Credentials
Third-party tokens (e.g., GitHub PATs) must be encrypted at rest using AES-256-GCM. Never log raw tokens.