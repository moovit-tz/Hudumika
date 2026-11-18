/**
 * Dev check: for every MCP list/detail tool, fetch its route as a real user
 * and report declared fields that never appear in the route's rows (a field
 * that is present but null is fine; a field name the route never returns is a
 * catalog bug). Usage: npx tsx src/scripts/mcp-field-audit.ts <user-email>
 */
import { server } from '../index.js';
import { registerApp } from '../index.js';
import { dbPlatform } from '../db/client.js';
import { MCP_TOOLS } from '../lib/mcp/tools.js';
import { rowsOf } from '../lib/mcp/types.js';

async function main() {
  const email = process.argv[2];
  await (registerApp as any)?.();
  await server.ready();
  const user = await dbPlatform.selectFrom('users').select(['id', 'tenant_id', 'role', 'name', 'email']).where('email', '=', email).executeTakeFirstOrThrow();
  const token = server.jwt.sign({ sub: user.id, tenant_id: user.tenant_id, role: user.role, email: user.email, name: user.name, typ: 'access' } as any, { expiresIn: 600 });
  for (const t of MCP_TOOLS) {
    const route = t.routes[0];
    if (!route.startsWith('GET ') || route.includes(':') || t.access !== 'read') continue;
    const path = route.slice(4);
    const props = Object.keys(((t.outputSchema as any).properties?.items?.items?.properties) ?? (t.outputSchema as any).properties ?? {});
    const res = await server.inject({ method: 'GET', url: path + (path === '/v1/search' ? '?q=a' : path === '/v1/files' ? '' : ''), headers: { authorization: `Bearer ${token}` } });
    if (res.statusCode >= 400) { console.log(`${t.id.padEnd(38)} HTTP ${res.statusCode}`); continue; }
    const body = res.json();
    const isList = !!(t.outputSchema as any).properties?.items;
    const rows = isList ? rowsOf(body, undefined) : [];
    const sample = isList ? (rows.length ? rows : (Object.values(body ?? {}).find(Array.isArray) as any[] ?? [])) : [body?.data && !Array.isArray(body.data) ? body.data : body];
    if (!sample.length) { console.log(`${t.id.padEnd(38)} (no rows to check)`); continue; }
    const keys = new Set(sample.flatMap((r: any) => Object.keys(r ?? {})));
    const missing = props.filter(p => !keys.has(p));
    console.log(`${t.id.padEnd(38)} ${missing.length ? 'MISSING ' + missing.join(',') + '  | has: ' + [...keys].slice(0, 40).join(',') : 'ok'}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
