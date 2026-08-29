import 'dart:typed_data';
import 'package:crypto/crypto.dart';

/// RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) — Dart port of
/// apps/web/ondi-auth's src/lib/totp.ts, same algorithm every authenticator
/// app implements.
String generateTotp(String base32Secret, {int digits = 6, int stepSeconds = 30}) {
  final key = _base32Decode(base32Secret);
  final counter = DateTime.now().millisecondsSinceEpoch ~/ 1000 ~/ stepSeconds;

  final counterBytes = ByteData(8)..setUint64(0, counter, Endian.big);
  final hmac = Hmac(sha1, key).convert(counterBytes.buffer.asUint8List()).bytes;

  final offset = hmac.last & 0x0f;
  final binary = ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

  final code = (binary % _pow10(digits)).toString().padLeft(digits, '0');
  return code;
}

/// Seconds remaining in the current 30s step — for a countdown ring/label.
int totpSecondsRemaining({int stepSeconds = 30}) {
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  return stepSeconds - (now % stepSeconds);
}

int _pow10(int n) {
  var r = 1;
  for (var i = 0; i < n; i++) {
    r *= 10;
  }
  return r;
}

const _base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

Uint8List _base32Decode(String input) {
  final clean = input.replaceAll('=', '').toUpperCase();
  var bits = 0;
  var value = 0;
  final bytes = <int>[];
  for (final char in clean.split('')) {
    final idx = _base32Alphabet.indexOf(char);
    if (idx == -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.add((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8List.fromList(bytes);
}

/// Parses an `otpauth://totp/...?secret=...&issuer=...` URI (what a real
/// authenticator export encodes in its QR) — used by manual-entry / paste
/// flows that accept a full otpauth URI instead of just the raw secret.
Map<String, String>? parseOtpAuthUri(String uri) {
  try {
    final parsed = Uri.parse(uri);
    if (parsed.scheme != 'otpauth' || parsed.host != 'totp') return null;
    final label = Uri.decodeComponent(parsed.path.replaceFirst('/', ''));
    final parts = label.split(':');
    final account = parts.length > 1 ? parts[1] : parts[0];
    final issuer = parsed.queryParameters['issuer'] ?? (parts.length > 1 ? parts[0] : '');
    final secret = parsed.queryParameters['secret'];
    if (secret == null) return null;
    return {'issuer': issuer, 'account': account, 'secret': secret};
  } catch (e) {
    return null;
  }
}
