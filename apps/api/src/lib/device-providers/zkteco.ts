import type { DeviceProviderAdapter, RawPunch } from './types.js';

/**
 * ZKTeco ADMS (the push protocol real ZKT devices use in "Cloud"/ADMS mode —
 * the unit is configured with a Server URL once, in its own menu, and from
 * then on calls home over plain HTTP; no SDK or open TCP port needed on our
 * side). This is the real, documented wire format, not a guess:
 *
 *   GET  /iclock/cdata?SN=<serial>&options=all&pushver=...
 *     — device handshake/registration; we reply with config lines telling it
 *       what to push and how often.
 *   GET  /iclock/getrequest?SN=<serial>
 *     — device polls for queued remote commands (reboot, sync clock, ...).
 *       No command queue exists yet (explicitly deferred) — always "OK".
 *   POST /iclock/cdata?SN=<serial>&table=ATTLOG
 *     — the actual attendance push. Body is one punch per line, tab-
 *       separated: PIN, "YYYY-MM-DD HH:MM:SS", Status, Verify, WorkCode...
 *       Only PIN/Time/Status are used here — the rest vary by firmware and
 *       aren't needed to reconstruct a punch.
 *
 * No physical unit is reachable from this environment to test against live
 * — this is verified by simulating a real device's exact HTTP requests
 * (curl) rather than against real hardware. Firmware generations do vary at
 * the margins (a device without "State" tracking enabled sends Status=0 for
 * every punch); attendance-device.service.ts's pairing logic accounts for
 * that rather than assuming a clean alternating in/out status field.
 */
export const zktecoAdapter: DeviceProviderAdapter = {
  code: 'zkteco',

  handshakeReply() {
    // Real ADMS config-line format. Values are conservative: attendance log
    // only, no fingerprint-template sync (privacy — we never need the raw
    // biometric template, only the punch events) and a 30s poll interval.
    return [
      'GET OPTION FROM: AllDevice',
      'ATTLOG=1',
      'OPERLOG=0',
      'ATTPHOTO=0',
      'ErrorDelay=30',
      'Delay=30',
      'TransFlag=1111000000',
      'Realtime=1',
      'Encrypt=0',
    ].join('\n');
  },

  emptyCommandReply() {
    return 'OK';
  },

  parsePunchBatch(body: string): RawPunch[] {
    const punches: RawPunch[] = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const cols = line.split('\t');
      const [pin, time, status] = cols;
      if (!pin || !time) continue;
      // "YYYY-MM-DD HH:MM:SS" — device-local time, no timezone in the wire
      // format. Treated as the tenant's own local time (same assumption
      // isoDate() elsewhere in hr.routes.ts makes for a bare `date` column).
      const punchedAt = new Date(time.replace(' ', 'T'));
      if (Number.isNaN(punchedAt.getTime())) continue;
      punches.push({ externalPin: pin.trim(), punchedAt, rawStatus: status?.trim() || null });
    }
    return punches;
  },

  ackReply() {
    return 'OK';
  },
};
