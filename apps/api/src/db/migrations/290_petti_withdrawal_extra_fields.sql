-- Two small, independent additive fields on petti_withdrawal_requests:
--
-- payee_name — optional free-text "who the cash actually went to" (a vendor,
-- a driver, a supplier with no CRM record of their own). Surfaced in the
-- unified transaction ledger and the request form. Deliberately not a link
-- to a vendor/supplier table — that's a separate payout subsystem this
-- feature doesn't need; a name typed once per request covers the real ask
-- ("who was this paid to") without inventing a new entity type.
--
-- on_behalf_of_user_id — lets a Finance/Admin user submit a request on
-- behalf of someone else (e.g. a staff member without system access, or a
-- paper request being logged retroactively). Restricted at the service layer
-- to PETTI_FINANCE_ROLES — self-service requesters cannot request on behalf
-- of someone else, preserving the existing accountability model where
-- requested_by is always the real actor who submitted it.
ALTER TABLE petti_withdrawal_requests ADD COLUMN IF NOT EXISTS payee_name TEXT;
ALTER TABLE petti_withdrawal_requests ADD COLUMN IF NOT EXISTS on_behalf_of_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
