import pg from 'pg';

const ports = [5432, 5433];
const users = ['postgres', 'clearos', 'Viden', 'admin'];
const passwords = [
  'postgres',
  'password',
  'admin',
  'root',
  '123456',
  '1234',
  '12345678',
  'password123',
  'clearos',
  'clearos_pass',
  'clearos_db',
  'msomi',
  'msomi123',
  'viden',
  'Viden',
  'viden123',
  'Viden123',
  'Viden@123',
  'Viden@2026',
  'Viden2026',
  'admin123',
  'admin@123',
  'Optin@24!',
  'u348862523_moovit'
];

async function probe() {
  for (const port of ports) {
    for (const user of users) {
      for (const password of passwords) {
        const url = `postgresql://${user}:${encodeURIComponent(password)}@localhost:${port}/clearos`;
        const client = new pg.Client({ connectionString: url });
        try {
          await client.connect();
          console.log(`✅ SUCCESS: port=${port}, user=${user}, password=${password}`);
          await client.end();
          return;
        } catch (err: any) {
          // only log success to avoid overwhelming output
          if (err.message && err.message.includes('does not exist')) {
            console.log(`❓ USER/DB EXISTS but DB clearos missing: port=${port}, user=${user}, password=${password}`);
            // Let's try connecting to default 'postgres' database
            const defaultUrl = `postgresql://${user}:${encodeURIComponent(password)}@localhost:${port}/postgres`;
            const defClient = new pg.Client({ connectionString: defaultUrl });
            try {
              await defClient.connect();
              console.log(`✅ SUCCESS (postgres db): port=${port}, user=${user}, password=${password}`);
              await defClient.end();
              return;
            } catch (err2) {
              // ignore
            }
          }
        }
      }
    }
  }
  console.log('❌ All probes failed');
}

probe();
