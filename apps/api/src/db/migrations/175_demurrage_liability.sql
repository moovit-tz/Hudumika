-- Who carries a demurrage charge decides how it is accounted for, and until
-- now nothing recorded it.
--
--   CUSTOMER  the normal case. The delay is the customer's, so the charge is
--             recoverable: it is recharged on that shipment's invoice and
--             posts to receivables, never to our own P&L.
--   COMPANY   we failed to clear on time. The charge is absorbed: it must NOT
--             appear on the customer's invoice, and it posts to expense.
--
-- Defaulting to CUSTOMER matches the normal case and means existing rows keep
-- the ordinary treatment; marking one COMPANY is the deliberate act, which is
-- the right way round for an admission of fault.
ALTER TABLE container_tracking
  ADD COLUMN IF NOT EXISTS liable_party VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
    CHECK (liable_party IN ('CUSTOMER', 'COMPANY'));

-- Free text for why, since "whose fault" is a claim someone should be able to
-- justify later — especially when it is ours.
ALTER TABLE container_tracking
  ADD COLUMN IF NOT EXISTS liability_reason TEXT;

-- Set when the recoverable charge has been recharged onto a customer invoice,
-- so it cannot be billed twice. Absorbed charges never get one.
ALTER TABLE container_tracking
  ADD COLUMN IF NOT EXISTS recharged_invoice_id UUID;

CREATE INDEX IF NOT EXISTS idx_container_tracking_liable
  ON container_tracking(tenant_id, liable_party);
