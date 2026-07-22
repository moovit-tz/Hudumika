-- 069_cargo_manifest_status.sql

ALTER TABLE cargo_manifests
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'; -- DRAFT | APPROVED | DISPATCHED
