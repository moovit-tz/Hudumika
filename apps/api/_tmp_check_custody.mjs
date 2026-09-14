import pg from 'pg'; import fs from 'fs';
const env = fs.readFileSync('../../.env', 'utf8');
const dbUrl = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const client = new pg.Client({ connectionString: dbUrl }); await client.connect();
const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='sign_forensic_audit'`);
console.log(cols.rows.map(c=>c.column_name));
const r = await client.query(`SELECT * FROM sign_forensic_audit WHERE case_id=$1 ORDER BY created_at ASC`, [process.argv[2]]);
console.log(JSON.stringify(r.rows, null, 2));
await client.end();
