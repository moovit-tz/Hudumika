-- 303_fx_rates.sql
-- exchange_rate has always been a human-typed field on invoices/bills/GL
-- lines — confirmed via grep, no external rate source anywhere in this
-- codebase. Xero in particular is well known for genuinely automatic daily
-- rates; this closes that specific gap. Platform-wide (not per-tenant —
-- a rate is a fact about the world, not tenant data), so no RLS: every
-- tenant reads the same published rate for a given day and pair.

CREATE TABLE fx_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date       DATE NOT NULL,
  base_currency   VARCHAR(3) NOT NULL,
  quote_currency  VARCHAR(3) NOT NULL,
  rate            NUMERIC(18,6) NOT NULL,
  source          VARCHAR(100),
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rate_date, base_currency, quote_currency)
);
CREATE INDEX idx_fx_rates_lookup ON fx_rates(base_currency, quote_currency, rate_date DESC);
