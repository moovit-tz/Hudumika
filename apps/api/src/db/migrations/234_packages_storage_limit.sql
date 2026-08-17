-- Migration 234: Real per-tier storage quota.
--
-- Every plan tier already promises a storage figure in its own marketing
-- copy (packages.features, and Subscription.tsx's PLAN_DEFAULTS mirror of
-- it) — 10GB/50GB/250GB/Unlimited — but nothing anywhere enforces or even
-- measures it. The Cloud app's own "100GB" storage bar is a hardcoded
-- constant with no relationship to any of this. This migration adds the
-- real column and backfills it with the exact numbers already promised,
-- closing a "promised but never delivered" gap rather than inventing a new
-- one. NULL means unlimited (enterprise), matching the nullable-limit
-- convention packages.monthly_item_limit already uses for the same tier.

ALTER TABLE packages ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT;

UPDATE packages SET storage_limit_bytes = 10::bigint  * 1073741824 WHERE code = 'starter';
UPDATE packages SET storage_limit_bytes = 50::bigint  * 1073741824 WHERE code = 'growth';
UPDATE packages SET storage_limit_bytes = 250::bigint * 1073741824 WHERE code = 'scale';
UPDATE packages SET storage_limit_bytes = NULL WHERE code = 'enterprise';
