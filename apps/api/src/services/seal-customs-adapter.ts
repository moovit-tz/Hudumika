// Customs authority adapter (spec §7.2) — one interface, one implementation
// per authority. "Where no API exists, implement a ManualAdapter that
// produces the exact... artifact the authority requires, tracks the human
// submission, and accepts the reference number back. Do not pretend
// integration exists." No TANCIS API integration exists anywhere in this
// codebase (confirmed — ClearOS's own `declarations` table mirrors the
// TANESW/TANSAD *data shape* but has no outbound HTTP call to TRA either),
// so TancisAdapter stays a stub that fails loudly rather than silently
// no-opping, and ManualAdapter is the only one actually wired up.

export interface SubmissionReceipt {
  reference: string;
  submittedAt: string;
  note: string;
}

export interface CustomsAdapter {
  jurisdiction: string;
  authority: string;
  submitDeclaration(input: { entryId: string; humanProvidedReference: string }): Promise<SubmissionReceipt>;
}

export class ManualAdapter implements CustomsAdapter {
  jurisdiction = 'TZ';
  authority = 'TRA (Manual)';

  async submitDeclaration(input: { entryId: string; humanProvidedReference: string }): Promise<SubmissionReceipt> {
    if (!input.humanProvidedReference?.trim()) {
      throw new Error('A submission reference is required — this adapter records what a human submitted on the real TANCIS portal, it does not submit anything itself.');
    }
    return {
      reference: input.humanProvidedReference.trim(),
      submittedAt: new Date().toISOString(),
      note: 'Recorded as manually submitted. No live TANCIS integration exists in this platform — the declarant lodged this on the real TANCIS/TANESW portal and typed the reference number back in here.',
    };
  }
}

export class TancisAdapter implements CustomsAdapter {
  jurisdiction = 'TZ';
  authority = 'TRA TANCIS';

  async submitDeclaration(): Promise<never> {
    throw new Error('TANCIS API integration is not connected in this environment. Use the manual adapter instead.');
  }
}

export function getCustomsAdapter(_jurisdiction: string): CustomsAdapter {
  // Every jurisdiction currently resolves to the manual adapter — there is
  // no live authority integration to route to yet, for any jurisdiction.
  return new ManualAdapter();
}
