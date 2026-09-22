const { chromium } = require('playwright');
const { withPage } = require('./harness.cjs');
const ROUTES = ['', 'employees', 'departments', 'designations', 'teams', 'groups', 'org-chart', 'employment', 'workforce-planning', 'recruitment',
  'clock-in', 'attendance', 'devices', 'leaves', 'shifts', 'overtime', 'holidays', 'performance', 'training', 'documents', 'assets', 'visitors',
  'payroll', 'my-payslips', 'benefits', 'activity-logs', 'delete-requests', 'cases', 'checklists', 'announcements', 'surveys', 'me'];
const role = process.argv[2] || 'admin'; if (process.argv[3]) { ROUTES.length = 0; ROUTES.push(...process.argv[3].split(',')); }
(async () => {
  await withPage(role, async (page, { consoleErrors, networkLog }) => {
    page.setDefaultTimeout(15000);
    for (const r of ROUTES) {
      const ce0 = consoleErrors.length, nl0 = networkLog.length;
      await page.goto('http://localhost:5173/nexushr' + (r ? '/' + r : ''), { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(700);
      const url = new URL(page.url()).pathname;
      const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000);
      const fails = networkLog.slice(nl0).filter(n => n.status >= 400 && !/\/avatar$/.test(n.url));
      const errs = consoleErrors.slice(ce0).filter(e => !/Failed to load resource/.test(e));
      const flags = [];
      if (url !== '/nexushr' + (r ? '/' + r : '')) flags.push('REDIRECT->' + url);
      if (/something went wrong|unexpected error|failed to load|error boundary/i.test(body)) flags.push('ERROR-TEXT');
      if (fails.length) flags.push('API:' + fails.map(f => `${f.method} ${f.url.replace(/[0-9a-f-]{36}/g, ':id').split('?')[0]} ${f.status}`).join(' | '));
      if (errs.length) flags.push('CONSOLE:' + errs.slice(0, 2).join(' | ').slice(0, 200));
      console.log((r || '(dashboard)').padEnd(20), flags.length ? flags.join('  ') : 'ok');
    }
  });
})().catch(e => { console.log('FAIL', e.message.split('\n')[0]); process.exit(1); });
