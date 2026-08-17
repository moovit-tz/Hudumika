interface EnvelopeTenant {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

/**
 * One consistent branded wrapper for every outbound email, replacing the
 * copy-pasted-with-drift `<div style="font-family: Arial...">` wrapper every
 * call site used to reinvent for itself. Inline styles only — most email
 * clients strip `<style>` tags, so this can't use CSS variables the way the
 * rest of the platform does; the tenant's `primary_color` is read directly
 * instead.
 */
export function wrapEmailHtml(tenant: EnvelopeTenant, innerHtml: string, signatureHtml?: string | null): string {
  const accent = tenant.primary_color || '#0d7a6b';
  const brandMark = tenant.logo_url
    ? `<img src="${tenant.logo_url}" alt="${tenant.name}" style="max-height:40px;" />`
    : `<span style="font-size:18px;font-weight:700;color:${accent};">${tenant.name}</span>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="padding:20px 0;border-bottom:3px solid ${accent};">${brandMark}</div>
      <div style="padding:24px 0;font-size:14px;line-height:1.6;">${innerHtml}</div>
      ${signatureHtml ? `<div style="padding:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">${signatureHtml}</div>` : ''}
      <div style="padding:16px 0;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
        <p style="margin:0;">${tenant.name} · Sent via Hudumika</p>
      </div>
    </div>
  `;
}
