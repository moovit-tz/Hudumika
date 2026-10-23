-- Stop deployment on invalid historical compensation instead of silently rewriting pay.
ALTER TABLE hr_compensations VALIDATE CONSTRAINT hr_compensation_nonnegative_finite;
ALTER TABLE hr_compensations VALIDATE CONSTRAINT hr_compensation_dates_valid;
ALTER TABLE hr_compensations VALIDATE CONSTRAINT hr_compensation_currency_valid;
ALTER TABLE hr_compensations VALIDATE CONSTRAINT hr_compensation_frequency_valid;
ALTER TABLE users VALIDATE CONSTRAINT users_salary_nonnegative_finite;
