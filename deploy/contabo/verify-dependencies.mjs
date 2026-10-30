import pg from 'pg';
import nodemailer from 'nodemailer';

for (const [key, bypass] of [['DATABASE_URL_APP', false], ['DATABASE_URL_PLATFORM', true], ['DATABASE_URL_READONLY', false]]) {
  const pool = new pg.Pool({ connectionString: process.env[key], connectionTimeoutMillis: 10000 });
  try {
    const { rows } = await pool.query('SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user');
    if (rows.length !== 1 || rows[0].rolsuper || rows[0].rolcreatedb || rows[0].rolcreaterole || rows[0].rolbypassrls !== bypass) throw new Error(`Database role privileges do not match the expected boundary: ${key}`);
  } finally { await pool.end(); }
}
const port = Number(process.env.SMTP_PORT || 587);
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
});
try {
  // Verifies TLS and authentication; does not send a message to anyone.
  await transport.verify();
  console.log('Database role boundaries and SMTP TLS/authentication verified. No email sent.');
} finally { transport.close(); }
