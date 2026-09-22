const { withPage } = require('./harness.cjs');
const ROUTES = process.argv[3] ? process.argv[3].split(',') : ['employees', 'departments', 'designations', 'teams', 'groups', 'org-chart', 'employment', 'workforce-planning', 'recruitment', 'clock-in', 'attendance', 'devices', 'leaves', 'shifts', 'overtime', 'holidays', 'performance', 'training', 'documents', 'assets', 'visitors', 'payroll', 'benefits', 'delete-requests', 'cases', 'checklists', 'announcements', 'surveys'];
const OPENER = /^(\+\s*)?(add|new|create|request|upload|invite|schedule|assign|enroll|record|register|apply|claim|log)\b/i;
(async () => {
  await withPage(process.argv[2] || 'admin', async (page, { consoleErrors, networkLog }) => {
    page.setDefaultTimeout(20000);
    for (const r of ROUTES) {
      await page.goto('http://localhost:5173/nexushr/' + r, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(600);
      const names = (await page.locator('.app-shell-content').getByRole('button').allInnerTexts()).map(s => s.trim()).filter(s => s && OPENER.test(s));
      const uniq = [...new Set(names)].slice(0, 4);
      const results = [];
      for (const nm of uniq) {
        const ce0 = consoleErrors.length, nl0 = networkLog.length;
        try {
          await page.goto('http://localhost:5173/nexushr/' + r, { waitUntil: 'load' });
          await page.waitForTimeout(1500);
          await page.locator('.app-shell-content').getByRole('button', { name: nm, exact: true }).first().click({ timeout: 8000 });
          await page.waitForTimeout(500);
          const modal = page.locator('[role=dialog], .modal-overlay, .onsite-modal-overlay, [class*="modal"]:visible').first();
          const hasModal = await modal.count();
          const combos = page.locator('[role=dialog] [role=combobox], .modal-overlay [role=combobox], form [role=combobox]');
          const n = Math.min(await combos.count(), 3); const covered = [];
          for (let i = 0; i < n; i++) {
            await combos.nth(i).click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(250);
            const ok = await page.evaluate(() => { const o = document.querySelector('[role=option]'); if (!o) return 'no-options'; const b = o.getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el && o.contains(el) ? 'ok' : 'COVERED'; });
            if (ok === 'COVERED') covered.push(i);
            await page.keyboard.press('Escape'); await page.waitForTimeout(150);
          }
          const fails = networkLog.slice(nl0).filter(x => x.status >= 400 && !/avatar/.test(x.url)).map(x => `${x.method} ${x.url.split('?')[0].replace(/[0-9a-f-]{36}/g, ':id')} ${x.status}`);
          const errs = consoleErrors.slice(ce0).filter(e => !/Failed to load resource/.test(e));
          results.push(`${nm}: ${hasModal ? 'opens' : 'NO-FORM'} selects=${n}${covered.length ? ' COVERED#' + covered : ''}${fails.length ? ' API:' + fails.join('|') : ''}${errs.length ? ' ERR:' + errs[0].slice(0, 80) : ''}`);
        } catch (e) { results.push(`${nm}: click-failed (${e.message.split('\n')[0].slice(0, 60)})`); }
      }
      console.log(r.padEnd(20), results.length ? results.join('  ||  ') : '(no opener buttons)');
    }
  });
})().catch(e => { console.log('FAIL', e.message.split('\n')[0]); process.exit(1); });
