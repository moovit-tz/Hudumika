-- Migration 069: statistical unit column on hs_codes, needed by the full
-- EAC CET 2022 import (5,977 tariff lines carry a unit: u, kg, l, m, 1000u).
ALTER TABLE hs_codes ADD COLUMN IF NOT EXISTS unit VARCHAR(10);
