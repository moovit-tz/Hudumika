import type { PosSale } from '@hudumika/types';

export interface PosPrintSettings { paper: '58mm' | '80mm' | 'A4'; autoPrint: boolean; showCustomer: boolean; footer: string }
export const DEFAULT_POS_PRINT: PosPrintSettings = { paper: '80mm', autoPrint: false, showCustomer: true, footer: 'Thank you for your business.' };
export function posPrintKey(tenantId?: string, userId?: string) { return `hudumika:pos-print:${tenantId || 'workspace'}:${userId || 'user'}`; }
export function loadPosPrintSettings(key: string): PosPrintSettings {
  try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return { paper: ['58mm', '80mm', 'A4'].includes(value.paper) ? value.paper : '80mm', autoPrint: value.autoPrint === true, showCustomer: value.showCustomer !== false, footer: typeof value.footer === 'string' ? value.footer.slice(0, 200) : DEFAULT_POS_PRINT.footer }; } catch { return { ...DEFAULT_POS_PRINT }; }
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));

export function printPosReceipt(sale: PosSale, settings: PosPrintSettings, businessName: string) {
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: sale.currency }).format(Number(value));
  const frame = document.createElement('iframe');
  frame.title = 'Receipt print preview';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;bottom:0;left:0';
  const width = settings.paper === 'A4' ? '190mm' : settings.paper === '58mm' ? '50mm' : '72mm';
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font') || 'system-ui, sans-serif';
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(sale.sale_number)}</title><style>@page{size:${settings.paper === 'A4' ? 'A4' : settings.paper + ' auto'};margin:4mm}body{font-family:${font.replace(/[<>]/g, '')};font-size:11px;color:#111;background:#fff;width:${width};max-width:100%;margin:0 auto}h1{font-size:16px}header,footer{text-align:center}.line{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #ddd}.line>span:first-child{overflow-wrap:anywhere}small{display:block;font-size:10px;margin-top:3px}.total{font-weight:700;font-size:14px;margin-top:8px}footer{padding-top:16px;white-space:pre-wrap}</style></head><body><header><h1>${escape(businessName)}</h1><strong>${escape(sale.sale_number)}</strong><p>${escape(new Date(sale.sold_at).toLocaleString())}</p>${settings.showCustomer ? `<p>${escape(sale.customer_name || 'Walk-in customer')}</p>` : ''}</header>${sale.lines?.map(line => `<div class="line"><span>${escape(line.product_name)}<small>${line.qty} × ${escape(money(line.unit_price))}</small></span><strong>${escape(money(line.line_total))}</strong></div>`).join('') || ''}<div class="line"><span>Subtotal</span><span>${escape(money(sale.subtotal))}</span></div><div class="line"><span>Discount</span><span>${escape(money(sale.discount_total))}</span></div><div class="line"><span>Tax</span><span>${escape(money(sale.tax_total))}</span></div><div class="line total"><span>Total</span><strong>${escape(money(sale.grand_total))}</strong></div>${sale.payments?.map(payment => `<div class="line"><span>${escape(payment.method.replace(/_/g, ' '))}</span><span>${escape(money(payment.amount))}</span></div>`).join('') || ''}${sale.change_due > 0 ? `<div class="line"><span>Change</span><span>${escape(money(sale.change_due))}</span></div>` : ''}<footer>${escape(settings.footer)}</footer></body></html>`;
  frame.onload = () => { const win = frame.contentWindow; if (!win) { frame.remove(); return; } win.addEventListener('afterprint', () => frame.remove(), { once: true }); win.focus(); win.print(); };
  document.body.appendChild(frame);
}
