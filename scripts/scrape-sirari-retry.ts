import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'https://trade.tanzania.go.tz';
const LANG = 'l=en';
const RENDER_WAIT_MS = 8000;
const DELAY_MS = 2000;
const OUTPUT_FILE = path.resolve(__dirname, '../trade_procedures_sirari_retry.json');

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim() || null;
}
function extractAcronym(name: string): string | null {
  const match = name.match(/\(([A-Z]{2,})\)/);
  return match ? match[1] : null;
}

const TARGET_PROCEDURES = [
  {
    id: 1253,
    kind: 'IMPORT',
    name: 'Beverages import clearance procedure through Sirari One Stop Border Post (OSBP)'
  },
  {
    id: 1256,
    kind: 'IMPORT',
    name: 'Medical devices import clearance procedure through Sirari OSBP'
  }
];

async function scrapeStepPage(page: Page, stepUrl: string, stepNo: number) {
  const url = stepUrl.includes('l=en') ? stepUrl : `${stepUrl}${stepUrl.includes('?') ? '&' : '?'}${LANG}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(RENDER_WAIT_MS);

  const data = await page.evaluate((sNo) => {
    const h2Instep = document.querySelector('h2.instep');
    let stepTitle = h2Instep ? h2Instep.lastElementChild?.textContent?.trim() : null;
    if (stepTitle) stepTitle = stepTitle.replace(/\s*\(last modified:.*?\)/i, '').trim();
    if (!stepTitle) stepTitle = `Step ${sNo}`;

    const descEl = document.querySelector('#stepDetailContent .step-description, #stepDetailContent p');
    const description = descEl ? descEl.textContent?.trim() : null;

    const entityBlocks = [...document.querySelectorAll('.tdContactImage')];
    let instName: string | null = null;
    let instPhone: string | null = null;
    let instEmail: string | null = null;
    let instWebsite: string | null = null;
    let instAddress: string | null = null;

    const entityBlock = entityBlocks.find(block => {
      const title = block.querySelector('h2.block-of-step-title');
      return title?.textContent?.toLowerCase().includes('entity in charge');
    });

    if (entityBlock) {
      instName = entityBlock.querySelector('h1.block-of-step-title')?.textContent?.trim() || null;
      const addressSpan = entityBlock.querySelector('.value.unicode-bidi span');
      instAddress = addressSpan ? addressSpan.textContent?.trim() : null;

      const phones = [...entityBlock.querySelectorAll('.phone')].map(el => el.textContent?.trim());
      instPhone = phones.filter(Boolean).join(', ') || null;

      const emails = [...entityBlock.querySelectorAll('a[href^="mailto:"]')].map(el => el.getAttribute('href')?.replace('mailto:', '')?.trim());
      instEmail = emails.filter(Boolean).join(', ') || null;

      const webs = [...entityBlock.querySelectorAll('a[href^="http"]:not([href*="maps.google"]):not([href*="goo.gl/maps"])')].map(el => el.getAttribute('href')?.trim());
      instWebsite = webs.filter(Boolean).join(', ') || null;
    }

    const reqDocs: string[] = [];
    document.querySelectorAll('app-documents-list .thumbTitle').forEach(el => {
      const t = el.textContent?.replace(/\s+/g, ' ').trim();
      if (t) reqDocs.push(t);
    });

    const costBlock = document.querySelector('app-costs-list');
    let costEstimate: string | null = null;
    if (costBlock) costEstimate = costBlock.querySelector('.total-nb strong')?.textContent?.trim() || null;

    const tfBlock = document.querySelector('app-timeframe');
    let durationEstimate: string | null = null;
    if (tfBlock) durationEstimate = tfBlock.textContent?.replace(/\s+/g, ' ').trim() || null;

    const bodyText = document.body.textContent || '';
    const isOnline = bodyText.toLowerCase().includes('can be completed online') || 
                     bodyText.toLowerCase().includes('done online') || 
                     !!document.querySelector('.online-indicator, .is-online');

    return { stepTitle, description, instName, instPhone, instEmail, instWebsite, instAddress, reqDocs, costEstimate, durationEstimate, isOnline };
  }, stepNo);

  return {
    step_no: stepNo,
    name: data.stepTitle,
    description: cleanText(data.description),
    institution: {
      name: data.instName,
      acronym: data.instName ? extractAcronym(data.instName) : null,
      phone: data.instPhone,
      email: data.instEmail,
      website: data.instWebsite,
      address: data.instAddress,
    },
    duration_estimate: cleanText(data.durationEstimate),
    cost_estimate: cleanText(data.costEstimate),
    required_documents: data.reqDocs,
    is_online: data.isOnline,
    is_optional: false,
    source_url: url,
  };
}

async function scrapeProcedurePage(page: Page, proc: { id: number; kind: string; name: string }) {
  const url = `${BASE}/procedure/${proc.id}?${LANG}`;
  console.log(`\n🔍 Processing Sirari procedure ${proc.id}: ${proc.name}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(RENDER_WAIT_MS);

    // Expand all accordion blocks explicitly
    await page.evaluate(() => {
      document.querySelectorAll('.row-block:not(.opened)').forEach((el: any) => el.click());
      document.querySelectorAll('.collapse:not(.in)').forEach((el: any) => el.classList.add('in'));
    });
    await sleep(2000);

    const pageData = await page.evaluate(() => {
      const isNotFound = document.body.textContent?.includes("resource you're trying to reach is either not available or does not exist") ||
                         document.title.toLowerCase().includes('disclaimer');

      const breadcrumbs = [...document.querySelectorAll('ol.breadcrumbs li')].map(li => li.textContent?.trim());
      const name = breadcrumbs[0] || null;
      const contextEl = document.querySelector('.context-msg');
      const summary = contextEl ? contextEl.textContent?.trim() : null;

      const summaryData: Record<string, string[]> = {};
      const headings = document.querySelectorAll('h2');
      for (const h2 of headings) {
        const title = h2.textContent?.trim() || '';
        const parent = h2.closest('.panel, .card, .accordion-item, section') || h2.parentElement;
        if (!parent) continue;

        const items: string[] = [];
        parent.querySelectorAll('li, .item, p').forEach(li => {
          const text = li.textContent?.trim();
          if (text && text !== title) items.push(text);
        });

        if (title.toLowerCase().includes('institution')) summaryData['institutions'] = items;
        else if (title.toLowerCase().includes('result')) summaryData['results'] = items;
        else if (title.toLowerCase().includes('required document')) summaryData['documents'] = items;
        else if (title.toLowerCase().includes('cost')) summaryData['cost'] = items;
        else if (title.toLowerCase().includes('duration')) summaryData['duration'] = items;
      }

      const stepLinks: { url: string; text: string; isOptional: boolean }[] = [];
      document.querySelectorAll('a[href*="/step/"]').forEach(a => {
        const href = a.getAttribute('href');
        if (href) {
          const parentRow = a.closest('.row-step, .step-list-item');
          const isOpt = parentRow ? parentRow.textContent?.includes('*') || parentRow.classList.contains('optional') : false;
          stepLinks.push({
            url: href.startsWith('http') ? href : window.location.origin + '/' + href.replace(/^\//, ''),
            text: a.textContent?.trim() || '',
            isOptional: !!isOpt
          });
        }
      });

      return { isNotFound, name, summary, summaryData, stepLinks };
    });

    if (pageData.isNotFound || pageData.stepLinks.length === 0) {
      console.log(`    ⚠️ Procedure ${proc.id} has no step content on live portal.`);
      return {
        source_id: proc.id,
        kind: proc.kind,
        name: proc.name,
        summary: cleanText(pageData.summary) || "Procedure landing page on Tanzania Trade Portal.",
        source_url: url,
        total_cost: cleanText(pageData.summaryData['cost']?.join('; ')),
        total_duration: cleanText(pageData.summaryData['duration']?.join('; ')),
        required_documents: pageData.summaryData['documents'] || [],
        results: pageData.summaryData['results'] || [],
        institutions: pageData.summaryData['institutions'] || [],
        steps: [],
        note: `Resource non-existent or deprecated on live trade.tanzania.go.tz (HTTP 404 / Resource Not Found). Active Sirari procedures use alternative commodity IDs (e.g., ID 1255 for Medicine, 1439 for Agrochemicals, 1446 for Home Appliances).`
      };
    }

    const uniqueSteps = [...new Map(pageData.stepLinks.map(s => [s.url, s])).values()];
    console.log(`    └─ Found ${uniqueSteps.length} steps to scrape...`);

    const steps = [];
    for (let i = 0; i < uniqueSteps.length; i++) {
      await sleep(DELAY_MS);
      try {
        const step = await scrapeStepPage(page, uniqueSteps[i].url, i + 1);
        if (uniqueSteps[i].isOptional) step.is_optional = true;
        steps.push(step);
      } catch (err) {
        steps.push({
          step_no: i + 1,
          name: uniqueSteps[i].text || `Step ${i + 1}`,
          description: null,
          institution: { name: null, acronym: null, phone: null, email: null, website: null, address: null },
          duration_estimate: null,
          cost_estimate: null,
          required_documents: [],
          is_online: null,
          is_optional: uniqueSteps[i].isOptional,
          source_url: uniqueSteps[i].url,
        });
      }
    }

    return {
      source_id: proc.id,
      kind: proc.kind,
      name: cleanText(pageData.name) || proc.name,
      summary: cleanText(pageData.summary),
      source_url: url,
      total_cost: cleanText(pageData.summaryData['cost']?.join('; ')),
      total_duration: cleanText(pageData.summaryData['duration']?.join('; ')),
      required_documents: pageData.summaryData['documents'] || [],
      results: pageData.summaryData['results'] || [],
      institutions: pageData.summaryData['institutions'] || [],
      steps,
    };

  } catch (err) {
    console.error(`  ❌ Procedure ${proc.id} failed: ${(err as Error).message}`);
    return {
      source_id: proc.id,
      kind: proc.kind,
      name: proc.name,
      summary: null,
      source_url: url,
      total_cost: null,
      total_duration: null,
      required_documents: [],
      results: [],
      institutions: [],
      steps: [],
      note: `Failed to scrape: ${(err as Error).message}`
    };
  }
}

async function main() {
  console.log('🌍 Tanzania Trade Portal — Sirari Retry Scraper');
  console.log(`   Scraping ${TARGET_PROCEDURES.length} target procedures with explicit accordion expansion...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const results = [];
  const page = await context.newPage();

  for (const proc of TARGET_PROCEDURES) {
    const res = await scrapeProcedurePage(page, proc);
    results.push(res);
  }

  await browser.close();

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n✅ Saved results to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
