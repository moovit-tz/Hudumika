import { cp } from 'node:fs/promises';
await cp(new URL('../src/assets/', import.meta.url), new URL('../dist/assets/', import.meta.url), { recursive: true });
await cp(new URL('../src/db/migrations/', import.meta.url), new URL('../dist/db/migrations/', import.meta.url), { recursive: true });
