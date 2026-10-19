import { dbPlatform } from './db/client.js';
import { createSigner } from 'fast-jwt';
import http from 'http';
import { env } from './config/env.js';

async function test() {
  const user = await dbPlatform.selectFrom('users').selectAll().where('email', '=', 'manager@msomi.co').executeTakeFirst();
  console.log('User:', user);
  if (!user) return;

  const signer = createSigner({ key: env.JWT_SECRET });
  const token = signer({ sub: user.id, tenant_id: user.tenant_id, role: user.role, email: user.email, name: user.name, typ: 'access' });

  const getJson = (path: string) => new Promise<{ status: number; data: any }>((resolve, reject) => {
    http.get(`http://localhost:3001${path}`, { headers: { Authorization: 'Bearer ' + token } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        try { resolve({ status: r.statusCode || 0, data: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode || 0, data: d }); }
      });
    }).on('error', reject);
  });

  const drivesRes = await getJson('/v1/drives');
  console.log('Drives status:', drivesRes.status, 'data:', drivesRes.data);

  if (Array.isArray(drivesRes.data) && drivesRes.data.length > 0) {
    for (const d of drivesRes.data) {
      console.log(`Checking files for drive ${d.id} (${d.name}, ${d.type})...`);
      const filesRes = await getJson(`/v1/files?drive_id=${d.id}`);
      console.log('Files status:', filesRes.status, 'data length/content:', Array.isArray(filesRes.data) ? filesRes.data.length : filesRes.data);
    }
  }

  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
