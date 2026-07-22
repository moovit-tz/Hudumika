-- Migration 080: One shared brand color across all pricing tiers.
--
-- Part of the platform-wide "less color, more modern" pass — packages.color
-- previously gave each of the 4 tiers its own hue (cyan/teal/blue/purple);
-- Subscription.tsx already differentiates tiers by icon (PLAN_ICONS) and the
-- "Most Popular"/"Current Plan" badges, so the color itself doesn't need to.

UPDATE packages SET color = '#e8461a', updated_at = NOW();
