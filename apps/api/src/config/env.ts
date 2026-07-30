import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from root directory if it exists
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
// Also try local directory .env
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://clearos:clearos_pass@localhost:5432/clearos'),
  // Dedicated read-only role for the Query Builder's raw-SQL mode (see
  // db/migrations/084_readonly_role.sql) — the real backstop against writes,
  // not just the application-layer keyword checks. Rotate this for any
  // non-local deployment rather than relying on the migration's dev default.
  DATABASE_URL_READONLY: z.string().url().default('postgresql://hudumika_readonly:hudumika_readonly_pass@localhost:5432/clearos'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  
  JWT_SECRET: z.string().default('change-this-in-production-min-32-characters-long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  
  META_WA_TOKEN: z.string().default('your-meta-whatsapp-token'),
  META_PHONE_NUMBER_ID: z.string().default('your-phone-number-id'),
  META_VERIFY_TOKEN: z.string().default('your-webhook-verify-token'),
  META_API_VERSION: z.string().default('v21.0'),
  
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default('your-email@domain.com'),
  SMTP_PASS: z.string().default('your-app-password'),
  SMTP_FROM: z.string().default('ClearOS <noreply@clearos.co>'),
  
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /** Public origin of the web app, used to build links that leave the system
   *  — currently the QR code printed on landed-cost estimates. Deliberately
   *  NOT derived from a request Host header: a spoofed header would mint QR
   *  codes pointing elsewhere, and these are printed on paper, so a wrong
   *  link can't be recalled. Leave unset and it falls back to the first
   *  CORS origin, which is already the frontend URL in every deployment. */
  PUBLIC_APP_URL: z.string().url().optional(),

  OPS_BOARD_URL: z.string().url().default('http://localhost:5173'),
  
  AIS_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
