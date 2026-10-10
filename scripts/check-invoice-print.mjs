import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const browser = await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:1000,height:900}});
 await context.addInitScript(()=>{window.print=()=>{window.__invoicePrintRequested=true;};});
 const page=await context.newPage();
 await page.goto('http://localhost:5173/login');
 await page.addStyleTag({content:await readFile('apps/web/src/pages/FinancePos.css','utf8')});
 await page.evaluate(()=>{
  const invoice=document.createElement('section');invoice.dataset.invoiceDocument='PRINT-REGRESSION';
  invoice.style.setProperty('--muted-foreground','0 0% 100%');
  invoice.style.setProperty('--font','Arial, sans-serif');invoice.style.setProperty('--teal','#1257c6');
  invoice.innerHTML='<h1>Invoice PRINT-REGRESSION</h1><p>Browser regression fixture</p><table><tr><th>Item</th><th>Amount</th></tr><tr><td>Consulting services</td><td>USD 1,240.00</td></tr></table><p>Amount due USD 1,240.00</p>';
  document.body.appendChild(invoice);
 });
 const popupEvent=page.waitForEvent('popup');
 await page.evaluate(async()=>{const {openPrintWindow}=await import('/src/pages/billing/shared.tsx');openPrintWindow({id:'PRINT-REGRESSION'});});
 const popup=await popupEvent;await popup.waitForLoadState('load');
 await popup.waitForFunction(()=>window.__invoicePrintRequested===true);
 await popup.emulateMedia({media:'print'});
 const visible=await popup.locator('[data-invoice-document]').evaluate(node=>[node,...node.querySelectorAll('*')].every(el=>getComputedStyle(el).visibility==='visible'));
 assert.equal(visible,true,'Invoice content must remain visible with POS styles loaded');
 assert.equal(await popup.locator('body').evaluate(el=>getComputedStyle(el).getPropertyValue('--teal').trim()),'#1257c6');
 assert.equal(await popup.locator('body').evaluate(el=>getComputedStyle(el).getPropertyValue('--muted-foreground').trim()),'212 10% 38%');
 const bytes=await popup.pdf({preferCSSPageSize:true,printBackground:true});
 const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 const first=await pdf.getPage(1);const text=(await first.getTextContent()).items.map(item=>item.str).join(' ');
 assert.match(text,/Consulting services/);assert.match(text,/1,240.00/);
 assert.ok(Math.abs(first.view[2]-595.28)<2,'Invoice must use A4 width, not thermal receipt width');
 await pdf.destroy();
 await popup.screenshot({path:'docs/finance/invoice-print-regression.png',fullPage:true});
 // Receipt printing still hides other app content and exposes receipt text.
 await page.evaluate(()=>{const receipt=document.createElement('div');receipt.className='pos-receipt';receipt.innerHTML='<p>Receipt fixture</p>';document.body.appendChild(receipt);});
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('.pos-receipt p').evaluate(el=>getComputedStyle(el).visibility),'visible');
 assert.equal(await page.locator('[data-invoice-document] h1').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 console.log('Invoice print regression passed: populated A4 PDF, design tokens and POS receipt isolation.');
} finally {await browser.close();}
