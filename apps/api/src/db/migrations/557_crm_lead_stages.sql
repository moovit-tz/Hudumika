-- Configurable per-tenant lead stages (replaces hardcoded 7-stage array in Leads.tsx)
create table if not exists crm_lead_stages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 100),
  color       text check (color ~ '^#[0-9a-fA-F]{6}$'),
  position    int  not null default 0,
  is_won      boolean not null default false,  -- terminal "converted/won" stage
  is_lost     boolean not null default false,  -- terminal "disqualified/lost" stage
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crm_lead_stages_tenant_label_uniq unique (tenant_id, label)
);

alter table crm_lead_stages enable row level security;
create policy crm_lead_stages_tenant on crm_lead_stages
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
alter table crm_lead_stages force row level security;

create index crm_lead_stages_tenant_pos on crm_lead_stages (tenant_id, position);

-- Seed default stages for all existing tenants
insert into crm_lead_stages (tenant_id, label, color, position, is_won, is_lost)
select
  t.id,
  s.label,
  s.color,
  s.position,
  s.is_won,
  s.is_lost
from tenants t
cross join (values
  ('New',          '#6366f1', 0, false, false),
  ('Contacted',    '#3b82f6', 1, false, false),
  ('Qualified',    '#0ea5e9', 2, false, false),
  ('Proposal',     '#f59e0b', 3, false, false),
  ('Negotiation',  '#f97316', 4, false, false),
  ('Converted',    '#22c55e', 5, true,  false),
  ('Disqualified', '#ef4444', 6, false, true)
) as s(label, color, position, is_won, is_lost)
on conflict (tenant_id, label) do nothing;
