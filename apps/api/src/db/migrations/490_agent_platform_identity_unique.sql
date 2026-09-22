-- One built-in "Workspace Agent" (kind='platform') per tenant, created lazily
-- on that tenant's first agent run (agent-runtime.service.ts's
-- getOrCreatePlatformAgentId). The partial unique index is what makes that
-- lazy creation safe under two concurrent first runs — without it both
-- would insert and the tenant would end up with duplicate "platform"
-- identities. 'specialist' identities stay unconstrained (many per tenant).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_identities_platform_per_tenant
  ON agent_identities (tenant_id) WHERE kind = 'platform';
