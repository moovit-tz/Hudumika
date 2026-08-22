-- Migration 276: Tag a Sign recipient as a real internal platform user
--
-- sign_recipients has always been pure freeform (name/email typed in the
-- editor) — correct for an external signer (a customer, a supplier) who
-- has no Hudumika account, but it meant there was never a way to point a
-- recipient row at an actual colleague: no in-app notification (nothing to
-- resolve a bell notification against), and the SignEditor's recipient
-- picker had no way to search real staff. Additive and nullable — every
-- existing freeform recipient keeps working unchanged; a tagged one gets a
-- real user_id alongside the same name/email/phone columns (still filled
-- in, auto-populated from the tagged user, so every existing read path
-- that only knows about name/email/phone needs no change).

ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sign_recipients_user_idx ON sign_recipients(user_id);
