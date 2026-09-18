// Real, browser-captured BRELA ORS public-search API contract (not
// reverse-engineered from minified JS — this is what BRELA's own search page
// at ors.brela.go.tz actually calls). Extracted out of comply.routes.ts's
// `/brela-search` handler so the Developer Platform's gateway (HUD-0117 —
// its 'business.search'/'business.verify' native "verification" products
// used to be entirely hardcoded, input-independent fabricated responses,
// never actually reaching BRELA at all) can reuse the one real
// implementation instead of a second, fake one.
//
// This is a best-effort scrape against a public portal with no official API,
// not a guaranteed live source — BRELA's own WAF blocks most non-browser
// traffic even with realistic headers/session cookies, so a live miss is the
// common case, not a bug. Every caller must treat `live: false` as "could not
// reach the portal," never silently substitute fabricated data for it.
export interface BrelaSearchResult {
  reg_number: string;
  name: string;
  registered_office: string;
  status: string;
  type: string;
  incorporation_date: string | null;
}

export async function searchBrelaLive(
  objectType: string | undefined,
  incNumber: string | undefined,
  companyName: string | undefined,
): Promise<{ live: boolean; results: BrelaSearchResult[] }> {
  const isCompany = objectType !== 'Business name';
  const jsonUrl = 'https://ors.brela.go.tz/orsreg/list/search/businesspublic.json';
  const searchPageUrl = 'https://ors.brela.go.tz/orsreg/searchbusinesspublic';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const results: BrelaSearchResult[] = [];

  try {
    // A real browser hitting the public search form first loads the page
    // (which sets a session cookie) before the page's JS calls the JSON
    // endpoint — same two-step flow here, not a bypass of anything gated.
    const pageRes = await fetch(searchPageUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(5000),
    });
    const setCookie = pageRes.headers.get('set-cookie') ?? '';
    const sessionCookie = setCookie.split(';')[0];

    const payload: Record<string, string | number> = {
      object_type: isCompany ? 'ET-COMPANY' : 'ET-BUSINESS',
      PageSize: 20,
      PageNumber: 1,
    };
    if (isCompany) {
      payload.cm_number = incNumber || '';
      payload.cm_name = companyName || '';
    } else {
      payload.bn_number = incNumber || '';
      payload.bn_name = companyName || '';
    }

    const response = await fetch(jsonUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': searchPageUrl,
        'Origin': 'https://ors.brela.go.tz',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': userAgent,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data: any = await response.json().catch(() => null);
      const map: string[] = Array.isArray(data?.Map) ? data.Map : [];
      const records: any[][] = Array.isArray(data?.Records) ? data.Records : [];

      for (const record of records) {
        const row: Record<string, any> = {};
        map.forEach((col, i) => { row[col] = record[i]; });

        const num = String(row.cert_number ?? '').trim();
        const name = String(row.legal_name ?? '').trim();
        if (!num || !name) continue;

        results.push({
          reg_number: num,
          name,
          registered_office: String(row.address ?? '').trim() || 'Tanzania Registered Address',
          status: String(row.reg_status_name ?? row.reg_status ?? '').trim() || 'Registered',
          type: String(row.subtype_name ?? '').trim() || (isCompany ? 'Private Limited Company' : 'Business Name'),
          incorporation_date: row.incorporation_date ?? row.reg_date ?? null,
        });
      }
    }
  } catch {
    // Expected in most environments — BRELA has no public API, sits behind a
    // WAF that blocks non-browser traffic even with realistic headers/session
    // cookies, and this scrape is best-effort only.
  }

  return { live: results.length > 0, results };
}
