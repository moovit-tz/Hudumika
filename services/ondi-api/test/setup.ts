/**
 * Vitest global setup — loaded before any test file's module graph
 * (including src/app.ts, which reads env vars at plugin-registration time:
 * DATABASE_URL for PrismaClient, JWT_SECRET/ADMIN_KEY/SAML_* via
 * src/lib/env.ts's requireEnv). Must run first so buildApp() below and
 * every subsequent test import see the test database, not dev.
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.join(__dirname, '..', '.env.test'), override: true });

if (!process.env.DATABASE_URL?.includes('oneid_test_db')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not point at oneid_test_db (got: ${process.env.DATABASE_URL}). ` +
    `Check services/ondi-api/.env.test.`,
  );
}
