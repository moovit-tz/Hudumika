// Customs authority adapter (spec §7.2) — one interface, one implementation
// per authority. "Where no API exists, implement a ManualAdapter that
// produces the exact... artifact the authority requires, tracks the human
// submission, and accepts the reference number back. Do not pretend
// integration exists." No TANCIS API integration exists anywhere in this
// codebase (confirmed — ClearOS's own `declarations` table mirrors the
// TANESW/TANSAD *data shape* but has no outbound HTTP call to TRA either),
// so TancisAdapter stays a stub that fails loudly rather than silently
// no-opping, and ManualAdapter is the only one actually wired up.
//
// M3 investigation (2026-08-20): before writing a real TanEswAdapter, this
// was actively checked, not assumed. Findings, evidence-first:
//   - TRA DOES publish a real, documented public API — but only for VFD/
//     e-invoicing (efdmsRctApi at vfd.tra.go.tz, docs at
//     tra-docs.netlify.app), which this codebase already integrates against
//     in tra.service.ts. That confirms TRA is technically capable of, and
//     willing to, publish an integrator API — it just hasn't for customs.
//   - tra-docs.netlify.app documents nothing else: no TANCIS, no TANESW, no
//     declaration-submission or broker-integration API of any kind.
//   - Every independent description of TANCIS/NTANCIS/TANESW found (TRA's
//     own licensing page, import-procedure page, international freight
//     forwarders' own guidance, a peer-reviewed paper measuring TANESW's
//     "technical reliability" from the *user's* side) describes it
//     uniformly as a web portal a licensed clearing agent logs into and
//     submits documents through — never as something a filer's own
//     software connects to. TRA's own licensing requirement is phrased as
//     "computing facilities capable of connecting to TANCIS," i.e. a
//     browser and a network connection, not API credentials.
//   - No certified-integrator / solution-provider / third-party-software
//     program was found for TANCIS/TANESW anywhere, in contrast to how
//     e.g. US CBP's ACE or the EU's customs systems document one.
// Conclusion: for Tanzania, TANESW is portal-only today. This is the
// plan's own anticipated legitimate outcome, not a failure to research —
// ManualAdapter stays the permanent, honest answer for TZ unless TRA opens
// a real integrator channel later. Revisit this comment (not just the
// code) if that ever changes, since the finding lives here.
//
// M4 investigation (2026-08-20): Kenya (KRA iCMS), Uganda (URA/ASYCUDA
// World) and Rwanda (RRA/ASYCUDA) checked the same way, not assumed to
// differ just because the underlying software differs from TANESW's.
//   - Kenya: KRA runs a real, actively-growing developer API platform
//     (GavaConnect — 16 APIs live, 1000+ registered developers as of the
//     2025 masterclass), proving KRA both can and will publish integrator
//     APIs. Its current APIs are tax-domain only (PIN/TCC checkers, NIL
//     returns, e-Slip) — no customs/iCMS declaration API is among them or
//     on its announced roadmap (which extends to eTIMS/VAT next, not
//     customs). iCMS itself is described as connected to "23 external
//     systems," but every one identifiable is an institutional/government
//     integration (banks, port authority, regional ASYCUDA interop) — not
//     a general-purpose channel a third-party clearing-agent platform can
//     register for.
//   - Uganda & Rwanda: both run UNCTAD's ASYCUDA (World/++). The
//     *platform* genuinely supports EDI/XML data exchange — UNCTAD's own
//     site states ASYCUDAWorld is "fully compatible with all forms of data
//     exchange with any external software," and third-party interfacing
//     products exist. But "Direct Trader Input (DTI)" in both countries'
//     actual live descriptions turns out to mean decentralized data-entry
//     terminals ("DTI Centres") using ASYCUDA's own web client — not
//     external third-party software submitting via API. Every real-world
//     account found ("the agent logs into ASYCUDA World, captures the
//     declaration...") describes the same browser/portal pattern as
//     Kenya and Tanzania, for both countries.
// Conclusion: no live submission channel exists for any of KE/UG/RW either,
// for the class of integration Hudumika needs. The one architectural
// difference from TZ worth fixing regardless of live-integration status:
// ManualAdapter was hardcoded to TZ/TRA — a KE/UG/RW jurisdiction would
// have silently gotten back an adapter mislabeled "TRA (Manual)". Fixed
// below with a real per-jurisdiction authority map, so the multi-country
// declaration UI (if/when built) shows the correct authority name even
// though every jurisdiction is manual-only today.

export interface SubmissionReceipt {
  reference: string;
  submittedAt: string;
  note: string;
}

/** Mirrors onsite-ci.service.ts's CIProvider trigger+poll shape — a notice
 *  an authority pushed or that was fetched back for one declaration. */
export interface CustomsNotice {
  noticeType: 'SELECTIVITY' | 'ASSESSMENT' | 'QUERY' | 'RELEASE' | 'PAYMENT';
  noticeNumber: string;
  noticeDate: string;
  selectivityChannel?: 'GREEN' | 'YELLOW' | 'RED';
  totalTaxAmount?: number;
  queryText?: string;
  raw: unknown;
}

export interface CustomsAdapter {
  jurisdiction: string;
  authority: string;
  submitDeclaration(input: { entryId: string; humanProvidedReference: string }): Promise<SubmissionReceipt>;
  /**
   * Fetch any notices the authority has issued for this declaration since it
   * was submitted. Returns `null` — not an empty array — when this
   * jurisdiction has no electronic channel to fetch from at all (ManualAdapter,
   * always): `null` means "check the portal yourself," `[]` means "asked the
   * authority, nothing new yet." Collapsing those two would silently claim a
   * live connection that was never made.
   */
  fetchNotices(entryId: string): Promise<CustomsNotice[] | null>;
}

// One real, named portal per jurisdiction the "recorded manually" note can
// honestly point to — see this file's header for why none of these has a
// live submission channel today.
const JURISDICTION_PORTALS: Record<string, { authority: string; portal: string }> = {
  TZ: { authority: 'TRA (Manual)', portal: 'TANCIS/TANESW' },
  KE: { authority: 'KRA (Manual)', portal: 'iCMS' },
  UG: { authority: 'URA (Manual)', portal: 'ASYCUDA World' },
  RW: { authority: 'RRA (Manual)', portal: 'ASYCUDA' },
};

export class ManualAdapter implements CustomsAdapter {
  jurisdiction: string;
  authority: string;
  private portal: string;

  constructor(jurisdiction = 'TZ') {
    const known = JURISDICTION_PORTALS[jurisdiction] ?? JURISDICTION_PORTALS.TZ;
    this.jurisdiction = jurisdiction in JURISDICTION_PORTALS ? jurisdiction : 'TZ';
    this.authority = known.authority;
    this.portal = known.portal;
  }

  async submitDeclaration(input: { entryId: string; humanProvidedReference: string }): Promise<SubmissionReceipt> {
    if (!input.humanProvidedReference?.trim()) {
      throw new Error(`A submission reference is required — this adapter records what a human submitted on the real ${this.portal} portal, it does not submit anything itself.`);
    }
    return {
      reference: input.humanProvidedReference.trim(),
      submittedAt: new Date().toISOString(),
      note: `Recorded as manually submitted. No live ${this.portal} integration exists in this platform — the declarant lodged this on the real ${this.portal} portal and typed the reference number back in here.`,
    };
  }

  async fetchNotices(): Promise<null> {
    // See this file's header: no jurisdiction handled here has a documented
    // electronic channel to fetch notices from. A human reads the real
    // portal and records the result (declaration_notices) the same way the
    // submission reference itself is recorded — that path already exists
    // and is unaffected by this method returning null.
    return null;
  }
}

export class TancisAdapter implements CustomsAdapter {
  jurisdiction = 'TZ';
  authority = 'TRA TANCIS';

  async submitDeclaration(): Promise<never> {
    throw new Error('TANCIS API integration is not connected in this environment. Use the manual adapter instead.');
  }

  async fetchNotices(): Promise<never> {
    throw new Error('TANCIS API integration is not connected in this environment. Use the manual adapter instead.');
  }
}

export function getCustomsAdapter(jurisdiction: string): CustomsAdapter {
  // Every jurisdiction currently resolves to a manual adapter — there is no
  // live authority integration to route to yet, for TZ, KE, UG or RW (see
  // this file's header for the M3/M4 investigations). The adapter is at
  // least correctly labeled for whichever jurisdiction was actually asked
  // for, rather than always claiming to be TRA.
  return new ManualAdapter(jurisdiction);
}
