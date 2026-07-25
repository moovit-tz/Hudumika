/**
 * Tanzania Trade Portal Scraper
 * ──────────────────────────────────────────────────────────────────
 * Extracts procedure + step data from trade.tanzania.go.tz — a
 * client-rendered Angular app — using Playwright for headful rendering.
 *
 * Usage:
 *   npx tsx scripts/scrape-trade-portal.ts
 *
 * Output:
 *   ./trade_procedures_output.json   — full JSON array
 *   ./trade_procedures_partial.json  — incremental saves (safe to resume)
 *   ./progress.html                  — real-time progress HTML dashboard
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ── Configuration ──────────────────────────────────────────────
const BASE = 'https://trade.tanzania.go.tz';
const LANG = 'l=en';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2', 10);
const RESUME = process.env.RESUME !== 'false';
const HEADLESS = process.env.HEADLESS !== 'false';
const DELAY_MS = 2000; // polite delay between requests
const RENDER_WAIT_MS = 8000; // wait for Angular to render
const OUTPUT_FILE = path.resolve(__dirname, '../trade_procedures_output.json');
const PARTIAL_FILE = path.resolve(__dirname, '../trade_procedures_partial.json');
const PROGRESS_HTML_FILE = path.resolve(__dirname, '../progress.html');

let startTime = Date.now();

// ── Procedure IDs from the prompt ──────────────────────────────
const PROCEDURES: { id: number; kind: string; name: string }[] = [
  // EXPORT (12)
  { id: 1201, kind: 'EXPORT', name: 'Certificate of exporter  of food products' },
  { id: 796, kind: 'EXPORT', name: 'Export of fish and fishery products through port of Zanzibar' },
  { id: 1663, kind: 'EXPORT', name: 'Export of seaweeds through the port of Malindi' },
  { id: 991, kind: 'EXPORT', name: 'Export of spices through the port of Zanzibar' },
  { id: 801, kind: 'EXPORT', name: 'Export permit' },
  { id: 1097, kind: 'EXPORT', name: 'Health certificate for export (Pemba)' },
  { id: 1203, kind: 'EXPORT', name: 'Health certificate for export (Unguja)' },
  { id: 995, kind: 'EXPORT', name: 'Permission to export marine products' },
  { id: 700, kind: 'EXPORT', name: 'Registered Exporter System (REX system)' },
  { id: 996, kind: 'EXPORT', name: 'Registration of marine products exporters' },
  { id: 733, kind: 'EXPORT', name: 'Seaweeds export clearance through Malindi port' },
  { id: 990, kind: 'EXPORT', name: 'Spices export clearance procedure through Zanzibar port' },
  // TRANSIT (2)
  { id: 440, kind: 'TRANSIT', name: 'Transit pass for apiary or bee products produce (TP)' },
  { id: 322, kind: 'TRANSIT', name: 'Transit pass for forest produce (TP)' },
  // REGISTRATION (40)
  { id: 727, kind: 'REGISTRATION', name: 'AGOA Certificate of origin-Zanzibar' },
  { id: 1563, kind: 'REGISTRATION', name: 'Animal health certificate' },
  { id: 904, kind: 'REGISTRATION', name: 'Business licence' },
  { id: 745, kind: 'REGISTRATION', name: 'Business licence (Zanzibar)' },
  { id: 725, kind: 'REGISTRATION', name: 'Buying cloves at Zanzibar State Trading Corporation (ZSTC)' },
  { id: 1152, kind: 'REGISTRATION', name: 'Certificate of analysis (CGCLA) (Pemba)' },
  { id: 1151, kind: 'REGISTRATION', name: 'Certificate of analysis (Unguja)' },
  { id: 260, kind: 'REGISTRATION', name: 'Certificate of conformity' },
  { id: 752, kind: 'REGISTRATION', name: 'Certificate of conformity (ZBS)' },
  { id: 988, kind: 'REGISTRATION', name: 'Certificate of radioactivity analysis' },
  { id: 1006, kind: 'REGISTRATION', name: 'Certificate of radioactivity analysis (Zanzibar)' },
  { id: 1184, kind: 'REGISTRATION', name: 'Certificate of registration (ZRA)' },
  { id: 449, kind: 'REGISTRATION', name: 'Certificate of roadworthiness' },
  { id: 730, kind: 'REGISTRATION', name: 'China certificate of origin-Zanzibar' },
  { id: 477, kind: 'REGISTRATION', name: 'Clearance certificate for meat and meat products' },
  { id: 1202, kind: 'REGISTRATION', name: 'Clearance of goods through Mkoani Port' },
  { id: 704, kind: 'REGISTRATION', name: 'Clearance of avocado through JNIA' },
  { id: 288, kind: 'REGISTRATION', name: 'Clearance of food stuff through the port of Dar es Salaam' },
  { id: 1189, kind: 'REGISTRATION', name: 'Clearance of fruits through Abeid Aman Karuma international Airpot' },
  { id: 505, kind: 'REGISTRATION', name: 'Clearance of milk and milk products through Dar es salaam port' },
  { id: 620, kind: 'REGISTRATION', name: 'Clearance of spices through Dar es Salaam port' },
  { id: 444, kind: 'REGISTRATION', name: 'Clearance of timber through the port of Dar' },
  { id: 794, kind: 'REGISTRATION', name: 'Clearance through port of Malindi' },
  { id: 771, kind: 'REGISTRATION', name: 'Clearance through the port of Zanzibar' },
  { id: 196, kind: 'REGISTRATION', name: 'Destination Inspection' },
  { id: 726, kind: 'REGISTRATION', name: 'EAC Certificate of origin-Zanzibar' },
  { id: 370, kind: 'REGISTRATION', name: 'Fertilizer dealer licence' },
  { id: 446, kind: 'REGISTRATION', name: 'Full procedure view-for a first time trader' },
  { id: 729, kind: 'REGISTRATION', name: 'International certificate of origin-Zanzibar' },
  { id: 1251, kind: 'REGISTRATION', name: 'Milk import clearance procedure through Namanga One Stop Border Post' },
  { id: 1197, kind: 'REGISTRATION', name: 'Obtain Pemba ZBS e-permit' },
  { id: 744, kind: 'REGISTRATION', name: 'Phytosanitary certificate' },
  { id: 15, kind: 'REGISTRATION', name: 'Phytosanitary certificate approval' },
  { id: 1233, kind: 'REGISTRATION', name: 'Premise registration certificate' },
  { id: 1234, kind: 'REGISTRATION', name: 'Products registration certificate' },
  { id: 439, kind: 'REGISTRATION', name: 'Registration of honey and bee products dealer' },
  { id: 122, kind: 'REGISTRATION', name: 'Registration of cosmetics' },
  { id: 1204, kind: 'REGISTRATION', name: 'Registration of food product' },
  { id: 777, kind: 'REGISTRATION', name: 'Registration of food stuff' },
  { id: 476, kind: 'REGISTRATION', name: 'Registration of meat industry stakeholders' },
  { id: 142, kind: 'REGISTRATION', name: 'Registration of medical device or in vitro diagnostic devices' },
  { id: 121, kind: 'REGISTRATION', name: 'Registration of medicine' },
  { id: 997, kind: 'REGISTRATION', name: 'Registration of premise (ZFDA) (Pemba)' },
  { id: 1098, kind: 'REGISTRATION', name: 'Registration of premises (ZFDA) (Unguja)' },
  { id: 125, kind: 'REGISTRATION', name: 'Registration of premises for cosmetics' },
  { id: 776, kind: 'REGISTRATION', name: 'Registration of premises for food stuff' },
  { id: 126, kind: 'REGISTRATION', name: 'Registration of premises for medical or in vitro diagnostic devices' },
  { id: 1022, kind: 'REGISTRATION', name: 'Registration of premises for wholesale medicine' },
  { id: 323, kind: 'REGISTRATION', name: 'Registration of timber yard' },
  { id: 728, kind: 'REGISTRATION', name: 'SADC Certificate of origin-Zanzibar' },
  // IMPORT (84)
  { id: 1439, kind: 'IMPORT', name: 'Agrochemicals import clearance through Sirari One Border Post (OSBP)' },
  { id: 445, kind: 'IMPORT', name: 'Apiary or bee products import clearance procedure through the port of Dar es Salaam' },
  { id: 979, kind: 'IMPORT', name: 'Beverages import clearance procedure through Namanga One Stop Border Post (OSBP)' },
  { id: 1253, kind: 'IMPORT', name: 'Beverages import clearance procedure through Sirari One Stop Border Post (OSBP)' },
  { id: 1244, kind: 'IMPORT', name: 'Cereals and legumes import clearance procedure through Namanga OSBP' },
  { id: 686, kind: 'IMPORT', name: 'Cereals and legumes import clearance procedure through the port of Dar es Salaam' },
  { id: 1249, kind: 'IMPORT', name: 'Cosmetics import clearance procedure through Namanga OSBP' },
  { id: 285, kind: 'IMPORT', name: 'Cosmetics import clearance procedure through the port of Dar es Salaam' },
  { id: 842, kind: 'IMPORT', name: 'Dry leaf tobacco import licence' },
  { id: 372, kind: 'IMPORT', name: 'Fertilizer import permit' },
  { id: 432, kind: 'IMPORT', name: 'Fertilizers import clearance procedure through Dar es Salaam port' },
  { id: 804, kind: 'IMPORT', name: 'Fish and fishery products import licence' },
  { id: 421, kind: 'IMPORT', name: 'Fish import permit' },
  { id: 612, kind: 'IMPORT', name: 'Food crop import permit' },
  { id: 1435, kind: 'IMPORT', name: 'Furniture import clearance through Sirari One Border Post (OSBP)' },
  { id: 1437, kind: 'IMPORT', name: 'Glassware import clearance through Sirari One Border Post (OSBP)' },
  { id: 853, kind: 'IMPORT', name: 'Green leaf tobacco import license' },
  { id: 1436, kind: 'IMPORT', name: 'Home applience import clearance through Sirari One Border Post (OSBP)' },
  { id: 977, kind: 'IMPORT', name: 'Import beverages through Namanga One Stop Border Post (OSPB)' },
  { id: 1243, kind: 'IMPORT', name: 'Import clearance through Malindi port' },
  { id: 542, kind: 'IMPORT', name: 'Import cosmetics through port of Dar es salaam' },
  { id: 571, kind: 'IMPORT', name: 'Import fertilizers through port of Dar es salaam' },
  { id: 783, kind: 'IMPORT', name: 'Import food through Zanzibar port' },
  { id: 1445, kind: 'IMPORT', name: 'Import furniture through Sirari OSBP' },
  { id: 1447, kind: 'IMPORT', name: 'Import glassware through Sirari OSBP' },
  { id: 1454, kind: 'IMPORT', name: 'Import home applience through port of Dar es Salaam' },
  { id: 1446, kind: 'IMPORT', name: 'Import home applience through Sirari OSBP' },
  { id: 539, kind: 'IMPORT', name: 'Import medical device or in vitro diagnostic through port of Dar es salaam' },
  { id: 773, kind: 'IMPORT', name: 'Import medicine through Zanzibar port' },
  { id: 621, kind: 'IMPORT', name: 'Import of avocado through JNIA' },
  { id: 695, kind: 'IMPORT', name: 'Import of cereals and legumes through the port of Dar es Salaam' },
  { id: 1453, kind: 'IMPORT', name: 'Import of farnitures through the port of Dar es Salaam' },
  { id: 572, kind: 'IMPORT', name: 'Import of meat and meat products through JNIA' },
  { id: 545, kind: 'IMPORT', name: 'Import of medicine through JNIA' },
  { id: 565, kind: 'IMPORT', name: 'Import of milk and milk products through the port of Dar es Salaam' },
  { id: 954, kind: 'IMPORT', name: 'Import of second hand clothes through the port of Dar es Salaam' },
  { id: 958, kind: 'IMPORT', name: 'Import of spare parts through the port of Dar es Salaam' },
  { id: 688, kind: 'IMPORT', name: 'Import of spices through the port of Dar es Salaam' },
  { id: 464, kind: 'IMPORT', name: 'Import of tea through Dar es salaam port' },
  { id: 1452, kind: 'IMPORT', name: 'Import of textiles through the port of Dar es Salaam' },
  { id: 573, kind: 'IMPORT', name: 'Import of timber through port of Dar es salaam' },
  { id: 802, kind: 'IMPORT', name: 'Import permit (MTID)' },
  { id: 412, kind: 'IMPORT', name: 'Import permit for apiary or bee products' },
  { id: 1242, kind: 'IMPORT', name: 'Import processed foods through port of Dar es salaam' },
  { id: 1444, kind: 'IMPORT', name: 'Import textile through Sirari OSBP' },
  { id: 530, kind: 'IMPORT', name: 'Importer registration of dairy stakeholder' },
  { id: 526, kind: 'IMPORT', name: 'Meat import clearance procedure through JNIA' },
  { id: 1250, kind: 'IMPORT', name: 'Meat import clearance procedure through Namanga OSPB' },
  { id: 1247, kind: 'IMPORT', name: 'Medical devices import clearance procedure through Namanga OSBP' },
  { id: 1256, kind: 'IMPORT', name: 'Medical devices import clearance procedure through Sirari OSBP' },
  { id: 278, kind: 'IMPORT', name: 'Medical devices import clearance procedure through the port of Dar es Salaam' },
  { id: 128, kind: 'IMPORT', name: 'Medical devices or in vitro diagnosis device import permit' },
  { id: 552, kind: 'IMPORT', name: 'Medicine import clearance procedure through JNIA' },
  { id: 1245, kind: 'IMPORT', name: 'Medicine import clearance procedure through Namanga OSBP' },
  { id: 1255, kind: 'IMPORT', name: 'Medicine import clearance procedure through Sirari OSBP' },
  { id: 26, kind: 'IMPORT', name: 'Medicines import permit' },
  { id: 529, kind: 'IMPORT', name: 'Milk and milk products import permit' },
  { id: 94, kind: 'IMPORT', name: 'Plant import permit' },
  { id: 1246, kind: 'IMPORT', name: 'Processed food import clearance procedure through Namanga' },
  { id: 1237, kind: 'IMPORT', name: 'Processed food import clearance procedure through the port of Dar es Salaam' },
  { id: 787, kind: 'IMPORT', name: 'Registration of food stuff Importer' },
  { id: 800, kind: 'IMPORT', name: 'Registration of importers' },
  { id: 381, kind: 'IMPORT', name: 'Registration of importers of forest products' },
  { id: 830, kind: 'IMPORT', name: 'Registration of tobacco importer' },
  { id: 938, kind: 'IMPORT', name: 'Second hand clothes (mitumba) import clearance procedures through the port of Dar es Salaam' },
  { id: 890, kind: 'IMPORT', name: 'Spare parts (bicycles, motorcycles) import clearance procedures through port of Dar es Salaam' },
  { id: 455, kind: 'IMPORT', name: 'Tea import clearance procedure through Dar es salaam port' },
  { id: 1267, kind: 'IMPORT', name: 'Tea import clearance procedure through Namanga One Stop Border Post (OSBP)' },
  { id: 200, kind: 'IMPORT', name: 'Tea import permit' },
  { id: 1451, kind: 'IMPORT', name: 'Textiles import clearance procedures through the port of Dar es Salaam' },
  { id: 391, kind: 'IMPORT', name: 'Timber import permit' },
  { id: 841, kind: 'IMPORT', name: 'Tobacco import permit' },
  { id: 266, kind: 'IMPORT', name: 'Used motor vehicle import clearance procedure through the port of Dar es Salaam' },
  { id: 779, kind: 'IMPORT', name: 'ZFDA processed food import permit' },
];

// ── Types ──────────────────────────────────────────────────────
interface Institution {
  name: string | null;
  acronym: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

interface Step {
  step_no: number;
  name: string;
  description: string | null;
  institution: Institution;
  duration_estimate: string | null;
  cost_estimate: string | null;
  required_documents: string[];
  is_online: boolean | null;
  is_optional: boolean;
  source_url: string;
}

interface Procedure {
  source_id: number;
  kind: string;
  name: string;
  summary: string | null;
  source_url: string;
  total_cost: string | null;
  total_duration: string | null;
  required_documents: string[];
  results: string[];
  institutions: string[];
  steps: Step[];
  note?: string;
}

// ── Helpers ────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim() || null;
}

function extractAcronym(name: string): string | null {
  const match = name.match(/\(([A-Z]{2,})\)/);
  return match ? match[1] : null;
}

// ── Write Progress HTML ────────────────────────────────────────
function writeProgressHtml(results: Procedure[], total: number, activeBatch: typeof PROCEDURES) {
  const percent = Math.round((results.length / total) * 100);
  const timeElapsedMin = Math.round((Date.now() - startTime) / 60000);
  const etaMin = results.length > 0 ? Math.round(((total - results.length) / results.length) * timeElapsedMin) : 0;
  
  const recent = results.slice(-10).reverse();
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="10">
  <title>Scraper Progress Tracker</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0b1e3a;
      color: #f4f5f6;
      margin: 0;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }
    .card {
      background: #172a45;
      border-radius: 16px;
      padding: 30px;
      width: 100%;
      max-width: 800px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      border: 1px solid #3088a8;
    }
    h1 { margin-top: 0; color: #3088a8; font-size: 24px; }
    .progress-container {
      background: #0b1e3a;
      border-radius: 10px;
      height: 20px;
      width: 100%;
      margin: 20px 0;
      overflow: hidden;
      border: 1px solid #3088a8;
    }
    .progress-bar {
      background: #3088a8;
      height: 100%;
      width: ${percent}%;
      transition: width 0.5s ease-in-out;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-box {
      background: #0b1e3a;
      padding: 15px;
      border-radius: 10px;
      text-align: center;
      border: 1px solid #3088a8;
    }
    .stat-val { font-size: 20px; font-weight: bold; color: #3088a8; }
    .stat-lbl { font-size: 11px; color: #a5b1c2; text-transform: uppercase; margin-top: 5px; }
    .active-batch {
      background: #172a45;
      border-left: 4px solid #3088a8;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 30px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #3088a8; }
    th { color: #3088a8; font-size: 13px; text-transform: uppercase; }
    td { font-size: 14px; }
    .kind-badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      background: #0b1e3a;
      color: #3088a8;
    }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #a5b1c2; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Tanzania Trade Portal Scraper Status</h1>
    <div class="progress-container">
      <div class="progress-bar"></div>
    </div>
    
    <div class="stats">
      <div class="stat-box">
        <div class="stat-val">${percent}%</div>
        <div class="stat-lbl">Progress</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${results.length} / ${total}</div>
        <div class="stat-lbl">Completed</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${timeElapsedMin} min</div>
        <div class="stat-lbl">Elapsed</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${etaMin} min</div>
        <div class="stat-lbl">Remaining (ETA)</div>
      </div>
    </div>

    <div class="active-batch">
      <strong>Currently Scraping:</strong>
      <ul style="margin: 5px 0 0 20px; padding: 0; font-size: 13px; color: #a5b1c2;">
        ${activeBatch.map(p => `<li>[${p.kind}] ${p.name} (ID: ${p.id})</li>`).join('')}
      </ul>
    </div>

    <h3>Recently Scraped (Latest 10)</h3>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Kind</th>
          <th>Name</th>
          <th>Steps</th>
        </tr>
      </thead>
      <tbody>
        ${recent.map(r => `
          <tr>
            <td>${r.source_id}</td>
            <td><span class="kind-badge">${r.kind}</span></td>
            <td>${r.name}</td>
            <td style="color: #3088a8; font-weight: bold;">${r.steps.length}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="footer">
      Auto-refreshing every 10 seconds. Last updated: ${new Date().toLocaleTimeString()}
    </div>
  </div>
</body>
</html>
`;
  try {
    fs.writeFileSync(PROGRESS_HTML_FILE, html, 'utf-8');
  } catch (err) {
    console.error('Failed to write progress HTML:', err);
  }
}

// ── Page Scrapers ──────────────────────────────────────────────

/** Scrape the main procedure overview page */
async function scrapeProcedurePage(page: Page, proc: { id: number; kind: string; name: string }): Promise<Procedure> {
  const url = `${BASE}/procedure/${proc.id}?${LANG}`;
  console.log(`  📄 Procedure ${proc.id}: ${proc.name}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(RENDER_WAIT_MS);

    // Wait for content to appear
    try {
      await page.waitForSelector('my-app', { timeout: 15000 });
    } catch { /* ignore */ }

    const procedureData = await page.evaluate(() => {
      const breadcrumbs = [...document.querySelectorAll('ol.breadcrumbs li')].map(li => li.textContent?.trim());
      const name = breadcrumbs[0] || null;
      
      const contextEl = document.querySelector('.context-msg');
      const summary = contextEl ? contextEl.textContent?.trim() : null;

      // Extract general summary data
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

      const stepLinks: { url: string; text: string }[] = [];
      document.querySelectorAll('a[href*="/step/"]').forEach(a => {
        const href = a.getAttribute('href');
        if (href) {
          stepLinks.push({
            url: href.startsWith('http') ? href : window.location.origin + '/' + href.replace(/^\//, ''),
            text: a.textContent?.trim() || ''
          });
        }
      });

      return { name, summary, summaryData, stepLinks };
    });

    const uniqueSteps = [...new Map(procedureData.stepLinks.map(s => [s.url, s])).values()];
    console.log(`    └─ Found ${uniqueSteps.length} steps to scrape...`);

    const steps: Step[] = [];
    for (let i = 0; i < uniqueSteps.length; i++) {
      await sleep(DELAY_MS);
      try {
        const step = await scrapeStepPage(page, uniqueSteps[i].url, i + 1);
        steps.push(step);
      } catch (err) {
        console.warn(`    ⚠️  Step ${i + 1} failed: ${(err as Error).message}`);
        steps.push({
          step_no: i + 1,
          name: uniqueSteps[i].text || `Step ${i + 1}`,
          description: null,
          institution: { name: null, acronym: null, phone: null, email: null, website: null, address: null },
          duration_estimate: null,
          cost_estimate: null,
          required_documents: [],
          is_online: null,
          is_optional: false,
          source_url: uniqueSteps[i].url,
        });
      }
    }

    return {
      source_id: proc.id,
      kind: proc.kind,
      name: cleanText(procedureData.name) || proc.name,
      summary: cleanText(procedureData.summary),
      source_url: url,
      total_cost: cleanText(procedureData.summaryData['cost']?.join('; ')),
      total_duration: cleanText(procedureData.summaryData['duration']?.join('; ')),
      required_documents: procedureData.summaryData['documents'] || [],
      results: procedureData.summaryData['results'] || [],
      institutions: procedureData.summaryData['institutions'] || [],
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
      note: `Failed to scrape: ${(err as Error).message}`,
    };
  }
}

/** Scrape a single step detail page */
async function scrapeStepPage(page: Page, stepUrl: string, stepNo: number): Promise<Step> {
  const url = stepUrl.includes('l=en') ? stepUrl : `${stepUrl}${stepUrl.includes('?') ? '&' : '?'}${LANG}`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(RENDER_WAIT_MS);

  const data = await page.evaluate((sNo) => {
    const h2Instep = document.querySelector('h2.instep');
    let stepTitle = h2Instep ? h2Instep.lastElementChild?.textContent?.trim() : null;
    if (stepTitle) {
      stepTitle = stepTitle.replace(/\s*\(last modified:.*?\)/i, '').trim();
    }
    if (!stepTitle) {
      stepTitle = `Step ${sNo}`;
    }

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
    if (costBlock) {
      costEstimate = costBlock.querySelector('.total-nb strong')?.textContent?.trim() || null;
    }

    const tfBlock = document.querySelector('app-timeframe');
    let durationEstimate: string | null = null;
    if (tfBlock) {
      durationEstimate = tfBlock.textContent?.replace(/\s+/g, ' ').trim() || null;
    }

    const bodyText = document.body.textContent || '';
    const isOnline = bodyText.toLowerCase().includes('can be completed online') || 
                     bodyText.toLowerCase().includes('done online') || 
                     !!document.querySelector('.online-indicator, .is-online');

    return {
      stepTitle,
      description,
      instName,
      instPhone,
      instEmail,
      instWebsite,
      instAddress,
      reqDocs,
      costEstimate,
      durationEstimate,
      isOnline
    };
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

// ── Main Runner ────────────────────────────────────────────────
async function main() {
  console.log('🌍 Tanzania Trade Portal Scraper (Refined Selectors + HTML Progress)');
  console.log(`   ${PROCEDURES.length} procedures to scrape`);
  console.log(`   Concurrency: ${CONCURRENCY}, Headless: ${HEADLESS}`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('');

  // Load partial results for resume
  let completed: Procedure[] = [];
  const completedIds = new Set<number>();

  if (RESUME && fs.existsSync(PARTIAL_FILE)) {
    try {
      completed = JSON.parse(fs.readFileSync(PARTIAL_FILE, 'utf-8'));
      for (const p of completed) completedIds.add(p.source_id);
      console.log(`   ♻️  Resuming — ${completedIds.size} already scraped`);
      
      // Approximate starting time for correct elapsed count based on standard average
      startTime = Date.now() - (completed.length * 40 * 1000); 
    } catch { /* ignore corrupt partial */ }
  }

  const remaining = PROCEDURES.filter(p => !completedIds.has(p.id));
  console.log(`   ${remaining.length} remaining\n`);

  if (remaining.length === 0) {
    console.log('✅ All procedures already scraped!');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(completed, null, 2));
    writeProgressHtml(completed, PROCEDURES.length, []);
    return;
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  const results: Procedure[] = [...completed];

  // Write initial progress tracker
  writeProgressHtml(results, PROCEDURES.length, remaining.slice(0, CONCURRENCY));

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    console.log(`\n── Batch ${Math.floor(i / CONCURRENCY) + 1} (procedures ${i + 1}–${Math.min(i + CONCURRENCY, remaining.length)} of ${remaining.length}) ──`);

    const promises = batch.map(async (proc) => {
      const page = await context.newPage();
      try {
        return await scrapeProcedurePage(page, proc);
      } finally {
        await page.close();
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Save partial results after each batch
    fs.writeFileSync(PARTIAL_FILE, JSON.stringify(results, null, 2));
    console.log(`   💾 Saved ${results.length} procedures to partial file`);

    // Write HTML progress page
    const nextBatch = remaining.slice(i + CONCURRENCY, i + CONCURRENCY + CONCURRENCY);
    writeProgressHtml(results, PROCEDURES.length, nextBatch);

    // Polite delay between batches
    if (i + CONCURRENCY < remaining.length) {
      console.log(`   ⏱  Waiting ${DELAY_MS * 2}ms before next batch...`);
      await sleep(DELAY_MS * 2);
    }
  }

  await browser.close();

  // Write final output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n✅ Done! ${results.length} procedures saved to ${OUTPUT_FILE}`);
  writeProgressHtml(results, PROCEDURES.length, []);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
