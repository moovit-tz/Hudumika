-- S07 (reusable commercial modules) + Retail's own backlog item: POST
-- /sales/:id/refund was sale-level only — a cashier could refund the
-- entire sale or nothing, with no way to return a single line, no partial
-- quantity, and no distinction between a saleable return (restock) and a
-- damaged/written-off one (which still shouldn't go back into sellable
-- stock). This table is the audit trail that makes item-level, partial,
-- repeatable returns on the same sale possible: one row per (sale_line,
-- return event), so "how much of this line has already been returned" is
-- always a real SUM over this table, never a mutable counter that could
-- drift from the GL/inventory movements it's supposed to match.
CREATE TABLE IF NOT EXISTS pos_sale_line_returns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id          UUID NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  sale_line_id     UUID NOT NULL REFERENCES pos_sale_lines(id) ON DELETE CASCADE,
  qty              NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  -- restock: goes back into sellable stock at the given location.
  -- damaged: the return is recorded and refunded, but nothing is restocked
  --          — a controlled disposition, not a silent default to sellable.
  disposition      VARCHAR(10) NOT NULL DEFAULT 'restock' CHECK (disposition IN ('restock', 'damaged')),
  refund_net       NUMERIC(18,2) NOT NULL,
  refund_tax       NUMERIC(18,2) NOT NULL,
  refund_total     NUMERIC(18,2) NOT NULL,
  reason           TEXT NOT NULL,
  -- The one partial-reversal journal entry this return event posted
  -- (shared across every line returned in the same request) — the
  -- original line's own tax_rate/tax_amount is what the refund amounts
  -- above are proportioned from, never a re-guessed rate.
  journal_entry_id UUID REFERENCES journal_entries(id),
  movement_id      BIGINT REFERENCES inventory_movements(id),
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_sale_line_returns_line_idx ON pos_sale_line_returns (sale_line_id);
CREATE INDEX IF NOT EXISTS pos_sale_line_returns_sale_idx ON pos_sale_line_returns (tenant_id, sale_id);

ALTER TABLE pos_sale_line_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_line_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_sale_line_returns
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
