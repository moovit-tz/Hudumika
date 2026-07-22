-- ============================================================
-- 099 — ComplyOS: BRELA search history (every search logged,
--        so a tenant can see what's been searched and by whom)
-- ============================================================

CREATE TABLE comply_brela_search_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  searched_by   TEXT        NOT NULL, -- users.id
  object_type   TEXT        NOT NULL, -- 'Company' | 'Business name'
  inc_number    TEXT,
  company_name  TEXT,
  is_live       BOOLEAN     NOT NULL DEFAULT false, -- true = real BRELA portal response, false = local reference fallback
  result_count  INT         NOT NULL DEFAULT 0,
  results       JSONB       NOT NULL DEFAULT '[]', -- snapshot: [{reg_number, name, status, type, registered_office}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_brela_history_tenant ON comply_brela_search_history (tenant_id, created_at DESC);
