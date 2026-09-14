import pg from 'pg'; import fs from 'fs';
const env = fs.readFileSync('../../.env', 'utf8');
const dbUrl = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const client = new pg.Client({ connectionString: dbUrl }); await client.connect();
const je = await client.query(`SELECT id, status, source_module, source_id FROM journal_entries WHERE tenant_id='d4389cf1-4cca-465a-8607-467019d22a14' AND source_id='b6635af1-19d0-46d1-b5ba-208810bd3d21'`);
console.log('journal entries for the Draft invoice (should be NONE if Draft never posts):', je.rows);
const invoice = await client.query(`SELECT id, invoice_number, status, currency, created_at FROM sales_invoices WHERE id='b6635af1-19d0-46d1-b5ba-208810bd3d21'`);
console.log('the draft invoice itself:', invoice.rows);
const revalJe = await client.query(`
  SELECT jl.debit, jl.credit, coa.code, coa.name
  FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id=jl.account_id
  WHERE je.id='a6b3a4c2-550e-467c-a300-4e19b44268a8'`);
console.log('the FX revaluation journal entry lines:', JSON.stringify(revalJe.rows, null, 2));
await client.end();
