// `opentimestamps` is a CommonJS package whose named properties
// (DetachedTimestampFile, Ops, stamp, verify, ...) are attached to
// module.exports dynamically at runtime, not via static `exports.x = ...`
// assignments — Node's ESM/CJS interop (cjs-module-lexer) can't see those,
// so only the default export (the whole module.exports object) is
// reliably importable here, even though TypeScript's own .d.ts happily
// type-checks named imports. `stamp`/`verify` also internally call
// `this.makeMerkleTree`/`this.upgradeTimestamp` etc., so they must be
// invoked as OpenTimestamps.stamp(...)/OpenTimestamps.verify(...) — a
// destructured reference loses that `this` binding and fails at runtime
// even though it type-checks fine.
import OpenTimestamps from 'opentimestamps';
const { DetachedTimestampFile, Ops } = OpenTimestamps;

// Thin wrapper over the `opentimestamps` npm client (the real, non-
// deprecated package — `javascript-opentimestamps` was renamed to plain
// `opentimestamps` as of 0.4.6). Confirmed working live against the real
// public calendar servers and a real Bitcoin-confirmed historical proof
// before this wrapper was written (see this session's verification pass).
//
// A calendar server attests a hash instantly, but that attestation only
// becomes independently Bitcoin-verifiable once the calendar's own batch
// is actually mined into a block — typically hours later. This module
// must never synthesize or assume that confirmation; `checkConfirmation`
// only ever reports what the OpenTimestamps library itself found.

export interface OtsBitcoinConfirmation {
  blockHeight: number;
  blockTime: Date;
}

/** Submits a sha256 hash to the public OpenTimestamps calendar servers and
 *  returns the serialized proof (an .ots file) — calendar-attested only,
 *  not yet Bitcoin-confirmed. */
export async function stampHash(hashHex: string): Promise<Buffer> {
  const hashBytes = Buffer.from(hashHex, 'hex');
  const detached = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), hashBytes);
  await OpenTimestamps.stamp(detached);
  return Buffer.from(detached.serializeToBytes());
}

/** Re-checks an existing proof against the original hash. Internally
 *  upgrades the proof (advances calendar attestations toward a full
 *  Bitcoin Merkle path) and verifies it. Returns `bitcoin: null` if the
 *  underlying calendar batch hasn't been mined yet — this is the expected,
 *  correct state for a proof less than a few hours old, not an error. */
export async function checkConfirmation(proofBuffer: Buffer, hashHex: string): Promise<{ proofBuffer: Buffer; bitcoin: OtsBitcoinConfirmation | null }> {
  const detachedProof = DetachedTimestampFile.deserialize(proofBuffer);
  const hashBytes = Buffer.from(hashHex, 'hex');
  const detachedOriginal = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), hashBytes);

  const result = await OpenTimestamps.verify(detachedProof, detachedOriginal, { ignoreBitcoinNode: true, timeout: 10000 });

  const bitcoin = result?.bitcoin
    ? { blockHeight: result.bitcoin.height, blockTime: new Date(result.bitcoin.timestamp * 1000) }
    : null;

  return { proofBuffer: Buffer.from(detachedProof.serializeToBytes()), bitcoin };
}
