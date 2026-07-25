import { chromium } from 'playwright';

function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim() || null;
}

async function main() {
  console.log('Running test extraction...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const url = 'https://trade.tanzania.go.tz/procedure/904?l=en';
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await new Promise(r => setTimeout(r, 6000));

    // Page level info
    const procedureData = await page.evaluate(() => {
      const breadcrumbs = [...document.querySelectorAll('ol.breadcrumbs li')].map(li => li.textContent?.trim());
      const name = breadcrumbs[0] || 'Unknown';
      
      const contextEl = document.querySelector('.context-msg');
      const summary = contextEl ? contextEl.textContent?.trim() : null;

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

      return { name, summary, stepLinks };
    });

    console.log('Procedure Name:', procedureData.name);
    console.log('Summary length:', procedureData.summary?.length);
    console.log('Found steps count:', procedureData.stepLinks.length);

    if (procedureData.stepLinks.length > 0) {
      const testStepUrl = procedureData.stepLinks[0].url;
      console.log('Testing step extraction on:', testStepUrl);
      await page.goto(testStepUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await new Promise(r => setTimeout(r, 6000));

      const stepData = await page.evaluate(() => {
        const h2Instep = document.querySelector('h2.instep');
        const stepName = h2Instep ? h2Instep.lastElementChild?.textContent?.trim() : 'Unknown';

        // Entity / Institution details
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
          
          // Address is typically in the value unicode-bidi container
          const valueBlock = entityBlock.querySelector('.value.unicode-bidi');
          if (valueBlock) {
            instAddress = valueBlock.firstChild?.textContent?.trim() || null;
          }

          // Phone
          const phones = [...entityBlock.querySelectorAll('.phone')].map(el => el.textContent?.trim());
          instPhone = phones.filter(Boolean).join(', ') || null;

          // Email
          const emails = [...entityBlock.querySelectorAll('a[href^="mailto:"]')].map(el => el.getAttribute('href')?.replace('mailto:', '')?.trim());
          instEmail = emails.filter(Boolean).join(', ') || null;

          // Website
          const webs = [...entityBlock.querySelectorAll('a[href^="http"]:not([href*="maps.google"])')].map(el => el.getAttribute('href')?.trim());
          instWebsite = webs.filter(Boolean).join(', ') || null;
        }

        // Required documents
        const reqDocs: string[] = [];
        document.querySelectorAll('app-documents-list .thumbTitle').forEach(el => {
          const t = el.textContent?.replace(/\s+/g, ' ').trim();
          if (t) reqDocs.push(t);
        });

        // Costs
        const costBlock = document.querySelector('app-costs-list');
        let costEstimate: string | null = null;
        if (costBlock) {
          const totalVal = costBlock.querySelector('.total-nb strong')?.textContent?.trim();
          costEstimate = totalVal || null;
        }

        // Timeframe
        const tfBlock = document.querySelector('app-timeframe');
        let durationEstimate: string | null = null;
        if (tfBlock) {
          durationEstimate = tfBlock.textContent?.replace(/\s+/g, ' ').trim() || null;
        }

        // Online indicator
        const bodyText = document.body.textContent || '';
        const isOnline = bodyText.toLowerCase().includes('can be completed online') || 
                         bodyText.toLowerCase().includes('done online') || 
                         !!document.querySelector('.online-indicator, .is-online');

        return {
          stepName,
          institution: {
            name: instName,
            address: instAddress,
            phone: instPhone,
            email: instEmail,
            website: instWebsite
          },
          required_documents: reqDocs,
          cost_estimate: costEstimate,
          duration_estimate: durationEstimate,
          is_online: isOnline
        };
      });

      console.log('Extracted Step Details:', JSON.stringify(stepData, null, 2));
    }

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await browser.close();
  }
}

main();
