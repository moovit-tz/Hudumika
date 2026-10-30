ALTER TABLE credit_note_lines ADD COLUMN description text;
UPDATE chart_of_accounts SET name = 'Sales Revenue' WHERE code = '4000' AND name = 'Freight Revenue';
UPDATE chart_of_accounts SET name = 'Direct Purchase & Service Costs' WHERE code = '5000' AND name = 'Port & Customs Charges';
