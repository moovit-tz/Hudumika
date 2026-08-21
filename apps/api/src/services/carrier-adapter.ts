// Carrier booking/tracking adapter (M7 of the ClearOS roadmap) — same seam
// shape as seal-customs-adapter.ts's CustomsAdapter and onsite-ci.service.ts's
// CIProvider: one interface, one implementation per carrier, a ManualAdapter
// that always works, and a real-but-unwired stub for the one target that
// turned out to have a genuine live channel.
//
// Real target researched (2026-08-20), not assumed: Maersk operates a
// genuine, public, DCSA 2.0-standard developer API (developer.maersk.com)
// covering Ocean Booking, Track & Trace, Schedules, e-BL, VGM, and
// Demurrage & Detention, with OpenAPI specs and Postman collections —
// confirmed real via search plus a community-maintained API index
// (api-evangelist/maersk-line), unlike any EAC customs system checked in
// M3/M4. The one thing standing between this and a live pilot is that it
// requires real API credentials tied to an actual commercial relationship
// with Maersk, which this platform does not have and cannot self-serve —
// registering is a business decision for the platform's operator, not an
// engineering task. So: the interface and MaerskAdapter stub are built for
// real, ready to wire in credentials the moment they exist, but only
// ManualAdapter is actually connected today. Same "don't pretend
// integration exists" discipline as CustomsAdapter — MaerskAdapter fails
// loudly rather than silently no-opping.

export interface CarrierBookingConfirmation {
  carrierBookingRef: string;
  confirmedAt: string;
  note: string;
}

export interface CarrierTrackingEvent {
  eventType: string; // e.g. 'GATE_IN' | 'LOADED' | 'DEPARTED' | 'ARRIVED' | 'DISCHARGED' | 'GATE_OUT'
  location: string | null;
  occurredAt: string;
  raw: unknown;
}

export interface CarrierAdapter {
  carrierCode: string;   // SCAC or IATA
  carrierName: string;
  confirmBooking(input: { humanProvidedRef: string }): Promise<CarrierBookingConfirmation>;
  /** `null` — not `[]` — means this carrier has no electronic tracking channel wired up at all (ManualAdapter, always). `[]` would mean "asked the carrier, nothing yet." */
  trackShipment(carrierBookingRef: string): Promise<CarrierTrackingEvent[] | null>;
}

export class ManualCarrierAdapter implements CarrierAdapter {
  carrierCode: string;
  carrierName: string;

  constructor(carrierCode = '', carrierName = 'the carrier') {
    this.carrierCode = carrierCode;
    this.carrierName = carrierName;
  }

  async confirmBooking(input: { humanProvidedRef: string }): Promise<CarrierBookingConfirmation> {
    if (!input.humanProvidedRef?.trim()) {
      throw new Error(`A carrier booking reference is required — this adapter records what the officer confirmed with ${this.carrierName} directly, it does not book anything itself.`);
    }
    return {
      carrierBookingRef: input.humanProvidedRef.trim(),
      confirmedAt: new Date().toISOString(),
      note: `Recorded as manually confirmed with ${this.carrierName}. No live carrier booking API is connected in this platform.`,
    };
  }

  async trackShipment(): Promise<null> {
    return null;
  }
}

export class MaerskAdapter implements CarrierAdapter {
  carrierCode = 'MAEU';
  carrierName = 'Maersk';

  async confirmBooking(): Promise<never> {
    throw new Error('Maersk Ocean Booking API integration is not connected in this environment — no API credentials configured. Register at developer.maersk.com and wire real credentials in to enable this; until then, use the manual adapter.');
  }

  async trackShipment(): Promise<never> {
    throw new Error('Maersk Track & Trace API integration is not connected in this environment — no API credentials configured. Register at developer.maersk.com and wire real credentials in to enable this; until then, use the manual adapter.');
  }
}

/**
 * Every carrier resolves to the manual adapter today — no live carrier API
 * credentials exist in this platform for any carrier, including Maersk
 * (whose real API this file documents but does not call). `scacOrIata`
 * lets a future real adapter route by carrier without changing this
 * function's callers.
 */
export function getCarrierAdapter(scacOrIata: string | null | undefined, carrierName?: string | null): CarrierAdapter {
  return new ManualCarrierAdapter(scacOrIata ?? '', carrierName ?? 'the carrier');
}
