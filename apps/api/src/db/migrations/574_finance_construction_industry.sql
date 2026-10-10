ALTER TABLE finance_industry_work
  DROP CONSTRAINT finance_industry_work_industry_check;

ALTER TABLE finance_industry_work
  ADD CONSTRAINT finance_industry_work_industry_check
  CHECK (industry IN (
    'retail',
    'wholesale',
    'manufacturing',
    'warehousing',
    'professional_services',
    'consulting',
    'printing',
    'construction'
  ));
