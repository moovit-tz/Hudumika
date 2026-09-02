/**
 * Device Management's provider abstraction — the one architectural decision
 * this module exists to make real. Nothing outside this folder talks to a
 * specific vendor's wire protocol; device-ingest.routes.ts and
 * attendance-devices.routes.ts only ever see a RawPunch[] and a
 * HandshakeReply, so adding Suprema or Hikvision later is one new adapter
 * file + one registry entry (below), not a rewrite of the ingestion or
 * reconciliation pipeline.
 */

/** One punch as a device actually reports it — before enrollment lookup,
 *  before pairing into a session. */
export interface RawPunch {
  /** The device's own local user ID (set when a fingerprint/face/card is
   *  enrolled on the unit itself) — not our internal user UUID. */
  externalPin: string;
  punchedAt: Date;
  /** The device's own status code, if it sends one (0/1/2/3 for
   *  check-in/out/break-out/break-in on most ZKT firmware) — kept as a raw
   *  string since it varies by vendor and firmware, and pairing logic falls
   *  back to odd/even alternation when it's absent or unreliable. */
  rawStatus: string | null;
}

export interface DeviceProviderAdapter {
  code: string;
  /** Reply to the device's own periodic handshake/config-request call. */
  handshakeReply(): string;
  /** Reply to a "any commands queued for me?" poll — no remote-command queue
   *  exists yet (explicitly deferred), so every provider just says "none". */
  emptyCommandReply(): string;
  /** Parse one batch of punches from the device's raw push body. */
  parsePunchBatch(body: string): RawPunch[];
  /** What to reply so the device marks this batch delivered and doesn't
   *  resend it on its next push cycle. */
  ackReply(): string;
}
