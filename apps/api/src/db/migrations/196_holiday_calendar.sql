-- Holidays a tenant can actually rely on.
--
-- The existing table held a date, a name and a type, and the sync filled it
-- from a public-holiday API. Three things were wrong with that, and the third
-- is the one that costs somebody a day's pay.
--
-- 1. There was no record of which country a holiday belonged to, so a tenant
--    operating in two countries had one undifferentiated list and staff in
--    Nairobi observed Tanzanian holidays.
--
-- 2. There was no record of where a row came from. The sync upserted on
--    (tenant_id, date), so a company-designated day off was silently
--    overwritten — name and type both — the moment a public holiday landed on
--    the same date. A tenant would lose data it had entered by hand and never
--    be told.
--
-- 3. The provider returns no Islamic holidays for Tanzania at all. Verified
--    against it directly: 13 holidays for 2026, none of them Eid al-Fitr, Eid
--    al-Adha or Maulid, all three of which are gazetted public holidays. For a
--    workforce that is roughly a third Muslim that is about four days a year on
--    which people would be marked absent, and against which leave would be
--    deducted, for not attending work on a day the country is closed.
--
-- Islamic dates are computed rather than fetched, and carry `is_provisional`.
-- The tabular calendar reproduced nine known observed dates for Eid al-Fitr,
-- Eid al-Adha and Maulid exactly, which is good enough to plan against and not
-- good enough to assert: observance follows the sighting of the moon and is
-- announced locally, so the date can still move by a day. A holiday that says
-- it is provisional can be corrected; one that claims certainty cannot.

ALTER TABLE tenants
  -- ISO 3166-1 alpha-2. The country a tenant operates in, which decides its
  -- holidays, and eventually its payroll jurisdiction. NULL means unknown, and
  -- unknown is treated as unknown rather than quietly assumed to be Tanzania.
  ADD COLUMN IF NOT EXISTS country VARCHAR(2);

ALTER TABLE hr_holidays
  ADD COLUMN IF NOT EXISTS country        VARCHAR(2),
  ADD COLUMN IF NOT EXISTS local_name     VARCHAR(160),
  -- MANUAL rows are entered by the tenant and are never touched by a sync.
  ADD COLUMN IF NOT EXISTS source         VARCHAR(16)  NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS category       VARCHAR(20)  NOT NULL DEFAULT 'PUBLIC',
  -- True where the date depends on a moon sighting and may shift by a day.
  ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN      NOT NULL DEFAULT false,
  -- Whether the day is actually non-working. An international observance is
  -- worth showing on a calendar and is not a day off; conflating the two would
  -- credit people leave for World Environment Day.
  ADD COLUMN IF NOT EXISTS is_working_day BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at      TIMESTAMPTZ;

ALTER TABLE hr_holidays DROP CONSTRAINT IF EXISTS hr_holidays_source_valid;
ALTER TABLE hr_holidays ADD CONSTRAINT hr_holidays_source_valid
  CHECK (source IN ('MANUAL', 'SYNCED', 'COMPUTED'));

ALTER TABLE hr_holidays DROP CONSTRAINT IF EXISTS hr_holidays_category_valid;
ALTER TABLE hr_holidays ADD CONSTRAINT hr_holidays_category_valid
  CHECK (category IN ('PUBLIC', 'RELIGIOUS', 'INTERNATIONAL', 'COMPANY'));

-- One date can carry more than one holiday: Eid has fallen on Union Day, and a
-- company day off can coincide with a public one. The old UNIQUE (tenant_id,
-- date) made that impossible to represent and forced the destructive upsert
-- described above. Keying on the name as well lets both exist, and still stops
-- a sync inserting the same holiday twice.
ALTER TABLE hr_holidays DROP CONSTRAINT IF EXISTS hr_holidays_tenant_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS hr_holidays_unique_occurrence
  ON hr_holidays (tenant_id, date, name);

CREATE INDEX IF NOT EXISTS hr_holidays_tenant_country_date
  ON hr_holidays (tenant_id, country, date);

-- Rows that predate this migration came from the sync, not from a person, and
-- are Tanzanian — the only country any location in this database names. Marking
-- them SYNCED means the next sync may correct them; leaving them MANUAL would
-- freeze provider data as though a human had entered it.
UPDATE hr_holidays
   SET source = 'SYNCED', country = COALESCE(country, 'TZ'), category = 'PUBLIC'
 WHERE source = 'MANUAL' AND synced_at IS NULL AND type = 'Public';
