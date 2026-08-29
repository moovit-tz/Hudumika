/**
 * Vitest globalSetup — runs once, in its own process, before any test file's
 * module graph loads. Truncates every table in the test database so repeated
 * suite runs are deterministic (unique constraints like Organization.registrationNumber
 * or User.phoneNumber won't collide with leftovers from a prior run).
 *
 * Independent of test/setup.ts (a `setupFiles` entry, which runs per test
 * file inside the worker) — globalSetup does not inherit that env loading,
 * so it loads .env.test itself.
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@ondi/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  config({ path: path.join(__dirname, '..', '.env.test'), override: true });

  if (!process.env.DATABASE_URL?.includes('oneid_test_db')) {
    throw new Error(
      `Refusing to truncate: DATABASE_URL does not point at oneid_test_db (got: ${process.env.DATABASE_URL}).`,
    );
  }

  const prisma = new PrismaClient();
  try {
    const tables: { tablename: string }[] = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    if (tables.length > 0) {
      const list = tables.map(t => `"${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
