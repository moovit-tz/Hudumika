/**
 * Hudumika Document Watermark & Footer Utility
 * Dynamically pulls superadmin branding settings (Hudumika logo, app name, and copyrights).
 */

export function getHudumikaLogoHtml(): string {
  let logoLight = '';
  let logoDark = '';
  if (typeof window !== 'undefined') {
    logoLight = localStorage.getItem('hudumika_brand_logo_light') || '';
    logoDark = localStorage.getItem('hudumika_brand_logo_dark') || '';
    const favicon = localStorage.getItem('hudumika_brand_favicon') || '';
    if (!logoLight && !logoDark && favicon) logoLight = favicon;
  }

  // A printed/exported document has no dark mode — it's paper (or a PDF
  // meant to look like paper), always on a light background. Emitting both
  // the light- and dark-background logo variants side by side (relying on
  // index.css's `.logo-light-only`/`.logo-dark-only` + `[data-theme]` rules
  // to hide one) only works inside the live app shell; a standalone
  // print/export document built by this module has neither index.css nor a
  // `data-theme` attribute, so both logos rendered unconditionally — the
  // literal "hudumika hudumika" double-logo bug. Always pick exactly one.
  const singleLogo = logoLight || logoDark;
  if (singleLogo) {
    return `<img src="${singleLogo}" alt="Hudumika" style="height: 24px; max-width: 155px; object-fit: contain; vertical-align: middle; display: inline-block; margin: 0 4px;" />`;
  }

  return `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#3088a8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; display: inline-block; margin: 0 4px;">
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>`;
}

export function getHudumikaFooterHtml(appName: string = 'ClearOS'): string {
  const logoHtml = getHudumikaLogoHtml();
  const year = new Date().getFullYear();

  return `
<div class="hudumika-doc-footer" style="margin-top: 36px; padding-top: 14px; border-top: 1.5px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-family: system-ui, -apple-system, sans-serif; font-size: 11px; color: #64748b;">
  <div style="display: flex; align-items: center; gap: 6px;">
    <span style="font-weight: 500;"><strong style="color: #0b1e3a; letter-spacing: 0.3px; font-weight: 800;">${appName}</strong> powered by ${logoHtml}</span>
  </div>
  <div style="font-size: 10.5px; color: #64748b; font-weight: 500;">
    Copyrights © ${year} by <strong style="color: #0b1e3a; font-weight: 700;">Hudumika LLC</strong>. All rights reserved.
  </div>
</div>
`;
}

export const HUDUMIKA_LOGO_SVG = getHudumikaLogoHtml();
export const HUDUMIKA_FOOTER_HTML = getHudumikaFooterHtml('ClearOS');

export const HUDUMIKA_WATERMARK_CSS = `
@media print {
  body { position: relative; }
  body::after {
    content: "CLEAROS POWERED BY HUDUMIKA • CUSTOMS & ENTERPRISE INTELLIGENCE";
    position: fixed;
    bottom: 16px;
    right: 24px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: #94a3b8;
    opacity: 0.5;
    pointer-events: none;
    z-index: 99999;
  }
}
`;

/**
 * Appends the standard Hudumika logo watermark and footer to any HTML document string before printing/exporting.
 */
export function injectHudumikaWatermark(html: string, appName: string = 'ClearOS'): string {
  const footer = getHudumikaFooterHtml(appName);
  if (html.includes('</body>')) {
    return html.replace('</body>', `${footer}</body>`);
  }
  return html + footer;
}
