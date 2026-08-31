import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type { paths } from './schema.js';

export interface HudumikaClientOptions {
  /** e.g. https://api.hudumika.tz or http://localhost:3001 */
  baseUrl: string;
  /** Partner API key (x-api-key header) — use this OR bearerToken, not both. */
  apiKey?: string;
  /** Internal session JWT (Authorization: Bearer). */
  bearerToken?: string;
}

/**
 * Typed client for the Hudumika API, generated from the live OpenAPI spec
 * (`npm run generate` in this package re-syncs src/schema.d.ts against a
 * running API instance at http://localhost:3001/docs/json).
 *
 * Usage:
 *   const api = createHudumikaClient({ baseUrl: 'https://api.hudumika.tz', apiKey: 'hdk_...' });
 *   const { data, error } = await api.GET('/v1/customers');
 */
export function createHudumikaClient(options: HudumikaClientOptions) {
  const client = createClient<paths>({ baseUrl: options.baseUrl });

  const authMiddleware: Middleware = {
    onRequest({ request }) {
      if (options.apiKey) request.headers.set('x-api-key', options.apiKey);
      else if (options.bearerToken) request.headers.set('Authorization', `Bearer ${options.bearerToken}`);
      return request;
    },
  };
  client.use(authMiddleware);

  return client;
}

export type HudumikaClient = ReturnType<typeof createHudumikaClient>;
