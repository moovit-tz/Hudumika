import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(500);
await page.getByText('Sign in instead').click({ timeout: 15000 });
await page.waitForTimeout(800);
await page.getByText('Tenant Admin').click({ timeout: 20000 });
await page.waitForTimeout(3000);

const channels = await page.evaluate(async () => {
  const res = await fetch('http://localhost:3001/v1/chat/channels', { credentials: 'include' });
  return res.json();
});
console.log('Channels:', JSON.stringify(channels).slice(0, 1000));

for (const ch of (Array.isArray(channels) ? channels : channels.data || [])) {
  const msgs = await page.evaluate(async (id) => {
    const res = await fetch(`http://localhost:3001/v1/chat/channels/${id}/messages`, { credentials: 'include' });
    return res.json();
  }, ch.id);
  const arr = Array.isArray(msgs) ? msgs : msgs.data || msgs.messages || [];
  console.log(`Channel ${ch.id} (${ch.name || ch.type}): ${arr.length} messages`);
  if (arr.length > 0) {
    console.log('  sample author_id vs message:', arr.slice(0,3).map(m => ({ author_id: m.author_id, content: (m.content||'').slice(0,20) })));
  }
}

await browser.close();
