-- CRM terminology overrides: tenants can rename Lead→Prospect, Customer→Client, etc.
create table if not exists crm_terminology (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  term_key    text not null check (char_length(term_key) between 1 and 50),
  singular    text not null check (char_length(singular) between 1 and 80),
  plural      text not null check (char_length(plural)   between 1 and 80),
  updated_at  timestamptz not null default now(),
  constraint crm_terminology_tenant_key_uniq unique (tenant_id, term_key)
);

alter table crm_terminology enable row level security;
create policy crm_terminology_tenant on crm_terminology
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
alter table crm_terminology force row level security;

comment on table crm_terminology is
  'Per-tenant CRM label overrides. term_key is one of: lead, leads, deal, deals, customer, customers, contact, contacts, pipeline.';
