/**
 * ComplyOS — Government Agency Integration Adapters
 *
 * Architecture: Adapter pattern per agency.
 * - Agencies with real API programs (TRA eTax) get HTTP-ready adapters.
 * - Agencies with portal-only access are marked `apiReady: false`.
 * - Each adapter has syncCertificates(), getApplicationStatus(), submitApplication().
 * - When a real API key/endpoint is added to env, the adapter switches to live mode.
 */

export interface AgencyCert {
  external_ref:  string;
  cert_number:   string;
  name:          string;
  status:        'active' | 'expiring' | 'expired';
  issued_date:   string | null;
  expiry_date:   string | null;
}

export interface AgencyAppStatus {
  external_ref: string;
  status:       'submitted' | 'review' | 'issued' | 'rejected' | 'pending';
  message:      string;
  updated_at:   string;
}

/** Which of the four submission channels the PRD describes this agency uses today. */
export type AgencyChannel = 'api' | 'portal' | 'manual' | 'legal_firm';

export interface AgencyAdapter {
  code:       string;
  name:       string;
  apiReady:   boolean;
  /** Best-available submission channel for this agency right now. */
  channel:    AgencyChannel;
  syncCertificates:     (tin: string) => Promise<AgencyCert[]>;
  getApplicationStatus: (appRef: string) => Promise<AgencyAppStatus>;
  submitApplication:    (payload: Record<string, unknown>) => Promise<{ external_ref: string }>;
}

// ── BRELA ─────────────────────────────────────────────────────────────────────
// BRELA's online portal does not yet expose a public API. Integration requires
// BRELA-certified partner credentials. Status: portal-only.
class BRELAAdapter implements AgencyAdapter {
  code = 'BRELA';
  name = 'Business Registration & Licensing Agency';
  apiReady = false;
  channel: AgencyChannel = 'portal';

  async syncCertificates(tin: string): Promise<AgencyCert[]> {
    // Future: GET https://brela.go.tz/api/v1/certificates?tin=<tin>
    console.log(`[BRELA] Manual sync only — TIN ${tin}`);
    return [];
  }

  async getApplicationStatus(appRef: string): Promise<AgencyAppStatus> {
    return { external_ref: appRef, status: 'review', message: 'Status check not yet automated — check BRELA portal', updated_at: new Date().toISOString() };
  }

  async submitApplication(payload: Record<string, unknown>): Promise<{ external_ref: string }> {
    console.log('[BRELA] Submission queued for manual portal submission:', payload);
    return { external_ref: `BRELA-MANUAL-${Date.now()}` };
  }
}

// ── TRA ──────────────────────────────────────────────────────────────────────
// TRA eTax portal has a partner API program. Needs client_id + client_secret.
// Set env TRA_API_KEY and TRA_API_URL to switch to live mode.
class TRAAdapter implements AgencyAdapter {
  code = 'TRA';
  name = 'Tanzania Revenue Authority';
  apiReady = !!(process.env['TRA_API_KEY'] && process.env['TRA_API_URL']);
  get channel(): AgencyChannel { return this.apiReady ? 'api' : 'portal'; }

  private readonly baseUrl = process.env['TRA_API_URL'] ?? 'https://etax.tra.go.tz/api/v1';
  private readonly apiKey  = process.env['TRA_API_KEY'] ?? '';

  async syncCertificates(tin: string): Promise<AgencyCert[]> {
    if (!this.apiReady) return [];
    const res = await fetch(`${this.baseUrl}/taxpayer/${tin}/certificates`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`TRA sync failed: ${res.status}`);
    const data = await res.json() as { certs: AgencyCert[] };
    return data.certs ?? [];
  }

  async getApplicationStatus(appRef: string): Promise<AgencyAppStatus> {
    if (!this.apiReady) return { external_ref: appRef, status: 'review', message: 'TRA API not configured', updated_at: new Date().toISOString() };
    const res = await fetch(`${this.baseUrl}/applications/${appRef}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`TRA status check failed: ${res.status}`);
    return res.json() as Promise<AgencyAppStatus>;
  }

  async submitApplication(payload: Record<string, unknown>): Promise<{ external_ref: string }> {
    if (!this.apiReady) return { external_ref: `TRA-MANUAL-${Date.now()}` };
    const res = await fetch(`${this.baseUrl}/applications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`TRA submission failed: ${res.status}`);
    const data = await res.json() as { reference: string };
    return { external_ref: data.reference };
  }
}

// ── NSSF ─────────────────────────────────────────────────────────────────────
class NSSFAdapter implements AgencyAdapter {
  code = 'NSSF';
  name = 'National Social Security Fund';
  apiReady = false;
  channel: AgencyChannel = 'portal';

  async syncCertificates(_tin: string): Promise<AgencyCert[]> { return []; }

  async getApplicationStatus(appRef: string): Promise<AgencyAppStatus> {
    return { external_ref: appRef, status: 'review', message: 'NSSF portal check required', updated_at: new Date().toISOString() };
  }

  async submitApplication(payload: Record<string, unknown>): Promise<{ external_ref: string }> {
    console.log('[NSSF] Manual submission:', payload);
    return { external_ref: `NSSF-MANUAL-${Date.now()}` };
  }
}

// ── WCF ──────────────────────────────────────────────────────────────────────
class WCFAdapter implements AgencyAdapter {
  code = 'WCF';
  name = 'Workers Compensation Fund';
  apiReady = false;
  channel: AgencyChannel = 'manual';

  async syncCertificates(_tin: string): Promise<AgencyCert[]> { return []; }
  async getApplicationStatus(appRef: string): Promise<AgencyAppStatus> {
    return { external_ref: appRef, status: 'pending', message: 'WCF walk-in required', updated_at: new Date().toISOString() };
  }
  async submitApplication(payload: Record<string, unknown>): Promise<{ external_ref: string }> {
    console.log('[WCF] Manual submission:', payload);
    return { external_ref: `WCF-MANUAL-${Date.now()}` };
  }
}

// ── Generic (NHIF, OSHA, TBS, TFDA, CMSA, BOT, NEMC) ─────────────────────────
// BOT/CBK/CMA-class agencies default to 'legal_firm' — per the PRD's Section 5
// sequencing these route through the Legal Marketplace rather than a direct
// integration at this stage (highest complexity, lowest client volume).
function makeGenericAdapter(code: string, name: string, channel: AgencyChannel = 'manual'): AgencyAdapter {
  return {
    code, name, apiReady: false, channel,
    async syncCertificates(_tin: string) { return []; },
    async getApplicationStatus(appRef: string) {
      return { external_ref: appRef, status: 'review' as const, message: `${code} API integration pending`, updated_at: new Date().toISOString() };
    },
    async submitApplication(_payload: Record<string, unknown>) {
      return { external_ref: `${code}-MANUAL-${Date.now()}` };
    },
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────
export const AGENCY_ADAPTERS: Record<string, AgencyAdapter> = {
  BRELA: new BRELAAdapter(),
  TRA:   new TRAAdapter(),
  NSSF:  new NSSFAdapter(),
  WCF:   new WCFAdapter(),
  NHIF:  makeGenericAdapter('NHIF',  'National Health Insurance Fund', 'portal'),
  OSHA:  makeGenericAdapter('OSHA',  'Occupational Safety & Health Authority', 'manual'),
  TBS:   makeGenericAdapter('TBS',   'Tanzania Bureau of Standards', 'portal'),
  TFDA:  makeGenericAdapter('TFDA',  'Tanzania Food & Drugs Authority', 'portal'),
  CMSA:  makeGenericAdapter('CMSA',  'Capital Markets & Securities Authority', 'legal_firm'),
  BOT:   makeGenericAdapter('BOT',   'Bank of Tanzania', 'legal_firm'),
  NEMC:  makeGenericAdapter('NEMC',  'National Environment Management Council', 'manual'),
  // Business Licensing Act licences — issued by City/Municipal/District
  // Councils (Ministry of Trade business-licensing division), not BRELA
  // (company registration). No public API; walk-in/portal submission only.
  LGA:   makeGenericAdapter('LGA',   'Local Government Authority (Business Licensing)', 'manual'),
};

export function getAdapter(agencyCode: string): AgencyAdapter | null {
  return AGENCY_ADAPTERS[agencyCode.toUpperCase()] ?? null;
}

export function getApiReadyAgencies(): string[] {
  return Object.values(AGENCY_ADAPTERS).filter(a => a.apiReady).map(a => a.code);
}
