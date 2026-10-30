export function escapePrintData<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)) as T;
  if (Array.isArray(value)) return value.map(escapePrintData) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,escapePrintData(v)])) as T;
  return value;
}
export function safePrintImage(value: string): string {
  try { const url = new URL(value, window.location.origin); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
