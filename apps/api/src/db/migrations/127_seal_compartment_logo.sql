-- 127_seal_compartment_logo.sql
-- Facility branding for the compartment switcher and detail/edit pages —
-- either a data: URL (uploaded image, same pattern as tenant_settings'
-- company.logoUrl) or a real external image URL.
ALTER TABLE seal_compartments ADD COLUMN logo_url TEXT;
