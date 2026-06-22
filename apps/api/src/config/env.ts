import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from root directory if it exists
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
// Also try local directory .env
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://clearos:clearos_pass@localhost:5432/clearos'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('clearos-docs'),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  
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
  
  OPS_BOARD_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
