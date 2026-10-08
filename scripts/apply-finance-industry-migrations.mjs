import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

// Local rollout is deliberately limited to this feature's migrations.
// Normal deployment continues to use the repository migration runner.
const files = ['561_finance_industry_work.sql', '562_finance_production.sql', '563_finance_stock_allocations.sql', '564_finance_work_accounting.sql', '566_finance_production_recipes.sql', '567_finance_work_cost_allocations.sql', '568_finance_close_reviews.sql', '569_finance_expense_reports.sql', '570_finance_claim_crm_links.sql', '571_finance_tax_preparation.sql'];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const filename of files) {
    const existing = await client.query('SELECT 1 FROM _migrations WHERE filename = $1', [filename]);
    if (existing.rowCount) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(new URL(`../apps/api/src/db/migrations/${filename}`, import.meta.url), 'utf8'));
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { client.release(); await pool.end(); }
