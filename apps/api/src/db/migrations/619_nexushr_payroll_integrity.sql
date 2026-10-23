-- Preserve historical rows; enforce valid compensation on every new write.
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS calculated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hr_compensations ADD CONSTRAINT hr_compensation_nonnegative_finite CHECK (base_salary >= 0 AND base_salary <> 'NaN'::numeric) NOT VALID;
ALTER TABLE hr_compensations ADD CONSTRAINT hr_compensation_dates_valid CHECK (end_date IS NULL OR end_date >= effective_date) NOT VALID;
ALTER TABLE hr_compensations ADD CONSTRAINT hr_compensation_currency_valid CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
ALTER TABLE hr_compensations ADD CONSTRAINT hr_compensation_frequency_valid CHECK (pay_frequency IN ('MONTHLY','ANNUAL','BIWEEKLY','HOURLY')) NOT VALID;
ALTER TABLE users ADD CONSTRAINT users_salary_nonnegative_finite CHECK (basic_salary IS NULL OR (basic_salary >= 0 AND basic_salary <> 'NaN'::numeric)) NOT VALID;
